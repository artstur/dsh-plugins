/**
 * Copy this helper and effect into a plugin's Client half (`client.js`),
 * inside `apply`. Replace the descriptor fields with the plugin's own
 * Provider: the registry never reads the plugin's storage, so the Provider is
 * the only place that knows how this plugin stores its content.
 *
 * The registration is safe in either load order: if the resource registry is
 * already mounted the Provider goes through its sink, otherwise it is queued
 * and the registry drains the queue when it loads.
 *
 * Provider contract (see README.md):
 *
 *   search({ query, timeRange, offset, limit, signal })
 *     -> { items: [{ id, title, snippet, updatedAt, createdAt, meta }], total }
 *
 *   read({ ids, signal })
 *     -> { items: [{ id, title, text, updatedAt, createdAt, itemType, attributes, meta }] }
 *
 * Items must be returned newest first (updatedAt descending) and `offset` /
 * `limit` must slice that order, so several sources can be merged into one
 * stable page. The id `all` is the conventional aggregate selector: a reader
 * that asks for it gets every item the Provider returned for that call.
 */

/**
 * Register one Provider with the device-side resource registry.
 *
 * @param {object} provider - the Provider descriptor.
 * @returns {function} a disposer that removes this registration.
 */
function registerResourceProvider(provider) {
  if (!provider || typeof provider.source !== 'string' || !provider.source) {
    return () => undefined;
  }
  const sink = typeof window !== 'undefined' ? window.__dshResourceSink : null;
  if (typeof sink === 'function') {
    try {
      return sink(provider);
    } catch (_err) {
      /* fall through to the queue */
    }
  }
  if (typeof window === 'undefined') return () => undefined;
  const queue = window.__dshResourceQueue || (window.__dshResourceQueue = []);
  queue.push(provider);
  return () => {
    const index = queue.indexOf(provider);
    if (index >= 0) queue.splice(index, 1);
    const service = window.__dshResourceService;
    if (service && typeof service.unregisterProvider === 'function') {
      try {
        service.unregisterProvider(provider.source, provider);
      } catch (_err) {
        /* ignore */
      }
    }
  };
}

// Inside `apply`:
//
// ctx.effect(() => {
//   const provider = {
//     source: 'notes',
//     title: { zh: '笔记', en: 'Notes' },
//     kind: 'document',
//     icon: 'file',
//     aliases: ['笔记', 'note', 'notes'],
//     async search({ query, timeRange, offset, limit }) {
//       const all = loadNotes().filter((note) => matches(note, query, timeRange));
//       return {
//         items: all.slice(offset, offset + limit).map((note) => ({
//           id: note.id,
//           title: note.title,
//           snippet: note.body.slice(0, 160),
//           updatedAt: note.updatedAt,
//           createdAt: note.createdAt,
//           meta: { images: note.images },
//         })),
//         total: all.length,
//       };
//     },
//     async read({ ids }) {
//       const notes = loadNotes();
//       return {
//         items: ids.map((id) => {
//           const note = notes.find((entry) => entry.id === id);
//           if (!note) return null;
//           return {
//             id: note.id,
//             title: note.title,
//             text: note.body,
//             updatedAt: note.updatedAt,
//             createdAt: note.createdAt,
//             itemType: 'note',
//           };
//         }).filter(Boolean),
//       };
//     },
//   };
//   return registerResourceProvider(provider);
// }, 'my-plugin-resource-provider');
