import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
let loaded = null;
const values = new Map([
  ['dsh.notes.v1', JSON.stringify({ notes: [{ id: 'n1', title: '测试笔记', body: '正文', updatedAt: 1 }] })],
]);
const windowShim = {
  __ModuleLoader__: { load(options) { loaded = options; } },
  localStorage: { getItem(key) { return values.get(key) || null; } },
};
new Function('window', source)(windowShim);
const plugin = loaded.factory((id) => {
  if (id === 'react') {
    return { createElement(type, props) { return { type, props }; } };
  }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') {
    return { ReferenceChip: 'ReferenceChip' };
  }
  if (id === '@deepseek-ai/dsh-client-ui-input-trigger') {
    return { InputTriggerController: class { track() {} } };
  }
  throw new Error(`unexpected require: ${id}`);
});

test('plugin registers a # source and disposes cleanly', async () => {
  const cleanups = [];
  let registered = null;
  let displayRule = null;
  let renderer = null;
  let sourceDisposed = false;
  const inputTriggers = {
    live: { controllers: { values: new Set() } },
    registerSource(sourceDefinition) {
      registered = sourceDefinition;
      return () => { sourceDisposed = true; };
    },
    sessionOf() { return null; },
  };
  const originalSessionOf = inputTriggers.sessionOf;
  const slots = {
    inject(name, callback) {
      assert.equal(name, 'conversation.user.text.node');
      for (const registration of callback()) void registration;
    },
    register(options, component) {
      renderer = { options, component };
      return () => {};
    },
  };
  const ctx = {
    get(name) {
      assert.equal(name, 'inputTriggers');
      return inputTriggers;
    },
    locale: { getSnapshot() { return { active: 'zh-CN' }; } },
    slots,
    uiConversation: {
      userText: {
        register(rule) {
          displayRule = rule;
          return () => { displayRule = null; };
        },
      },
    },
    effect(callback) {
      const cleanup = callback();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
  };

  plugin.apply(ctx);
  assert.ok(registered);
  assert.ok(displayRule);
  assert.equal(displayRule.id, 'knowledge-context');
  assert.equal(renderer.options.key, 'knowledge-context');
  assert.equal(registered.trigger, '#');
  assert.equal(registered.name, 'knowledge-context');
  const candidates = await registered.candidates({}, { query: '笔记', signal: { aborted: false } });
  assert.ok(candidates.some((item) => item.label === '全部笔记'));
  const picked = registered.onPick({ candidate: candidates[0] });
  assert.equal(picked.insert.source, 'knowledge-context');
  assert.equal(picked.insert.appearance, 'file');
  const serialized = await registered.codec.serialize(picked.insert.ref);
  assert.match(serialized, /测试笔记/u);
  assert.match(serialized, /label="全部笔记"/u);

  for (const cleanup of cleanups.reverse()) cleanup();
  assert.ok(sourceDisposed);
  assert.equal(inputTriggers.sessionOf, originalSessionOf);
});

test('plugin exposes chat-room messages and serializes them at send time', async () => {
  const cleanups = [];
  let registered = null;
  const inputTriggers = {
    live: { controllers: { values: new Set() } },
    registerSource(sourceDefinition) { registered = sourceDefinition; return () => {}; },
    sessionOf() { return null; },
  };
  const ctx = {
    get(name) {
      if (name === 'inputTriggers') return inputTriggers;
      throw new Error(`unexpected service: ${name}`);
    },
    locale: { getSnapshot() { return { active: 'zh-CN' }; } },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'conversation.user.text.node');
        for (const registration of callback()) void registration;
      },
      register() { return () => {}; },
    },
    uiConversation: { userText: { register() { return () => {}; } } },
    effect(callback) {
      const cleanup = callback();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
  };

  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url).endsWith('/state')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          state: {
            activeId: 'c1',
            contacts: [{ id: 'c1', name: 'victor', lastMessage: { text: 'hi', at: 1, mine: false } }],
          },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        messages: [
          { id: 'm1', at: 1000, from: 'victor', text: 'hi', mine: false },
          { id: 'm2', at: 2000, from: 'victor', text: '你试试', mine: true },
        ],
      }),
    };
  };

  try {
    plugin.apply(ctx);
    const candidates = await registered.candidates({}, { query: '', signal: { aborted: false } });
    assert.ok(candidates.some((item) => item.label === '全部消息'));
    assert.ok(candidates.some((item) => item.label === '与 victor 的对话'));
    assert.ok(candidates.some((item) => item.label === 'victor：hi'));
    const all = candidates.find((item) => item.label === '全部消息');
    const picked = registered.onPick({ candidate: all });
    const serialized = await registered.codec.serialize(picked.insert.ref);
    assert.match(serialized, /source="dsh-chatroom"/u);
    assert.match(serialized, /victor: hi/u);
    assert.match(serialized, /你: 你试试/u);
    assert.ok(requests.some((url) => url.includes('/plugin/chat-room/state')));
    assert.ok(requests.some((url) => url.includes('/plugin/chat-room/thread?id=c1')));
  } finally {
    globalThis.fetch = originalFetch;
    for (const cleanup of cleanups.reverse()) cleanup();
  }
});
