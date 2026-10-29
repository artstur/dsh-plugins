import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createDesktopBridge, sanitizeSnapshot, apply, inject } from '../index.js';

const owner = { principal: { kind: 'owner' } };
const clientId = 'desktop-12345678';
function setup(platform = 'darwin', pollHoldMs = 0) {
  let time = 1000;
  const children = [];
  const bridge = createDesktopBridge({ platform, pollHoldMs, now: () => time, spawnFn: (path, args, options) => {
    assert.match(path, /QuickAskHelper\.app\/Contents\/MacOS\/QuickAskHelper$/);
    assert.deepEqual(args, []);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exitCode = null; child.written = ''; child.kills = [];
    child.stdin.on('data', chunk => { child.written += chunk.toString(); });
    child.kill = signal => { child.kills.push(signal); child.exitCode = 0; child.emit('exit', 0); };
    children.push(child);
    return child;
  } });
  const call = (method, payload = {}, peer = owner, signal) => bridge.handle(method, { clientId, ...payload }, signal, peer);
  return { bridge, call, children, advance: ms => { time += ms; }, emit: event => children[0].stdout.write(`${JSON.stringify(event)}\n`) };
}
const snapshot = (extra = {}) => ({ id: 'snapshot-1', appName: 'Example', bundleId: 'example.app', title: 'Document',
  url: 'https://user:pass@example.com/path?secret=1#private', text: 'public selection', scope: 'selection',
  status: 'partial', capturedAt: new Date().toISOString(), ...extra });

test('host explicitly requires connection plus its webServer carrier and owner authentication before spawning', async t => {
  const s = setup(); t.after(s.bridge.dispose);
  assert.deepEqual(inject, ['connection', 'webServer']);
  for (const peer of [undefined, {}, { principal: { kind: 'remote' } }]) {
    const result = await s.bridge.handle('poll', { clientId }, undefined, peer);
    assert.equal(result.ok, false);
  }
  assert.equal(s.children.length, 0);
  assert.equal((await s.call('poll')).ok, true);
  assert.equal(s.children.length, 1);
  await s.call('poll'); assert.equal(s.children.length, 1);
});

test('invalid endpoints/client IDs cannot spawn or pass native commands', async t => {
  const s = setup(); t.after(s.bridge.dispose);
  assert.equal((await s.call('capture-any-app')).ok, false);
  assert.equal((await s.call('poll', { clientId: '' })).ok, false);
  assert.equal((await s.call('authorize')).ok, false);
  assert.equal(s.children.length, 0);
});

test('non-macOS returns unsupported and never launches a program', async t => {
  const s = setup('win32'); t.after(s.bridge.dispose);
  const result = await s.call('poll');
  assert.equal(result.value.status.hotkey, 'unsupported');
  assert.equal(s.children.length, 0);
});

test('only one desktop lease receives snapshots; lease expires', async t => {
  const s = setup(); t.after(s.bridge.dispose);
  await s.call('poll');
  assert.equal((await s.call('poll', { clientId: 'another-desktop' })).error.code, 'quick-ask/another-desktop-client');
  s.advance(15001);
  assert.equal((await s.call('poll', { clientId: 'another-desktop' })).ok, true);
});

test('JSONL fragments are buffered, status sanitized and snapshot acknowledged', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  const child = s.children[0];
  child.stdout.write('{"type":"status",');
  child.stdout.write('"hotkey":"registered","accessibility":true,"captureEnabled":true}\n');
  s.emit({ type: 'wake', snapshot: snapshot() });
  const result = await s.call('poll');
  assert.equal(result.value.status.hotkey, 'registered');
  assert.equal(result.value.status.accessibility, true);
  assert.equal(result.value.snapshot.url, 'https://example.com/path');
  assert.equal(result.value.snapshot.pid, undefined);
  assert.equal(result.value.snapshot.text, 'public selection');
  assert.equal((await s.call('poll')).value.snapshot.id, 'snapshot-1');
  assert.equal((await s.call('poll', { ack: 'snapshot-1' })).value.snapshot, null);
});

test('ack for an old wake cannot remove a newer wake', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  s.emit({ type: 'wake', snapshot: snapshot({ id: 'snapshot-2' }) });
  assert.equal((await s.call('poll', { ack: 'snapshot-1' })).value.snapshot.id, 'snapshot-2');
});

test('restore and discard only accept the current native snapshot identity', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  s.emit({ type: 'wake', snapshot: snapshot() });
  assert.equal((await s.call('restore', { id: 'other', pid: 42 })).ok, false);
  assert.equal((await s.call('restore', { id: 'snapshot-1', pid: 42 })).ok, true);
  assert.ok(s.children[0].written.includes('{"type":"restore","id":"snapshot-1"}'));
  assert.ok(!s.children[0].written.includes('42'));
  assert.equal((await s.call('restore', { id: 'snapshot-1' })).ok, false);
});

test('disabling reading drops queued text; explicit authorize is the sole enable path', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  s.emit({ type: 'wake', snapshot: snapshot() });
  assert.equal((await s.call('disable-capture')).ok, true);
  assert.equal((await s.call('poll')).value.snapshot, null);
  assert.ok(s.children[0].written.includes('"enabled":false'));
  await s.call('authorize');
  assert.ok(s.children[0].written.includes('{"type":"authorize"}'));
  assert.ok(!s.children[0].written.includes('"enabled":true'));
});

test('two-minute TTL deletes snapshot even without client acknowledgment', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  s.emit({ type: 'wake', snapshot: snapshot() });
  s.advance(120001); s.bridge.expire();
  assert.equal((await s.call('poll')).value.snapshot, null);
  assert.ok(s.children[0].written.includes('{"type":"discard","id":"snapshot-1"}'));
});

test('native in-app toggle is delivered once by a held poll', async t => {
  const s = setup('darwin', 40); t.after(s.bridge.dispose);
  const pending = s.call('poll');
  s.emit({ type: 'toggle' });
  const first = await pending;
  assert.equal(first.ok, true);
  assert.equal(first.value.toggle, 1);
  assert.equal(first.value.hold, 40);
  const second = await s.call('poll');
  assert.equal(second.value.toggle, undefined);
});

test('a stale in-app toggle is dropped instead of resurfacing', async t => {
  const s = setup(); t.after(s.bridge.dispose);
  await s.call('poll');
  s.emit({ type: 'toggle' });
  s.advance(2001);
  s.bridge.expire();
  assert.equal((await s.call('poll')).value.toggle, undefined);
});

test('release drops memory and another client may acquire lease', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  s.emit({ type: 'wake', snapshot: snapshot() });
  await s.call('release');
  const result = await s.call('poll', { clientId: 'another-desktop' });
  assert.equal(result.ok, true); assert.equal(result.value.snapshot, null);
});

test('input size is capped, secure/failed snapshots cannot carry text or scope', () => {
  assert.equal(sanitizeSnapshot(null), null);
  assert.equal(sanitizeSnapshot({ id: '</inject>' }), null);
  assert.equal(sanitizeSnapshot(snapshot({ text: 'x'.repeat(50000) })).text.length, 16000);
  for (const status of ['protected', 'failed', 'permission-required', 'capture-disabled', 'unknown']) {
    const value = sanitizeSnapshot(snapshot({ status }));
    assert.equal(value.text, ''); assert.equal(value.scope, 'none');
  }
  assert.equal(sanitizeSnapshot(snapshot({ url: 'file:///etc/passwd' })).url, '');
});

test('malformed native output ignored and oversized output terminated', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  s.children[0].stdout.write('not-json\n');
  assert.equal((await s.call('poll')).value.snapshot, null);
  s.children[0].stdout.write('x'.repeat(262145));
  assert.deepEqual(s.children[0].kills, ['SIGTERM']);
});

test('failed helper can be explicitly restarted, but live helper not duplicated', async t => {
  const s = setup(); t.after(s.bridge.dispose); await s.call('poll');
  assert.equal((await s.call('restart')).ok, false);
  s.children[0].kill('SIGTERM');
  await s.call('poll'); assert.equal(s.children.length, 1);
  await s.call('restart'); assert.equal(s.children.length, 2);
});

test('dispose rejects late RPCs, closes pipe and requests helper termination', async () => {
  const s = setup(); await s.call('poll');
  s.bridge.dispose(); s.bridge.dispose();
  assert.ok(s.children[0].written.includes('{"type":"quit"}'));
  assert.equal(s.children[0].stdin.writableEnded, true);
  assert.equal((await s.call('poll')).ok, false);
});

test('apply registers the authenticated Host route and unregisters on lifecycle cleanup', async () => {
  let off = false, cleanup;
  apply({
    effect(callback) { cleanup = callback(); },
    connection: { admit() { return { rejection: 401 }; } },
    webServer: { register(route) {
      assert.equal(route.kind, 'prefix');
      assert.equal(route.path, '/quick-ask-desktop');
      assert.equal(typeof route.handler, 'function');
      return () => { off = true; };
    } },
  });
  await cleanup(); assert.equal(off, true);
});
