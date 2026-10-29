import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const CLIENT_PATH = new URL('../client.js', import.meta.url)

function sameDeps(left, right) {
  return !!left && !!right && left.length === right.length && left.every((value, index) => value === right[index])
}

function createReactHarness() {
  const hooks = []
  let cursor = 0
  let effects = []
  const React = {
    createElement(type, props, ...children) {
      if (typeof type === 'function') return type(Object.assign({}, props || {}, { children }))
      return { type, props: Object.assign({}, props || {}), children }
    },
    useState(initial) {
      const index = cursor++
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [hooks[index].value, (value) => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value }]
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) {
        hooks[index] = { deps }
        effects.push(effect)
      }
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { deps, value: factory() }
      return hooks[index].value
    },
  }
  return {
    React,
    render(component, props) {
      cursor = 0
      effects = []
      const tree = component(props || {})
      effects.forEach((effect) => effect())
      return tree
    },
  }
}

function createStorage(seed) {
  const store = new Map(Object.entries(seed || {}))
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null },
    setItem(key, value) { store.set(key, String(value)) },
    removeItem(key) { store.delete(key) },
  }
}

function createHarness(options = {}) {
  const storage = createStorage(options.storage)
  const localeState = { active: options.locale || 'zh', locales: [{ id: 'zh' }, { id: 'en' }] }
  const dicts = new Map()
  const locale = {
    getSnapshot() { return localeState },
    subscribe() { return () => {} },
    register(namespace, id, dict) {
      dicts.set(namespace + ':' + id, dict)
      return () => {}
    },
    bind(namespace) {
      return (key, params) => {
        const lang = String(localeState.active).startsWith('zh') ? 'zh' : 'en'
        const dict = dicts.get(namespace + ':' + lang) || {}
        const template = key in dict ? dict[key] : key
        if (typeof template !== 'string') throw new Error(namespace + '.' + key + ' must be a string')
        if (!params) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match)
      }
    },
  }

  let entry
  const providers = []
  const versionLogs = []
  const windowObject = {
    __ModuleLoader__: { load(value) { entry = value } },
    __dshPluginVersionLogQueue: [],
    __dshResourceQueue: [],
    __dshResourceSink(provider) {
      providers.push(provider)
      return () => {}
    },
    localStorage: storage,
  }
  vm.runInNewContext(fs.readFileSync(CLIENT_PATH, 'utf8'), {
    window: windowObject,
    console,
    Date,
    Map,
    Set,
    JSON,
    String,
    Number,
    Object,
    Array,
    Math,
  })

  const react = createReactHarness()
  const plugin = entry.factory((name) => {
    if (name === 'react') return react.React
    throw new Error('unexpected module: ' + name)
  })
  const registered = {}
  plugin.apply({
    locale,
    effect(effect) { return effect() },
    get(name) {
      if (name === 'pluginVersionLog') return { register: (descriptor) => versionLogs.push(descriptor) }
      return undefined
    },
    slots: {
      inject(_name, callback) { return callback() },
      register(registration, component) {
        if (registration.name === 'main') registered.main = { registration, component }
        if (registration.name === 'sidebar.panellist') registered.sidebar = { registration, component }
        return () => {}
      },
    },
  })
  return {
    registered,
    providers,
    versionLogs,
    dicts,
    storage,
    render() { return react.render(registered.main.component) },
  }
}

function walk(node, visit) {
  if (!node) return
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  if (typeof node !== 'object') return
  visit(node)
  walk(node.children, visit)
}

function textOf(node, output = []) {
  if (node === null || node === undefined || node === false) return output.join(' ')
  if (typeof node === 'string' || typeof node === 'number') {
    output.push(String(node))
    return output.join(' ')
  }
  if (Array.isArray(node)) {
    node.forEach((child) => textOf(child, output))
    return output.join(' ')
  }
  if (typeof node === 'object') textOf(node.children, output)
  return output.join(' ')
}

function byClass(tree, className) {
  const found = []
  walk(tree, (node) => {
    const value = node.props && node.props.className
    if (typeof value === 'string' && value.split(/\s+/).includes(className)) found.push(node)
  })
  return found
}

function byProp(tree, predicate) {
  const found = []
  walk(tree, (node) => {
    if (node.props && predicate(node.props)) found.push(node)
  })
  return found
}

function click(node) {
  assert.equal(typeof node.props.onClick, 'function')
  node.props.onClick()
}

test('registers the main panel and sidebar entry', () => {
  const harness = createHarness()
  assert.equal(harness.registered.main.registration.key, 'exploration')
  assert.equal(harness.registered.sidebar.registration.id, 'exploration')
  assert.equal(harness.registered.sidebar.registration.label(), '探索地图')
})

test('defaults to the six-stage causal loop', () => {
  const harness = createHarness()
  const tree = harness.render()
  const text = textOf(tree)
  for (const label of ['捕获', '记忆', '协议', '调用', '行为', '进化']) assert.match(text, new RegExp(label))
  assert.match(text, /反馈回到下一次捕获/)
  assert.match(text, /消息/)
  assert.match(text, /面聊/)
  assert.equal(byClass(tree, 'dsh-atlas-stage').length, 6)
  assert.equal(byProp(tree, (props) => props['data-stage'] === 'capture' && props['data-active'] === 'true').length, 1)
})

test('selecting a stage reveals its evidence and next experiment', () => {
  const harness = createHarness()
  let tree = harness.render()
  click(byProp(tree, (props) => props['data-stage'] === 'invoke')[0])
  tree = harness.render()
  const text = textOf(tree)
  assert.match(text, /个人工作台/)
  assert.match(text, /随手问/)
  assert.match(text, /统一显式引用、自动检索与环境上下文的路由/)
})

test('groups seven capability dimensions under three root questions', () => {
  const harness = createHarness()
  let tree = harness.render()
  click(byProp(tree, (props) => props['data-tab'] === 'dimensions')[0])
  tree = harness.render()
  const text = textOf(tree)
  for (const label of ['产品由什么构成', 'Agent 如何使用这些构成', '产品如何持续生长']) assert.match(text, new RegExp(label))
  for (const label of ['表现层可塑性', '数据生命周期', '协议组合', '上下文组织', 'Agent 行为规则', '协作边界', '自进化治理']) assert.match(text, new RegExp(label))
  assert.doesNotMatch(text, /平均/)
  assert.equal(byClass(tree, 'dsh-atlas-frontier').length, 7)
})

test('evidence view renders every curated experiment with one evidence structure', () => {
  const harness = createHarness()
  let tree = harness.render()
  click(byProp(tree, (props) => props['data-tab'] === 'evidence')[0])
  tree = harness.render()
  const text = textOf(tree)
  assert.equal(byClass(tree, 'dsh-atlas-card').length, 8)
  assert.match(text, /统一资源接口/)
  assert.match(text, /自驱动迭代/)
  assert.match(text, /Takeaway/)
  assert.match(text, /点击图片无法放大/)
})

test('records stage and frontier and exposes the new experiment as a resource', async () => {
  const harness = createHarness()
  let tree = harness.render()
  click(byProp(tree, (props) => props['data-tab'] === 'record')[0])
  tree = harness.render()
  byProp(tree, (props) => props.id === 'dsh-atlas-name')[0].props.onChange({ target: { value: '定时回顾' } })
  tree = harness.render()
  byProp(tree, (props) => props.id === 'dsh-atlas-abstraction')[0].props.onChange({ target: { value: '让产品按时间回顾一周的探索。' } })
  tree = harness.render()
  byProp(tree, (props) => props.id === 'dsh-atlas-stage')[0].props.onChange({ target: { value: 'evolve' } })
  tree = harness.render()
  byProp(tree, (props) => props.id === 'dsh-atlas-frontier')[0].props.onChange({ target: { value: 'evolution' } })
  tree = harness.render()
  click(byClass(tree, 'dsh-atlas-button')[0])
  tree = harness.render()
  assert.match(textOf(tree), /定时回顾/)

  const stored = JSON.parse(harness.storage.getItem('dsh.exploration-atlas.v1'))
  assert.equal(stored.version, 2)
  assert.equal(stored.entries[0].stage, 'evolve')
  assert.equal(JSON.stringify(stored.entries[0].frontiers), '["evolution"]')

  const found = await harness.providers[0].search({ query: '定时回顾' })
  assert.equal(found.total, 1)
  assert.equal(found.items[0].meta.stage, 'evolve')
  assert.equal(JSON.stringify(found.items[0].meta.frontiers), '["evolution"]')
})

test('removes a recorded experiment', () => {
  const seeded = JSON.stringify({
    version: 2,
    entries: [{ id: 'custom-seed', name: '种子探索', abstraction: '用于删除测试。', stage: 'memory', frontiers: ['memory'], status: 'experiment', createdAt: 1760000000000 }],
  })
  const harness = createHarness({ storage: { 'dsh.exploration-atlas.v1': seeded } })
  let tree = harness.render()
  click(byProp(tree, (props) => props['data-tab'] === 'record')[0])
  tree = harness.render()
  assert.match(textOf(tree), /种子探索/)
  click(byClass(tree, 'dsh-atlas-custom__remove')[0])
  tree = harness.render()
  assert.doesNotMatch(textOf(tree), /种子探索/)
  assert.equal(JSON.parse(harness.storage.getItem('dsh.exploration-atlas.v1')).entries.length, 0)
})

test('resource Provider searches, reads and aggregates explorations', async () => {
  const harness = createHarness()
  const provider = harness.providers[0]
  assert.equal(provider.source, 'exploration')
  assert.equal(await provider.describe('zh'), '8 条探索 · 6 个系统阶段 · 7 个能力维度')
  const notes = await provider.search({ query: '笔记' })
  assert.ok(notes.items.find((item) => item.id === 'notes'))
  const read = await provider.read({ ids: ['workbench'] })
  assert.match(read.items[0].text, /^# 个人工作台/)
  assert.match(read.items[0].text, /系统阶段: 调用/)
  assert.match(read.items[0].text, /能力维度: 表现层可塑性/)
  assert.equal(read.items[0].attributes.stage, 'invoke')
  assert.equal((await provider.read({ ids: ['all'] })).items.length, 8)
})

test('locale dictionaries contain strings and interpolate counts', () => {
  const harness = createHarness()
  for (const [name, dict] of harness.dicts) {
    for (const [key, value] of Object.entries(dict)) assert.equal(typeof value, 'string', name + '.' + key)
  }
  const text = textOf(harness.render())
  assert.match(text, /8 条真实探索/)
  assert.match(text, /7 个能力维度/)
  assert.match(text, /6 个系统阶段/)
})

test('registers the 1.1.2 external-agent release with Notes', () => {
  const harness = createHarness()
  const descriptor = harness.versionLogs[0]
  assert.equal(descriptor.id, '@local/exploration-atlas')
  assert.equal(descriptor.version, '1.1.2')
  assert.equal(descriptor.entries.length, 6)
  assert.equal(descriptor.entries[0].source, 'external')
  assert.equal(descriptor.entries[0].sourceName, 'Codex')
  for (const entry of descriptor.entries) {
    assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+08:00$/)
    assert.ok(entry.points.zh.length >= 2)
    assert.ok(entry.points.en.length >= 2)
  }
})

test('renders the rebuilt atlas in English', () => {
  const harness = createHarness({ locale: 'en' })
  let tree = harness.render()
  assert.match(textOf(tree), /Capture/)
  assert.match(textOf(tree), /Protocol/)
  click(byProp(tree, (props) => props['data-tab'] === 'dimensions')[0])
  tree = harness.render()
  assert.match(textOf(tree), /Surface plasticity/)
  assert.match(textOf(tree), /Self-evolution governance/)
})

test('uses the concise exploration and idea tab wording', () => {
  const harness = createHarness()
  const text = textOf(harness.render())
  assert.match(text, /探索/)
  assert.match(text, /灵感/)
  assert.match(text, /阶段/)
  assert.doesNotMatch(text, /补录/)
})

test('migrates old axis-based recorded entries', async () => {
  const seeded = JSON.stringify({
    version: 1,
    entries: [
      { name: '', abstraction: 'invalid' },
      { name: '旧版条目', abstraction: '从旧矩阵迁移。', axis: 'agency', status: 'experiment', createdAt: 1760000000000 },
    ],
  })
  const harness = createHarness({ storage: { 'dsh.exploration-atlas.v1': seeded } })
  const all = await harness.providers[0].search({})
  assert.equal(all.total, 9)
  const migrated = all.items.find((item) => item.title === '旧版条目')
  assert.equal(migrated.meta.stage, 'evolve')
  assert.equal(JSON.stringify(migrated.meta.frontiers), '["evolution"]')
})
