/**
 * Device resource Provider check: apply the plugin against a fake Cordis
 * context, take the `facechat` Provider it registers and exercise the
 * registry-facing contract — search (matching, time range, paging), read
 * (single id and the 'all' aggregate) and the descriptive labels.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(here, 'client.js'), 'utf8');

/* --- Fixtures ----------------------------------------------------------- */

const SESSIONS = [
  {
    id: 's-new',
    title: '产品周会',
    createdAt: 1764110000000,
    durationMs: 65000,
    language: 'zh',
    speakers: [{ name: '张三' }, { name: '李四' }],
    lines: [
      { id: 'l1', speaker: 0, text: '我们开始吧', startMs: 12000, endMs: 15000, durationMs: 3000 },
      { id: 'l2', speaker: 1, text: '先看 roadmap', startMs: 30000, endMs: 33000, durationMs: 3000 },
    ],
  },
  {
    id: 's-old',
    title: '',
    createdAt: 1764000000000,
    durationMs: 1000,
    language: 'en',
    speakers: [{}, {}],
    lines: [{ id: 'l3', speaker: 0, text: 'Good morning', startMs: 500, endMs: 1500, durationMs: 1000 }],
  },
];

const store = new Map([['dsh.facechat.v1', JSON.stringify({ sessions: SESSIONS })]]);

/* --- Load the plugin ---------------------------------------------------- */

const localeState = { active: 'zh', locales: [{ id: 'zh' }, { id: 'en' }] };
const ReactStub = {
  createElement: () => null,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  Fragment: 'Fragment',
};

const speechMock = {
  async follow(signal) {
    await new Promise((resolve) => {
      if (signal && signal.aborted) return resolve();
      const timer = setTimeout(resolve, 20);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  },
};

/**
 * Load a fresh copy of the plugin against its own window stub and apply it.
 *
 * @param {object} windowStub - the window the plugin sees.
 * @returns {object} the applied context, with its disposers on `cleanups`.
 */
function applyPlugin(windowStub) {
  let loaded = null;
  windowStub.__ModuleLoader__ = { load(options) { loaded = options; } };
  new Function('window', source)(windowStub);
  const plugin = loaded.factory((name) => {
    if (name === 'react') return ReactStub;
    throw new Error('unexpected require: ' + name);
  });

  const cleanups = [];
  const ctx = {
    remote: { speech: speechMock },
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') cleanups.push(dispose);
      return dispose;
    },
    inject(dependencies, callback) {
      callback(Object.assign({}, ctx));
      return { dispose() {} };
    },
    locale: {
      bind() { return (key) => key; },
      register() { return () => {}; },
      getSnapshot() { return localeState; },
      subscribe() { return () => {}; },
    },
    slots: {
      inject(slotName, callback) { callback(); },
      register() { return () => {}; },
    },
  };

  plugin.apply(ctx);
  return { ctx, cleanups };
}

const windowShim = {
  localStorage: {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, value); },
    removeItem(key) { store.delete(key); },
  },
};
const { cleanups } = applyPlugin(windowShim);

const provider = (windowShim.__dshResourceQueue || []).find((entry) => entry.source === 'facechat');
assert.ok(provider, 'the facechat provider is registered');
assert.deepEqual(provider.title, { zh: '面聊', en: 'Facechat' });
assert.equal(provider.kind, 'conversation');
assert.equal(provider.icon, 'session');
for (const alias of ['面聊', '录音', '逐字稿', 'meeting', 'facechat', 'transcript']) {
  assert.ok(provider.aliases.includes(alias), 'alias ' + alias);
}
assert.equal(provider.labels.all.zh, '全部面聊');
assert.equal(provider.labels.unit.en, 'recordings');
assert.equal(provider.labels.item.zh, '面聊');
assert.equal(provider.labels.empty.en, 'No transcript');

/* --- describe ------------------------------------------------------------ */

assert.equal(await provider.describe('zh-CN'), '2 段录音');
assert.equal(await provider.describe('en'), '2 recordings');
assert.equal(await provider.describe(), '2 recordings');

/* --- search -------------------------------------------------------------- */

const all = await provider.search({ query: '', offset: 0, limit: 20 });
assert.equal(all.total, 2, 'total counts every match');
assert.equal(all.items.length, 2);
assert.equal(all.items[0].id, 's-new', 'newest first');
assert.equal(all.items[1].id, 's-old');
assert.equal(all.items[0].title, '产品周会');
assert.equal(all.items[0].updatedAt, SESSIONS[0].createdAt);
assert.equal(all.items[0].createdAt, SESSIONS[0].createdAt);
assert.equal(all.items[0].meta.durationMs, 65000);
assert.equal(all.items[0].meta.language, 'zh');
assert.deepEqual(all.items[0].meta.speakers, ['张三', '李四']);
assert.ok(all.items[0].snippet.includes('我们开始吧'), 'snippet previews the transcript');
assert.ok(!all.items[0].snippet.includes('\n'), 'snippet stays on one line');
assert.ok(all.items[1].title.length > 0, 'a recording without a title falls back to its date');

assert.equal((await provider.search({ query: '张三' })).total, 1, 'matches a speaker name');
assert.equal((await provider.search({ query: 'ROADMAP' })).total, 1, 'matches the transcript, case-insensitively');
assert.equal((await provider.search({ query: '产品周会' })).total, 1, 'matches the title');
assert.equal((await provider.search({ query: 'not-in-any-recording' })).total, 0);

const ranged = await provider.search({
  query: '',
  timeRange: { from: SESSIONS[0].createdAt, to: SESSIONS[0].createdAt + 1000 },
});
assert.equal(ranged.total, 1, 'the time range filters on createdAt');
assert.equal(ranged.items[0].id, 's-new');

const page = await provider.search({ query: '', offset: 1, limit: 1 });
assert.equal(page.total, 2, 'total is the count before paging');
assert.equal(page.items.length, 1);
assert.equal(page.items[0].id, 's-old', 'offset and limit slice the newest-first order');

/* --- read ---------------------------------------------------------------- */

const one = await provider.read({ ids: ['s-new'] });
assert.equal(one.items.length, 1);
assert.equal(one.items[0].id, 's-new');
assert.equal(one.items[0].itemType, 'facechat');
assert.equal(one.items[0].title, '产品周会');
assert.equal(one.items[0].text, '[00:12] 张三: 我们开始吧\n[00:30] 李四: 先看 roadmap');
assert.equal(one.items[0].updatedAt, SESSIONS[0].createdAt);
assert.equal(one.items[0].createdAt, SESSIONS[0].createdAt);
assert.equal(one.items[0].attributes.created_at, new Date(SESSIONS[0].createdAt).toISOString());
assert.equal(one.items[0].meta.durationMs, 65000);
assert.deepEqual(one.items[0].meta.speakers, ['张三', '李四']);

const aggregate = await provider.read({ ids: ['all'] });
assert.equal(aggregate.items.length, 2, "'all' returns every recording");
assert.deepEqual(aggregate.items.map((item) => item.id), ['s-new', 's-old']);

assert.equal((await provider.read({ ids: ['does-not-exist'] })).items.length, 0, 'an unknown id is simply absent');

/* An unnamed speaker is rendered as 话者 1 / Speaker 1. */
const unnamed = await provider.read({ ids: ['s-old'] });
assert.equal(unnamed.items[0].text, '[00:00] 话者 1: Good morning');
localeState.active = 'en';
const unnamedEn = await provider.read({ ids: ['s-old'] });
assert.equal(unnamedEn.items[0].text, '[00:00] Speaker 1: Good morning');
assert.ok(unnamedEn.items[0].title.startsWith('Conversation '), 'the English title falls back to the date');

for (const dispose of cleanups.reverse()) {
  try {
    dispose();
  } catch (err) {
    throw new Error('cleanup failed: ' + (err && err.message ? err.message : String(err)));
  }
}

/* --- The other load order: the registry is already mounted --------------- */

const registered = [];
const sinkWindow = {
  localStorage: windowShim.localStorage,
  __dshResourceSink(entry) {
    registered.push(entry);
    return () => {
      const index = registered.indexOf(entry);
      if (index >= 0) registered.splice(index, 1);
    };
  },
};
const sinkRun = applyPlugin(sinkWindow);
assert.equal(registered.length, 1, 'a mounted registry receives the provider through its sink');
assert.equal(registered[0].source, 'facechat');
assert.equal((sinkWindow.__dshResourceQueue || []).length, 0, 'nothing is queued when the sink took it');
for (const dispose of sinkRun.cleanups.reverse()) {
  try {
    dispose();
  } catch (err) {
    throw new Error('cleanup failed: ' + (err && err.message ? err.message : String(err)));
  }
}
assert.equal(registered.length, 0, 'the provider is unregistered with the registry');

console.log('ok - facechat resource provider: registration, search, read and labels');
