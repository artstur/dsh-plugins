# 自驱动迭代 · 实现契约（Shared contract）

本文件是「自驱动迭代 / Self-driven Iteration」插件的内部接口契约，供 Host 半边、Client
半边、Notes 半边并行开发时对齐。**改动接口时先改本文件，再改代码。**

插件包名：`@local/self-iteration`，目录：`default-workspace/self-iteration/`。
侧边栏 / `main` key：`selfIteration`。显示名：自驱动迭代 / Self-driven Iteration。

设计目标（用户需求）：

1. 从「消息」插件（`@local/chat-room`）收到的消息里识别与 DSH 插件迭代相关的想法，
   自己生成迭代需求，并驱动 Agent 迭代。
2. 迭代记录写进**对应插件**的笔记，来源标为「自驱动」。
3. 迭代 Agent 是 DSH 创造模式的主 Agent（Agent preset `cordis`，根 Session，不是 subagent）。
4. 所有「自驱动」需求汇总在一篇笔记里。

所有权（谁写哪些文件，避免并行冲突）：

| 文件 | 所有者 |
| --- | --- |
| `self-iteration/index.js`、`logic.js`、`test/host.test.mjs`、`package.json`、`cordis.patch.yml` | Lead |
| `self-iteration/client.js`、`locale/zh.json`、`locale/en.json`、`icon.svg`、`test/client.test.mjs` | client-ui |
| `notes-panel/client.js`、`notes-panel/test/self-driven.test.mjs`、`notes-panel/README.md`、`notes-panel/package.json` | notes-ext |
| `self-iteration/README.md`、`AGENTS.md` | Lead（集成后） |

---

## 1. Host HTTP API（Client 半边消费）

前缀：`/plugin/self-iteration`，全部同源 JSON。

### `GET /plugin/self-iteration/state`

返回 `{ ok: true, state: Snapshot }`。`Snapshot` 形态：

```ts
interface Snapshot {
  version: 1
  enabled: boolean            // 总开关
  autoIterate: boolean        // 检测到需求后是否自动驱动 Agent
  dryRun: boolean             // 试运行：只生成需求与提示词，不创建 Session
  agentPreset: string         // 默认 'cordis'（创造模式）
  running: RunningIteration | null
  requirements: Requirement[] // 按 detectedAt 倒序，最新的在前；最多 100 条
  stats: {
    startedLastHour: number
    lastStartAt: number       // ms，0 表示从未
    lastScanAt: number        // ms
    noteSync: NoteSyncEvidence | null
  }
}

interface RunningIteration {
  requirementId: string
  sessionId: string
  startedAt: number
}

type RequirementStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

interface Requirement {
  id: string              // 'req-<random>'
  title: string           // 由消息正文截取的短标题（≤40 字）
  text: string            // 消息原文（最长 1000 字）
  contact: { id: string; name: string }
  messageId: string
  receivedAt: number      // 消息时间 ms
  detectedAt: number
  status: RequirementStatus
  reason?: string         // skipped/failed 的原因
  sessionId?: string
  startedAt?: number
  finishedAt?: number
  iteration?: IterationReport
}

interface IterationReport {
  pluginId: string        // 目标插件包名，例如 '@local/chat-room'
  pluginName: { zh: string; en: string }
  version: string         // 迭代后的插件版本
  summary: { zh: string; en: string }
  points: { zh: string[]; en: string[] }   // 版本记录条目（1–4 条）
  recordedAt: number
  noteApplied: boolean    // Client 是否已把这条迭代写进目标插件笔记
}

interface NoteSyncEvidence {
  at: number
  ok: boolean
  aggregate: boolean      // 汇总笔记是否已写入
  appliedIds: string[]    // 本次成功写入「自驱动」版本记录的 requirement id
  error?: string
}
```

### `POST /plugin/self-iteration/action`

请求体：`{ action: string, ...参数 }`。成功统一返回
`{ ok: true, ... }`，失败返回 `{ ok: false, error: string }`。

| action | 参数 | 行为 |
| --- | --- | --- |
| `scan` | — | 立即扫描一次消息；返回 `{ ok, created: number }` |
| `scanHistory` | `hours?: number`（默认 24，上限 168） | 把最近 N 小时内已收到的消息重新过一遍（用于把旧的反馈补成需求） |
| `setAuto` | `enabled: boolean` | 切换自动迭代开关 |
| `start` | `id: string` | 手动立即启动一条需求（不看 auto 开关，仍受 running / 频率限制） |
| `dismiss` | `id: string` | 把一条需求标记为 `skipped` 并写明原因 `reason: 'dismissed'` |
| `cancel` | `id?: string` | 取消运行中的迭代（省略 `id` 时取消当前 running）：取消对应 Session，需求置 `failed`、`reason: 'cancelled'` |
| `remove` | `id: string` | 从列表删除一条需求 |
| `createFromText` | `text: string`, `contactName?: string` | 手动创建一条需求（测试 / 面板补充） |
| `openNote` | `id: string` | 返回 `{ ok: true, noteTitle }`，仅用于提示 |
| `reportNote` | `report: NoteSyncEvidence` | Client 汇报笔记同步结果；Host 保存进 `stats.noteSync`，并对 `appliedIds` 里的需求置 `iteration.noteApplied = true` |
| `setDryRun` | `enabled: boolean` | 切换试运行 |

Client 后台每 8 秒轮询 `state`；面板打开时每 4 秒轮询。Host 不使用 SSE。

---

## 2. Client 半边职责（`self-iteration/client.js`）

浏览器模块格式与其它插件一致：

```js
window.__ModuleLoader__.load({
  id: '@local/self-iteration',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    return { apply(ctx) { /* ... */ } }
  },
})
```

`apply(ctx)` 必须完成：

1. 注册本插件自己的版本记录（Notes 插件契约，见
   `notes-panel/templates/plugin-version-log.js`）：id `@local/self-iteration`，
   标题「自驱动迭代」，noteTitle「自驱动迭代版本记录 / Self-driven Iteration version log」，
   版本 `1.0.0`，entry `source: 'harness'`、中英文 points。保留 `CHANGELOG` 常量便于以后追加。
2. `ctx.locale.register('selfIteration', id, dict)` 注册中英文字典（参考
   `verify-before-finish/client.js`、`notes-panel/client.js`）；文案用 `ctx.locale.bind('selfIteration')`。
3. 注册侧边栏 `sidebar.panellist`：`{ id: 'selfIteration', order: 8, label: () => t('panel.label') }`
   和 `main` keyed slot `{ key: 'selfIteration' }`，均通过 `ctx.slots.inject(...)` 注册。
4. 面板：显示开关（自动迭代 / 试运行）、需求列表（状态 chip、来源联系人、消息原文、
   迭代结果、操作按钮「开始 / 忽略 / 打开会话 / 重试 / 删除」）、「立即扫描」「补扫最近 24 小时」
   按钮、笔记同步状态、错误提示。样式内联 `<style>`，只用 `--dsw-alias-*` token，
   与 Harness 视觉一致；中英文跟随 `ctx.locale`。
5. 后台笔记同步（面板关着也要跑）：`ctx.effect` 内定时（8s）拉 `state`，当
   `state` 变化（可用 JSON 指纹比较）时执行：
   a. 汇总笔记：`upsertManagedNote`（见 §3），key `self-iteration-requests`，
      中文标题「自驱动迭代需求」/ 英文 "Self-driven iteration requests"，正文见 §4。
   b. 逐条把 `requirement.iteration && !requirement.iteration.noteApplied` 记录写入
      目标插件笔记：`appendSelfDrivenEntry`（见 §3）。
   c. 结果 `POST /action {action:'reportNote', report:{at, ok, aggregate, appliedIds, error?}}`。
   笔记插件不可用时 `ok:false, error:'notes-unavailable'`，不得抛错、不得阻塞面板。
6. 监听 `ctx.locale.subscribe`，语言变化时用新语言重写汇总笔记。
7. 启动后 1.5s 先同步一次，之后定时；`ctx.effect` 清理定时器。

图标：`icon.svg`（原创，抽象「循环箭头 + 火花」），包 `exports` 已声明 `./icon`。

---

## 3. Notes 插件新增的公共接口（notes-ext 提供，client-ui 消费）

都是 `window` 上的 sink；Notes 插件尚未加载时调用方写入队列，Notes 加载后自行 drain。
两种顺序都必须安全。

### 3.1 自驱动版本记录（写进目标插件笔记）

```js
// 早于 Notes 加载时：window.__dshSelfDrivenLogQueue.push(entry)
// Notes 加载后：
const result = window.__dshSelfDrivenLogSink.append({
  pluginId: '@local/chat-room',
  pluginName: { zh: '消息', en: 'Messages' },
  noteTitle: { zh: '消息版本记录', en: 'Messages version log' }, // 可省略
  version: '1.9.10',
  at: '2026-10-29T21:40+08:00',       // 精确到分钟、带偏移
  points: { zh: ['…'], en: ['…'] },
  requirementId: 'req-…',              // 可选，仅记录
})
// result: { ok: true, status: 'created' | 'appended' | 'retimed' | 'current' | 'stale' }
//       | { ok: false, error: string }
```

行为：

- 条目固定以 `source: 'self-driven'` 写入；笔记里的标题渲染为
  `## v1.9.10 · 2026-10-29 21:40 +08:00 · 自驱动`（英文 `Self-driven`）。
- 目标插件的版本记录笔记若不存在则创建（用 `pluginName` / `noteTitle` 兜底），存在则
  按版本号幂等合并（同一版本不会重复），新条目排在旧条目上方。
- 条目持久化在 localStorage（`dsh.notes.plugin-log-extras.v1`），Notes 重新加载后仍会
  合并回对应笔记；目标插件自己的 descriptor 之后注册也不会覆盖「自驱动」条目。

### 3.2 被管理的普通笔记（汇总需求）

```js
// 早于 Notes 加载时：window.__dshManagedNoteQueue.push(note)
const result = window.__dshManagedNoteSink.upsert({
  key: 'self-iteration-requests',
  title: '自驱动迭代需求',
  body: '# 自驱动迭代需求\n\n…',
})
// result: { ok: true, status: 'created' | 'updated' | 'current' | 'error' }
//       | { ok: false, error: string }
```

行为：按 `key` 找到带 `system: 'managed-note:<key>'` 的笔记（隐藏标记），更新标题与正文；
不存在则创建。笔记在列表里显示「自动维护」。被用户删掉后，下次 Notes 加载会用
localStorage 里保存的最近一次内容重建。由调用方负责按语言生成标题与正文。

---

## 4. 汇总笔记正文（Client 生成，中文示例）

```markdown
# 自驱动迭代需求

> 本笔记由「自驱动迭代」插件自动维护。它读取「消息」里收到的插件反馈，生成迭代需求，
> 并交给创造模式的 Agent 完成；每条记录都会同时写进对应插件的版本记录，来源标为「自驱动」。

## 进行中
- **点击图片无法放大**（问号 · 2026-10-28 23:13）
  - 迭代中：session-123 · 2026-10-29 21:20 开始

## 已完成
- **点击图片无法放大**（问号 · 2026-10-28 23:13）
  - 「消息」v1.9.10 · 2026-10-29 21:55 · 自驱动
  - 点击消息里的图片会打开灯箱预览，可缩放、可关闭

## 待开始
- **…**（问号 · …）
  - 已排队，等待上一次迭代结束

## 未采纳
- **…**（…）
  - 原因：…

（没有内容的分组不输出。）
```

英文版同构（Title `Self-driven iteration requests`、分组
`In progress / Done / Queued / Not adopted`、来源 `Self-driven`）。

---

## 5. Agent 驱动（Host 内部）

- 新建根 Session：`ctx.sessionController.create({ workspaceId | cwd, agentPreset: 'cordis' })`。
  优先 `ctx.workspaceRegistry.resolveByPath(cwd)` 得到 workspaceId，让新会话出现在侧边栏。
- 投递提示词：`ctx.sessionController.prompt({ requestId, sessionId, mode: 'queue',
  content: [{ type: 'text', text: buildIterationPrompt(...) }], clientTimeZone: 'Asia/Shanghai' },
  new AbortController().signal)`。
- 用 `ctx.sessionController.rename` 把会话命名为 `自驱动 · <需求标题>`（失败忽略）。
- Host 注册工具 `self_iteration_report`（全局，但只接受 Host 跟踪中的迭代 Session 调用），
  Agent 完成/放弃/失败时调用一次，上报目标插件、版本、摘要与 points。
- 完成判定：轮询 `ctx.agents.get(sessionId)?.status`；一旦从 running/idle 变为 idle 且
  至少跑过一次，若没有 report 则标 `failed`（reason `'no-report'`）。超时
  `iterationTimeoutMs`（默认 30 分钟）取消并标 `failed`（`'timeout'`）。
- 频率限制：默认 `maxPerHour: 3`、`minIntervalMs: 5 * 60_000`；默认一次只跑一个，
  其余保持在 `pending`。
