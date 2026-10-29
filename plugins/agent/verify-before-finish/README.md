# 完成前验证 Loop（Verify before Finish）

在默认的 agent loop 上新增一个收尾关卡：**一轮改动了文件，却没有验证证据时，不允许直接结束这一轮。**

默认的 agent loop 结束一轮的方式很朴素——模型不再要工具，这一轮就关闭了。本插件不改这个机制，只在关闭之前多问一句「你验证过了吗」，并把没验证过的那一轮重新打开，让它再跑一步验证。

## 工作方式

使用的接缝是官方事件 `agent/turn-stopping`（"the turn is about to close"）。该事件的官方约定是：监听器若不同意这一轮关闭，就 `agent.steer(...)` 送一条消息回去，机器随后重新读取收件箱——有新输入就再跑一步，没有才关闭。

因此本插件：

1. 在 `agent/pre-step` 上按轮次建立一份记账（这一轮改了哪些文件、有没有验证证据）；
2. 在 `tools/post-execute` 上只观察、不改写工具结果，把每次工具调用分类成「改动」「验证」或「无关」；
3. 在 `agent/turn-stopping` 上，如果这一轮有改动、但最后一次改动之后没有验证证据，就 `agent.steer(...)` 一条验证请求，把这一轮重新打开，多跑一步。

插件**不会**取消轮次、不会拦截任何工具调用、也不会改写模型的答案。它只多加一步，并且最多回头 `maxRounds` 轮（默认 2），所以模型拒绝验证时仍然可以正常结束。

同时，插件向系统提示词注册 `verify-before-finish:policy` 段（order 700，位于 plan / team 策略之后、工具说明之前），让模型一开始就知道这条规则。绝大多数轮次因此会自己完成验证，收尾关卡保持安静。

## 验证证据的判定

| 证据 | 判定方式 |
|---|---|
| 检查命令 | bash / pwsh 命令行匹配测试、lint、类型检查、构建等模式（`npm test`、`pnpm run build`、`pytest`、`go test`、`cargo clippy`、`tsc`、`eslint`、`make check`……） |
| 读回改动 | `read` 读回本轮改过的那个文件（相对路径与绝对路径视为同一个） |
| 显式工具 | 配置在 `verifyTools` 里的工具名 |

改动本身：配置在 `mutatingTools` 里的工具（默认 `write`、`edit`），以及会改动工作区的 shell 命令（`rm`、`mv`、`sed -i`、重定向、`git commit`、`npm install`……）。只读的 shell 命令（`ls`、`cat`、`git status`）不算改动。

**证据会被新改动作废**：验证之后再改文件，需要重新验证——所以检查必须发生在最后一次编辑之后。

## 配置

插件没有配置 schema，`apply(ctx, config)` 直接读取普通字段（未声明 schema 时 Loader 原样传入）：

```yaml
- id: verify-before-finish
  name: '@local/verify-before-finish'
  config:
    enabled: true                  # 关掉整个阶段
    maxRounds: 2                   # 一轮最多回头几次
    applyToChildAgents: false      # 是否也管 subagent / team member
    readBackCountsAsVerification: true
    mutatingTools: ['write', 'edit']
    verifyTools: []
    verifyCommandPatterns: []      # 字符串正则；空数组表示用内置模式
    mutationCommandPatterns: []    # 字符串正则；空数组表示用内置模式
```

## 在哪里可以看到这个改动

- **插件页**：Harness Web GUI 侧栏「插件」→ 官方/本地分组里的 **完成前验证 / Verify before Finish** 卡片（标题、说明与图标来自 `locale/*.json`）。
- **对话记录**：关卡真的介入时，聊天里会出现一条带来源标签「完成前验证 / Verify before finish」的合成用户消息，里面列出这一轮改过的文件，并要求先验证再回答；随后模型会多跑一步验证（跑测试 / 读回文件），再给出最终答案。
- **系统提示词**：模型每一步都能读到 `verify-before-finish:policy` 段。
- **安装位置**：`~/.dsh/profiles/<profile>/package.json` 的 `dependencies` 与 `dsh.profile.bundles`（由 `plugin_manager` 写入）。插件自己的 Loader 补丁在包内的 `verify-before-finish/cordis.patch.yml`，由 bundle 层组合进 profile；profile 的 `cordis.patch.yml` 不会被改动。
- **版本记录**：笔记插件会自动维护一条「完成前验证版本记录」笔记（由本插件的 `client.js` 注册）。

## 验证

```bash
npm test        # node --test test/*.test.mjs
node --check index.js
node --check client.js
```

测试覆盖改动/验证分类、证据失效、轮次预算、模型拒绝验证时不再追问、路径比较，以及注入消息的形状。当前 16 个用例全部通过。

## 内容边界

**本插件不拥有任何内容。** 它没有本地存储，也不读写工作区文件——它只看 agent 这一轮跑过哪些工具调用，把判断结果留在内存里。因此它不向端侧资源接口（`@local/resource-api`）注册 Provider。

## 已知边界

- 只看**工具调用**：模型只在正文里声称「已验证」不算证据。
- `bash` 的判定是模式匹配，不是真正的语义分析；写错命令名的检查不会被算作验证。
- 默认只作用于根 agent；subagent 与 team member 需要 `applyToChildAgents: true`。
- 子 agent 回合短、常常只交付结论，默认不关它们的门。
- 状态只存在内存里，恢复会话后从零开始（与 `dsh-repeat-tool-reminder` 的取舍一致）。
