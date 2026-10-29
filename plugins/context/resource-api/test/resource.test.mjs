/**
 * Registry check: load the Client factory against a minimal fake window, then
 * exercise the unified search/read contract with two fake Providers.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

let loaded = null;
const windowShim = { __ModuleLoader__: { load(options) { loaded = options; } } };
new Function('window', source)(windowShim);
const plugin = loaded.factory(() => {
  throw new Error('the resource API must not require a browser package');
});
const testApi = windowShim.__DSH_RESOURCE_TEST__;
assert.ok(testApi, 'the test API must be exposed');

/* ------------------------------------------------------------------ *
 * Fake providers
 * ------------------------------------------------------------------ */

function makeProvider(source, items) {
  return {
    source,
    title: { zh: source, en: source },
    kind: 'document',
    icon: 'file',
    aliases: [source],
    async search({ query, timeRange, offset, limit }) {
      const needle = String(query || '').toLowerCase();
      const filtered = items
        .filter((item) => !needle || item.title.toLowerCase().includes(needle))
        .filter((item) => {
          if (!timeRange) return true;
          if (timeRange.from !== null && item.updatedAt < timeRange.from) return false;
          if (timeRange.to !== null && item.updatedAt > timeRange.to) return false;
          return true;
        })
        .sort((left, right) => right.updatedAt - left.updatedAt);
      return {
        items: filtered.slice(offset, offset + limit).map((item) => ({
          id: item.id,
          title: item.title,
          snippet: item.snippet || '',
          updatedAt: item.updatedAt,
          createdAt: item.createdAt || item.updatedAt,
          meta: {},
        })),
        total: filtered.length,
      };
    },
    async read({ ids }) {
      // The aggregate selector is resolved by the Provider: it knows what
      // "all" means for its own resources.
      const wanted = ids.includes('all') ? items.map((item) => item.id) : ids;
      return {
        items: wanted
          .map((id) => items.find((item) => item.id === id))
          .filter(Boolean)
          .map((item) => ({
            id: item.id,
            title: item.title,
            text: item.text || '',
            updatedAt: item.updatedAt,
            createdAt: item.createdAt || item.updatedAt,
            itemType: 'item',
          })),
      };
    },
  };
}

const notes = makeProvider('notes', [
  { id: 'note-a', title: 'Alpha note', text: 'alpha body', updatedAt: 300 },
  { id: 'note-b', title: 'Beta note', text: 'beta body', updatedAt: 100 },
  { id: 'note-c', title: 'Gamma note', text: 'gamma body', updatedAt: 200 },
]);
const messages = makeProvider('messages', [
  { id: 'message-b', title: 'Hello there', text: 'hello body', updatedAt: 250 },
  { id: 'message-c', title: 'Second one', text: 'second body', updatedAt: 50 },
]);

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

const registry = testApi.createRegistry();
registry.service.registerProvider(notes);
registry.service.registerProvider(messages);

assert.deepEqual(
  registry.service.listProviders().map((provider) => provider.source).sort(),
  ['messages', 'notes'],
);

const merged = await registry.service.search({ query: '', limit: 10 });
assert.deepEqual(
  merged.items.map((item) => item.id),
  ['note-a', 'message-b', 'note-c', 'note-b', 'message-c'],
  'sources are merged newest first',
);
assert.equal(merged.nextCursor, '', 'a complete page has no cursor');

const limited = await registry.service.search({ query: '', limit: 2 });
assert.equal(limited.items.length, 2);
assert.ok(limited.nextCursor, 'a partial page carries a cursor');

const second = await registry.service.search({ query: '', limit: 2, cursor: limited.nextCursor });
assert.equal(second.items.length, 2);
assert.deepEqual(
  second.items.map((item) => item.id),
  ['note-c', 'note-b'],
  'the cursor continues where the first page stopped',
);

const scoped = await registry.service.search({ source: 'notes', query: '', limit: 10 });
assert.deepEqual(scoped.items.map((item) => item.id), ['note-a', 'note-c', 'note-b']);
assert.ok(scoped.items.every((item) => item.source === 'notes'));

const queried = await registry.service.search({ query: 'alpha', limit: 10 });
assert.deepEqual(queried.items.map((item) => item.id), ['note-a']);

const ranged = await registry.service.search({
  query: '',
  limit: 10,
  timeRange: { from: 150, to: 350 },
});
assert.deepEqual(ranged.items.map((item) => item.id), ['note-a', 'message-b', 'note-c']);

const unknown = await registry.service.search({ source: 'nope', query: '', limit: 10 });
assert.equal(unknown.items.length, 0);
assert.deepEqual(unknown.sources, []);

/* ------------------------------------------------------------------ *
 * Read
 * ------------------------------------------------------------------ */

const read = await registry.service.read({
  refs: [
    { source: 'notes', id: 'note-a' },
    { source: 'messages', id: 'message-b' },
    { source: 'notes', id: 'missing' },
  ],
});
assert.deepEqual(read.items.map((item) => item.id), ['note-a', 'message-b']);
assert.deepEqual(read.missing, [{ source: 'notes', id: 'missing' }]);
assert.equal(read.items[0].text, 'alpha body');

const aggregate = await registry.service.read({ refs: [{ source: 'notes', id: 'all' }] });
assert.deepEqual(
  aggregate.items.map((item) => item.id).sort(),
  ['note-a', 'note-b', 'note-c'],
  'the aggregate selector resolves to every item of that source',
);

/* ------------------------------------------------------------------ *
 * Registration lifecycle
 * ------------------------------------------------------------------ */

const disposers = [];
const provided = [];
const ctx = {
  effect(callback) {
    const dispose = callback();
    if (typeof dispose === 'function') disposers.push(dispose);
    return dispose;
  },
  provide(name, value) {
    provided.push(name);
    return () => provided.splice(provided.indexOf(name), 1);
  },
  get() {
    throw new Error('no service');
  },
};
plugin.apply(ctx);
assert.ok(provided.includes('resource'), 'the registry is offered as the resource service');
assert.equal(typeof windowShim.__dshResourceSink, 'function', 'a late provider can register');

const late = { source: 'late', search: async () => ({ items: [] }) };
const dispose = windowShim.__dshResourceSink(late);
assert.ok(dispose, 'the sink returns a disposer');

for (const disposeEffect of disposers) disposeEffect();
assert.equal(windowShim.__dshResourceSink, undefined, 'the sink is removed on unload');

/* A queued provider is drained when the registry loads. */
const queuedWindow = { __ModuleLoader__: { load(options) { loaded = options; } } };
loaded = null;
new Function('window', source)(queuedWindow);
const queuedPlugin = loaded.factory(() => {
  throw new Error('the resource API must not require a browser package');
});
queuedWindow.__dshResourceQueue = [
  {
    source: 'queued',
    async search() {
      return { items: [{ id: 'q1', title: 'Queued', updatedAt: 1 }] };
    },
  },
];
const queuedCtx = {
  effect(callback) {
    const dispose = callback();
    if (typeof dispose === 'function') disposers.push(dispose);
    return dispose;
  },
  provide() {
    return () => undefined;
  },
  get() {
    throw new Error('no service');
  },
};
queuedPlugin.apply(queuedCtx);
assert.equal(queuedWindow.__dshResourceQueue.length, 0, 'the queue is drained');
const queuedService = queuedWindow.__dshResourceService;
assert.ok(queuedService, 'the service is published for consumers');
assert.deepEqual(
  queuedService.listProviders().map((provider) => provider.source),
  ['queued'],
);
const queuedResult = await queuedService.search({ query: '', limit: 5 });
assert.deepEqual(queuedResult.items.map((item) => item.id), ['q1']);
