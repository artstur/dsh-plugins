# 自进化的AI工作台

这是我基于 DeepSeek Harness 做的一组插件实验：让日常信息进入同一个工作空间，也让使用中的反馈成为产品下一次迭代的起点。

[观看 62 秒演示录屏](https://github.com/artstur/dsh-plugins/releases/tag/demo-video-2026-11-09)

## 从三种信息入口开始

| 插件 | 对应的信息流 | 用户得到什么 |
| --- | --- | --- |
| [笔记](plugins/workspace/notes-panel) | 个人的长期沉淀 | 记录想法、保存图片、搜索、分享，并留下插件版本记录 |
| [面聊](plugins/workspace/facechat-recorder) | 面对面的交流 | 录音、逐字稿、话者分离，以及按话者整理的摘要 |
| [消息](plugins/workspace/chat-room) | 人与人在 IM 信道上的沟通 | 与联系人交流，也可以在「我聊」里给自己留下想法 |

内容由各自的插件保存。[端侧资源接口](plugins/context/resource-api)提供统一的 `search` / `read` 协议；输入框中的 [`#` 引用](plugins/context/knowledge-context-reference)可以选择笔记、面聊或消息，在发送时读取最新内容，交给 Agent 回答。用户仍能在对话里看到清楚的引用对象。

## Aha moment：消息成为产品的迭代入口

我或联系人在「消息」里提出一条关于产品的意见，例如“点击图片无法放大捏”，[自驱动迭代](plugins/agent/self-iteration)会扫描消息、识别相关反馈并生成需求。开启自动迭代时，它会创建 DSH 创造模式会话，让 Agent 判断能否实现、修改插件并验证；迭代结果写回笔记中的需求汇总和对应插件的版本记录。

```text
「我聊」里的想法 / 联系人发来的反馈
  → 识别产品需求
  → DSH 创造模式尝试实现与验证
  → 笔记记录结果和版本
  → 下一次使用时体验变化
```

**一次普通的沟通，开始参与塑造沟通所用的产品。** 这就是这组插件最想验证的体验。

当前的需求识别采用保守规则：只处理「我聊」里自己写下的想法和联系人发来的产品相关反馈；问候、纯链接与无关聊天会被忽略。自动迭代可以关闭或设为试运行，执行有频率限制，Agent 也可以判断需求暂不可做。这里展示的是一个可观察的产品实验，而不是对每条消息都保证自动更新。

## 12 个插件如何组合

| 层次 | 插件 | 作用 |
| --- | --- | --- |
| 工作空间 | [笔记](plugins/workspace/notes-panel) · [面聊](plugins/workspace/facechat-recorder) · [消息](plugins/workspace/chat-room) · [番茄钟](plugins/workspace/pomodoro-timer) · [探索地图](plugins/workspace/exploration-atlas) | 捕获、沉淀和呈现人的工作与交流 |
| 数据与入口 | [资源接口](plugins/context/resource-api) · [`#` 引用](plugins/context/knowledge-context-reference) · [随手问](plugins/context/quick-ask) | 让 Agent 在具体场景里找到需要的内容 |
| Agent 运行 | [Loop 轨迹](plugins/agent/loop-trajectory) · [完成前验证](plugins/agent/verify-before-finish) · [权限审查](plugins/agent/access-auto-approval) · [自驱动迭代](plugins/agent/self-iteration) | 让运行过程可见，并尝试修改验证、授权和迭代规则 |

每个目录都是可独立安装的 DSH bundle；它们也可以通过统一协议组合。插件的具体功能、依赖和使用边界见各自的 README。

## 我想继续验证的产品问题

DSH 让我第一次具体地体验到“言出法随”：说出一个需求，Agent 可以把它做成工作空间里可见、可用的能力。消息驱动的自迭代又把反馈接到了下一次改动上。我想继续探索：

1. 用户如何只表达需求，就能自然地获得新能力，而无需理解插件或 Agent Loop？
2. 当真实对话可以触发产品改动，哪些步骤应自动完成，哪些需要用户确认？
3. 当能力持续生长，统一的资源协议和界面规则如何让产品保持简洁、清晰、可控？

## 安装与仓库维护

本仓库是公开的分发镜像。DSH 实际运行的插件源码位于本机 `default-workspace`；每个 `plugins/<group>/<name>` 目录保留独立的 `package.json` 和 `cordis.patch.yml`，可交给 DSH `plugin_manager` 安装。

macOS LaunchAgent `com.artstur.dsh-plugin-sync` 每 5 分钟按 [`plugins.json`](plugins.json) 将 12 个插件同步到对应目录，更新 [`catalog.json`](catalog.json)，有变化时提交并推送到 GitHub。同步器不删除源插件，也不强制推送。

验证全部插件：

```bash
npm test
```

该命令检查各插件的语法，并运行它们自带的测试。
