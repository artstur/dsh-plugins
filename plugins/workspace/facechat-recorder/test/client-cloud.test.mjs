/**
 * Client engine backend gating: a configured Volcengine backend must start
 * capture without requiring the local SenseVoice service, while the local
 * backend still reports the speech-service error.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8')

let loaded = null
const storage = new Map()
const windowShim = {
  __DSH_FACECHAT_TEST__: true,
  __ModuleLoader__: {
    load(options) {
      loaded = options
    },
  },
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key, value) {
      storage.set(key, String(value))
    },
    removeItem(key) {
      storage.delete(key)
    },
  },
}
const ReactStub = {
  createElement: () => null,
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (value) => ({ current: value }),
  Fragment: 'Fragment',
}
new Function('window', source)(windowShim)
const plugin = loaded.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error('unexpected require: ' + name)
})
const { createEngine } = plugin.__engine

function fakeSpeech({ available = false, connected = false, catalog = null } = {}) {
  return {
    getSnapshot: () => ({ available, connected, catalog, error: null, speech: null }),
    subscribe: () => () => {},
  }
}
const history = {
  getSnapshot: () => ({ sessions: [], error: null }),
  subscribe: () => () => {},
  add: () => ({ ok: true }),
  update: () => ({ ok: true }),
  remove: () => ({ ok: true }),
  get: () => null,
}
const glossary = { refine: (text) => text, hotwords: () => [] }

function fakeCloud(config, available = true) {
  return {
    getSnapshot: () => ({
      available,
      loading: false,
      saving: false,
      error: null,
      config,
    }),
    subscribe: () => () => {},
    transcribe: async () => ({ ok: true, text: '' }),
    polish: async () => ({ ok: true, lines: [] }),
  }
}

const volcConfig = {
  provider: 'volc',
  volc: {
    configured: true,
    source: 'stored',
    resourceId: 'volc.seedasr.sauc.duration',
    language: 'zh-CN',
    hotwords: [],
    languages: ['zh-CN'],
  },
  codex: { model: 'gpt-5.6-luna' },
}
const localConfig = Object.assign({}, volcConfig, { provider: 'local', volc: { configured: false } })

/* Cloud backend works without the local speech service. */
const cloudEngine = createEngine({
  speech: fakeSpeech(),
  history,
  glossary,
  cloud: fakeCloud(volcConfig, true),
})
await cloudEngine.start()
let snapshot = cloudEngine.getSnapshot()
assert.equal(snapshot.error && snapshot.error.key, 'errorUnsupported', 'cloud start reaches microphone capture without local ASR')
cloudEngine.dispose()
ok('cloud backend skips the local SenseVoice readiness requirement')

/* Cloud backend reports an unavailable Host before recording. */
const unavailableEngine = createEngine({
  speech: fakeSpeech(),
  history,
  glossary,
  cloud: fakeCloud(volcConfig, false),
})
await unavailableEngine.start()
snapshot = unavailableEngine.getSnapshot()
assert.equal(snapshot.error && snapshot.error.key, 'errorCloudUnavailable', 'missing Host route is explained')
assert.equal(snapshot.phase, 'idle')
unavailableEngine.dispose()
ok('cloud backend without the Host route reports a restart hint error')

/* Cloud backend without an API key asks for settings. */
const unconfigured = Object.assign({}, volcConfig, {
  volc: Object.assign({}, volcConfig.volc, { configured: false }),
})
const unconfiguredEngine = createEngine({
  speech: fakeSpeech(),
  history,
  glossary,
  cloud: fakeCloud(unconfigured, true),
})
await unconfiguredEngine.start()
snapshot = unconfiguredEngine.getSnapshot()
assert.equal(snapshot.error && snapshot.error.key, 'errorCloudNotConfigured', 'missing API key prompts settings')
unconfiguredEngine.dispose()
ok('cloud backend without a key asks for recognition settings')

/* Local backend still requires the speech service. */
const localEngine = createEngine({
  speech: fakeSpeech({ available: false, connected: false }),
  history,
  glossary,
  cloud: fakeCloud(localConfig, true),
})
await localEngine.start()
snapshot = localEngine.getSnapshot()
assert.equal(snapshot.error && snapshot.error.key, 'errorSpeechUnavailable', 'local backend keeps the speech-service error')
localEngine.dispose()
ok('local backend still requires the local speech service')

function ok(name) {
  console.log('ok - ' + name)
}
