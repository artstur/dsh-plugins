/**
 * Cross-plugin integration check.
 *
 * Loads the registry, every Provider in this workspace and the consumer into
 * one page, then drives the whole chain: a Provider registers, the registry
 * answers a search, and the consumer builds its menu from the registry.
 *
 * A plugin that is not part of this workspace is skipped, so the check keeps
 * working when one of them is removed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '..', '..');

const values = new Map();
let captured = null;
const windowShim = {
  __ModuleLoader__: {
    load(options) {
      captured = options;
    },
  },
  localStorage: {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  },
  document: {
    addEventListener() {},
    removeEventListener() {},
  },
};

const ReactStub = {
  createElement: (type, props) => ({ type, props }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
  Fragment: 'Fragment',
};

function requireStub(id) {
  if (id === 'react') return ReactStub;
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return { ReferenceChip: 'ReferenceChip' };
  if (id === '@deepseek-ai/dsh-client-ui-input-trigger') {
    return { InputTriggerController: class { track() {} } };
  }
  throw new Error(`unexpected require: ${id}`);
}

function loadClient(relative) {
  const file = path.join(workspace, relative);
  if (!fs.existsSync(file)) return null;
  const source = fs.readFileSync(file, 'utf8');
  captured = null;
  new Function('window', source)(windowShim);
  assert.ok(captured, `${relative} must register with the module loader`);
  return captured.factory(requireStub);
}

function makeContext(extra = {}) {
  const cleanups = [];
  const inputTriggers = {
    live: { controllers: { values: new Set() } },
    registerSource() {
      return () => undefined;
    },
    sessionOf() {
      return null;
    },
  };
  const ctx = {
    get(name) {
      if (name === 'inputTriggers') return inputTriggers;
      throw new Error(`service not available: ${name}`);
    },
    provide() {
      return () => undefined;
    },
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') cleanups.push(dispose);
      return dispose;
    },
    inject(dependencies, callback) {
      callback(ctx);
      return { dispose() {} };
    },
    locale: {
      bind: () => (key) => key,
      register: () => () => undefined,
      getSnapshot: () => ({ active: 'zh-CN', locales: [{ id: 'zh' }, { id: 'en' }] }),
      subscribe: () => () => undefined,
    },
    slots: {
      inject(name, callback) {
        const result = callback();
        if (result && typeof result[Symbol.iterator] === 'function') {
          for (const registration of result) void registration;
        }
        return () => undefined;
      },
      register() {
        return () => undefined;
      },
    },
    uiConversation: {
      userText: {
        register() {
          return () => undefined;
        },
      },
    },
    remote: {},
    ...extra,
  };
  ctx.cleanups = cleanups;
  return ctx;
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

values.set('dsh.notes.v1', JSON.stringify({
  notes: [
    { id: 'n1', title: '项目方向', body: '保留条件、理由与例外。', images: [], createdAt: 10, updatedAt: 20 },
    { id: 'sys', title: '版本记录', body: '自动维护的版本记录', system: 'plugin-version-log:x', createdAt: 30, updatedAt: 30 },
  ],
}));
values.set('dsh.facechat.v1', JSON.stringify({
  sessions: [
    {
      id: 's1',
      title: '产品讨论',
      createdAt: 40,
      durationMs: 5000,
      speakers: [{ name: 'Celia' }],
      lines: [{ speaker: 0, text: '我们应该从用户场景出发。', startMs: 1000 }],
    },
  ],
}));

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.endsWith('/state')) {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        state: {
          activeId: 'c-victor',
          contacts: [{ id: 'c-victor', name: 'victor', lastMessage: { text: 'hi', at: 1000, mine: false } }],
        },
      }),
    };
  }
  return {
    ok: true,
    json: async () => ({
      ok: true,
      messages: [{ id: 'm1', at: 1000, from: 'victor', text: 'hi', mine: false }],
    }),
  };
};

const registryPlugin = loadClient('resource-api/client.js');
assert.ok(registryPlugin, 'the registry bundle must be part of the workspace');
registryPlugin.apply(makeContext());

const service = windowShim.__dshResourceService;
assert.ok(service, 'the registry publishes its service');

const notesPlugin = loadClient('notes-panel/client.js');
const facechatPlugin = loadClient('facechat-recorder/client.js');
const chatRoomPlugin = loadClient('chat-room/client.js');
const consumerPlugin = loadClient('knowledge-context-reference/client.js');

const notesContext = notesPlugin ? makeContext() : null;
if (notesPlugin) notesPlugin.apply(notesContext);
const facechatContext = facechatPlugin ? makeContext() : null;
if (facechatPlugin) facechatPlugin.apply(facechatContext);
const chatRoomContext = chatRoomPlugin ? makeContext() : null;
if (chatRoomPlugin) chatRoomPlugin.apply(chatRoomContext);

test('every plugin registers its own Provider with the registry', () => {
  const sources = service.listProviders().map((provider) => provider.source);
  assert.ok(sources.includes('notes'), 'the notes plugin registered');
  assert.ok(sources.includes('facechat'), 'the facechat plugin registered');
  assert.ok(sources.includes('messages'), 'the chat-room plugin registered');
  for (const provider of service.listProviders()) {
    assert.ok(provider.title && provider.title.zh && provider.title.en, `${provider.source} has a title`);
    assert.ok(Array.isArray(provider.aliases) && provider.aliases.length > 0, `${provider.source} has aliases`);
  }
});

test('the registry searches across every source at once', async () => {
  const result = await service.search({ query: '', limit: 50 });
  const ids = result.items.map((item) => `${item.source}:${item.id}`);
  assert.ok(ids.includes('notes:n1'), 'a note is found');
  assert.ok(ids.includes('notes:sys'), 'an auto-maintained note is found as well');
  assert.ok(ids.includes('facechat:s1'), 'a recording is found');
  assert.ok(ids.includes('messages:c-victor::m1'), 'a message is found');
  const sources = new Set(result.items.map((item) => item.source));
  assert.equal(sources.size, 3, 'one search spans three sources');
});

test('the registry pages with a cursor across sources', async () => {
  const first = await service.search({ query: '', limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor, 'a partial page carries a cursor');
  const second = await service.search({ query: '', limit: 2, cursor: first.nextCursor });
  const firstIds = new Set(first.items.map((item) => item.id));
  assert.ok(
    second.items.every((item) => !firstIds.has(item.id)),
    'the second page does not repeat the first one',
  );
});

test('the registry reads one source and one aggregate at once', async () => {
  const result = await service.read({
    refs: [
      { source: 'notes', id: 'n1' },
      { source: 'facechat', id: 'all' },
    ],
  });
  assert.deepEqual(result.missing, []);
  assert.ok(result.items.some((item) => item.source === 'notes' && item.id === 'n1'));
  assert.ok(result.items.some((item) => item.source === 'facechat' && item.id === 's1'));
});

test('the consumer builds its menu from the registry, not from a local store', async () => {
  assert.ok(consumerPlugin, 'the consumer plugin must be part of the workspace');
  const ctx = makeContext();
  consumerPlugin.apply(ctx);
  const api = windowShim.__DSH_KNOWLEDGE_CONTEXT_TEST__;
  assert.ok(api);
  const candidates = await api.buildCandidates('', 'zh-CN');
  const labels = candidates.map((item) => item.label);
  assert.ok(labels.includes('全部笔记'), 'the notes aggregate comes from the notes Provider');
  assert.ok(labels.includes('全部面聊'), 'the facechat aggregate comes from the facechat Provider');
  assert.ok(labels.includes('全部消息'), 'the messages aggregate comes from the messages Provider');
  assert.ok(labels.includes('项目方向'), 'a note is offered');
  assert.ok(labels.includes('产品讨论'), 'a recording is offered');
  assert.ok(labels.includes('与 victor 的对话'), 'a conversation is offered');

  const serialized = await api.serializeReference(api.encodeRef('notes'), 'zh-CN');
  assert.match(serialized, /保留条件、理由与例外。/u);
  assert.match(serialized, /label="全部笔记"/u);
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
