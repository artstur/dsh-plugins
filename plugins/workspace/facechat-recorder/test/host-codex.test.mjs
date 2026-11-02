/**
 * Host settings + Codex polish tests.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import {
  createSettingsStore,
  publicConfig,
  applyConfigPatch,
  DEFAULT_SETTINGS,
} from '../host/settings.js'
import {
  buildCodexPrompt,
  parseCodexLines,
  createCodexPolisher,
} from '../host/codex.js'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facechat-host-test-'))
const settingsPath = path.join(tempDir, 'settings.json')
const store = createSettingsStore({ filePath: settingsPath, env: {} })
assert.equal(store.get().provider, 'local', 'default provider is local')
const publicInitial = store.getPublic()
assert.equal(publicInitial.volc.configured, false, 'unconfigured by default')
assert.equal(Object.prototype.hasOwnProperty.call(publicInitial.volc, 'apiKey'), false, 'public config omits key')
assert.ok(publicInitial.volc.hotwords.includes('GitHub'), 'default technical hotwords')
ok('settings defaults and sanitized public config')

const saved = store.update({
  provider: 'volc',
  volcApiKey: '  super-secret-key  ',
  language: 'zh-CN',
  hotwords: ['GitHub', '冬阳', 'github'],
  codexModel: 'gpt-5.6-luna',
})
assert.equal(saved.ok, true, 'config update succeeds')
assert.equal(saved.config.provider, 'volc', 'provider persisted')
assert.equal(saved.config.volc.configured, true, 'key considered configured')
assert.equal(Object.prototype.hasOwnProperty.call(saved.config.volc, 'apiKey'), false, 'update response omits key')
assert.deepEqual(saved.config.volc.hotwords, ['GitHub', '冬阳'], 'hotwords dedupe case-insensitively')
const mode = fs.statSync(settingsPath).mode & 0o777
assert.equal(mode, 0o600, 'settings file is mode 0600')
const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
assert.equal(raw.volc.apiKey, 'super-secret-key', 'key persisted for the Host only')
const reloaded = createSettingsStore({ filePath: settingsPath, env: {} })
assert.equal(reloaded.getVolcKey().key, 'super-secret-key', 'key survives reload')
assert.equal(reloaded.getPublic().volc.source, 'stored', 'stored key source')
ok('API key persists with 0600 and never reaches the client')

const envStore = createSettingsStore({ filePath: path.join(tempDir, 'env.json'), env: { VOLCENGINE_VOICE_API_KEY: 'env-key' } })
assert.equal(envStore.getPublic().volc.configured, true, 'environment key is a fallback')
assert.equal(envStore.getPublic().volc.source, 'env', 'environment source reported')
ok('environment variable fallback for the Volcengine key')

assert.ok(applyConfigPatch(DEFAULT_SETTINGS, { provider: 'bad' }).provider === 'local', 'invalid provider ignored by normalizer')
assert.equal(store.update({ provider: 'nope' }).ok, false, 'invalid provider rejected')
assert.equal(store.update({ codexModel: 'bad model!' }).ok, false, 'invalid model rejected')
ok('config validation')

assert.equal(publicConfig(store.get()).volc.configured, true)

/* ---------------- Codex prompt and output parsing ---------------- */

const prompt = buildCodexPrompt({
  lines: ['我在 githh 上看到 bench mark', 'deepre 的后训练'],
  terms: ['GitHub', 'benchmark', 'DeepSeek'],
  language: 'zh-CN',
})
assert.ok(prompt.includes('exactly 2 string entries'), 'prompt pins the line count')
assert.ok(prompt.includes('GitHub') && prompt.includes('benchmark'), 'prompt includes glossary terms')
assert.ok(prompt.includes('1. 我在 githh 上看到 bench mark'), 'prompt includes numbered lines')

assert.deepEqual(
  parseCodexLines('{"lines":["A","B"]}', 2),
  ['A', 'B'],
  'plain JSON parsed',
)
assert.deepEqual(
  parseCodexLines('```json\n{"lines":["A","B"]}\n```', 2),
  ['A', 'B'],
  'fenced JSON parsed',
)
assert.equal(parseCodexLines('{"lines":["A"]}', 2), null, 'line-count mismatch rejected')
assert.equal(parseCodexLines('not json', 2), null, 'invalid output rejected')
ok('Codex prompt format and structured output parsing')

/* ---------------- Codex process integration with a fake spawn ---------------- */

class FakeChild extends EventEmitter {
  constructor(args) {
    super()
    this.args = args
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.killed = false
    const outputPath = args[args.indexOf('-o') + 1]
    let promptText = ''
    this.stdin = {
      write: (chunk) => {
        promptText += String(chunk)
      },
      end: () => {
        const count = (promptText.match(/^\d+\. /gm) || []).length
        fs.writeFileSync(
          outputPath,
          JSON.stringify({ lines: Array.from({ length: count }, (_, index) => 'corrected ' + (index + 1)) }),
        )
        setTimeout(() => this.emit('close', 0, null), 5)
      },
    }
  }
  kill() {
    this.killed = true
  }
}

const fakeSettings = {
  get: () => ({ codex: { model: 'gpt-5.6-luna' } }),
}
const polisher = createCodexPolisher({
  settings: fakeSettings,
  spawnImpl: (binary, args) => new FakeChild(args),
  fsImpl: fs,
  timeoutMs: 5000,
})
const polished = await polisher.polish({ lines: ['a', 'b'], terms: ['GitHub'] })
assert.deepEqual(polished.lines, ['corrected 1', 'corrected 2'], 'fake Codex result returned')
assert.ok(polished.model, 'model reported')
ok('Codex process integration (prompt on stdin, JSON output file)')

function ok(name) {
  console.log('ok - ' + name)
}

fs.rmSync(tempDir, { recursive: true, force: true })
