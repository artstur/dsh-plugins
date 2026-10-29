# Loop 轨迹

一个只读的 DeepSeek Harness Client 插件，把官方
`@deepseek-ai/dsh-client-ui-trajectory` 提供的 `useTrajectory` Session 投影压缩成一条横向轨迹。

第一版只回答三个问题：Harness 何时接收了问题、何时请求模型、何时调用了搜索/读取工具，以及这一轮何时结束。它不监听聊天 DOM、不生成第二份日志，也不修改 Agent Loop。

安装后，在会话顶部的视图切换器中选择「Loop 轨迹」即可查看当前会话的最新一轮。
