# Device Resource API / 端侧资源接口

One interface over the content that Harness plugins keep on this machine.

```ts
resource.search({
  source: 'notes' | 'facechat' | 'messages',
  query: string,
  timeRange?: { from?: number; to?: number },
  cursor?: string,
  limit?: number,
})

resource.read({
  refs: [
    { source: 'notes', id: 'note-a' },
    { source: 'messages', id: 'message-b' },
  ],
})
```

The point of the abstraction is that **each plugin only registers its own
Provider**. The registry never reads another plugin's storage, and a Provider
never needs to know who consumes it. A consumer asks for "notes" or "messages"
the same way it would ask for a file, and a plugin that stores transcripts
does not have to change because a new consumer appeared.

## What ships in this bundle

| File | Purpose |
| --- | --- |
| `client.js` | The registry: `search`, `read`, provider registration, cursor codec |
| `index.js` | Host half — empty `apply()`; the interface lives in the browser |
| `cordis.patch.yml` | Loader patch inserting the `resource-api` row |
| `templates/provider.js` | Copy-paste Provider registration for another plugin |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.svg` | Original artwork |
| `test/resource.test.mjs` | Headless check of merging, paging, reading and registration |

## The interface

### `resource.search(params)`

| Field | Meaning |
| --- | --- |
| `source` | One source, several, or omitted for every registered Provider |
| `query` | Free text. A Provider decides what it matches against |
| `timeRange` | `{ from, to }` in epoch milliseconds |
| `cursor` | An opaque cursor from a previous page |
| `limit` | Page size (default 20, capped at 100) |

Returns `{ items, nextCursor, sources, errors }`.

`items` are `{ source, id, title, snippet, updatedAt, createdAt, meta }`,
merged across the queried sources and ordered newest first. `nextCursor` is
empty when everything has been returned; pass it back as `cursor` for the next
page. A Provider that throws is reported in `errors` and never takes the whole
search down.

### `resource.read(params)`

`refs` is a list of `{ source, id }`. Returns `{ items, missing, errors }`.

`items` are `{ id, source, title, text, updatedAt, createdAt, itemType,
attributes, meta }` in the order the refs were given. A ref that no Provider
could resolve is listed in `missing` instead of failing the call.

The literal id `all` is the conventional aggregate selector. A Provider
resolves it itself (it knows what "all" means for its own resources); the
registry then attaches every item the Provider returned for that call. So
`{ source: 'notes', id: 'all' }` yields every note, and
`{ source: 'messages', id: 'contact:c-1' }` yields one conversation, without
the registry knowing anything about notes or messages.

## The Provider contract

```js
{
  source: 'notes',                    // unique id, required
  title: { zh: '笔记', en: 'Notes' }, // the module name
  kind: 'document',                   // 'document' | 'conversation'
  icon: 'file',                       // 'file' | 'session'
  aliases: ['笔记', 'note'],           // keywords a consumer can match on
  labels: {
    all:   { zh: '全部笔记', en: 'All notes' },   // the aggregate candidate
    unit:  { zh: '篇笔记', en: 'notes' },        // the unit after a count
    item:  { zh: '笔记', en: 'Notes' },          // section of single items
    group: { zh: '会话', en: 'Chats' },          // section of groups (optional)
    empty: { zh: '无正文', en: 'No text' },      // description of an empty item
  },
  async describe(locale) {                       // description of the aggregate
    return '2 篇笔记';                           // "2 notes" in English
  },
  async search({ query, timeRange, offset, limit, signal }) {
    return { items: [...], total };
  },
  async read({ ids, signal }) {
    return { items: [...] };
  },
}
```

Rules that the registry relies on:

- Items are returned **newest first** (`updatedAt` descending) and
  `offset`/`limit` slice that order, so several sources merge into one stable
  page.
- `total` is the number of matching items before paging. It is optional.
- `read` returns the items for the requested ids. An id that does not exist is
  simply absent from the result.
- `itemType` and `attributes` describe the item for a consumer that renders
  it; the registry copies them through unchanged.

### The Provider owns its wording

A consumer must not need to know what a note, a transcript or a message is.
The Provider therefore supplies the strings:

- `labels.all` is the label of the aggregate candidate ("All notes").
- `labels.item` is the section its single items appear in.
- `labels.group` is the section of its group candidates (a Provider that has
  no groups leaves it out).
- `labels.unit` is the unit after a count.
- `labels.empty` is the description of an item that has neither a date nor
  any content.
- `describe(locale)` returns the whole description of the aggregate
  ("2 篇笔记" / "2 notes"), so the Provider owns its plural rules. The locale
  is the active locale id; a missing or non-Chinese locale reads as English.

A search item may also carry a group, so a consumer can offer one collection
of a source without knowing what that collection is:

```js
meta: {
  contactId, contactName, mine, from,
  group: {
    id: 'c-victor',                  // the group identity
    title: 'victor',                 // its plain name
    label: '与 victor 的对话',        // a ready display label
    readId: 'contact:c-victor',      // the id to read the whole group
  },
},
```

## Registering a Provider

Copy the helper and the effect from
[`templates/provider.js`](templates/provider.js) into the plugin's Client half
(`client.js`), inside `apply`:

```js
ctx.effect(() => registerResourceProvider(provider), 'notes-resource-provider');
```

The registration works in either load order:

- If the registry is already mounted, the Provider goes through
  `window.__dshResourceSink`.
- Otherwise it waits in `window.__dshResourceQueue` and the registry drains
  the queue when it loads.

The registry is also offered as a Cordis service named `resource`, and the
service object is published as `window.__dshResourceService`. Consumers can
use either; the window sink is the reliable path across bundles.

## Providers in this workspace

| Source | Provider | Owns |
| --- | --- | --- |
| `notes` | `@local/notes-panel` | `dsh.notes.v1` in this browser |
| `facechat` | `@local/facechat-recorder` | `dsh.facechat.v1` in this browser |
| `messages` | `@local/chat-room` | the Host-side message store, read through `/plugin/chat-room/*` |
| `exploration` | `@local/exploration-atlas` | the curated and browser-recorded exploration map of `@local/exploration-atlas` |

`@local/knowledge-context-reference` is the first consumer: its `#` menu now
builds candidates from `resource.search` and serializes a reference through
`resource.read`, and falls back to its own readers when a Provider is not
registered.

## Install

```text
plugin_manager({ action: "install_bundle", target: "<absolute path to this directory>" })
```

Removing the bundle removes the registry. Plugins that registered a Provider
keep working; they simply have no registry to answer for.
