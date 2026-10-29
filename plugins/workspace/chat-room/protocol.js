/**
 * Chat room wire protocol (Host half).
 *
 * Everything here is pure: no Node APIs, no Cordis APIs. The Client half
 * carries its own small copy of the code helpers because browser plugin
 * factories cannot import package files; keep the two in sync when the code
 * format changes.
 *
 * Transport shape: one conversation is one relay topic. Both DSH Host
 * processes subscribe to that topic and publish to it, so one chat message
 * travels as one relay message whose body is a compact JSON envelope. The relay
 * is therefore stateless for us; it only has to deliver text in order.
 *
 * Every installation owns one inbox topic. A "contact card" packs the relay,
 * that inbox and the sender's display name into one pasteable string, which is
 * how a contact is added: paste the code, messages start flowing, no room needs
 * to be created first.
 */

/** Prefix of an add code (relay + inbox topic + display name). */
export const CONTACT_CODE_PREFIX = 'DSHCHAT2:';

/** Prefix of the older room-only code; still accepted when adding a contact. */
export const ROOM_CODE_PREFIX = 'DSHCHAT1:';

/** Default relay: a public, account-free pub/sub HTTP service. */
export const DEFAULT_RELAY = 'https://ntfy.sh';

/** Envelope version written into every published message. */
export const ENVELOPE_VERSION = 1;

/** Longest user text accepted by a composer, in characters. */
export const MAX_TEXT = 2000;

/** Longest contact / sender display name, in characters. */
export const MAX_NAME = 40;

/** Longest quoted preview, in characters. */
export const MAX_QUOTE_TEXT = 160;

/** Largest picture that can be sent, in bytes. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** The picture types that may be sent. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Keeps a quoted message small enough for the relay. */
export function normalizeQuote(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const id = typeof quote.id === 'string' ? quote.id.slice(0, 64) : '';
  if (!id) return null;
  return {
    id,
    name: normalizeName(quote.name),
    text: typeof quote.text === 'string' ? quote.text.slice(0, MAX_QUOTE_TEXT) : '',
  };
}

/** Describes a sent or received picture without carrying its bytes. */
export function normalizeImage(image) {
  if (!image || typeof image !== 'object') return null;
  const type = typeof image.type === 'string' && IMAGE_TYPES.includes(image.type) ? image.type : '';
  if (!type) return null;
  return {
    name: typeof image.name === 'string' ? image.name.slice(0, 80) : '',
    type,
    size: Number.isFinite(image.size) ? Math.max(0, Math.round(image.size)) : 0,
  };
}

/** Relay message bodies above this many bytes are rejected before publish. */
export const MAX_ENVELOPE_BYTES = 3800;

/** Every installation gets its own default display name, so two people who
 *  never set a nickname are still distinguishable. */
export const DEFAULT_NICK_PREFIX = '用户-';

/** The pre-1.2.3 default. Both sides showed it, so it says nothing about who
 *  a message came from. */
export const LEGACY_DEFAULT_NICK = '我';

/** The default display name for one install. */
export function defaultNick(selfId) {
  const suffix = String(selfId || '').replace(/-/g, '').slice(0, 4);
  return DEFAULT_NICK_PREFIX + (suffix || '0000');
}

/** True for the old shared default, which must never be shown as a name. */
export function isAmbiguousName(name) {
  return typeof name === 'string' && name.trim() === LEGACY_DEFAULT_NICK;
}

/** True for any name that carries no real information: empty, the old shared
 *  default, or an untouched generated default. */
export function isPlaceholderName(name) {
  if (typeof name !== 'string' || !name.trim()) return true;
  const trimmed = name.trim();
  if (trimmed === LEGACY_DEFAULT_NICK) return true;
  return new RegExp('^' + DEFAULT_NICK_PREFIX + '[0-9a-f]{4,8}$').test(trimmed);
}

/** Relay topic rules: alphanumerics, dashes, underscores; 1..64 characters. */
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Shared prefix so a random topic is recognizable and collision-free. */
const ROOM_ROOT = 'dshchat';

/** Normalizes a relay base URL; returns null when it cannot be one. */
export function normalizeRelay(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.search || parsed.hash) return null;
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/** True when a string is a legal relay topic. */
export function isValidRoom(value) {
  return typeof value === 'string' && TOPIC_PATTERN.test(value);
}

/** Trims a display name to the accepted range; empty means "unnamed". */
export function normalizeName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/** Creates a random room topic. Not secret-grade: it only has to be unique. */
export function createRoom(randomBytes) {
  const bytes = randomBytes || defaultRandomBytes;
  const buf = bytes(8);
  let suffix = '';
  for (let index = 0; index < buf.length; index += 1) {
    suffix += buf[index].toString(16).padStart(2, '0');
  }
  return ROOM_ROOT + '-' + suffix;
}

function defaultRandomBytes(length) {
  const out = new Uint8Array(length);
  const cryptoObject = typeof globalThis === 'object' ? globalThis.crypto : undefined;
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    cryptoObject.getRandomValues(out);
    return out;
  }
  for (let index = 0; index < length; index += 1) {
    out[index] = Math.floor(Math.random() * 256);
  }
  return out;
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const rest = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const base64 = padded + rest;
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

/** Pulls the payload out of a pasted code, tolerating surrounding prose. */
function codePayload(raw, prefix) {
  if (typeof raw !== 'string') return '';
  let trimmed = raw.trim();
  if (!trimmed) return '';
  const at = trimmed.indexOf(prefix);
  if (at >= 0) trimmed = trimmed.slice(at + prefix.length);
  else if (prefix !== CONTACT_CODE_PREFIX) return '';
  // Codes are pasted alone or inside a sentence; the payload never contains
  // whitespace, so the first token is the code.
  return trimmed.split(/\s+/)[0] || '';
}

function decodeJsonPayload(encoded) {
  if (!encoded) return null;
  try {
    const value = JSON.parse(fromBase64Url(encoded));
    return value && typeof value === 'object' ? value : null;
  } catch (err) {
    return null;
  }
}

/**
 * Builds an add code: relay + my inbox topic + my display name. The other
 * person pastes it once and their messages start arriving in that inbox.
 */
export function encodeContactCode({ relay, room, name, update }) {
  const normalizedRelay = normalizeRelay(relay);
  if (!normalizedRelay || !isValidRoom(room)) return '';
  const updateSpec = normalizeUpdateSpec(update);
  const payload = JSON.stringify({
    r: normalizedRelay,
    k: room,
    n: normalizeName(name),
    // The update source travels with the code, so the person who adds it can
    // check for new versions without asking for a file.
    ...(updateSpec ? { u: updateSpec } : {}),
  });
  return CONTACT_CODE_PREFIX + toBase64Url(payload);
}

/** The version this build reports. */
export const PLUGIN_VERSION = '1.11.0';

/** The name the plugin is published under. */
export const PUBLISHED_PACKAGE_NAME = 'dsh-chat-room';

/** The topic where a new release is announced. */
export const RELEASE_TOPIC = 'dsh-chat-room-releases';

/**
 * The public key of this plugin's releases. A notice is only believed when
 * it carries a signature made with the matching private key, so nobody else
 * can talk the plugin into installing something.
 */
export const RELEASE_PUBLIC_KEY =
  'bXbGkNDWFVFpG+AbJ8OylPVpBMbtuGxc2vVVvUnMn4I=';

/** The bytes a release notice is signed over. */
export function releasePayload({ version, url, sha256 }) {
  return [version, url, sha256].join('\n');
}

/**
 * Where the published package looks for its releases. Both addresses are
 * asked, because each one caches the manifest for a while: the newer of the
 * two answers wins.
 */
export const DEFAULT_UPDATE_MANIFESTS = [
  'https://cdn.jsdelivr.net/gh/CeliaSy07/dsh-chat-room-releases@main/release.json',
  'https://raw.githubusercontent.com/CeliaSy07/dsh-chat-room-releases/main/release.json',
];

/**
 * A registry spec: an optional scope, a package name and an optional version
 * range. Paths, URLs and git addresses are refused on purpose: an update
 * source arrives inside a contact code, which is untrusted input.
 */
export function normalizeUpdateSpec(spec) {
  if (typeof spec !== 'string') return '';
  const trimmed = spec.trim();
  if (!trimmed || trimmed.length > 300) return '';
  // A registry package name.
  const pattern = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[a-z0-9][a-z0-9._^~<>=*-]*)?$/i;
  if (pattern.test(trimmed)) return trimmed;
  // Or the address of a release manifest.
  if (/^https:\/\/[^\s]+$/i.test(trimmed)) return trimmed;
  // A local address is only used to test the flow.
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[^\s]+$/i.test(trimmed)) return trimmed;
  return '';
}

/** True when the update source is a release manifest rather than a package. */
export function isManifestSpec(spec) {
  if (typeof spec !== 'string') return false;
  const trimmed = spec.trim();
  if (/^https:\/\//i.test(trimmed)) return true;
  // A local address is only used to test the flow.
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(trimmed);
}

/** The package name of a spec, without its version. */
export function updateSpecName(spec) {
  const normalized = normalizeUpdateSpec(spec);
  if (!normalized || isManifestSpec(normalized)) return '';
  const at = normalized.lastIndexOf('@');
  return at > 0 ? normalized.slice(0, at) : normalized;
}

/** Compares two dotted versions. Returns -1, 0 or 1. */
export function compareVersions(left, right) {
  const parse = (value) =>
    String(value || '')
      .split(/[.+-]/)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const x = a[index] === undefined ? 0 : a[index];
    const y = b[index] === undefined ? 0 : b[index];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
    return String(x) > String(y) ? 1 : -1;
  }
  return 0;
}

/**
 * Unpacks a contact card. Accepts the older room-only code too, so a code
 * shared before the contact model still adds a contact (with no name).
 */
export function decodeContactCode(code) {
  if (typeof code !== 'string') return null;
  const contactAt = code.indexOf(CONTACT_CODE_PREFIX);
  if (contactAt >= 0) {
    const payload = decodeJsonPayload(codePayload(code, CONTACT_CODE_PREFIX));
    if (!payload) return null;
    const relay = normalizeRelay(payload.r);
    const room = payload.k;
    if (!relay || !isValidRoom(room)) return null;
    return { relay, room, name: normalizeName(payload.n), update: normalizeUpdateSpec(payload.u) };
  }
  const legacy = decodeRoomCode(code);
  if (!legacy) return null;
  return { relay: legacy.relay, room: legacy.room, name: '', update: '' };
}

/** Builds the older room-only code (kept so old links keep working). */
export function encodeRoomCode({ relay, room }) {
  const normalizedRelay = normalizeRelay(relay);
  if (!normalizedRelay || !isValidRoom(room)) return '';
  const payload = JSON.stringify({ r: normalizedRelay, k: room });
  return ROOM_CODE_PREFIX + toBase64Url(payload);
}

/** Unpacks a room-only code; returns null for anything malformed. */
export function decodeRoomCode(code) {
  if (typeof code !== 'string') return null;
  const payload = decodeJsonPayload(codePayload(code, ROOM_CODE_PREFIX));
  if (!payload) return null;
  const relay = normalizeRelay(payload.r);
  const room = payload.k;
  if (!relay || !isValidRoom(room)) return null;
  return { relay, room };
}

/**
 * Builds the JSON an outgoing chat message is published as.
 * Unknown fields are dropped so the body stays small and predictable.
 */
export function createEnvelope({ id, from, fromId, fromInbox, text, at, kind, quote, image }) {
  const envelope = {
    v: ENVELOPE_VERSION,
    id,
    // 'ping' tells the other side "someone added you" without carrying a chat
    // message; 'text' is an ordinary line of the conversation.
    kind: kind === 'ping' ? 'ping' : 'text',
    from: normalizeName(from),
    fromId: typeof fromId === 'string' ? fromId : '',
    fromInbox: isValidRoom(fromInbox) ? fromInbox : '',
    text: typeof text === 'string' ? text.slice(0, MAX_TEXT) : '',
    at: Number.isFinite(at) ? Math.round(at) : Date.now(),
  };
  const normalizedQuote = normalizeQuote(quote);
  if (normalizedQuote) envelope.quote = normalizedQuote;
  const normalizedImage = normalizeImage(image);
  if (normalizedImage) envelope.image = normalizedImage;
  return envelope;
}

/** Validates a received envelope; returns null for unrelated relay traffic. */
export function parseEnvelope(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!value || typeof value !== 'object' || value.v !== ENVELOPE_VERSION) return null;
  if (typeof value.id !== 'string' || !value.id) return null;
  if (typeof value.text !== 'string') return null;
  const image = normalizeImage(value.image);
  // A ping carries no text: it only announces the contact. A picture may come
  // without a caption.
  if (!value.text && value.kind !== 'ping' && !image) return null;
  const envelope = {
    id: value.id,
    kind: value.kind === 'ping' ? 'ping' : 'text',
    from: normalizeName(value.from),
    fromId: typeof value.fromId === 'string' ? value.fromId : '',
    fromInbox: isValidRoom(value.fromInbox) ? value.fromInbox : '',
    text: value.text.slice(0, MAX_TEXT),
    at: Number.isFinite(value.at) ? Math.round(value.at) : Date.now(),
  };
  if (image) envelope.image = image;
  const quote = normalizeQuote(value.quote);
  if (quote) envelope.quote = quote;
  return envelope;
}

/** Serializes an envelope and enforces the relay body cap. */
export function serializeEnvelope(envelope) {
  const body = JSON.stringify(envelope);
  if (new TextEncoder().encode(body).length > MAX_ENVELOPE_BYTES) return null;
  return body;
}

/**
 * Incremental Server-Sent-Events parser.
 *
 * Relay streams arrive in arbitrary chunks; feed every decoded chunk into
 * `push` and read complete events out. Only `data:` lines are used, and the
 * `event:` name is kept so callers can skip keepalive/open frames.
 */
export class SseParser {
  constructor() {
    this.buffer = '';
  }

  /** Feeds one decoded chunk; returns every complete event in it. */
  push(chunk) {
    this.buffer += chunk;
    const events = [];
    let boundary = this.buffer.search(/\r?\n\r?\n/);
    while (boundary >= 0) {
      const raw = this.buffer.slice(0, boundary);
      const match = /\r?\n\r?\n/.exec(this.buffer.slice(boundary));
      this.buffer = this.buffer.slice(boundary + (match ? match[0].length : 2));
      const event = parseEventBlock(raw);
      if (event) events.push(event);
      boundary = this.buffer.search(/\r?\n\r?\n/);
    }
    // A stream that never sends a blank line must not grow forever.
    if (this.buffer.length > 1 << 20) this.buffer = this.buffer.slice(-4096);
    return events;
  }
}

function parseEventBlock(raw) {
  let name = 'message';
  const data = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') name = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length) return null;
  return { event: name, data: data.join('\n') };
}

/** Short, human-facing form of a room topic for labels and cards. */
export function shortRoom(room) {
  if (!isValidRoom(room)) return '';
  const tail = room.slice(-4);
  return tail.length === 4 ? tail.toUpperCase() : room;
}
