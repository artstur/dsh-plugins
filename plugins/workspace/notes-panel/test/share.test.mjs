import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';

async function loadShareApi() {
  const storage = new Map();
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
    `    window.__dshNotesShareTest = {
      createSharePayload,
      encodeSharePayload,
      createShareCode,
      parseShareCode,
      createNotesStore,
      normalizeNote,
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
  return { api: window.__dshNotesShareTest, storage };
}

test('share code round-trips Unicode text, sender, and images', async () => {
  const { api } = await loadShareApi();
  const note = {
    id: 'source-note',
    title: '面聊 takeaway',
    body: '一句中文\nAnd one English line.',
    system: 'plugin-version-log:test',
    images: [
      {
        id: 'local-image-id',
        dataUrl: 'data:image/png;base64,AA==',
        width: 24,
        height: 12,
        addedAt: 123,
      },
    ],
  };

  const parsed = api.parseShareCode(api.createShareCode(note, 'Celia'));
  assert.equal(parsed.schema, 'dsh-note-share');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.sourceNoteId, 'source-note');
  assert.equal(parsed.senderName, 'Celia');
  assert.equal(parsed.title, note.title);
  assert.equal(parsed.body, note.body);
  assert.equal(parsed.images.length, 1);
  assert.equal(parsed.images[0].dataUrl, note.images[0].dataUrl);
  assert.equal('system' in parsed, false, 'runtime-owned system markers must not travel');
});

test('import keeps provenance, creates an ordinary note, and deduplicates by snapshot', async () => {
  const { api } = await loadShareApi();
  const payload = api.createSharePayload(
    { id: 'origin', title: 'Shared', body: 'Body', images: [], system: 'internal' },
    'Sender',
  );
  const store = api.createNotesStore();

  const first = store.importSharedNote(payload);
  assert.equal(first.status, 'ok');
  assert.equal(store.flush(), true);
  const imported = store.getSnapshot().notes[0];
  assert.equal(imported.title, 'Shared');
  assert.equal(imported.sharedFrom.shareId, payload.shareId);
  assert.equal(imported.sharedFrom.sourceNoteId, 'origin');
  assert.equal(imported.sharedFrom.senderName, 'Sender');
  assert.equal('system' in imported, false);

  const second = store.importSharedNote(payload);
  assert.equal(second.status, 'duplicate');
  assert.equal(second.id, first.id);
  assert.equal(store.getSnapshot().notes.length, 1);
  store.flush();
});

test('parser rejects malformed and unsupported sharing codes', async () => {
  const { api } = await loadShareApi();
  assert.throws(() => api.parseShareCode('not-a-share-code'), /invalid/);

  const unsupported = api.encodeSharePayload({
    schema: 'dsh-note-share',
    version: 2,
    shareId: 'future',
    title: '',
    body: '',
    images: [],
  });
  assert.throws(
    () => api.parseShareCode(unsupported),
    (error) => error && error.code === 'unsupported',
  );
});
