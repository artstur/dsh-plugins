import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';

const STORAGE_KEY = 'dsh.notes.v1';

const DICT = {
  untitled: 'Untitled',
  noContent: 'No content',
  imageCount: 'images',
};

function t(key) {
  return DICT[key] || key;
}

/** Values built inside the vm carry that realm's prototypes, so compare data. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadProviderApi(notes) {
  const storage = new Map();
  if (notes) storage.set(STORAGE_KEY, JSON.stringify({ notes, selectedId: null }));
  let definition = null;
  const window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  };
  let source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  const seam = '    const store = createNotesStore();';
  assert.ok(source.includes(seam), 'test seam should match the production module');
  source = source.replace(
    seam,
    `    window.__dshNotesProviderTest = {
      createNotesResourceProvider,
      loadState,
      storageKey: STORAGE_KEY,
    };
${seam}`,
  );
  const context = vm.createContext({
    window,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    crypto: globalThis.crypto,
    navigator: {},
    document: {},
    console,
    setTimeout,
    clearTimeout,
    Date,
    Intl,
    Math,
    Set,
    Map,
    JSON,
    Object,
    Array,
    String,
    Number,
    RegExp,
    Error,
  });
  vm.runInContext(source, context, { filename: 'client.js' });
  assert.ok(definition, 'client module should register');
  definition.factory((name) => {
    assert.equal(name, 'react');
    return { createElement() {} };
  });
  return { api: window.__dshNotesProviderTest, storage };
}

const NOTES = [
  {
    id: 'note-old',
    title: 'Older note',
    body: 'first body about Pandas',
    createdAt: 1000,
    updatedAt: 1000,
    images: [],
  },
  {
    id: 'note-new',
    title: 'Newer note',
    body: 'second body about pandas',
    createdAt: 2000,
    updatedAt: 5000,
    images: [],
  },
  {
    id: 'note-log',
    title: 'Notes plugin version log',
    body: 'auto maintained body',
    createdAt: 3000,
    updatedAt: 6000,
    system: 'plugin-version-log:@local/notes-panel',
    images: [],
  },
];

test('the provider searches the notes the plugin stores, newest first', async () => {
  const { api } = await loadProviderApi(NOTES);
  const provider = api.createNotesResourceProvider(t);

  assert.equal(provider.source, 'notes');
  assert.deepEqual(plain(provider.title), { zh: '笔记', en: 'Notes' });
  assert.equal(provider.kind, 'document');
  assert.equal(provider.icon, 'file');
  assert.deepEqual(plain(provider.aliases), ['笔记', 'note', 'notes', 'notebook']);

  const all = await provider.search({ query: '', timeRange: null, offset: 0, limit: 20 });
  assert.equal(all.total, 3);
  assert.deepEqual(
    plain(all.items.map((item) => item.id)),
    ['note-log', 'note-new', 'note-old'],
  );

  // The query is matched case-insensitively against title and body.
  const match = await provider.search({ query: 'PANDAS', timeRange: null, offset: 0, limit: 20 });
  assert.equal(match.total, 2);
  assert.deepEqual(
    plain(match.items.map((item) => item.id)),
    ['note-new', 'note-old'],
  );

  // The title falls back to a trimmed body preview.
  const untitled = await provider.search({ query: 'untitled', timeRange: null, offset: 0, limit: 20 });
  assert.equal(untitled.total, 0);

  // The time range is applied to updatedAt.
  const ranged = await provider.search({
    query: '',
    timeRange: { from: 2000, to: 5000 },
    offset: 0,
    limit: 20,
  });
  assert.deepEqual(
    plain(ranged.items.map((item) => item.id)),
    ['note-new'],
  );
  assert.equal(ranged.total, 1);

  // offset/limit slice the newest-first order.
  const page = await provider.search({ query: '', timeRange: null, offset: 1, limit: 1 });
  assert.equal(page.total, 3);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, 'note-new');

  const item = page.items[0];
  assert.equal(item.title, 'Newer note');
  assert.equal(item.snippet, 'second body about pandas');
  assert.equal(item.updatedAt, 5000);
  assert.equal(item.createdAt, 2000);
  assert.deepEqual(plain(item.meta), { images: [] });
});

test('reading a note returns its body, and "all" returns every note', async () => {
  const { api } = await loadProviderApi(NOTES);
  const provider = api.createNotesResourceProvider(t);

  const one = await provider.read({ ids: ['note-new'] });
  assert.equal(one.items.length, 1);
  assert.equal(one.items[0].id, 'note-new');
  assert.equal(one.items[0].title, 'Newer note');
  assert.equal(one.items[0].text, 'second body about pandas');
  assert.equal(one.items[0].itemType, 'note');
  assert.equal(one.items[0].updatedAt, 5000);
  assert.equal(one.items[0].createdAt, 2000);
  assert.equal(one.items[0].attributes.updated_at, new Date(5000).toISOString());
  assert.deepEqual(plain(one.items[0].meta), { images: [] });

  const every = await provider.read({ ids: ['all'] });
  assert.equal(every.items.length, 3);
  assert.deepEqual(
    plain(every.items.map((entry) => entry.id)),
    ['note-log', 'note-new', 'note-old'],
  );

  const missing = await provider.read({ ids: ['nope'] });
  assert.deepEqual(plain(missing.items), []);
});

test('the provider describes itself for a consumer', async () => {
  const { api } = await loadProviderApi(NOTES);
  const provider = api.createNotesResourceProvider(t);

  assert.equal(await provider.describe('zh-CN'), '3 篇笔记');
  assert.equal(await provider.describe('en'), '3 notes');
  assert.equal(await provider.describe(undefined), '3 notes');

  const { api: emptyApi } = await loadProviderApi([]);
  const empty = emptyApi.createNotesResourceProvider(t);
  assert.equal(await empty.describe('en'), '0 notes');
});

test('the provider reads the store the plugin itself writes', async () => {
  const { api, storage } = await loadProviderApi(null);
  assert.deepEqual(plain(api.loadState().notes), []);

  storage.set(
    api.storageKey,
    JSON.stringify({
      notes: [{ id: 'n-1', title: 'Stored', body: 'body', createdAt: 1, updatedAt: 2 }],
      selectedId: 'n-1',
    }),
  );
  const provider = api.createNotesResourceProvider(t);
  const result = await provider.search({ query: 'stored', timeRange: null, offset: 0, limit: 20 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, 'n-1');
});
