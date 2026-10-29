/**
 * Copy this effect into a plugin's Client half (`client.js`), inside `apply`.
 *
 * It registers the plugin's release list with the Notes plugin, which then
 * creates and maintains one version-log note for it. Replace the descriptor
 * fields, prepend a new entry for every release, and keep the entry list sorted
 * newest first. The `id` must be the plugin's package name.
 *
 * The registration is safe in either load order: if Notes is already mounted
 * the descriptor goes through its sink, otherwise it is queued and Notes drains
 * the queue when it loads.
 *
 * Attribution: use `source: 'harness'` only for DeepSeek Harness edits. An
 * external agent (Codex, Cursor, …) must use `source: 'external'` plus
 * `sourceName`, e.g. `{ source: 'external', sourceName: 'Codex' }`, so the
 * heading reads `外部 Agent（Codex）` / `External agent (Codex)`.
 */
ctx.effect(() => {
  const descriptor = {
    id: '@local/my-plugin',
    title: { zh: '我的插件', en: 'My Plugin' },
    noteTitle: { zh: '我的插件版本记录', en: 'My Plugin version log' },
    version: '1.0.0',
    entries: [
      {
        version: '1.0.0',
        at: '2026-10-26T14:00+08:00', // minute precision with explicit offset
        source: 'harness',
        points: {
          zh: ['首个版本：…'],
          en: ['First release: …'],
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
}, 'my-plugin-version-log');
