/**
 * Chat room — Host half.
 *
 * The panel is drawn by `client.js`; this half exists because the two people
 * usually sit on different networks. A browser page cannot open a socket to the
 * other machine, but a Host process can reach the internet, so:
 *
 *   page  ──HTTP/SSE──▶  this Host  ──HTTPS──▶  public relay  ◀──HTTPS──  the
 *   page  ◀──HTTP/SSE──  this Host  ◀──────────  public relay  ──────────  peer
 *
 * Model (v3): every installation owns one inbox topic derived from its own id.
 * An add code is just that inbox plus a display name, so a contact needs no
 * "create" step — paste the other person's code and their messages start
 * arriving; a first message from an unknown sender is enough to create the
 * contact on the receiving side. This half owns the inbox subscriptions (one
 * per relay in use), the per-contact history and a same-origin API, so the
 * browser never sees relay credentials.
 */
import {
  createHash,
  createPublicKey,
  randomUUID,
  verify as verifySignature,
} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RELAY,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_TEXT,
  SseParser,
  PLUGIN_VERSION,
  compareVersions,
  createEnvelope,
  createRoom,
  decodeContactCode,
  defaultNick,
  isAmbiguousName,
  DEFAULT_UPDATE_MANIFESTS,
  isManifestSpec,
  isPlaceholderName,
  normalizeUpdateSpec,
  releasePayload,
  PUBLISHED_PACKAGE_NAME,
  RELEASE_PUBLIC_KEY,
  RELEASE_TOPIC,
  updateSpecName,
  encodeContactCode,
  isValidRoom,
  normalizeName,
  normalizeImage,
  normalizeQuote,
  normalizeRelay,
  parseEnvelope,
  serializeEnvelope,
  shortRoom,
} from './protocol.js';

export const inject = ['webServer'];

/** Same-origin API the Client panel talks to. */
const ROUTE_PREFIX = '/plugin/chat-room';

/** Most contacts one DSH keeps. */
const MAX_CONTACTS = 30;

/** Where published versions are looked up. The mirror is the one DSH itself
 *  falls back to, which keeps the check working on a slow network. */
const UPDATE_REGISTRIES = ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/'];

/** Newest messages kept per contact. */
const MAX_MESSAGES = 200;

/** Relay identities remembered per contact for duplicate suppression. */
const MAX_SEEN = 800;

/** Backoff bounds for an inbox subscription, in milliseconds. */
const RECONNECT_BASE = 1200;

/** The fixed head of an ed25519 public key in SPKI form. */
const RELEASE_PAYLOAD_KEY = '302a300506032b6570032100';

/** How often a release hint is followed up, and how long to wait in between. */
const RELEASE_HINT_TRIES = 6;
const RELEASE_HINT_WAIT = 20000;
const RECONNECT_MAX = 20000;

/** How often an idle page stream gets a comment line, in milliseconds. */
const PAGE_KEEPALIVE = 25000;

/** Upper bound on a request body from the page. */
const MAX_BODY = 65536;

const SAVE_DELAY = 600;

/**
 * The name of the package this code was installed as. A published package
 * carries the name its releases are published under, so the update source
 * needs no setting: an unscoped name is a registry name.
 */
function ownPackageName() {
  try {
    const raw = fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8');
    const name = JSON.parse(raw).name;
    return typeof name === 'string' ? name : '';
  } catch (error) {
    return '';
  }
}

export function apply(ctx) {
  const webServer = ctx.webServer;
  if (!webServer) return;

  ctx.effect(() => {
    const host = new ContactsHost({
      webServer,
      dataDir: resolveDataDir(),
      getPluginManager: () => ctx.get('pluginManager'),
    });
    host.start();
    return () => host.dispose();
  }, 'chat-room-runtime');
}

/** Profile-scoped data directory: survives reloads and restarts. */
function resolveDataDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'plugin-data', 'chat-room');
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

function describeError(error) {
  if (!error) return 'unknown error';
  if (error.name === 'TimeoutError') return 'relay timed out';
  if (error.name === 'AbortError') return 'relay connection closed';
  const message = typeof error.message === 'string' ? error.message : String(error);
  const cause = error.cause && typeof error.cause.message === 'string' ? error.cause.message : '';
  return cause && cause !== message ? message + ' (' + cause + ')' : message;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Publishes one envelope body to an arbitrary relay topic. */
async function publishTo(relay, room, body) {
  const response = await fetch(relay + '/' + encodeURIComponent(room), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('relay responded HTTP ' + response.status);
}

/** Reads a request body with a hard cap; resolves to null when it is too big. */
function readBytes(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        finish(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(Buffer.concat(chunks)));
    req.on('error', () => finish(null));
  });
}

/** The file extension for a picture type. */
function imageExtension(type) {
  const known = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return known[type] || 'bin';
}

/** The content type of a stored picture, judged by its file name. */
function imageTypeOf(file) {
  const name = String(file || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

/**
 * Publishes a picture to an inbox. The relay keeps the bytes as an
 * attachment and carries the envelope as the message text, so a picture
 * travels the same path a line of chat does. The envelope goes in the query
 * string because a display name may be non-ASCII and header values may not.
 */
async function publishPicture(relay, room, body, { bytes, name, type }) {
  const url =
    relay + '/' + encodeURIComponent(room) + '?message=' + encodeURIComponent(body);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Filename: name || 'image.' + imageExtension(type),
      'Content-Type': type,
    },
    body: bytes,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error('relay responded HTTP ' + response.status);
}

/** One inbox subscription. Keeps its own resume cursor and reconnect loop. */
class InboxBridge {
  constructor({ relay, room, cursor, onStatus, onMessage, onCursor }) {
    this.relay = relay;
    this.room = room;
    this.cursor = typeof cursor === 'string' ? cursor : '';
    this.onStatus = onStatus;
    this.onMessage = onMessage;
    this.onCursor = onCursor;
    this.active = false;
    this.attempt = 0;
    this.controller = null;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.attempt = 0;
    this.onStatus('connecting', '');
    void this.loop();
  }

  stop() {
    this.active = false;
    if (this.controller) {
      try {
        this.controller.abort();
      } catch (err) {
        /* already aborted */
      }
      this.controller = null;
    }
  }

  async loop() {
    while (this.active) {
      try {
        await this.stream();
      } catch (error) {
        if (!this.active) break;
        this.onStatus('error', describeError(error));
      }
      if (!this.active) break;
      const wait = Math.min(RECONNECT_MAX, RECONNECT_BASE * 2 ** Math.min(this.attempt, 6));
      this.attempt += 1;
      await sleep(wait);
    }
  }

  /** Subscribes to this inbox and stays until aborted or the stream ends. */
  async stream() {
    const controller = new AbortController();
    this.controller = controller;
    const since = this.cursor || 'all';
    const url =
      this.relay +
      '/' +
      encodeURIComponent(this.room) +
      '/sse?since=' +
      encodeURIComponent(since);
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('relay responded HTTP ' + response.status);
    if (!response.body) throw new Error('relay response has no body');
    this.attempt = 0;
    this.onStatus('online', '');
    const decoder = new TextDecoder();
    const parser = new SseParser();
    for await (const chunk of response.body) {
      if (!this.active) break;
      for (const event of parser.push(decoder.decode(chunk, { stream: true }))) {
        this.onEvent(event);
      }
    }
    throw new Error('relay stream closed');
  }

  onEvent(event) {
    if (event.event === 'open') {
      this.onStatus('online', '');
      return;
    }
    if (event.event !== 'message') return;
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (!frame || typeof frame !== 'object') return;
    if (typeof frame.id === 'string' && frame.id) {
      this.cursor = frame.id;
      this.onCursor(frame.id);
    }
    if (frame.event !== 'message' || typeof frame.message !== 'string') return;
    const envelope = parseEnvelope(frame.message);
    if (!envelope) return;
    this.onMessage(envelope, frame.attachment || null);
  }
}

/**
 * Watches the release topic of the published plugin. A message there is
 * only a hint that something new was published: the version and the package
 * are still read from the release manifest, so a hint can never make the
 * plugin install anything on its own.
 */
class ReleaseWatch {
  constructor({ relay, topic, onHint }) {
    this.relay = relay;
    this.topic = topic;
    this.onHint = onHint;
    this.active = false;
    this.attempt = 0;
    this.controller = null;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.attempt = 0;
    void this.loop();
  }

  stop() {
    this.active = false;
    if (this.controller) {
      try {
        this.controller.abort();
      } catch (err) {
        /* already aborted */
      }
      this.controller = null;
    }
  }

  async loop() {
    while (this.active) {
      try {
        await this.stream();
      } catch (error) {
        if (!this.active) break;
      }
      if (!this.active) break;
      const wait = Math.min(RECONNECT_MAX, RECONNECT_BASE * 2 ** Math.min(this.attempt, 6));
      this.attempt += 1;
      await sleep(wait);
    }
  }

  async stream() {
    const controller = new AbortController();
    this.controller = controller;
    const url =
      this.relay + '/' + encodeURIComponent(this.topic) + '/sse?since=all';
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('relay responded HTTP ' + response.status);
    if (!response.body) throw new Error('relay response has no body');
    this.attempt = 0;
    const decoder = new TextDecoder();
    const parser = new SseParser();
    for await (const chunk of response.body) {
      if (!this.active) break;
      for (const event of parser.push(decoder.decode(chunk, { stream: true }))) {
        this.onEvent(event);
      }
    }
    throw new Error('relay stream closed');
  }

  onEvent(event) {
    if (event.event !== 'message') return;
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (!frame || typeof frame !== 'object') return;
    if (frame.event !== 'message' || typeof frame.message !== 'string') return;
    let hint;
    try {
      hint = JSON.parse(frame.message);
    } catch (err) {
      return;
    }
    if (!hint || hint.kind !== 'release') return;
    this.onHint(hint);
  }
}

/** One contact: a person and the inbox topic their messages arrive on. */
function makeContact({ name, relay, peerInbox, peerId, auto, via, self, pinned }) {
  return {
    id: randomUUID(),
    name: normalizeName(name),
    relay,
    peerInbox: isValidRoom(peerInbox) ? peerInbox : '',
    peerId: typeof peerId === 'string' ? peerId : '',
    auto: auto === true,
    // A conversation with myself. It stays on this machine and never touches
    // the relay, so notes to myself cost nothing and arrive at once.
    self: self === true,
    // Pinned conversations stay above the rest of the list. This is a display
    // preference, so it changes no message and needs no relay round trip.
    pinned: pinned === true,
    // How the contact appeared: 'code' (I added them), 'ping' (they added me),
    // 'message' (they wrote to me first) or 'self' (I started a chat with me).
    via:
      via === 'code' || via === 'ping' || via === 'message' || via === 'self' ? via : '',
    createdAt: Date.now(),
  };
}

class ContactsHost {
  constructor({ webServer, dataDir, getPluginManager }) {
    this.webServer = webServer;
    this.dataDir = dataDir;
    // The plugin manager is a host service; asking for it lazily keeps the
    // plugin working even when the manager is not part of the profile.
    this.getPluginManager = typeof getPluginManager === 'function' ? getPluginManager : () => undefined;
    this.instanceId = randomUUID();
    this.update = {
      spec: '',
      latest: '',
      available: false,
      checkedAt: 0,
      busy: false,
      error: '',
      justUpdated: '',
    };
    this.file = path.join(dataDir, 'state.json');
    this.disposers = [];
    this.pageStreams = new Set();
    this.inboxBridges = new Map();
    this.releaseWatch = null;
    this.bridgeStatus = new Map();
    this.seen = new Map();
    this.streamEpoch = 0;
    this.saveTimer = null;
    this.keepaliveTimer = null;
    this.loaded = this.load();
    this.releaseWatch = null;
    // A published install knows where its releases live, so the update source
    // is set on its own and nobody has to fill it in. A workspace package
    // (a scoped name) never is.
    const own = ownPackageName();
    if (!this.loaded.updateSpec) {
      if (own === PUBLISHED_PACKAGE_NAME) {
        // The published build looks for its releases on its own. Two
        // addresses are asked, because each caches the manifest for a while.
        this.update.spec = DEFAULT_UPDATE_MANIFESTS[0];
        this.update.manifestUrls = DEFAULT_UPDATE_MANIFESTS.slice();
      } else if (own && !own.startsWith('@') && normalizeUpdateSpec(own)) {
        this.loaded.updateSpec = own;
        this.update.spec = own;
      }
    } else if (this.builtinManifestUrls().includes(this.loaded.updateSpec)) {
      // A stored address that is one of the built-in ones: ask them all, so
      // a cache in one of them cannot hold the update back.
      this.update.spec = DEFAULT_UPDATE_MANIFESTS[0];
      this.update.manifestUrls = this.builtinManifestUrls();
    }
  }

  /* ---------------------------------------------------------------- *
   * Persistence and migration
   * ---------------------------------------------------------------- */

  defaults() {
    const selfId = randomUUID();
    return {
      version: 3,
      selfId,
      nick: defaultNick(selfId),
      relay: DEFAULT_RELAY,
      inbox: createRoom(),
      activeId: '',
      contacts: [],
      threads: {},
      inboxCursors: {},
      updateSpec: '',
    };
  }

  load() {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      return this.defaults();
    }
    if (!parsed || typeof parsed !== 'object') return this.defaults();
    if (parsed.version === 1) return this.migrateV1(parsed);
    if (parsed.version === 2) return this.migrateV2(parsed);
    return this.normalize(parsed);
  }

  /** v1: one shared room. Keep the history as one contact. */
  migrateV1(old) {
    const base = this.defaults();
    const relay = normalizeRelay(old.settings && old.settings.relay) || DEFAULT_RELAY;
    const room = old.settings && isValidRoom(old.settings.room) ? old.settings.room : '';
    const messages = Array.isArray(old.messages) ? old.messages : [];
    const contact = room ? makeContact({ name: '聊天室', relay, peerInbox: room }) : null;
    const threads = {};
    if (contact) {
      const lifted = messages
        .filter((message) => message && typeof message.id === 'string')
        .slice(-MAX_MESSAGES)
        .map((message) => this.normalizeMessage(message, old.senderId));
      if (lifted.length) threads[contact.id] = lifted;
    }
    return {
      ...base,
      selfId: typeof old.senderId === 'string' && old.senderId ? old.senderId : base.selfId,
      nick: isPlaceholderName(old.settings && old.settings.nick)
        ? defaultNick(
            typeof old.senderId === 'string' && old.senderId ? old.senderId : base.selfId,
          )
        : normalizeName(old.settings.nick),
      relay,
      activeId: contact ? contact.id : '',
      contacts: contact ? [contact] : [],
      threads,
    };
  }

  /** v2: per-contact rooms. Keep names and history; the peer topic stays the
   *  same, so an already-updated peer still reaches it. */
  migrateV2(old) {
    const base = this.defaults();
    const contacts = [];
    const threads = {};
    for (const entry of Array.isArray(old.contacts) ? old.contacts : []) {
      if (!entry || typeof entry !== 'object') continue;
      const relay = normalizeRelay(entry.relay) || base.relay;
      if (!isValidRoom(entry.room)) continue;
      const contact = makeContact({ name: entry.name, relay, peerInbox: entry.room });
      contact.id = typeof entry.id === 'string' && entry.id ? entry.id : contact.id;
      if (Number.isFinite(entry.createdAt)) contact.createdAt = entry.createdAt;
      contacts.push(contact);
      const stored =
        old.threads && Array.isArray(old.threads[contact.id]) ? old.threads[contact.id] : [];
      threads[contact.id] = stored
        .filter((message) => message && typeof message.id === 'string')
        .slice(-MAX_MESSAGES)
        .map((message) => this.normalizeMessage(message, old.selfId));
    }
    const activeId =
      typeof old.activeId === 'string' && contacts.some((entry) => entry.id === old.activeId)
        ? old.activeId
        : '';
    return {
      ...base,
      selfId: typeof old.selfId === 'string' && old.selfId ? old.selfId : base.selfId,
      nick: isPlaceholderName(old.nick)
        ? defaultNick(typeof old.selfId === 'string' && old.selfId ? old.selfId : base.selfId)
        : normalizeName(old.nick),
      relay: normalizeRelay(old.relay) || DEFAULT_RELAY,
      activeId,
      contacts,
      threads,
    };
  }

  normalize(parsed) {
    const base = this.defaults();
    const contacts = [];
    const threads = {};
    for (const entry of Array.isArray(parsed.contacts) ? parsed.contacts : []) {
      if (!entry || typeof entry !== 'object') continue;
      const relay = normalizeRelay(entry.relay);
      if (!relay) continue;
      if (contacts.length >= MAX_CONTACTS) break;
      const storedName = normalizeName(entry.name);
      const contact = {
        id: typeof entry.id === 'string' && entry.id ? entry.id : randomUUID(),
        // The old shared default is not a name; keep it empty so the panel can
        // ask the user to label the contact.
        name: isAmbiguousName(storedName) ? '' : storedName,
        relay,
        peerInbox: isValidRoom(entry.peerInbox) ? entry.peerInbox : '',
        peerId: typeof entry.peerId === 'string' ? entry.peerId : '',
        auto: entry.auto === true,
        self: entry.self === true,
        pinned: entry.pinned === true,
        via:
          entry.via === 'code' ||
          entry.via === 'ping' ||
          entry.via === 'message' ||
          entry.via === 'self'
            ? entry.via
            : '',
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
      };
      if (
        contact.peerInbox &&
        contacts.some((other) => other.peerInbox === contact.peerInbox && other.relay === relay)
      ) {
        continue;
      }
      contacts.push(contact);
      const stored =
        parsed.threads && Array.isArray(parsed.threads[contact.id])
          ? parsed.threads[contact.id]
          : [];
      threads[contact.id] = stored
        .filter((message) => message && typeof message.id === 'string')
        .slice(-MAX_MESSAGES)
        .map((message) => this.normalizeMessage(message, parsed.selfId));
    }
    const activeId =
      typeof parsed.activeId === 'string' && contacts.some((entry) => entry.id === parsed.activeId)
        ? parsed.activeId
        : '';
    const inboxCursors = {};
    if (parsed.inboxCursors && typeof parsed.inboxCursors === 'object') {
      for (const [relay, cursor] of Object.entries(parsed.inboxCursors)) {
        const normalized = normalizeRelay(relay);
        if (normalized && typeof cursor === 'string' && cursor) inboxCursors[normalized] = cursor;
      }
    }
    return {
      version: 3,
      selfId: typeof parsed.selfId === 'string' && parsed.selfId ? parsed.selfId : base.selfId,
      nick: isPlaceholderName(parsed.nick)
        ? defaultNick(typeof parsed.selfId === 'string' && parsed.selfId ? parsed.selfId : base.selfId)
        : normalizeName(parsed.nick),
      relay: normalizeRelay(parsed.relay) || DEFAULT_RELAY,
      inbox: isValidRoom(parsed.inbox) ? parsed.inbox : base.inbox,
      updateSpec: normalizeUpdateSpec(parsed.updateSpec),
      // The finished-update mark survives the restart that the swap causes.
      justUpdated:
        parsed.justUpdated &&
        typeof parsed.justUpdated === 'object' &&
        typeof parsed.justUpdated.version === 'string' &&
        Number.isFinite(parsed.justUpdated.at)
          ? { version: parsed.justUpdated.version, at: parsed.justUpdated.at }
          : null,
      activeId,
      contacts,
      threads,
      inboxCursors,
    };
  }

  normalizeMessage(message, selfId) {
    return {
      id: message.id,
      at: Number.isFinite(message.at) ? message.at : Date.now(),
      from: typeof message.from === 'string' ? message.from : '',
      fromId: typeof message.fromId === 'string' ? message.fromId : '',
      text: typeof message.text === 'string' ? message.text.slice(0, MAX_TEXT) : '',
      mine: typeof message.fromId === 'string' ? message.fromId === selfId : !!message.mine,
      pending: false,
      failed: false,
    };
  }

  persist() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, SAVE_DELAY);
    if (typeof this.saveTimer.unref === 'function') this.saveTimer.unref();
  }

  flush() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const temporary = this.file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(this.loaded));
      fs.renameSync(temporary, this.file);
    } catch (err) {
      /* chat still works in memory when the data directory is not writable */
    }
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  start() {
    // A previous start that failed after registering the route leaves the
    // prefix behind, and every later start would fail with "duplicate
    // prefix route". The marker file says whether that happened, so the
    // plugin can take the route back instead of needing a restart.
    if (this.releaseStaleRoute()) {
      // the stale registration is gone; the fresh one below takes over
    }
    this.disposers.push(this.routes());
    this.writeInstanceMarker();
    this.syncBridges();
    this.startReleaseWatch();
    this.scheduleUpdateChecks();
    if (!this.loaded.activeId && this.loaded.contacts.length) {
      this.loaded.activeId = this.loaded.contacts[0].id;
      this.persist();
    }
    if (!this.keepaliveTimer) {
      this.keepaliveTimer = setInterval(() => {
        for (const stream of this.pageStreams) {
          try {
            stream.write(': keepalive\n\n');
          } catch (err) {
            this.pageStreams.delete(stream);
          }
        }
      }, PAGE_KEEPALIVE);
      if (typeof this.keepaliveTimer.unref === 'function') this.keepaliveTimer.unref();
    }
  }

  dispose() {
    this.clearInstanceMarker();
    for (const bridge of this.inboxBridges.values()) bridge.stop();
    this.inboxBridges.clear();
    if (this.releaseWatch) {
      this.releaseWatch.stop();
      this.releaseWatch = null;
    }
    for (const stream of this.pageStreams) {
      try {
        stream.end();
      } catch (err) {
        /* closed already */
      }
    }
    this.pageStreams.clear();
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
    if (this.updateTimer) clearInterval(this.updateTimer);
    this.updateTimer = null;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.flush();
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch (err) {
        /* already disposed */
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Inbox subscriptions (one per relay in use)
   * ---------------------------------------------------------------- */

  relaysInUse() {
    const relays = new Set([this.loaded.relay]);
    for (const contact of this.loaded.contacts) {
      if (normalizeRelay(contact.relay)) relays.add(contact.relay);
    }
    return relays;
  }

  syncBridges() {
    const relays = this.relaysInUse();
    for (const relay of Array.from(this.inboxBridges.keys())) {
      if (!relays.has(relay)) this.stopInboxBridge(relay);
    }
    for (const relay of relays) {
      if (!this.inboxBridges.has(relay)) this.startInboxBridge(relay);
    }
  }

  startInboxBridge(relay) {
    const bridge = new InboxBridge({
      relay,
      room: this.loaded.inbox,
      cursor: this.loaded.inboxCursors[relay] || '',
      onStatus: (status, error) => {
        this.bridgeStatus.set(relay, { status, error: error || '' });
        this.broadcastState();
      },
      onCursor: (cursor) => {
        this.loaded.inboxCursors[relay] = cursor;
        this.persist();
      },
      onMessage: (envelope, attachment) => this.receive(relay, envelope, attachment),
    });
    this.inboxBridges.set(relay, bridge);
    bridge.start();
  }

  stopInboxBridge(relay) {
    const bridge = this.inboxBridges.get(relay);
    if (!bridge) return;
    bridge.stop();
    this.inboxBridges.delete(relay);
    this.bridgeStatus.delete(relay);
  }

  aggregateStatus() {
    const entries = Array.from(this.inboxBridges.keys()).map(
      (relay) => this.bridgeStatus.get(relay) || { status: 'connecting', error: '' },
    );
    if (!entries.length) return { status: 'idle', error: '' };
    const failed = entries.find((entry) => entry.status === 'error');
    if (failed) return { status: 'error', error: failed.error };
    if (entries.some((entry) => entry.status === 'connecting')) {
      return { status: 'connecting', error: '' };
    }
    return { status: 'online', error: '' };
  }

  /* ---------------------------------------------------------------- *
   * Page stream
   * ---------------------------------------------------------------- */

  pageStream(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    this.pageStreams.add(res);
    // A fresh page stream means the page may have missed messages. The hello
    // frame tells it to drop its per-contact "history loaded" marks.
    this.streamEpoch += 1;
    this.frame(res, 'hello', { epoch: this.streamEpoch });
    this.frame(res, 'state', this.snapshot());
    const remove = () => this.pageStreams.delete(res);
    req.on('close', remove);
    req.on('error', remove);
  }

  frame(res, event, data) {
    try {
      res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
    } catch (err) {
      this.pageStreams.delete(res);
    }
  }

  broadcast(event, data) {
    for (const stream of this.pageStreams) this.frame(stream, event, data);
  }

  broadcastState() {
    this.broadcast('state', this.snapshot());
  }

  /* ---------------------------------------------------------------- *
   * Contacts and threads
   * ---------------------------------------------------------------- */

  /** Finds one message and its contact, wherever it lives. */
  findMessage(id) {
    if (!id) return null;
    for (const contact of this.loaded.contacts) {
      const message = this.thread(contact.id).find((entry) => entry.id === id);
      if (message) return { contact, message };
    }
    return null;
  }

  thread(contactId) {
    if (!this.loaded.threads[contactId]) this.loaded.threads[contactId] = [];
    return this.loaded.threads[contactId];
  }

  find(contactId) {
    return this.loaded.contacts.find((contact) => contact.id === contactId);
  }

  meta(contact) {
    const thread = this.loaded.threads[contact.id] || [];
    const last = thread.length ? thread[thread.length - 1] : null;
    return {
      id: contact.id,
      name: contact.name,
      unnamed: !contact.name,
      auto: contact.auto === true,
      self: contact.self === true,
      pinned: contact.pinned === true,
      via: contact.via || '',
      relay: contact.relay,
      short: shortRoom(contact.peerInbox),
      createdAt: contact.createdAt,
      lastMessage: last ? { text: last.text, at: last.at, mine: !!last.mine } : null,
    };
  }

  addCode() {
    return encodeContactCode({
      relay: this.loaded.relay,
      room: this.loaded.inbox,
      name: this.loaded.nick,
      update: this.loaded.updateSpec,
    });
  }

  snapshot() {
    const aggregate = this.aggregateStatus();
    return {
      version: 3,
      self: {
        id: this.loaded.selfId,
        nick: this.loaded.nick,
        unnamed: isPlaceholderName(this.loaded.nick),
        inbox: this.loaded.inbox,
      },
      relay: this.loaded.relay,
      addCode: this.addCode(),
      status: aggregate.status,
      error: aggregate.error,
      activeId: this.loaded.activeId,
      contacts: this.loaded.contacts.map((contact) => this.meta(contact)),
      limits: { maxText: MAX_TEXT, maxMessages: MAX_MESSAGES, maxContacts: MAX_CONTACTS },
      update: {
        current: PLUGIN_VERSION,
        spec: this.loaded.updateSpec,
        latest: this.update.latest || this.fakeUpdateVersion(),
        available:
          this.update.available ||
          (Boolean(this.fakeUpdateVersion()) &&
            !this.update.fakeInstalled &&
            compareVersions(this.fakeUpdateVersion(), PLUGIN_VERSION) > 0),
        simulated: this.update.fakeInstalled === true,
        checkedAt: this.update.checkedAt,
        busy: this.update.busy,
        error: this.update.error,
        updatable: this.update.updatable,
        // A finished update: the page may still run the previous front end.
        justUpdated: this.freshJustUpdated(),
      },
    };
  }

  broadcastContact(contact) {
    this.broadcast('contact', this.meta(contact));
  }

  /** Handles one envelope from this host's inbox. */
  receive(relay, envelope, attachment) {
    if (envelope.fromId && envelope.fromId === this.loaded.selfId) return;
    let contact = envelope.fromId
      ? this.loaded.contacts.find((entry) => entry.peerId && entry.peerId === envelope.fromId)
      : null;
    if (!contact && envelope.fromInbox) {
      contact = this.loaded.contacts.find(
        (entry) => entry.peerInbox === envelope.fromInbox && entry.relay === relay,
      );
    }
    if (!contact) {
      // A first message from an unknown inbox creates the contact: an add code
      // gives the sender our inbox, and this is the reply channel coming back.
      if (!envelope.fromInbox) return;
      if (this.loaded.contacts.length >= MAX_CONTACTS) return;
      contact = makeContact({
        name: isAmbiguousName(envelope.from) ? '' : envelope.from,
        relay,
        peerInbox: envelope.fromInbox,
        peerId: envelope.fromId,
        auto: true,
        via: envelope.kind === 'ping' ? 'ping' : 'message',
      });
      this.loaded.contacts.push(contact);
      this.loaded.threads[contact.id] = [];
      if (!this.loaded.activeId) this.loaded.activeId = contact.id;
      this.syncBridges();
      this.broadcastState();
    } else {
      let changed = false;
      if (!contact.peerId && envelope.fromId) {
        contact.peerId = envelope.fromId;
        changed = true;
      }
      if (!contact.peerInbox && envelope.fromInbox) {
        contact.peerInbox = envelope.fromInbox;
        changed = true;
      }
      // Adopt the sender's display name once they have a real one; a
      // placeholder ("我" or an untouched default) tells us nothing.
      if (!contact.name && envelope.from && !isPlaceholderName(envelope.from)) {
        contact.name = normalizeName(envelope.from);
        changed = true;
      }
      if (envelope.kind === 'ping' && !contact.via) {
        contact.via = 'ping';
        changed = true;
      }
      if (changed) this.persist();
    }

    // A ping only opens the contact; it never becomes a chat line.
    if (envelope.kind === 'ping') {
      this.persist();
      this.broadcastContact(contact);
      return;
    }

    const seen = this.seen.get(contact.id) || new Set();
    this.seen.set(contact.id, seen);
    if (seen.has(envelope.id)) {
      const existing = this.thread(contact.id).find((entry) => entry.id === envelope.id);
      if (existing && (existing.pending || existing.failed)) {
        existing.pending = false;
        existing.failed = false;
        this.persist();
        this.broadcast('message', { contactId: contact.id, message: existing });
        this.broadcastContact(contact);
      }
      return;
    }
    seen.add(envelope.id);
    if (seen.size > MAX_SEEN) {
      const ids = Array.from(seen);
      this.seen.set(contact.id, new Set(ids.slice(ids.length - MAX_MESSAGES)));
    }
    const picture = envelope.image
      ? Object.assign({}, envelope.image, {
          url: attachment && typeof attachment.url === 'string' ? attachment.url : '',
        })
      : null;
    this.appendMessage(contact, {
      id: envelope.id,
      at: envelope.at,
      from: envelope.from,
      fromId: envelope.fromId,
      text: envelope.text,
      mine: envelope.fromId === this.loaded.selfId,
      pending: false,
      failed: false,
      quote: envelope.quote || null,
      image: picture,
      file: '',
    });
    // A picture is fetched right away, so the history keeps showing it after
    // the relay drops the attachment.
    if (envelope.image && attachment) {
      const stored = this.thread(contact.id).find((entry) => entry.id === envelope.id);
      if (stored && !stored.file) {
        void this.fetchImage(stored, attachment).then((file) => {
          if (!file) return;
          stored.file = file;
          this.persist();
          this.broadcast('message', { contactId: contact.id, message: stored });
        });
      }
    }
  }

  appendMessage(contact, message) {
    const thread = this.thread(contact.id);
    const index = thread.findIndex((entry) => entry.id === message.id);
    if (index >= 0) thread[index] = message;
    else {
      thread.push(message);
      if (thread.length > MAX_MESSAGES) thread.splice(0, thread.length - MAX_MESSAGES);
    }
    this.loaded.threads[contact.id] = thread;
    this.persist();
    this.broadcast('message', { contactId: contact.id, message });
    this.broadcastContact(contact);
  }

  /** Opens the conversation with myself, creating it the first time. */
  ensureSelfChat() {
    let contact = this.loaded.contacts.find((entry) => entry.self === true);
    if (!contact) {
      contact = makeContact({
        name: '我聊',
        relay: this.loaded.relay,
        peerInbox: this.loaded.inbox,
        peerId: this.loaded.selfId,
        self: true,
        via: 'self',
      });
      // Notes to myself belong at the top of the list.
      this.loaded.contacts.unshift(contact);
      this.loaded.threads[contact.id] = [];
    }
    this.loaded.activeId = contact.id;
    this.persist();
    this.broadcastState();
    return { ok: true, contact: this.meta(contact), state: this.snapshot() };
  }

  addContact({ code, name }) {
    const decoded = decodeContactCode(code);
    if (!decoded) return { ok: false, error: 'invalid-code' };
    if (decoded.relay === this.loaded.relay && decoded.room === this.loaded.inbox) {
      return { ok: false, error: 'own-code' };
    }
    // The code carries where new versions are published, so the person who
    // pastes it can check for updates without asking for a file. Learning it
    // also works when the contact is already there.
    if (decoded.update && !this.loaded.updateSpec) {
      this.loaded.updateSpec = decoded.update;
      this.update.manifestUrls = [];
      this.update.spec = decoded.update;
      this.persist();
      this.scheduleUpdateChecks();
    }
    const duplicate = this.loaded.contacts.find(
      (contact) => contact.peerInbox === decoded.room && contact.relay === decoded.relay,
    );
    if (duplicate) {
      this.loaded.activeId = duplicate.id;
      this.persist();
      this.broadcastState();
      return { ok: true, contact: this.meta(duplicate), duplicate: true, state: this.snapshot() };
    }
    if (this.loaded.contacts.length >= MAX_CONTACTS) {
      return { ok: false, error: 'too-many-contacts' };
    }
    const cardName = normalizeName(name) || decoded.name;
    const contact = makeContact({
      name: isAmbiguousName(cardName) ? '' : cardName,
      relay: decoded.relay,
      peerInbox: decoded.room,
      via: 'code',
    });
    this.loaded.contacts.push(contact);
    this.loaded.threads[contact.id] = [];
    this.loaded.activeId = contact.id;
    this.persist();
    this.syncBridges();
    this.broadcastState();
    // Let the other side see us right away: a ping carries our inbox back to
    // their list without pretending to be a chat message.
    void this.ping(contact);
    return { ok: true, contact: this.meta(contact), state: this.snapshot() };
  }

  renameContact(contactId, name) {
    const contact = this.find(contactId);
    if (!contact) return { ok: false, error: 'unknown-contact' };
    contact.name = normalizeName(name);
    this.persist();
    this.broadcastState();
    return { ok: true, state: this.snapshot() };
  }

  /** Pins a conversation to the top of the list, or unpins it. */
  setPinned(contactId, pinned) {
    const contact = this.find(contactId);
    if (!contact) return { ok: false, error: 'unknown-contact' };
    contact.pinned = pinned === true;
    this.persist();
    this.broadcastState();
    return { ok: true, state: this.snapshot() };
  }

  removeContact(contactId) {
    const index = this.loaded.contacts.findIndex((contact) => contact.id === contactId);
    if (index < 0) return { ok: false, error: 'unknown-contact' };
    this.loaded.contacts.splice(index, 1);
    delete this.loaded.threads[contactId];
    this.seen.delete(contactId);
    if (this.loaded.activeId === contactId) {
      this.loaded.activeId = this.loaded.contacts.length ? this.loaded.contacts[0].id : '';
    }
    this.persist();
    this.syncBridges();
    this.broadcastState();
    return { ok: true, state: this.snapshot() };
  }

  setActive(contactId) {
    const contact = contactId ? this.find(contactId) : null;
    this.loaded.activeId = contact ? contact.id : '';
    this.persist();
    this.broadcastState();
    return {
      ok: true,
      state: this.snapshot(),
      messages: contact ? this.thread(contact.id) : [],
    };
  }

  setSelf({ nick, relay }) {
    const nextNick = normalizeName(nick);
    if (nick !== undefined && !nextNick) return { ok: false, error: 'invalid-nick' };
    if (nextNick) this.loaded.nick = nextNick;
    const nextRelay = normalizeRelay(relay);
    if (relay !== undefined && !nextRelay) return { ok: false, error: 'invalid-relay' };
    if (nextRelay && nextRelay !== this.loaded.relay) {
      this.loaded.relay = nextRelay;
      this.loaded.inboxCursors = {};
      this.syncBridges();
    }
    this.persist();
    this.broadcastState();
    return { ok: true, state: this.snapshot() };
  }

  /** Tells the other side that we added them, so they see us without waiting
   *  for a first message. Failures are silent: the contact still works. */
  async ping(contact) {
    if (!contact.peerInbox) return;
    const envelope = createEnvelope({
      id: randomUUID(),
      from: this.loaded.nick,
      fromId: this.loaded.selfId,
      fromInbox: this.loaded.inbox,
      text: '',
      at: Date.now(),
      kind: 'ping',
    });
    const body = serializeEnvelope(envelope);
    if (!body) return;
    try {
      await publishTo(contact.relay, contact.peerInbox, body);
    } catch (error) {
      /* the contact stays usable; they will show up once they write */
    }
  }

  async send(contactId, rawText, rawQuote) {
    const contact = this.find(contactId);
    if (!contact) return { ok: false, error: 'unknown-contact' };
    if (!contact.peerInbox) return { ok: false, error: 'no-peer-inbox' };
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) return { ok: false, error: 'empty' };
    if (text.length > MAX_TEXT) return { ok: false, error: 'too-long' };
    const quote = normalizeQuote(rawQuote);
    const id = randomUUID();
    const envelope = createEnvelope({
      id,
      from: this.loaded.nick,
      fromId: this.loaded.selfId,
      fromInbox: this.loaded.inbox,
      text,
      at: Date.now(),
      quote,
    });
    if (contact.self) {
      // Notes to myself never leave this machine.
      this.appendMessage(contact, {
        id,
        at: envelope.at,
        from: envelope.from,
        fromId: envelope.fromId,
        text: envelope.text,
        mine: true,
        pending: false,
        failed: false,
        quote: envelope.quote || null,
        image: null,
        file: '',
      });
      return { ok: true, id };
    }
    const body = serializeEnvelope(envelope);
    if (!body) return { ok: false, error: 'too-long' };
    this.appendMessage(contact, {
      id,
      at: envelope.at,
      from: envelope.from,
      fromId: envelope.fromId,
      text: envelope.text,
      mine: true,
      pending: true,
      failed: false,
      quote: envelope.quote || null,
      image: envelope.image || null,
      file: '',
    });
    try {
      await publishTo(contact.relay, contact.peerInbox, body);
      const message = this.thread(contact.id).find((entry) => entry.id === id);
      if (message) {
        message.pending = false;
        this.persist();
        this.broadcast('message', { contactId: contact.id, message });
        this.broadcastContact(contact);
      }
      return { ok: true, id };
    } catch (error) {
      const message = this.thread(contact.id).find((entry) => entry.id === id);
      if (message) {
        message.pending = false;
        message.failed = true;
        this.persist();
        this.broadcast('message', { contactId: contact.id, message });
        this.broadcastContact(contact);
      }
      return { ok: false, error: 'send-failed', detail: describeError(error) };
    }
  }

  /**
   * Sends a picture to a contact. The bytes are stored here as well, so the
   * history keeps working after the relay drops the attachment, and the same
   * bytes are handed to the relay as an attachment.
   */
  async sendImage(contactId, bytes, { name = '', type = '', text = '', quote = null } = {}) {
    const contact = this.find(contactId);
    if (!contact) return { ok: false, error: 'unknown-contact' };
    if (!contact.peerInbox) return { ok: false, error: 'no-peer-inbox' };
    if (!IMAGE_TYPES.includes(type)) return { ok: false, error: 'bad-image-type' };
    if (!bytes || !bytes.length) return { ok: false, error: 'empty-image' };
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: 'image-too-large' };
    const caption = typeof text === 'string' ? text.trim() : '';
    if (caption.length > MAX_TEXT) return { ok: false, error: 'too-long' };
    const id = randomUUID();
    const image = { name: name || 'image.' + imageExtension(type), type, size: bytes.length };
    const envelope = createEnvelope({
      id,
      from: this.loaded.nick,
      fromId: this.loaded.selfId,
      fromInbox: this.loaded.inbox,
      text: caption,
      at: Date.now(),
      quote,
      image,
    });
    const body = serializeEnvelope(envelope);
    if (!body) return { ok: false, error: 'too-long' };
    const file = this.storeImage(id, bytes, type);
    if (contact.self) {
      this.appendMessage(contact, {
        id,
        at: envelope.at,
        from: envelope.from,
        fromId: envelope.fromId,
        text: envelope.text,
        mine: true,
        pending: false,
        failed: false,
        image: image,
        quote: envelope.quote || null,
        file,
      });
      return { ok: true, id };
    }
    this.appendMessage(contact, {
      id,
      at: envelope.at,
      from: envelope.from,
      fromId: envelope.fromId,
      text: envelope.text,
      mine: true,
      pending: true,
      failed: false,
      image: image,
      quote: envelope.quote || null,
      file,
    });
    try {
      await publishPicture(contact.relay, contact.peerInbox, body, {
        bytes,
        name: image.name,
        type,
      });
      const message = this.thread(contact.id).find((entry) => entry.id === id);
      if (message) {
        message.pending = false;
        this.persist();
        this.broadcast('message', { contactId: contact.id, message });
        this.broadcastContact(contact);
      }
      return { ok: true, id };
    } catch (error) {
      const message = this.thread(contact.id).find((entry) => entry.id === id);
      if (message) {
        message.pending = false;
        message.failed = true;
        this.persist();
        this.broadcast('message', { contactId: contact.id, message });
        this.broadcastContact(contact);
      }
      return { ok: false, error: 'send-failed', detail: describeError(error) };
    }
  }

  /** Where the pictures of this installation live. */
  imagesDir() {
    return path.join(this.dataDir, 'images');
  }

  /** Keeps a copy of a picture on this machine. */
  storeImage(id, bytes, type) {
    try {
      const directory = this.imagesDir();
      fs.mkdirSync(directory, { recursive: true });
      const file = path.join(directory, id + '.' + imageExtension(type));
      if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
      return file;
    } catch (error) {
      return '';
    }
  }

  /** Downloads a picture someone sent, so it outlives the relay cache. */
  async fetchImage(message, attachment) {
    const url = attachment && typeof attachment.url === 'string' ? attachment.url : '';
    if (!url || !/^https:\/\//i.test(url)) return '';
    const limit = MAX_IMAGE_BYTES;
    const size = Number.isFinite(attachment.size) ? attachment.size : 0;
    if (size > limit) return '';
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) return '';
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > limit) return '';
      const type = message.image && message.image.type ? message.image.type : imageTypeOf(url);
      return this.storeImage(message.id, buffer, type);
    } catch (error) {
      return '';
    }
  }

  clearThread(contactId) {
    const contact = this.find(contactId);
    if (!contact) return { ok: false, error: 'unknown-contact' };
    this.loaded.threads[contact.id] = [];
    this.seen.delete(contact.id);
    this.persist();
    this.broadcast('thread', { contactId: contact.id, messages: [] });
    this.broadcastState();
    return { ok: true, state: this.snapshot() };
  }


  /** The marker file records which instance owns the route. */
  instanceMarkerPath() {
    return path.join(this.dataDir, 'instance.json');
  }

  writeInstanceMarker() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(
        this.instanceMarkerPath(),
        JSON.stringify({ instanceId: this.instanceId, at: Date.now() }),
      );
    } catch (err) {
      /* the marker is an optimisation, not a requirement */
    }
  }

  clearInstanceMarker() {
    try {
      const raw = fs.readFileSync(this.instanceMarkerPath(), 'utf8');
      const marker = JSON.parse(raw);
      if (marker && marker.instanceId === this.instanceId) fs.unlinkSync(this.instanceMarkerPath());
    } catch (err) {
      /* nothing to clear */
    }
  }

  /**
   * Releases a route left behind by an instance that never started. Returns
   * true when a stale registration was removed.
   */
  releaseStaleRoute() {
    let marker;
    try {
      marker = JSON.parse(fs.readFileSync(this.instanceMarkerPath(), 'utf8'));
    } catch (err) {
      return false;
    }
    if (!marker || marker.instanceId === this.instanceId) return false;
    const prefixes = this.webServer && this.webServer.prefixes;
    if (!(prefixes instanceof Map)) return false;
    const released = prefixes.delete(ROUTE_PREFIX);
    if (released) {
      try {
        fs.unlinkSync(this.instanceMarkerPath());
      } catch (err) {
        /* ignore */
      }
    }
    return released;
  }

  /* ---------------------------------------------------------------- *
   *  Plugin updates
   *
   *  The update source is a registry spec that travels inside the contact
   *  code, so both people learn where new versions live without exchanging
   *  files. Only registry specs are accepted: a code is untrusted input, and
   *  a path or URL would let it point the installer at anything.
   * ---------------------------------------------------------------- */

  /** Stores (or clears) the registry spec releases are published under. */
  setUpdateSource(rawSpec) {
    const spec = rawSpec === '' ? '' : normalizeUpdateSpec(rawSpec);
    if (rawSpec !== '' && !spec) {
      return { ok: false, error: 'invalid-update-spec', state: this.snapshot() };
    }
    this.loaded.updateSpec = spec;
    this.update.manifestUrls = spec ? [] : this.builtinManifestUrls();
    this.update.spec = spec;
    this.update.latest = '';
    this.update.available = false;
    this.update.error = '';
    this.persist();
    this.broadcastState();
    if (spec) void this.checkForUpdate();
    return { ok: true, state: this.snapshot() };
  }

  /** Asks the registry what the newest published version is. */
  async checkForUpdate({ force = false } = {}) {
    // A check on every panel open would hammer the release address; once in
    // a few minutes is enough.
    if (!force && this.update.checkedAt && Date.now() - this.update.checkedAt < 5 * 60 * 1000) {
      return { ok: true, state: this.snapshot() };
    }
    const spec = this.loaded.updateSpec;
    if (!spec) return { ok: false, error: 'no-update-source', state: this.snapshot() };
    const manager = this.getPluginManager();
    if (!manager) {
      return { ok: false, error: 'no-plugin-manager', state: this.snapshot() };
    }
    const name = updateSpecName(spec);
    // The update source may only replace this very plugin: a different
    // package would take the working panel away.
    const fake = this.fakeUpdateVersion();
    if (fake) {
      this.update.fakeInstalled = false;
      this.update.latest = fake;
      this.update.updatable = true;
      this.update.available = compareVersions(fake, PLUGIN_VERSION) > 0;
      this.update.error = '';
      this.update.checkedAt = Date.now();
      this.broadcastState();
      return { ok: true, state: this.snapshot() };
    }
    const bundle = await this.installedBundle();
    if (bundle && String(bundle.source || '').startsWith('link:') && !isManifestSpec(spec)) {
      // A development checkout is never replaced by a published package. A
      // manifest is an explicit, checksummed address, so it may still apply.
      this.update.latest = '';
      this.update.available = false;
      this.update.error = '';
      this.update.checkedAt = Date.now();
      this.broadcastState();
      return { ok: true, state: this.snapshot() };
    }
    const installed = bundle ? bundle.name : '';
    if (installed && name && installed !== name) {
      this.update.error = 'spec-mismatch';
      this.update.checkedAt = Date.now();
      this.broadcastState();
      return { ok: false, error: 'spec-mismatch', state: this.snapshot() };
    }
    try {
      // The manager refuses to inspect a package that is already installed,
      // so the version is read from the registry metadata directly.
      let latest = '';
      const sources = this.manifestSources(spec);
      if (sources.length) {
        const manifest = await this.fetchNewestManifest(sources);
        this.update.manifest = manifest;
        latest = manifest.version;
      } else {
        // The manager refuses to inspect a package that is already installed,
        // so the version is read from the registry metadata directly.
        latest = await this.fetchLatestVersion(name);
      }
      if (!latest) {
        this.update.error = 'not-found';
        this.update.checkedAt = Date.now();
        this.broadcastState();
        return { ok: false, error: this.update.error, state: this.snapshot() };
      }
      this.update.latest = latest;
      this.update.updatable = true;
      this.update.available = compareVersions(latest, PLUGIN_VERSION) > 0;
      this.update.error = '';
      this.update.checkedAt = Date.now();
    } catch (error) {
      this.update.error = isManifestSpec(spec) ? 'manifest-failed' : 'check-failed';
      this.update.checkedAt = Date.now();
    }
    this.broadcastState();
    return { ok: true, state: this.snapshot() };
  }

  /**
   * A test switch: a fake-update.json in the data folder makes the plugin
   * report an available version, so the red dot and the update prompt can be
   * checked without publishing anything.
   */
  fakeUpdateVersion() {
    try {
      const raw = fs.readFileSync(path.join(this.dataDir, 'fake-update.json'), 'utf8');
      const parsed = JSON.parse(raw);
      const version = parsed && typeof parsed.version === 'string' ? parsed.version.trim() : '';
      return version;
    } catch (err) {
      return '';
    }
  }

  /** The newest published version of a package, or an empty string. */
  async fetchLatestVersion(name) {
    for (const registry of UPDATE_REGISTRIES) {
      try {
        const response = await fetch(registry + name, {
          signal: AbortSignal.timeout(15000),
          headers: { accept: 'application/json' },
        });
        if (!response.ok) continue;
        const body = await response.json();
        const latest = body && body['dist-tags'] && body['dist-tags'].latest;
        if (typeof latest === 'string' && latest) return latest;
      } catch (error) {
        /* try the next registry */
      }
    }
    return '';
  }


  /**
   * Reads a release manifest. It names the newest version, where its package
   * is and what its checksum is, so the download can be checked before it is
   * handed to the package manager.
   */
  async fetchManifest(url) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error('manifest HTTP ' + response.status);
    const body = await response.json();
    const version = body && typeof body.version === 'string' ? body.version.trim() : '';
    const packageUrl = body && typeof body.url === 'string' ? body.url.trim() : '';
    const sha256 = body && typeof body.sha256 === 'string' ? body.sha256.trim().toLowerCase() : '';
    const localHttp = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(packageUrl);
    if (!version || (!/^https:\/\//i.test(packageUrl) && !localHttp)) {
      throw new Error('manifest is incomplete');
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('manifest has no checksum');
    return { version, url: packageUrl, sha256 };
  }

  /**
   * Starts watching the release topic. The published build does this on its
   * own, so a new release shows up right away instead of at the next round.
   */
  startReleaseWatch() {
    if (this.releaseWatch) return;
    if (ownPackageName() !== PUBLISHED_PACKAGE_NAME) return;
    const relay = this.loaded.relay || DEFAULT_RELAY;
    this.releaseWatch = new ReleaseWatch({
      relay,
      topic: RELEASE_TOPIC,
      onHint: (notice) => {
        void this.onReleaseHint(notice);
      },
    });
    this.releaseWatch.start();
  }

  /**
   * A hint only says that something was published. The manifest decides what
   * that is, and it may still be cached, so the manifest is looked at a few
   * times before giving up.
   */
  async onReleaseHint(notice) {
    // A signed notice carries the version, the address and the checksum, so
    // it can be used right away without waiting for a cached manifest.
    const signed = this.verifyNotice(notice);
    if (signed) {
      this.update.manifest = signed;
      this.update.latest = signed.version;
      this.update.updatable = true;
      this.update.available = compareVersions(signed.version, PLUGIN_VERSION) > 0;
      this.update.error = '';
      this.update.checkedAt = Date.now();
      this.broadcastState();
      if (this.update.available) return;
    }
    // Otherwise the manifest is asked, a few times, because it may still be
    // cached.
    for (let attempt = 0; attempt < RELEASE_HINT_TRIES; attempt += 1) {
      if (attempt > 0) await sleep(RELEASE_HINT_WAIT * attempt);
      const result = await this.checkForUpdate({ force: true });
      const latest = (result.state && result.state.update && result.state.update.latest) || '';
      if (latest && compareVersions(latest, PLUGIN_VERSION) > 0) return;
      if (signed && compareVersions(signed.version, PLUGIN_VERSION) <= 0) return;
    }
  }

  /** The version just installed, while that fact is still useful. */
  freshJustUpdated() {
    const record = this.loaded.justUpdated;
    if (!record || typeof record !== 'object' || typeof record.version !== 'string') return '';
    const at = Number.isFinite(record.at) ? record.at : 0;
    if (!at || Date.now() - at > 60 * 60 * 1000) return '';
    return record.version;
  }

  /** The addresses the published build asks for its releases. */
  builtinManifestUrls() {
    return ownPackageName() === PUBLISHED_PACKAGE_NAME
      ? DEFAULT_UPDATE_MANIFESTS.slice()
      : [];
  }

  /**
   * The addresses to ask for the release manifest. An address that is one of
   * the built-in ones brings the whole list with it, so a cache in one of
   * them cannot hold the update back. An address the user set is used alone.
   */
  manifestSources(spec) {
    const builtin = this.builtinManifestUrls();
    if (!spec) return builtin;
    if (builtin.includes(spec)) return builtin;
    if (isManifestSpec(spec)) return [spec];
    return [];
  }

  /**
   * Checks the signature of a release notice. Only a notice signed with the
   * key of this plugin is believed; it then says exactly which version is
   * out, where it lives and what its checksum is, so no cache can hold it
   * back.
   */
  verifyNotice(notice) {
    if (!notice || notice.kind !== 'release') return null;
    const version = typeof notice.version === 'string' ? notice.version.trim() : '';
    const url = typeof notice.url === 'string' ? notice.url.trim() : '';
    const sha256 = typeof notice.sha256 === 'string' ? notice.sha256.trim().toLowerCase() : '';
    const signature = typeof notice.sig === 'string' ? notice.sig.trim() : '';
    if (!version || !/^https:\/\//i.test(url) || !/^[0-9a-f]{64}$/.test(sha256) || !signature) {
      return null;
    }
    try {
      const raw = Buffer.from(RELEASE_PUBLIC_KEY, 'base64');
      const der = Buffer.concat([Buffer.from(RELEASE_PAYLOAD_KEY, 'hex'), raw]);
      const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
      const payload = Buffer.from(releasePayload({ version, url, sha256 }), 'utf8');
      const good = verifySignature(null, payload, key, Buffer.from(signature, 'base64'));
      if (!good) return null;
      return { version, url, sha256 };
    } catch (error) {
      return null;
    }
  }

  /**
   * Asks every address and keeps the newest answer. A cache in one of them
   * then cannot hold the update back.
   */
  async fetchNewestManifest(urls) {
    const answers = await Promise.all(
      urls.map(async (url) => {
        try {
          return await this.fetchManifest(url);
        } catch (error) {
          return null;
        }
      }),
    );
    const usable = answers.filter(Boolean);
    if (!usable.length) throw new Error('no manifest answered');
    usable.sort((a, b) => compareVersions(b.version, a.version));
    return usable[0];
  }

  /** Downloads a release and checks its checksum before it is used. */
  async downloadRelease(manifest) {
    const response = await fetch(manifest.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('release HTTP ' + response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(buffer).digest('hex');
    if (digest !== manifest.sha256) throw new Error('checksum mismatch');
    const directory = path.join(this.dataDir, 'releases');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'chat-room-' + manifest.version + '.tgz');
    fs.writeFileSync(file, buffer);
    return file;
  }

  /** The bundle this plugin runs under, taken from the manager. */
  async installedBundle() {
    const manager = this.getPluginManager();
    if (!manager) return null;
    try {
      const bundles = await manager.listBundles();
      const list = Array.isArray(bundles)
        ? bundles
        : (bundles && (bundles.entries || bundles.bundles)) || [];
      for (const bundle of list) {
        if (!bundle || !bundle.name) continue;
        const rows = (bundle.rows || []).map((row) => row && (row.rowId || row.id));
        if (rows.includes('chat-room')) {
          const row = (bundle.rows || []).find(
            (entry) => entry && (entry.rowId || entry.id) === 'chat-room',
          );
          return {
            name: bundle.name,
            source: typeof bundle.source === 'string' ? bundle.source : '',
            entryId: (row && row.entryId) || '',
          };
        }
      }
    } catch (error) {
      /* fall through */
    }
    return null;
  }

  /** The bundle name this plugin currently runs under. */
  async installedBundleName() {
    const bundle = await this.installedBundle();
    return bundle ? bundle.name : '';
  }

  /**
   * Replaces the running bundle with the published version. The manager
   * refuses a package that is already installed, so the old copy goes first
   * and the new one lands in the same slot; with HMR the swap applies
   * without restarting DSH.
   */
  async installUpdate() {
    if (this.update.busy) return { ok: false, error: 'busy', state: this.snapshot() };
    if (this.fakeUpdateVersion()) {
      // A simulated version is not on the registry, so it is not installed.
      // The test still completes: the pending update clears and the red dot
      // goes away, which is what the click is supposed to achieve.
      this.update.available = false;
      this.update.fakeInstalled = true;
      this.update.error = '';
      this.broadcastState();
      return { ok: true, application: 'simulated', state: this.snapshot() };
    }
    const spec = this.loaded.updateSpec;
    const version = this.update.latest;
    if (!spec || !version) return { ok: false, error: 'no-update', state: this.snapshot() };
    if (!this.update.updatable) return { ok: false, error: 'not-a-bundle', state: this.snapshot() };
    let releaseFile = '';
    const sources = this.manifestSources(spec);
    if (sources.length) {
      try {
        const manifest = this.update.manifest || (await this.fetchNewestManifest(sources));
        releaseFile = await this.downloadRelease(manifest);
      } catch (error) {
        return { ok: false, error: 'download-failed', state: this.snapshot() };
      }
    }
    const fake = this.fakeUpdateVersion();
    if (fake) {
      this.update.fakeInstalled = false;
      this.update.latest = fake;
      this.update.updatable = true;
      this.update.available = compareVersions(fake, PLUGIN_VERSION) > 0;
      this.update.error = '';
      this.update.checkedAt = Date.now();
      this.broadcastState();
      return { ok: true, state: this.snapshot() };
    }
    const bundle = await this.installedBundle();
    if (bundle && String(bundle.source || '').startsWith('link:') && !releaseFile) {
      // A development checkout is not replaced by a registry package, but a
      // checksummed manifest is an explicit instruction.
      return { ok: false, error: 'dev-install', state: this.snapshot() };
    }
    if (bundle && !isManifestSpec(spec) && bundle.name !== updateSpecName(spec)) {
      return { ok: false, error: 'spec-mismatch', state: this.snapshot() };
    }
    const manager = this.getPluginManager();
    if (!manager) return { ok: false, error: 'no-plugin-manager', state: this.snapshot() };
    const name = updateSpecName(spec);
    this.update.busy = true;
    this.update.error = '';
    this.broadcastState();
    try {
      const current = bundle ? bundle.name : '';
      if (current) {
        // The manager refuses to remove a bundle whose row is still enabled,
        // and refuses to install a package that is already there. So the row
        // goes off, the layer leaves the selection, the package is removed
        // and the new version takes the same slot.
        if (bundle.entryId) {
          try {
            await manager.setPluginEnabled(bundle.entryId, false);
          } catch (error) {
            /* the row may be managed elsewhere */
          }
        }
        try {
          await manager.setBundleEnabled(current, false);
        } catch (error) {
          /* the layer may already be gone */
        }
        try {
          await manager.removeBundle(current);
        } catch (error) {
          /* the package may be gone already */
        }
      }
      const target = releaseFile || `${name}@${version}`;
      const result = await manager.installBundle(target, { activate: true });
      const application = (result && result.application) || 'unknown';
      this.update.busy = false;
      if (application === 'failed') {
        this.update.error = (result && result.error && result.error.code) || 'install-failed';
        this.broadcastState();
        return { ok: false, error: this.update.error, state: this.snapshot() };
      }
      // Recorded before anything else restarts this host: the page may still
      // be running the previous front end.
      this.update.justUpdated = version;
      this.loaded.justUpdated = { version, at: Date.now() };
      this.persist();
      // The row was switched off so the old package could be removed, and
      // that switch is remembered in the profile. It has to be switched on
      // again, or the plugin would stay unloaded after the update.
      try {
        const plugins = await manager.listPlugins();
        const row = (plugins || []).find((entry) => {
          if (!entry) return false;
          if (entry.rowId === 'chat-room') return true;
          if (entry.patchId === 'chat-room') return true;
          return typeof entry.entryId === 'string' && entry.entryId.endsWith(':chat-room');
        });
        const entryId = row && row.entryId;
        if (entryId) await manager.setPluginEnabled(entryId, true);
        else await manager.setPluginEnabled('include:chat-room', true);
      } catch (error) {
        /* the bundle may already be running */
      }
      // The browser half of the new version does not always come up by itself
      // after the swap: the sidebar entry can stay inactive. A switch off and
      // on again makes the page reload the client half, which is what a manual
      // toggle does.
      try {
        const installed = await this.installedBundleName();
        if (installed) {
          await manager.setBundleEnabled(installed, false);
          await manager.setBundleEnabled(installed, true);
        }
      } catch (error) {
        /* the client half may already be current */
      }
      this.update.available = false;
      this.persist();
      this.broadcastState();
      return { ok: true, application, state: this.snapshot() };
    } catch (error) {
      this.update.busy = false;
      this.update.error = 'install-failed';
      this.broadcastState();
      return { ok: false, error: this.update.error, state: this.snapshot() };
    }
  }

  /** Checks for a new version now and then, so a banner can show up. */
  scheduleUpdateChecks() {
    if (this.updateTimer) clearInterval(this.updateTimer);
    this.updateTimer = null;
    if (!this.loaded.updateSpec) return;
    const kick = setTimeout(() => {
      void this.checkForUpdate();
    }, 5000);
    if (typeof kick.unref === 'function') kick.unref();
    this.updateTimer = setInterval(() => {
      void this.checkForUpdate();
    }, 30 * 60 * 1000);
    if (typeof this.updateTimer.unref === 'function') this.updateTimer.unref();
  }

  /* ---------------------------------------------------------------- *
   * HTTP route
   * ---------------------------------------------------------------- */

  routes() {
    return this.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => this.handleHttp(req, res),
    });
  }

  async handleHttp(req, res) {
    const json = (statusValue, value) => {
      try {
        const body = JSON.stringify(value);
        res.writeHead(statusValue, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
      } catch (err) {
        try {
          res.destroy();
        } catch (inner) {
          /* socket already gone */
        }
      }
    };
    let suffix = '/';
    const query = new URLSearchParams('');
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      suffix = url.pathname.slice(ROUTE_PREFIX.length) || '/';
      for (const [key, value] of url.searchParams) query.set(key, value);
    } catch (err) {
      json(400, { ok: false, error: 'bad-url' });
      return;
    }
    const payload = async () => {
      try {
        const body = await readBody(req);
        return JSON.parse(body || '{}') || {};
      } catch (err) {
        return null;
      }
    };
    try {
      if (req.method === 'GET' && suffix === '/state') {
        json(200, { ok: true, state: this.snapshot() });
        return;
      }
      if (req.method === 'GET' && suffix === '/events') {
        this.pageStream(req, res);
        return;
      }
      if (req.method === 'GET' && suffix === '/thread') {
        const contact = this.find(query.get('id') || '');
        if (!contact) {
          json(404, { ok: false, error: 'unknown-contact' });
          return;
        }
        json(200, {
          ok: true,
          contact: this.meta(contact),
          messages: this.thread(contact.id),
          state: this.snapshot(),
        });
        return;
      }
      if (req.method === 'POST' && suffix === '/self-chat') {
        const result = this.ensureSelfChat();
        json(200, result);
        return;
      }
      if (req.method === 'POST' && suffix === '/contacts') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        const result = this.addContact({ code: body.code, name: body.name });
        json(result.ok ? 200 : 400, result);
        return;
      }
      if (req.method === 'POST' && suffix === '/contacts/rename') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        json(200, this.renameContact(body.id, body.name));
        return;
      }
      if (req.method === 'POST' && suffix === '/contacts/remove') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        json(200, this.removeContact(body.id));
        return;
      }
      if (req.method === 'POST' && suffix === '/contacts/pin') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        if (typeof body.pinned !== 'boolean') {
          json(400, { ok: false, error: 'bad-pin' });
          return;
        }
        json(200, this.setPinned(body.id, body.pinned));
        return;
      }
      if (req.method === 'POST' && suffix === '/active') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        json(200, this.setActive(body.id));
        return;
      }
      if (req.method === 'POST' && suffix === '/self') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        json(200, this.setSelf({ nick: body.nick, relay: body.relay }));
        return;
      }
      if (req.method === 'POST' && suffix === '/update/source') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        const result = this.setUpdateSource(typeof body.spec === 'string' ? body.spec.trim() : '');
        json(result.ok ? 200 : 400, result);
        return;
      }
      if (req.method === 'POST' && suffix === '/update/check') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        const result = await this.checkForUpdate({ force: body.force === true });
        json(result.ok ? 200 : 400, result);
        return;
      }
      if (req.method === 'POST' && suffix === '/update/install') {
        const result = await this.installUpdate();
        json(result.ok ? 200 : 400, result);
        return;
      }
      if (req.method === 'GET' && suffix === '/image') {
        const found = this.findMessage(query.get('id') || '');
        if (!found || !found.message.image) {
          json(404, { ok: false, error: 'not-found' });
          return;
        }
        let file = found.message.file;
        if ((!file || !fs.existsSync(file)) && found.message.image.url) {
          // A picture that was not stored when it arrived is fetched once.
          file = await this.fetchImage(found.message, { url: found.message.image.url });
          if (file) {
            found.message.file = file;
            this.persist();
          }
        }
        if (!file || !fs.existsSync(file)) {
          json(404, { ok: false, error: 'not-stored' });
          return;
        }
        try {
          const bytes = fs.readFileSync(file);
          res.writeHead(200, {
            'Content-Type': found.message.image.type || imageTypeOf(file),
            'Content-Length': bytes.length,
            'Cache-Control': 'private, max-age=86400',
          });
          res.end(bytes);
        } catch (error) {
          json(500, { ok: false, error: 'read-failed' });
        }
        return;
      }
      if (req.method === 'POST' && suffix === '/image') {
        const contactId = query.get('id') || '';
        const name = query.get('name') || '';
        const type = (req.headers['content-type'] || '').split(';')[0].trim();
        const bytes = await readBytes(req, MAX_IMAGE_BYTES + 1024);
        if (!bytes) {
          json(400, { ok: false, error: 'empty-image' });
          return;
        }
        const result = await this.sendImage(contactId, bytes, { name, type });
        json(result.ok ? 200 : 400, { ...result, state: this.snapshot() });
        return;
      }
      if (req.method === 'POST' && suffix === '/send') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        const result = await this.send(body.id, body.text, body.quote);
        json(result.ok ? 200 : 400, { ...result, state: this.snapshot() });
        return;
      }
      if (req.method === 'POST' && suffix === '/clear') {
        const body = await payload();
        if (!body) {
          json(400, { ok: false, error: 'bad-json' });
          return;
        }
        json(200, this.clearThread(body.id));
        return;
      }
      json(404, { ok: false, error: 'not-found' });
    } catch (error) {
      json(500, { ok: false, error: 'internal', detail: describeError(error) });
    }
  }
}
