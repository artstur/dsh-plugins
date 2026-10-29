import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';

const EXTRAS_KEY = 'dsh.notes.plugin-log-extras.v1';
const MANAGED_KEY = 'dsh.notes.managed-notes.v1';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** One in-memory localStorage shared by several loads, to model a reload. */
function createStorage(seed) {
  const map = new Map(seed ? Object.entries(seed) : []);
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

async function loadNotesApi(storage) {
  const memory = storage || createStorage();
  let definition = null;
  const window = {
    localStorage: {
      getItem(key) {
        return memory.getItem(key);
      },
      setItem(key, value) {
        memory.setItem(key, value);
      },
      removeItem(key) {
        memory.removeItem(key);
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
    `    window.__dshNotesSelfDrivenTest = {
      normalizeSource,
      changelogAuthor,
      changelogSection,
      normalizeDescriptor,
      appendSelfDrivenEntry,
      upsertManagedNote,
      registerPluginVersionLog,
      syncStoredPluginLogs,
      drainSelfDrivenLogQueue,
      drainManagedNoteQueue,
      loadSelfDrivenLogs,
      loadManagedNotes,
      loadPluginLogs,
      loadState,
      reapplyManagedNotes,
      setLang: (lang) => {
        currentLang = lang;
      },
      getStore: () => store,
      storageKeys: {
        notes: STORAGE_KEY,
        logs: PLUGIN_LOG_STORAGE_KEY,
        extras: SELF_DRIVEN_LOG_STORAGE_KEY,
        managed: MANAGED_NOTES_STORAGE_KEY,
      },
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
  return { api: window.__dshNotesSelfDrivenTest, window, storage: memory };
}

const DEMO = {
  pluginId: '@local/demo',
  pluginName: { zh: '演示', en: 'Demo' },
  noteTitle: { zh: '演示版本记录', en: 'Demo version log' },
};

function findNote(api, system) {
  return api.getStore().getSnapshot().notes.find((note) => note.system === system) || null;
}

test('maps every self-driven label and renders 自驱动 / Self-driven', async () => {
  const { api } = await loadNotesApi();
  for (const label of ['self-driven', 'selfdriven', 'self_driven', 'SELF-DRIVEN', '自驱动']) {
    assert.deepEqual(plain(api.normalizeSource(label)), { source: 'self-driven' }, label);
  }
  assert.equal(api.changelogAuthor({ source: 'self-driven' }, 'zh'), '自驱动');
  assert.equal(api.changelogAuthor({ source: 'self-driven' }, 'en'), 'Self-driven');

  const entry = {
    version: '1.9.10',
    at: '2026-10-29T21:40+08:00',
    source: 'self-driven',
    points: { zh: ['新增：灯箱预览'], en: ['New: lightbox preview'] },
  };
  assert.equal(
    api.changelogSection(entry, 'zh'),
    '## v1.9.10 · 2026-10-29 21:40 +08:00 · 自驱动\n- 新增：灯箱预览',
  );
  assert.ok(
    api
      .changelogSection(entry, 'en')
      .startsWith('## v1.9.10 · 2026-10-29 21:40 +08:00 · Self-driven'),
  );

  // A plugin descriptor may also declare the source directly.
  const descriptor = api.normalizeDescriptor({
    id: '@local/demo',
    title: { zh: '演示', en: 'Demo' },
    entries: [
      { version: '1.0.0', at: '2026-10-29T21:40+08:00', source: '自驱动', points: { zh: ['x'], en: ['x'] } },
    ],
  });
  assert.equal(descriptor.entries[0].source, 'self-driven');
});

test('append creates the target version-log note with the hint title', async () => {
  const { api, storage } = await loadNotesApi();
  api.setLang('zh');
  const result = api.appendSelfDrivenEntry(
    Object.assign({}, DEMO, {
      version: '1.9.10',
      at: '2026-10-29T21:40+08:00',
      points: { zh: ['新增：灯箱预览'], en: ['New: lightbox preview'] },
      requirementId: 'req-1',
    }),
  );
  assert.deepEqual(plain(result), { ok: true, status: 'created' });

  const note = findNote(api, 'plugin-version-log:@local/demo');
  assert.ok(note, 'the note should be created');
  assert.equal(note.title, '演示版本记录');
  assert.ok(note.body.indexOf('# 演示版本记录') === 0, note.body);
  assert.ok(note.body.includes('## v1.9.10 · 2026-10-29 21:40 +08:00 · 自驱动'), note.body);
  assert.ok(note.body.includes('- 新增：灯箱预览'), note.body);

  const extras = JSON.parse(storage.getItem(EXTRAS_KEY));
  assert.equal(extras.version, 1);
  const record = extras.entries['@local/demo'];
  assert.equal(record.entries.length, 1);
  assert.equal(record.entries[0].source, 'self-driven');
  assert.equal(record.entries[0].requirementId, 'req-1');

  // Without a noteTitle hint the generated title falls back to the plugin name.
  const fallback = api.appendSelfDrivenEntry({
    pluginId: '@local/second',
    pluginName: { zh: '第二个', en: 'Second' },
    version: '1.0.0',
    at: '2026-10-29T21:41+08:00',
    points: { zh: ['首个版本'], en: ['First release'] },
  });
  assert.deepEqual(plain(fallback), { ok: true, status: 'created' });
  const second = findNote(api, 'plugin-version-log:@local/second');
  assert.ok(second.title.startsWith('第二个'), second.title);
  assert.ok(second.title.endsWith('版本记录'), second.title);
});

test('extras merge idempotently by version and keep the newest entry first', async () => {
  const { api, storage } = await loadNotesApi();
  api.setLang('zh');
  const make = (version, at, zh, en) =>
    Object.assign({}, DEMO, { version, at, points: { zh: [zh], en: [en] } });

  const first = api.appendSelfDrivenEntry(
    make('1.0.0', '2026-10-29T20:00+08:00', '首个版本', 'First release'),
  );
  assert.deepEqual(plain(first), { ok: true, status: 'created' });
  const noteId = findNote(api, 'plugin-version-log:@local/demo').id;

  const again = api.appendSelfDrivenEntry(
    make('1.0.0', '2026-10-29T20:00+08:00', '首个版本', 'First release'),
  );
  assert.deepEqual(plain(again), { ok: true, status: 'current' });

  const newer = api.appendSelfDrivenEntry(
    make('1.1.0', '2026-10-29T20:30+08:00', '第二个版本', 'Second release'),
  );
  assert.deepEqual(plain(newer), { ok: true, status: 'appended' });

  const notes = api.getStore().getSnapshot().notes;
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, noteId);
  const body = notes[0].body;
  assert.equal((body.match(/^## v1\.1\.0/gm) || []).length, 1);
  assert.equal((body.match(/^## v1\.0\.0/gm) || []).length, 1);
  assert.ok(body.indexOf('## v1.1.0') < body.indexOf('## v1.0.0'), body);

  const extras = JSON.parse(storage.getItem(EXTRAS_KEY)).entries['@local/demo'];
  assert.deepEqual(plain(extras.entries.map((entry) => entry.version)), ['1.1.0', '1.0.0']);
});

test('a target plugin descriptor registration and a Notes reload keep the self-driven entry', async () => {
  const storage = createStorage();
  const first = await loadNotesApi(storage);
  first.api.setLang('zh');
  const appended = first.api.appendSelfDrivenEntry(
    Object.assign({}, DEMO, {
      version: '2.0.0',
      at: '2026-10-29T21:40+08:00',
      points: { zh: ['自驱动新增：灯箱'], en: ['Self-driven: lightbox'] },
    }),
  );
  assert.deepEqual(plain(appended), { ok: true, status: 'created' });

  // The plugin registers its own descriptor afterwards, with the same version
  // as an own release and a newer one. The 自驱动 entry must not be lost and
  // the same version must not be duplicated.
  const registered = first.api.registerPluginVersionLog({
    id: '@local/demo',
    title: { zh: '演示', en: 'Demo' },
    noteTitle: { zh: '演示版本记录', en: 'Demo version log' },
    version: '2.1.0',
    entries: [
      {
        version: '2.1.0',
        at: '2026-10-29T21:50+08:00',
        source: 'harness',
        points: { zh: ['插件后续版本'], en: ['Later release'] },
      },
      {
        version: '2.0.0',
        at: '2026-10-29T21:40+08:00',
        source: 'harness',
        points: { zh: ['插件发布 2.0.0'], en: ['Release 2.0.0'] },
      },
    ],
  });
  assert.equal(registered, true);

  let note = findNote(first.api, 'plugin-version-log:@local/demo');
  assert.equal((note.body.match(/^## v2\.0\.0/gm) || []).length, 1, note.body);
  assert.ok(note.body.includes('## v2.0.0 · 2026-10-29 21:40 +08:00 · 自驱动'), note.body);
  assert.ok(note.body.includes('## v2.1.0 · 2026-10-29 21:50 +08:00 · DeepSeek Harness'), note.body);
  assert.ok(note.body.indexOf('## v2.1.0') < note.body.indexOf('## v2.0.0'), note.body);

  // A Notes reload re-syncs from the cached registry; the extras store must
  // re-apply the 自驱动 attribution to the same version.
  const second = await loadNotesApi(storage);
  second.api.setLang('zh');
  second.api.syncStoredPluginLogs();
  note = findNote(second.api, 'plugin-version-log:@local/demo');
  assert.ok(note, 'the note should survive the reload');
  assert.equal((note.body.match(/^## v2\.0\.0/gm) || []).length, 1, note.body);
  assert.ok(note.body.includes('## v2.0.0 · 2026-10-29 21:40 +08:00 · 自驱动'), note.body);
  assert.ok(note.body.includes('## v2.1.0 · 2026-10-29 21:50 +08:00 · DeepSeek Harness'), note.body);
  const extras = second.api.loadSelfDrivenLogs();
  assert.deepEqual(plain(extras['@local/demo'].entries.map((entry) => entry.version)), ['2.0.0']);
});

test('managed-note upsert creates, updates, stays unselected, and survives reload', async () => {
  const storage = createStorage();
  const first = await loadNotesApi(storage);
  const system = 'managed-note:self-iteration-requests';

  const created = first.api.upsertManagedNote({
    key: 'self-iteration-requests',
    title: '自驱动迭代需求',
    body: '# 自驱动迭代需求\n\n- 待开始',
  });
  assert.deepEqual(plain(created), { ok: true, status: 'created' });
  let snapshot = first.api.getStore().getSnapshot();
  assert.equal(snapshot.notes.length, 1);
  assert.equal(snapshot.notes[0].system, system);
  assert.equal(snapshot.notes[0].title, '自驱动迭代需求');
  // Creating a managed note never focuses it.
  assert.equal(snapshot.selectedId, null);
  const noteId = snapshot.notes[0].id;

  const current = first.api.upsertManagedNote({
    key: 'self-iteration-requests',
    title: '自驱动迭代需求',
    body: '# 自驱动迭代需求\n\n- 待开始',
  });
  assert.deepEqual(plain(current), { ok: true, status: 'current' });

  const updated = first.api.upsertManagedNote({
    key: 'self-iteration-requests',
    title: '自驱动迭代需求（更新）',
    body: '# 自驱动迭代需求\n\n- 进行中',
  });
  assert.deepEqual(plain(updated), { ok: true, status: 'updated' });
  snapshot = first.api.getStore().getSnapshot();
  assert.equal(snapshot.notes.length, 1, 'upsert must update in place');
  assert.equal(snapshot.notes[0].id, noteId);
  assert.equal(snapshot.notes[0].title, '自驱动迭代需求（更新）');
  assert.ok(snapshot.notes[0].body.includes('进行中'));

  const registry = JSON.parse(storage.getItem(MANAGED_KEY));
  assert.equal(registry.version, 1);
  assert.ok(registry.notes['self-iteration-requests'].body.includes('进行中'));

  // The user deletes the note; the next load recreates it from the registry,
  // which is what makes the "自动维护 / auto-maintained" marker useful.
  first.api.getStore().deleteNote(noteId);
  first.api.getStore().flush();
  assert.equal(first.api.getStore().getSnapshot().notes.length, 0);

  const second = await loadNotesApi(storage);
  const recreated = second.api.getStore().getSnapshot().notes;
  assert.equal(recreated.length, 1);
  assert.equal(recreated[0].system, system);
  assert.equal(recreated[0].title, '自驱动迭代需求（更新）');
  assert.ok(recreated[0].body.includes('进行中'));
  assert.equal(second.api.getStore().getSnapshot().selectedId, null);
});

test('queues filled before Notes loaded are drained without throwing', async () => {
  const { api, window } = await loadNotesApi();
  api.setLang('zh');
  window.__dshSelfDrivenLogQueue = [
    Object.assign({}, DEMO, {
      version: '3.0.0',
      at: '2026-10-29T21:42+08:00',
      points: { zh: ['排队版本'], en: ['Queued release'] },
    }),
  ];
  window.__dshManagedNoteQueue = [
    { key: 'self-driven-queue', title: '排队笔记', body: '# 排队笔记\n\n正文' },
  ];

  assert.deepEqual(plain(api.drainSelfDrivenLogQueue()), [{ ok: true, status: 'created' }]);
  assert.ok(findNote(api, 'plugin-version-log:@local/demo'), 'queued release should create the note');

  assert.deepEqual(plain(api.drainManagedNoteQueue()), [{ ok: true, status: 'created' }]);
  const managed = findNote(api, 'managed-note:self-driven-queue');
  assert.ok(managed, 'queued managed note should be created');
  assert.ok(managed.body.includes('正文'));
  assert.notEqual(api.getStore().getSnapshot().selectedId, managed.id);

  // An invalid queued entry is reported, not thrown.
  window.__dshSelfDrivenLogQueue = [null];
  assert.deepEqual(plain(api.drainSelfDrivenLogQueue()), [
    { ok: false, error: 'invalid-entry' },
  ]);
});
