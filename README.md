# DSH Plugins

Celia 的 DeepSeek Harness 插件 monorepo。

仓库按插件在产品系统中的角色组织，而不是按创建时间平铺。每个子目录仍是可以独立安装的 DSH bundle。

## 目录

### Workspace experiences

直接面向用户的工作空间表面：

- notes-panel：长期笔记、版本记录与分享。
- facechat-recorder：面聊录音、话者分离与摘要。
- chat-room：跨人消息与反馈入口。
- pomodoro-timer：输入框下方的专注计时。
- exploration-atlas：探索阶段、维度与实验记录。

### Context and protocols

让数据和场景进入同一个 Agent：

- resource-api：统一 resource.search / resource.read 协议。
- knowledge-context-reference：输入框 # 引用。
- quick-ask：跨应用全局入口和当前场景上下文。

### Agent runtime

修改或观察 Agent 的行为规则：

- loop-trajectory：Agent Loop 可视化。
- verify-before-finish：完成前验证 Policy。
- access-auto-approval：普通权限请求的自动审查。
- self-iteration：从反馈到插件迭代的实验闭环。

## 安装

每个 plugins/<group>/<name> 目录保留自己的 package.json 与 cordis.patch.yml，可以单独交给 DSH plugin_manager 安装。

本地 DSH 仍从 default-workspace 中的插件目录运行；本仓库是面向 GitHub 分发的结构化镜像。

## 自动同步

macOS LaunchAgent com.artstur.dsh-plugin-sync 每 5 分钟运行一次：

1. 按 plugins.json 从 default-workspace 读取 12 个插件。
2. 排除 .git、node_modules、构建缓存、压缩包和环境变量。
3. 镜像到本仓库对应分类目录。
4. 生成 catalog.json。
5. 有变化时提交并推送到 artstur/dsh-plugins。

同步器不会删除源插件，也不会 force push。旧的独立仓库保留历史，但不再作为自动同步目标。

## 验证

    npm test

该命令会对每个插件执行语法检查，并在存在 npm test 时运行自己的测试。
