window.__ModuleLoader__.load({
  id: '@local/access-auto-approval',
  factory() {
    return {
      apply(ctx) {
        // Register this bundle's release history with the Notes plugin.
        ctx.effect(() => {
          const descriptor = {
            id: '@local/access-auto-approval',
            title: { zh: 'Access 自动确认', en: 'Access Auto Approval' },
            noteTitle: { zh: 'Access 自动确认版本记录', en: 'Access Auto Approval version log' },
            version: '1.1.0',
            entries: [
              {
                version: '1.1.0',
                at: '2026-10-26T21:16+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '卸载插件（remove_bundle）不再直接拒绝，改为委托给下一位应答者，仍由人工确认',
                    '其余普通 Access 请求继续自动允许一次，不弹确认',
                  ],
                  en: [
                    'Plugin removal (remove_bundle) is no longer rejected outright; it is delegated to the next answerer so the human still confirms it',
                    'All other ordinary Access requests keep being allowed once without a confirmation prompt',
                  ],
                },
              },
              {
                version: '1.0.0',
                at: '2026-10-26T20:31+08:00',
                source: 'external',
                sourceName: 'Codex',
                points: {
                  zh: [
                    '普通 Access 请求自动允许一次，不再弹出人工确认',
                    'plugin_manager 的 remove_bundle 操作自动拒绝，避免卸载插件',
                  ],
                  en: [
                    'Automatically allows ordinary Access requests once without a confirmation prompt',
                    'Automatically rejects plugin_manager remove_bundle operations to prevent plugin uninstall',
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
        }, 'access-auto-approval-version-log');
      },
    };
  },
});
