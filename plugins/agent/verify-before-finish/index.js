/**
 * 完成前验证 Loop（Verify-before-Finish）— Host half.
 *
 * The default agent loop closes a turn as soon as the model stops asking for
 * tools. This plugin adds one stage to that loop: a turn that changed
 * something must carry verification evidence before it may close.
 *
 * The seam is the official `agent/turn-stopping` event. A listener that
 * objects to the closing steers a message back into the same turn
 * (`agent.steer(...)`); the machine then re-reads its inbox, so the turn stays
 * open and runs one more step. The plugin never cancels a turn, never blocks a
 * tool call and never rewrites the model's answer — it only adds one step, and
 * it gives up after `maxRounds` so a model that refuses to verify can still
 * finish.
 *
 * Evidence is read from the tools the turn actually ran:
 * - a check command (tests, lint, type check, build) counts as verification;
 * - reading back a file the turn changed counts as verification;
 * - a later change invalidates earlier evidence, so the check has to come
 *   after the last edit.
 */

import { randomUUID } from 'node:crypto'

/**
 * The producer source stamped on the message this plugin injects. The label is
 * load-bearing: an unlabeled context would render as an ordinary user prompt
 * in derived history.
 */
export const SOURCE = { kind: 'verify-before-finish' }

/** The transcript label of the injected verification request. */
export const SOURCE_SUMMARY = '完成前验证 / Verify before finish'

/** Tools that change the workspace by construction. */
export const DEFAULT_MUTATING_TOOLS = ['write', 'edit']

/** How many verification rounds one turn may be sent back for. */
export const DEFAULT_MAX_ROUNDS = 2

/**
 * Commands that count as verification. They are matched case-insensitively
 * against the whole command line, so `pnpm test` and `pnpm run test` both
 * match.
 */
export const DEFAULT_VERIFY_COMMAND_PATTERNS = [
  /\bnode\s+--test\b/,
  /\bnpm\s+(run\s+)?(test|lint|typecheck|type-check|build|check)\b/,
  /\bpnpm\s+(run\s+)?(test|lint|typecheck|type-check|build|check)\b/,
  /\byarn\s+(test|lint|typecheck|build|check)\b/,
  /\bbun\s+(test|run\s+(test|lint|build))\b/,
  /\b(pytest|unittest|nose2|tox)\b/,
  /\b(jest|vitest|mocha|jasmine|rspec|phpunit|ctest)\b/,
  /\bgo\s+(test|vet)\b/,
  /\bcargo\s+(test|check|clippy)\b/,
  /\b(mvn|gradle)\s+(test|verify|check)\b/,
  /\btsc\b/,
  /\b(eslint|biome|ruff|mypy|pyright|flake8|pylint|shellcheck)\b/,
  /\bmake\s+(check|test|build)\b/,
  /\bdocker\s+build\b/,
]

/**
 * Shell commands that count as a workspace change. Read-only commands are not
 * listed, so a turn that only looked around is never sent back.
 */
export const DEFAULT_MUTATION_COMMAND_PATTERNS = [
  /\brm\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\bmkdir\b/,
  /\btouch\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bsed\s+-i/,
  /\btee\b/,
  /\bpatch\b/,
  /\btruncate\b/,
  /(?:^|\s)\d?>{1,2}(?!&)\s*\S/,
  /\bgit\s+(commit|checkout|switch|reset|apply|am|merge|rebase|stash|clean)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(install|add|remove|uninstall|update|publish)\b/,
  /\b(pip3?|poetry|uv)\s+(install|add)\b/,
  /\bcargo\s+(add|install)\b/,
  /\bgo\s+(get|mod\s+tidy)\b/,
  /\bdocker\s+(build|rm|run)\b/,
]

/**
 * The operating policy the model reads in the system prompt. It is the
 * contract the loop stage enforces: verification is part of finishing, not an
 * optional extra.
 */
export const POLICY_TEXT = [
  'Verify before you finish.',
  '',
  'A turn is not finished when the work is written; it is finished when the work is checked. Before you close a turn that changed files:',
  '',
  '1. Re-read what you changed and confirm it contains what you intended.',
  '2. Run the checks that cover it — the project\'s tests, lint, type check, or build.',
  '3. Fix whatever fails and run the check again.',
  '',
  'Report the commands you ran and their results in your final answer. If a check cannot run here, say so explicitly instead of claiming success. A turn that changes files without verification evidence is sent back to you for one more step, so budget for the check instead of skipping it.',
].join('\n')

/**
 * Normalize a path for comparison: one separator style, no leading `./`, no
 * trailing slash.
 * @param value - the raw path.
 * @returns the normalized path.
 */
export function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
}

/**
 * Compare two paths that may be written differently (relative vs absolute).
 * @param left - the first path.
 * @param right - the second path.
 * @returns whether both point at the same file.
 */
export function samePath(left, right) {
  const a = normalizePath(left)
  const b = normalizePath(right)
  if (a === b) return true
  if (a.length > 0 && b.length > 0 && a.endsWith(`/${b}`)) return true
  if (a.length > 0 && b.length > 0 && b.endsWith(`/${a}`)) return true
  return false
}

/**
 * Test one command line against a list of patterns.
 * @param command - the command line.
 * @param patterns - the regular expressions to test.
 * @returns whether any pattern matches.
 */
export function matchesAny(command, patterns) {
  if (typeof command !== 'string' || command.length === 0) return false
  return patterns.some((pattern) => pattern.test(command))
}

/**
 * Compile a configured pattern list, falling back to the shipped defaults.
 * @param value - the configured value: an array of strings or expressions.
 * @param fallback - the default patterns.
 * @returns the compiled patterns.
 */
export function toPatterns(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) return fallback
  const compiled = []
  for (const entry of value) {
    if (entry instanceof RegExp) {
      compiled.push(entry)
      continue
    }
    if (typeof entry !== 'string' || entry.length === 0) continue
    try {
      compiled.push(new RegExp(entry, 'i'))
    } catch {
      /* an invalid pattern never matches instead of failing the plugin */
    }
  }
  return compiled.length > 0 ? compiled : fallback
}

/**
 * Resolve the plugin configuration into the options the loop stage uses.
 * @param config - the plugin config.
 * @returns the resolved options.
 */
export function resolveOptions(config = {}) {
  const raw = config && typeof config === 'object' ? config : {}
  const maxRounds = Number.isInteger(raw.maxRounds) && raw.maxRounds >= 0 ? raw.maxRounds : DEFAULT_MAX_ROUNDS
  return {
    enabled: raw.enabled !== false,
    maxRounds,
    applyToChildAgents: raw.applyToChildAgents === true,
    readBackCountsAsVerification: raw.readBackCountsAsVerification !== false,
    mutatingTools: new Set(
      Array.isArray(raw.mutatingTools) && raw.mutatingTools.length > 0
        ? raw.mutatingTools
        : DEFAULT_MUTATING_TOOLS,
    ),
    verifyTools: new Set(Array.isArray(raw.verifyTools) ? raw.verifyTools : []),
    verifyCommandPatterns: toPatterns(raw.verifyCommandPatterns, DEFAULT_VERIFY_COMMAND_PATTERNS),
    mutationCommandPatterns: toPatterns(raw.mutationCommandPatterns, DEFAULT_MUTATION_COMMAND_PATTERNS),
  }
}

/**
 * Create the per-turn bookkeeping.
 * @param turn - the turn number this state belongs to.
 * @returns the fresh state.
 */
export function createTurnState(turn) {
  return {
    turn,
    callIndex: 0,
    lastMutationAt: -1,
    lastVerificationAt: -1,
    changes: [],
    rounds: 0,
    callsSinceSteer: 0,
  }
}

/**
 * Record one tool call and classify it as a change, a verification, or
 * neither.
 * @param state - the turn state to update.
 * @param exec - the tool execution.
 * @param options - the resolved options.
 * @returns 'mutation', 'verification', or 'none'.
 */
export function classifyToolCall(state, exec, options) {
  const name = String(exec?.name ?? '')
  const args = exec?.arguments && typeof exec.arguments === 'object' ? exec.arguments : {}
  const index = state.callIndex
  state.callIndex += 1
  state.callsSinceSteer += 1

  const command = typeof args.command === 'string' ? args.command : ''
  const filePath = typeof args.file_path === 'string' ? args.file_path : ''

  if (options.mutatingTools.has(name)) {
    state.lastMutationAt = index
    if (filePath.length > 0) {
      state.changes.push({ path: filePath, tool: name })
    }
    return 'mutation'
  }

  if (name === 'bash' || name === 'pwsh' || name === 'shell' || name === 'terminal') {
    if (matchesAny(command, options.mutationCommandPatterns)) {
      state.lastMutationAt = index
      return 'mutation'
    }
    if (matchesAny(command, options.verifyCommandPatterns)) {
      state.lastVerificationAt = index
      return 'verification'
    }
    return 'none'
  }

  if (options.verifyTools.has(name)) {
    state.lastVerificationAt = index
    return 'verification'
  }

  if (options.readBackCountsAsVerification && name === 'read' && filePath.length > 0) {
    const readBack = state.changes.some((change) => samePath(change.path, filePath))
    if (readBack) {
      state.lastVerificationAt = index
      return 'verification'
    }
  }

  return 'none'
}

/**
 * Decide whether the turn still owes verification.
 * @param state - the turn state.
 * @param options - the resolved options.
 * @returns whether the turn must be sent back for one more step.
 */
export function needsVerification(state, options) {
  if (!options.enabled) return false
  if (state.lastMutationAt < 0) return false
  if (state.lastVerificationAt > state.lastMutationAt) return false
  if (state.rounds >= options.maxRounds) return false
  // The model already had its chance and used no tool at all: it declined to
  // verify, so stop asking and let the turn close.
  if (state.rounds > 0 && state.callsSinceSteer === 0) return false
  return true
}

/**
 * Build the verification request that is steered back into the turn.
 * @param state - the turn state.
 * @returns the request text.
 */
export function buildVerificationRequest(state) {
  const lines = [
    '[verify-before-finish] This turn is about to close, but it changed files without verification evidence.',
    '',
  ]
  const changes = state.changes.slice(-10)
  if (changes.length > 0) {
    lines.push('Changed in this turn:')
    for (const change of changes) lines.push(`- ${change.path} (${change.tool})`)
    lines.push('')
  }
  lines.push(
    'Verify before finishing:',
    '1. Re-read the changed files and confirm they contain what you intended.',
    '2. Run the checks that cover them (the project\'s tests, lint, type check, or build).',
    '3. Fix anything that fails, run the check again, and only then answer.',
    '',
    'Answer with the commands you ran and their results. If verification is impossible here, say why instead of skipping it.',
  )
  return lines.join('\n')
}

/**
 * Build the user-role message the loop injects.
 * @param text - the request text.
 * @returns the message.
 */
export function createVerificationMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { ...SOURCE, form: 'notice', summary: SOURCE_SUMMARY },
  }
}

/**
 * Decide whether the agent is a root agent. Child agents (subagents, team
 * members) keep their own contract unless the deployment opts in.
 * @param ctx - the plugin context.
 * @param agent - the agent that is about to close a turn.
 * @param options - the resolved options.
 * @returns whether this agent is in scope.
 */
export function isInScope(ctx, agent, options) {
  if (options.applyToChildAgents) return true
  let agents
  try {
    agents = ctx.get('agents')
  } catch {
    return true
  }
  if (!agents || typeof agents.roots !== 'function') return true
  const roots = agents.roots()
  if (roots.length === 0) return true
  return roots.some((root) => root.id === agent.id)
}

/**
 * Plugin entry point.
 * @param ctx - the plugin context.
 * @param config - the plugin config.
 */
export function apply(ctx, config = {}) {
  const options = resolveOptions(config)
  /** @type {Map<string, ReturnType<typeof createTurnState>>} */
  const states = new Map()

  /**
   * Read the state of one agent, starting a fresh turn when the turn changed.
   * @param agent - the agent.
   * @param turn - the turn number.
   * @returns the turn state.
   */
  const stateFor = (agent, turn) => {
    let state = states.get(agent.id)
    if (!state || state.turn !== turn) {
      state = createTurnState(turn)
      states.set(agent.id, state)
    }
    return state
  }

  // One turn owns one state: a new turn starts with empty evidence.
  ctx.on('agent/pre-step', (payload, next) => {
    if (payload?.agent) stateFor(payload.agent, payload.turn)
    return next()
  })

  // Observe the tools the turn runs; this plugin never changes their outcome.
  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const agent = exec?.agent
    const state = agent ? states.get(agent.id) : undefined
    if (state) classifyToolCall(state, exec, options)
    return next()
  })

  // The closing seam: a turn that changed something without evidence is sent
  // back for one more step instead of closing.
  ctx.on('agent/turn-stopping', async (payload) => {
    const { agent, turn } = payload ?? {}
    if (!agent || typeof agent.steer !== 'function') return
    const state = states.get(agent.id)
    if (!state || state.turn !== turn) return
    if (!needsVerification(state, options)) return
    if (!isInScope(ctx, agent, options)) return
    const message = createVerificationMessage(buildVerificationRequest(state))
    state.rounds += 1
    state.callsSinceSteer = 0
    try {
      await agent.steer(message)
    } catch (error) {
      // A plugin failure must never close the user's turn.
      ctx.logger?.warn?.('verify-before-finish: could not steer the verification request: %o', error)
    }
  })

  ctx.on('agent/disposed', (payload) => {
    const id = payload?.agent?.id
    if (id) states.delete(id)
  })

  // Tell the model the rule up front, so most turns verify on their own and
  // the closing seam stays quiet.
  ctx.inject(['systemPrompt'], (sectionCtx) => {
    sectionCtx.systemPrompt.section({
      name: 'verify-before-finish:policy',
      order: 700,
      text: POLICY_TEXT,
      interpolate: false,
    })
  })
}
