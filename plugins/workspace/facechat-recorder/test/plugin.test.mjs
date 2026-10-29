/**
 * Plugin-lifecycle check: apply the factory against a minimal fake Cordis
 * context and confirm the page/sidebar registrations, locale dictionaries and
 * speech-bridge wiring happen without throwing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

let loaded = null;
const windowShim = { __ModuleLoader__: { load(options) { loaded = options; } } };
const ReactStub = {
  createElement: () => null,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  Fragment: 'Fragment',
};
new Function('window', source)(windowShim);
const plugin = loaded.factory((name) => {
  if (name === 'react') return ReactStub;
  throw new Error('unexpected require: ' + name);
});

const registrations = [];
const locales = [];
const cleanups = [];
let followStarted = 0;

const catalog = {
  maxAudioBytes: 4 * 1024 * 1024,
  maxDurationSeconds: 120,
  providers: [
    {
      id: 'sensevoice-local',
      name: 'SenseVoice (local)',
      location: 'host-local',
      languages: ['auto', 'zh', 'en'],
      preparation: { phase: 'ready' },
      downloadSources: ['https://huggingface.co', 'https://hf-mirror.com'],
    },
  ],
  selection: { providerId: 'sensevoice-local', language: 'auto' },
};

const speechMock = {
  async follow(signal) {
    followStarted += 1;
    await new Promise((resolve) => {
      if (signal && signal.aborted) return resolve();
      const timer = setTimeout(resolve, 20);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  },
  async transcribe() {
    return { ok: true, value: { text: '测试', audioSeconds: 1, inferenceSeconds: 0.1 } };
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

function makeContext(remote) {
  const ctx = {
    remote,
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') cleanups.push(dispose);
      return dispose;
    },
    inject(dependencies, callback) {
      const child = Object.assign({}, ctx, {
        remote,
        effect: ctx.effect,
      });
      callback(child);
      return { dispose() {} };
    },
    locale: {
      bind() {
        return (key, params) => (params ? key + JSON.stringify(params) : key);
      },
      register(namespace, localeId, dict) {
        locales.push({ namespace, localeId, dict });
        return () => {};
      },
      getSnapshot() {
        return { active: 'zh', locales: [{ id: 'zh' }, { id: 'en' }] };
      },
      subscribe() {
        return () => {};
      },
    },
    slots: {
      inject(slotName, callback) {
        assert.equal(typeof callback, 'function', 'slot inject callback');
        callback();
      },
      register(options, component) {
        assert.equal(typeof component, 'function', 'slot component is a function');
        registrations.push({ options, component });
        return () => {};
      },
    },
  };
  return ctx;
}

const ctx = makeContext({ speech: speechMock });
plugin.apply(ctx);

assert.ok(registrations.length >= 2, 'main and sidebar slots register');
const main = registrations.find((entry) => entry.options.name === 'main');
const sidebar = registrations.find((entry) => entry.options.name === 'sidebar.panellist');
assert.ok(main && main.options.key === 'facechat', 'main panel keyed facechat');
assert.ok(sidebar && sidebar.options.id === 'facechat', 'sidebar entry id facechat');
assert.equal(typeof sidebar.options.label, 'function', 'sidebar label thunk');
assert.equal(sidebar.options.label(), 'navTitle', 'sidebar uses the short navigation title');
assert.ok(locales.some((entry) => entry.localeId === 'zh' && entry.dict.navTitle === '面聊'), 'Chinese sidebar label is 面聊');
assert.ok(locales.some((entry) => entry.localeId === 'en' && entry.dict.navTitle), 'English sidebar label exists');
assert.ok(locales.length > 0, 'locale dictionaries register');
assert.ok(locales.some((entry) => entry.localeId === 'zh' && entry.dict.title), 'Chinese page title dictionary');
assert.ok(locales.some((entry) => entry.localeId === 'en' && entry.dict.title), 'English page title dictionary');

/* The speech bridge follows the mounted remote asynchronously. */
await new Promise((resolve) => setTimeout(resolve, 60));
assert.ok(followStarted >= 1, 'speech bridge follows the remote catalog');

for (const dispose of cleanups.reverse()) {
  try {
    dispose();
  } catch (err) {
    throw new Error('cleanup failed: ' + (err && err.message ? err.message : String(err)));
  }
}

console.log('ok - plugin apply, slot registration, locale dictionaries and speech bridge cleanup');
