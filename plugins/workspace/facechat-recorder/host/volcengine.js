/**
 * Volcengine SeedASR (Doubao streaming ASR 2.0) client.
 *
 * Mirrors the Type4Me setup: `volc.seedasr.sauc.duration`, API-key
 * authentication, `bigmodel_async` endpoint, gzip JSON request, SAUC binary
 * frames. One WebSocket session per finalized utterance; the audio is a
 * canonical 16 kHz mono PCM16 WAV produced by the client before upload.
 *
 * Protocol reference: https://www.volcengine.com/docs/6561/1354869
 */
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

export const VOLC_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
export const DEFAULT_RESOURCE_ID = 'volc.seedasr.sauc.duration'

const MSG_FULL_CLIENT_REQUEST = 0x01
const MSG_AUDIO_ONLY = 0x02
const MSG_FULL_SERVER_RESPONSE = 0x09
const MSG_ERROR = 0x0f

const FLAG_NO_SEQUENCE = 0x00
const FLAG_LAST_PACKET = 0x02
const FLAG_FINAL_SEQUENCE = 0x03

const SERIALIZATION_NONE = 0x00
const SERIALIZATION_JSON = 0x01
const COMPRESSION_NONE = 0x00
const COMPRESSION_GZIP = 0x01

const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const MAX_HOTWORDS = 40
const MAX_HOTWORD_CHARS = 400

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

export function buildHeader(messageType, flags, serialization, compression) {
  return Buffer.from([
    (0x01 << 4) | 0x01,
    ((messageType & 0x0f) << 4) | (flags & 0x0f),
    ((serialization & 0x0f) << 4) | (compression & 0x0f),
    0x00,
  ])
}

export function buildFrame(messageType, flags, serialization, compression, payload) {
  const body = payload || Buffer.alloc(0)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(body.length, 0)
  return Buffer.concat([buildHeader(messageType, flags, serialization, compression), size, body])
}

export function buildRequestPayload({ language, hotwords } = {}) {
  const words = normalizeHotwords(hotwords)
  const audio = {
    format: 'wav',
    rate: 16000,
    bits: 16,
    channel: 1,
  }
  if (language && language !== 'auto') audio.language = language
  const request = {
    model_name: 'bigmodel',
    enable_itn: true,
    enable_punc: true,
    enable_nonstream: true,
  }
  if (words.length > 0) {
    request.corpus = {
      context: JSON.stringify({ hotwords: words.map((word) => ({ word })) }),
    }
  }
  return {
    user: { uid: 'facechat-recorder' },
    audio,
    request,
  }
}

function normalizeHotwords(value) {
  const source = Array.isArray(value) ? value : DEFAULT_HOTWORDS
  const seen = new Set()
  const words = []
  let chars = 0
  for (const item of source.concat(DEFAULT_HOTWORDS)) {
    const word = typeof item === 'string' ? item.trim() : ''
    if (!word || word.length > 32) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    if (chars + word.length > MAX_HOTWORD_CHARS) break
    seen.add(key)
    words.push(word)
    chars += word.length
    if (words.length >= MAX_HOTWORDS) break
  }
  return words
}

/**
 * Decode one SAUC server frame. Returns null for frames we do not consume.
 */
export function parseFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  const headerSize = (buffer[0] & 0x0f) * 4
  if (headerSize < 4 || headerSize > buffer.length) return null
  const messageType = (buffer[1] >> 4) & 0x0f
  const flags = buffer[1] & 0x0f
  const serialization = (buffer[2] >> 4) & 0x0f
  const compression = buffer[2] & 0x0f
  let offset = headerSize

  if (messageType === MSG_ERROR) {
    if (offset + 8 > buffer.length) return { messageType, errorCode: 0, errorMessage: '' }
    const errorCode = buffer.readUInt32BE(offset)
    offset += 4
    const messageSize = buffer.readUInt32BE(offset)
    offset += 4
    const errorMessage = buffer.subarray(offset, Math.min(buffer.length, offset + messageSize)).toString('utf8')
    return { messageType, errorCode, errorMessage }
  }

  let sequence = null
  if (flags === 0x01 || flags === FLAG_FINAL_SEQUENCE) {
    if (offset + 4 > buffer.length) return null
    sequence = buffer.readInt32BE(offset)
    offset += 4
  }
  if (offset + 4 > buffer.length) return null
  const size = buffer.readUInt32BE(offset)
  offset += 4
  if (size > buffer.length - offset) return null
  let payload = buffer.subarray(offset, offset + size)
  if (compression === COMPRESSION_GZIP && payload.length > 0) {
    try {
      payload = gunzipSync(payload)
    } catch (error) {
      return null
    }
  }
  let json = null
  if (serialization === SERIALIZATION_JSON && payload.length > 0) {
    try {
      json = JSON.parse(payload.toString('utf8'))
    } catch (error) {
      json = null
    }
  }
  return {
    messageType,
    flags,
    sequence,
    serialization,
    compression,
    payload,
    json,
  }
}

export function extractTranscript(body) {
  if (!body || typeof body !== 'object') return ''
  const result = body.result
  if (result && typeof result === 'object') {
    if (typeof result.text === 'string' && result.text.trim()) return result.text.trim()
    if (Array.isArray(result.utterances)) {
      const text = result.utterances
        .map((utterance) => (utterance && typeof utterance.text === 'string' ? utterance.text.trim() : ''))
        .filter(Boolean)
        .join('')
      if (text) return text
    }
  }
  if (typeof result === 'string' && result.trim()) return result.trim()
  const payload = body.payload_msg
  if (payload && typeof payload === 'object') {
    if (typeof payload.result === 'string') return payload.result.trim()
    if (Array.isArray(payload.result)) {
      return payload.result
        .map((item) => (typeof item === 'string' ? item : item && typeof item.text === 'string' ? item.text : ''))
        .filter(Boolean)
        .join('')
        .trim()
    }
  }
  return ''
}

export function validateWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return { ok: false, error: 'wav-too-short' }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return { ok: false, error: 'wav-bad-header' }
  }
  let offset = 12
  let format = null
  let dataBytes = 0
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (chunkId === 'fmt ' && chunkSize >= 16 && body + 16 <= buffer.length) {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      }
    } else if (chunkId === 'data') {
      dataBytes = Math.min(chunkSize, buffer.length - body)
    }
    offset = body + chunkSize + (chunkSize % 2)
  }
  if (!format) return { ok: false, error: 'wav-no-fmt' }
  if (format.audioFormat !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
    return { ok: false, error: 'wav-unsupported-format' }
  }
  if (format.sampleRate !== 16000) return { ok: false, error: 'wav-unsupported-rate' }
  if (dataBytes <= 0) return { ok: false, error: 'wav-empty' }
  return { ok: true, dataBytes, audioMs: Math.round((dataBytes / 32) * 1000) / 1000 }
}

function decodeAudioBase64(audioBase64) {
  const text = String(audioBase64 || '')
  if (!text) throw Object.assign(new Error('missing audio'), { code: 'audio-missing' })
  if (text.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) {
    throw Object.assign(new Error('audio too large'), { code: 'audio-too-large' })
  }
  let buffer
  try {
    buffer = Buffer.from(text, 'base64')
  } catch (error) {
    throw Object.assign(new Error('invalid base64 audio'), { code: 'audio-invalid-base64' })
  }
  if (buffer.toString('base64') !== text.replace(/\s+/g, '')) {
    throw Object.assign(new Error('invalid base64 audio'), { code: 'audio-invalid-base64' })
  }
  if (buffer.length > MAX_AUDIO_BYTES) throw Object.assign(new Error('audio too large'), { code: 'audio-too-large' })
  const wav = validateWav(buffer)
  if (!wav.ok) throw Object.assign(new Error('invalid WAV audio: ' + wav.error), { code: 'audio-invalid-wav' })
  return { buffer, audioMs: wav.audioMs }
}

function mapConnectionError(error) {
  const raw = error && error.message ? String(error.message) : String(error)
  if (/\b401\b|unauthor/i.test(raw)) {
    return Object.assign(new Error('火山引擎鉴权失败：请检查 API Key 与资源 ID'), { code: 'volc-auth-failed' })
  }
  if (/\b403\b|forbidden/i.test(raw)) {
    return Object.assign(new Error('火山引擎拒绝访问：请检查 API Key 权限'), { code: 'volc-forbidden' })
  }
  return Object.assign(new Error('火山引擎连接失败：' + raw), { code: 'volc-connection-failed' })
}

/**
 * Create the ASR client. `settings` is the Host settings store; `WebSocketImpl`
 * exists so tests can substitute the transport.
 */
export function createVolcengineClient(options = {}) {
  const settings = options.settings
  const WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000
  const endpoint = options.endpoint || VOLC_ENDPOINT

  async function transcribe({ audioBase64, language, hotwords, signal }) {
    if (typeof WebSocketImpl !== 'function') {
      throw Object.assign(new Error('当前 DSH 运行时不支持 WebSocket'), { code: 'volc-no-websocket' })
    }
    const resolved = settings.getVolcKey()
    if (!resolved.key) {
      throw Object.assign(new Error('尚未配置火山引擎 API Key'), { code: 'volc-key-missing' })
    }
    const config = settings.get()
    const resourceId = config.volc.resourceId || DEFAULT_RESOURCE_ID
    const selectedLanguage = language || config.volc.language || 'zh-CN'
    const words = normalizeHotwords([].concat(config.volc.hotwords || [], hotwords || []))
    const audio = decodeAudioBase64(audioBase64)
    const requestPayload = buildRequestPayload({ language: selectedLanguage, hotwords: words })
    const requestBody = gzipSync(Buffer.from(JSON.stringify(requestPayload), 'utf8'))

    const startedAt = Date.now()
    const connectId = randomUUID()
    const requestId = randomUUID()

    return await new Promise((resolve, reject) => {
      let settled = false
      let socket = null
      let latestText = ''
      let sawFinal = false
      let timer = null
      let abortHandler = null

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        timer = null
        if (signal && abortHandler) {
          try {
            signal.removeEventListener('abort', abortHandler)
          } catch (error) {
            /* ignore */
          }
        }
        abortHandler = null
        if (socket) {
          try {
            socket.close()
          } catch (error) {
            /* ignore */
          }
          socket = null
        }
      }
      const finish = (value, error) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve(value)
      }
      const finishWithText = () => {
        finish({
          text: latestText,
          audioMs: audio.audioMs,
          inferenceMs: Date.now() - startedAt,
          resourceId,
        })
      }

      const onAbort = () => {
        finish(null, Object.assign(new Error('请求已取消'), { code: 'volc-cancelled' }))
      }
      if (signal) {
        if (signal.aborted) {
          onAbort()
          return
        }
        abortHandler = onAbort
        signal.addEventListener('abort', onAbort, { once: true })
      }

      try {
        socket = new WebSocketImpl(endpoint, {
          headers: {
            'X-Api-Key': resolved.key,
            'X-Api-Resource-Id': resourceId,
            'X-Api-Connect-Id': connectId,
            'X-Api-Request-Id': requestId,
            'X-Api-Sequence': '-1',
          },
        })
      } catch (error) {
        finish(null, mapConnectionError(error))
        return
      }
      try {
        socket.binaryType = 'arraybuffer'
      } catch (error) {
        /* ignore */
      }

      timer = setTimeout(() => {
        if (latestText) finishWithText()
        else finish(null, Object.assign(new Error('火山引擎识别超时'), { code: 'volc-timeout' }))
      }, timeoutMs)
      if (timer && typeof timer.unref === 'function') timer.unref()

      socket.addEventListener('open', () => {
        try {
          socket.send(buildFrame(MSG_FULL_CLIENT_REQUEST, FLAG_NO_SEQUENCE, SERIALIZATION_JSON, COMPRESSION_GZIP, requestBody))
          socket.send(
            buildFrame(MSG_AUDIO_ONLY, FLAG_NO_SEQUENCE, SERIALIZATION_NONE, COMPRESSION_NONE, audio.buffer),
          )
          socket.send(buildFrame(MSG_AUDIO_ONLY, FLAG_LAST_PACKET, SERIALIZATION_NONE, COMPRESSION_NONE, Buffer.alloc(0)))
        } catch (error) {
          finish(null, mapConnectionError(error))
        }
      })

      const handleBinary = (buffer) => {
        const frame = parseFrame(buffer)
        if (!frame) return
        if (frame.messageType === MSG_ERROR) {
          const code = frame.errorCode
          const detail = frame.errorMessage || '火山引擎返回错误'
          finish(null, Object.assign(new Error(detail + (code ? ' (code ' + code + ')' : '')), { code: 'volc-server-error', volcCode: code }))
          return
        }
        if (frame.messageType !== MSG_FULL_SERVER_RESPONSE) return
        if (frame.json) {
          const text = extractTranscript(frame.json)
          if (text) latestText = text
          if (frame.flags === FLAG_FINAL_SEQUENCE) sawFinal = true
        }
        if (sawFinal) finishWithText()
      }

      socket.addEventListener('message', (event) => {
        const data = event && event.data !== undefined ? event.data : event
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data)
            const text = extractTranscript(parsed)
            if (text) latestText = text
          } catch (error) {
            /* ignore non-JSON text frames */
          }
          return
        }
        if (data && typeof data.arrayBuffer === 'function') {
          data
            .arrayBuffer()
            .then((buffer) => handleBinary(Buffer.from(buffer)))
            .catch(() => {})
          return
        }
        if (data instanceof ArrayBuffer) {
          handleBinary(Buffer.from(data))
          return
        }
        if (ArrayBuffer.isView(data)) {
          handleBinary(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
        }
      })

      socket.addEventListener('error', (event) => {
        const error = event && event.error ? event.error : event
        finish(null, mapConnectionError(error))
      })

      socket.addEventListener('close', (event) => {
        if (latestText) {
          finishWithText()
          return
        }
        const code = event && typeof event.code === 'number' ? event.code : 0
        if (code === 1000 || code === 1001 || code === 0) {
          finishWithText()
          return
        }
        const reason = event && event.reason ? String(event.reason) : '连接提前关闭'
        finish(null, Object.assign(new Error('火山引擎连接关闭：' + reason), { code: 'volc-connection-closed' }))
      })
    })
  }

  return { transcribe }
}
