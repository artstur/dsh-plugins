import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const key = 'dsh.notes.v1';
const endpoint = 'http://127.0.0.1:4178/__weave/storage';
const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('    function installStorageMirror(');
const end = source.indexOf('\n    }\n', start) + '\n    }'.length;
assert.ok(start >= 0 && end > start);
const implementation = source.slice(start, end);
const tick = () => new Promise((resolve) => setImmediate(resolve));

function browser(data, fetch) {
  class Storage {
    get length() { return data.size; }
    key(i) { return [...data.keys()][i]; }
    getItem(k) { return data.get(k) ?? null; }
    setItem(k, v) { data.set(k, String(v)); }
    removeItem(k) { data.delete(k); }
    clear() { data.clear(); }
  }
  const localStorage = new Storage();
  const window = { Storage, localStorage, fetch, addEventListener() {}, setInterval() {}, dispatchEvent() {} };
  const install = vm.runInNewContext('(' + implementation + ')', { window, CustomEvent });
  install('dsh.notes.', endpoint);
  return { localStorage, sync: () => window.__weaveStorageMirror.sync() };
}
function ok(data) { return { ok: true, status: 200, async json() { return data; } }; }
function storeState(body) { return JSON.stringify({ notes: [{ id: 'note', body }], selectedId: 'note' }); }

test('large edits survive offline reload; rapid writes stay in order with their own merge base', async () => {
  let remote = storeState('first');
  let revision = 1, offline = false, block = null;
  const received = [];
  async function fetch(url, options) {
    assert.equal(url, endpoint);
    if (offline) throw Error('offline');
    if (options.method !== 'POST') return ok({ values: { [key]: remote }, revision });
    if (options.keepalive && Buffer.byteLength(options.body) > 65536) throw Error('keepalive quota');
    const patch = JSON.parse(options.body);
    received.push(patch);
    if (block) await block;
    assert.equal(patch.baseValue, remote);
    remote = patch.value;
    return ok({ ok: true, revision: ++revision, value: remote });
  }
  const disk = new Map();
  let client = browser(disk, fetch);
  await tick();
  const large = storeState('写'.repeat(32000));
  offline = true;
  client.localStorage.setItem(key, large);
  await tick();
  client = browser(disk, fetch);
  await tick();
  assert.equal(client.localStorage.getItem(key), large);
  offline = false;
  await client.sync();
  assert.equal(remote, large);
  assert.equal(received[0].baseValue, storeState('first'));
  let release;
  block = new Promise((resolve) => { release = resolve; });
  const second = storeState('newer');
  client.localStorage.setItem(key, second);
  client.localStorage.setItem(key, storeState('latest'));
  assert.equal(received.length, 2);
  release();
  await tick();
  assert.equal(received.length, 3);
  assert.equal(remote, storeState('latest'));
  assert.equal(received[2].baseValue, second);
  assert.equal(disk.size, 1);
});

test('in-flight GET and a content conflict preserve the unsent local draft', async () => {
  const original = storeState('start');
  let revision = 1, remote = original, waitGet, unblock, posts = 0;
  async function fetch(url, options) {
    if (options.method !== 'POST') {
      const snapshot = { revision, values: { [key]: remote } };
      if (waitGet) await waitGet;
      return ok(snapshot);
    }
    posts++;
    return { ok: false, status: 409, async json() { return { ok: false, revision, value: remote }; } };
  }
  const client = browser(new Map(), fetch);
  await tick();
  remote = storeState('concurrent edit'); revision++;
  waitGet = new Promise((resolve) => { unblock = resolve; });
  const poll = client.sync();
  client.localStorage.setItem(key, storeState('local draft'));
  unblock(); await poll;
  await client.sync();
  assert.equal(client.localStorage.getItem(key), storeState('local draft'));
  assert.equal(posts, 1);
});
