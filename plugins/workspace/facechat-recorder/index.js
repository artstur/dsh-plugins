/**
 * Face-to-face Recorder — Host half.
 *
 * The browser cannot hold cloud API keys or spawn the local Codex CLI, so this
 * Host plugin owns both optional accuracy backends:
 *
 *   GET  /plugin/facechat/config      sanitized settings (never the API key)
 *   POST /plugin/facechat/config      save provider / Volcengine key / Codex model
 *   POST /plugin/facechat/transcribe  Volcengine SeedASR for one WAV utterance
 *   POST /plugin/facechat/polish      Codex CLI proofreading for transcript lines
 *
 * The local SenseVoice path continues to go through the Harness speech Remote
 * and is untouched. Cloud ASR audio and Codex text only leave the machine after
 * the user selects that backend or presses the polish action.
 */
import { createSettingsStore, defaultStateRoot } from './host/settings.js'
import { createVolcengineClient } from './host/volcengine.js'
import { createCodexPolisher } from './host/codex.js'

export const inject = ['webServer']
export const ROUTE_PREFIX = '/plugin/facechat'
const MAX_BODY_BYTES = 9 * 1024 * 1024

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  try {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
  } catch (error) {
    try {
      res.destroy()
    } catch (inner) {
      /* socket already gone */
    }
  }
}

function normalizeError(error) {
  return {
    code: (error && error.code) || 'facechat-host-error',
    message: error && error.message ? String(error.message) : String(error),
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('请求体过大'), { code: 'body-too-large' }))
        try {
          req.destroy()
        } catch (error) {
          /* ignore */
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', (error) => reject(error))
  })
}

async function readJsonBody(req) {
  const raw = await readBody(req)
  if (!raw.length) return {}
  let value
  try {
    value = JSON.parse(raw.toString('utf8'))
  } catch (error) {
    throw Object.assign(new Error('请求体不是合法 JSON'), { code: 'bad-json' })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('请求体必须是对象'), { code: 'bad-body' })
  }
  return value
}

function originAllowed(req, webServer) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return origin === webServer.getOrigin()
  } catch (error) {
    return false
  }
}

function statusForError(error) {
  const code = error && error.code
  if (code === 'volc-key-missing' || code === 'volc-auth-failed' || code === 'volc-forbidden') return 401
  if (
    code === 'codex-empty' ||
    code === 'codex-too-long' ||
    code === 'body-too-large' ||
    code === 'audio-missing' ||
    code === 'bad-json' ||
    code === 'bad-body' ||
    code === 'invalid-provider'
  ) {
    return 400
  }
  return 500
}

export function apply(ctx) {
  const settings = createSettingsStore()
  const volc = createVolcengineClient({ settings })
  const codex = createCodexPolisher({ settings })
  const stateRoot = defaultStateRoot()

  async function handle(req, res) {
    if (!originAllowed(req, ctx.webServer)) {
      sendJson(res, 403, { ok: false, error: { code: 'origin-rejected', message: '跨站请求被拒绝' } })
      return
    }
    let pathname = '/'
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname.slice(ROUTE_PREFIX.length) || '/'
    } catch (error) {
      sendJson(res, 400, { ok: false, error: { code: 'bad-url', message: 'URL 无效' } })
      return
    }

    try {
      if (req.method === 'GET' && (pathname === '/config' || pathname === '/')) {
        sendJson(res, 200, {
          ok: true,
          config: settings.getPublic(),
        })
        return
      }

      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          settingsPath: settings.filePath,
          stateRoot,
          loadError: settings.getLoadError(),
        })
        return
      }

      if (req.method !== 'POST') {
        sendJson(res, 404, { ok: false, error: { code: 'not-found', message: '不支持的请求' } })
        return
      }

      const body = await readJsonBody(req)

      if (pathname === '/config') {
        const result = settings.update(body)
        if (!result.ok) {
          sendJson(res, 400, result)
          return
        }
        sendJson(res, 200, { ok: true, config: result.config })
        return
      }

      if (pathname === '/transcribe') {
        if (typeof body.audioBase64 !== 'string' || !body.audioBase64) {
          sendJson(res, 400, { ok: false, error: { code: 'audio-missing', message: '缺少音频数据' } })
          return
        }
        const controller = new AbortController()
        const onClose = () => {
          if (!res.writableEnded) controller.abort()
        }
        res.on('close', onClose)
        try {
          const result = await volc.transcribe({
            audioBase64: body.audioBase64,
            language: typeof body.language === 'string' ? body.language : undefined,
            hotwords: Array.isArray(body.hotwords) ? body.hotwords : [],
            signal: controller.signal,
          })
          sendJson(res, 200, {
            ok: true,
            text: result.text,
            audioMs: result.audioMs,
            inferenceMs: result.inferenceMs,
            resourceId: result.resourceId,
          })
        } finally {
          res.removeListener('close', onClose)
        }
        return
      }

      if (pathname === '/polish') {
        const lines = Array.isArray(body.lines)
          ? body.lines.filter((line) => typeof line === 'string').slice(0, 120)
          : []
        if (!lines.length) {
          sendJson(res, 400, { ok: false, error: { code: 'codex-empty', message: '没有可润色的转写行' } })
          return
        }
        const terms = Array.isArray(body.terms)
          ? body.terms
              .filter((term) => typeof term === 'string')
              .map((term) => term.trim())
              .filter(Boolean)
              .slice(0, 60)
          : []
        const result = await codex.polish({
          lines,
          terms,
          language: typeof body.language === 'string' ? body.language : '',
          model: typeof body.model === 'string' ? body.model : '',
        })
        sendJson(res, 200, { ok: true, lines: result.lines, model: result.model })
        return
      }

      sendJson(res, 404, { ok: false, error: { code: 'not-found', message: '不支持的请求' } })
    } catch (error) {
      sendJson(res, statusForError(error), { ok: false, error: normalizeError(error) })
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          void handle(req, res)
        },
      }),
    'facechat-host-routes',
  )
}
