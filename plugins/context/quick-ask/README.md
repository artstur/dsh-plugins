# 随手问（Quick Ask）

在 DSH 的**任意页面**按 **⌥7（Option+7）**，唤起一个真正能用的输入框：写下问题、回车发送，DSH 会把问题连同**当前页面背景**发给当前会话，并直接切到对话里看流式回答。在 macOS 桌面版中，DSH 不在前台时也可用同一快捷键从其他应用唤起；经明确授权后，可附带当时的选中文本或前台窗口向辅助功能开放的有限文字。

在 macOS 桌面版里，⌥7 由原生 Helper 的系统级热键接管（**包括 DSH 在前台时**）：按键在输入法之前被消费，不会再向输入框漏出字符；Helper 只把「切换浮层」事件交给页面。

浮层使用与 **DSH 原生输入框同一套视觉**：原生卡片的圆角/底色/阴影、同样的输入区排版、底部工具行与圆形发送按钮；输入框仍是原生 `<textarea>`（输入法、粘贴、多行都按系统行为工作）。默认出现在**页面中间偏上**，卡片比较紧凑；左下角是「**包含当前页面**」复选框（默认勾选）。

## 为什么是「real」输入框

- 它走的是**和本机输入框同一条 prompt 通道**（`sessions.retain` → `session.beginSubmission` → `session.prompt(..., 'queue')`），不是假输入框、不是模板回复：消息会真的进入会话日志，模型真的会回。
- 输入框是原生 `<textarea>`：支持输入法（IME）、多行、自动增高、`Shift+Enter` 换行、`Esc` 关闭。
- 发送前会先在会话里建本地回显，随后展开对话页，回答照常流式出现（工具调用、审批也都在对话里）。

## 核心行为

| 行为 | 说明 |
| --- | --- |
| ⌥7 唤起 / 收起 | macOS 桌面版由原生 Helper 的系统热键接管（含 DSH 前台时），按键在输入法之前被消费，不会再残留 “7”；无 Helper 时回退到**捕获阶段** DOM 处理并 `preventDefault`。另备 `⌘⇧7`（Windows/Linux 为 `Ctrl+Shift+7`） |
| 基于当前页面 | 自动附带「当前面板名称 + 当前会话标题/ID」，序列化为 `<dsh_quick_ask …>…</dsh_quick_ask>` 块放在问题前面 |
| 干净的聊天记录 | 通过 `uiConversation.userText` 规则 + `conversation.user.text.node` 渲染器，把该块显示成「页面 · 消息」小 chip：模型看到完整背景，人只看到一句提问 |
| 原生输入框视觉 | 原生卡片同款圆角/底色/阴影与排版；默认在页面中间偏上、卡片更小；底部左侧是「包含当前页面」复选框，右侧是当前会话名与原生圆形发送按钮 |
| 页面背景开关 | 左下角「包含当前页面」复选框（默认勾选）：取消勾选就只发原始问题，不带页面背景 |
| 没有打开的会话 | 提示并给出「新建会话」入口；新会话出现后按 Enter 发送（不会自动重发） |
| 会话正在运行 | 提示「问题会排队」，按默认 busy-Enter 策略以 queue 模式投递 |
| 失败处理 | 会话服务不可用 / 发送被拒 / 传输异常都会在输入框内显示原因，草稿不丢 |

## 页面背景里到底有什么

```
<dsh_quick_ask page="dsh-chatroom" label="消息" session="session-…" title="会话标题">
The user asked this from the DeepSeek Harness global quick-ask box (Option+7), which works on every page.
Page the user is on: 消息 (dsh-chatroom).
Conversation receiving the question: 会话标题 (session-…).
Use this page as background for the answer; the user is switched to this conversation to read the reply.
</dsh_quick_ask>
```

- 序列化块后面紧跟一个空格再跟问题：模型能读到完整背景，聊天里则显示为「页面 · 消息」chip 紧接问题。
- 面板名称来自 `sidebar.panellist` 的实时注册标签；对话页则是 `conversation`。
- 当前会话来自 sessions 列表里 `retainedBy.mainView > 0` 的那一行，所以停在插件页（对话被卸载）时也能找到「上一次的会话」。
- 没有当前页面/会话信息时不编造，只发问题本身。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半边：注册经 DSH owner 认证的本地 RPC，管理原生 Helper 生命周期、一次性快照、单桌面客户端租约、前台 toggle 转发与长轮询 |
| `client.js` | Client 半边：⌥7/⌘⇧7 快捷键、原生样式浮层、桌面桥接状态/授权/预览、上下文序列化 + chip 渲染、真实 prompt 投递 |
| `native/QuickAskHelper.swift` | macOS 全局 Option+7、前台应用识别、选区/有界 AX 文本采集、DSH 唤起与取消后返回来源 |
| `cordis.patch.yml` | 向 profile 插入 `quick-ask` 插件行 |
| `locale/*.json` | 插件页标题与说明（中/英） |
| `icon.svg` | 插件图标 |
| `test/client.test.mjs` | 单元测试（`node --test test/*.test.mjs`） |

## 安装

把本目录（绝对路径）交给 `plugin_manager` 的 `install_bundle`。纯客户端更新通常可热加载；首次接入或更新原生 Helper 后，必须**完全退出 DSH 再重新打开**，否则运行中的旧助手会继续使用旧二进制（⌥7 漏字符的修复需要新助手生效）。DSH 需保持运行，全局快捷键才能生效。

v1.3.13 将连接生命周期与浮层生命周期分离，避免 connection 重建后本地快捷键和外部快照一起失效；恢复可见窗口时立即重新轮询，原生助手经宿主正式 `dsh://open` 入口恢复最小化窗口并聚焦。取消外部提问时尝试通过系统启动入口返回来源应用。

## 验证

```bash
npm test                     # 客户端与 Host 回归：上下文、快捷键、延迟注入/重连、长轮询 toggle、发送和安全边界
npm run build:native         # 重建 macOS 原生 Helper（改了 QuickAskHelper.swift 后必须重跑）
./native/QuickAskHelper.app/Contents/MacOS/QuickAskHelper --self-test   # 原生策略自检
node --check client.js
node --check index.js
node ../notes-panel/tools/check-version-logs.mjs   # 版本记录注册检查
```

## 外部应用上下文边界

- 外部读取**默认关闭**；必须在浮层中明确点击授权，macOS 辅助功能授权也是独立条件。
- 只在用户于其他应用主动按 Option+7 的那一刻采集：优先选中文本，否则最多读 16000 字符的有界 AX 文本。
- 不截屏、不 OCR、不读剪贴板、不后台持续采集；可识别的密码/安全控件会跳过。
- 文本先在本机浮层预览，可取消勾选；只在主动发送问题后随 prompt 进入当前 DSH 会话。快照最长保留 2 分钟。
- 该原生桥接当前只支持 macOS；Windows/Linux 暂仅支持 DSH 应用内快捷键，不应宣称全 PC 读取。

## 内容存储边界

**本插件不拥有任何本地内容。** 没有存储、没有资源 Provider（不向 `@local/resource-api` 注册来源）：输入框草稿只存在页面内存里，页面背景来自实时 UI 注册表，会话消息由会话本身持有。

## 快捷键与输入法（重要）

- **macOS 桌面版（推荐路径）**：原生 Helper 始终注册系统级 `⌥7` 热键，DSH 在前台时也不暂停。macOS 会在输入法之前消费该按键，所以它既不会在输入框里留下 `7`，也不会让输入法停在组合状态（此前会在用过 ⌥7 后，正常打字先带出一个 `7`）。Helper 只向页面发一个 `toggle` 事件。
- **没有 Helper 时（浏览器、非 macOS、或 Helper 停止）**：回退到捕获阶段 DOM 处理，`preventDefault` + `stopPropagation` 阻止字符/事件继续传播；同样对已由本地处理过的同一按键做 400ms 去重。
- 备用快捷键始终可用：macOS 是 `⌘⇧7`，Windows/Linux 是 `Ctrl+Shift+7`。
- 焦点在底部终端（`.xterm`）或有原生弹窗/菜单打开时，快捷键不会抢占按键。
- 更新原生 Helper 后需要**完全退出并重新打开 DSH**；只刷新页面不会替换正在运行的原生助手。

## 已知边界

- 两个快捷键都是固定的（在设置 → 快捷键里以只读行显示，不进入可编辑列表），以保证「随时可唤起」。
- 浮层不是模态对话框：不锁定页面焦点，Tab 仍可能落到背后页面；`Esc` 或点击浮层外关闭。
- 「新建会话」需要当前工作区有可用的新建目标；没有工作区时只显示失败提示。
- 自动切到对话页依赖 `uiWorkspace.openSession`；如果切换失败，消息仍已发送，返回结果里 `revealed: false`。
- 发送后会自动切到对话页；回答不内嵌在浮层里（对话页才有完整的流式回答、工具调用和审批）。
- 「当前页面」是面板级信息（面板名称 + 会话），不会抓取插件页面内部 DOM 文本——不读别的插件的界面。
