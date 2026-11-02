/**
 * Host route tests: same-origin guard, sanitized config and persistence.
 * The cloud/Codex calls themselves are covered by the module tests; these
 * routes are exercised over a real loopback HTTP server.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facechat-routes-'))
process.env.FACECHAT_STATE_DIR = tempDir
const { apply, ROUTE_PREFIX } = await import('../index.js')

const routes = []
let webOrigin = 'http://127.0.0.1:1234'
const ctx = {
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
    getOrigin() {
      return webOrigin
    },
  },
  effect(callback) {
    const dispose = callback()
    return dispose
  },
}
apply(ctx)
assert.equal(routes.length, 1, 'one prefix route registered')
assert.equal(routes[0].kind, 'prefix')
assert.equal(routes[0].path, ROUTE_PREFIX)

const server = http.createServer((req, res) => routes[0].handler(req, res))
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = 'http://127.0.0.1:' + server.address().port
webOrigin = origin

async function call(pathname, options = {}) {
  const response = await fetch(origin + ROUTE_PREFIX + pathname, options)
  const body = await response.json()
  return { status: response.status, body }
}

let result = await call('/config')
assert.equal(result.status, 200)
assert.equal(result.body.ok, true)
assert.equal(result.body.config.provider, 'local')
assert.equal(result.body.config.volc.configured, false)
assert.equal(JSON.stringify(result.body).includes('apiKey'), false, 'config response never contains a key')
ok('GET /config returns sanitized defaults')

result = await call('/config', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify({ provider: 'volc', volcApiKey: 'secret-from-test', hotwords: ['GitHub', '冬阳'] }),
})
assert.equal(result.status, 200)
assert.equal(result.body.ok, true)
assert.equal(result.body.config.provider, 'volc')
assert.equal(result.body.config.volc.configured, true)
assert.equal(JSON.stringify(result.body).includes('secret-from-test'), false, 'save response omits the key')
const stored = JSON.parse(fs.readFileSync(path.join(tempDir, 'settings.json'), 'utf8'))
assert.equal(stored.volc.apiKey, 'secret-from-test', 'key persisted only on the Host')
assert.equal(fs.statSync(path.join(tempDir, 'settings.json')).mode & 0o777, 0o600, 'settings file mode')
ok('POST /config saves the provider and key without echoing it')

result = await call('/config', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
  body: JSON.stringify({ provider: 'local' }),
})
assert.equal(result.status, 403, 'cross-origin POST rejected')
assert.equal(result.body.error.code, 'origin-rejected')
ok('same-origin guard rejects a foreign Origin')

result = await call('/config', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify({ provider: 'invalid' }),
})
assert.equal(result.status, 400, 'invalid provider rejected')
ok('config validation errors are returned as JSON errors')

result = await call('/transcribe', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify({}),
})
assert.equal(result.status, 400, 'missing audio rejected')
assert.equal(result.body.error.code, 'audio-missing')

result = await call('/polish', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin },
  body: JSON.stringify({ lines: [] }),
})
assert.equal(result.status, 400, 'empty polish request rejected')
assert.equal(result.body.error.code, 'codex-empty')
ok('cloud and polish routes validate their input without calling external services')

result = await call('/health')
assert.equal(result.status, 200)
assert.equal(result.body.ok, true)
assert.equal(JSON.stringify(result.body).includes('secret-from-test'), false, 'health endpoint omits the key')
ok('GET /health reports the settings path without secrets')

result = await call('/missing', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: '{}' })
assert.equal(result.status, 404)
ok('unknown route returns 404')

server.close()
fs.rmSync(tempDir, { recursive: true, force: true })
delete process.env.FACECHAT_STATE_DIR

function ok(name) {
  console.log('ok - ' + name)
}
