import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      if (typeof type === 'function') return type({ ...(props || {}), children })
      return { type, props: props || {}, children }
    },
    useMemo(factory) { return factory() },
  }
}

function flattenText(node, output = []) {
  if (typeof node === 'string' || typeof node === 'number') output.push(String(node))
  else if (Array.isArray(node)) node.forEach((child) => flattenText(child, output))
  else if (node && typeof node === 'object') flattenText(node.children, output)
  return output.join(' ')
}

function loadView() {
  let entry
  const context = {
    window: {
      __ModuleLoader__: { load(value) { entry = value } },
      __dshPluginVersionLogQueue: [],
    },
    console,
    Date,
    Map,
    Set,
  }
  vm.runInNewContext(fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8'), context)
  const plugin = entry.factory((name) => {
    if (name === 'react') return fakeReact()
    throw new Error(`unexpected module ${name}`)
  })
  let View
  const ctx = {
    effect(callback) { return callback() },
    get() { return null },
    slots: {
      inject(_name, callback) { return callback() },
      register(_options, component) { View = component; return () => {} },
    },
  }
  plugin.apply(ctx)
  return View
}

test('renders the official trajectory projection as one compact loop path', () => {
  const View = loadView()
  const turnLocation = {
    turn: 1,
    status: 'closed',
    end: { time: 20_000 },
  }
  const stepLocation = { kind: 'step', turn: turnLocation, step: { turn: 1, step: 1 } }
  const snapshot = {
    eventNodes: [
      { kind: 'user', seq: 1, time: 0, content: [], source: {} },
      {
        kind: 'tool-result', seq: 3, time: 9_500, callId: 's1', name: 'resource.search',
        call: { name: 'resource.search', argsRaw: '{}' }, callTime: 9_000,
        content: [{ type: 'text', text: JSON.stringify({ items: [{}, {}, {}, {}, {}] }) }],
        args: {}, subCalls: [], isError: false,
      },
      {
        kind: 'tool-result', seq: 5, time: 10_500, callId: 'r1', name: 'resource.read',
        call: { name: 'resource.read', argsRaw: '{}' }, callTime: 10_000,
        content: [{ type: 'text', text: JSON.stringify({ items: [{}, {}, {}] }) }],
        args: {}, subCalls: [], isError: false,
      },
      { kind: 'assistant', seq: 7, time: 19_000, turn: 1, step: 2, blocks: [{ kind: 'text', text: 'done' }] },
    ],
    eventLocations: new Map([[1, stepLocation], [3, stepLocation], [5, stepLocation], [7, stepLocation]]),
    requests: [
      { purpose: 'assistant', turn: 1, step: 1, startSeq: 2, startedAt: 8_000, completedAt: 9_000, status: 'complete' },
      { purpose: 'assistant', turn: 1, step: 2, startSeq: 6, startedAt: 18_000, completedAt: 19_000, status: 'complete' },
    ],
    callSchemas: new Map(),
    partial: null,
    runningCalls: [],
  }
  const tree = View({ useTrajectory: (selector) => selector(snapshot) })
  const text = flattenText(tree)
  assert.match(text, /接收问题/)
  assert.match(text, /搜索 5 条/)
  assert.match(text, /读取 3 条/)
  assert.match(text, /完成/)
  assert.match(text, /0s/)
  assert.match(text, /8s/)
  assert.match(text, /9s/)
  assert.match(text, /10s/)
  assert.match(text, /18s/)
})

test('keeps question receipt before a model request with the same timestamp', () => {
  const View = loadView()
  const turnLocation = { turn: 2, status: 'closed', end: { time: 2_000 } }
  const location = { kind: 'step', turn: turnLocation, step: { turn: 2, step: 1 } }
  const snapshot = {
    eventNodes: [
      { kind: 'user', seq: 10, time: 1_000, content: [], source: {} },
      { kind: 'assistant', seq: 12, time: 2_000, turn: 2, step: 1, blocks: [{ kind: 'text', text: 'done' }] },
    ],
    eventLocations: new Map([[10, location], [12, location]]),
    requests: [
      { purpose: 'assistant', turn: 2, step: 1, startSeq: 11, startedAt: 990, completedAt: 2_000, status: 'complete' },
    ],
    callSchemas: new Map(),
    partial: null,
    runningCalls: [],
  }
  const text = flattenText(View({ useTrajectory: (selector) => selector(snapshot) }))
  assert.ok(text.indexOf('接收问题') < text.indexOf('模型'))
})
