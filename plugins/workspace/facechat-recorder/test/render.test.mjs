/**
 * Headless render smoke test for the recorder page.
 *
 * A tiny React-compatible renderer walks the element tree produced by the real
 * `FacechatPanel` component in three states (idle + model setup, recording with
 * speaker-labelled lines, and a saved recording with export controls). This is
 * not a visual test: it catches render-time reference errors and missing labels
 * without a browser.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

/* --- Mini React runtime ------------------------------------------------- */

let currentHooks = null;
const activeCleanups = [];

function createElement(type, props, ...children) {
  const merged = Object.assign({}, props || {});
  if (children.length === 1) merged.children = children[0];
  else if (children.length > 1) merged.children = children;
  if (typeof type === 'function') return renderComponent(type, merged);
  return { type, props: merged };
}

function renderComponent(type, props) {
  const parent = currentHooks;
  const hooks = { states: [], refs: [], effects: [], index: 0 };
  currentHooks = hooks;
  let output;
  try {
    output = type(props);
  } finally {
    currentHooks = parent;
  }
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (typeof cleanup === 'function') activeCleanups.push(cleanup);
  }
  return output;
}

function useState(initial) {
  const hooks = currentHooks;
  const index = hooks.index++;
  if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
  return [hooks.states[index], () => {}];
}

function useRef(initial) {
  const hooks = currentHooks;
  const index = hooks.index++;
  if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
  return hooks.refs[index];
}

function useEffect(effect) {
  const hooks = currentHooks;
  hooks.index++;
  hooks.effects.push(effect);
}

const ReactStub = {
  createElement,
  useState,
  useEffect,
  useLayoutEffect: useEffect,
  useRef,
  Fragment: 'Fragment',
};

// The glossary dialog installs an Escape listener; no real DOM is needed.
globalThis.document = globalThis.document || {
  addEventListener() {},
  removeEventListener() {},
};

let loaded = null;
new Function('window', source)({ __DSH_FACECHAT_TEST__: true, __ModuleLoader__: { load(options) { loaded = options; } } });
const plugin = loaded.factory((name) => {
  if (name === 'react') return ReactStub;
  throw new Error('unexpected require: ' + name);
});
const { FacechatPanel, buildMarkdown, buildIdentitySummary, SummaryView, GlossaryDialog } = plugin.__ui;

/* --- Fakes -------------------------------------------------------------- */

const t = (key, params) => (params ? key + ':' + JSON.stringify(params) : key);
const localeFace = {
  getSnapshot: () => ({ active: 'zh', locales: [] }),
  subscribe: () => () => {},
};

function makeSpeechSnap(overrides = {}) {
  return Object.assign(
    {
      available: true,
      connected: true,
      error: null,
      catalog: {
        maxAudioBytes: 4194304,
        maxDurationSeconds: 120,
        providers: [
          {
            id: 'sensevoice-local',
            name: 'SenseVoice',
            location: 'host-local',
            languages: ['auto', 'zh', 'en'],
            preparation: { phase: 'ready' },
            downloadSources: ['https://huggingface.co', 'https://hf-mirror.com'],
            setupEstimate: { recommendedDiskBytes: 2.2e9, expectedMemoryBytes: 1.2e9, minimumMinutes: 2, maximumMinutes: 8 },
          },
        ],
        selection: { providerId: 'sensevoice-local', language: 'auto' },
      },
    },
    overrides,
  );
}

const speech = {
  snap: makeSpeechSnap(),
  getSnapshot() {
    return this.snap;
  },
  subscribe() {
    return () => {};
  },
  async prepare() {
    return { ok: true };
  },
  async cancelPreparation() {
    return { ok: true };
  },
  async configure() {
    return { ok: true };
  },
};

const baseState = {
  view: 'idle',
  phase: 'idle',
  error: null,
  notice: null,
  startedAt: 0,
  durationMs: 0,
  language: 'auto',
  title: '',
  lines: [],
  speakers: [],
  interim: null,
  review: null,
  selectedId: null,
  audioUrl: null,
  audioMime: '',
  audioSessionId: null,
  recoveredDraft: null,
};

const engine = {
  state: Object.assign({}, baseState),
  getSnapshot() {
    return this.state;
  },
  subscribe(listener) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  },
  start() {},
  stop() {},
  dispose() {},
  getElapsedMs() {
    return 0;
  },
  getLevel() {
    return 0;
  },
  selectSession() {},
  closeReview() {},
  renameSpeaker() {},
  addSpeaker() {
    return 0;
  },
  reassignLine() {},
  updateTitle() {},
  deleteSession() {
    return { ok: true };
  },
  recoverDraft() {},
  discardDraft() {},
  speakerName() {
    return '';
  },
};

const history = {
  state: { sessions: [], error: null },
  getSnapshot() {
    return this.state;
  },
  subscribe() {
    return () => {};
  },
};

const glossary = {
  state: { userText: '', enabled: true, defaults: [{ term: 'GitHub', aliases: ['get up', 'githh'] }] },
  getSnapshot() {
    return this.state;
  },
  subscribe() {
    return () => {};
  },
  setUserText(text) {
    this.state = Object.assign({}, this.state, { userText: text });
  },
  setEnabled(enabled) {
    this.state = Object.assign({}, this.state, { enabled });
  },
  refine(text) {
    return text;
  },
};

function render(state, speechSnap = makeSpeechSnap(), sessionList = []) {
  engine.state = Object.assign({}, baseState, state);
  speech.snap = speechSnap;
  history.state = { sessions: sessionList, error: null };
  return renderComponent(FacechatPanel, { t, locale: localeFace, engine, speech, history, glossary });
}

function collectText(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (node && node.props) collectText(node.props.children, out);
  return out;
}

function findClass(node, className, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) findClass(child, className, out);
    return out;
  }
  const classes = node.props && typeof node.props.className === 'string' ? node.props.className.split(/\s+/) : [];
  if (classes.indexOf(className) >= 0) out.push(node);
  findClass(node.props && node.props.children, className, out);
  return out;
}

/* --- 1. Idle page with an unprepared model ------------------------------ */

const idle = render(
  {},
  makeSpeechSnap({
    catalog: Object.assign({}, makeSpeechSnap().catalog, {
      providers: [
        Object.assign({}, makeSpeechSnap().catalog.providers[0], {
          preparation: { phase: 'unprepared' },
        }),
      ],
    }),
  }),
);
const idleText = collectText(idle).join('|');
assert.ok(idleText.includes('emptyTitle'), 'idle hero title');
assert.ok(idleText.includes('start'), 'idle start action');
assert.ok(idleText.includes('modelNotReady'), 'model setup banner');
assert.ok(idleText.includes('prepare'), 'prepare action');
assert.ok(findClass(idle, 'dsh-facechat-root').length === 1, 'page root');
ok('idle page + model preparation banner render');

/* --- 2. Recording page with speaker-labelled lines ---------------------- */

const lines = [
  { id: 'l1', speaker: 0, text: '你好，我们开始吧。', status: 'final', startMs: 1200, endMs: 3600, durationMs: 2400 },
  { id: 'l2', speaker: 1, text: '好的，今天聊一下项目进度。', status: 'final', startMs: 4200, endMs: 7600, durationMs: 3400 },
  { id: 'l3', speaker: 0, text: '正在识别的片段', status: 'pending', startMs: 8200, endMs: 9000, durationMs: 800 },
];
const recording = render({
  view: 'live',
  phase: 'recording',
  startedAt: Date.now() - 12000,
  lines,
  speakers: [{ name: '小林' }, { name: '阿珍' }],
  interim: { text: '这个方案', startMs: 10000, pending: false },
});
const recordingText = collectText(recording).join('|');
assert.ok(recordingText.includes('recording'), 'recording status');
assert.ok(recordingText.includes('你好，我们开始吧。'), 'final line text');
assert.ok(recordingText.includes('小林'), 'renamed speaker');
assert.ok(recordingText.includes('这个方案'), 'interim caption');
assert.ok(recordingText.includes('interimPending'), 'pending line placeholder');
assert.ok(findClass(recording, 'dsh-facechat-chip').length >= 3, 'speaker chips render');
assert.ok(findClass(recording, 'dsh-facechat-menu').length === 0, 'speaker menu closed by default');
ok('recording page renders lines, renamed speakers and the interim caption');

/* --- 3. Saved recording with export controls and closed menu ------------ */

const saved = {
  id: 's1',
  title: '产品周会',
  createdAt: Date.now() - 3600000,
  durationMs: 754000,
  language: 'auto',
  speakers: [{ name: '小林' }, { name: '阿珍' }],
  lines: lines.filter((line) => line.status !== 'pending'),
};
const review = render(
  {
    view: 'review',
    phase: 'idle',
    review: saved,
    selectedId: 's1',
    durationMs: saved.durationMs,
    title: saved.title,
  },
  makeSpeechSnap(),
  [saved],
);
const reviewText = collectText(review).join('|');
assert.ok(reviewText.includes('产品周会'), 'saved title');
assert.ok(reviewText.includes('saved'), 'saved status');
assert.ok(reviewText.includes('exportCopy'), 'copy export');
assert.ok(reviewText.includes('exportDownload'), 'markdown export');
assert.ok(reviewText.includes('delete'), 'delete action');
assert.ok(reviewText.includes('audioMissing'), 'audio note');
assert.ok(reviewText.includes('summary'), 'summary tab');
assert.ok(findClass(review, 'dsh-facechat-history-row').length === 1, 'history row');
assert.equal(findClass(review, 'dsh-facechat-view-tab').length, 2, 'transcript and summary tabs');
assert.equal(findClass(review, 'dsh-facechat-speaker-merge').length, 2, 'one merge control per speaker');
assert.ok(reviewText.includes('glossary'), 'glossary action in the header');
ok('saved recording page renders review head, history and export controls');

/* --- 3b. Accuracy aids: language hint and glossary dialog --------------- */

const idleReady = render({}, makeSpeechSnap(), []);
const idleReadyText = collectText(idleReady).join('|');
assert.ok(idleReadyText.includes('languageTipTitle'), 'automatic-language accuracy hint');
assert.ok(idleReadyText.includes('languageTipText'), 'accuracy hint body');
assert.ok(idleReadyText.includes('useChinese'), 'quick switch to Chinese recognition');
ok('automatic language setting shows the accuracy hint');

const glossaryDialog = renderComponent(GlossaryDialog, {
  t,
  glossary,
  onClose: () => {},
  onSaved: () => {},
});
const glossaryText = collectText(glossaryDialog).join('|');
assert.ok(glossaryText.includes('glossaryTitle'), 'glossary dialog title');
assert.ok(glossaryText.includes('glossaryEnabled'), 'glossary enable toggle');
const glossaryAreas = findClass(glossaryDialog, 'dsh-facechat-glossary-text');
assert.equal(glossaryAreas.length, 1, 'glossary textarea');
assert.ok(glossaryAreas[0].props.placeholder.includes('glossaryPlaceholder'), 'glossary placeholder');
assert.ok(glossaryText.includes('GitHub'), 'built-in glossary terms listed');
assert.ok(glossaryText.includes('glossaryReset'), 'restore-defaults action');
ok('glossary dialog renders rules, built-in terms and actions');


/* --- 4. Saved recording with audio, unavailable speech and an error ----- */

const reviewAudio = render(
  {
    view: 'review',
    phase: 'idle',
    review: saved,
    selectedId: 's1',
    durationMs: saved.durationMs,
    title: saved.title,
    audioUrl: 'blob:facechat-audio',
    audioSessionId: 's1',
    audioMime: 'audio/webm',
  },
  makeSpeechSnap(),
  [saved],
);
const audioText = collectText(reviewAudio).join('|');
assert.ok(audioText.includes('exportAudio'), 'audio download action');
assert.ok(audioText.includes('audioInMemory'), 'audio note');
ok('saved recording with retained audio renders the download action');

const unavailable = render({}, makeSpeechSnap({ available: false, connected: false, catalog: null }));
assert.ok(collectText(unavailable).join('|').includes('speechUnavailable'), 'speech service unavailable banner');
ok('unavailable speech service renders guidance instead of crashing');

const failed = render(
  { view: 'live', phase: 'idle', lines: lines.filter((line) => line.text), speakers: [{ name: '' }, { name: '' }], error: { key: 'errorPermission' }, notice: { key: 'transcribeFailure', params: { message: 'timeout' } } },
  makeSpeechSnap(),
);
const failedText = collectText(failed).join('|');
assert.ok(failedText.includes('errorPermission'), 'capture error banner');
assert.ok(failedText.includes('transcribeFailure'), 'transcription notice banner');
ok('capture and transcription errors render as banners');

/* --- 5. Speaker-aware summary ------------------------------------------ */

const identitySummary = buildIdentitySummary(saved, t);
assert.equal(identitySummary.speakerSections.length, 2, 'one summary section per used speaker');
assert.equal(identitySummary.speakerSections[0].name, '小林', 'renamed speaker identity is retained');
assert.equal(identitySummary.speakerSections[1].name, '阿珍', 'second renamed speaker identity is retained');
assert.ok(identitySummary.keyMoments.some((item) => item.speaker === 0), 'conversation flow attributes a point to speaker zero');
assert.ok(identitySummary.keyMoments.some((item) => item.speaker === 1), 'conversation flow attributes a point to speaker one');

const summaryView = renderComponent(SummaryView, { data: saved, t });
const summaryText = collectText(summaryView).join('|');
assert.ok(summaryText.includes('小林'), 'summary UI shows first speaker name');
assert.ok(summaryText.includes('阿珍'), 'summary UI shows second speaker name');
assert.ok(findClass(summaryView, 'dsh-facechat-summary-card').length === 2, 'summary renders a card per speaker');
ok('speaker-aware summary preserves identity, attribution and participation');

/* --- 6. Markdown export shape ------------------------------------------ */

const markdown = buildMarkdown(saved, t, 'zh');
assert.ok(markdown.startsWith('# 产品周会'), 'markdown title');
assert.ok(markdown.includes('## summary'), 'markdown includes the summary module');
assert.ok(markdown.includes('### summaryBySpeaker'), 'markdown includes speaker-aware summary sections');
assert.ok(markdown.includes('**小林**：你好，我们开始吧。'), 'markdown speaker line');
assert.ok(markdown.includes('00:01'), 'markdown timestamp');
ok('Markdown transcript export');

function ok(name) {
  console.log('ok - ' + name);
}

for (const cleanup of activeCleanups) {
  try {
    cleanup();
  } catch (err) {
    throw new Error('render cleanup failed: ' + (err && err.message ? err.message : String(err)));
  }
}
