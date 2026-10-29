import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No extra HTTP port, synthetic keys, app patching, clipboard or content storage.
// DSH authenticates the channel; only its owner may access the local helper.
// Generic Connection RPC mounts its authenticated route through the caller's
// webServer scope, so both services must be present on this plugin context.
export const inject = ['connection', 'webServer'];
const CHANNEL = '/quick-ask-desktop';
const HELPER = fileURLToPath(new URL('./native/QuickAskHelper.app/Contents/MacOS/QuickAskHelper', import.meta.url));
const TTL = 120_000;
const LEASE = 15_000;
// A pending in-app toggle is only useful to a browser that polls right after
// the native hotkey fired; older ones are dropped instead of resurfacing.
const TOGGLE_TTL = 2_000;
// Keep a client command (authorize/restore) behind a held poll bounded: the
// next command waits at most this long when no native event arrives.
const POLL_HOLD_MS = 900;
const clipped = (value, size) => typeof value === 'string' ? value.slice(0, size) : '';
const failure = (code) => ({ ok: false, error: { code: `quick-ask/${code}`, message: code, details: {} } });
const MAX_BODY = 64 * 1024;

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBoundedJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY) {
      req.resume();
      return { tooLarge: true };
    }
    chunks.push(chunk);
  }
  try {
    return { value: JSON.parse(Buffer.concat(chunks, size).toString('utf8')) };
  } catch {
    return { invalid: true };
  }
}

/** Authenticated HTTP adapter for the browser Connection RPC wire format. */
export function createDesktopRouteHandler(ctx, bridge) {
  return async (req, res) => {
    const admission = ctx.connection.admit(req);
    if ('rejection' in admission) {
      res.writeHead(admission.rejection);
      res.end();
      return;
    }
    const pathname = new URL(String(req.url), 'http://127.0.0.1').pathname;
    const endpoint = pathname.startsWith(`${CHANNEL}/`) ? pathname.slice(CHANNEL.length + 1) : '';
    if (req.method !== 'POST' || !/^[A-Za-z0-9_$.-]+$/.test(endpoint)) {
      res.writeHead(404); res.end(); return;
    }
    const contentType = String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      res.writeHead(415); res.end(); return;
    }
    const parsed = await readBoundedJson(req);
    if (parsed.tooLarge) { res.writeHead(413); res.end(); return; }
    if (parsed.invalid) { res.writeHead(400); res.end(); return; }
    const message = parsed.value;
    if (!message || message.type !== 'client-request' || typeof message.rpcId !== 'string' ||
        message.rpcId.length > 128 || message.method !== endpoint ||
        !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) {
      res.writeHead(400); res.end(); return;
    }
    try {
      const result = await bridge.handle(endpoint, message.payload, undefined, admission.peer);
      sendJson(res, 200, { type: 'server-response', rpcId: message.rpcId, result });
    } catch {
      res.writeHead(500); res.end();
    }
  };
}

export function sanitizeSnapshot(value) {
  if (!value || typeof value !== 'object' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id || '')) return null;
  const statuses = ['partial', 'permission-required', 'capture-disabled', 'empty', 'protected', 'failed'];
  const status = statuses.includes(value.status) ? value.status : 'failed';
  let url = '';
  try {
    const parsed = new URL(value.url);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      parsed.username = ''; parsed.password = ''; parsed.search = ''; parsed.hash = '';
      url = parsed.href.slice(0, 2048);
    }
  } catch { /* URLs are optional, never fetch them. */ }
  return {
    id: value.id, appName: clipped(value.appName, 256), bundleId: clipped(value.bundleId, 256),
    title: clipped(value.title, 1024), url, text: status === 'partial' ? clipped(value.text, 16_000) : '',
    scope: ['selection', 'window-accessible-text'].includes(value.scope) && status === 'partial' ? value.scope : 'none',
    status, capturedAt: clipped(value.capturedAt, 64),
  };
}

export function createDesktopBridge({
  spawnFn = spawn, platform = process.platform, now = Date.now, pollHoldMs = POLL_HOLD_MS,
} = {}) {
  let child = null, disposed = false, buffer = '', lease = null, snapshot = null, snapshotTime = 0, currentId = '';
  let pendingToggle = null, toggleTime = 0, pollWaiter = null;
  let status = { platform, hotkey: platform === 'darwin' ? 'stopped' : 'unsupported', accessibility: false, captureEnabled: false };
  let attempted = false;
  const send = (command) => {
    if (!child || child.stdin.destroyed || !child.stdin.writable) return false;
    try { child.stdin.write(`${JSON.stringify(command)}\n`); return true; } catch { return false; }
  };
  const wakePoll = () => {
    const waiter = pollWaiter;
    pollWaiter = null;
    if (waiter) waiter();
  };
  // Hold one authenticated poll open until the helper reports a change, a short
  // timeout expires, or the bridge is disposed: native hotkey/activation edges
  // reach the page immediately instead of waiting for the next scheduled poll.
  const waitForChange = (signal) => {
    if (!(pollHoldMs > 0)) return Promise.resolve();
    if (signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (pollWaiter === finish) pollWaiter = null;
        signal?.removeEventListener?.('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, pollHoldMs);
      pollWaiter = finish;
      signal?.addEventListener?.('abort', finish, { once: true });
    });
  };
  const expire = () => {
    if (currentId && now() - snapshotTime >= TTL) {
      send({ type: 'discard', id: currentId });
      snapshot = null; currentId = '';
    }
    if (pendingToggle !== null && now() - toggleTime >= TOGGLE_TTL) pendingToggle = null;
    if (lease && now() - lease.at >= LEASE) lease = null;
  };
  const receive = (event) => {
    if (!event || disposed) return;
    if (event.type === 'status') {
      status = {
        platform,
        hotkey: ['registered', 'suspended', 'conflict', 'unavailable'].includes(event.hotkey) ? event.hotkey : 'unavailable',
        accessibility: event.accessibility === true, captureEnabled: event.captureEnabled === true,
      };
    } else if (event.type === 'wake') {
      const next = sanitizeSnapshot(event.snapshot);
      if (next) { snapshot = next; currentId = next.id; snapshotTime = now(); }
      wakePoll();
    } else if (event.type === 'toggle') {
      // The native helper owns Option+7 while DSH is frontmost (so the key can
      // never reach the composer or its IME); it asks the page to toggle here.
      pendingToggle = pendingToggle === null ? 1 : pendingToggle + 1;
      toggleTime = now();
      wakePoll();
    }
  };
  const start = () => {
    if (disposed || attempted || platform !== 'darwin') return;
    attempted = true;
    try {
      const proc = spawnFn(HELPER, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      child = proc;
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (chunk) => {
        if (child !== proc || disposed) return;
        buffer += chunk;
        if (Buffer.byteLength(buffer) > 262_144) {
          buffer = ''; status.hotkey = 'protocol-error'; proc.kill('SIGTERM'); return;
        }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try { receive(JSON.parse(line)); } catch { /* No raw native output in logs. */ }
        }
      });
      proc.stderr.resume();
      proc.stdin.on('error', () => {});
      proc.on('error', () => { if (child === proc) status.hotkey = 'start-failed'; });
      proc.on('exit', () => {
        if (child !== proc) return;
        child = null; buffer = ''; snapshot = null; currentId = '';
        pendingToggle = null;
        if (!disposed) status.hotkey = 'stopped';
      });
    } catch { child = null; status.hotkey = 'start-failed'; }
  };
  const handle = async (endpoint, payload = {}, signal, peer) => {
    if (peer?.principal?.kind !== 'owner') return failure('forbidden');
    if (disposed || signal?.aborted) return failure('disposed');
    if (!payload || typeof payload !== 'object') return failure('bad-request');
    const clientId = payload.clientId;
    if (typeof clientId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(clientId)) return failure('bad-client');
    expire();
    if (!['poll', 'release', 'restore', 'discard', 'authorize', 'disable-capture', 'restart'].includes(endpoint)) return failure('unknown-method');
    if (lease && lease.id !== clientId) return failure('another-desktop-client');
    if (!lease && endpoint !== 'poll') return failure('lease-expired');
    lease = { id: clientId, at: now() };
    if (endpoint === 'poll') {
      start();
      if (payload.ack && snapshot?.id === payload.ack) snapshot = null;
      send({ type: 'status' });
      await waitForChange(signal);
      if (disposed) return failure('disposed');
      expire();
      const value = { status: { ...status }, snapshot, hold: pollHoldMs };
      if (pendingToggle !== null) {
        value.toggle = pendingToggle;
        pendingToggle = null;
      }
      return { ok: true, value };
    }
    if (endpoint === 'release') {
      if (currentId) send({ type: 'discard', id: currentId });
      lease = null; snapshot = null; currentId = '';
    } else if (endpoint === 'authorize') {
      if (!send({ type: 'authorize' })) return failure('helper-unavailable');
    } else if (endpoint === 'disable-capture') {
      if (!send({ type: 'setCaptureEnabled', enabled: false })) return failure('helper-unavailable');
      snapshot = null;
    } else if (endpoint === 'restart') {
      if (child) return failure('already-running');
      attempted = false; start();
    } else {
      if (typeof payload.id !== 'string' || payload.id !== currentId) return failure('stale-snapshot');
      send({ type: endpoint, id: currentId });
      currentId = ''; snapshot = null;
    }
    return { ok: true, value: { status: { ...status } } };
  };
  const dispose = () => {
    if (disposed) return;
    send({ type: 'quit' });
    disposed = true; snapshot = null; lease = null; buffer = ''; currentId = '';
    pendingToggle = null;
    wakePoll();
    const proc = child; child = null;
    if (proc) {
      proc.stdin.end();
      const stop = setTimeout(() => proc.kill('SIGTERM'), 1000);
      stop.unref?.();
      const force = setTimeout(() => { if (proc.exitCode === null) proc.kill('SIGKILL'); }, 2500);
      force.unref?.();
      proc.once('exit', () => { clearTimeout(stop); clearTimeout(force); });
    }
  };
  return { handle, dispose, expire };
}

export function apply(ctx) {
  const bridge = createDesktopBridge();
  const handler = createDesktopRouteHandler(ctx, bridge);
  const off = ctx.webServer.register({ kind: 'prefix', path: CHANNEL, handler });
  const timer = setInterval(bridge.expire, 5000);
  timer.unref?.();
  ctx.effect(() => async () => {
    clearInterval(timer);
    if (typeof off === 'function') await off();
    bridge.dispose();
  }, 'quick-ask: authenticated native bridge');
}
