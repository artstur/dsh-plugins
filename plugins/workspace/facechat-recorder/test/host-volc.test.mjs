/**
 * Host-side Volcengine SeedASR protocol checks.
 *
 * A tiny WebSocket server validates the handshake headers, SAUC binary frames,
 * gzip JSON request and audio payload, then replies with the documented
 * full-server frames. This exercises the exact client used by the Host route
 * without a real Volcengine account.
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import crypto from 'node:crypto'
import { gzipSync } from 'node:zlib'
import {
  buildFrame,
  buildRequestPayload,
  extractTranscript,
  parseFrame,
  validateWav,
  createVolcengineClient,
} from '../host/volcengine.js'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function makeWav(seconds = 0.2) {
  const sampleRate = 16000
  const samples = Math.floor(sampleRate * seconds)
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 3000), 44 + i * 2)
  }
  return buffer
}

function serverFrame(sequence, flags, body) {
  const payload = gzipSync(Buffer.from(JSON.stringify(body), 'utf8'))
  const size = Buffer.alloc(4)
  size.writeUInt32BE(payload.length, 0)
  if (flags === 0x01 || flags === 0x03) {
    const seq = Buffer.alloc(4)
    seq.writeInt32BE(sequence, 0)
    return Buffer.concat([Buffer.from([0x11, (0x09 << 4) | flags, (0x01 << 4) | 0x01, 0]), seq, size, payload])
  }
  return Buffer.concat([Buffer.from([0x11, (0x09 << 4) | flags, (0x01 << 4) | 0x01, 0]), size, payload])
}

function websocketFrame(opcode, payload) {
  const body = payload || Buffer.alloc(0)
  let header
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length])
  } else if (body.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(body.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(body.length), 2)
  }
  return Buffer.concat([header, body])
}

function parseClientFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f
    const masked = (buffer[offset + 1] & 0x80) !== 0
    let length = buffer[offset + 1] & 0x7f
    let cursor = offset + 2
    if (length === 126) {
      if (cursor + 2 > buffer.length) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }
    let mask = null
    if (masked) {
      if (cursor + 4 > buffer.length) break
      mask = buffer.subarray(cursor, cursor + 4)
      cursor += 4
    }
    if (cursor + length > buffer.length) break
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length))
    if (mask) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
    }
    frames.push({ opcode, payload })
    offset = cursor + length
  }
  return { frames, rest: buffer.subarray(offset) }
}

const received = { headers: null, request: null, audio: null, finalSeen: false }
const wav = makeWav(0.2)

const server = http.createServer()
server.on('upgrade', (req, socket) => {
  received.headers = req.headers
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + WS_GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '
      + accept
      + '\r\n\r\n',
  )
  let pending = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk])
    const parsed = parseClientFrames(pending)
    pending = parsed.rest
    for (const frame of parsed.frames) {
      if (frame.opcode === 0x08) {
        socket.end()
        return
      }
      if (frame.opcode !== 0x02 && frame.opcode !== 0x01) continue
      const protocol = parseFrame(frame.payload)
      assert.ok(protocol, 'client frame follows the SAUC protocol')
      if (protocol.messageType === 0x01) {
        received.request = protocol.json
      } else if (protocol.messageType === 0x02) {
        if (frame.payload.length > 4 && protocol.flags === 0x00) {
          const headerSize = (frame.payload[0] & 0x0f) * 4
          received.audio = frame.payload.subarray(headerSize + 4)
        }
        if (protocol.flags === 0x02) {
          received.finalSeen = true
          setTimeout(() => {
            socket.write(websocketFrame(0x02, serverFrame(1, 0x01, { result: { text: '这是' } })))
            socket.write(websocketFrame(0x02, serverFrame(-1, 0x03, { result: { text: '这是火山引擎的转写', utterances: [{ text: '这是' }, { text: '火山引擎的转写' }] } })))
            setTimeout(() => {
              try {
                socket.end()
              } catch (error) {
                /* ignore */
              }
            }, 20)
          }, 20)
        }
      }
    }
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const settings = {
  getVolcKey: () => ({ key: 'test-api-key', source: 'stored' }),
  get: () => ({
    volc: { resourceId: 'volc.seedasr.sauc.duration', language: 'zh-CN', hotwords: ['冬阳'] },
    codex: { model: 'gpt-5.6-luna' },
  }),
}
const client = createVolcengineClient({ settings, endpoint: 'ws://127.0.0.1:' + port, timeoutMs: 5000 })
const result = await client.transcribe({
  audioBase64: wav.toString('base64'),
  language: 'zh-CN',
  hotwords: ['GitHub', 'DeepSeek'],
})

assert.equal(received.headers['x-api-key'], 'test-api-key', 'API key header')
assert.equal(received.headers['x-api-resource-id'], 'volc.seedasr.sauc.duration', 'resource header')
assert.ok(received.headers['x-api-connect-id'], 'connect id header')
assert.equal(received.request.audio.format, 'wav', 'WAV request format')
assert.equal(received.request.audio.rate, 16000, '16 kHz request rate')
assert.equal(received.request.request.model_name, 'bigmodel', 'model name')
assert.equal(received.request.request.enable_nonstream, true, 'second-pass enabled')
const corpus = JSON.parse(received.request.request.corpus.context)
const words = corpus.hotwords.map((item) => item.word)
assert.ok(words.includes('GitHub') && words.includes('DeepSeek') && words.includes('冬阳'), 'request hotwords')
assert.ok(received.audio.equals(wav), 'audio payload is the input WAV')
assert.equal(received.finalSeen, true, 'final packet sent')
assert.equal(result.text, '这是火山引擎的转写', 'final transcript')
ok('Volcengine SAUC handshake, request JSON, audio frames and transcript parsing')

/* Frame helpers */
assert.equal(buildRequestPayload({ language: 'auto' }).audio.language, undefined, 'auto omits language')
assert.equal(parseFrame(buildFrame(0x02, 0x00, 0, 0, Buffer.from('abc'))).payload.toString(), 'abc')
assert.equal(extractTranscript({ result: { utterances: [{ text: 'A' }, { text: 'B' }] } }), 'AB')
ok('SAUC frame and transcript helpers')

/* WAV validation */
assert.equal(validateWav(wav).ok, true, 'valid WAV accepted')
assert.equal(validateWav(Buffer.from('nope')).ok, false, 'invalid WAV rejected')
ok('WAV validation')

/* Error mapping via a mock transport */
class ErrorSocket {
  constructor() {
    this.listeners = {}
  }
  addEventListener(type, listener) {
    this.listeners[type] = listener
    if (type === 'open') setTimeout(() => listener({}), 0)
  }
  send() {}
  close() {}
}
const errorClient = createVolcengineClient({
  settings,
  WebSocketImpl: class extends ErrorSocket {
    constructor() {
      super()
      setTimeout(() => this.listeners.error && this.listeners.error({ error: new Error('Unexpected server response: 401') }), 5)
    }
  },
  timeoutMs: 1000,
})
await assert.rejects(
  () => errorClient.transcribe({ audioBase64: wav.toString('base64') }),
  (error) => error.code === 'volc-auth-failed',
)
ok('401 maps to a readable authentication error')

function ok(name) {
  console.log('ok - ' + name)
}

server.close()
