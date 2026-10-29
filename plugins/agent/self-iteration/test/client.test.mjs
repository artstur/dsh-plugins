/**
 * Unit tests for the Self-driven Iteration Client half.
 *
 * The module is a browser artifact (`window.__ModuleLoader__.load`), so the
 * test loads it in a `node:vm` context behind a stub loader, rewrites the
 * in-file test seam to expose the pure helpers, and drives them without a DOM.
 * Rendering and the live Host HTTP API stay out of scope here.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const SEAM = '    const __TEST_SEAM__ = null;';

const TEST_EXPORTS = [
  'DICTS',
  'CHANGELOG',
  'VERSION',
  'buildAggregateNote',
  'buildAggregateNotePayload',
  'buildSelfDrivenEntry',
  'buildAction',
  'buildNoteReportBody',
  'stateFingerprint',
  'formatAtMinuteWithOffset',
  'formatNoteTime',
  'formatElapsed',
  'runNoteSync',
  'readSinks',
  'sinksAvailable',
  'resolveLang',
  'statusLabelKey',
  'groupOfStatus',
  'reasonKey',
  'describeReason',
  'listRequirements',
  'requirementKey',
  'escapeInline',
  'pendingSelfDrivenRequirements',
  'DEFAULT_SCAN_INTERVAL_MS',
  'SCAN_INTERVAL_CHOICES',
  'PANEL_DEFAULTS',
  'effectiveScanInterval',
  'scanIntervalOptionKey',
  'formatScanInterval',
];

async function loadClientApi() {
  let definition = null;
  const window = {
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  };
  let source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.ok(source.includes(SEAM), 'test seam should match the production module');
  source = source.replace(
    SEAM,
    '    window.__dshSelfIterationTest = { ' + TEST_EXPORTS.join(', ') + ' };\n' + SEAM,
  );
  const context = vm.createContext({
    window,
    console,
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
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  vm.runInContext(source, context, { filename: 'client.js' });
  assert.ok(definition, 'client module should register');
  assert.equal(definition.id, '@local/self-iteration');
  const plugin = definition.factory((name) => {
    assert.equal(name, 'react');
    return {
      createElement() {
        throw new Error('React.createElement must not run in unit tests');
      },
    };
  });
  assert.ok(plugin && typeof plugin.apply === 'function');
  assert.ok(window.__dshSelfIterationTest, 'test seam should be installed');
  return window.__dshSelfIterationTest;
}

/** Strip a value's vm realm so deepEqual compares plain JSON shapes. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Local +08:00 wall clock -> epoch ms. */
function localTime(day, hour, minute) {
  return Date.UTC(2026, 9, day, hour - 8, minute);
}

function createState() {
  return {
    version: 1,
    enabled: true,
    autoIterate: true,
    dryRun: false,
    agentPreset: 'cordis',
    running: {
      requirementId: 'req-running',
      sessionId: 'session-123',
      startedAt: localTime(29, 21, 20),
    },
    requirements: [
      {
        id: 'req-running',
        title: '点击图片无法放大',
        text: '在消息里点图片没有反应，希望能放大看。',
        contact: { id: 'contact-q', name: '问号' },
        messageId: 'msg-1',
        receivedAt: localTime(28, 23, 13),
        detectedAt: localTime(28, 23, 14),
        status: 'running',
        sessionId: 'session-123',
        startedAt: localTime(29, 21, 20),
      },
      {
        id: 'req-done',
        title: '点击图片无法放大',
        text: '点消息里的图片应该能预览大图。',
        contact: { id: 'contact-q', name: '问号' },
        messageId: 'msg-1',
        receivedAt: localTime(28, 23, 13),
        detectedAt: localTime(28, 23, 15),
        status: 'done',
        sessionId: 'session-123',
        startedAt: localTime(29, 21, 20),
        finishedAt: localTime(29, 21, 55),
        iteration: {
          pluginId: '@local/chat-room',
          pluginName: { zh: '消息', en: 'Messages' },
          version: '1.9.10',
          summary: {
            zh: '点击消息里的图片会打开灯箱预览，可缩放、可关闭',
            en: 'Clicking an image in a message opens a zoomable lightbox preview',
          },
          points: {
            zh: ['支持灯箱预览'],
            en: ['Adds a lightbox preview'],
          },
          agent: {
            id: 'session-123',
            preset: 'cordis',
            presetLabel: { zh: '创造模式', en: 'Creation mode' },
            provider: 'deepseek-account',
            model: 'deepseek-flash',
            label: { zh: '创造模式 · deepseek-flash', en: 'Creation mode · deepseek-flash' },
          },
          recordedAt: localTime(29, 21, 55),
          noteApplied: false,
        },
      },
      {
        id: 'req-pending',
        title: '支持深色主题',
        text: '希望深色模式下颜色更好看。',
        contact: { id: 'contact-lin', name: '小林' },
        messageId: 'msg-2',
        receivedAt: localTime(29, 9, 5),
        detectedAt: localTime(29, 9, 6),
        status: 'pending',
      },
      {
        id: 'req-pending-2',
        title: '支持导出笔记',
        text: '想把笔记导出成文件。',
        contact: { id: 'contact-lin', name: '小林' },
        messageId: 'msg-4',
        receivedAt: localTime(29, 10, 0),
        detectedAt: localTime(29, 10, 1),
        status: 'pending',
      },
      {
        id: 'req-skipped',
        title: '增加一个无关的按钮',
        text: '这个要求和插件迭代无关。',
        contact: { id: 'contact-ran', name: '阿然' },
        messageId: 'msg-3',
        receivedAt: localTime(29, 8, 0),
        detectedAt: localTime(29, 8, 1),
        status: 'skipped',
        reason: 'dismissed',
      },
    ],
    stats: {
      startedLastHour: 1,
      lastStartAt: localTime(29, 21, 20),
      lastScanAt: localTime(29, 21, 19),
      noteSync: null,
    },
  };
}

test('registers the browser module shape and ship metadata', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const api = await loadClientApi();
  // The descriptor's newest entry must describe the version in package.json.
  assert.equal(api.VERSION, manifest.version);
  assert.equal(api.CHANGELOG[0].version, manifest.version);
  assert.match(api.CHANGELOG[0].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+08:00$/);
  assert.equal(api.CHANGELOG[0].source, 'harness');
  assert.equal(api.CHANGELOG[0].points.zh.length, 4);
  assert.equal(api.CHANGELOG[0].points.en.length, 4);
  assert.equal(api.DICTS.zh['panel.label'], '自驱动迭代');
  assert.equal(api.DICTS.en['panel.label'], 'Self-driven Iteration');
});

test('zh/en dictionaries expose identical key sets', async () => {
  const api = await loadClientApi();
  assert.deepEqual(Object.keys(api.DICTS.zh).sort(), Object.keys(api.DICTS.en).sort());
});

test('timed-scan choices and labels match the settings strip', async () => {
  const api = await loadClientApi();
  assert.equal(api.DEFAULT_SCAN_INTERVAL_MS, 5000);
  assert.deepEqual(
    plain(api.SCAN_INTERVAL_CHOICES.map((choice) => choice.ms)),
    [0, 5000, 30000, 60000, 300000],
  );
  assert.deepEqual(
    plain(api.SCAN_INTERVAL_CHOICES.map((choice) => choice.labelKey)),
    ['intervalOff', 'interval5s', 'interval30s', 'interval1m', 'interval5m'],
  );

  assert.equal(api.formatScanInterval(0, 'zh'), '关闭');
  assert.equal(api.formatScanInterval(0, 'en'), 'Off');
  assert.equal(api.formatScanInterval(5000, 'zh'), '每 5 秒');
  assert.equal(api.formatScanInterval(5000, 'en'), 'Every 5s');
  assert.equal(api.formatScanInterval(30000, 'zh'), '每 30 秒');
  assert.equal(api.formatScanInterval(30000, 'en'), 'Every 30s');
  assert.equal(api.formatScanInterval(60000, 'zh'), '每 1 分钟');
  assert.equal(api.formatScanInterval(60000, 'en'), 'Every 1 min');
  assert.equal(api.formatScanInterval(300000, 'zh'), '每 5 分钟');
  assert.equal(api.formatScanInterval(300000, 'en'), 'Every 5 min');

  // Values the Host config allows outside the presets still render readably.
  assert.equal(api.formatScanInterval(10000, 'zh'), '每 10 秒');
  assert.equal(api.formatScanInterval(10000, 'en'), 'every 10s');
  assert.equal(api.formatScanInterval(120000, 'en'), 'every 2 min');
  assert.equal(api.formatScanInterval(1500, 'zh'), '每 1500 毫秒');
  // A Host predating `scanIntervalMs` falls back to the contract default.
  assert.equal(api.formatScanInterval(undefined, 'zh'), '每 5 秒');
  assert.equal(api.formatScanInterval(-1, 'en'), 'Every 5s');
});

test('panel defaults keep settings and the composer collapsed', async () => {
  const api = await loadClientApi();
  assert.deepEqual(plain(api.PANEL_DEFAULTS), {
    settingsOpen: false,
    composerOpen: false,
    scanIntervalMs: 5000,
  });
  assert.equal(api.effectiveScanInterval({ scanIntervalMs: 30000 }), 30000);
  assert.equal(api.effectiveScanInterval({ scanIntervalMs: 0 }), 0);
  assert.equal(api.effectiveScanInterval({}), 5000);
  assert.equal(api.effectiveScanInterval(null), 5000);
  assert.equal(api.effectiveScanInterval({ scanIntervalMs: -1 }), 5000);
  assert.equal(api.effectiveScanInterval({ scanIntervalMs: 'nope' }), 5000);
  assert.equal(api.scanIntervalOptionKey(60000), 'interval1m');
  assert.equal(api.scanIntervalOptionKey(0), 'intervalOff');
  assert.equal(api.scanIntervalOptionKey(1234), '');
});

test('builds the Chinese aggregate note for a mixed requirement set', async () => {
  const api = await loadClientApi();
  const body = api.buildAggregateNote(createState(), 'zh');

  assert.ok(body.startsWith('# 自驱动迭代需求\n\n> '), 'starts with the title and intro quote');
  assert.ok(body.endsWith('\n'), 'ends with a single newline');

  const order = ['## 进行中', '## 已完成', '## 待开始', '## 未采纳'].map((heading) => {
    const index = body.indexOf(heading);
    assert.ok(index >= 0, 'missing heading ' + heading);
    return index;
  });
  assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'group order follows the contract');

  // Running item carries the session id and the start time.
  assert.ok(body.includes('- **点击图片无法放大**（问号 · 2026-10-28 23:13）'));
  assert.ok(body.includes('  - 迭代中：session-123 · 2026-10-29 21:20 开始'));

  // Done item carries target plugin, version, recorded time and the Agent attribution.
  assert.ok(
    body.includes('  - 「消息」v1.9.10 · 2026-10-29 21:55 · 自驱动（创造模式 · deepseek-flash）'),
    body,
  );
  assert.ok(body.includes('  - 点击消息里的图片会打开灯箱预览，可缩放、可关闭'));

  // Queued items are newest first inside their group.
  assert.ok(body.includes('  - 已排队，等待上一次迭代结束'));
  const newer = body.indexOf('**支持导出笔记**');
  const older = body.indexOf('**支持深色主题**');
  assert.ok(newer >= 0 && older >= 0 && newer < older, 'queued group is newest first');

  // Not-adopted items explain why.
  assert.ok(body.includes('  - 原因：已忽略'));
  assert.ok(body.includes('**增加一个无关的按钮**（阿然 · 2026-10-29 08:00）'));
});

test('builds the English aggregate note with the same structure', async () => {
  const api = await loadClientApi();
  const body = api.buildAggregateNote(createState(), 'en');

  assert.ok(body.startsWith('# Self-driven iteration requests\n\n> '));
  for (const heading of ['## In progress', '## Done', '## Queued', '## Not adopted']) {
    assert.ok(body.includes(heading), 'missing heading ' + heading);
  }
  assert.ok(body.includes('- **点击图片无法放大**(问号 · 2026-10-28 23:13)'), 'contact and time stay verbatim');
  assert.ok(body.includes('  - In progress: session-123 · started 2026-10-29 21:20'));
  assert.ok(body.includes('  - "Messages" v1.9.10 · 2026-10-29 21:55 · Self-driven'));
  assert.ok(body.includes('  - Queued, waiting for the previous iteration to finish'));
  assert.ok(body.includes('  - Reason: Dismissed'));
});

test('empty state keeps only the title and the intro', async () => {
  const api = await loadClientApi();
  const zh = api.buildAggregateNote({ requirements: [] }, 'zh');
  const en = api.buildAggregateNote({ requirements: [] }, 'en');

  assert.equal(zh, '# 自驱动迭代需求\n\n' + api.DICTS.zh.aggregateIntro + '\n');
  assert.equal(en, '# Self-driven iteration requests\n\n' + api.DICTS.en.aggregateIntro + '\n');
  assert.ok(!zh.includes('## '), 'no empty groups are rendered');
  assert.ok(!en.includes('## '));
});

test('formats minute-precise +08:00 timestamps and elapsed times', async () => {
  const api = await loadClientApi();

  assert.equal(api.formatAtMinuteWithOffset(localTime(29, 21, 40)), '2026-10-29T21:40+08:00');
  assert.equal(api.formatAtMinuteWithOffset(new Date('2026-10-29T21:40:00+08:00')), '2026-10-29T21:40+08:00');
  assert.equal(api.formatAtMinuteWithOffset(0), '');
  assert.equal(api.formatAtMinuteWithOffset('not-a-date'), '');

  assert.equal(api.formatNoteTime(localTime(29, 21, 5)), '2026-10-29 21:05');
  assert.equal(api.formatNoteTime(undefined), '');

  assert.equal(api.formatElapsed(192000, 'zh'), '3 分 12 秒');
  assert.equal(api.formatElapsed(192000, 'en'), '3m 12s');
  assert.equal(api.formatElapsed(45000, 'zh'), '45 秒');
  assert.equal(api.formatElapsed(3720000, 'en'), '1h 2m');
});

test('keeps the plain 自驱动 attribution when the iteration has no Agent info', async () => {
  const api = await loadClientApi();
  const state = createState();
  const done = state.requirements.find((requirement) => requirement.id === 'req-done');
  delete done.iteration.agent;
  const body = api.buildAggregateNote(state, 'zh');
  assert.ok(body.includes('  - 「消息」v1.9.10 · 2026-10-29 21:55 · 自驱动'), body);
  assert.ok(!body.includes('自驱动（'), 'no parentheses without an Agent');
  assert.equal(api.buildSelfDrivenEntry(done, 'zh').agentName, '');
});

test('builds the append payload for the target plugin note', async () => {
  const api = await loadClientApi();
  const state = createState();
  const done = state.requirements.find((requirement) => requirement.id === 'req-done');
  const entry = api.buildSelfDrivenEntry(done, 'zh');

  assert.deepEqual(plain(entry), {
    pluginId: '@local/chat-room',
    pluginName: { zh: '消息', en: 'Messages' },
    version: '1.9.10',
    at: '2026-10-29T21:55+08:00',
    points: { zh: ['支持灯箱预览'], en: ['Adds a lightbox preview'] },
    agentName: '创造模式 · deepseek-flash',
    requirementId: 'req-done',
  });

  const english = api.buildSelfDrivenEntry(done, 'en');
  assert.equal(english.pluginName.en, 'Messages');
  assert.equal(english.at, '2026-10-29T21:55+08:00');
  assert.equal(english.agentName, 'Creation mode · deepseek-flash');
});

test('builds action and reportNote payloads', async () => {
  const api = await loadClientApi();

  assert.deepEqual(plain(api.buildAction('scan')), { action: 'scan' });
  assert.deepEqual(plain(api.buildAction('scanHistory', { hours: 24 })), { action: 'scanHistory', hours: 24 });
  assert.deepEqual(plain(api.buildAction('setAuto', { enabled: false })), { action: 'setAuto', enabled: false });
  assert.deepEqual(plain(api.buildAction('start', { id: 'req-1' })), { action: 'start', id: 'req-1' });
  assert.deepEqual(plain(api.buildAction('createFromText', { text: 'hi' })), { action: 'createFromText', text: 'hi' });
  assert.deepEqual(plain(api.buildAction('setScanInterval', { ms: 30000 })), { action: 'setScanInterval', ms: 30000 });
  assert.deepEqual(plain(api.buildAction('setScanInterval', { ms: 0 })), { action: 'setScanInterval', ms: 0 });

  const body = api.buildNoteReportBody({
    at: 1234,
    ok: true,
    aggregate: true,
    appliedIds: ['req-done', 7, ''],
  });
  assert.deepEqual(plain(body), {
    action: 'reportNote',
    report: { at: 1234, ok: true, aggregate: true, appliedIds: ['req-done'] },
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(body.report, 'error'));

  const failed = api.buildNoteReportBody({
    at: 2,
    ok: false,
    aggregate: false,
    appliedIds: [],
    error: 'notes-unavailable',
  });
  assert.deepEqual(plain(failed), {
    action: 'reportNote',
    report: { at: 2, ok: false, aggregate: false, appliedIds: [], error: 'notes-unavailable' },
  });
});

test('notes-panel missing: queues both products and reports notes-unavailable', async () => {
  const api = await loadClientApi();
  const state = createState();
  const host = {};

  const report = api.runNoteSync(state, 'zh', host);

  assert.equal(report.ok, false);
  assert.equal(report.error, 'notes-unavailable');
  assert.equal(report.aggregate, false);
  assert.deepEqual(plain(report.appliedIds), []);

  assert.equal(host.__dshManagedNoteQueue.length, 1);
  assert.equal(host.__dshManagedNoteQueue[0].key, 'self-iteration-requests');
  assert.equal(host.__dshManagedNoteQueue[0].title, '自驱动迭代需求');
  assert.ok(host.__dshManagedNoteQueue[0].body.includes('# 自驱动迭代需求'));

  // Only the requirement with an iteration that is not yet applied is queued.
  assert.equal(host.__dshSelfDrivenLogQueue.length, 1);
  assert.equal(host.__dshSelfDrivenLogQueue[0].pluginId, '@local/chat-room');
  assert.equal(host.__dshSelfDrivenLogQueue[0].at, '2026-10-29T21:55+08:00');
});

test('both sinks present: writes the aggregate note and one log per iteration', async () => {
  const api = await loadClientApi();
  const state = createState();
  const upserted = [];
  const appended = [];
  const host = {
    __dshManagedNoteSink: {
      upsert(note) {
        upserted.push(note);
        return { ok: true, status: 'updated' };
      },
    },
    __dshSelfDrivenLogSink: {
      append(entry) {
        appended.push(entry);
        return { ok: true, status: 'appended' };
      },
    },
  };

  const report = api.runNoteSync(state, 'zh', host);

  assert.equal(report.ok, true);
  assert.equal(report.aggregate, true);
  assert.deepEqual(plain(report.appliedIds), ['req-done']);
  assert.equal(upserted.length, 1);
  assert.equal(upserted[0].title, '自驱动迭代需求');
  assert.equal(appended.length, 1);
  assert.equal(appended[0].requirementId, 'req-done');
  assert.equal(host.__dshManagedNoteQueue, undefined);
  assert.equal(host.__dshSelfDrivenLogQueue, undefined);
});

test('an already-applied iteration is not appended again', async () => {
  const api = await loadClientApi();
  const state = createState();
  const done = state.requirements.find((requirement) => requirement.id === 'req-done');
  done.iteration.noteApplied = true;
  const appended = [];
  const host = {
    __dshManagedNoteSink: { upsert: () => ({ ok: true, status: 'current' }) },
    __dshSelfDrivenLogSink: { append: (entry) => { appended.push(entry); return { ok: true, status: 'current' }; } },
  };

  const report = api.runNoteSync(state, 'en', host);
  assert.equal(report.ok, true);
  assert.deepEqual(plain(report.appliedIds), []);
  assert.equal(appended.length, 0);
});

test('a failing sink is reported instead of thrown', async () => {
  const api = await loadClientApi();
  const state = createState();
  const host = {
    __dshManagedNoteSink: { upsert: () => ({ ok: false, error: 'storage-full' }) },
    __dshSelfDrivenLogSink: { append: () => ({ ok: false, error: 'nope' }) },
  };

  const report = api.runNoteSync(state, 'zh', host);
  assert.equal(report.ok, false);
  assert.equal(report.error, 'storage-full');
  assert.deepEqual(plain(report.appliedIds), []);
});

test('a throwing sink is reported instead of thrown', async () => {
  const api = await loadClientApi();
  const state = createState();
  const host = {
    __dshManagedNoteSink: {
      upsert() {
        throw new Error('kaboom');
      },
    },
    __dshSelfDrivenLogSink: {
      append() {
        throw new Error('kaboom');
      },
    },
  };

  const report = api.runNoteSync(state, 'zh', host);
  assert.equal(report.ok, false);
  assert.equal(report.error, 'kaboom');
});

test('fingerprint tracks requirements but ignores the stats the sync writes', async () => {
  const api = await loadClientApi();
  const state = createState();
  const base = api.stateFingerprint(state);

  const withStats = createState();
  withStats.stats.noteSync = { at: 1, ok: true, aggregate: true, appliedIds: ['req-done'] };
  assert.equal(api.stateFingerprint(withStats), base);

  const withNewStatus = createState();
  withNewStatus.requirements[4].status = 'pending';
  assert.notEqual(api.stateFingerprint(withNewStatus), base);

  const withApplied = createState();
  withApplied.requirements[1].iteration.noteApplied = true;
  assert.notEqual(api.stateFingerprint(withApplied), base);
});

test('status, reason and language helpers', async () => {
  const api = await loadClientApi();

  assert.equal(api.statusLabelKey('running'), 'statusRunning');
  assert.equal(api.statusLabelKey('done'), 'statusDone');
  assert.equal(api.statusLabelKey('unexpected'), 'statusPending');
  assert.equal(api.groupOfStatus('skipped'), 'notAdopted');
  assert.equal(api.groupOfStatus('failed'), 'notAdopted');
  assert.equal(api.groupOfStatus('pending'), 'queued');
  assert.equal(api.groupOfStatus('done'), 'done');
  assert.equal(api.groupOfStatus('running'), 'inProgress');

  assert.equal(api.reasonKey('dismissed'), 'reasonDismissed');
  assert.equal(api.reasonKey('timeout'), 'reasonTimeout');
  assert.equal(api.reasonKey('no-report'), 'reasonNoReport');
  assert.equal(api.reasonKey('other'), '');
  assert.equal(api.describeReason('dismissed', 'en'), 'Dismissed');
  assert.equal(api.describeReason('custom reason', 'zh'), 'custom reason');
  assert.equal(api.describeReason('', 'zh'), '未说明');

  assert.equal(api.resolveLang({ getSnapshot: () => ({ active: 'zh-Hans' }) }), 'zh');
  assert.equal(api.resolveLang({ getSnapshot: () => ({ active: 'zh-CN' }) }), 'zh');
  assert.equal(api.resolveLang({ getSnapshot: () => ({ active: 'en-US' }) }), 'en');
  assert.equal(api.resolveLang('zh'), 'zh');
  assert.equal(api.resolveLang(undefined), 'en');
  assert.equal(api.resolveLang({ getSnapshot() { throw new Error('no locale'); } }), 'en');

  const state = createState();
  assert.deepEqual(
    api.listRequirements(state).map((requirement) => requirement.id),
    ['req-pending-2', 'req-pending', 'req-skipped', 'req-done', 'req-running'],
    'requirements are newest first',
  );
  assert.deepEqual(
    api.pendingSelfDrivenRequirements(state).map((requirement) => requirement.id),
    ['req-done'],
  );
});

test('inline text escaping keeps markdown structure intact', async () => {
  const api = await loadClientApi();
  assert.equal(api.escapeInline('a **b**\nc'), 'a \\*\\*b\\*\\* c');
  assert.equal(api.escapeInline('[link](x)'), '\\[link\\](x)');
  assert.equal(api.escapeInline(null), '');
});
