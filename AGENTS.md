# AGENTS.md

给在本仓库工作的 Agent 的规则。先读 README 了解插件清单，再读本文件了解**不能做什么**。

## 仓库性质

这是 DSH 插件的**分发镜像**，不是源码源头。

- 真正的源码在 macOS 上 DSH 的 default-workspace 插件目录里。
- LaunchAgent `com.artstur.dsh-plugin-sync` 每 5 分钟按 `plugins.json` 把 12 个插件镜像过来，重新生成 `catalog.json`，有变化就自动 commit + push。
- 因此本仓库的提交信息形如 `chore: sync DSH plugins <时间戳>`。

**推论**：在本仓库直接改 `plugins/**` 的源文件，下次同步会被上游内容覆盖。真正的功能改动要改 default-workspace 里的源目录；本仓库里的改动只适合做镜像层面的修补，且改完要确认上游已同步同样的内容。

## 凭据与敏感信息（本仓库最高优先级规则）

本仓库是私有仓库，但**私有 ≠ 安全**：这里的任何东西都可能被同步到 GitHub、被打包分发、或出现在同事的 clone 里。

硬性规则：

1. **绝不把任何真实凭据写进仓库**。包括私钥、API key、token、密码、relay 凭证、签名密钥。
2. 私钥、`.env`、token 文件一律走本机路径（`~/.dsh/plugin-data/<plugin>/`），并由 `.gitignore` 覆盖：
   - 根 `.gitignore` 已有 `.env`、`.env.*`、`**/.release-key.pem`
   - 每个插件目录也各自有一份 `.gitignore`，新增插件时同样要写上
3. **发布签名私钥**（如 chat-room 的 `.release-key.pem`）只允许存在本机。仓库里只放**公钥**常量（`protocol.js` 的 `RELEASE_PUBLIC_KEY` 是公钥，可以入库）。
4. 新增读取凭据的代码时，凭据来源必须是环境变量或用户 home 下的文件，**不得**来自仓库内文件、不得来自前端可见的通道。日志和报错信息里也不要回显凭据。
5. URL 里若可能带凭据（user:pass、token 查询参数），必须先脱敏再往外传（如 quick-ask 的 `sanitizeURL` / `sanitizeSnapshot` 那样处理）。
6. **提交前自查**：提交或推送前至少确认没有新增 `.env` / `*.pem` / `*.key` / `credentials*` 文件，并对改动做一次模式扫描（`api_key|secret|token|password|BEGIN .*PRIVATE KEY` 等，注意排除主题 token、UI token 这类假阳性）。

### 凭据一旦入库怎么办

删除文件**不等于**没有泄露 —— git 历史里还在，`.gitignore` 只挡未来。必须：

1. 立刻评估影响面：这把凭据能做什么（能签发布通告、能推包、能发消息……）。
2. 轮换凭据（除非确认从未对外暴露且仓库始终私有）。
3. 用 `git filter-branch --index-filter` 或 `git filter-repo` 把文件从**所有**提交中抹掉，然后 `git reflog expire --expire=now --all && git gc --prune=now`。
4. 强推：`git push --force-with-lease=refs/heads/main:<旧SHA> origin main`（lease 用旧 SHA，避免覆盖他人的并发推送）。
5. 验证：`git log --all -S"<密钥片段>"` 与 `git cat-file --batch-all-objects --batch | grep <密钥片段>` 都是 0 命中。
6. 提醒用户：**之前 clone 过此仓库的同事本地的旧 commit 里仍可能留有副本**，需要告知。

## 代码约定

- 每个插件是独立可安装的 bundle，自带 `package.json` + `cordis.patch.yml`，目录在 `plugins/<group>/<name>/`。
- UI 文案走 `locale/zh.json` + `locale/en.json`，两种语言都要同步更新，代码里用 `ctx.locale` / `t()` 取。
- **颜色一律用主题 token**（`--dsw-alias-*`），禁止硬编码色值，这样亮/暗色主题才能继承。
- `client.js` 负责前端，`index.js` 负责 Host 侧逻辑，`protocol.js` 放共享协议与常量。
- 协议/核心逻辑改动要配测试，放在各插件的 `test/` 下，用 `node:test` 写。

## 验证

改动后跑：

    npm test

它会对每个插件做语法检查，并在插件自带 `npm test` 时运行其测试。CI（`.github/workflows/check.yml`）在 push 到 main 和 PR 时跑同一条命令。

同步器会自动提交，提交前务必自己先跑通测试，避免把失败状态推上去。

## 边界

- 同步器**不会** force push，也不会删除源插件 —— 不要改同步逻辑，除非任务明确要求。
- 本仓库不直接安装插件；安装走 DSH 的 plugin_manager。
