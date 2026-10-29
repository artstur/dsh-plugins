/**
 * The device-side resource Provider of this plugin.
 *
 * The Client half is loaded against a minimal fake window, the Provider is
 * taken from the registry sink and then exercised against a fake Host half
 * that serves the same API the real one serves.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

/* ------------------------------------------------------------------ *
 * A fake window and a fake Cordis context
 * ------------------------------------------------------------------ */

let loaded = null;
const windowShim = { __ModuleLoader__: { load(options) { loaded = options; } } };
new Function('window', source)(windowShim);

const reactStub = { createElement: () => null };
const plugin = loaded.factory((name) => {
  if (name === 'react') return reactStub;
  throw new Error('the chat room must not require ' + name);
});

let provider = null;
windowShim.__dshResourceSink = (entry) => {
  provider = entry;
  return () => undefined;
};

const disposers = [];
const localeState = { active: 'en' };
const ctx = {
  locale: {
    bind: () => (key) => key,
    getSnapshot: () => ({ locales: [{ id: 'en' }, { id: 'zh-CN' }], active: localeState.active }),
    register: () => () => undefined,
  },
  slots: {
    inject: (_name, callback) => callback(),
    register: () => () => undefined,
  },
  effect(callback) {
    const dispose = callback();
    if (typeof dispose === 'function') disposers.push(dispose);
    return dispose;
  },
  get() {
    throw new Error('no service');
  },
};

plugin.apply(ctx);
assert.ok(provider, 'the provider is registered with the resource registry');

/* ------------------------------------------------------------------ *
 * A fake Host half
 * ------------------------------------------------------------------ */

const CONTACTS = [
  {
    id: 'c-1',
    name: 'victor',
    unnamed: false,
    createdAt: 100,
    lastMessage: { text: 'hello world', at: 2000, mine: false },
  },
  {
    id: 'c-2',
    name: 'anna',
    unnamed: false,
    createdAt: 200,
    lastMessage: { text: 'hi anna', at: 3000, mine: true },
  },
];

const THREADS = {
  'c-1': [
    { id: 'm1', at: 1000, from: 'victor', text: '你试试', mine: false },
    { id: 'm2', at: 2000, from: 'victor', text: 'hello world', mine: false },
  ],
  'c-2': [{ id: 'm3', at: 3000, from: 'anna', text: 'hi anna', mine: true }],
};

const threadRequests = [];
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path === '/plugin/chat-room/state') {
    return { ok: true, status: 200, json: async () => ({ ok: true, state: { contacts: CONTACTS } }) };
  }
  if (path.indexOf('/plugin/chat-room/thread?id=') === 0) {
    const contactId = decodeURIComponent(path.split('?id=')[1]);
    threadRequests.push(contactId);
    const messages = THREADS[contactId];
    if (!messages) {
      return { ok: false, status: 404, json: async () => ({ ok: false, error: 'unknown-contact' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        contact: CONTACTS.find((entry) => entry.id === contactId),
        messages,
      }),
    };
  }
  return { ok: false, status: 404, json: async () => ({ ok: false, error: 'not-found' }) };
};

/* ------------------------------------------------------------------ *
 * The descriptor
 * ------------------------------------------------------------------ */

assert.equal(provider.source, 'messages');
assert.deepEqual(provider.title, { zh: '消息', en: 'Messages' });
assert.equal(provider.kind, 'conversation');
assert.equal(provider.icon, 'session');
assert.ok(provider.aliases.includes('message'));
assert.ok(provider.labels && provider.labels.all && provider.labels.unit);
assert.equal(typeof provider.describe, 'function');
assert.equal(typeof provider.search, 'function');
assert.equal(typeof provider.read, 'function');

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

const everything = await provider.search({ query: '', limit: 20 });
assert.deepEqual(
  everything.items.map((item) => item.id),
  ['c-2::m3', 'c-1::m2', 'c-1::m1'],
  'the newest message comes first',
);
assert.equal(everything.total, 3, 'the total counts every match');
assert.equal(everything.items[0].title, 'You: hi anna', 'the label names the sender');
assert.equal(everything.items[0].snippet, 'hi anna', 'the snippet is the plain text');
assert.equal(everything.items[1].title, 'victor: hello world');
assert.equal(everything.items[2].title, 'victor: 你试试');
assert.equal(everything.items[0].updatedAt, 3000);
assert.equal(everything.items[0].createdAt, 3000);
assert.equal(everything.items[0].meta.contactId, 'c-2');
assert.equal(everything.items[0].meta.contactName, 'anna');
assert.equal(everything.items[0].meta.mine, true);
assert.equal(everything.items[0].meta.from, 'anna');
assert.deepEqual(everything.items[0].meta.group, {
  id: 'c-2',
  title: 'anna',
  label: 'Chat with anna',
  readId: 'contact:c-2',
});

const byName = await provider.search({ query: 'VICTOR', limit: 20 });
assert.deepEqual(
  byName.items.map((item) => item.id),
  ['c-1::m2', 'c-1::m1'],
  'the contact name matches too',
);

const byText = await provider.search({ query: 'hello', limit: 20 });
assert.deepEqual(
  byText.items.map((item) => item.id),
  ['c-1::m2'],
  'the query is matched case-insensitively',
);

const ranged = await provider.search({
  query: '',
  limit: 20,
  timeRange: { from: 2000, to: 3000 },
});
assert.deepEqual(
  ranged.items.map((item) => item.id),
  ['c-2::m3', 'c-1::m2'],
  'the time range keeps the matching messages only',
);

const page = await provider.search({ query: '', limit: 1 });
assert.equal(page.items.length, 1);
assert.equal(page.items[0].id, 'c-2::m3');
assert.equal(page.total, 3, 'the total is the count before paging');

const second = await provider.search({ query: '', limit: 1, offset: 1 });
assert.equal(second.items[0].id, 'c-1::m2', 'the offset continues the same order');

/* The label follows the language of the panel. */
localeState.active = 'zh-CN';
const chinese = await provider.search({ query: '', limit: 20 });
assert.equal(chinese.items[0].title, '你：hi anna', 'Chinese uses the full-width colon');
assert.equal(chinese.items[0].meta.group.label, '与 anna 的对话');
localeState.active = 'en';

/* The work of one search stays bounded. */
const manyContacts = Array.from({ length: 20 }, (_entry, index) => ({
  id: 'bulk-' + index,
  name: 'bulk ' + index,
  createdAt: index,
  lastMessage: { text: 'bulk', at: index, mine: false },
}));
const originalContacts = CONTACTS.length;
CONTACTS.push(...manyContacts);
for (const contact of manyContacts) {
  THREADS[contact.id] = [{ id: 'bulk-m' + contact.id, at: contact.createdAt, from: contact.name, text: 'bulk', mine: false }];
}
threadRequests.length = 0;
await provider.search({ query: 'bulk', limit: 50 });
assert.equal(threadRequests.length, 12, 'a search reads at most twelve conversations');
CONTACTS.length = originalContacts;

/* ------------------------------------------------------------------ *
 * Read
 * ------------------------------------------------------------------ */

const one = await provider.read({ ids: ['c-1::m1'] });
assert.equal(one.items.length, 1);
assert.equal(one.items[0].id, 'c-1::m1', 'the id is the one that was asked for');
assert.equal(one.items[0].title, 'victor', 'the heading names the sender');
assert.equal(one.items[0].text, '你试试');
assert.equal(one.items[0].itemType, 'message');
assert.equal(one.items[0].attributes.contact, 'victor');
assert.equal(one.items[0].attributes.contact_id, 'c-1');
assert.equal(one.items[0].attributes.direction, 'in');
assert.equal(one.items[0].attributes.at, 1000);

const mine = await provider.read({ ids: ['c-2::m3'] });
assert.equal(mine.items[0].attributes.direction, 'out', 'own messages point outwards');
assert.equal(mine.items[0].title, 'You', 'an own message is not filed under the other name');
assert.equal(mine.items[0].attributes.contact, 'anna', 'the contact stays the contact');

const missing = await provider.read({ ids: ['c-1::nope', 'c-9::m1'] });
assert.equal(missing.items.length, 0, 'an id that does not exist is left out');

const conversation = await provider.read({ ids: ['contact:c-1'] });
assert.equal(conversation.items.length, 1);
assert.equal(conversation.items[0].id, 'contact:c-1', 'the conversation keeps its selector id');
assert.equal(conversation.items[0].itemType, 'chat');
assert.equal(conversation.items[0].title, 'victor', 'a conversation is named after the contact');
assert.equal(conversation.items[0].attributes.name, 'victor');
assert.ok(
  /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] victor: 你试试$/.test(
    conversation.items[0].text.split('\n')[0],
  ),
  'every line carries its time and its sender',
);
assert.equal(conversation.items[0].text.split('\n').length, 2);

const aggregate = await provider.read({ ids: ['all'] });
assert.equal(aggregate.items.length, 2, 'the aggregate selector returns one item per contact');
assert.deepEqual(
  aggregate.items.map((item) => item.id).sort(),
  ['c-1', 'c-2'],
  'the item id of a contact is the contact id',
);
assert.ok(aggregate.items.every((item) => item.itemType === 'chat'));

/* ------------------------------------------------------------------ *
 * Description of the aggregate candidate
 * ------------------------------------------------------------------ */

assert.equal(await provider.describe('zh-CN'), '2 位联系人');
assert.equal(await provider.describe('zh'), '2 位联系人');
assert.equal(await provider.describe('en'), '2 contacts');
assert.equal(await provider.describe(), '2 contacts', 'a missing locale reads as English');
assert.equal(await provider.describe('fr'), '2 contacts');

/* ------------------------------------------------------------------ *
 * The queue: a registry that loads later still gets the provider
 * ------------------------------------------------------------------ */

const queuedWindow = { __ModuleLoader__: { load(options) { loaded = options; } } };
new Function('window', source)(queuedWindow);
const queuedPlugin = loaded.factory(() => reactStub);
const queuedCtx = {
  locale: ctx.locale,
  slots: ctx.slots,
  effect(callback) {
    const dispose = callback();
    if (typeof dispose === 'function') disposers.push(dispose);
    return dispose;
  },
  get() {
    throw new Error('no service');
  },
};
queuedPlugin.apply(queuedCtx);
assert.equal(queuedWindow.__dshResourceQueue.length, 1, 'the provider waits in the queue');
assert.equal(queuedWindow.__dshResourceQueue[0].source, 'messages');

for (const dispose of disposers) dispose();

console.log('the messages provider works');
