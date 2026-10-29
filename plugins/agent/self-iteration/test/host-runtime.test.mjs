import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { apply, ROUTE_PREFIX } from '../index.js'

const PNG_MESSAGE = { id: 'm-zoom', at: Date.parse('2026-10-28T15:13:00Z'), mine: false, text: '点击图片无法放大捏' }

function writeChatState(home, messages) {
  const file = path.join(home, 'plugin-data', 'chat-room', 'state.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 3,
      contacts: [{ id: 'c1', name: '问号' }],
      threads: { c1: messages },
    }),
    'utf8',
  )
  return file
}

function makeHarness(home) {
  const routes = []
  const tools = new Map()
  const agentStatus = new Map()
  const controller = {
    creates: [],
    prompts: [],
    renamed: [],
    async create(request) {
      this.creates.push(request)
      const sessionId = 'session-' + this.creates.length
      agentStatus.set(sessionId, 'running')
      return { sessionId, agentPreset: request.agentPreset }
    },
    async prompt(request) {
      this.prompts.push(request)
      return { accepted: true }
    },
    async rename(request) {
      this.renamed.push(request)
      return { title: request.title, seq: 1 }
    },
    cancel() {},
  }
  const services = {
    sessionController: controller,
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    agents: { get: (id) => (agentStatus.has(id) ? { id, status: agentStatus.get(id) } : undefined) },
    workspaceRegistry: { resolveByPath: async () => ({ id: 'ws-test' }) },
    workingDirectory: { defaultDirectory: home },
  }
  const disposers = []
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    get(name) {
      return services[name]
    },
    effect(fn) {
      const disposer = fn()
      if (typeof disposer === 'function') disposers.push(disposer)
      return () => {}
    },
  }
  return { ctx, routes, tools, controller, agentStatus, disposers }
}

function makeRequest(method, suffix, body) {
  const stream = new Readable({ read() {} })
  stream.method = method
  stream.url = ROUTE_PREFIX + suffix
  if (body !== undefined) stream.push(JSON.stringify(body))
  stream.push(null)
  return stream
}

function makeResponse() {
  return {
    status: 0,
    body: '',
    writeHead(status) {
      this.status = status
    },
    end(body) {
      this.body = body
    },
    destroy() {},
  }
}

async function call(routes, method, suffix, body) {
  const route = routes[0]
  assert.ok(route, 'route registered')
  const response = makeResponse()
  route.handler(makeRequest(method, suffix, body), response)
  // The handler finishes within a microtask + async body read.
  for (let attempt = 0; attempt < 100 && response.status === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.notEqual(response.status, 0, 'response produced for ' + method + ' ' + suffix)
  return { status: response.status, json: JSON.parse(response.body) }
}

async function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}

test('Host half drives one full dry-run → start → report → auto-pump cycle', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-self-iteration-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  writeChatState(home, [
    { id: 'greeting', at: Date.parse('2026-10-28T15:00:00Z'), mine: false, text: '你好' },
    PNG_MESSAGE,
  ])
  const harness = makeHarness(home)
  try {
    apply(harness.ctx, {
      enabled: true,
      autoIterate: false,
      dryRun: false,
      scanIntervalMs: 1000,
      agentPollIntervalMs: 1000,
      minIntervalMs: 0,
      maxPerHour: 10,
      workspaceRoot: home,
    })

    // 1. Scanning the Messages state produces one pending requirement.
    const scanned = await call(harness.routes, 'POST', '/action', { action: 'scanHistory', hours: 24 })
    assert.equal(scanned.json.ok, true)
    assert.equal(scanned.json.created, 1)
    let state = (await call(harness.routes, 'GET', '/state')).json.state
    assert.equal(state.requirements.length, 1)
    const requirement = state.requirements[0]
    assert.equal(requirement.contact.name, '问号')
    assert.equal(requirement.status, 'pending')
    assert.equal(requirement.title, '点击图片无法放大')
    assert.equal(harness.tools.has('self_iteration_report'), true)

    // 2. Dry run returns the exact prompt without creating a Session.
    await call(harness.routes, 'POST', '/action', { action: 'setDryRun', enabled: true })
    const dry = await call(harness.routes, 'POST', '/action', { action: 'start', id: requirement.id })
    assert.equal(dry.json.ok, true)
    assert.equal(dry.json.dryRun, true)
    assert.ok(dry.json.prompt.includes('点击图片无法放大捏'))
    assert.ok(dry.json.prompt.includes('requirement_id: ' + requirement.id))
    assert.equal(harness.controller.creates.length, 0)

    // 3. A real start creates one creation-mode root Session and delivers the prompt.
    await call(harness.routes, 'POST', '/action', { action: 'setDryRun', enabled: false })
    const started = await call(harness.routes, 'POST', '/action', { action: 'start', id: requirement.id })
    assert.equal(started.json.ok, true)
    assert.equal(started.json.sessionId, 'session-1')
    assert.equal(harness.controller.creates.length, 1)
    assert.equal(harness.controller.creates[0].workspaceId, 'ws-test')
    assert.equal(harness.controller.creates[0].agentPreset, 'cordis')
    assert.equal(harness.controller.prompts.length, 1)
    assert.equal(harness.controller.prompts[0].sessionId, 'session-1')
    assert.deepEqual(harness.controller.prompts[0].content[0].type, 'text')
    assert.ok(harness.controller.renamed[0].title.startsWith('自驱动 · '))
    state = (await call(harness.routes, 'GET', '/state')).json.state
    assert.equal(state.running.sessionId, 'session-1')

    // 4. The report tool records the iteration (and refuses foreign agents).
    const report = harness.tools.get('self_iteration_report')
    const foreign = await report.execute(
      { requirement_id: requirement.id, outcome: 'skipped', reason: 'x' },
      { agent: { id: 'someone-else' } },
    )
    assert.equal(foreign.ok, false)
    const done = await report.execute(
      {
        requirement_id: requirement.id,
        outcome: 'done',
        target_plugin: '@local/chat-room',
        plugin_name_zh: '消息',
        plugin_name_en: 'Messages',
        version: '1.9.10',
        summary_zh: '点击消息里的图片会打开灯箱预览。',
        summary_en: 'Clicking an image in a message opens a lightbox preview.',
        points_zh: ['图片支持点击放大预览'],
        points_en: ['Images open in a zoomable preview'],
      },
      { agent: { id: 'session-1' } },
    )
    assert.equal(done.ok, true)
    state = (await call(harness.routes, 'GET', '/state')).json.state
    const doneRequirement = state.requirements.find((item) => item.id === requirement.id)
    assert.equal(doneRequirement.status, 'done')
    assert.equal(doneRequirement.iteration.pluginId, '@local/chat-room')
    assert.equal(doneRequirement.iteration.version, '1.9.10')
    assert.equal(doneRequirement.iteration.noteApplied, false)
    const second = await report.execute(
      { requirement_id: requirement.id, outcome: 'done', target_plugin: '@local/chat-room', version: '1.9.10' },
      { agent: { id: 'session-1' } },
    )
    assert.equal(second.ok, false)

    // 5. Once the Agent is idle the loop clears the slot; auto-iteration then
    //    starts the next queued requirement on its own.
    harness.agentStatus.set('session-1', 'idle')
    await call(harness.routes, 'POST', '/action', {
      action: 'setAuto',
      enabled: true,
    })
    await call(harness.routes, 'POST', '/action', {
      action: 'createFromText',
      text: '消息图片看不清，希望支持双击放大',
      contactName: '问号',
    })
    const pumped = await waitFor(() => harness.controller.creates.length === 2)
    assert.equal(pumped, true, 'auto pump started the queued requirement')
    const pumpedState = (await call(harness.routes, 'GET', '/state')).json.state
    const queued = pumpedState.requirements.find((item) => item.contact.name === '问号' && item.status === 'running')
    assert.ok(queued, 'second requirement is running')
    assert.equal(harness.controller.prompts.length, 2)

    // 6. Note-sync evidence is stored so the Client half can be verified.
    const reported = await call(harness.routes, 'POST', '/action', {
      action: 'reportNote',
      report: { at: Date.now(), ok: true, aggregate: true, appliedIds: [requirement.id] },
    })
    assert.equal(reported.json.ok, true)
    state = (await call(harness.routes, 'GET', '/state')).json.state
    assert.equal(state.stats.noteSync.ok, true)
    assert.equal(state.requirements.find((item) => item.id === requirement.id).iteration.noteApplied, true)

    // 7. State is persisted for a restart (writes are debounced).
    const stateFile = path.join(home, 'plugin-data', 'self-iteration', 'state.json')
    const persistedOk = await waitFor(() => {
      try {
        const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
        return persisted.requirements.length >= 1 && persisted.running && persisted.running.sessionId === 'session-2'
      } catch (error) {
        return false
      }
    }, 3000)
    assert.equal(persistedOk, true, 'state file persisted the running iteration')
  } finally {
    for (const dispose of harness.disposers.reverse()) {
      try {
        dispose()
      } catch (error) {
        /* ignore */
      }
    }
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('Host half reports a clean failure when the Session controller is missing', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-self-iteration-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  writeChatState(home, [PNG_MESSAGE])
  const harness = makeHarness(home)
  // Remove the Session service, then start from a requirement created by hand.
  const originalGet = harness.ctx.get
  harness.ctx.get = (name) => (name === 'sessionController' ? undefined : originalGet.call(harness.ctx, name))
  try {
    apply(harness.ctx, { enabled: true, autoIterate: false, workspaceRoot: home, minIntervalMs: 0 })
    const created = await call(harness.routes, 'POST', '/action', {
      action: 'createFromText',
      text: '希望消息列表支持按联系人搜索',
    })
    assert.equal(created.json.ok, true)
    const started = await call(harness.routes, 'POST', '/action', { action: 'start', id: created.json.id })
    assert.equal(started.json.ok, false)
    assert.equal(started.json.error, 'session-service-unavailable')
    const state = (await call(harness.routes, 'GET', '/state')).json.state
    const requirement = state.requirements.find((item) => item.id === created.json.id)
    assert.equal(requirement.status, 'failed')
    assert.match(requirement.reason, /session-service-unavailable/)
  } finally {
    for (const dispose of harness.disposers.reverse()) {
      try {
        dispose()
      } catch (error) {
        /* ignore */
      }
    }
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    fs.rmSync(home, { recursive: true, force: true })
  }
})
