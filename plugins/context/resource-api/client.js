/**
 * Device-side resource API — Client half.
 *
 * One unified interface over the content that plugins keep on this machine:
 *
 *   resource.search({ source, query, timeRange, cursor, limit })
 *   resource.read({ refs: [{ source, id }] })
 *
 * Every plugin that owns content registers its own Provider and nothing else.
 * The registry never reads another plugin's storage, and a provider never
 * needs to know who consumes it. The registry merges searches across sources
 * and resolves reads by source, so a consumer can treat "notes", "facechat"
 * and "messages" as one addressable space.
 *
 * A provider is a plain object:
 *
 *   {
 *     source: 'notes',                  // unique id, required
 *     title: { zh: '笔记', en: 'Notes' },
 *     kind: 'document',                 // 'document' | 'conversation'
 *     icon: 'file',                     // 'file' | 'session'
 *     aliases: ['笔记', 'note'],         // keywords a consumer can match on
 *     async search({ query, timeRange, offset, limit, signal }) {
 *       return { items: [{ id, title, snippet, updatedAt, createdAt, meta }], total };
 *     },
 *     async read({ ids, signal }) {
 *       return { items: [{ id, title, text, updatedAt, createdAt, itemType, attributes, meta }] };
 *     },
 *   }
 *
 * Providers must return their items newest first (updatedAt descending) and
 * must treat `offset`/`limit` as a slice of that order, so the registry can
 * merge several sources into one stable page.
 */
window.__ModuleLoader__.load({
  id: '@local/resource-api',
  factory(require) {
    const DEFAULT_LIMIT = 20;
    const MAX_LIMIT = 100;
    const ALL = 'all';

    /* ------------------------------------------------------------------ *
     * Cursor codec
     * ------------------------------------------------------------------ */

    function toBase64Url(text) {
      const bytes = new TextEncoder().encode(String(text));
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
    }

    function fromBase64Url(text) {
      const padded = String(text).replace(/-/gu, '+').replace(/_/gu, '/');
      const binary = atob(padded + '==='.slice((padded.length + 3) % 4));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new TextDecoder().decode(bytes);
    }

    function encodeCursor(offsets) {
      const clean = {};
      for (const [source, offset] of Object.entries(offsets || {})) {
        if (Number.isFinite(offset) && offset > 0) clean[source] = Math.floor(offset);
      }
      return Object.keys(clean).length ? toBase64Url(JSON.stringify({ v: 1, o: clean })) : '';
    }

    function decodeCursor(cursor) {
      if (typeof cursor !== 'string' || !cursor) return {};
      try {
        const parsed = JSON.parse(fromBase64Url(cursor));
        if (!parsed || parsed.v !== 1 || !parsed.o || typeof parsed.o !== 'object') return {};
        const offsets = {};
        for (const [source, offset] of Object.entries(parsed.o)) {
          if (Number.isFinite(offset) && offset > 0) offsets[source] = Math.floor(offset);
        }
        return offsets;
      } catch (_err) {
        // A cursor from another version is simply "start at the beginning".
        return {};
      }
    }

    /* ------------------------------------------------------------------ *
     * Request helpers
     * ------------------------------------------------------------------ */

    function clampLimit(value) {
      const limit = Number.isFinite(value) ? Math.floor(value) : DEFAULT_LIMIT;
      if (limit <= 0) return DEFAULT_LIMIT;
      return Math.min(limit, MAX_LIMIT);
    }

    function normalizeTimeRange(value) {
      if (!value || typeof value !== 'object') return null;
      const from = Number.isFinite(value.from) ? value.from : null;
      const to = Number.isFinite(value.to) ? value.to : null;
      if (from === null && to === null) return null;
      return { from, to };
    }

    function inTimeRange(timeRange, timestamp) {
      if (!timeRange) return true;
      if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
      if (timeRange.from !== null && timestamp < timeRange.from) return false;
      if (timeRange.to !== null && timestamp > timeRange.to) return false;
      return true;
    }

    function normalizeRefs(value) {
      const list = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
      const refs = [];
      for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const source = typeof entry.source === 'string' ? entry.source.trim() : '';
        const id = typeof entry.id === 'string' ? entry.id : entry.id === undefined || entry.id === null ? '' : String(entry.id);
        if (!source || !id) continue;
        refs.push({ source, id });
      }
      return refs;
    }

    function sortValue(item) {
      const updated = Number.isFinite(item && item.updatedAt) ? item.updatedAt : 0;
      const created = Number.isFinite(item && item.createdAt) ? item.createdAt : 0;
      return Math.max(updated, created);
    }

    /* ------------------------------------------------------------------ *
     * Registry
     * ------------------------------------------------------------------ */

    function createRegistry() {
      const providers = new Map();
      const listeners = new Set();

      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (_err) {
            /* one faulty listener must not break the registry */
          }
        }
      }

      function normalizeProvider(provider) {
        if (!provider || typeof provider !== 'object') return null;
        const source = typeof provider.source === 'string' ? provider.source.trim() : '';
        if (!source) return null;
        if (typeof provider.search !== 'function' && typeof provider.read !== 'function') return null;
        return provider;
      }

      function registerProvider(provider) {
        const normalized = normalizeProvider(provider);
        if (!normalized) {
          throw new Error('resource provider needs a source and a search or read function');
        }
        const source = normalized.source;
        providers.set(source, normalized);
        emit();
        return () => {
          if (providers.get(source) === normalized) {
            providers.delete(source);
            emit();
          }
        };
      }

      function unregisterProvider(source, provider) {
        const key = typeof source === 'string' ? source.trim() : '';
        if (!key || !providers.has(key)) return false;
        // With a provider instance the removal only happens for that exact
        // registration, so two copies of one plugin cannot unregister each
        // other.
        if (provider && providers.get(key) !== provider) return false;
        providers.delete(key);
        emit();
        return true;
      }

      function listProviders() {
        return Array.from(providers.values()).map((provider) => ({
          source: provider.source,
          title: provider.title || null,
          kind: provider.kind || 'document',
          icon: provider.icon || 'file',
          aliases: Array.isArray(provider.aliases) ? provider.aliases.slice() : [],
        }));
      }

      function getProvider(source) {
        const key = typeof source === 'string' ? source.trim() : '';
        return key ? providers.get(key) || null : null;
      }

      function resolveSources(requested) {
        if (requested === undefined || requested === null || requested === '') {
          return Array.from(providers.keys()).sort();
        }
        const list = Array.isArray(requested) ? requested : [requested];
        const sources = [];
        for (const entry of list) {
          const source = typeof entry === 'string' ? entry.trim() : '';
          if (source && !sources.includes(source)) sources.push(source);
        }
        return sources;
      }

      async function search(params) {
        const request = params && typeof params === 'object' ? params : {};
        const query = typeof request.query === 'string' ? request.query : '';
        const limit = clampLimit(request.limit);
        const timeRange = normalizeTimeRange(request.timeRange);
        const signal = request.signal;
        const sources = resolveSources(request.source);
        const offsets = decodeCursor(request.cursor);

        const results = await Promise.all(
          sources.map(async (source) => {
            const provider = providers.get(source);
            if (!provider || typeof provider.search !== 'function') {
              return { source, items: [], total: 0, skipped: true };
            }
            const offset = offsets[source] || 0;
            let result = null;
            try {
              result = await provider.search({
                query,
                timeRange,
                offset,
                limit: limit + 1,
                signal,
              });
            } catch (err) {
              if (signal && signal.aborted) throw err;
              // A failing provider must not take the whole search down.
              return { source, items: [], total: 0, error: err };
            }
            const items = Array.isArray(result && result.items) ? result.items : [];
            const total = Number.isFinite(result && result.total)
              ? result.total
              : offset + items.length;
            return { source, items, total, skipped: false };
          }),
        );

        const merged = [];
        for (const result of results) {
          if (result.skipped) continue;
          for (const item of result.items) {
            if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
            merged.push({
              source: result.source,
              id: item.id,
              title: typeof item.title === 'string' ? item.title : '',
              snippet: typeof item.snippet === 'string' ? item.snippet : '',
              updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
              createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
              meta: item.meta && typeof item.meta === 'object' ? item.meta : {},
              sortValue: sortValue(item),
            });
          }
        }
        merged.sort((left, right) => {
          if (right.sortValue !== left.sortValue) return right.sortValue - left.sortValue;
          if (left.source !== right.source) return left.source < right.source ? -1 : 1;
          return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
        });

        const page = merged.slice(0, limit);
        const consumed = {};
        for (const item of page) {
          consumed[item.source] = (consumed[item.source] || 0) + 1;
        }
        const nextOffsets = {};
        let more = false;
        for (const result of results) {
          if (result.skipped) continue;
          const base = offsets[result.source] || 0;
          const taken = consumed[result.source] || 0;
          nextOffsets[result.source] = base + taken;
          if (result.items.length > taken || nextOffsets[result.source] < result.total) more = true;
        }

        const items = page.map((item) => ({
          source: item.source,
          id: item.id,
          title: item.title,
          snippet: item.snippet,
          updatedAt: item.updatedAt,
          createdAt: item.createdAt,
          meta: item.meta,
        }));

        return {
          items,
          nextCursor: more ? encodeCursor(nextOffsets) : '',
          sources: sources.filter((source) => providers.has(source)),
          errors: results
            .filter((result) => result.error)
            .map((result) => ({ source: result.source, error: String(result.error && result.error.message || result.error) })),
        };
      }

      async function read(params) {
        const request = params && typeof params === 'object' ? params : {};
        const refs = normalizeRefs(request.refs || request.ref);
        const signal = request.signal;
        const bySource = new Map();
        for (const ref of refs) {
          if (!bySource.has(ref.source)) bySource.set(ref.source, []);
          bySource.get(ref.source).push(ref.id);
        }

        const resolved = new Map();
        const errors = [];
        await Promise.all(
          Array.from(bySource.entries()).map(async ([source, ids]) => {
            const provider = providers.get(source);
            if (!provider || typeof provider.read !== 'function') return;
            let result = null;
            try {
              result = await provider.read({ ids: ids.slice(), signal });
            } catch (err) {
              if (signal && signal.aborted) throw err;
              errors.push({ source, error: String(err && err.message || err) });
              return;
            }
            const items = Array.isArray(result && result.items) ? result.items : [];
            const byId = new Map();
            for (const item of items) {
              if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
              const normalized = {
                id: item.id,
                source: typeof item.source === 'string' && item.source ? item.source : source,
                title: typeof item.title === 'string' ? item.title : '',
                text: typeof item.text === 'string' ? item.text : '',
                updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
                createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
                itemType: typeof item.itemType === 'string' ? item.itemType : 'item',
                attributes: item.attributes && typeof item.attributes === 'object' ? item.attributes : {},
                meta: item.meta && typeof item.meta === 'object' ? item.meta : {},
              };
              byId.set(normalized.id, normalized);
            }
            resolved.set(source, { byId, items: Array.from(byId.values()) });
          }),
        );

        const items = [];
        const missing = [];
        for (const ref of refs) {
          const bucket = resolved.get(ref.source);
          if (!bucket) {
            missing.push({ source: ref.source, id: ref.id });
            continue;
          }
          const exact = bucket.byId.get(ref.id);
          if (exact) {
            items.push(exact);
            continue;
          }
          if (ref.id === ALL && bucket.items.length) {
            // An aggregate selector resolves to everything the provider returned.
            items.push(...bucket.items);
            continue;
          }
          missing.push({ source: ref.source, id: ref.id });
        }

        return { items, missing, errors };
      }

      const service = {
        version: 1,
        registerProvider,
        unregisterProvider,
        listProviders,
        getProvider,
        search,
        read,
        subscribe(listener) {
          if (typeof listener !== 'function') return () => undefined;
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };

      return { service, providers };
    }

    const testApi = {
      createRegistry,
      encodeCursor,
      decodeCursor,
      normalizeRefs,
      normalizeTimeRange,
      inTimeRange,
      clampLimit,
    };
    if (typeof window !== 'undefined') window.__DSH_RESOURCE_TEST__ = testApi;

    return {
      apply(ctx) {
        const registry = createRegistry();

        // A provider that registers before this module loaded waits in the
        // queue; one that registers later goes through the shared sink. The
        // order of the plugins on the page therefore does not matter.
        ctx.effect(() => {
          const pending =
            typeof window !== 'undefined' && Array.isArray(window.__dshResourceQueue)
              ? window.__dshResourceQueue.splice(0)
              : [];
          for (const provider of pending) {
            try {
              registry.service.registerProvider(provider);
            } catch (_err) {
              /* a broken provider must not stop the registry */
            }
          }
          if (typeof window === 'undefined') return undefined;
          const sink = (provider) => registry.service.registerProvider(provider);
          window.__dshResourceSink = sink;
          window.__dshResourceService = registry.service;
          return () => {
            if (window.__dshResourceSink === sink) {
              try {
                delete window.__dshResourceSink;
              } catch (_err) {
                window.__dshResourceSink = undefined;
              }
            }
            if (window.__dshResourceService === registry.service) {
              try {
                delete window.__dshResourceService;
              } catch (_err) {
                window.__dshResourceService = undefined;
              }
            }
          };
        }, 'resource-api-registry');

        // Optional Cordis service for callers that can see it through ctx.get.
        ctx.effect(() => {
          if (!ctx || typeof ctx.provide !== 'function') return undefined;
          try {
            return ctx.provide('resource', registry.service);
          } catch (_err) {
            return undefined;
          }
        }, 'resource-api-service');

        // One self-maintained version-log note per plugin.
        ctx.effect(() => {
          const descriptor = {
            id: '@local/resource-api',
            title: { zh: '端侧资源接口', en: 'Device Resource API' },
            noteTitle: { zh: '端侧资源接口版本记录', en: 'Device Resource API version log' },
            version: '1.0.0',
            entries: [
              {
                version: '1.0.0',
                at: '2026-10-27T16:45+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '新增统一的端侧资源接口：resource.search 与 resource.read',
                    '各插件只需注册自己的 Provider：notes、facechat、messages 可被统一检索与读取',
                    '支持按来源检索、时间范围、游标分页与多来源合并排序',
                  ],
                  en: [
                    'Added the unified device-side resource interface: resource.search and resource.read',
                    'Each plugin only registers its own Provider: notes, facechat and messages become searchable and readable through one API',
                    'Supports per-source search, time ranges, cursor paging and merged multi-source ordering',
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
          } catch (_err) {
            handled = false;
          }
          if (!handled && typeof window !== 'undefined' && typeof window.__dshPluginVersionLogSink === 'function') {
            window.__dshPluginVersionLogSink(descriptor);
            handled = true;
          }
          if (!handled && typeof window !== 'undefined') {
            const queue = window.__dshPluginVersionLogQueue || (window.__dshPluginVersionLogQueue = []);
            queue.push(descriptor);
          }
        }, 'resource-api-version-log');
      },
    };
  },
});
