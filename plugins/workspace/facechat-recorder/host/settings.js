/**
 * Host-side settings for the face-to-face recorder.
 *
 * The browser never receives the Volcengine API key: it sends a replacement
 * value once, and every later read returns only `configured: true/false`. The
 * settings file lives in DSH's plugin-data directory with mode 0600.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const SETTINGS_VERSION = 1

export const DEFAULT_RESOURCE_ID = 'volc.seedasr.sauc.duration'
export const DEFAULT_VOLC_LANGUAGE = 'zh-CN'
export const DEFAULT_CODEX_MODEL = 'gpt-5.6-luna'
export const MAX_API_KEY_LENGTH = 512
export const MAX_HOTWORDS = 80
export const MAX_HOTWORD_LENGTH = 32

export const SUPPORTED_VOLC_LANGUAGES = [
  'zh-CN',
  'en-US',
  'ja-JP',
  'ko-KR',
  'yue-CN',
  'auto',
]

const DEFAULT_HOTWORDS = [
  'GitHub',
  'benchmark',
  'DeepSeek',
  'Deep Research',
  'API',
  'LLM',
  'RAG',
  'SenseVoice',
  'Harness',
]

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  provider: 'local',
  volc: {
    apiKey: '',
    resourceId: DEFAULT_RESOURCE_ID,
    language: DEFAULT_VOLC_LANGUAGE,
    hotwords: DEFAULT_HOTWORDS.slice(),
  },
  codex: {
    model: DEFAULT_CODEX_MODEL,
  },
})

export function defaultStateRoot(env = process.env, homedir = os.homedir) {
  return path.join(env.DSH_HOME || path.join(homedir(), '.dsh'), 'plugin-data', 'facechat-recorder')
}

export function defaultSettingsPath(env = process.env, homedir = os.homedir) {
  return path.join(defaultStateRoot(env, homedir), 'settings.json')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function clampText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeHotwords(value) {
  let source = []
  if (Array.isArray(value)) source = value
  else if (typeof value === 'string') source = value.split(/[\n,，、;；]+/)
  const seen = new Set()
  const words = []
  for (const item of source) {
    const word = clampText(item, MAX_HOTWORD_LENGTH)
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(word)
    if (words.length >= MAX_HOTWORDS) break
  }
  return words
}

function normalizeSettings(raw) {
  const next = clone(DEFAULT_SETTINGS)
  if (!raw || typeof raw !== 'object') return next
  if (raw.provider === 'local' || raw.provider === 'volc') next.provider = raw.provider
  const volc = raw.volc && typeof raw.volc === 'object' ? raw.volc : {}
  if (typeof volc.apiKey === 'string') next.volc.apiKey = volc.apiKey.trim().slice(0, MAX_API_KEY_LENGTH)
  const resourceId = clampText(volc.resourceId, 80)
  if (/^volc\.[a-z0-9_.-]+$/i.test(resourceId)) next.volc.resourceId = resourceId
  const language = clampText(volc.language, 16)
  if (SUPPORTED_VOLC_LANGUAGES.includes(language)) next.volc.language = language
  if (volc.hotwords !== undefined) next.volc.hotwords = normalizeHotwords(volc.hotwords)
  const codex = raw.codex && typeof raw.codex === 'object' ? raw.codex : {}
  const model = clampText(codex.model, 80)
  if (model) next.codex.model = model
  return next
}

export function resolveVolcApiKey(settings, env = process.env) {
  const stored = settings && settings.volc ? settings.volc.apiKey : ''
  if (stored) return { key: stored, source: 'stored' }
  const fromEnv = env.FACECHAT_VOLC_API_KEY || env.VOLCENGINE_VOICE_API_KEY || ''
  if (fromEnv) return { key: String(fromEnv).trim(), source: 'env' }
  return { key: '', source: 'none' }
}

export function publicConfig(settings, env = process.env) {
  const resolved = resolveVolcApiKey(settings, env)
  return {
    provider: settings.provider,
    volc: {
      configured: resolved.key.length > 0,
      source: resolved.source,
      resourceId: settings.volc.resourceId,
      language: settings.volc.language,
      hotwords: settings.volc.hotwords.slice(),
      languages: SUPPORTED_VOLC_LANGUAGES.slice(),
    },
    codex: {
      model: settings.codex.model,
    },
  }
}

export function validateConfigPatch(patch) {
  if (!patch || typeof patch !== 'object') return 'invalid-body'
  if (patch.provider !== undefined && patch.provider !== 'local' && patch.provider !== 'volc') {
    return 'invalid-provider'
  }
  if (patch.volcApiKey !== undefined && typeof patch.volcApiKey !== 'string') return 'invalid-api-key'
  if (patch.resourceId !== undefined) {
    if (typeof patch.resourceId !== 'string' || !/^volc\.[a-z0-9_.-]+$/i.test(patch.resourceId.trim())) {
      return 'invalid-resource-id'
    }
  }
  if (patch.language !== undefined && !SUPPORTED_VOLC_LANGUAGES.includes(patch.language)) {
    return 'invalid-language'
  }
  if (patch.codexModel !== undefined) {
    if (typeof patch.codexModel !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(patch.codexModel.trim())) {
      return 'invalid-codex-model'
    }
  }
  if (patch.hotwords !== undefined && !Array.isArray(patch.hotwords) && typeof patch.hotwords !== 'string') {
    return 'invalid-hotwords'
  }
  return null
}

export function applyConfigPatch(settings, patch) {
  const next = clone(settings)
  if (patch.provider !== undefined) next.provider = patch.provider
  if (patch.clearVolcKey === true) next.volc.apiKey = ''
  else if (typeof patch.volcApiKey === 'string' && patch.volcApiKey.trim()) {
    next.volc.apiKey = patch.volcApiKey.trim().slice(0, MAX_API_KEY_LENGTH)
  }
  if (typeof patch.resourceId === 'string' && patch.resourceId.trim()) {
    next.volc.resourceId = patch.resourceId.trim()
  }
  if (typeof patch.language === 'string') next.volc.language = patch.language
  if (patch.hotwords !== undefined) next.volc.hotwords = normalizeHotwords(patch.hotwords)
  if (typeof patch.codexModel === 'string' && patch.codexModel.trim()) {
    next.codex.model = patch.codexModel.trim()
  }
  return normalizeSettings(next)
}

export function createSettingsStore(options = {}) {
  const filePath = options.filePath || defaultSettingsPath(options.env, options.homedir)
  const env = options.env || process.env
  let settings = clone(DEFAULT_SETTINGS)
  let loadError = null

  function load() {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      settings = normalizeSettings(JSON.parse(raw))
      loadError = null
    } catch (error) {
      if (error && error.code !== 'ENOENT') loadError = String(error.message || error)
      settings = clone(DEFAULT_SETTINGS)
    }
    return settings
  }

  function persist() {
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    const temp = filePath + '.tmp-' + process.pid + '-' + Date.now()
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(temp, filePath)
    try {
      fs.chmodSync(filePath, 0o600)
    } catch (error) {
      /* best effort on filesystems without POSIX modes */
    }
  }

  load()

  return {
    filePath,
    get() {
      return clone(settings)
    },
    getPublic() {
      return publicConfig(settings, env)
    },
    getVolcKey() {
      return resolveVolcApiKey(settings, env)
    },
    getLoadError() {
      return loadError
    },
    update(patch) {
      const problem = validateConfigPatch(patch)
      if (problem) return { ok: false, error: problem }
      const next = applyConfigPatch(settings, patch)
      settings = next
      try {
        persist()
      } catch (error) {
        return { ok: false, error: 'persist-failed', message: String(error.message || error) }
      }
      return { ok: true, config: publicConfig(settings, env) }
    },
    reload: load,
  }
}
