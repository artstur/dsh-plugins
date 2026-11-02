/**
 * Codex CLI transcript proofreader.
 *
 * Type4Me uses the locally signed-in Codex CLI for its polish step; this module
 * does the same from the DSH Host. Each request is a fresh `codex exec` with a
 * JSON Schema result, so speaker lines and their order are preserved exactly.
 * Text is sent to OpenAI through the user's Codex account and consumes Codex
 * quota; the Client only calls this after an explicit user action.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const MAX_LINES = 120
const MAX_TOTAL_CHARS = 60000
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 180000

const RESULT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    lines: { type: 'array', items: { type: 'string' } },
  },
  required: ['lines'],
  additionalProperties: false,
})

const CODEC_CANDIDATES = [
  path.join(os.homedir(), '.local', 'bin', 'codex'),
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
]

function clampText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function buildCodexPrompt({ lines, terms, language }) {
  const scope = language ? ' The conversation is mostly ' + language + '.' : ''
  const termHint = Array.isArray(terms) && terms.length
    ? ' Prefer these spellings when they occur: ' + terms.slice(0, 60).join(', ') + '.'
    : ''
  return [
    'You are proofreading an ASR transcript of a face-to-face technical conversation.',
    'Fix recognition errors, especially technical terms and proper nouns.' + scope + termHint,
    'Do not summarize, do not add content, do not merge or split lines, and do not translate.',
    'Preserve the original language mix, punctuation style and meaning.',
    'Return only JSON that matches the provided schema: an object whose "lines" array has exactly '
      + lines.length + ' string entries, in the same order as the numbered input lines.',
    '',
    'Input lines:',
    ...lines.map((line, index) => String(index + 1) + '. ' + line),
  ].join('\n')
}

export function parseCodexLines(text, expectedCount) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (!raw) return null
  const candidates = []
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  candidates.push(raw)
  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (objectMatch) candidates.push(objectMatch[0])
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const lines = parsed && Array.isArray(parsed.lines) ? parsed.lines : null
      if (!lines) continue
      const normalized = lines.map((line) => (typeof line === 'string' ? line.trim() : String(line || '').trim()))
      if (expectedCount !== undefined && normalized.length !== expectedCount) continue
      return normalized
    } catch (error) {
      /* try the next candidate */
    }
  }
  return null
}

export function resolveCodexBinary(env = process.env, fsImpl = fs) {
  const explicit = clampText(env.FACECHAT_CODEX_BIN || env.CODEX_CLI_PATH || env.CODEX_BIN, 1024)
  if (explicit) return explicit
  for (const candidate of CODEC_CANDIDATES) {
    try {
      if (fsImpl.existsSync(candidate)) return candidate
    } catch (error) {
      /* ignore */
    }
  }
  return 'codex'
}

/**
 * Create the polisher. `spawnImpl` exists so tests can inject a fake process.
 */
export function createCodexPolisher(options = {}) {
  const settings = options.settings
  const spawnImpl = options.spawnImpl || spawn
  const fsImpl = options.fsImpl || fs
  const osImpl = options.osImpl || os
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const binary = options.binary || resolveCodexBinary(options.env || process.env, fsImpl)

  async function polish({ lines, terms, language, model }) {
    const input = Array.isArray(lines)
      ? lines.map((line) => (typeof line === 'string' ? line : String(line || ''))).slice(0, MAX_LINES)
      : []
    if (!input.length) throw Object.assign(new Error('没有可润色的转写行'), { code: 'codex-empty' })
    if (input.reduce((total, line) => total + line.length, 0) > MAX_TOTAL_CHARS) {
      throw Object.assign(new Error('本次润色文本过长，请分批处理'), { code: 'codex-too-long' })
    }
    const selectedModel = clampText(model, 80)
      || clampText(settings && settings.get ? settings.get().codex.model : '', 80)
      || 'gpt-5.6-luna'
    const prompt = buildCodexPrompt({ lines: input, terms, language })
    const workDir = fsImpl.mkdtempSync(path.join(osImpl.tmpdir(), 'facechat-codex-'))
    const schemaPath = path.join(workDir, 'schema.json')
    const outputPath = path.join(workDir, 'out.json')
    fsImpl.writeFileSync(schemaPath, RESULT_SCHEMA, 'utf8')

    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '-c',
      'model_reasoning_effort="low"',
      '-m',
      selectedModel,
      '--output-schema',
      schemaPath,
      '-o',
      outputPath,
      '-',
    ]

    try {
      const result = await new Promise((resolve, reject) => {
        let stdout = ''
        let stderr = ''
        let settled = false
        let child
        let timer = null
        try {
          child = spawnImpl(binary, args, {
            cwd: workDir,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
          })
        } catch (error) {
          reject(
            Object.assign(new Error('无法启动 Codex CLI：' + (error.message || error)), { code: 'codex-spawn-failed' }),
          )
          return
        }
        const finish = (value, error) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          if (error) reject(error)
          else resolve(value)
        }
        timer = setTimeout(() => {
          try {
            child.kill('SIGTERM')
          } catch (error) {
            /* ignore */
          }
          setTimeout(() => {
            try {
              child.kill('SIGKILL')
            } catch (error) {
              /* ignore */
            }
          }, 2000)
          finish(null, Object.assign(new Error('Codex 润色超时'), { code: 'codex-timeout' }))
        }, timeoutMs)
        if (timer && typeof timer.unref === 'function') timer.unref()

        const append = (target, chunk) => {
          const text = String(chunk)
          return (target + text).slice(-MAX_OUTPUT_BYTES)
        }
        if (child.stdout) child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk) })
        if (child.stderr) child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk) })
        child.on('error', (error) => {
          finish(
            null,
            Object.assign(new Error('Codex CLI 启动失败：' + (error.message || error)), { code: 'codex-spawn-failed' }),
          )
        })
        child.on('close', (code, signal) => {
          if (code !== 0) {
            const detail = stderr.trim().split('\n').slice(-4).join(' ') || 'exit ' + code + (signal ? ' ' + signal : '')
            finish(null, Object.assign(new Error('Codex 润色失败：' + detail), { code: 'codex-failed' }))
            return
          }
          let output = ''
          try {
            output = fsImpl.readFileSync(outputPath, 'utf8')
          } catch (error) {
            output = ''
          }
          const parsed = parseCodexLines(output, input.length) || parseCodexLines(stdout, input.length)
          if (!parsed) {
            finish(null, Object.assign(new Error('Codex 返回的结果无法解析或行数不一致'), { code: 'codex-invalid-output' }))
            return
          }
          finish(parsed)
        })
        try {
          child.stdin.write(prompt)
          child.stdin.end()
        } catch (error) {
          finish(
            null,
            Object.assign(new Error('无法向 Codex CLI 写入提示词：' + (error.message || error)), { code: 'codex-stdin-failed' }),
          )
        }
      })
      return { lines: result, model: selectedModel }
    } finally {
      try {
        fsImpl.rmSync(workDir, { recursive: true, force: true })
      } catch (error) {
        /* best effort */
      }
    }
  }

  return { polish, binary }
}
