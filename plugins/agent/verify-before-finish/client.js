window.__ModuleLoader__.load({
  id: '@local/verify-before-finish',
  factory() {
    return {
      apply(ctx) {
        // Register this bundle's release history with the Notes plugin.
        ctx.effect(() => {
          const descriptor = {
            id: '@local/verify-before-finish',
            title: { zh: '完成前验证', en: 'Verify before Finish' },
            noteTitle: { zh: '完成前验证版本记录', en: 'Verify before Finish version log' },
            version: '1.0.0',
            entries: [
              {
                version: '1.0.0',
                at: '2026-10-27T20:51+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '在默认 agent loop 上新增「完成前验证 Loop」：一轮改动了文件却没有验证证据时，不允许直接结束',
                    '使用官方 agent/turn-stopping 事件作为收尾关卡，用 steer 把这一轮重新打开，多跑一步验证',
                    '验证证据：跑测试/lint/类型检查/构建的命令，或读回本轮改过的文件；改完再改会让之前的证据失效',
                    '默认最多回头 2 轮；模型拒绝验证（不用任何工具）时不再追问，避免死循环',
                    '同时向系统提示词注册 verify-before-finish:policy 段，让模型提前知道这条规则',
                  ],
                  en: [
                    'Adds a Verify-before-Finish stage to the default agent loop: a turn that changed files without verification evidence can no longer close',
                    'Uses the official agent/turn-stopping event as the closing seam and steers the turn back open for one more verification step',
                    'Verification evidence: a test/lint/type-check/build command, or reading back a file the turn changed; a later change invalidates earlier evidence',
                    'Gives a turn at most 2 rounds by default and stops asking when the model declines to verify with any tool, so the loop cannot spin',
                    'Also registers a verify-before-finish:policy section in the system prompt so the model knows the rule before it is enforced',
                  ],
                },
              },
            ],
          };
          let handled = false;
          try {
            const service = ctx.get('pluginVersionLog');
            if (service && typeof service.register === 'function') {
              service.register(descriptor);
              handled = true;
            }
          } catch (err) {
            handled = false;
          }
          if (!handled && typeof window !== 'undefined') {
            const sink = window.__dshPluginVersionLogSink;
            if (typeof sink === 'function') {
              sink(descriptor);
              handled = true;
            }
          }
          if (!handled && typeof window !== 'undefined') {
            const queue = window.__dshPluginVersionLogQueue || (window.__dshPluginVersionLogQueue = []);
            queue.push(descriptor);
          }
        }, 'verify-before-finish-version-log');
      },
    };
  },
});
