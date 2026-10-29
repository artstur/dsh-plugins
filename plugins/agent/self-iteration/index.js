/**
 * Self-driven Iteration — Host half.
 *
 * Watches the DSH Messages plugin (`@local/chat-room`) for received feedback
 * that looks like a DSH plugin/interface improvement. Every detected idea
 * becomes a structured requirement. When auto-iteration is on, the plugin
 * creates a **creation-mode (创造模式, preset `cordis`) main Agent** as a new
 * root Session, hands it the requirement plus the workspace plugin inventory,
 * and lets it implement/verify the iteration. The Agent reports back through
 * the `self_iteration_report` tool.
 *
 * The plugin itself never writes another plugin's code and never writes notes
 * directly: notes live in the browser, so the Client half (`client.js`) syncs
 * each completed iteration into the target plugin's Notes version log with
 * source `self-driven` (「自驱动」) and aggregates every requirement in one
 * managed note.
 *
 * Interfaces: see `CONTRACT.md` in this directory.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import {
  buildIterationPrompt,
  buildRequirement,
  canStartIteration,
  capRequirements,
  detectIdea,
  extractIncomingMessages,
  nextPendingRequirement,
  normalizeText,
  rateStats,
  resolveConfig,
  summarizePluginInventory,
} from './logic.js'

/** Same-origin HTTP prefix served to the Client half. */
export const ROUTE_PREFIX = '/plugin/self-iteration'
/** Where this plugin keeps its own state (not another plugin's data file). */
const STATE_DIR = 'self-iteration'
const STATE_FILE = 'state.json'
const STATE_VERSION = 1
const MAX_ACTION_BODY = 1_000_000

/** The Messages plugin's documented state file path. */
function defaultChatStatePath() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'plugin-data', 'chat-room', 'state.json')
}

function statePath() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'plugin-data', STATE_DIR, STATE_FILE)
}

function messageOf(error) {
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message) return error.message
    if (typeof error.code === 'string' && error.code) return 'RemoteError ' + error.code
  }
  return String(error)
}

function clampText(value, max) {
  return normalizeText(value).slice(0, max)
}

function isVersion(value) {
  return typeof value === 'string' && /^\d+(?:\.\d+){0,3}$/.test(value.trim())
}

function sanitizePoints(value, fallback) {
  const list = Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => clampText(item, 400))
    : []
  if (list.length) return list.slice(0, 4)
  return fallback ? [fallback] : []
}

/* ------------------------------------------------------------------ *
 * State persistence
 * ------------------------------------------------------------------ */

function createState(config) {
  const now = Date.now()
  return {
    version: STATE_VERSION,
    createdAt: now,
    installTime: now,
    enabled: config.enabled,
    autoIterate: config.autoIterate,
    dryRun: config.dryRun,
    scanIntervalMs: config.scanIntervalMs,
    requirements: [],
    running: null,
    seen: {},
    stats: { lastScanAt: 0, noteSync: null, lastError: '' },
  }
}

function loadState(config) {
  const fallback = createState(config)
  try {
    const text = fs.readFileSync(statePath(), 'utf8')
    const raw = JSON.parse(text)
    if (!raw || typeof raw !== 'object' || raw.version !== STATE_VERSION) return fallback
    const state = fallback
    if (typeof raw.createdAt === 'number') state.createdAt = raw.createdAt
    if (typeof raw.installTime === 'number') state.installTime = raw.installTime
    if (typeof raw.enabled === 'boolean') state.enabled = raw.enabled
    if (typeof raw.autoIterate === 'boolean') state.autoIterate = raw.autoIterate
    if (typeof raw.dryRun === 'boolean') state.dryRun = raw.dryRun
    if (Number.isFinite(raw.scanIntervalMs)) {
      state.scanIntervalMs = Math.min(600000, Math.max(0, Math.round(raw.scanIntervalMs)))
    }
    if (Array.isArray(raw.requirements)) state.requirements = raw.requirements.filter((item) => item && typeof item.id === 'string')
    if (raw.running && typeof raw.running === 'object' && typeof raw.running.requirementId === 'string') {
      state.running = {
        requirementId: raw.running.requirementId,
        sessionId: typeof raw.running.sessionId === 'string' ? raw.running.sessionId : '',
        startedAt: Number(raw.running.startedAt) || Date.now(),
        phase: typeof raw.running.phase === 'string' ? raw.running.phase : 'running',
        seenRunning: raw.running.seenRunning === true,
        reported: raw.running.reported === true,
      }
    }
    if (raw.seen && typeof raw.seen === 'object') {
      for (const id of Object.keys(raw.seen)) {
        const at = Number(raw.seen[id])
        if (Number.isFinite(at)) state.seen[id] = at
      }
    }
    if (raw.stats && typeof raw.stats === 'object') {
      if (Number.isFinite(raw.stats.lastScanAt)) state.stats.lastScanAt = raw.stats.lastScanAt
      if (raw.stats.noteSync && typeof raw.stats.noteSync === 'object') state.stats.noteSync = raw.stats.noteSync
      if (typeof raw.stats.lastError === 'string') state.stats.lastError = raw.stats.lastError
    }
    return state
  } catch (error) {
    return fallback
  }
}

function writeState(state) {
  const target = statePath()
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const temp = target + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(state), 'utf8')
    fs.renameSync(temp, target)
    return true
  } catch (error) {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * Plugin
 * ------------------------------------------------------------------ */

/** Count DSH plugin bundles directly under `dir` (cheap workspace signature). */
function countPluginBundles(dir) {
  let count = 0
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name || name.startsWith('.')) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, name, 'package.json'), 'utf8'))
        if (manifest && manifest.dsh && manifest.dsh.bundle) count += 1
        if (count >= 3) return count
      } catch (error) {
        /* not a package directory */
      }
    }
  } catch (error) {
    /* unreadable directory */
  }
  return count
}

/**
 * Pick the workspace the iteration Agent should run in.
 *
 * The Host plugin runs at the profile root, so `workingDirectory.defaultDirectory`
 * is the profile directory, not the user's plugin workspace. Prefer the
 * workspace registry entry whose path actually contains DSH plugin bundles,
 * then this plugin's own linked source directory (`<workspace>/self-iteration`),
 * then the configured value.
 */
function resolveWorkspaceRoot(config, ctx) {
  const candidates = []
  if (config.workspaceRoot) candidates.push(config.workspaceRoot)
  try {
    candidates.push(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
  } catch (error) {
    /* import.meta.url unavailable */
  }
  try {
    const registry = ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      for (const workspace of registry.list()) {
        if (workspace && typeof workspace.path === 'string') candidates.push(workspace.path)
      }
    }
  } catch (error) {
    /* registry unavailable */
  }
  try {
    const working = ctx.get('workingDirectory')
    if (working && typeof working.defaultDirectory === 'string') candidates.push(working.defaultDirectory)
  } catch (error) {
    /* working-directory service unavailable */
  }
  candidates.push(process.cwd())
  let best = null
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) continue
    const count = countPluginBundles(candidate)
    if (count > 0 && (!best || count > best.count)) best = { root: candidate, count }
    if (count >= 3) break
  }
  return best ? best.root : config.workspaceRoot || candidates.find(Boolean) || process.cwd()
}

export const inject = ['webServer']

export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const state = loadState(config)
  const logger = ctx.logger
  const workspaceRoot = resolveWorkspaceRoot(config, ctx)
  const chatStatePath = config.chatStatePath || defaultChatStatePath()

  let stopped = false
  let starting = false
  let writeTimer = null
  let lastChatErrorAt = 0
  let inventoryCache = { at: 0, value: [] }

  function persist() {
    if (writeTimer !== null) return
    writeTimer = setTimeout(() => {
      writeTimer = null
      writeState(state)
    }, 250)
    if (typeof writeTimer.unref === 'function') writeTimer.unref()
  }

  function flush() {
    if (writeTimer !== null) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    writeState(state)
  }

  function findRequirement(id) {
    return state.requirements.find((item) => item.id === id) || null
  }

  function findRequirementByMessage(messageId) {
    if (!messageId) return null
    return state.requirements.find((item) => item.messageId === messageId) || null
  }

  /* ---------------- Messages plugin source ---------------- */

  function readChatState() {
    try {
      const text = fs.readFileSync(chatStatePath, 'utf8')
      return JSON.parse(text)
    } catch (error) {
      if (error && error.code === 'ENOENT') return null
      const now = Date.now()
      if (now - lastChatErrorAt > 60_000) {
        lastChatErrorAt = now
        logger?.warn?.('self-iteration: cannot read Messages state %s: %s', chatStatePath, messageOf(error))
      }
      return null
    }
  }

  function markSeen(messageId, at) {
    if (!messageId) return
    state.seen[messageId] = Number(at) || Date.now()
    const entries = Object.entries(state.seen)
    if (entries.length > config.maxSeenMessages) {
      entries.sort((left, right) => right[1] - left[1])
      state.seen = Object.fromEntries(entries.slice(0, config.maxSeenMessages))
    }
  }

  /* ---------------- Immediate scan trigger: watch the Messages file ---------------- */

  let chatWatcher = null
  let chatWatchDebounce = null
  let chatWatchRetry = null
  let chatWatchActive = false

  function stopChatWatch() {
    chatWatchActive = false
    if (chatWatchDebounce !== null) {
      clearTimeout(chatWatchDebounce)
      chatWatchDebounce = null
    }
    if (chatWatchRetry !== null) {
      clearTimeout(chatWatchRetry)
      chatWatchRetry = null
    }
    if (chatWatcher) {
      try {
        chatWatcher.close()
      } catch (error) {
        /* already closed */
      }
      chatWatcher = null
    }
  }

  /** Coalesce the burst of events an atomic state write produces into one scan. */
  function scheduleWatchedScan() {
    if (stopped || chatWatchDebounce !== null) return
    chatWatchDebounce = setTimeout(() => {
      chatWatchDebounce = null
      if (stopped) return
      scanMessages({})
    }, 300)
    if (typeof chatWatchDebounce.unref === 'function') chatWatchDebounce.unref()
  }

  /**
   * New messages should trigger a scan immediately instead of waiting for the
   * next periodic tick. The Messages plugin has no cross-plugin event, but it
   * writes its state file for every change, so watching that file is enough —
   * and it keeps the two plugins decoupled.
   */
  function startChatWatch() {
    if (stopped || chatWatcher !== null) return
    const directory = path.dirname(chatStatePath)
    const base = path.basename(chatStatePath)
    try {
      chatWatcher = fs.watch(directory, { persistent: false }, (_event, filename) => {
        if (filename) {
          const name = String(filename)
          // Ignore image uploads and other files in the same directory; state
          // writes may go through a temporary file next to the target.
          if (name !== base && name !== base + '.tmp' && name !== '.tmp-' + base) return
        }
        scheduleWatchedScan()
      })
      chatWatchActive = true
      if (typeof chatWatcher.on === 'function') {
        chatWatcher.on('error', () => {
          stopChatWatch()
          scheduleChatWatchRetry()
        })
      }
    } catch (error) {
      chatWatcher = null
      chatWatchActive = false
      scheduleChatWatchRetry()
    }
  }

  function scheduleChatWatchRetry() {
    if (stopped || chatWatchRetry !== null) return
    chatWatchRetry = setTimeout(() => {
      chatWatchRetry = null
      startChatWatch()
    }, 15_000)
    if (typeof chatWatchRetry.unref === 'function') chatWatchRetry.unref()
  }

  /**
   * Scan the Messages state for new incoming messages.
   *
   * Normal mode processes messages that have not been considered yet. History
   * mode re-reads a time window (used by the panel's "补扫最近 24 小时" button
   * and the first install walk), deduplicating by message id.
   */
  function scanMessages(options = {}) {
    const historyHours = Number(options.historyHours)
    const history = Number.isFinite(historyHours) && historyHours > 0
    const chat = readChatState()
    if (!chat) return 0
    const messages = extractIncomingMessages(chat)
    const now = Date.now()
    const windowHours = history ? Math.min(168, Math.max(1, historyHours)) : config.lookbackHours
    const cutoff = now - windowHours * 60 * 60_000
    const baselineCutoff = state.installTime - config.lookbackHours * 60 * 60_000
    let created = 0

    for (const message of messages) {
      if (!history && state.seen[message.id] !== undefined) continue
      if (history && findRequirementByMessage(message.id)) {
        markSeen(message.id, message.at)
        continue
      }
      if (!history) markSeen(message.id, message.at)
      if (history) {
        if (message.at < cutoff) continue
      } else if (message.at < baselineCutoff) {
        continue
      }
      if (!state.enabled) continue
      const verdict = detectIdea(message.text, config)
      if (!verdict.matched) continue
      if (findRequirementByMessage(message.id)) continue
      const requirement = buildRequirement(message, {
        title: verdict.title,
        maxMessageChars: config.maxMessageChars,
      })
      state.requirements.unshift(requirement)
      created += 1
    }

    if (created) {
      state.requirements = capRequirements(
        state.requirements,
        config.maxRequirements,
        state.running && state.running.requirementId,
      )
      logger?.info?.('self-iteration: detected %d new iteration requirement(s)', created)
    }
    state.stats.lastScanAt = now
    if (created || history) persist()
    if (created) void pump()
    return created
  }

  /* ---------------- Creation-mode Agent driver ---------------- */

  function pluginInventory() {
    const now = Date.now()
    if (inventoryCache.at && now - inventoryCache.at < 60_000) return inventoryCache.value
    const entries = []
    try {
      for (const name of fs.readdirSync(workspaceRoot)) {
        if (!name || name.startsWith('.')) continue
        const dir = path.join(workspaceRoot, name)
        try {
          if (!fs.statSync(dir).isDirectory()) continue
          const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
          if (!manifest || typeof manifest.name !== 'string') continue
          if (!manifest.dsh || !manifest.dsh.bundle) continue
          entries.push({
            name: manifest.name,
            dir: name,
            description: typeof manifest.description === 'string' ? manifest.description : '',
          })
        } catch (error) {
          /* not a plugin directory */
        }
      }
    } catch (error) {
      logger?.warn?.('self-iteration: cannot enumerate workspace plugins: %s', messageOf(error))
    }
    inventoryCache = { at: now, value: summarizePluginInventory(entries) }
    return inventoryCache.value
  }

  /**
   * Best-effort display name for a target plugin, read from its shipped locale
   * files. The iteration Agent usually reports plugin_name_zh/en, but when it
   * omits them the aggregate note should still say 「消息」 rather than the
   * package id.
   */
  function pluginDisplayName(pluginId) {
    const fallback = { zh: pluginId, en: pluginId }
    if (!pluginId) return fallback
    const entry = pluginInventory().find((item) => item.name === pluginId)
    if (!entry) return fallback
    const result = { zh: '', en: '' }
    for (const lang of ['zh', 'en']) {
      try {
        const meta = JSON.parse(
          fs.readFileSync(path.join(workspaceRoot, entry.dir, 'locale', lang + '.json'), 'utf8'),
        )
        const title = meta && meta.meta && meta.meta.title
        if (typeof title === 'string' && title.trim()) result[lang] = title.trim()
      } catch (error) {
        /* locale file missing or malformed */
      }
    }
    return {
      zh: result.zh || result.en || pluginId,
      en: result.en || result.zh || pluginId,
    }
  }

  function buildPrompt(requirement) {
    return buildIterationPrompt({
      requirement,
      workspaceRoot,
      plugins: pluginInventory(),
      config,
    })
  }

  async function resolveSessionLocation() {
    const registry = ctx.get('workspaceRegistry')
    if (registry && typeof registry.resolveByPath === 'function') {
      try {
        const workspace = await registry.resolveByPath(workspaceRoot)
        if (workspace && typeof workspace.id === 'string') return { workspaceId: workspace.id }
      } catch (error) {
        /* fall back to cwd */
      }
    }
    return { cwd: workspaceRoot }
  }

  function finishRequirement(requirement, status, reason) {
    if (!requirement) return
    requirement.status = status
    requirement.finishedAt = Date.now()
    if (reason) requirement.reason = reason
    if (state.running && state.running.requirementId === requirement.id && status !== 'done') {
      state.running = null
    }
    persist()
  }

  function clearRunningIfReported() {
    if (!state.running || !state.running.reported) return
    const requirement = findRequirement(state.running.requirementId)
    if (requirement && requirement.status === 'running' && requirement.iteration) {
      requirement.status = 'done'
    }
    state.running = null
    persist()
    void pump()
  }

  async function startRequirement(requirement, source) {
    if (!requirement) return { ok: false, error: 'unknown-requirement' }
    if (state.running || starting) return { ok: false, error: 'busy' }
    if (requirement.status !== 'pending' && requirement.status !== 'failed' && requirement.status !== 'skipped') {
      return { ok: false, error: 'not-startable' }
    }
    const gate = canStartIteration({
      requirements: state.requirements,
      running: state.running,
      config,
      now: Date.now(),
    })
    if (!gate.ok) return { ok: false, error: gate.reason, startedLastHour: gate.startedLastHour }
    if (state.dryRun) {
      return { ok: true, dryRun: true, prompt: buildPrompt(requirement), requirementId: requirement.id }
    }
    const controller = ctx.get('sessionController')
    if (!controller || typeof controller.create !== 'function' || typeof controller.prompt !== 'function') {
      finishRequirement(requirement, 'failed', 'session-service-unavailable')
      return { ok: false, error: 'session-service-unavailable' }
    }
    starting = true
    const now = Date.now()
    requirement.status = 'running'
    requirement.startedAt = now
    requirement.reason = ''
    state.running = {
      requirementId: requirement.id,
      sessionId: '',
      startedAt: now,
      phase: 'creating',
      seenRunning: false,
      reported: false,
      source: source || 'auto',
    }
    persist()
    try {
      const location = await resolveSessionLocation()
      const created = await controller.create({ ...location, agentPreset: config.agentPreset })
      const sessionId = created && created.sessionId ? String(created.sessionId) : ''
      if (!sessionId) throw new Error('session.create returned no sessionId')
      requirement.sessionId = sessionId
      if (state.running && state.running.requirementId === requirement.id) {
        state.running.sessionId = sessionId
        state.running.phase = 'prompting'
      }
      persist()
      const prompt = buildPrompt(requirement)
      await controller.prompt(
        {
          requestId: randomUUID(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: prompt }],
          clientTimeZone: config.timeZone,
        },
        new AbortController().signal,
      )
      try {
        await controller.rename({ sessionId, title: '自驱动 · ' + clampText(requirement.title, 36) })
      } catch (error) {
        /* rename is cosmetic */
      }
      if (state.running && state.running.requirementId === requirement.id) {
        state.running.phase = 'running'
        state.running.startedAt = Date.now()
        state.running.seenRunning = false
      }
      logger?.info?.('self-iteration: started %s in %s', requirement.id, sessionId)
      persist()
      return { ok: true, sessionId, requirementId: requirement.id }
    } catch (error) {
      const reason = 'start-failed: ' + messageOf(error)
      logger?.warn?.('self-iteration: could not start %s: %s', requirement.id, reason)
      state.running = null
      finishRequirement(requirement, 'failed', reason)
      return { ok: false, error: messageOf(error) }
    } finally {
      starting = false
    }
  }

  async function pump() {
    if (stopped || starting || state.running) return
    if (!state.enabled || !state.autoIterate || state.dryRun) return
    const next = nextPendingRequirement(state.requirements)
    if (!next) return
    await startRequirement(next, 'auto')
  }

  function pollRunningAgent() {
    if (stopped) return
    const running = state.running
    if (!running) {
      void pump()
      return
    }
    const requirement = findRequirement(running.requirementId)
    if (!requirement) {
      state.running = null
      persist()
      return
    }
    if (running.phase === 'creating' || running.phase === 'prompting') return
    if (!running.sessionId) return
    const now = Date.now()
    const elapsed = now - (running.startedAt || now)
    const agents = ctx.get('agents')
    const agent = agents && typeof agents.get === 'function' ? agents.get(running.sessionId) : undefined
    const status = agent && agent.status
    if (status === 'running') running.seenRunning = true
    if (running.reported) {
      if (status === 'running' && elapsed < config.iterationTimeoutMs) return
      clearRunningIfReported()
      return
    }
    if (elapsed > config.iterationTimeoutMs) {
      try {
        const controller = ctx.get('sessionController')
        if (controller && typeof controller.cancel === 'function') controller.cancel({ sessionId: running.sessionId })
      } catch (error) {
        /* ignore */
      }
      state.running = null
      finishRequirement(requirement, 'failed', 'timeout')
      logger?.warn?.('self-iteration: %s timed out', requirement.id)
      return
    }
    if (status === 'idle' && (running.seenRunning || elapsed > 10_000)) {
      state.running = null
      finishRequirement(requirement, 'failed', 'no-report')
      return
    }
    if (!agent && elapsed > 60_000) {
      state.running = null
      finishRequirement(requirement, 'failed', 'agent-not-live')
    }
  }

  /* ---------------- self_iteration_report tool ---------------- */

  function installReportTool() {
    const tools = ctx.get('tools')
    if (!tools || typeof tools.register !== 'function') {
      logger?.warn?.('self-iteration: tools service unavailable; self_iteration_report not registered')
      return undefined
    }
    try {
      return tools.register({
        name: 'self_iteration_report',
        description:
          'Report the outcome of one self-driven iteration exactly once. Only available to the creation-mode Agent ' +
          'driven by the self-iteration plugin; other agents must not call it. outcome=done needs target_plugin, ' +
          'version, summary_zh and points_zh; outcome=skipped/failed needs a short reason.',
        parameters: {
          type: 'object',
          properties: {
            requirement_id: {
              type: 'string',
              description: 'The requirement_id given in the <dsh_self_iteration> prompt block.',
            },
            outcome: {
              type: 'string',
              enum: ['done', 'skipped', 'failed'],
              description: 'done = iteration implemented and verified; skipped = not an actionable request; failed = attempted but could not complete.',
            },
            target_plugin: {
              type: 'string',
              description: 'For done: the iterated plugin package name, for example @local/chat-room.',
            },
            version: {
              type: 'string',
              description: 'For done: the target plugin version after this iteration, for example 1.9.10.',
            },
            plugin_name_zh: { type: 'string', description: 'For done: the target plugin Chinese display name, for example 消息.' },
            plugin_name_en: { type: 'string', description: 'For done: the target plugin English display name, for example Messages.' },
            summary_zh: { type: 'string', description: 'For done: one Chinese sentence describing the change.' },
            summary_en: { type: 'string', description: 'For done: one English sentence describing the change.' },
            points_zh: {
              type: 'array',
              items: { type: 'string' },
              description: 'For done: 1-4 Chinese version-log bullets, identical to the entry added to the plugin.',
            },
            points_en: {
              type: 'array',
              items: { type: 'string' },
              description: 'For done: 1-4 English version-log bullets.',
            },
            reason: { type: 'string', description: 'For skipped/failed: a short reason.' },
          },
          required: ['requirement_id', 'outcome'],
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              requirement_id: { type: 'string' },
              status: { type: 'string' },
              error: { type: 'string' },
            },
          },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        execute(args, exec) {
          const agentId = exec && exec.agent && exec.agent.id ? String(exec.agent.id) : ''
          const requirementId = args && typeof args.requirement_id === 'string' ? args.requirement_id.trim() : ''
          const requirement = findRequirement(requirementId)
          if (!requirement) return { ok: false, error: 'unknown requirement_id' }
          const ownedByThisAgent =
            (state.running && state.running.sessionId === agentId) ||
            (requirement.sessionId && requirement.sessionId === agentId)
          if (!ownedByThisAgent) {
            return { ok: false, error: 'self_iteration_report is only for its own iteration session' }
          }
          if (requirement.status !== 'running') {
            return { ok: false, error: 'requirement already reported (' + requirement.status + ')', requirement_id: requirementId }
          }
          const outcome = args && typeof args.outcome === 'string' ? args.outcome : ''
          const now = Date.now()
          if (outcome === 'done') {
            const pluginId = typeof args.target_plugin === 'string' ? args.target_plugin.trim() : ''
            const version = typeof args.version === 'string' ? args.version.trim() : ''
            if (!pluginId) return { ok: false, error: 'target_plugin is required for done' }
            if (!isVersion(version)) return { ok: false, error: 'version must look like 1.2.3 for done' }
            const summaryZh = typeof args.summary_zh === 'string' ? clampText(args.summary_zh, 300) : ''
            const summaryEn = typeof args.summary_en === 'string' ? clampText(args.summary_en, 300) : ''
            const derived = pluginDisplayName(pluginId)
            const nameZh = typeof args.plugin_name_zh === 'string' && args.plugin_name_zh.trim()
              ? clampText(args.plugin_name_zh, 60)
              : derived.zh
            const nameEn = typeof args.plugin_name_en === 'string' && args.plugin_name_en.trim()
              ? clampText(args.plugin_name_en, 60)
              : derived.en
            requirement.iteration = {
              pluginId,
              pluginName: { zh: nameZh, en: nameEn },
              version,
              summary: { zh: summaryZh || summaryEn || pluginId + ' v' + version, en: summaryEn || summaryZh || pluginId + ' v' + version },
              points: {
                zh: sanitizePoints(args.points_zh, summaryZh),
                en: sanitizePoints(args.points_en, summaryEn || summaryZh),
              },
              recordedAt: now,
              noteApplied: false,
            }
            requirement.status = 'done'
            requirement.finishedAt = now
            requirement.reason = ''
          } else if (outcome === 'skipped' || outcome === 'failed') {
            requirement.status = outcome
            requirement.finishedAt = now
            requirement.reason = typeof args.reason === 'string' && args.reason.trim() ? clampText(args.reason, 300) : outcome
          } else {
            return { ok: false, error: 'outcome must be done, skipped or failed' }
          }
          if (state.running && state.running.requirementId === requirement.id) {
            state.running.reported = true
          }
          persist()
          logger?.info?.('self-iteration: %s reported %s', requirement.id, requirement.status)
          return {
            ok: true,
            requirement_id: requirement.id,
            status: requirement.status,
            note: '记录会由自驱动插件写入对应插件笔记（来源「自驱动」）和汇总笔记。',
          }
        },
        presentCall: (args) => ({
          card: 'generic',
          title: '自驱动迭代报告',
          kind: 'other',
          rawInput: args,
        }),
      })
    } catch (error) {
      logger?.warn?.('self-iteration: could not register self_iteration_report: %s', messageOf(error))
      return undefined
    }
  }

  /* ---------------- Snapshot / actions for the Client half ---------------- */

  function snapshot() {
    const requirements = state.requirements
      .slice()
      .sort((left, right) => (right.detectedAt || 0) - (left.detectedAt || 0))
      .slice(0, config.maxRequirements)
      .map((item) => ({
        id: item.id,
        title: item.title,
        text: item.text,
        contact: item.contact || { id: '', name: '' },
        messageId: item.messageId,
        receivedAt: item.receivedAt,
        detectedAt: item.detectedAt,
        status: item.status,
        reason: item.reason || '',
        sessionId: item.sessionId || '',
        startedAt: item.startedAt || 0,
        finishedAt: item.finishedAt || 0,
        iteration: item.iteration || null,
      }))
    const stats = rateStats(state.requirements, Date.now())
    return {
      version: STATE_VERSION,
      enabled: state.enabled,
      autoIterate: state.autoIterate,
      dryRun: state.dryRun,
      agentPreset: config.agentPreset,
      scanIntervalMs: Number.isFinite(state.scanIntervalMs) ? state.scanIntervalMs : config.scanIntervalMs,
      watchActive: chatWatchActive,
      workspaceRoot,
      running: state.running
        ? {
            requirementId: state.running.requirementId,
            sessionId: state.running.sessionId,
            startedAt: state.running.startedAt,
            phase: state.running.phase,
          }
        : null,
      requirements,
      stats: {
        startedLastHour: stats.startedLastHour,
        lastStartAt: stats.lastStartAt,
        lastScanAt: state.stats.lastScanAt,
        noteSync: state.stats.noteSync,
        lastError: state.stats.lastError,
      },
    }
  }

  function noteTitleFor(requirement) {
    if (!requirement || !requirement.iteration) return ''
    const name = requirement.iteration.pluginName || {}
    const display = name.zh || name.en || requirement.iteration.pluginId
    return display + '版本记录'
  }

  async function handleAction(action, body) {
    if (!action) return { ok: false, error: 'missing-action' }
    switch (action) {
      case 'scan': {
        const created = scanMessages({})
        return { ok: true, created }
      }
      case 'scanHistory': {
        const hours = Number(body && body.hours)
        const created = scanMessages({ historyHours: Number.isFinite(hours) ? hours : 24 })
        return { ok: true, created }
      }
      case 'setAuto': {
        state.autoIterate = body && body.enabled === true
        persist()
        if (state.autoIterate) void pump()
        return { ok: true, autoIterate: state.autoIterate }
      }
      case 'setScanInterval': {
        const ms = Number(body && body.ms)
        if (!Number.isFinite(ms)) return { ok: false, error: 'invalid-interval' }
        state.scanIntervalMs = Math.min(600000, Math.max(0, Math.round(ms)))
        persist()
        return { ok: true, scanIntervalMs: state.scanIntervalMs }
      }
      case 'setDryRun': {
        state.dryRun = body && body.enabled === true
        persist()
        return { ok: true, dryRun: state.dryRun }
      }
      case 'start': {
        const requirement = findRequirement(body && body.id)
        if (!requirement) return { ok: false, error: 'unknown-requirement' }
        return await startRequirement(requirement, 'manual')
      }
      case 'dismiss': {
        const requirement = findRequirement(body && body.id)
        if (!requirement) return { ok: false, error: 'unknown-requirement' }
        if (requirement.status === 'running') return { ok: false, error: 'running' }
        requirement.status = 'skipped'
        requirement.reason = 'dismissed'
        requirement.finishedAt = Date.now()
        persist()
        return { ok: true }
      }
      case 'cancel': {
        const requirement = findRequirement(body && body.id) ||
          (state.running ? findRequirement(state.running.requirementId) : null)
        if (!requirement || requirement.status !== 'running') return { ok: false, error: 'not-running' }
        const running = state.running && state.running.requirementId === requirement.id ? state.running : null
        if (running && running.sessionId) {
          try {
            const controller = ctx.get('sessionController')
            if (controller && typeof controller.cancel === 'function') {
              controller.cancel({ sessionId: running.sessionId })
            }
          } catch (error) {
            /* the Session may already be gone */
          }
        }
        state.running = null
        requirement.status = 'failed'
        requirement.reason = 'cancelled'
        requirement.finishedAt = Date.now()
        persist()
        return { ok: true }
      }
      case 'remove': {
        const id = body && body.id
        if (!id) return { ok: false, error: 'missing-id' }
        if (state.running && state.running.requirementId === id) return { ok: false, error: 'running' }
        state.requirements = state.requirements.filter((item) => item.id !== id)
        persist()
        return { ok: true }
      }
      case 'createFromText': {
        const text = body && typeof body.text === 'string' ? normalizeText(body.text) : ''
        if (text.length < 2) return { ok: false, error: 'empty-text' }
        const now = Date.now()
        const requirement = buildRequirement(
          {
            id: 'manual-' + randomUUID(),
            at: now,
            text,
            contactId: 'manual',
            contactName: typeof body.contactName === 'string' && body.contactName.trim() ? body.contactName.trim() : '手动',
            from: 'manual',
          },
          { now, source: 'manual', maxMessageChars: config.maxMessageChars },
        )
        state.requirements.unshift(requirement)
        state.requirements = capRequirements(state.requirements, config.maxRequirements, state.running && state.running.requirementId)
        persist()
        if (state.autoIterate && !state.dryRun) void pump()
        return { ok: true, id: requirement.id, requirement: snapshot().requirements.find((item) => item.id === requirement.id) }
      }
      case 'openNote': {
        const requirement = findRequirement(body && body.id)
        if (!requirement || !requirement.iteration) return { ok: false, error: 'no-note' }
        return { ok: true, noteTitle: noteTitleFor(requirement) }
      }
      case 'reportNote': {
        const report = body && body.report && typeof body.report === 'object' ? body.report : null
        if (!report) return { ok: false, error: 'missing-report' }
        const applied = Array.isArray(report.appliedIds) ? report.appliedIds.filter((id) => typeof id === 'string') : []
        for (const id of applied) {
          const requirement = findRequirement(id)
          if (requirement && requirement.iteration) requirement.iteration.noteApplied = true
        }
        state.stats.noteSync = {
          at: Number(report.at) || Date.now(),
          ok: report.ok === true,
          aggregate: report.aggregate === true,
          appliedIds: applied,
          error: typeof report.error === 'string' ? report.error : '',
        }
        persist()
        return { ok: true }
      }
      case 'state':
        return { ok: true, state: snapshot() }
      default:
        return { ok: false, error: 'unknown-action' }
    }
  }

  /* ---------------- HTTP route ---------------- */

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_ACTION_BODY) {
          reject(new Error('body-too-large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  function sendJson(res, status, value) {
    try {
      const body = JSON.stringify(value)
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

  async function handleHttp(req, res) {
    let suffix = '/'
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      suffix = url.pathname.slice(ROUTE_PREFIX.length) || '/'
    } catch (error) {
      sendJson(res, 400, { ok: false, error: 'bad-url' })
      return
    }
    try {
      if (req.method === 'GET' && (suffix === '/state' || suffix === '/')) {
        sendJson(res, 200, { ok: true, state: snapshot() })
        return
      }
      if (req.method === 'POST' && suffix === '/action') {
        let body = {}
        try {
          const raw = await readBody(req)
          body = raw ? JSON.parse(raw) : {}
        } catch (error) {
          sendJson(res, 400, { ok: false, error: 'bad-json' })
          return
        }
        if (!body || typeof body !== 'object') body = {}
        const result = await handleAction(body.action, body)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      sendJson(res, 404, { ok: false, error: 'not-found' })
    } catch (error) {
      logger?.warn?.('self-iteration: action failed: %s', messageOf(error))
      sendJson(res, 500, { ok: false, error: messageOf(error) })
    }
  }

  /* ---------------- Lifecycle ---------------- */

  ctx.effect(() => {
    startChatWatch()
    // One cheap tick drives both the periodic message scan and the Agent poll.
    // The scan interval is configurable at runtime (0 disables it), so the
    // panel's 定时扫描 setting applies without a reload.
    const timer = setInterval(() => {
      if (stopped) return
      const now = Date.now()
      const scanInterval = Number.isFinite(state.scanIntervalMs)
        ? state.scanIntervalMs
        : config.scanIntervalMs
      if (scanInterval > 0 && now - state.stats.lastScanAt >= scanInterval) scanMessages({})
      pollRunningAgent()
    }, 1000)
    if (typeof timer.unref === 'function') timer.unref()
    const startup = setTimeout(() => {
      if (stopped) return
      scanMessages({})
      void pump()
    }, 1500)
    if (typeof startup.unref === 'function') startup.unref()
    return () => {
      stopped = true
      clearInterval(timer)
      clearTimeout(startup)
      stopChatWatch()
      flush()
    }
  }, 'self-iteration-loop')

  ctx.effect(() => {
    const dispose = installReportTool()
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  }, 'self-iteration-report-tool')

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          void handleHttp(req, res)
        },
      }),
    'self-iteration-routes',
  )

  logger?.info?.(
    'self-iteration: watching %s (auto=%s dryRun=%s preset=%s workspace=%s)',
    chatStatePath,
    state.autoIterate,
    state.dryRun,
    config.agentPreset,
    workspaceRoot,
  )
}
