# Notes 笔记

A notebook panel for the Harness Web UI. It adds a **笔记 / Notes** icon to the
sidebar panel list; selecting it opens a full-width notebook page in the main
column.

## What it does

- **Note list** on the left, sorted by last edit, with title, snippet, and
  relative edit time.
- **Editor** on the right: title field, body area, character count, and an
  autosave indicator.
- **Markdown preview with tables (default view)**: notes open in **预览 /
  Preview**, so Markdown bodies — headings, lists, quotes, code and GFM pipe
  tables (header row, per-column alignment, horizontal scroll) — render
  immediately. A **编辑 / Edit** switch at the top of the editor returns to
  plain-text editing; the choice is remembered per browser. The body is still
  stored as plain text, and edit mode shows a hint when Markdown is detected.
- **Adjustable body text size** from 12–22 px with the compact `A− / A+`
  control in the editor footer. The choice is remembered in this browser.
- **New note** button in the header (and in the empty state).
- **Search** across titles and bodies, live as you type.
- **Delete** with a two-step confirm (the first click arms it for 4 seconds).
- **Pin** any note above the rest: right-click a note in the list and choose
  **置顶 / Pin to top** (the same menu offers **取消置顶 / Unpin**). Pinned notes
  sort first and show a pin marker; the flag is stored with the note and
  pinning never changes the note edit time.
- **Images** in a note: paste from the clipboard (`Ctrl/Cmd+V`), drop image
  files onto the editor, or use the footer's **Add image** button. Images show
  as thumbnails; each thumbnail can be copied to the clipboard or removed
  (two-step confirm), and clicking it opens a preview (`Escape` or the overlay
  closes it). The preview's **Copy image** writes the picture back to the
  system clipboard as PNG.
- **Share snapshots**: the upper-right **Share** button creates a versioned
  `DSHNOTE1:` code containing the selected note's title, body, and images.
  Another user or device can choose **Import share** in the header and paste
  the code to create an editable local copy with provenance attached.
  **Export H5 page** in the share dialog turns the snapshot into a standalone,
  mobile-friendly HTML file (images embedded) that opens in any browser with no
  Notes plugin, and **Copy H5 source** copies that HTML.
- **Version logs**: one auto-maintained log note per plugin — see below.
- Empty states for "no notes yet" and "no search results".
- English and Chinese UI, following the Harness locale; light/dark follow the
  active theme because every color is a `--dsw-alias-*` token.

Notes autosave 300 ms after an edit, and also on note switch, panel close, page
hide, and tab hide.

Right-clicking a note row opens a small menu with the pin action. Pinned notes
keep their place at the top of the list after reloads and remounts; unpinning
returns them to the normal last-edit order.

### Markdown preview

Preview is a rendering mode for the plain-text body, and it is the default:
opening a note shows the rendered subset — ATX headings, paragraphs, bullet and
numbered lists, blockquotes, fenced code, horizontal rules, bold/italic/inline
code/links, and GFM pipe tables. Tables show a header row, honor per-column
alignment (left, center, right), and scroll horizontally when the window is
narrow. The **编辑 / Edit** switch at the top of the editor returns to the raw
textarea; the choice is remembered in `localStorage` under
`dsh.notes.view-mode.v1`. New empty notes open in edit mode, and while editing a
note whose body contains Markdown a hint offers to jump to Preview. Nothing in
the stored body is rewritten. The standalone H5 share export uses the same renderer, so a shared page
shows headings and tables instead of raw pipe characters (export it again to
pick up changes to this renderer).

### Sharing snapshots

Sharing is deliberately a small, honest collaboration primitive rather than a
mock cloud service:

1. Open a note and choose **Share** in the upper-right. Optionally enter the name the recipient
   should see, then copy the generated share code.
2. On another Harness profile or device, open Notes, choose **Import share**,
   paste the code, and import it.
3. The receiver gets a normal editable note plus `sharedFrom` metadata: the
   snapshot id, source-note id, sender name, share time, and import time.
4. If the recipient cannot install Notes, use **Export H5 page** in the share
   dialog and send the downloaded `.html` file: images are embedded, the page is
   responsive on phones, it works offline, and it runs no scripts. **Copy H5
   source** copies the same page as raw HTML.

The code is self-contained and versioned (`DSHNOTE1:` followed by base64url
JSON), so no server or account is required. It is **not encrypted**: anyone who
has the code can decode the note, so it should only be sent to trusted people.
Sharing is a one-time snapshot — edits made by either side after sharing do not
sync. Importing the same snapshot twice selects the existing import instead of
creating a duplicate. An auto-maintained plugin log can be shared, but the
receiver's imported copy intentionally becomes an ordinary note; ownership of
the sender's plugin runtime is never transferred.

These boundaries make the first experiment useful for deciding what should
come next: identity, access control, links, revocation, version history,
comments, or real-time synchronization.

The body text-size preference is stored separately in `localStorage` under
`dsh.notes.font-size.v1`. It changes the editing and reading size for all notes
in this browser; it does not add rich-text formatting to the note content.

### Images

Pasted or dropped images are decoded in the page, downscaled so the longest edge
is at most 1600 px, and re-encoded as WebP (PNG when WebP is unavailable)
before they are stored. Each note holds at most 24 images. Because the whole
notebook lives in `localStorage`, image storage is budgeted: the plugin refuses
to exceed roughly 3.8 MB of serialized data, shows a visible error instead of
silently dropping the image, and reports a failed save in the footer when the
browser quota is already full. Removed images free their space immediately.

### Version logs (one per plugin)

Every plugin can keep its own changelog note in the notebook. A plugin's note
titled **面聊录音版本记录** / **Face-to-face Recorder version log** is created on
first load and maintained automatically after that. Each release heading carries
the version, the update time to the minute with its UTC offset, and who made the
change:

```text
## v1.5.0 · 2026-10-25 22:20 +08:00 · DeepSeek Harness
## v1.3.0 · 2026-10-25 01:02 +08:00 · 外部 Agent
```

- Each load compares the plugin's registered release list with the versions
  already present in its note, and prepends any missing release section, newest
  first.
- Appending is idempotent: a version whose heading (`## vX.Y.Z`) already exists
  is never added twice, and your own writing below the log is left untouched.
- Existing entries written by older plugin versions are re-stamped in place with
  the minute-precise time and the source; their bullets are not rewritten.
- Deleting a note is safe: the next load recreates it from the registered list.
- Notes whose content the plugin maintains are tagged **自动维护 /
  auto-maintained** in the note list.
- External updates always show the responsible agent in parentheses
  (`外部 Agent（Codex）` / `External agent (Codex)`); a missing name shows
  `外部 Agent（未署名）`, and a hand-corrected name is preserved.
- The note language follows the active UI language; every release carries both
  Chinese and English points.

The Notes plugin logs itself this way too (its release list is the `CHANGELOG`
constant in `client.js`), and it migrates the single pre-1.5 log note into the
per-plugin scheme automatically. `facechat-recorder` is the first plugin to
register its own log.

#### Registering a plugin's version log

A plugin's Client half registers a descriptor when it loads. The Notes panel has
to be installed (it does not need to be open), and the call is safe in either
load order: the Notes module drains registrations written before it loaded and
exposes a sink for later ones.

```js
ctx.effect(() => {
  const descriptor = {
    id: '@local/facechat-recorder',
    title: { zh: '面聊录音', en: 'Face-to-face Recorder' },
    noteTitle: { zh: '面聊录音版本记录', en: 'Face-to-face Recorder version log' },
    version: '1.0.0',
    entries: [
      {
        version: '1.0.0',
        at: '2026-10-25T22:06+08:00', // minute precision, explicit offset
        source: 'harness',           // DeepSeek Harness itself only
        // external agents:         source: 'external', sourceName: 'Codex'
        // (or a bare label:        source: 'codex' — treated as the agent name)
        points: { zh: ['首个版本：…'], en: ['First release: …'] },
      },
    ],
  };
  const sink = window.__dshPluginVersionLogSink;
  if (typeof sink === 'function') {
    sink(descriptor);
    return;
  }
  (window.__dshPluginVersionLogQueue = window.__dshPluginVersionLogQueue || []).push(descriptor);
}, 'facechat-version-log');
```

Attribution is declared by the registering plugin, because the Notes plugin
cannot see which agent edited the files. `source` accepts `'harness'` (DeepSeek
Harness itself), `'external'` plus `sourceName`, or any other label such as
`'codex'` (treated as that external agent's name). A missing source is shown as
**未署名更新者 / unattributed source** and is never silently credited to DeepSeek
Harness.

External updates always name the agent in parentheses — `外部 Agent（Codex）` /
`External agent (Codex)`; with no name the heading reads `外部 Agent（未署名）` /
`External agent (unidentified)`. External agents editing a plugin file must set
`source: 'external'` **and** `sourceName` (for example `'Codex'`) instead of the
harness value. A name added by hand to an existing heading is preserved by later
automatic re-syncs, so a manual correction does not get overwritten.

A plugin can rename its note later: change `noteTitle` and list the old
titles in `previousNoteTitles` (for example
`[{ zh: '旧标题', en: 'Old title' }]`). The next sync renames a note whose
title still matches one of them; a title you renamed by hand is left alone.

A plugin can also change its package identity (for example a dev link
`@local/x` replaced by a published package `x`). Version-log notes that
share the same generated title and display name are merged automatically:
releases from the duplicate are folded into the surviving note, the
duplicate note is removed, and the stale identity is dropped from the
registry so it cannot recreate the note. Old generated headers are
refreshed, so a renamed plugin does not leave its previous name in the body.

Descriptors are cached in `localStorage` under `dsh.notes.plugin-logs.v1`, so a
plugin's note keeps syncing even on loads where that plugin is not mounted; the
next load of the plugin refreshes its descriptor and appends new releases. A
Cordis service named `pluginVersionLog` exposes the same `register` method for
callers that can see it through `ctx.get`.

#### New plugin checklist

The Notes plugin cannot enumerate installed bundles from the browser, so a new
plugin has to announce itself once; after that its note is maintained
automatically. When creating a plugin:

1. Copy the registration effect from
   [`templates/plugin-version-log.js`](templates/plugin-version-log.js) into the
   plugin's `client.js` `apply` and fill in the descriptor.
2. Bump the plugin's `package.json` version and prepend an entry to
   `entries` (`version`, minute-precise `at`, `source`, bilingual `points`).
3. Run `node tools/check-version-logs.mjs` from this package and fix every
   `MISS` row before finishing.

The workspace `AGENTS.md` records the same rule, so other agents editing this
workspace see it too.

### 自驱动迭代写笔记（Self-driven iteration）

「自驱动迭代 / Self-driven Iteration」插件不在 Notes 内部运行，它通过两个
`window` sink 把迭代结果写进笔记。两个 sink 都是可选的，失败时只返回
`{ ok: false, error }`、不抛错；Notes 尚未加载时调用方先写入对应的队列，Notes
加载后自动 drain，两种加载顺序都安全。

**1. 自驱动版本条目** —— 写进目标插件的版本记录笔记：

```js
// Notes 尚未加载：window.__dshSelfDrivenLogQueue.push(entry)
const result = window.__dshSelfDrivenLogSink.append({
  pluginId: '@local/chat-room',
  pluginName: { zh: '消息', en: 'Messages' },
  noteTitle: { zh: '消息版本记录', en: 'Messages version log' }, // 可省略
  version: '1.9.10',
  at: '2026-10-29T21:40+08:00', // 精确到分钟、带偏移
  points: { zh: ['…'], en: ['…'] },
  requirementId: 'req-…', // 可选，仅记录
})
// { ok: true, status: 'created' | 'appended' | 'retimed' | 'current' }
// | { ok: false, error }
```

- 条目固定以 `source: 'self-driven'` 写入，标题渲染为
  `## v1.9.10 · 2026-10-29 21:40 +08:00 · 自驱动`（英文 `Self-driven`）；
  注册 descriptor 时也可以直接写 `source: 'self-driven'`、`'selfdriven'`、
  `'self_driven'` 或 `'自驱动'`。
- 目标笔记不存在时用 `pluginName` / `noteTitle` 兜底创建（标题缺省为
  `pluginName + 版本记录` / `pluginName + ' version log'`）；存在时按版本号幂等合并，
  同一版本不会重复，新条目排在旧条目上方。
- 条目持久化在 `dsh.notes.plugin-log-extras.v1`，Notes 重载或目标插件之后重新注册
  自己的 descriptor 都不会丢失「自驱动」条目。

**2. 被管理的自动维护笔记** —— 汇总页等由调用方维护的普通笔记：

```js
// Notes 尚未加载：window.__dshManagedNoteQueue.push(note)
const result = window.__dshManagedNoteSink.upsert({
  key: 'self-iteration-requests',
  title: '自驱动迭代需求',
  body: '# 自驱动迭代需求\n\n…',
})
// { ok: true, status: 'created' | 'updated' | 'current' } | { ok: false, error }
```

- 按 `key` 找到带隐藏标记 `managed-note:<key>` 的笔记并更新标题与正文，不存在则创建
  （不选中、不聚焦新笔记）；笔记在列表里显示「自动维护 / auto-maintained」。
- 最近一次内容保存在 `dsh.notes.managed-notes.v1`；用户删除后，下次 Notes 加载会用
  最近内容重建。标题与正文的语言由调用方按当前语言生成。

## Where notes are stored

Notes are plugin-owned user data, not session-derived state, so they are kept in
this browser's `localStorage` under the key `dsh.notes.v1`:

```json
{
  "notes": [
    {
      "id": "...",
      "title": "",
      "body": "",
      "pinned": false,
      "images": [
        { "id": "...", "dataUrl": "data:image/webp;base64,...", "width": 0, "height": 0, "addedAt": 0 }
      ],
      "createdAt": 0,
      "updatedAt": 0,
      "sharedFrom": {
        "shareId": "...",
        "sourceNoteId": "...",
        "senderName": "...",
        "sharedAt": 0,
        "importedAt": 0
      }
    }
  ],
  "selectedId": "..."
}
```

Consequences worth knowing:

- Notes belong to the browser profile that renders the Harness Web UI; they are
  not in the session log and are not visible to the agent.
- Clearing site data for the Harness origin removes them.
- They survive session switches, workspace switches, app restarts, and plugin
  reloads.
- Version-log descriptors (which plugin owns which note and its releases) are
  cached separately under `dsh.notes.plugin-logs.v1`; the log notes themselves
  are ordinary entries in `dsh.notes.v1`, tagged with a hidden `system` marker.
- 自驱动版本条目另存在 `dsh.notes.plugin-log-extras.v1`，被管理笔记（带
  `managed-note:<key>` 标记）的最近内容另存在 `dsh.notes.managed-notes.v1`；
  两者都只是「重载后合并 / 重建」用的缓存，笔记正文仍在 `dsh.notes.v1`。

## Install

```text
plugin_manager({ action: "install_bundle", target: "<absolute path to this directory>" })
```

The bundle inserts one Host row (`notes-panel`) and serves `client.js` as the
Client artifact. Removing the bundle (`remove_bundle`) takes the page and its
sidebar entry away.

## Files

| File | Purpose |
| --- | --- |
| `package.json` | Bundle manifest: patch pointer, Client artifact, locale/icon exports |
| `cordis.patch.yml` | Loader patch inserting the `notes-panel` row |
| `index.js` | Host half — empty `apply()`; the UI is entirely Client-side |
| `client.js` | Registers `main` key `notes` and `sidebar.panellist` id `notes`; store, image pipeline, per-plugin version-log registry, and views |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.svg` | Original notebook artwork |

## Implementation notes

- One registration seam: `main` is a keyed slot, so the page is keyed `notes`;
  `sidebar.panellist` uses the same id, and the sidebar owns the navigation
  button and resolves its label from the registration's `label` thunk.
- Both registrations go through `ctx.slots.inject`, so they wait for the slot
  declaration and are disposed with it.
- The panel renders its CSS as a `<style>` element inside the root component, so
  unmounting the page removes the stylesheet with it.
- Version-log notes are bound to a plugin by a `system` marker
  (`plugin-version-log:<package name>`); registering a descriptor is idempotent,
  and a note for an uninstalled plugin simply stops receiving updates.
- The component imports no Harness Client package; only `react` comes from the
  browser module table.
