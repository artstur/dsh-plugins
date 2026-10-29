/**
 * Notes panel — Client half.
 *
 * A notebook page in the main column: it registers the `notes` key of the
 * keyed `main` slot and the matching `notes` entry of `sidebar.panellist`, so
 * the sidebar owns the navigation button and this module owns the page.
 *
 * Notes are plugin-owned user data, not derived session state, so they live in
 * this browser's localStorage; the panel reads and writes them through a small
 * module store and autosaves after edits.
 *
 * Images are pasted, dropped, or picked into the selected note. They are
 * downscaled and re-encoded in the page before storage, and a note image can be
 * copied back to the clipboard or previewed.
 */
window.__ModuleLoader__.load({
  id: '@local/notes-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'notesPanel';
    const PANEL_ID = 'notes';
    const STORAGE_KEY = 'dsh.notes.v1';
    const FONT_SIZE_STORAGE_KEY = 'dsh.notes.font-size.v1';
    const SHARE_NAME_STORAGE_KEY = 'dsh.notes.share-name.v1';
    const SAVE_DELAY = 300;

    const FONT_SIZES = [12, 14, 16, 18, 20, 22];
    const DEFAULT_FONT_SIZE = 14;

    const MAX_EDGE = 1600;
    const MAX_STORE_BYTES = 3800000;
    const MAX_IMAGE_DATAURL = 4000000;
    const MAX_IMAGES_PER_NOTE = 24;
    const MAX_IMAGES_PER_PASTE = 8;
    const MAX_SHARE_CODE_LENGTH = 5600000;
    const SHARE_CODE_PREFIX = 'DSHNOTE1:';

    const VERSION = '1.15.1';
    const NOTES_PLUGIN_ID = '@local/notes-panel';
    const PLUGIN_LOG_STORAGE_KEY = 'dsh.notes.plugin-logs.v1';
    const PLUGIN_LOG_SYSTEM_PREFIX = 'plugin-version-log:';
    const LEGACY_CHANGELOG_SYSTEM = 'notes-panel-changelog';
    const SELF_NOTE_TITLE = { zh: '笔记插件版本记录', en: 'Notes plugin version log' };
    // 自驱动迭代 releases live next to the plugin descriptors so a Notes reload
    // or a later descriptor registration can always re-merge them.
    const SELF_DRIVEN_LOG_STORAGE_KEY = 'dsh.notes.plugin-log-extras.v1';
    const SELF_DRIVEN_SOURCE = 'self-driven';
    const MANAGED_NOTES_STORAGE_KEY = 'dsh.notes.managed-notes.v1';
    const MANAGED_NOTE_SYSTEM_PREFIX = 'managed-note:';

    // The plugin maintains a changelog note in its own store. To log a future
    // release, prepend its entry here and bump package.json; the entry is
    // appended to the note the next time the Client module loads.
    const CHANGELOG = [
      {
        version: '1.15.1',
        at: '2026-10-29T21:35+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：「自驱动」来源——版本记录条目可以声明由自驱动迭代写入，标题渲染为「自驱动」，并兼容 self-driven / selfdriven / self_driven / 自驱动 等写法',
            '新增：自驱动版本条目注入 window.__dshSelfDrivenLogSink.append(entry)（含预加载队列），按版本幂等合并进目标插件笔记；条目持久化后 Notes 重载或目标插件重新注册 descriptor 都不会丢失',
            '新增：被管理笔记接口 window.__dshManagedNoteSink.upsert({key,title,body})（含预加载队列），按 key 创建或更新带「自动维护」标记的笔记，删除后下次加载用最近内容重建',
            '测试：补充自驱动来源、条目合并、被管理笔记与重载恢复的自动化测试',
          ],
          en: [
            'New: a "self-driven" source — release entries can declare they were written by self-driven iteration, render as 自驱动 / Self-driven, and accept self-driven / selfdriven / self_driven / 自驱动 spellings',
            'New: self-driven release injection through window.__dshSelfDrivenLogSink.append(entry) with a pre-load queue; versions merge idempotently into the target plugin note and survive a Notes reload or descriptor re-registration',
            'New: managed-note API window.__dshManagedNoteSink.upsert({key,title,body}) with a pre-load queue; creates or updates an auto-maintained note by key and recreates it from the last content after deletion',
            'Tests: added automated coverage for the self-driven source, entry merging, managed notes and reload recovery',
          ],
        },
      },
      {
        version: '1.15.0',
        at: '2026-10-28T21:21:56+08:00',
        source: 'external',
        sourceName: 'WorkBuddy',
        points: {
          zh: [
            '修复：所有笔记及 H5 分享展示中，同名正文首 h1 不再与标题重复；正文源码及分享快照保持不变，重命名只同步原同名标题行',
            '改进：取消编辑 / 预览模式，默认直接编辑渲染后的 Markdown；支持格式、列表、引用、代码、表格、纯文本粘贴及 Markdown 快捷输入',
            '保护：未编辑块逐字保留源码、间隔、围栏语言与换行；自发保存不重建 DOM，支持输入法、撤销重做和离开保存，外部更新不重叠合并、冲突拒绝覆盖并提示',
          ],
          en: [
            '修复：Duplicate leading body h1 titles are hidden in notes and H5 exports without changing snapshots; title renames update only a matching first heading.',
            '改进：Rendered Markdown is directly editable without Edit / Preview modes, including formatting, lists, quotes, code, tables and plain-text Markdown paste.',
            '保护：Untouched source blocks remain byte-for-byte intact; saves keep the DOM stable, with IME, undo/redo, flush and conservative external-update merging.',
          ],
        },
      },
      {
        version: '1.14.0',
        at: '2026-10-28T20:30+08:00',
        source: 'harness',
        points: {
          zh: [
            '改进：笔记默认以「预览」打开，Markdown 正文（含表格）直接渲染；编辑区顶部新增明显的「编辑 / 预览」切换，选择按浏览器记忆',
            '优化：编辑模式下检测到 Markdown（表格、标题、列表等）时显示「点击预览」提示，避免误以为笔记只显示源码',
            '优化：分享导出的 H5 网页同样按 Markdown 渲染正文与表格，不再显示原始 | 语法（旧的导出文件需重新导出）',
          ],
          en: [
            'Improved: notes open in Preview by default so Markdown bodies (including tables) render immediately; a clear Edit / Preview switch now sits at the top of the editor and the choice is remembered per browser',
            'Improved: when the body contains Markdown while Edit is active, a "click to preview" hint appears so the note is not mistaken for raw source',
            'Improved: the standalone H5 share export now renders Markdown and tables too, instead of showing raw pipe syntax (re-export old files to pick this up)',
          ],
        },
      },
      {
        version: '1.13.0',
        at: '2026-10-28T20:05+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：笔记正文 Markdown 预览——在编辑区底部切换「预览 / 编辑」，可渲染标题、列表、引用、代码块与 GFM 表格',
            '优化：表格支持表头、按列对齐和横向滚动，配色跟随主题令牌；预览沿用当前正文字号与明暗主题，普通文本保留换行',
          ],
          en: [
            'New: Markdown preview for note bodies — switch between Preview and Edit in the editor footer to render headings, lists, quotes, code blocks and GFM tables',
            'Improved: tables keep a header row, per-column alignment and horizontal scrolling, colored with theme tokens; preview follows the current body text size and light/dark theme, and plain paragraphs keep their line breaks',
          ],
        },
      },
      {
        version: '1.12.0',
        at: '2026-10-27T16:46+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：向端侧资源接口注册 notes Provider——笔记可以通过统一的 resource.search / resource.read 被检索和读取',
            '新增：Provider 描述聚合项（全部笔记）、计数单位与空内容提示，并用 describe(locale) 说明当前笔记数量',
            '兼容：自动维护的版本记录笔记与普通笔记一样可以被检索和读取',
          ],
          en: [
            'New: registered the `notes` Provider with the device-side resource interface — notes can be searched and read through the unified resource.search / resource.read',
            'New: the Provider describes the aggregate candidate (All notes), the count unit and the empty-content hint, and reports how many notes exist through describe(locale)',
            'Compatible: auto-maintained version-log notes are searched and read like ordinary notes',
          ],
        },
      },
      {
        version: '1.11.0',
        at: '2026-10-26T21:05+08:00',
        source: 'harness',
        points: {
          zh: [
            '修复：同一插件的开发包与发布包身份不同（如 @local/chat-room 与 dsh-chat-room）时会生成两条版本记录笔记——现在按标题归并、删除重复笔记，并移除失效的旧身份',
            '优化：发布包接手开发包时沿用原笔记；自动维护的笔记会刷新旧头部，插件改名后不再残留旧标题',
          ],
          en: [
            'Fixed: one plugin whose dev and published package identities differ (for example @local/chat-room and dsh-chat-room) produced two version-log notes — notes are now merged by title, duplicates removed, and the stale identity dropped',
            'Improved: a published build adopts the existing note from the dev build, and generated headers are refreshed so a renamed plugin no longer leaves the old title in the note body',
          ],
        },
      },
      {
        version: '1.10.0',
        at: '2026-10-26T19:55+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：分享笔记可导出独立 H5 网页——图片内嵌、手机或电脑浏览器直接打开，收件人无需安装笔记插件',
            '新增：分享弹窗支持复制 H5 源码，便于粘贴到需要 HTML 的场景；导出页面不含脚本',
          ],
          en: [
            'New: a shared snapshot can be exported as a standalone H5 page — images embedded, opens in any phone or desktop browser, no Notes plugin needed on the receiving side',
            'New: the share dialog can copy the H5 source for scenarios that need raw HTML; the exported page contains no scripts',
          ],
        },
      },
      {
        version: '1.9.1',
        at: '2026-10-26T14:45+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：插件版本记录笔记支持随插件改名——描述符用 previousNoteTitles 声明旧标题，同步时自动重命名笔记',
            '修复：聊天室（消息）插件的版本记录笔记标题由「联系人版本记录」更正为「消息版本记录」',
          ],
          en: [
            'New: version-log notes follow a plugin rename — declare the old titles in previousNoteTitles and the next sync renames matching notes',
            'Fixed: the chat-room (Messages) version-log note title is renamed from the old Contacts title to Messages version log',
          ],
        },
      },
      {
        version: '1.9.0',
        at: '2026-10-26T14:18+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：笔记置顶——在列表里右键一条笔记选择「置顶」，置顶笔记排在列表最前，再次右键可「取消置顶」',
            '优化：置顶状态保存在笔记数据中，切换置顶不会改变笔记的编辑时间',
          ],
          en: [
            'New: pin notes — right-click a note in the list and choose Pin to top; pinned notes sort first and can be unpinned the same way',
            'Improved: the pinned flag is stored with the note, and pinning does not change the note edit time',
          ],
        },
      },
      {
        version: '1.8.2',
        at: '2026-10-26T14:18+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：新插件版本记录清单、可复制注册模板（templates/plugin-version-log.js）与检查脚本（tools/check-version-logs.mjs）',
            '修复：补齐聊天室插件（chat-room，现为「联系人」）的版本记录注册，创建「联系人版本记录」并补录 v1.0.0 / v1.1.0 迭代',
          ],
          en: [
            'New: a new-plugin version-log checklist, a copyable registration template (templates/plugin-version-log.js) and a checker (tools/check-version-logs.mjs)',
            'Fixed: the chat-room plugin (now Contacts) registers its log, creating the Contacts version log with its v1.0.0 / v1.1.0 releases',
          ],
        },
      },
      {
        version: '1.8.1',
        at: '2026-10-25T23:41+08:00',
        source: 'external',
        sourceName: 'Codex',
        points: {
          zh: [
            '调整：搜索框移到左侧笔记栏顶部，搜索与它实际筛选的列表放在一起',
            '调整：「分享」与「导入分享」并排放到页面右上角；未选中笔记时分享按钮自动禁用',
          ],
          en: [
            'Changed: search now sits at the top of the note sidebar, next to the list it filters',
            'Changed: Share and Import share now sit together in the upper-right; Share is disabled when no note is selected',
          ],
        },
      },
      {
        version: '1.8.0',
        at: '2026-10-25T23:31+08:00',
        source: 'external',
        sourceName: 'Codex',
        points: {
          zh: [
            '新增：笔记分享快照——可复制版本化分享码，并在另一台设备或另一位用户的笔记模块中导入',
            '新增：正文、标题和图片随快照传递；导入笔记保留分享者、分享时间和来源笔记标识',
            '边界：分享是一次性快照，不会自动同步后续编辑；自动维护笔记导入后会成为普通笔记',
            '优化：同一分享快照重复导入时定位已有笔记，不制造重复副本',
          ],
          en: [
            'New: note sharing snapshots — copy a versioned share code and import it in Notes on another device or for another user',
            'New: title, body, and images travel with the snapshot; imported notes retain sender, share time, and source-note provenance',
            'Boundary: sharing is a one-time snapshot and later edits do not sync; an auto-maintained note becomes an ordinary note after import',
            'Improved: importing the same snapshot again selects the existing note instead of creating a duplicate',
          ],
        },
      },
      {
        version: '1.7.0',
        at: '2026-10-25T23:00+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：外部 Agent 的更新一律在标题括号中标注 Agent 名，缺失时显示「外部 Agent（未署名）」',
            '修复：版本记录标题里手工补写的 Agent 名，不会再被自动同步覆盖',
            '优化：文档明确外部 Agent 必须填写 sourceName（如 Codex）',
          ],
          en: [
            'New: external updates always name the agent in parentheses; a missing name shows External agent (unidentified)',
            'Fixed: an agent name added by hand to a version heading survives later automatic re-syncs',
            'Improved: docs now require external agents to set sourceName (for example Codex)',
          ],
        },
      },
      {
        version: '1.6.0',
        at: '2026-10-25T22:55+08:00',
        source: 'harness',
        points: {
          zh: [
            '修复：外部 Agent 的更新者归属——source 写成 Agent 名（如 codex）时不再被误判成 DeepSeek Harness',
            '修复：source 缺失时显示「未署名更新者」，不再默认记成 DeepSeek Harness',
            '优化：注册表与文档明确 source 取值（harness、external + sourceName、或任意 Agent 名）',
          ],
          en: [
            'Fixed: an external agent whose source was its own name (for example codex) is no longer misattributed to DeepSeek Harness',
            'Fixed: a missing source is shown as unattributed instead of defaulting to DeepSeek Harness',
            'Improved: the registry and docs spell out the accepted source values (harness, external + sourceName, or any agent name)',
          ],
        },
      },
      {
        version: '1.5.0',
        at: '2026-10-25T22:20+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：为每个插件自动维护独立版本记录笔记——插件加载时向「笔记」注册自己的版本清单即可',
            '新增：面聊录音插件（facechat-recorder）的版本记录笔记',
            '优化：版本记录笔记在列表中标注「自动维护」，旧的单一日志笔记自动迁移到按插件机制',
          ],
          en: [
            'New: one auto-maintained version-log note per plugin — a plugin registers its release list with Notes when it loads',
            'New: a version-log note for the face-to-face recorder (facechat-recorder)',
            'Improved: version-log notes are tagged auto-maintained in the list, and the old single-log note migrates to the per-plugin scheme',
          ],
        },
      },
      {
        version: '1.4.0',
        at: '2026-10-25T01:15+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：版本记录精确到分钟，并在标题中标注更新者（DeepSeek Harness 或外部 Agent）',
            '优化：已存在的版本条目会自动补全时间与更新者，不改动条目的正文内容',
          ],
          en: [
            'New: release entries are stamped to the minute and name their source (DeepSeek Harness or an external agent)',
            'Improved: existing entries are re-stamped with time and source without touching their bullet content',
          ],
        },
      },
      {
        version: '1.3.0',
        at: '2026-10-25T01:02+08:00',
        source: 'external',
        points: {
          zh: [
            '新增：正文字号调整，编辑区底部的 A− / A+ 可在 12–22px 之间切换，偏好按浏览器记忆',
            '优化：字号只影响编辑与阅读，不会改动笔记内容本身',
            '来源：由并行写入的外部 Agent 加入，本会话未参与该改动',
          ],
          en: [
            'New: adjustable body text size — A− / A+ in the editor footer steps between 12 and 22 px, remembered per browser',
            'Improved: the text-size preference affects editing and reading only; it never changes note content',
            'Source: added by a concurrently running external agent; this session did not make the change',
          ],
        },
      },
      {
        version: '1.2.0',
        at: '2026-10-25T01:01+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：版本记录自动维护——插件加载或升级后，会把尚未记录的版本追加到本笔记',
            '本笔记由插件维护，只追加缺失的版本条目，不会覆盖你在下方补充的内容',
          ],
          en: [
            'New: this version log is maintained by the plugin itself — on load or upgrade it appends any release missing from the note',
            'The plugin only appends missing entries and leaves your own additions below untouched',
          ],
        },
      },
      {
        version: '1.1.0',
        at: '2026-10-25T00:58+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增：笔记图片，可粘贴（Ctrl/Cmd+V）、拖入编辑区，或点「添加图片」选择文件',
            '新增：图片缩略图、大图预览（Esc 关闭）、复制图片到剪贴板（PNG）、两步确认移除',
            '优化：图片存入前自动压缩，最长边 1600px、优先 WebP，单条笔记最多 24 张',
            '优化：存储预算保护与保存失败提示；超限时明确报错，不再静默丢图',
            '兼容：旧笔记自动补全图片字段，无需迁移',
          ],
          en: [
            'New: images in notes — paste (Ctrl/Cmd+V), drop onto the editor, or pick files with Add image',
            'New: image thumbnails, full-size preview (Escape closes), copy an image to the clipboard as PNG, and two-step remove',
            'Improved: images are downscaled to a 1600 px longest edge and re-encoded as WebP before storage; at most 24 images per note',
            'Improved: storage budget guard and visible save-failure state; over-limit images are rejected instead of being dropped silently',
            'Compatible: older notes gain the images field automatically, no migration needed',
          ],
        },
      },
      {
        version: '1.0.0',
        at: '2026-10-25T00:42+08:00',
        source: 'harness',
        points: {
          zh: [
            '首个版本：主区域「笔记」面板与侧边栏入口',
            '笔记列表 + 编辑区：新建、搜索、300ms 防抖自动保存、两步确认删除',
            '中英文双语、跟随明暗主题、空状态引导',
          ],
          en: [
            'First release: a Notes panel in the main column with a sidebar entry',
            'Note list and editor: create, search, 300 ms debounced autosave, two-step delete',
            'English and Chinese UI, light and dark themes, empty states',
          ],
        },
      },
    ];

    const DICTS = {
      en: {
        title: 'Notes',
        newNote: 'New note',
        untitled: 'Untitled',
        searchPlaceholder: 'Search notes',
        emptyTitle: 'No notes yet',
        emptyHint: 'Capture an idea, a link, or a plan. Notes are stored in this browser.',
        noResults: 'No notes match your search',
        selectTitle: 'Select a note',
        selectHint: 'Pick a note on the left, or create one.',
        titlePlaceholder: 'Title',
        bodyPlaceholder: 'Start writing… paste or drop an image to add one',
        delete: 'Delete',
        confirmDelete: 'Confirm delete',
        saved: 'Saved automatically',
        saveFailed: 'Not saved — browser storage is full',
        justNow: 'just now',
        characters: 'characters',
        noteCount: 'notes',
        noContent: 'No content',
        addImage: 'Add image',
        copyImage: 'Copy image',
        copied: 'Copied',
        copyFailed: 'Could not copy the image to the clipboard',
        removeImage: 'Remove image',
        confirmRemove: 'Remove?',
        imageAlt: 'Note image',
        processingImage: 'Processing image…',
        imageUnsupported: 'That image could not be added',
        imageFailed: 'Adding the image failed',
        imageLimit: 'This note already holds as many images as it can',
        imageCount: 'images',
        bodyFontSize: 'Text size',
        decreaseFontSize: 'Decrease text size',
        increaseFontSize: 'Increase text size',
        storageFull: 'Browser storage is full — remove some images or notes and try again',
        previewImage: 'Image preview',
        close: 'Close',
        dropHint: 'Drop images to add them',
        changelogTitle: 'Notes plugin version log',
        autoMaintained: 'auto-maintained',
        pinNote: 'Pin to top',
        unpinNote: 'Unpin',
        pinned: 'Pinned',
        importShare: 'Import share',
        share: 'Share',
        shareNote: 'Share note',
        shareSnapshotTitle: 'Share a snapshot',
        shareSnapshotHint:
          'Copy this code to another person or device. It includes the title, body, and images, but later edits will not sync.',
        sharePrivacy: 'Anyone with the code can read this snapshot. Send it only to people you trust.',
        senderName: 'Your name (optional)',
        senderNamePlaceholder: 'Shown to the recipient',
        shareCode: 'Share code',
        copyShareCode: 'Copy share code',
        shareCodeCopied: 'Share code copied',
        shareCopyFailed: 'Could not copy the share code',
        h5Title: 'View without the plugin',
        h5Hint:
          'Export this snapshot as a standalone H5 page. The recipient opens the downloaded file in any phone or desktop browser; images are embedded and no plugin is required.',
        exportH5: 'Export H5 page',
        copyH5: 'Copy H5 source',
        h5Exported: 'H5 page downloaded',
        h5Copied: 'H5 source copied',
        h5Failed: 'Could not export the H5 page',
        h5By: 'From',
        h5SharedAt: 'Shared at',
        h5Untitled: 'Untitled note',
        h5SnapshotNote: 'DSH Notes snapshot · one-time copy; later edits are not synced.',
        importShareTitle: 'Import a shared note',
        importShareHint:
          'Paste a DSH note share code. The imported copy is yours to edit and will not change the sender’s note.',
        importCodePlaceholder: 'Paste a code beginning with DSHNOTE1:',
        import: 'Import',
        invalidShareCode: 'This is not a valid DSH note share code',
        unsupportedShareCode: 'This share code uses an unsupported version',
        shareCodeTooLarge: 'This share code is too large to import',
        importedShare: 'Shared snapshot',
        importedFrom: 'From {name}',
        importedAnonymous: 'Imported shared snapshot',
        importedSuccess: 'Shared note imported',
        importedDuplicate: 'This snapshot was already imported; the existing note is selected',
        snapshotBoundary: 'Snapshot only · later edits do not sync',
      },
      zh: {
        title: '笔记',
        newNote: '新建笔记',
        untitled: '无标题笔记',
        searchPlaceholder: '搜索笔记',
        emptyTitle: '还没有笔记',
        emptyHint: '记下一个想法、一个链接或一份计划。笔记保存在当前浏览器中。',
        noResults: '没有匹配的笔记',
        selectTitle: '选择一条笔记',
        selectHint: '在左侧选择一条笔记，或新建一条。',
        titlePlaceholder: '标题',
        bodyPlaceholder: '开始记录… 可粘贴或拖入图片',
        delete: '删除',
        confirmDelete: '确认删除',
        saved: '已自动保存',
        saveFailed: '保存失败——浏览器存储空间不足',
        justNow: '刚刚',
        characters: '字',
        noteCount: '条笔记',
        noContent: '暂无内容',
        addImage: '添加图片',
        copyImage: '复制图片',
        copied: '已复制',
        copyFailed: '无法把图片复制到剪贴板',
        removeImage: '移除图片',
        confirmRemove: '确认移除',
        imageAlt: '笔记图片',
        processingImage: '正在处理图片…',
        imageUnsupported: '无法添加该图片',
        imageFailed: '添加图片失败',
        imageLimit: '这条笔记的图片数量已达上限',
        imageCount: '张图片',
        bodyFontSize: '正文字号',
        decreaseFontSize: '减小字号',
        increaseFontSize: '增大字号',
        storageFull: '浏览器存储空间不足——请移除部分图片或笔记后重试',
        previewImage: '图片预览',
        close: '关闭',
        dropHint: '松开以添加图片',
        changelogTitle: '笔记插件版本记录',
        autoMaintained: '自动维护',
        pinNote: '置顶',
        unpinNote: '取消置顶',
        pinned: '已置顶',
        importShare: '导入分享',
        share: '分享',
        shareNote: '分享笔记',
        shareSnapshotTitle: '分享一份快照',
        shareSnapshotHint: '复制这段分享码给另一位用户或另一台设备。标题、正文和图片会一起传递，但后续编辑不会自动同步。',
        sharePrivacy: '拿到分享码的人可以读取这份快照，请只发给你信任的人。',
        senderName: '你的名字（可选）',
        senderNamePlaceholder: '接收方会看到这个名字',
        shareCode: '分享码',
        copyShareCode: '复制分享码',
        shareCodeCopied: '分享码已复制',
        shareCopyFailed: '无法复制分享码',
        h5Title: '不装插件也能看',
        h5Hint:
          '把这份快照导出为独立 H5 网页，对方用手机或电脑浏览器打开下载的文件即可查看；图片已内嵌，无需安装插件。',
        exportH5: '导出 H5 网页',
        copyH5: '复制 H5 源码',
        h5Exported: 'H5 网页已下载',
        h5Copied: 'H5 源码已复制',
        h5Failed: '导出 H5 失败',
        h5By: '分享者',
        h5SharedAt: '分享时间',
        h5Untitled: '无标题笔记',
        h5SnapshotNote: 'DSH 笔记快照 · 一次性副本，后续编辑不会同步。',
        importShareTitle: '导入分享笔记',
        importShareHint: '粘贴 DSH 笔记分享码。导入后的副本归你编辑，不会改动发送方的笔记。',
        importCodePlaceholder: '粘贴以 DSHNOTE1: 开头的分享码',
        import: '导入',
        invalidShareCode: '这不是有效的 DSH 笔记分享码',
        unsupportedShareCode: '该分享码版本暂不支持',
        shareCodeTooLarge: '这份分享内容过大，无法导入',
        importedShare: '分享快照',
        importedFrom: '来自 {name}',
        importedAnonymous: '来自匿名分享',
        importedSuccess: '分享笔记已导入',
        importedDuplicate: '这份快照已导入过，已为你定位到原笔记',
        snapshotBoundary: '一次性快照 · 后续编辑不会同步',
      },
    };

    /* ------------------------------------------------------------------ *
     * Persistence
     * ------------------------------------------------------------------ */

    function makeId() {
      try {
        if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
      } catch (err) {
        /* fall through to a local id */
      }
      return 'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function normalizeImage(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : '';
      if (dataUrl.indexOf('data:image/') !== 0 || dataUrl.length > MAX_IMAGE_DATAURL) return null;
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
        dataUrl,
        width: Number.isFinite(raw.width) ? raw.width : 0,
        height: Number.isFinite(raw.height) ? raw.height : 0,
        addedAt: Number.isFinite(raw.addedAt) ? raw.addedAt : Date.now(),
      };
    }

    function normalizeSharedFrom(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const shareId = typeof raw.shareId === 'string' ? raw.shareId.trim().slice(0, 160) : '';
      if (!shareId) return null;
      const sourceNoteId =
        typeof raw.sourceNoteId === 'string' ? raw.sourceNoteId.trim().slice(0, 200) : '';
      const senderName =
        typeof raw.senderName === 'string' ? raw.senderName.trim().slice(0, 80) : '';
      return {
        shareId,
        sourceNoteId,
        senderName,
        sharedAt: Number.isFinite(raw.sharedAt) ? raw.sharedAt : 0,
        importedAt: Number.isFinite(raw.importedAt) ? raw.importedAt : Date.now(),
      };
    }

    function normalizeNote(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const hasTitle = typeof raw.title === 'string';
      const hasBody = typeof raw.body === 'string';
      if (!hasTitle && !hasBody) return null;
      const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
      const images = [];
      if (Array.isArray(raw.images)) {
        for (const item of raw.images) {
          const image = normalizeImage(item);
          if (image && images.length < MAX_IMAGES_PER_NOTE) images.push(image);
        }
      }
      const note = {
        id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
        title: hasTitle ? raw.title : '',
        body: hasBody ? raw.body : '',
        images,
        pinned: raw.pinned === true,
        createdAt,
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt,
      };
      if (typeof raw.system === 'string' && raw.system) note.system = raw.system;
      const sharedFrom = normalizeSharedFrom(raw.sharedFrom);
      if (sharedFrom) note.sharedFrom = sharedFrom;
      return note;
    }

    function loadState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { notes: [], selectedId: null };
        const parsed = JSON.parse(raw);
        const source = parsed && Array.isArray(parsed.notes) ? parsed.notes : [];
        const notes = [];
        const seen = new Set();
        for (const item of source) {
          const note = normalizeNote(item);
          if (note && !seen.has(note.id)) {
            seen.add(note.id);
            notes.push(note);
          }
        }
        const wanted = parsed && typeof parsed.selectedId === 'string' ? parsed.selectedId : null;
        const selectedId =
          wanted && notes.some((note) => note.id === wanted)
            ? wanted
            : notes.length
              ? notes[0].id
              : null;
        return { notes, selectedId };
      } catch (err) {
        return { notes: [], selectedId: null };
      }
    }

    function loadFontSize() {
      try {
        const value = Number(window.localStorage.getItem(FONT_SIZE_STORAGE_KEY));
        return FONT_SIZES.indexOf(value) !== -1 ? value : DEFAULT_FONT_SIZE;
      } catch (err) {
        return DEFAULT_FONT_SIZE;
      }
    }

    function saveFontSize(value) {
      try {
        window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(value));
      } catch (err) {
        /* Font size remains active for this page even if storage is unavailable. */
      }
    }

    function loadShareName() {
      try {
        const value = window.localStorage.getItem(SHARE_NAME_STORAGE_KEY);
        return typeof value === 'string' ? value.slice(0, 80) : '';
      } catch (err) {
        return '';
      }
    }

    function saveShareName(value) {
      try {
        window.localStorage.setItem(SHARE_NAME_STORAGE_KEY, String(value || '').slice(0, 80));
      } catch (err) {
        /* Sharing still works for this page if the preference cannot be saved. */
      }
    }

    function encodeUtf8Base64Url(text) {
      const bytes = new TextEncoder().encode(text);
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function decodeUtf8Base64Url(encoded) {
      if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('invalid');
      const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new TextDecoder().decode(bytes);
    }

    function createSharePayload(note, senderName) {
      if (!note || typeof note !== 'object') throw new Error('invalid');
      return {
        schema: 'dsh-note-share',
        version: 1,
        shareId: makeId(),
        sharedAt: Date.now(),
        sourceNoteId: typeof note.id === 'string' ? note.id : '',
        senderName: typeof senderName === 'string' ? senderName.trim().slice(0, 80) : '',
        title: typeof note.title === 'string' ? note.title : '',
        body: typeof note.body === 'string' ? note.body : '',
        images: Array.isArray(note.images)
          ? note.images.slice(0, MAX_IMAGES_PER_NOTE).map((image) => ({
              dataUrl: image.dataUrl,
              width: image.width,
              height: image.height,
              addedAt: image.addedAt,
            }))
          : [],
      };
    }

    function encodeSharePayload(payload) {
      const code = SHARE_CODE_PREFIX + encodeUtf8Base64Url(JSON.stringify(payload));
      if (code.length > MAX_SHARE_CODE_LENGTH) {
        const error = new Error('too-large');
        error.code = 'too-large';
        throw error;
      }
      return code;
    }

    function createShareCode(note, senderName) {
      return encodeSharePayload(createSharePayload(note, senderName));
    }

    function parseShareCode(rawCode) {
      const code = typeof rawCode === 'string' ? rawCode.trim() : '';
      if (code.length > MAX_SHARE_CODE_LENGTH) {
        const error = new Error('too-large');
        error.code = 'too-large';
        throw error;
      }
      if (code.indexOf(SHARE_CODE_PREFIX) !== 0) {
        const error = new Error('invalid');
        error.code = 'invalid';
        throw error;
      }
      let parsed;
      try {
        parsed = JSON.parse(decodeUtf8Base64Url(code.slice(SHARE_CODE_PREFIX.length)));
      } catch (err) {
        const error = new Error('invalid');
        error.code = 'invalid';
        throw error;
      }
      if (!parsed || parsed.schema !== 'dsh-note-share') {
        const error = new Error('invalid');
        error.code = 'invalid';
        throw error;
      }
      if (parsed.version !== 1) {
        const error = new Error('unsupported');
        error.code = 'unsupported';
        throw error;
      }
      if (
        typeof parsed.shareId !== 'string' ||
        !parsed.shareId.trim() ||
        typeof parsed.title !== 'string' ||
        typeof parsed.body !== 'string' ||
        !Array.isArray(parsed.images)
      ) {
        const error = new Error('invalid');
        error.code = 'invalid';
        throw error;
      }
      const images = [];
      for (const rawImage of parsed.images.slice(0, MAX_IMAGES_PER_NOTE)) {
        const image = normalizeImage(rawImage);
        if (!image) {
          const error = new Error('invalid');
          error.code = 'invalid';
          throw error;
        }
        images.push(image);
      }
      return {
        schema: 'dsh-note-share',
        version: 1,
        shareId: parsed.shareId.trim().slice(0, 160),
        sharedAt: Number.isFinite(parsed.sharedAt) ? parsed.sharedAt : 0,
        sourceNoteId:
          typeof parsed.sourceNoteId === 'string' ? parsed.sourceNoteId.trim().slice(0, 200) : '',
        senderName:
          typeof parsed.senderName === 'string' ? parsed.senderName.trim().slice(0, 80) : '',
        title: parsed.title,
        body: parsed.body,
        images,
      };
    }

    async function copyTextToClipboard(text) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (err) {
        /* fall through to the selection-based copy path */
      }
      try {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(field);
        return copied;
      } catch (err) {
        return false;
      }
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function sanitizeShareFileName(title, fallback) {
      const forbidden = String.fromCharCode(92) + '/:*?"<>|';
      const raw = String(title || '');
      let text = '';
      for (const ch of raw) {
        if (forbidden.indexOf(ch) !== -1 || ch.charCodeAt(0) < 32) text += ' ';
        else text += ch;
      }
      text = text.replace(/\s+/g, ' ').trim().slice(0, 60);
      return (text || fallback || 'note') + '.html';
    }

    function downloadTextFile(filename, content, mime) {
      const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
    }

    const SHARE_H5_CSP =
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

    /** Build a self-contained, mobile-friendly H5 page from a share snapshot. */
    function renderInlineMarkdownHtml(text) {
      const input = String(text == null ? '' : text);
      let html = '';
      let index = 0;
      while (index < input.length) {
        const rest = input.slice(index);
        let match;
        if ((match = /^\\([\\`*\[\]|])/.exec(rest))) {
          html += escapeHtml(match[1]);
        } else if ((match = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest))) {
          html += '<code>' + escapeHtml(match[2].replace(/^ (.*) $/s, '$1')) + '</code>';
        } else if ((match = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/.exec(rest))) {
          html += '<a href="' + escapeHtml(match[2]) + '" target="_blank" rel="noreferrer noopener">' + renderInlineMarkdownHtml(match[1]) + '</a>';
        } else if ((match = /^\*\*([^*\n]+)\*\*/.exec(rest))) {
          html += '<strong>' + renderInlineMarkdownHtml(match[1]) + '</strong>';
        } else if ((match = /^\*([^*\n]+)\*/.exec(rest))) {
          html += '<em>' + renderInlineMarkdownHtml(match[1]) + '</em>';
        } else {
          html += escapeHtml(input[index++]);
          continue;
        }
        index += match[0].length;
      }
      return html;
    }

    function renderMarkdownHtml(text) {
      const blocks = parseMarkdownBlocks(text);
      if (!blocks.length) return '';
      return blocks
        .map((block) => {
          if (block.type === 'heading') {
            const level = Math.min(6, Math.max(1, block.level));
            return '<h' + level + '>' + renderInlineMarkdownHtml(block.text) + '</h' + level + '>';
          }
          if (block.type === 'paragraph') {
            return '<p>' + renderInlineMarkdownHtml(block.text) + '</p>';
          }
          if (block.type === 'list') {
            const tag = block.ordered ? 'ol' : 'ul';
            return (
              '<' +
              tag +
              '>' +
              block.items
                .map((item) => '<li>' + renderInlineMarkdownHtml(item) + '</li>')
                .join('') +
              '</' +
              tag +
              '>'
            );
          }
          if (block.type === 'quote') {
            return '<blockquote>' + renderInlineMarkdownHtml(block.text) + '</blockquote>';
          }
          if (block.type === 'code') {
            return '<pre><code>' + escapeHtml(block.text) + '</code></pre>';
          }
          if (block.type === 'hr') return '<hr>';
          if (block.type === 'table') {
            const align = (index) => block.aligns[index] || 'left';
            const header = block.headers
              .map(
                (cell, index) =>
                  '<th style="text-align:' +
                  align(index) +
                  '">' +
                  renderInlineMarkdownHtml(cell) +
                  '</th>',
              )
              .join('');
            const rows = block.rows
              .map(
                (row) =>
                  '<tr>' +
                  row
                    .map(
                      (cell, index) =>
                        '<td style="text-align:' +
                        align(index) +
                        '">' +
                        renderInlineMarkdownHtml(cell) +
                        '</td>',
                    )
                    .join('') +
                  '</tr>',
              )
              .join('');
            return (
              '<div class="tablewrap"><table><thead><tr>' +
              header +
              '</tr></thead><tbody>' +
              rows +
              '</tbody></table></div>'
            );
          }
          return '';
        })
        .join('\n');
    }

    function buildStandaloneHtml(payload, t, lang) {
      const zh = lang === 'zh';
      const titleText =
        typeof payload.title === 'string' && payload.title.trim() ? payload.title : t('h5Untitled');
      const images = Array.isArray(payload.images)
        ? payload.images.filter(
            (image) =>
              image &&
              typeof image.dataUrl === 'string' &&
              image.dataUrl.indexOf('data:image/') === 0,
          )
        : [];
      const sharedAt = payload.sharedAt
        ? new Date(payload.sharedAt).toLocaleString(zh ? 'zh-CN' : 'en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      const meta = [];
      if (payload.senderName) meta.push(t('h5By') + ' ' + payload.senderName);
      if (sharedAt) meta.push(t('h5SharedAt') + ' ' + sharedAt);
      const imageHtml = images
        .map(
          (image) =>
            '<figure><img src="' + escapeHtml(image.dataUrl) + '" alt="" loading="lazy"></figure>',
        )
        .join('\n');
      return [
        '<!doctype html>',
        '<html lang="' + (zh ? 'zh-CN' : 'en') + '">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        '<meta name="color-scheme" content="light dark">',
        '<meta http-equiv="Content-Security-Policy" content="' + SHARE_H5_CSP + '">',
        '<title>' + escapeHtml(titleText) + '</title>',
        '<style>',
        ':root{color-scheme:light dark}',
        '*{box-sizing:border-box}',
        'body{margin:0;background:#f2f3f5;color:#1b1c1e;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.75;-webkit-text-size-adjust:100%}',
        'main{max-width:760px;margin:0 auto;padding:24px 16px 48px}',
        'article{background:#fff;border:1px solid #e3e4e8;border-radius:16px;padding:24px 20px 28px;box-shadow:0 6px 24px rgba(0,0,0,.06)}',
        'header{font-size:12px;color:#6b6d73;margin-bottom:6px}',
        'h1{font-size:24px;line-height:1.35;margin:6px 0 18px;word-break:break-word}',
        '.body{font-size:16px;word-break:break-word}',
        '.body>:first-child{margin-top:0}',
        '.body h1,.body h2,.body h3,.body h4,.body h5,.body h6{line-height:1.35;margin:22px 0 10px}',
        '.body h1{font-size:1.6em}',
        '.body h2{font-size:1.4em}',
        '.body h3{font-size:1.2em}',
        '.body p{margin:0 0 12px;white-space:pre-wrap}',
        '.body ul,.body ol{margin:0 0 12px;padding-left:1.5em}',
        '.body li{margin:2px 0}',
        '.body blockquote{margin:0 0 12px;padding:2px 12px;border-left:3px solid #6b8afd;color:#5c6070;white-space:pre-wrap}',
        '.body pre{margin:0 0 12px;padding:10px 12px;border:1px solid #e3e4e8;border-radius:8px;background:#f6f7f9;overflow-x:auto;font-size:.9em;line-height:1.55}',
        '.body pre code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}',
        '.body code{padding:1px 4px;border-radius:4px;background:#f1f2f4;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}',
        '.body hr{border:none;border-top:1px solid #e3e4e8;margin:16px 0}',
        '.tablewrap{margin:0 0 14px;overflow-x:auto;border:1px solid #e3e4e8;border-radius:10px}',
        '.tablewrap table{border-collapse:collapse;width:100%;font-size:.95em;line-height:1.55}',
        '.tablewrap th,.tablewrap td{padding:6px 10px;border-bottom:1px solid #e3e4e8;border-right:1px solid #e3e4e8;vertical-align:top}',
        '.tablewrap th{font-weight:600;background:#f6f7f9;white-space:nowrap}',
        '.tablewrap tr:last-child td{border-bottom:none}',
        '.tablewrap th:last-child,.tablewrap td:last-child{border-right:none}',
        '@media (prefers-color-scheme:dark){.body blockquote{color:#a1a4ad}.body pre,.body code{background:#22242a;border-color:#2a2c31}.tablewrap{border-color:#2a2c31}.tablewrap th,.tablewrap td{border-color:#2a2c31}.tablewrap th{background:#22242a}}',
        '.images{display:flex;flex-direction:column;gap:12px;margin-top:20px}',
        'figure{margin:0}',
        'img{display:block;max-width:100%;height:auto;border-radius:12px;border:1px solid #e3e4e8}',
        'footer{margin-top:24px;padding-top:14px;border-top:1px solid #e3e4e8;font-size:12px;line-height:1.6;color:#6b6d73}',
        '@media (prefers-color-scheme:dark){body{background:#0f1012;color:#e9eaee}article{background:#1a1b1e;border-color:#2a2c31;box-shadow:none}h1{color:#f1f2f5}.body{color:#e9eaee}img{border-color:#2a2c31}footer,header{color:#a1a4ad;border-color:#2a2c31}}',
        '</style>',
        '</head>',
        '<body>',
        '<main>',
        '<article>',
        meta.length ? '<header>' + escapeHtml(meta.join(' · ')) + '</header>' : '',
        '<h1>' + escapeHtml(titleText) + '</h1>',
        '<div class="body">' + renderMarkdownHtml(withoutTitleHeading(payload.body || '', payload.title)) + '</div>',
        imageHtml ? '<div class="images">' + imageHtml + '</div>' : '',
        '<footer>' + escapeHtml(t('h5SnapshotNote')) + '</footer>',
        '</article>',
        '</main>',
        '</body>',
        '</html>',
        '',
      ].join('\n');
    }

    function createNotesStore() {
      let state = loadState();
      const listeners = new Set();
      let saveTimer = null;
      let saveError = false;

      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (err) {
            /* one faulty view must not stop the others */
          }
        }
      }

      function persistNow() {
        if (saveTimer !== null) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          if (saveError) {
            saveError = false;
            emit();
          }
          return true;
        } catch (err) {
          if (!saveError) {
            saveError = true;
            emit();
          }
          return false;
        }
      }

      function schedulePersist() {
        if (saveTimer !== null) clearTimeout(saveTimer);
        saveTimer = setTimeout(persistNow, SAVE_DELAY);
      }

      function commit(next) {
        state = next;
        emit();
        schedulePersist();
      }

      function mapNote(noteId, change) {
        let changed = false;
        const notes = state.notes.map((note) => {
          if (note.id !== noteId) return note;
          const next = change(note);
          if (!next || next === note) return note;
          changed = true;
          return next;
        });
        return changed ? notes : null;
      }

      return {
        getSnapshot() {
          return state;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        isSaveError() {
          return saveError;
        },
        flush: persistNow,
        createNote(options) {
          const opts = options && typeof options === 'object' ? options : {};
          const now = Date.now();
          const note = {
            id: makeId(),
            title: typeof opts.title === 'string' ? opts.title : '',
            body: typeof opts.body === 'string' ? opts.body : '',
            images: [],
            pinned: false,
            createdAt: now,
            updatedAt: now,
          };
          if (typeof opts.system === 'string' && opts.system) note.system = opts.system;
          const selectedId =
            opts.select === false && state.selectedId ? state.selectedId : note.id;
          commit({ notes: [note, ...state.notes], selectedId });
          return note.id;
        },
        /** Import one immutable sharing snapshot as an ordinary local note. */
        importSharedNote(payload) {
          if (!payload || typeof payload !== 'object' || !payload.shareId) {
            return { status: 'invalid', id: null };
          }
          const duplicate = state.notes.find(
            (note) => note.sharedFrom && note.sharedFrom.shareId === payload.shareId,
          );
          if (duplicate) {
            if (state.selectedId !== duplicate.id) {
              commit({ notes: state.notes, selectedId: duplicate.id });
            }
            return { status: 'duplicate', id: duplicate.id };
          }
          const now = Date.now();
          const note = {
            id: makeId(),
            title: typeof payload.title === 'string' ? payload.title : '',
            body: typeof payload.body === 'string' ? payload.body : '',
            images: Array.isArray(payload.images)
              ? payload.images.slice(0, MAX_IMAGES_PER_NOTE).map((image) =>
                  Object.assign({}, image, { id: makeId() }),
                )
              : [],
            createdAt: now,
            updatedAt: now,
            sharedFrom: {
              shareId: payload.shareId,
              sourceNoteId: payload.sourceNoteId || '',
              senderName: payload.senderName || '',
              sharedAt: Number.isFinite(payload.sharedAt) ? payload.sharedAt : 0,
              importedAt: now,
            },
          };
          const next = { notes: [note, ...state.notes], selectedId: note.id };
          try {
            if (JSON.stringify(next).length > MAX_STORE_BYTES) {
              return { status: 'full', id: null };
            }
          } catch (err) {
            return { status: 'full', id: null };
          }
          commit(next);
          return { status: 'ok', id: note.id };
        },
        updateNote(id, patch) {
          const notes = mapNote(id, (note) =>
            Object.assign({}, note, patch, { updatedAt: Date.now() }),
          );
          if (notes) commit({ notes, selectedId: state.selectedId });
        },
        deleteNote(id) {
          const notes = state.notes.filter((note) => note.id !== id);
          const selectedId =
            state.selectedId === id ? (notes.length ? notes[0].id : null) : state.selectedId;
          commit({ notes, selectedId });
        },
        selectNote(id) {
          if (state.selectedId === id) return;
          commit({ notes: state.notes, selectedId: id });
        },
        /** Pin or unpin without changing the note's last-edit time. */
        setNotePinned(id, pinned) {
          const next = !!pinned;
          const notes = mapNote(id, (note) =>
            !!note.pinned === next ? note : Object.assign({}, note, { pinned: next }),
          );
          if (notes) commit({ notes, selectedId: state.selectedId });
        },
        /** Returns `ok`, `full` (would exceed the browser budget), or `missing`. */
        addImages(noteId, images) {
          let outcome = 'missing';
          const notes = mapNote(noteId, (note) => {
            const room = MAX_IMAGES_PER_NOTE - note.images.length;
            if (room <= 0) {
              outcome = 'full';
              return note;
            }
            outcome = 'ok';
            return Object.assign({}, note, {
              images: note.images.concat(images.slice(0, room)),
              updatedAt: Date.now(),
            });
          });
          if (outcome !== 'ok' || !notes) return outcome === 'missing' ? 'missing' : outcome;
          const next = { notes, selectedId: state.selectedId };
          try {
            if (JSON.stringify(next).length > MAX_STORE_BYTES) return 'full';
          } catch (err) {
            return 'full';
          }
          commit(next);
          return 'ok';
        },
        removeImages(noteId, imageIds) {
          const drop = new Set(imageIds);
          let removed = false;
          const notes = mapNote(noteId, (note) => {
            const images = note.images.filter((image) => !drop.has(image.id));
            if (images.length === note.images.length) return note;
            removed = true;
            return Object.assign({}, note, { images, updatedAt: Date.now() });
          });
          if (notes && removed) commit({ notes, selectedId: state.selectedId });
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Markdown preview: headings, lists, quotes, code, and pipe tables
     * ------------------------------------------------------------------ */

    function splitTableRow(line) {
      let text = String(line == null ? '' : line).trim();
      if (text.startsWith('|')) text = text.slice(1);
      if (text.endsWith('|')) text = text.slice(0, -1);
      const cells = [];
      let current = '';
      let escaped = false;
      for (const ch of text) {
        if (escaped) {
          current += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '|') {
          cells.push(current.trim());
          current = '';
          continue;
        }
        current += ch;
      }
      cells.push(current.trim());
      return cells;
    }

    function isTableSeparator(line) {
      const text = String(line == null ? '' : line).trim();
      if (text.indexOf('-') === -1 || text.indexOf('|') === -1) return false;
      const cells = splitTableRow(text);
      return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    }

    function tableAlignments(separators, width) {
      const aligns = [];
      for (let index = 0; index < width; index += 1) {
        const cell = separators[index] || '';
        if (cell.startsWith(':') && cell.endsWith(':')) aligns.push('center');
        else if (cell.endsWith(':')) aligns.push('right');
        else aligns.push('left');
      }
      return aligns;
    }

    function parseTable(lines, startIndex) {
      const headers = splitTableRow(lines[startIndex]);
      if (!headers.length) return null;
      const separators = splitTableRow(lines[startIndex + 1]);
      const aligns = tableAlignments(separators, headers.length);
      const rows = [];
      let index = startIndex + 2;
      while (index < lines.length && lines[index].trim() && lines[index].indexOf('|') !== -1) {
        const cells = splitTableRow(lines[index]);
        const row = headers.map((_, cellIndex) =>
          cells[cellIndex] == null ? '' : cells[cellIndex],
        );
        rows.push(row);
        index += 1;
      }
      return { table: { headers, aligns, rows }, nextIndex: index };
    }

    function isMarkdownBlockStart(lines, index) {
      const line = lines[index];
      if (!line || !line.trim()) return true;
      const trimmed = line.trim();
      if (/^```/.test(trimmed)) return true;
      if (/^#{1,6}\s+/.test(trimmed)) return true;
      if (/^>\s?/.test(trimmed)) return true;
      if (/^([-*+]|\d+[.)])\s+/.test(trimmed)) return true;
      if (/^[-*_]{3,}\s*$/.test(trimmed)) return true;
      if (
        trimmed.indexOf('|') !== -1 &&
        index + 1 < lines.length &&
        isTableSeparator(lines[index + 1])
      ) {
        return true;
      }
      return false;
    }

    function parseMarkdownBlocks(text, options) {
      const source = String(text == null ? '' : text);
      const rawLines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
      const lines = rawLines.map((line) => line.replace(/[\r\n]+$/, ''));
      const offsets = [0];
      rawLines.forEach((line) => offsets.push(offsets[offsets.length - 1] + line.length));
      const blocks = [];
      const spans = [];
      const sourceScope = {};
      let index = 0;
      const add = (block, start) => {
        blocks.push(block);
        const last = Math.min(index, lines.length) - 1;
        spans.push({ contentStart: offsets[start], contentEnd: offsets[last] + lines[last].length });
      };
      while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) { index += 1; continue; }
        const start = index;
        const trimmed = line.trim();
        if (/^```/.test(trimmed)) {
          const fence = /^`{3,}/.exec(trimmed)[0];
          const language = trimmed.slice(fence.length).trim();
          const close = new RegExp('^`{' + fence.length + ',}\\s*$');
          const code = [];
          index += 1;
          while (index < lines.length && !close.test(lines[index].trim())) {
            code.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          // 无闭合围栏时，split 产生的末尾空行不是代码正文。
          if (index === lines.length && rawLines[rawLines.length - 1] === '') code.pop();
          add({ type: 'code', language, text: code.join('\n') }, start);
          continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
        if (heading) {
          index += 1;
          add({ type: 'heading', level: heading[1].length, text: heading[2].trim() }, start);
          continue;
        }
        if (/^[-*_]{3,}\s*$/.test(trimmed)) {
          index += 1;
          add({ type: 'hr' }, start);
          continue;
        }
        if (trimmed.indexOf('|') !== -1 && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
          const parsed = parseTable(lines, index);
          index = parsed.nextIndex;
          add(Object.assign({ type: 'table' }, parsed.table), start);
          continue;
        }
        if (/^>\s?/.test(trimmed)) {
          const quote = [];
          while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
            quote.push(lines[index].replace(/^\s*>\s?/, ''));
            index += 1;
          }
          add({ type: 'quote', text: quote.join('\n') }, start);
          continue;
        }
        if (/^([-*+]|\d+[.)])\s+/.test(trimmed)) {
          const ordered = /^\d+[.)]\s+/.test(trimmed);
          const items = [];
          const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
          while (index < lines.length && pattern.test(lines[index])) {
            items.push(lines[index].replace(pattern, ''));
            index += 1;
          }
          add({ type: 'list', ordered, items }, start);
          continue;
        }
        const paragraph = [line];
        index += 1;
        while (index < lines.length && !isMarkdownBlockStart(lines, index)) paragraph.push(lines[index++]);
        add({ type: 'paragraph', text: paragraph.join('\n') }, start);
      }
      if (options && options.sourceRanges) {
        blocks.forEach((block, blockIndex) => {
          const span = spans[blockIndex];
          const start = blockIndex ? span.contentStart : 0;
          const end = spans[blockIndex + 1] ? spans[blockIndex + 1].contentStart : source.length;
          block.source = {
            start, end, contentStart: span.contentStart, contentEnd: span.contentEnd,
            scope: sourceScope,
            raw: source.slice(start, end),
            prefix: source.slice(start, span.contentStart),
            suffix: source.slice(span.contentEnd, end),
          };
        });
      }
      return blocks;
    }

    function firstTitleHeading(body, title) {
      if (!String(title || '').trim()) return null;
      const first = parseMarkdownBlocks(body, { sourceRanges: true })[0];
      if (!first || first.type !== 'heading' || first.level !== 1) return null;
      const line = String(body).slice(first.source.contentStart, first.source.contentEnd);
      const match = /^([ \t]{0,3}#[ \t]+)(.*?)([ \t]+#+[ \t]*|[ \t]*)$/.exec(line);
      if (!match) return null;
      const visible = renderInlineMarkdownHtml(match[2]).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
      return match[2].trim() === String(title).trim() || visible === String(title).trim() ? { block: first, match } : null;
    }

    function renameTitleHeading(body, oldTitle, newTitle) {
      const heading = firstTitleHeading(body, oldTitle);
      if (!heading) return body;
      const range = heading.block.source;
      const title = String(newTitle).replace(/[\r\n]/g, ' ');
      return body.slice(0, range.contentStart) + heading.match[1] + title + heading.match[3] + body.slice(range.contentEnd);
    }

    function withoutTitleHeading(body, title) {
      const heading = firstTitleHeading(body, title);
      if (!heading) return body;
      const range = heading.block.source;
      return body.slice(0, range.contentStart) + body.slice(range.contentEnd);
    }

    function looksLikeMarkdown(text) {
      const value = String(text == null ? '' : text);
      return (
        /^#{1,6}\s/m.test(value) ||
        /^\s*\|.*\|\s*$/m.test(value) ||
        /^\s*[-*+]\s+/m.test(value) ||
        /^\s*\d+[.)]\s+/m.test(value) ||
        value.indexOf('```') !== -1
      );
    }

    function renderInlineMarkdown(text, keyPrefix) {
      const input = String(text == null ? '' : text);
      const nodes = [];
      let buffer = '';
      let index = 0;
      let key = 0;
      const flush = () => {
        if (buffer) {
          nodes.push(buffer);
          buffer = '';
        }
      };
      while (index < input.length) {
        const rest = input.slice(index);
        let match;
        if (rest[0] === '`' && (match = /^`([^`\n]+)`/.exec(rest))) {
          flush();
          nodes.push(h('code', { key: keyPrefix + '-code-' + key++ }, match[1]));
          index += match[0].length;
          continue;
        }
        if (
          rest[0] === '[' &&
          (match = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/.exec(rest))
        ) {
          flush();
          const href = match[2];
          nodes.push(
            h(
              'a',
              {
                key: keyPrefix + '-link-' + key++,
                href,
                target: '_blank',
                rel: 'noreferrer noopener',
                onClick: (event) => {
                  event.preventDefault();
                  try {
                    window.open(href, '_blank', 'noopener');
                  } catch (err) {
                    /* blocked popups keep the link inert */
                  }
                },
              },
              match[1],
            ),
          );
          index += match[0].length;
          continue;
        }
        if (rest[0] === '*' && rest[1] === '*' && (match = /^\*\*([^*\n]+)\*\*/.exec(rest))) {
          flush();
          nodes.push(h('strong', { key: keyPrefix + '-bold-' + key++ }, match[1]));
          index += match[0].length;
          continue;
        }
        if (rest[0] === '*' && (match = /^\*([^*\n]+)\*/.exec(rest))) {
          flush();
          nodes.push(h('em', { key: keyPrefix + '-em-' + key++ }, match[1]));
          index += match[0].length;
          continue;
        }
        buffer += rest[0];
        index += 1;
      }
      flush();
      return nodes;
    }

    function renderMarkdownTable(block, key) {
      return h(
        'div',
        { key, className: 'dsh-notes-md-tablewrap' },
        h(
          'table',
          { className: 'dsh-notes-md-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              block.headers.map((cell, cellIndex) =>
                h(
                  'th',
                  {
                    key: key + '-h-' + cellIndex,
                    style: { textAlign: block.aligns[cellIndex] || 'left' },
                  },
                  renderInlineMarkdown(cell, key + '-h-' + cellIndex),
                ),
              ),
            ),
          ),
          h(
            'tbody',
            null,
            block.rows.map((row, rowIndex) =>
              h(
                'tr',
                { key: key + '-r-' + rowIndex },
                row.map((cell, cellIndex) =>
                  h(
                    'td',
                    {
                      key: key + '-r-' + rowIndex + '-c-' + cellIndex,
                      style: { textAlign: block.aligns[cellIndex] || 'left' },
                    },
                    renderInlineMarkdown(cell, key + '-r-' + rowIndex + '-c-' + cellIndex),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    function renderMarkdownBlocks(blocks, keyPrefix) {
      return blocks.map((block, index) => {
        const key = keyPrefix + '-' + index;
        if (block.type === 'heading') {
          const level = Math.min(6, Math.max(1, block.level));
          return h(
            'h' + level,
            { key, className: 'dsh-notes-md-heading dsh-notes-md-h' + level },
            renderInlineMarkdown(block.text, key),
          );
        }
        if (block.type === 'paragraph') {
          return h(
            'p',
            { key, className: 'dsh-notes-md-p' },
            renderInlineMarkdown(block.text, key),
          );
        }
        if (block.type === 'list') {
          const tag = block.ordered ? 'ol' : 'ul';
          return h(
            tag,
            { key, className: 'dsh-notes-md-list' },
            block.items.map((item, itemIndex) =>
              h(
                'li',
                { key: key + '-i-' + itemIndex },
                renderInlineMarkdown(item, key + '-i-' + itemIndex),
              ),
            ),
          );
        }
        if (block.type === 'quote') {
          return h(
            'blockquote',
            { key, className: 'dsh-notes-md-quote' },
            renderInlineMarkdown(block.text, key),
          );
        }
        if (block.type === 'code') {
          return h(
            'pre',
            { key, className: 'dsh-notes-md-pre' },
            h('code', null, block.text),
          );
        }
        if (block.type === 'hr') {
          return h('hr', { key, className: 'dsh-notes-md-hr' });
        }
        if (block.type === 'table') {
          return renderMarkdownTable(block, key);
        }
        return null;
      });
    }

    // 单个连续补丁：只接受能够证明不重叠的修改，宁可提示冲突也不覆盖新版日志。
    function markdownPatch(base, next) {
      let start = 0;
      while (start < base.length && start < next.length && base[start] === next[start]) start += 1;
      let end = base.length;
      let nextEnd = next.length;
      while (end > start && nextEnd > start && base[end - 1] === next[nextEnd - 1]) { end -= 1; nextEnd -= 1; }
      return { start, end, text: next.slice(start, nextEnd) };
    }

    function rebaseMarkdown(base, latest, draft) {
      if (latest === base || draft === latest) return { ok: true, body: draft };
      if (draft === base) return { ok: true, body: latest };
      const local = markdownPatch(base, draft);
      const remote = markdownPatch(base, latest);
      if (local.start === remote.start || !(local.end <= remote.start || remote.end <= local.start)) {
        return { ok: false, body: latest, draft };
      }
      const shift = remote.end <= local.start ? remote.text.length - (remote.end - remote.start) : 0;
      return { ok: true, body: latest.slice(0, local.start + shift) + local.text + latest.slice(local.end + shift) };
    }

    function serializeInlineDom(node) {
      if (node.nodeType === 3) return String(node.nodeValue || '').replace(/\u00a0/g, ' ');
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') return '\n';
      if (/^(script|style|iframe|object|img)$/.test(tag)) return '';
      const text = Array.from(node.childNodes).map(serializeInlineDom).join('');
      if (tag === 'strong' || tag === 'b') return '**' + text + '**';
      if (tag === 'em' || tag === 'i') return '*' + text + '*';
      if (tag === 'code') {
        const value = node.textContent || '';
        const runs = value.match(/`+/g) || [];
        const fence = '`'.repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
        return fence + (value.startsWith('`') || value.endsWith('`') ? ' ' + value + ' ' : value) + fence;
      }
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        return /^https?:\/\/[^\s<>]+$/i.test(href) ? '[' + text + '](' + href.replace(/\)/g, '%29') + ')' : text;
      }
      return text;
    }

    function serializeBlockDom(node, record) {
      if (node.nodeType === 3) return serializeInlineDom(node);
      const tag = node.tagName.toLowerCase();
      const inline = () => Array.from(node.childNodes).map(serializeInlineDom).join('').replace(/\n$/, '');
      if (/^h[1-6]$/.test(tag)) return '#'.repeat(Number(tag[1])) + ' ' + inline();
      if (tag === 'pre') {
        const code = node.querySelector('code') || node;
        const value = code.textContent || '';
        const runs = value.match(/`+/g) || [];
        const fence = '`'.repeat(Math.max(2, ...runs.map((run) => run.length)) + 1);
        const language = record && record.block.type === 'code' ? record.block.language : node.getAttribute('data-language') || '';
        return fence + language + '\n' + value + '\n' + fence;
      }
      if (tag === 'ul' || tag === 'ol') {
        const start = Number(node.getAttribute('start')) || 1;
        return Array.from(node.children).map((item, index) => (tag === 'ol' ? (start + index) + '. ' : '- ') + serializeInlineDom(item).replace(/\n$/, '').replace(/\n/g, '\n  ')).join('\n');
      }
      if (tag === 'blockquote') return inline().split('\n').map((line) => '> ' + line).join('\n');
      if (tag === 'hr') return '---';
      const table = tag === 'table' ? node : node.querySelector('table');
      if (table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        const cells = (row) => Array.from(row.children).map((cell) => serializeInlineDom(cell).replace(/\|/g, '\\|').replace(/\n/g, '<br>'));
        const header = rows[0];
        if (!header) return '';
        const row = (values) => '| ' + values.join(' | ') + ' |';
        const aligns = Array.from(header.children).map((cell) => cell.style.textAlign === 'right' ? '---:' : cell.style.textAlign === 'center' ? ':---:' : '---');
        return [row(cells(header)), row(aligns), ...rows.slice(1).map((entry) => row(cells(entry)))].join('\n');
      }
      // 浏览器产生的 div/p 只在本块内转换，绝不把全页 innerText 当 Markdown。
      if (tag === 'div' && Array.from(node.children).some((child) => /^(DIV|P)$/.test(child.tagName))) {
        return Array.from(node.childNodes).map((child) => child.nodeType === 1 && /^(DIV|P)$/.test(child.tagName) ? serializeBlockDom(child) + '\n' : serializeInlineDom(child)).join('').replace(/\n$/, '');
      }
      return inline();
    }

    function serializeMarkdownDom(nodes, records, fallback) {
      const entries = Array.from(nodes).map((node) => {
        const record = records.get(node);
        if (record && node.outerHTML === record.fingerprint) return { text: record.block.source.raw, source: record.block.source };
        let text = serializeBlockDom(node, record);
        if (record) {
          const source = record.block.source;
          const eol = /\r\n/.test(source.raw) ? '\r\n' : /\r/.test(source.raw) ? '\r' : '\n';
          text = source.prefix + text.replace(/\n/g, eol) + source.suffix;
        }
        return { text, source: record && record.block.source };
      });
      if (!entries.length) return fallback || '';
      let output = '';
      entries.forEach((entry, index) => {
        const previous = index && entries[index - 1].source;
        const adjacent = previous && entry.source && previous.scope && previous.scope === entry.source.scope && previous.end === entry.source.start;
        if (index && entry.text && output && !/(?:\r\n|\r|\n){2}$/.test(output) && !adjacent) {
          output += /[\r\n]$/.test(output) ? '\n' : '\n\n';
        }
        output += entry.text;
      });
      return output;
    }

    function createMarkdownEditorController(root, options) {
      const titleNode = document.createElement('h1');
      titleNode.className = 'dsh-notes-note-title';
      titleNode.setAttribute('data-note-title', '');
      titleNode.setAttribute('data-placeholder', options.titlePlaceholder);
      const bodyNode = document.createElement('div');
      bodyNode.setAttribute('data-note-body', '');
      bodyNode.className = 'dsh-notes-markdown';
      bodyNode.setAttribute('data-placeholder', options.bodyPlaceholder);
      root.replaceChildren(titleNode, bodyNode);
      let records = new WeakMap();
      let base = options.note.body;
      let baseTitle = options.note.title;
      let composing = false;
      let saving = false;
      let conflict = false;
      let destroyed = false;
      let pending = null;
      let history = [{ body: base, title: baseTitle }];
      let historyIndex = 0;

      function currentSelection() {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
        const point = (node, offset) => {
          const area = titleNode.contains(node) ? titleNode : bodyNode;
          const range = document.createRange();
          range.selectNodeContents(area);
          range.setEnd(node, offset);
          const point = { title: area === titleNode, offset: range.toString().length };
          if (area === bodyNode) {
            let block = node.nodeType === 1 ? node : node.parentElement;
            while (block && block.parentElement !== bodyNode) block = block.parentElement;
            if (block) {
              const within = document.createRange(); within.selectNodeContents(block); within.setEnd(node, offset);
              point.blockOffset = within.toString().length;
              point.markdown = serializeBlockDom(block, records.get(block));
              const equals = Array.from(bodyNode.children).filter((entry) => serializeBlockDom(entry, records.get(entry)) === point.markdown);
              point.occurrence = equals.indexOf(block);
            }
          }
          return point;
        };
        return { anchor: point(selection.anchorNode, selection.anchorOffset), focus: point(selection.focusNode, selection.focusOffset) };
      }
      function restoreSelection(bookmark) {
        if (!bookmark) return;
        const locate = (point) => {
          let area = point.title ? titleNode : bodyNode;
          let offset = point.offset;
          if (!point.title && point.markdown !== undefined) {
            const equals = Array.from(bodyNode.children).filter((entry) => serializeBlockDom(entry, records.get(entry)) === point.markdown);
            const block = equals[point.occurrence];
            if (block) { area = block; offset = point.blockOffset; }
          }
          const walker = document.createTreeWalker(area, 4);
          let node;
          let last = null;
          while ((node = walker.nextNode())) {
            last = node;
            if (offset <= node.nodeValue.length) return [node, offset];
            offset -= node.nodeValue.length;
          }
          return last ? [last, last.nodeValue.length] : [area, 0];
        };
        const selection = window.getSelection();
        const anchor = locate(bookmark.anchor);
        const focus = locate(bookmark.focus);
        selection.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1]);
      }
      function placeCaret(node, end) {
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(!end);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      function makeBlock(block) {
        const template = document.createElement('template');
        template.innerHTML = renderMarkdownHtml(block.source ? block.source.raw.slice(block.source.prefix.length, block.source.raw.length - block.source.suffix.length) : serializeMarkdownBlock(block));
        const node = template.content.firstElementChild || document.createElement('p');
        if (block.type === 'table') { node.className = 'dsh-notes-md-tablewrap'; node.querySelector('table').className = 'dsh-notes-md-table'; }
        else node.className = 'dsh-notes-md-' + ({ heading: 'heading dsh-notes-md-h' + block.level, paragraph: 'p', list: 'list', quote: 'quote', code: 'pre', hr: 'hr' }[block.type] || 'p');
        if (block.type === 'code') node.setAttribute('data-language', block.language || '');
        if (block.source) records.set(node, { block, fingerprint: node.outerHTML });
        return node;
      }
      function draw(body, title, bookmark) {
        records = new WeakMap();
        titleNode.textContent = title;
        bodyNode.replaceChildren();
        const hidden = firstTitleHeading(body, title);
        parseMarkdownBlocks(body, { sourceRanges: true }).forEach((block, index) => {
          const node = makeBlock(block);
          if (!index && hidden) {
            node.hidden = true;
            node.setAttribute('contenteditable', 'false');
            records.get(node).fingerprint = node.outerHTML;
          }
          bodyNode.appendChild(node);
        });
        if (!bodyNode.children.length || !Array.from(bodyNode.children).some((node) => !node.hidden)) {
          const empty = document.createElement('p');
          empty.className = 'dsh-notes-md-p';
          empty.appendChild(document.createElement('br'));
          bodyNode.appendChild(empty);
          records.set(empty, { block: { source: { raw: hidden ? '' : body, prefix: '', suffix: '' } }, fingerprint: empty.outerHTML });
        }
        base = body;
        baseTitle = title;
        restoreSelection(bookmark);
      }
      function draft() {
        return { body: serializeMarkdownDom(bodyNode.childNodes, records, ''), title: titleNode.textContent.replace(/[\r\n]/g, ' ') };
      }
      function remember(value) {
        const last = history[historyIndex];
        if (last && last.body === value.body && last.title === value.title) return;
        history = history.slice(0, historyIndex + 1);
        history.push({ body: value.body, title: value.title, selection: currentSelection() });
        if (history.length > 100) history.shift();
        historyIndex = history.length - 1;
      }
      function commit(addHistory = true) {
        if (destroyed || composing) return !conflict;
        const value = draft();
        saving = true;
        const result = options.change(base, value.body, baseTitle, value.title);
        saving = false;
        if (!result.ok) {
          conflict = true;
          options.conflict(true);
          return false;
        }
        conflict = false;
        options.conflict(false);
        const bookmark = currentSelection();
        if (result.body !== value.body || result.title !== value.title) draw(result.body, result.title, bookmark);
        else { base = result.body; baseTitle = result.title; }
        if (addHistory) remember(result);
        return true;
      }
      function receive(note) {
        if (!note || destroyed || saving) return;
        if (composing) { pending = note; return; }
        if (note.body === base && note.title === baseTitle) return;
        const value = draft();
        const merge = rebaseMarkdown(base, note.body, value.body);
        if (!merge.ok || (baseTitle !== note.title && value.title !== baseTitle && value.title !== note.title)) {
          pending = note;
          conflict = true;
          options.conflict(true);
          return;
        }
        const bookmark = currentSelection();
        const title = value.title === baseTitle ? note.title : value.title;
        // 外部变动之后重新开始历史，防止撤销恢复一份过期全文。
        history = [{ body: note.body, title: note.title }];
        historyIndex = 0;
        draw(merge.body, title, bookmark);
        base = note.body;
        baseTitle = note.title;
        pending = null;
        commit();
      }
      function activeElement(selector) {
        const selection = window.getSelection();
        const node = selection && selection.anchorNode;
        const element = node && (node.nodeType === 1 ? node : node.parentElement);
        const match = element && element.closest(selector);
        return match && bodyNode.contains(match) ? match : null;
      }
      function insertText(text) {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || !bodyNode.contains(selection.anchorNode)) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      function convertShortcuts() {
        if (composing) return;
        const paragraph = activeElement('p');
        if (!paragraph || paragraph.parentElement !== bodyNode) return;
        const text = paragraph.textContent.replace(/\u00a0/g, ' ');
        const match = /^(#{1,6}|[-*+]|\d+\.|>) $/.exec(text);
        if (!match) return;
        let node;
        if (match[1][0] === '#') { node = document.createElement('h' + match[1].length); node.className = 'dsh-notes-md-heading dsh-notes-md-h' + match[1].length; }
        else if (match[1] === '>') { node = document.createElement('blockquote'); node.className = 'dsh-notes-md-quote'; }
        else {
          node = document.createElement(/^\d/.test(match[1]) ? 'ol' : 'ul');
          node.className = 'dsh-notes-md-list';
          const item = document.createElement('li');
          item.appendChild(document.createElement('br'));
          node.appendChild(item);
        }
        if (!node.children.length) node.appendChild(document.createElement('br'));
        paragraph.replaceWith(node);
        placeCaret(node.querySelector('li') || node, false);
      }
      function convertInline() {
        if (composing) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && root.contains(selection.anchorNode)) return;
        Array.from(bodyNode.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,th,td')).forEach((element) => {
          if (element.hidden) return;
          const walker = document.createTreeWalker(element, 4);
          const textNodes = [];
          let node;
          while ((node = walker.nextNode())) if (!node.parentElement.closest('code,a,strong,em,pre')) textNodes.push(node);
          textNodes.forEach((textNode) => {
            const text = textNode.nodeValue;
            const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|(?<!\*)\*(?!\*)[^*\n]+\*(?!\*)|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;
            if (!pattern.test(text)) return;
            pattern.lastIndex = 0;
            const fragment = document.createDocumentFragment();
            let offset = 0;
            let caret = null;
            let match;
            const caretOffset = selection && selection.anchorNode === textNode ? selection.anchorOffset : null;
            const appendText = (value, from) => {
              const part = document.createTextNode(value);
              fragment.appendChild(part);
              if (caretOffset !== null && caretOffset >= from && caretOffset <= from + value.length) caret = [part, caretOffset - from];
            };
            while ((match = pattern.exec(text))) {
              appendText(text.slice(offset, match.index), offset);
              const template = document.createElement('template');
              template.innerHTML = renderInlineMarkdownHtml(match[0]);
              const formatted = template.content.firstChild;
              fragment.appendChild(formatted);
              if (caretOffset !== null && caretOffset > match.index && caretOffset <= pattern.lastIndex) {
                if (caretOffset === pattern.lastIndex) {
                  const after = document.createTextNode('');
                  fragment.appendChild(after);
                  caret = [after, 0];
                } else caret = [formatted.firstChild, Math.min(formatted.textContent.length, Math.max(0, caretOffset - match.index - (match[0].startsWith('**') ? 2 : 1)))];
              }
              offset = pattern.lastIndex;
            }
            appendText(text.slice(offset), offset);
            textNode.replaceWith(fragment);
            if (caret) selection.setBaseAndExtent(caret[0], caret[1], caret[0], caret[1]);
          });
        });
      }
      function input(event) {
        if (composing || event.isComposing) return;
        convertShortcuts();
        convertInline();
        commit();
      }
      function undo(redo) {
        if (composing || conflict) return;
        const next = historyIndex + (redo ? 1 : -1);
        if (next < 0 || next >= history.length) return;
        const target = history[next];
        saving = true;
        const result = options.change(base, target.body, baseTitle, target.title);
        saving = false;
        if (!result.ok) { conflict = true; options.conflict(true); return; }
        historyIndex = next;
        draw(result.body, result.title, target.selection);
      }
      function keydown(event) {
        if (composing || event.isComposing || event.keyCode === 229) return;
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
          event.preventDefault();
          undo(event.shiftKey || event.key.toLowerCase() === 'y');
          return;
        }
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          const range = document.createRange();
          const area = titleNode.contains(selection.anchorNode) ? titleNode : bodyNode;
          range.selectNodeContents(area);
          if (area === bodyNode && bodyNode.firstElementChild && bodyNode.firstElementChild.hidden) range.setStartAfter(bodyNode.firstElementChild);
          selection.removeAllRanges(); selection.addRange(range);
          return;
        }
        if (titleNode.contains(selection.anchorNode) && event.key === 'Enter') {
          event.preventDefault();
          placeCaret(Array.from(bodyNode.children).find((node) => !node.hidden), false);
          return;
        }
        const pre = activeElement('pre');
        if (pre && (event.key === 'Enter' || event.key === 'Tab')) {
          event.preventDefault(); insertText(event.key === 'Tab' ? '\t' : '\n'); commit(); return;
        }
        const paragraph = activeElement('p');
        if (event.key === 'Enter' && paragraph && /^```[\w-]*$/.test(paragraph.textContent)) {
          event.preventDefault();
          const block = { type: 'code', language: paragraph.textContent.slice(3), text: '' };
          const node = makeBlock(block);
          paragraph.replaceWith(node);
          placeCaret(node.querySelector('code'), false);
          commit(); return;
        }
        const item = activeElement('li');
        if (event.key === 'Enter' && !event.shiftKey && item && selection.isCollapsed) {
          event.preventDefault();
          const list = item.parentElement;
          if (!item.textContent.trim()) {
            const tail = list.cloneNode(false);
            while (item.nextSibling) tail.appendChild(item.nextSibling);
            const p = document.createElement('p'); p.className = 'dsh-notes-md-p'; p.appendChild(document.createElement('br'));
            list.after(p); if (tail.children.length) p.after(tail);
            item.remove(); if (!list.children.length) list.remove();
            placeCaret(p, false);
          } else {
            const range = selection.getRangeAt(0);
            const tail = document.createRange();
            tail.selectNodeContents(item); tail.setStart(range.startContainer, range.startOffset);
            const next = document.createElement('li'); next.appendChild(tail.extractContents());
            if (!next.textContent) next.appendChild(document.createElement('br'));
            item.after(next); placeCaret(next, false);
          }
          commit(); return;
        }
        if (event.key === 'Enter' && !event.shiftKey && !item) {
          const block = activeElement('p,h1,h2,h3,h4,h5,h6,blockquote');
          if (block && block.parentElement === bodyNode) {
            event.preventDefault();
            const range = selection.getRangeAt(0); range.deleteContents();
            const tail = document.createRange(); tail.selectNodeContents(block); tail.setStart(range.startContainer, range.startOffset);
            const p = document.createElement('p'); p.className = 'dsh-notes-md-p'; p.appendChild(tail.extractContents());
            if (!p.textContent) p.appendChild(document.createElement('br'));
            block.after(p); placeCaret(p, false); commit();
          }
        }
      }
      function beforeinput(event) {
        if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undo(event.inputType === 'historyRedo'); return; }
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const titleStart = titleNode.contains(selection.anchorNode);
        const titleEnd = titleNode.contains(selection.focusNode);
        // 不允许跨标题/正文删除容器，正文跨块选区仍可直接替换。
        if (titleStart !== titleEnd) { event.preventDefault(); return; }
        if (event.inputType === 'deleteContentBackward' && selection.isCollapsed && !titleStart) {
          const range = document.createRange(); range.selectNodeContents(bodyNode); range.setEnd(selection.anchorNode, selection.anchorOffset);
          const first = bodyNode.firstElementChild;
          const prefixLength = first && first.hidden ? first.textContent.length : 0;
          if (range.toString().length <= prefixLength) event.preventDefault();
        }
      }
      function paste(event) {
        if (imagesFromClipboard(event.clipboardData).length) return;
        if (titleNode.contains(window.getSelection().anchorNode)) {
          event.preventDefault();
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/[\r\n]/g, ' '));
          commit(); return;
        }
        event.preventDefault();
        insertText(event.clipboardData.getData('text/plain'));
        // 仅解析粘贴所在顶层段落，其他块和源码记录不受影响。
        const p = activeElement('p');
        if (p && p.parentElement === bodyNode) {
          const markdown = serializeBlockDom(p);
          const blocks = parseMarkdownBlocks(markdown, { sourceRanges: true });
          if (blocks.length) {
            const nodes = blocks.map(makeBlock);
            p.replaceWith(...nodes);
            placeCaret(nodes[nodes.length - 1], true);
          }
        }
        convertInline(); commit();
      }
      function compositionstart() { composing = true; }
      function compositionend() {
        composing = false;
        convertShortcuts(); convertInline();
        if (pending) receive(pending);
        else commit();
      }
      function blur() { if (!composing) { convertInline(); commit(); options.flush(); } }
      function flush() { if (composing) { composing = false; if (pending) receive(pending); } commit(); return options.flush() && !conflict; }
      function discardConflict() {
        const note = options.latest();
        if (!note) return;
        draw(note.body, note.title, null);
        history = [{ body: note.body, title: note.title }]; historyIndex = 0;
        pending = null; conflict = false; options.conflict(false);
      }
      function drop(event) {
        if (hasDraggedFiles(event.dataTransfer)) return;
        event.preventDefault();
        paste({ preventDefault() {}, clipboardData: event.dataTransfer });
      }
      const events = { input, beforeinput, keydown, paste, drop, compositionstart, compositionend, focusout: blur };
      Object.entries(events).forEach(([name, listener]) => root.addEventListener(name, listener));
      draw(base, baseTitle, null);
      return {
        receive, flush, focusTitle: () => { root.focus(); placeCaret(titleNode, true); }, discardConflict,
        copyDraft: () => copyTextToClipboard(draft().body),
        destroy() {
          flush(); destroyed = true;
          Object.entries(events).forEach(([name, listener]) => root.removeEventListener(name, listener));
        },
      };
    }

    function serializeMarkdownBlock(block) {
      if (block.type === 'code') return '```' + (block.language || '') + '\n' + block.text + '\n```';
      return block.text || '';
    }

    function MarkdownEditor(props) {
      const rootRef = React.useRef(null);
      const propsRef = React.useRef(props);
      propsRef.current = props;
      const [hasConflict, setHasConflict] = React.useState(false);
      React.useLayoutEffect(() => {
        const controller = createMarkdownEditorController(rootRef.current, {
          note: props.note, titlePlaceholder: props.titlePlaceholder, bodyPlaceholder: props.bodyPlaceholder,
          change: (...args) => propsRef.current.onChange(...args),
          latest: () => store.getSnapshot().notes.find((note) => note.id === props.note.id),
          conflict: setHasConflict, flush: () => store.flush(),
        });
        props.editorRef.current = controller;
        const unsubscribe = store.subscribe(() => controller.receive(store.getSnapshot().notes.find((note) => note.id === props.note.id)));
        return () => { unsubscribe(); controller.destroy(); if (props.editorRef.current === controller) props.editorRef.current = null; };
      }, [props.note.id]);
      return h('div', { className: 'dsh-notes-rich-scroll' },
        h('div', { ref: rootRef, className: 'dsh-notes-rich-editor', contentEditable: true, suppressContentEditableWarning: true, role: 'textbox', 'aria-multiline': true, 'aria-label': props.bodyPlaceholder, spellCheck: false, style: { fontSize: props.fontSize + 'px' } }),
        hasConflict ? h('div', { className: 'dsh-notes-edit-conflict', role: 'alert' },
          h('span', null, '正文已被其他来源修改，冲突草稿未覆盖最新笔记。请复制草稿后载入最新版。'),
          h('button', { type: 'button', onClick: () => props.editorRef.current.copyDraft() }, '复制草稿'),
          h('button', { type: 'button', onClick: () => props.editorRef.current.discardConflict() }, '载入最新版')) : null);
    }

    const store = createNotesStore();

    // Recreate auto-maintained notes a user deleted, from the last content the
    // owning plugin stored (self-iteration keeps its aggregate note this way).
    try {
      reapplyManagedNotes();
    } catch (err) {
      /* a broken managed-note registry must never block the panel */
    }

    /* ------------------------------------------------------------------ *
     * Formatting helpers
     * ------------------------------------------------------------------ */

    function sortNotes(notes) {
      return notes.slice().sort((left, right) => {
        if (!!right.pinned !== !!left.pinned) return right.pinned ? 1 : -1;
        if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
        return right.createdAt - left.createdAt;
      });
    }

    function noteTitle(note, t) {
      const title = note.title.trim();
      if (title) return title;
      for (const line of note.body.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) return trimmed.slice(0, 80);
      }
      return t('untitled');
    }

    function noteSnippet(note, t) {
      const compact = note.body.replace(/\s+/g, ' ').trim();
      if (compact) return compact.slice(0, 140);
      if (note.images.length) return note.images.length + ' ' + t('imageCount');
      return t('noContent');
    }

    function countCharacters(body) {
      return body.replace(/\s+/g, '').length;
    }

    function createFormatters(localeId) {
      const tag = typeof localeId === 'string' && localeId ? localeId : undefined;
      try {
        return {
          relative: new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }),
          date: new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric' }),
        };
      } catch (err) {
        return { relative: null, date: null };
      }
    }

    function formatWhen(timestamp, formatters, t) {
      const elapsed = Date.now() - timestamp;
      if (!Number.isFinite(elapsed) || elapsed < 0) return t('justNow');
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;
      try {
        if (elapsed < minute) return t('justNow');
        if (elapsed < hour) return formatters.relative.format(-Math.round(elapsed / minute), 'minute');
        if (elapsed < day) return formatters.relative.format(-Math.round(elapsed / hour), 'hour');
        if (elapsed < 7 * day) return formatters.relative.format(-Math.round(elapsed / day), 'day');
        return formatters.date.format(new Date(timestamp));
      } catch (err) {
        return t('justNow');
      }
    }

    /* ------------------------------------------------------------------ *
     * Version logs: one self-maintained changelog note per plugin
     * ------------------------------------------------------------------ */

    let currentLang = 'en';

    function changelogLang(activeLocale) {
      return typeof activeLocale === 'string' &&
        activeLocale.toLowerCase().indexOf('zh') === 0
        ? 'zh'
        : 'en';
    }

    function localizedText(value, lang) {
      if (typeof value === 'string') return value;
      if (!value || typeof value !== 'object') return '';
      const direct = value[lang];
      if (typeof direct === 'string' && direct) return direct;
      const fallback = lang === 'zh' ? value.en : value.zh;
      if (typeof fallback === 'string' && fallback) return fallback;
      for (const key of Object.keys(value)) {
        if (typeof value[key] === 'string' && value[key]) return value[key];
      }
      return '';
    }

    function compareVersions(left, right) {
      const leftParts = String(left).split('.').map((part) => parseInt(part, 10) || 0);
      const rightParts = String(right).split('.').map((part) => parseInt(part, 10) || 0);
      const length = Math.max(leftParts.length, rightParts.length);
      for (let index = 0; index < length; index += 1) {
        const a = leftParts[index] || 0;
        const b = rightParts[index] || 0;
        if (a !== b) return a - b;
      }
      return 0;
    }

    /** Storage marker that binds one note to one plugin's version log. */
    function pluginLogSystem(pluginId) {
      return PLUGIN_LOG_SYSTEM_PREFIX + pluginId;
    }

    function pluginDisplayName(descriptor, lang) {
      return localizedText(descriptor.title, lang) || descriptor.id;
    }

    function pluginNoteTitle(descriptor, lang) {
      const explicit = localizedText(descriptor.noteTitle, lang);
      if (explicit) return explicit;
      const name = pluginDisplayName(descriptor, lang);
      return lang === 'zh' ? name + ' 版本记录' : name + ' version log';
    }

    /** Old note titles a plugin declared, so a rename can be applied safely. */
    function normalizeNoteTitleHistory(raw) {
      if (!Array.isArray(raw)) return [];
      const history = [];
      for (const item of raw) {
        if (typeof item === 'string' && item.trim()) {
          history.push(item.trim());
        } else if (item && typeof item === 'object') {
          const zh = typeof item.zh === 'string' ? item.zh.trim() : '';
          const en = typeof item.en === 'string' ? item.en.trim() : '';
          if (zh || en) history.push({ zh, en });
        }
      }
      return history;
    }

    function pluginNoteTitleAliases(descriptor) {
      const aliases = [];
      const history =
        descriptor && Array.isArray(descriptor.previousNoteTitles)
          ? descriptor.previousNoteTitles
          : [];
      for (const item of history) {
        if (typeof item === 'string') aliases.push(item);
        else if (item && typeof item === 'object') {
          if (typeof item.zh === 'string' && item.zh) aliases.push(item.zh);
          if (typeof item.en === 'string' && item.en) aliases.push(item.en);
        }
      }
      return aliases;
    }

    function changelogHeader(descriptor, lang) {
      const noteTitle = pluginNoteTitle(descriptor, lang);
      const self = descriptor.id === NOTES_PLUGIN_ID;
      const subject = self
        ? lang === 'zh'
          ? '本插件'
          : 'this plugin'
        : lang === 'zh'
          ? '「' + pluginDisplayName(descriptor, lang) + '」'
          : pluginDisplayName(descriptor, lang);
      if (lang === 'zh') {
        return (
          '# ' +
          noteTitle +
          '\n\n本笔记由「笔记」插件自动维护：每次' +
          subject +
          '升级后，新版本会追加到这里（最新在上）。每条记录的标题包含更新时间（精确到分钟，含时区）和更新者（DeepSeek Harness 或外部 Agent）。你在下方补充自己的记录不会影响自动维护。'
        );
      }
      return (
        '# ' +
        noteTitle +
        '\n\nThis note is maintained by the Notes plugin: every release of ' +
        subject +
        ' appends its entry here (newest first). Each entry heading carries the update time (to the minute, with offset) and the source (DeepSeek Harness or an external agent). Your own notes below are left untouched.'
      );
    }

    /** Render an ISO minute stamp as \`YYYY-MM-DD HH:mm ±HH:MM\`. */
    function formatEntryAt(at) {
      const text = typeof at === 'string' ? at.trim() : '';
      const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?(?:(Z)|([+-]\d{2}:\d{2}))?$/.exec(
        text,
      );
      if (!match) return text || '—';
      const zone = match[3] ? 'UTC' : match[4] || '';
      return match[1] + ' ' + match[2] + (zone ? ' ' + zone : '');
    }

    /** Current local instant as an ISO minute stamp with an explicit offset. */
    function nowStamp() {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const offset = -now.getTimezoneOffset();
      const sign = offset >= 0 ? '+' : '-';
      const absolute = Math.abs(offset);
      return (
        now.getFullYear() +
        '-' +
        pad(now.getMonth() + 1) +
        '-' +
        pad(now.getDate()) +
        'T' +
        pad(now.getHours()) +
        ':' +
        pad(now.getMinutes()) +
        sign +
        pad(Math.floor(absolute / 60)) +
        ':' +
        pad(absolute % 60)
      );
    }

    /** Who made the change: this Harness, or an external agent (named when known). */
    function displayAgentName(name) {
      const text = typeof name === 'string' ? name.trim() : '';
      if (!text) return '';
      if (/^[a-z][a-z0-9_-]*$/.test(text)) {
        return text.charAt(0).toUpperCase() + text.slice(1);
      }
      return text;
    }

    /**
     * Attribution is declared by the registering plugin, so accept the labels
     * agents actually write: 'harness' for DeepSeek Harness itself, 'external'
     * with an optional sourceName, or any other label (for example 'codex'),
     * which is treated as the external agent's name. A missing label stays
     * unattributed and is never silently credited to DeepSeek Harness.
     */
    function normalizeSource(rawSource, rawName) {
      const explicitName = typeof rawName === 'string' ? rawName.trim() : '';
      const label = typeof rawSource === 'string' ? rawSource.trim() : '';
      if (!label) {
        return {
          source: 'unattributed',
          sourceName: explicitName ? displayAgentName(explicitName) : undefined,
        };
      }
      const lowered = label.toLowerCase();
      if (
        lowered === 'harness' ||
        lowered === 'deepseek harness' ||
        lowered === 'deepseek-harness' ||
        lowered === 'deepseek'
      ) {
        return { source: 'harness', sourceName: undefined };
      }
      // Self-driven iteration writes releases for the plugin it iterated; it is
      // neither this Harness nor an external agent, so it keeps its own label.
      if (
        lowered === 'self-driven' ||
        lowered === 'selfdriven' ||
        lowered === 'self_driven' ||
        label === '自驱动'
      ) {
        return { source: 'self-driven', sourceName: undefined };
      }
      if (lowered === 'external' || lowered === 'external agent' || lowered === 'agent') {
        return {
          source: 'external',
          sourceName: explicitName ? displayAgentName(explicitName) : undefined,
        };
      }
      return { source: 'external', sourceName: displayAgentName(explicitName || label) };
    }

    /** External attribution always names the agent in parentheses. */
    function externalAuthor(name, lang) {
      const display = displayAgentName(name);
      const label = display || (lang === 'zh' ? '未署名' : 'unidentified');
      return lang === 'zh' ? '外部 Agent（' + label + '）' : 'External agent (' + label + ')';
    }

    /** Read a parenthesized agent name a user may have added to a heading. */
    function manualExternalName(line) {
      const text = typeof line === 'string' ? line : '';
      const match = /(?:外部 Agent|External agent)\s*[（(]([^）)]+)[）)]/.exec(text);
      if (!match) return '';
      const name = match[1].trim();
      if (!name || name === '未署名' || name === 'unidentified') return '';
      return name;
    }

    function changelogAuthor(entry, lang) {
      const source =
        entry && typeof entry.source === 'string' && entry.source ? entry.source : 'unattributed';
      if (source === 'self-driven') {
        return lang === 'zh' ? '自驱动' : 'Self-driven';
      }
      if (source === 'external') {
        return externalAuthor(entry.sourceName, lang);
      }
      if (source !== 'harness') {
        return lang === 'zh' ? '未署名更新者' : 'unattributed source';
      }
      return 'DeepSeek Harness';
    }

    function changelogSection(entry, lang) {
      const heading =
        '## v' +
        entry.version +
        ' · ' +
        formatEntryAt(entry.at) +
        ' · ' +
        changelogAuthor(entry, lang);
      const points =
        entry.points && entry.points[lang]
          ? entry.points[lang]
          : entry.points && entry.points.en
            ? entry.points.en
            : [];
      return heading + '\n' + points.map((point) => '- ' + point).join('\n');
    }

    /** Insert missing release sections after the header, before older entries. */
    function mergeChangelogBody(body, entries, lang, descriptor) {
      const current = typeof body === 'string' ? body : '';
      const sections = entries.map((entry) => changelogSection(entry, lang)).join('\n\n');
      if (!current.trim()) return changelogHeader(descriptor, lang) + '\n\n' + sections;
      const lines = current.split('\n');
      const firstEntry = lines.findIndex((line) => line.indexOf('## v') === 0);
      if (firstEntry === -1) return current.replace(/\s+$/, '') + '\n\n' + sections;
      const prefix = lines.slice(0, firstEntry).join('\n').replace(/\s+$/, '');
      const suffix = lines.slice(firstEntry).join('\n').replace(/\s+$/, '');
      const parts = [];
      if (prefix) parts.push(prefix);
      parts.push(sections);
      if (suffix) parts.push(suffix);
      return parts.join('\n\n');
    }

    /**
     * Rewrites the heading of every release already present in a note so old
     * entries gain the current format (minute-precise time and source) without
     * touching their bullets or anything the user wrote manually.
     */
    function retimeExistingSections(body, entries, lang) {
      const current = typeof body === 'string' ? body : '';
      const byVersion = {};
      for (const entry of entries) byVersion[entry.version] = entry;
      const lines = current.split('\n');
      let changed = false;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.indexOf('## v') !== 0) continue;
        const match = /^## v(\S+)/.exec(line);
        if (!match) continue;
        const entry = byVersion[match[1]];
        if (!entry) continue;
        let author = changelogAuthor(entry, lang);
        if (entry.source === 'external' && !displayAgentName(entry.sourceName)) {
          const manualName = manualExternalName(line);
          if (manualName) author = externalAuthor(manualName, lang);
        }
        const heading =
          '## v' +
          entry.version +
          ' · ' +
          formatEntryAt(entry.at) +
          ' · ' +
          author;
        if (line !== heading) {
          lines[index] = heading;
          changed = true;
        }
      }
      return changed ? lines.join('\n') : current;
    }

    // Headers written by earlier Notes plugin versions, replaced in place when
    // their exact text is still at the top of the plugin's own log note.
    const LEGACY_SELF_HEADERS = [
      '# 笔记插件版本记录\n\n本笔记由「笔记」插件自动维护：每次插件升级后，新版本会追加到这里。你在下方补充自己的记录不会影响自动维护。',
      '# Notes plugin version log\n\nThis note is maintained by the Notes plugin: every plugin release appends its entry here. Your own notes below are left untouched.',
      '# 笔记插件版本记录\n\n本笔记由「笔记」插件自动维护：每次插件升级后，新版本会追加到这里（最新在上）。每条记录的标题包含更新时间（精确到分钟，含时区）和更新者（DeepSeek Harness 或外部 Agent）。你在下方补充自己的记录不会影响自动维护。',
      '# Notes plugin version log\n\nThis note is maintained by the Notes plugin: every release appends its entry here (newest first). Each entry heading carries the update time (to the minute, with offset) and the source (DeepSeek Harness or an external agent). Your own notes below are left untouched.',
    ];

    const GENERATED_HEADER_MARKERS = [
      '本笔记由「笔记」插件自动维护',
      'This note is maintained by the Notes plugin',
    ];

    function refreshHeader(body, descriptor, lang) {
      const current = typeof body === 'string' ? body : '';
      if (descriptor.id === NOTES_PLUGIN_ID) {
        for (const previous of LEGACY_SELF_HEADERS) {
          if (current.indexOf(previous) === 0) {
            return changelogHeader(descriptor, lang) + current.slice(previous.length);
          }
        }
      }
      const isGenerated = GENERATED_HEADER_MARKERS.some((marker) => current.indexOf(marker) !== -1);
      if (!isGenerated) return current;
      const firstEntry = current.indexOf('\n## v');
      if (firstEntry === -1) return current;
      const expected = changelogHeader(descriptor, lang);
      if (current.slice(0, firstEntry).replace(/\s+$/, '') === expected) return current;
      return expected + current.slice(firstEntry);
    }

    function versionLogNotes() {
      return store
        .getSnapshot()
        .notes.filter(
          (note) =>
            note &&
            typeof note.system === 'string' &&
            note.system.indexOf(PLUGIN_LOG_SYSTEM_PREFIX) === 0,
        );
    }

    function logSectionVersion(section) {
      const match = /^## v(\S+)/.exec(section);
      return match ? match[1] : '';
    }

    function splitLogSections(body) {
      const lines = String(body || '').split('\n');
      const firstEntry = lines.findIndex((line) => line.indexOf('## v') === 0);
      if (firstEntry === -1) return { header: lines.join('\n'), sections: [] };
      const header = lines.slice(0, firstEntry).join('\n');
      const sections = [];
      let current = null;
      for (let index = firstEntry; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.indexOf('## v') === 0) {
          if (current) sections.push(current);
          current = [line];
        } else if (current) {
          current.push(line);
        }
      }
      if (current) sections.push(current);
      return {
        header,
        sections: sections.map((sectionLines) => sectionLines.join('\n').replace(/\s+$/, '')),
      };
    }

    function compareLogSections(left, right) {
      const leftVersion = logSectionVersion(left);
      const rightVersion = logSectionVersion(right);
      if (!leftVersion && !rightVersion) return 0;
      if (!leftVersion) return 1;
      if (!rightVersion) return -1;
      return compareVersions(rightVersion, leftVersion);
    }

    /** Merge one version-log body into another, keeping every release and line. */
    function mergeVersionLogBodies(targetBody, sourceBody) {
      const target = splitLogSections(targetBody);
      const source = splitLogSections(sourceBody);
      const sections = target.sections.slice();
      const byVersion = {};
      sections.forEach((section, index) => {
        const version = logSectionVersion(section);
        if (version) byVersion[version] = index;
      });
      for (const section of source.sections) {
        const version = logSectionVersion(section);
        const index = version ? byVersion[version] : undefined;
        if (index === undefined) {
          sections.push(section);
          continue;
        }
        const existingLines = new Set(sections[index].split('\n'));
        const extraLines = section
          .split('\n')
          .filter((line) => line.trim() && !existingLines.has(line));
        if (extraLines.length) sections[index] = sections[index] + '\n' + extraLines.join('\n');
      }
      sections.sort(compareLogSections);
      return target.header.replace(/\s+$/, '') + '\n\n' + sections.join('\n\n') + '\n';
    }

    /**
     * A plugin can appear under two identities (a dev link and a published
     * package name), and older versions could leave one note per identity.
     * Merge version-log notes that describe the same plugin: same generated
     * note title and same display name. Keeps the richest note, folds releases
     * from the others in, and drops the stale identity from the registry.
     */
    function dedupeVersionLogNotes(lang) {
      const registry = loadPluginLogs();
      const notes = versionLogNotes();
      if (notes.length < 2) return;
      const groups = new Map();
      for (const note of notes) {
        const id = note.system.slice(PLUGIN_LOG_SYSTEM_PREFIX.length);
        const descriptor = registry[id] || null;
        const key = descriptor
          ? pluginNoteTitle(descriptor, lang) + '|' + pluginDisplayName(descriptor, lang)
          : 'title:' + note.title;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ note, descriptor });
      }
      let changed = false;
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        group.sort((left, right) => {
          const count = (entry) => (entry.note.body.match(/^## v/gm) || []).length;
          return count(right) - count(left);
        });
        const keeper = group[0];
        let body = keeper.note.body;
        const removedIds = [];
        for (const duplicate of group.slice(1)) {
          body = mergeVersionLogBodies(body, duplicate.note.body);
          removedIds.push(duplicate.note.system.slice(PLUGIN_LOG_SYSTEM_PREFIX.length));
          store.deleteNote(duplicate.note.id);
        }
        const patch = {};
        if (keeper.descriptor) {
          body = refreshHeader(body, keeper.descriptor, lang);
          const desiredTitle = pluginNoteTitle(keeper.descriptor, lang);
          if (keeper.note.title !== desiredTitle) patch.title = desiredTitle;
          patch.system = pluginLogSystem(keeper.descriptor.id);
        }
        if (body !== keeper.note.body) patch.body = body;
        if (Object.keys(patch).length) store.updateNote(keeper.note.id, patch);
        for (const id of removedIds) delete registry[id];
        changed = true;
      }
      if (changed) {
        savePluginLogs(registry);
        store.flush();
      }
    }

    function changelogEntries() {
      const entries = CHANGELOG.slice();
      if (!entries.some((entry) => entry.version === VERSION)) {
        entries.unshift({
          version: VERSION,
          at: nowStamp(),
          source: 'harness',
          points: {
            zh: ['自动记录：插件已升级到 v' + VERSION],
            en: ['Automatic entry: the plugin was upgraded to v' + VERSION],
          },
        });
      }
      return entries;
    }

    function selfDescriptor() {
      return {
        id: NOTES_PLUGIN_ID,
        title: { zh: '笔记', en: 'Notes' },
        noteTitle: SELF_NOTE_TITLE,
        version: VERSION,
        entries: changelogEntries(),
      };
    }

    /* ---------- per-plugin descriptor registry ---------- */

    function normalizeDescriptor(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const id = typeof raw.id === 'string' ? raw.id.trim() : '';
      if (!id) return null;
      const entries = [];
      if (Array.isArray(raw.entries)) {
        for (const item of raw.entries) {
          if (!item || typeof item !== 'object') continue;
          if (typeof item.version !== 'string' || !/^\d+(?:\.\d+)*$/.test(item.version)) continue;
          const attribution = normalizeSource(item.source, item.sourceName);
          entries.push({
            version: item.version,
            at: typeof item.at === 'string' ? item.at : '',
            source: attribution.source,
            sourceName: attribution.sourceName,
            points: item.points && typeof item.points === 'object' ? item.points : {},
          });
        }
      }
      if (!entries.length) return null;
      entries.sort((left, right) => compareVersions(right.version, left.version));
      return {
        id,
        title: raw.title,
        noteTitle: raw.noteTitle,
        previousNoteTitles: normalizeNoteTitleHistory(raw.previousNoteTitles),
        version:
          typeof raw.version === 'string' && raw.version ? raw.version : entries[0].version,
        entries,
      };
    }

    function loadPluginLogs() {
      try {
        const raw = window.localStorage.getItem(PLUGIN_LOG_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const registry = {};
        const source = parsed && parsed.plugins && typeof parsed.plugins === 'object' ? parsed.plugins : {};
        for (const key of Object.keys(source)) {
          const descriptor = normalizeDescriptor(source[key]);
          if (descriptor) registry[descriptor.id] = descriptor;
        }
        return registry;
      } catch (err) {
        return {};
      }
    }

    function savePluginLogs(registry) {
      try {
        window.localStorage.setItem(
          PLUGIN_LOG_STORAGE_KEY,
          JSON.stringify({ version: 1, plugins: registry }),
        );
      } catch (err) {
        /* the registry is a cache of descriptors; notes stay in the main store */
      }
    }

    /* ------------------------------------------------------------------ *
     * 自驱动 iteration: releases written by another plugin + managed notes
     * ------------------------------------------------------------------ */

    function normalizeLocalizedPair(raw) {
      if (typeof raw === 'string') {
        const text = raw.trim();
        return text ? { zh: text, en: text } : null;
      }
      if (!raw || typeof raw !== 'object') return null;
      const zh = typeof raw.zh === 'string' ? raw.zh.trim() : '';
      const en = typeof raw.en === 'string' ? raw.en.trim() : '';
      if (!zh && !en) return null;
      return { zh: zh || en, en: en || zh };
    }

    function normalizeChangelogPoints(raw) {
      const points = { zh: [], en: [] };
      if (!raw || typeof raw !== 'object') return points;
      for (const lang of ['zh', 'en']) {
        if (!Array.isArray(raw[lang])) continue;
        for (const item of raw[lang]) {
          const text = typeof item === 'string' ? item.trim() : '';
          if (text) points[lang].push(text);
        }
      }
      return points;
    }

    function normalizeSelfDrivenEntry(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const version = typeof raw.version === 'string' ? raw.version.trim() : '';
      if (!/^\d+(?:\.\d+)*$/.test(version)) return null;
      const at = typeof raw.at === 'string' ? raw.at.trim() : '';
      // Minute precision (with an offset) is the version-log heading format.
      if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(at)) return null;
      const points = normalizeChangelogPoints(raw.points);
      if (!points.zh.length && !points.en.length) return null;
      const entry = { version, at, source: SELF_DRIVEN_SOURCE, points };
      const requirementId = typeof raw.requirementId === 'string' ? raw.requirementId.trim() : '';
      if (requirementId) entry.requirementId = requirementId;
      return entry;
    }

    /** Persisted release time as a number, for the "newest kept" dedupe. */
    function changelogEntryTime(entry) {
      const time = Date.parse(entry && entry.at);
      return Number.isFinite(time) ? time : 0;
    }

    /** One entry per version: a newer entry replaces the stored one. */
    function dedupeSelfDrivenEntries(entries) {
      const byVersion = new Map();
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || !entry.version) continue;
        const existing = byVersion.get(entry.version);
        if (!existing || changelogEntryTime(entry) >= changelogEntryTime(existing)) {
          byVersion.set(entry.version, entry);
        }
      }
      return Array.from(byVersion.values()).sort((left, right) =>
        compareVersions(right.version, left.version),
      );
    }

    function normalizeSelfDrivenLogRecord(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const entries = [];
      if (Array.isArray(raw.entries)) {
        for (const item of raw.entries) {
          const entry = normalizeSelfDrivenEntry(item);
          if (entry) entries.push(entry);
        }
      }
      const deduped = dedupeSelfDrivenEntries(entries);
      if (!deduped.length) return null;
      return {
        title: normalizeLocalizedPair(raw.title) || normalizeLocalizedPair(raw.noteTitle),
        noteTitle: normalizeLocalizedPair(raw.noteTitle),
        entries: deduped,
      };
    }

    function loadSelfDrivenLogs() {
      try {
        const raw = window.localStorage.getItem(SELF_DRIVEN_LOG_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const source =
          parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
        const extras = {};
        for (const key of Object.keys(source)) {
          const pluginId = String(key).trim();
          if (!pluginId) continue;
          const record = normalizeSelfDrivenLogRecord(source[key]);
          if (record) extras[pluginId] = record;
        }
        return extras;
      } catch (err) {
        return {};
      }
    }

    function saveSelfDrivenLogs(extras) {
      try {
        window.localStorage.setItem(
          SELF_DRIVEN_LOG_STORAGE_KEY,
          JSON.stringify({ version: 1, entries: extras }),
        );
        return true;
      } catch (err) {
        return false;
      }
    }

    function selfDrivenEntriesFor(pluginId) {
      const record = loadSelfDrivenLogs()[pluginId];
      return record ? record.entries : [];
    }

    /**
     * Descriptor entries plus persisted 自驱动 entries. Extras win a version
     * tie, so a self-driven release keeps its attribution when the target
     * plugin registers its own descriptor again.
     */
    function combinedChangelogEntries(descriptor) {
      const byVersion = new Map();
      const base = descriptor && Array.isArray(descriptor.entries) ? descriptor.entries : [];
      for (const entry of base) {
        if (entry && typeof entry.version === 'string') byVersion.set(entry.version, entry);
      }
      if (descriptor && typeof descriptor.id === 'string') {
        for (const entry of selfDrivenEntriesFor(descriptor.id)) {
          byVersion.set(entry.version, entry);
        }
      }
      return Array.from(byVersion.values()).sort((left, right) =>
        compareVersions(right.version, left.version),
      );
    }

    /**
     * `window.__dshSelfDrivenLogSink.append(entry)` implementation: validate
     * one 自驱动 release, persist it in its own store, then merge it into the
     * target plugin's version-log note (creating that note when needed).
     */
    function appendSelfDrivenEntry(rawEntry) {
      if (!rawEntry || typeof rawEntry !== 'object') return { ok: false, error: 'invalid-entry' };
      const pluginId = typeof rawEntry.pluginId === 'string' ? rawEntry.pluginId.trim() : '';
      if (!pluginId) return { ok: false, error: 'invalid-plugin-id' };
      const pluginName = normalizeLocalizedPair(rawEntry.pluginName);
      if (!pluginName) return { ok: false, error: 'invalid-plugin-name' };
      const entry = normalizeSelfDrivenEntry(rawEntry);
      if (!entry) return { ok: false, error: 'invalid-entry-fields' };
      const noteTitle = normalizeLocalizedPair(rawEntry.noteTitle);
      const extras = loadSelfDrivenLogs();
      const record = extras[pluginId] || { title: pluginName, noteTitle, entries: [] };
      record.title = pluginName;
      if (noteTitle) record.noteTitle = noteTitle;
      record.entries = dedupeSelfDrivenEntries(record.entries.concat([entry]));
      extras[pluginId] = record;
      if (!saveSelfDrivenLogs(extras)) return { ok: false, error: 'save-failed' };
      const registered = loadPluginLogs()[pluginId];
      const descriptor = registered
        ? Object.assign({}, registered, {
            title: registered.title || record.title,
            noteTitle: registered.noteTitle || record.noteTitle,
          })
        : {
            id: pluginId,
            title: record.title,
            noteTitle: record.noteTitle,
            version: record.entries[0].version,
          };
      let status;
      try {
        status = syncPluginVersionLog(descriptor, currentLang, true);
      } catch (err) {
        return { ok: false, error: 'sync-failed' };
      }
      if (status === 'error') return { ok: false, error: 'save-failed' };
      return { ok: true, status };
    }

    function drainSelfDrivenLogQueue() {
      if (typeof window === 'undefined' || !Array.isArray(window.__dshSelfDrivenLogQueue)) return [];
      const results = [];
      for (const entry of window.__dshSelfDrivenLogQueue.splice(0)) {
        try {
          results.push(appendSelfDrivenEntry(entry));
        } catch (err) {
          results.push({ ok: false, error: 'sync-failed' });
        }
      }
      return results;
    }

    function normalizeManagedNoteKey(raw) {
      const key = typeof raw === 'string' ? raw.trim() : '';
      if (!key || key.length > 160) return '';
      return key;
    }

    function managedNoteSystem(key) {
      return MANAGED_NOTE_SYSTEM_PREFIX + key;
    }

    function loadManagedNotes() {
      try {
        const raw = window.localStorage.getItem(MANAGED_NOTES_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const source =
          parsed && parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {};
        const notes = {};
        for (const key of Object.keys(source)) {
          const noteKey = normalizeManagedNoteKey(key);
          const value = source[key];
          if (!noteKey || !value || typeof value !== 'object') continue;
          if (typeof value.title !== 'string' || typeof value.body !== 'string') continue;
          notes[noteKey] = {
            title: value.title,
            body: value.body,
            updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
          };
        }
        return notes;
      } catch (err) {
        return {};
      }
    }

    function saveManagedNotes(notes) {
      try {
        window.localStorage.setItem(
          MANAGED_NOTES_STORAGE_KEY,
          JSON.stringify({ version: 1, notes }),
        );
        return true;
      } catch (err) {
        return false;
      }
    }

    function findManagedNote(key) {
      const system = managedNoteSystem(key);
      return store.getSnapshot().notes.find((note) => note && note.system === system) || null;
    }

    function createManagedNote(key, title, body) {
      const previousId = store.getSnapshot().selectedId;
      const noteId = store.createNote({
        title,
        body,
        system: managedNoteSystem(key),
        select: false,
      });
      // select:false still selects when nothing was selected; restore the
      // caller's selection instead of focusing a new auto-maintained note.
      if (store.getSnapshot().selectedId === noteId && previousId !== noteId) {
        store.selectNote(previousId || null);
      }
      return noteId;
    }

    /** `window.__dshManagedNoteSink.upsert({ key, title, body })` implementation. */
    function upsertManagedNote(rawNote) {
      if (!rawNote || typeof rawNote !== 'object') return { ok: false, error: 'invalid-note' };
      const key = normalizeManagedNoteKey(rawNote.key);
      if (!key) return { ok: false, error: 'invalid-key' };
      if (typeof rawNote.title !== 'string' || typeof rawNote.body !== 'string') {
        return { ok: false, error: 'invalid-note' };
      }
      const title = rawNote.title;
      const body = rawNote.body;
      const registry = loadManagedNotes();
      registry[key] = { title, body, updatedAt: Date.now() };
      if (!saveManagedNotes(registry)) return { ok: false, error: 'save-failed' };
      const existing = findManagedNote(key);
      if (existing) {
        if (existing.title === title && existing.body === body) {
          return { ok: true, status: 'current' };
        }
        store.updateNote(existing.id, { title, body });
        if (!store.flush()) return { ok: false, error: 'save-failed' };
        return { ok: true, status: 'updated' };
      }
      createManagedNote(key, title, body);
      if (!store.flush()) return { ok: false, error: 'save-failed' };
      return { ok: true, status: 'created' };
    }

    function drainManagedNoteQueue() {
      if (typeof window === 'undefined' || !Array.isArray(window.__dshManagedNoteQueue)) return [];
      const results = [];
      for (const note of window.__dshManagedNoteQueue.splice(0)) {
        try {
          results.push(upsertManagedNote(note));
        } catch (err) {
          results.push({ ok: false, error: 'save-failed' });
        }
      }
      return results;
    }

    /** Recreate managed notes the user deleted, from the last stored content. */
    function reapplyManagedNotes() {
      const registry = loadManagedNotes();
      let created = false;
      for (const key of Object.keys(registry)) {
        if (findManagedNote(key)) continue;
        const record = registry[key];
        createManagedNote(key, record.title, record.body);
        created = true;
      }
      if (created) store.flush();
    }

    /**
     * Creates or updates one plugin's version-log note: appends releases that
     * are missing, re-stamps old headings, refreshes a legacy header, and
     * migrates the pre-1.5 single note for this plugin. Idempotent.
     * Returns 'created' | 'appended' | 'retimed' | 'current' | 'error'.
     */
    function syncPluginVersionLog(descriptor, lang, active) {
      const entries = combinedChangelogEntries(descriptor);
      const system = pluginLogSystem(descriptor.id);
      const snapshot = store.getSnapshot();
      let existing = snapshot.notes.find((note) => note && note.system === system) || null;
      let legacy = false;
      let adoptedId = '';
      if (!existing && descriptor.id === NOTES_PLUGIN_ID) {
        existing =
          snapshot.notes.find((note) => note && note.system === LEGACY_CHANGELOG_SYSTEM) || null;
        legacy = !!existing;
      }
      if (!existing && active !== false) {
        const desiredTitle = pluginNoteTitle(descriptor, lang);
        const key = desiredTitle + '|' + pluginDisplayName(descriptor, lang);
        const registry = loadPluginLogs();
        const adoptable = versionLogNotes().find((note) => {
          const id = note.system.slice(PLUGIN_LOG_SYSTEM_PREFIX.length);
          const other = registry[id];
          if (!other) return false;
          return pluginNoteTitle(other, lang) + '|' + pluginDisplayName(other, lang) === key;
        });
        if (adoptable) {
          existing = adoptable;
          legacy = true;
          adoptedId = adoptable.system.slice(PLUGIN_LOG_SYSTEM_PREFIX.length);
        }
      }
      if (!existing) {
        if (active === false) return 'stale';
        store.createNote({
          title: pluginNoteTitle(descriptor, lang),
          body: mergeChangelogBody('', entries, lang, descriptor),
          system,
          select: false,
        });
        const persisted =
          store.flush() && store.getSnapshot().notes.some((note) => note.system === system);
        return persisted ? 'created' : 'error';
      }
      const missing = entries.filter(
        (entry) => existing.body.indexOf('## v' + entry.version) === -1,
      );
      let body = existing.body;
      if (missing.length) body = mergeChangelogBody(body, missing, lang, descriptor);
      body = refreshHeader(body, descriptor, lang);
      body = retimeExistingSections(body, entries, lang);
      const desiredTitle = pluginNoteTitle(descriptor, lang);
      const aliases = pluginNoteTitleAliases(descriptor);
      const renameTitle =
        existing.title !== desiredTitle &&
        (!existing.title || aliases.indexOf(existing.title) !== -1)
          ? desiredTitle
          : null;
      const patch = {};
      if (body !== existing.body) patch.body = body;
      if (legacy) patch.system = system;
      if (renameTitle) patch.title = renameTitle;
      if (!Object.keys(patch).length && !adoptedId) return 'current';
      store.updateNote(existing.id, patch);
      if (!store.flush()) return 'error';
      if (adoptedId) {
        const registry = loadPluginLogs();
        delete registry[adoptedId];
        savePluginLogs(registry);
      }
      return missing.length ? 'appended' : 'retimed';
    }

    function registerPluginVersionLog(rawDescriptor) {
      const descriptor = normalizeDescriptor(rawDescriptor);
      if (!descriptor) return false;
      const registry = loadPluginLogs();
      registry[descriptor.id] = descriptor;
      savePluginLogs(registry);
      try {
        syncPluginVersionLog(descriptor, currentLang, true);
      } catch (err) {
        /* one plugin's bad descriptor must not block the others */
      }
      return true;
    }

    function syncStoredPluginLogs() {
      const registry = loadPluginLogs();
      for (const id of Object.keys(registry)) {
        const current = loadPluginLogs();
        if (!current[id]) continue;
        try {
          syncPluginVersionLog(current[id], currentLang, false);
        } catch (err) {
          /* ignore one broken descriptor */
        }
      }
    }

    /* ------------------------------------------------------------------ *
     * Device resource Provider: the notes this plugin owns
     * ------------------------------------------------------------------ */

    /**
     * Register one Provider with the device-side resource registry.
     *
     * Copied from `resource-api/templates/provider.js`. The registration is
     * safe in either load order: if the registry is already mounted the
     * Provider goes through its sink, otherwise it is queued and the registry
     * drains the queue when it loads.
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

    /**
     * Every note this plugin stores, read through the plugin's own reader and
     * ordered newest first (updatedAt descending), so a Provider page and the
     * aggregate read keep one stable order.
     * The auto-maintained version-log notes are ordinary notes here: the
     * panel lists and searches them like any other note, so the Provider
     * answers for them too.
     */
    function resourceNotes() {
      const state = loadState();
      const notes = Array.isArray(state.notes) ? state.notes.slice() : [];
      return notes.sort((left, right) => {
        const leftAt = Number.isFinite(left.updatedAt) ? left.updatedAt : 0;
        const rightAt = Number.isFinite(right.updatedAt) ? right.updatedAt : 0;
        if (rightAt !== leftAt) return rightAt - leftAt;
        return (right.createdAt || 0) - (left.createdAt || 0);
      });
    }

    function noteMatchesQuery(note, needle) {
      if (!needle) return true;
      const haystack = (note.title || '') + '\n' + (note.body || '');
      return haystack.toLowerCase().indexOf(needle) !== -1;
    }

    function noteInTimeRange(note, timeRange) {
      if (!timeRange || typeof timeRange !== 'object') return true;
      const at = Number.isFinite(note.updatedAt) ? note.updatedAt : 0;
      if (Number.isFinite(timeRange.from) && at < timeRange.from) return false;
      if (Number.isFinite(timeRange.to) && at > timeRange.to) return false;
      return true;
    }

    function noteTimestamp(value) {
      if (!Number.isFinite(value) || value <= 0) return '';
      try {
        return new Date(value).toISOString();
      } catch (_err) {
        return '';
      }
    }

    /**
     * The `notes` Provider. This plugin is the only one that knows how its
     * notes are stored, so it is the only one that can answer for them.
     */
    function createNotesResourceProvider(t) {
      return {
        source: 'notes',
        title: { zh: '笔记', en: 'Notes' },
        kind: 'document',
        icon: 'file',
        aliases: ['笔记', 'note', 'notes', 'notebook'],
        labels: {
          all: { zh: '全部笔记', en: 'All notes' },
          unit: { zh: '篇笔记', en: 'notes' },
          item: { zh: '笔记', en: 'Notes' },
          empty: { zh: '无正文', en: 'No text' },
        },
        async describe(locale) {
          const count = resourceNotes().length;
          const zh = typeof locale === 'string' && locale.toLowerCase().indexOf('zh') === 0;
          return zh ? count + ' 篇笔记' : count + (count === 1 ? ' note' : ' notes');
        },
        async search({ query, timeRange, offset, limit }) {
          const needle = typeof query === 'string' ? query.trim().toLowerCase() : '';
          const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
          const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
          const matched = resourceNotes().filter(
            (note) => noteMatchesQuery(note, needle) && noteInTimeRange(note, timeRange),
          );
          return {
            items: matched.slice(start, start + size).map((note) => ({
              id: note.id,
              title: noteTitle(note, t),
              snippet: noteSnippet(note, t),
              updatedAt: note.updatedAt,
              createdAt: note.createdAt,
              meta: { images: note.images },
            })),
            total: matched.length,
          };
        },
        async read({ ids }) {
          const notes = resourceNotes();
          const byId = new Map();
          for (const note of notes) byId.set(note.id, note);
          const wanted = Array.isArray(ids) ? ids : [];
          const items = [];
          const seen = new Set();
          const push = (note) => {
            if (!note || seen.has(note.id)) return;
            seen.add(note.id);
            items.push({
              id: note.id,
              title: noteTitle(note, t),
              text: note.body || '',
              updatedAt: note.updatedAt,
              createdAt: note.createdAt,
              itemType: 'note',
              attributes: { updated_at: noteTimestamp(note.updatedAt) },
              meta: { images: note.images },
            });
          };
          for (const raw of wanted) {
            const id = typeof raw === 'string' ? raw : '';
            if (!id) continue;
            // 'all' is the conventional aggregate selector: every note, each
            // one with its own note id.
            if (id === 'all') {
              for (const note of notes) push(note);
              continue;
            }
            push(byId.get(id));
          }
          return { items };
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Images: read, downscale, copy
     * ------------------------------------------------------------------ */

    function readAsDataURL(file) {
      return new Promise((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(reader.error || new Error('read failed'));
          reader.readAsDataURL(file);
        } catch (err) {
          reject(err);
        }
      });
    }

    function loadImageElement(dataUrl) {
      return new Promise((resolve, reject) => {
        try {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('decode failed'));
          image.src = dataUrl;
        } catch (err) {
          reject(err);
        }
      });
    }

    /** Downscale to MAX_EDGE and prefer WebP, so one note image stays small. */
    async function prepareImage(file) {
      if (!file || typeof file.type !== 'string' || file.type.indexOf('image/') !== 0) return null;
      if (typeof file.size === 'number' && file.size > 16 * 1024 * 1024) return null;
      let dataUrl;
      try {
        dataUrl = await readAsDataURL(file);
      } catch (err) {
        return null;
      }
      if (!dataUrl || dataUrl.indexOf('data:image/') !== 0) return null;
      let encoded = dataUrl;
      let width = 0;
      let height = 0;
      let bitmap = null;
      if (typeof createImageBitmap === 'function') {
        try {
          bitmap = await createImageBitmap(file);
        } catch (err) {
          bitmap = null;
        }
      }
      if (bitmap) {
        try {
          const longest = Math.max(bitmap.width, bitmap.height) || 1;
          const scale = Math.min(1, MAX_EDGE / longest);
          width = Math.max(1, Math.round(bitmap.width * scale));
          height = Math.max(1, Math.round(bitmap.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (context) {
            context.drawImage(bitmap, 0, 0, width, height);
            const webp = canvas.toDataURL('image/webp', 0.85);
            encoded =
              typeof webp === 'string' && webp.indexOf('data:image/webp') === 0
                ? webp
                : canvas.toDataURL('image/png');
          }
        } catch (err) {
          encoded = dataUrl;
        }
        try {
          if (typeof bitmap.close === 'function') bitmap.close();
        } catch (err) {
          /* ignore */
        }
      }
      if (!encoded || encoded.length > MAX_IMAGE_DATAURL) return null;
      return { id: makeId(), dataUrl: encoded, width, height, addedAt: Date.now() };
    }

    async function dataUrlToPngBlob(dataUrl) {
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        if (blob && blob.type === 'image/png') return blob;
        const image = await loadImageElement(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d');
        if (!context) return blob;
        context.drawImage(image, 0, 0);
        const png = await new Promise((resolve) => {
          try {
            canvas.toBlob(resolve, 'image/png');
          } catch (err) {
            resolve(null);
          }
        });
        return png || blob;
      } catch (err) {
        return null;
      }
    }

    /** Copy one note image to the system clipboard as PNG. */
    async function copyImageToClipboard(dataUrl) {
      try {
        if (
          typeof window.ClipboardItem !== 'function' ||
          !navigator.clipboard ||
          typeof navigator.clipboard.write !== 'function'
        ) {
          return false;
        }
        const blob = await dataUrlToPngBlob(dataUrl);
        if (!blob) return false;
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        return true;
      } catch (err) {
        return false;
      }
    }

    function imagesFromFileList(fileList) {
      const files = [];
      if (!fileList) return files;
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList[index];
        if (file && typeof file.type === 'string' && file.type.indexOf('image/') === 0) {
          files.push(file);
        }
      }
      return files;
    }

    function imagesFromClipboard(clipboardData) {
      const files = [];
      if (!clipboardData || !clipboardData.items) return files;
      for (let index = 0; index < clipboardData.items.length; index += 1) {
        const item = clipboardData.items[index];
        if (item && item.kind === 'file' && item.type.indexOf('image/') === 0) {
          const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
          if (file) files.push(file);
        }
      }
      return files;
    }

    function hasDraggedFiles(dataTransfer) {
      if (!dataTransfer) return false;
      try {
        if (dataTransfer.types) {
          for (let index = 0; index < dataTransfer.types.length; index += 1) {
            if (dataTransfer.types[index] === 'Files') return true;
          }
        }
        return !!(dataTransfer.files && dataTransfer.files.length);
      } catch (err) {
        return false;
      }
    }

    /* ------------------------------------------------------------------ *
     * Artwork
     * ------------------------------------------------------------------ */

    function notebookGlyph(size, extraProps) {
      return h(
        'svg',
        Object.assign(
          {
            viewBox: '0 0 24 24',
            width: size,
            height: size,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.8,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
            focusable: 'false',
            style: { display: 'block' },
          },
          extraProps,
        ),
        [
          h('rect', { key: 'cover', x: 4.25, y: 3, width: 15.5, height: 18, rx: 2.6 }),
          h('path', { key: 'spine', d: 'M8.5 3v18' }),
          h('path', { key: 'line-1', d: 'M11.75 8.25h5.25' }),
          h('path', { key: 'line-2', d: 'M11.75 12h5.25' }),
          h('path', { key: 'line-3', d: 'M11.75 15.75h3.25' }),
        ],
      );
    }

    function plusGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', { d: 'M8 3.5v9M3.5 8h9' }),
      );
    }

    function imageGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [
          h('rect', { key: 'frame', x: 1.9, y: 2.6, width: 12.2, height: 10.8, rx: 2.2 }),
          h('circle', { key: 'sun', cx: 5.6, cy: 6.1, r: 1.15 }),
          h('path', { key: 'hill', d: 'M3.2 12.1l3.1-3.2 2.2 2.2 1.8-1.7 2.5 2.7' }),
        ],
      );
    }

    function copyGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [
          h('rect', { key: 'back', x: 5.4, y: 2.2, width: 8.2, height: 8.2, rx: 1.7 }),
          h('path', { key: 'front', d: 'M10.2 11.6v.9A1.9 1.9 0 0 1 8.3 14.4H4.3a1.9 1.9 0 0 1-1.9-1.9V8.5a1.9 1.9 0 0 1 1.9-1.9h.9' }),
        ],
      );
    }

    function checkGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', { d: 'M3.2 8.4l3.1 3.1 6.5-6.8' }),
      );
    }

    function closeGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', { d: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6' }),
      );
    }

    function eyeGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [
          h('path', {
            key: 'eye',
            d: 'M1.5 8s2.4-4.1 6.5-4.1S14.5 8 14.5 8s-2.4 4.1-6.5 4.1S1.5 8 1.5 8Z',
          }),
          h('circle', { key: 'pupil', cx: 8, cy: 8, r: 2.1 }),
        ],
      );
    }

    function pencilGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [
          h('path', { key: 'body', d: 'M10.9 2.6l2.5 2.5-7.6 7.6-3.2.7.7-3.2z' }),
          h('path', { key: 'tip', d: 'M9.4 4.1l2.5 2.5' }),
        ],
      );
    }

    function pinGlyph(size) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [
          h('path', {
            key: 'pin',
            d: 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
          }),
          h('path', { key: 'stem', d: 'M12 17v5' }),
        ],
      );
    }

    /* ------------------------------------------------------------------ *
     * Sidebar panel icon
     * ------------------------------------------------------------------ */

    function NotesIcon(props) {
      const size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 20;
      const active = !!(props && props.active);
      return h(
        'span',
        {
          className: 'dsh-notes-panel-icon',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: active
              ? 'var(--dsw-alias-label-primary)'
              : 'var(--dsw-alias-label-secondary)',
          },
        },
        notebookGlyph(size, { strokeWidth: 1.7 }),
      );
    }

    /* ------------------------------------------------------------------ *
     * Styles: theme tokens only, so light/dark switching is inherited.
     * Rendered as a <style> element by the panel, so unmounting removes it.
     * ------------------------------------------------------------------ */

    const CSS = [
      '.dsh-notes-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5}',
      '.dsh-notes-header{display:flex;align-items:center;gap:12px;flex:0 0 auto;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-notes-heading{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dsh-notes-heading-mark{display:inline-flex;color:var(--dsw-alias-brand-primary)}',
      '.dsh-notes-title{margin:0;font-size:15px;font-weight:600;line-height:22px;white-space:nowrap}',
      '.dsh-notes-count{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-notes-actions{display:flex;align-items:center;gap:8px;margin-left:auto;min-width:0}',
      '.dsh-notes-search{display:block;box-sizing:border-box;height:30px;width:100%;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none;-webkit-appearance:none;appearance:none}',
      '.dsh-notes-search::-webkit-search-cancel-button{-webkit-appearance:none}',
      '.dsh-notes-search::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-search:focus{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease}',
      '.dsh-notes-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-notes-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-notes-btn[disabled]{opacity:.55;cursor:default}',
      '.dsh-notes-btn--new svg{color:var(--dsw-alias-brand-primary)}',
      '.dsh-notes-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-btn--ghost:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-danger{margin-left:4px}',
      '.dsh-notes-danger:hover{color:var(--dsw-alias-state-error-primary)}',
      ".dsh-notes-danger[data-confirm='true']{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
      '.dsh-notes-body{display:flex;flex:1 1 auto;min-height:0}',
      '.dsh-notes-list{flex:0 0 280px;width:280px;min-width:0;overflow-y:auto;padding:8px;border-right:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-notes-list-search{position:sticky;top:-8px;z-index:2;margin:-8px -8px 6px;padding:10px 8px 8px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-notes-list-empty{margin:16px 8px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-row{display:flex;flex-direction:column;gap:3px;width:100%;margin:0 0 2px;padding:9px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color .12s ease,border-color .12s ease}',
      '.dsh-notes-row:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notes-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      ".dsh-notes-row[data-active='true']{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}",
      '.dsh-notes-row-title{display:block;font-size:13px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-notes-row-head{display:flex;align-items:center;gap:6px;min-width:0}',
      '.dsh-notes-row-head .dsh-notes-row-title{flex:1 1 auto;min-width:0}',
      '.dsh-notes-row-pinned{display:inline-flex;flex:0 0 auto;color:var(--dsw-alias-brand-primary)}',
      '.dsh-notes-menu{position:absolute;z-index:30;min-width:172px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-overlay)}',
      '.dsh-notes-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}',
      '.dsh-notes-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-menu-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-notes-row-snippet{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);word-break:break-word}',
      '.dsh-notes-row-meta{display:block;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);opacity:.85}',
      '.dsh-notes-editor{position:relative;display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0}',
      ".dsh-notes-editor[data-dragging='true']{outline:2px dashed var(--dsw-alias-brand-primary);outline-offset:-8px}",
      ".dsh-notes-editor[data-dragging='true']::after{content:attr(data-drop-label);position:absolute;right:24px;bottom:20px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;pointer-events:none;z-index:3}",
      '.dsh-notes-editor-head{flex:0 0 auto;padding:20px 28px 0}',
      '.dsh-notes-note-title{margin:0 0 14px;padding:0;font-size:22px;font-weight:600;line-height:1.35;white-space:pre-wrap}',
      '.dsh-notes-note-title:empty::before{content:attr(data-placeholder);color:var(--dsw-alias-label-secondary);opacity:.75;pointer-events:none}',
      '.dsh-notes-origin{display:flex;align-items:center;gap:6px;margin-top:7px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-origin-badge{display:inline-flex;align-items:center;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);white-space:nowrap}',
      '.dsh-notes-rich-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;margin:12px 28px 0;padding-bottom:16px}',
      '.dsh-notes-rich-editor{min-height:160px;outline:none;cursor:text}',
      '.dsh-notes-markdown{min-height:80px;line-height:1.7;color:var(--dsw-alias-label-primary);word-break:break-word}',
      '.dsh-notes-markdown p{min-height:1.7em;white-space:pre-wrap}',
      '.dsh-notes-markdown [hidden]{display:none!important}',
      '.dsh-notes-markdown strong{font-weight:700}',
      '.dsh-notes-markdown em{font-style:italic}',
      '.dsh-notes-markdown a{color:var(--dsw-alias-brand-primary);text-decoration:underline}',
      '.dsh-notes-edit-conflict{position:sticky;bottom:0;padding:10px;border:1px solid var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-state-error-primary);font-size:12px}',
      '.dsh-notes-edit-conflict button{margin:8px 8px 0 0;cursor:pointer}',
      '@media(max-width:820px){.dsh-notes-rich-scroll{margin:12px 18px 0}}',
      '.dsh-notes-md-heading{margin:18px 0 8px;line-height:1.35;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-md-heading:first-child{margin-top:0}',
      '.dsh-notes-md-h1{font-size:1.7em}',
      '.dsh-notes-md-h2{font-size:1.45em}',
      '.dsh-notes-md-h3{font-size:1.25em}',
      '.dsh-notes-md-h4{font-size:1.1em}',
      '.dsh-notes-md-h5{font-size:1em}',
      '.dsh-notes-md-h6{font-size:.94em;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-md-p{margin:0 0 12px;white-space:pre-wrap}',
      '.dsh-notes-md-list{margin:0 0 12px;padding-left:1.5em}',
      '.dsh-notes-md-list li{margin:2px 0}',
      '.dsh-notes-md-quote{margin:0 0 12px;padding:2px 12px;border-left:3px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-secondary);white-space:pre-wrap}',
      '.dsh-notes-md-pre{margin:0 0 12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow-x:auto;font-size:.9em;line-height:1.55}',
      '.dsh-notes-md-pre code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}',
      '.dsh-notes-md-hr{border:none;border-top:1px solid var(--dsw-alias-border-l1);margin:16px 0}',
      '.dsh-notes-md-tablewrap{margin:0 0 14px;overflow-x:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px}',
      '.dsh-notes-md-table{border-collapse:collapse;width:100%;font-size:.95em;line-height:1.55}',
      '.dsh-notes-md-table th,.dsh-notes-md-table td{padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);vertical-align:top;white-space:nowrap}',
      '.dsh-notes-md-table th{font-weight:600;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-md-table tbody tr:nth-child(even) td{background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notes-md-table tr:last-child td{border-bottom:none}',
      '.dsh-notes-md-table th:last-child,.dsh-notes-md-table td:last-child{border-right:none}',
      '.dsh-notes-md-table code{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}',
      '.dsh-notes-gallery{display:flex;flex-wrap:wrap;gap:8px;flex:0 0 auto;padding:0 28px 12px}',
      '.dsh-notes-thumb{position:relative;margin:0;width:96px;height:96px;flex:0 0 auto;border-radius:8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notes-thumb img{display:block;width:100%;height:100%;object-fit:cover;cursor:zoom-in}',
      '.dsh-notes-thumb-actions{position:absolute;top:4px;right:4px;display:flex;gap:4px;opacity:0;transition:opacity .12s ease}',
      '.dsh-notes-thumb:hover .dsh-notes-thumb-actions,.dsh-notes-thumb:focus-within .dsh-notes-thumb-actions{opacity:1}',
      '.dsh-notes-thumb-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dsh-notes-thumb-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-notes-thumb-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-notes-thumb-remove:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      ".dsh-notes-thumb[data-confirm='true']{border-color:var(--dsw-alias-state-error-primary)}",
      ".dsh-notes-thumb[data-confirm='true'] .dsh-notes-thumb-remove{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
      '.dsh-notes-image-error{flex:0 0 auto;padding:6px 28px 0;font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-notes-footer{display:flex;align-items:center;gap:12px;flex:0 0 auto;padding:10px 28px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}',
      ".dsh-notes-footer[data-error='true'] .dsh-notes-status{color:var(--dsw-alias-state-error-primary)}",
      '.dsh-notes-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto;min-width:0}',
      '.dsh-notes-font-size{display:inline-flex;align-items:center;height:28px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;white-space:nowrap}',
      '.dsh-notes-font-size-label{padding:0 6px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-notes-font-size-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:600;cursor:pointer}',
      '.dsh-notes-font-size-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-notes-font-size-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-notes-font-size-btn[disabled]{opacity:.35;cursor:default}',
      '.dsh-notes-characters{white-space:nowrap}',
      '.dsh-notes-preview{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-overlay)}',
      '.dsh-notes-preview-panel{display:flex;flex-direction:column;gap:10px;max-width:92%;max-height:100%}',
      '.dsh-notes-preview-img{display:block;max-width:100%;max-height:70vh;object-fit:contain;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-notes-preview-actions{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}',
      '.dsh-notes-share-overlay{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.28)}',
      '.dsh-notes-share-panel{display:flex;flex-direction:column;gap:14px;width:min(640px,92vw);max-height:min(720px,88vh);padding:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-base);box-shadow:0 16px 48px rgba(0,0,0,.18)}',
      '.dsh-notes-share-head{display:flex;align-items:flex-start;gap:12px}',
      '.dsh-notes-share-heading{min-width:0}',
      '.dsh-notes-share-title{margin:0;font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-share-hint{margin:4px 0 0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-share-close{margin-left:auto;flex:0 0 auto}',
      '.dsh-notes-field{display:flex;flex-direction:column;gap:6px;min-height:0}',
      '.dsh-notes-field-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-share-input,.dsh-notes-share-code{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.dsh-notes-share-input{height:34px;padding:0 10px}',
      '.dsh-notes-share-code{min-height:150px;max-height:300px;padding:10px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.45;word-break:break-all}',
      '.dsh-notes-share-input:focus,.dsh-notes-share-code:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-notes-share-code::placeholder,.dsh-notes-share-input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-share-warning{padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.dsh-notes-share-h5{display:flex;flex-direction:column;gap:6px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-notes-share-h5 .dsh-notes-share-hint{margin:0}',
      '.dsh-notes-share-h5-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dsh-notes-share-message{font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}',
      ".dsh-notes-share-message[data-success='true']{color:var(--dsw-alias-brand-primary)}",
      '.dsh-notes-share-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}',
      '.dsh-notes-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px;text-align:center}',
      '.dsh-notes-empty-art{color:var(--dsw-alias-label-secondary);opacity:.45;margin-bottom:4px}',
      '.dsh-notes-empty-title{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsh-notes-empty-hint{margin:0;max-width:340px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '@media (max-width:820px){.dsh-notes-list{flex-basis:220px;width:220px}.dsh-notes-editor-head{padding:16px 18px 0}.dsh-notes-gallery{padding:0 18px 10px}.dsh-notes-image-error{padding:6px 18px 0}.dsh-notes-footer{padding:10px 18px}}',
    ].join('\n');

    /* ------------------------------------------------------------------ *
     * Panel view
     * ------------------------------------------------------------------ */

    function NotesPanel(props) {
      const t = props.t;
      const localeFace = props.locale;

      const [snap, setSnap] = React.useState(store.getSnapshot);
      const [query, setQuery] = React.useState('');
      const [, setLocaleRevision] = React.useState(0);
      const [focusRequest, setFocusRequest] = React.useState(0);
      const [pendingDelete, setPendingDelete] = React.useState(null);
      const [pendingImage, setPendingImage] = React.useState(null);
      const [previewId, setPreviewId] = React.useState(null);
      const [copiedId, setCopiedId] = React.useState(null);
      const [imageBusy, setImageBusy] = React.useState(false);
      const [imageError, setImageError] = React.useState(null);
      const [dragging, setDragging] = React.useState(false);
      const [fontSize, setFontSize] = React.useState(loadFontSize);
      const [shareDialog, setShareDialog] = React.useState(null);
      const [shareDraft, setShareDraft] = React.useState(null);
      const [shareName, setShareName] = React.useState(loadShareName);
      const [shareCode, setShareCode] = React.useState('');
      const [importCode, setImportCode] = React.useState('');
      const [shareMessage, setShareMessage] = React.useState(null);
      const [menu, setMenu] = React.useState(null);
      const editorRef = React.useRef(null);
      const fileInputRef = React.useRef(null);
      const rootRef = React.useRef(null);

      React.useEffect(() => store.subscribe(() => setSnap(store.getSnapshot())), []);

      React.useEffect(() => {
        if (!localeFace || typeof localeFace.subscribe !== 'function') return undefined;
        return localeFace.subscribe(() => setLocaleRevision((value) => value + 1));
      }, [localeFace]);

      React.useEffect(
        () => () => {
          flushEditor();
        },
        [],
      );

      React.useEffect(() => {
        if (!focusRequest) return;
        if (editorRef.current) editorRef.current.focusTitle();
      }, [focusRequest, snap.selectedId]);

      React.useEffect(() => {
        setPendingDelete(null);
        setPendingImage(null);
      }, [snap.selectedId]);

      React.useEffect(() => {
        if (!menu) return undefined;
        function closeOnMouseDown(event) {
          const target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('.dsh-notes-menu')) {
            return;
          }
          setMenu(null);
        }
        function closeOnKeyDown(event) {
          if (event.key === 'Escape' || event.key === 'Esc') setMenu(null);
        }
        function closeOnScroll() {
          setMenu(null);
        }
        document.addEventListener('mousedown', closeOnMouseDown, true);
        document.addEventListener('keydown', closeOnKeyDown, true);
        window.addEventListener('scroll', closeOnScroll, true);
        window.addEventListener('resize', closeOnScroll);
        return () => {
          document.removeEventListener('mousedown', closeOnMouseDown, true);
          document.removeEventListener('keydown', closeOnKeyDown, true);
          window.removeEventListener('scroll', closeOnScroll, true);
          window.removeEventListener('resize', closeOnScroll);
        };
      }, [menu]);

      React.useEffect(() => {
        if (!pendingDelete) return undefined;
        const timer = setTimeout(() => setPendingDelete(null), 4000);
        return () => clearTimeout(timer);
      }, [pendingDelete]);

      React.useEffect(() => {
        if (!pendingImage) return undefined;
        const timer = setTimeout(() => setPendingImage(null), 4000);
        return () => clearTimeout(timer);
      }, [pendingImage]);

      React.useEffect(() => {
        if (!copiedId) return undefined;
        const timer = setTimeout(() => setCopiedId(null), 1800);
        return () => clearTimeout(timer);
      }, [copiedId]);

      React.useEffect(() => {
        if (!imageError) return undefined;
        const timer = setTimeout(() => setImageError(null), 5000);
        return () => clearTimeout(timer);
      }, [imageError]);

      React.useEffect(() => {
        if (!previewId) return undefined;
        function onKeyDown(event) {
          if (event.key === 'Escape' || event.key === 'Esc') {
            event.stopPropagation();
            setPreviewId(null);
          }
        }
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
      }, [previewId]);

      React.useEffect(() => {
        if (!shareDialog) return undefined;
        function onKeyDown(event) {
          if (event.key === 'Escape' || event.key === 'Esc') {
            event.stopPropagation();
            setShareDialog(null);
            setShareMessage(null);
          }
        }
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
      }, [shareDialog]);

      React.useEffect(() => {
        function onVisibilityChange() {
          if (document.visibilityState === 'hidden') flushEditor();
        }
        function onPageHide() { flushEditor(); }
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pagehide', onPageHide);
        return () => {
          document.removeEventListener('visibilitychange', onVisibilityChange);
          window.removeEventListener('pagehide', onPageHide);
        };
      }, []);

      const localeSnapshot =
        localeFace && typeof localeFace.getSnapshot === 'function'
          ? localeFace.getSnapshot()
          : null;
      const activeLocale = localeSnapshot && localeSnapshot.active;
      const formatters = React.useMemo(
        () => createFormatters(activeLocale),
        [activeLocale, localeSnapshot && localeSnapshot.revision],
      );

      const notes = snap.notes;
      const sorted = React.useMemo(() => sortNotes(notes), [notes]);
      const needle = query.trim().toLowerCase();
      const visible = needle
        ? sorted.filter(
            (note) => (note.title + '\n' + note.body).toLowerCase().indexOf(needle) !== -1,
          )
        : sorted;
      const selected = snap.selectedId
        ? notes.find((note) => note.id === snap.selectedId) || null
        : null;
      const menuNote = menu ? notes.find((note) => note.id === menu.noteId) || null : null;
      const previewImage =
        previewId && selected
          ? selected.images.find((image) => image.id === previewId) || null
          : null;

      function handleCreate() {
        if (!flushEditor()) return;
        store.createNote();
        setQuery('');
        setFocusRequest((value) => value + 1);
      }

      function handleSelect(id) {
        if (!flushEditor()) return;
        store.selectNote(id);
      }

      function handleContextMenu(note, event) {
        event.preventDefault();
        event.stopPropagation();
        handleSelect(note.id);
        const root = rootRef.current;
        const rect = root ? root.getBoundingClientRect() : { left: 0, top: 0 };
        const width = root ? root.clientWidth : 0;
        const height = root ? root.clientHeight : 0;
        const x = Math.max(8, Math.min(event.clientX - rect.left, Math.max(8, width - 200)));
        const y = Math.max(8, Math.min(event.clientY - rect.top, Math.max(8, height - 52)));
        setMenu({ noteId: note.id, x, y });
      }

      function handleTogglePin(note) {
        store.setNotePinned(note.id, !note.pinned);
        setMenu(null);
      }

      function handleBodyChange(noteId, baseBody, markdown, baseTitle, title) {
        const latest = store.getSnapshot().notes.find((note) => note.id === noteId);
        if (!latest) return { ok: false };
        const merged = rebaseMarkdown(baseBody, latest.body, markdown);
        if (!merged.ok || (latest.title !== baseTitle && title !== baseTitle && title !== latest.title)) return { ok: false };
        const nextTitle = title === baseTitle ? latest.title : title;
        const body = renameTitleHeading(merged.body, latest.title, nextTitle);
        if (body !== latest.body || nextTitle !== latest.title) store.updateNote(noteId, { body, title: nextTitle });
        return { ok: true, body, title: nextTitle };
      }

      function flushEditor() {
        return editorRef.current ? editorRef.current.flush() : store.flush();
      }

      function adjustFontSize(direction) {
        const currentIndex = FONT_SIZES.indexOf(fontSize);
        const baseIndex = currentIndex === -1 ? FONT_SIZES.indexOf(DEFAULT_FONT_SIZE) : currentIndex;
        const nextIndex = Math.max(0, Math.min(FONT_SIZES.length - 1, baseIndex + direction));
        const next = FONT_SIZES[nextIndex];
        if (next === fontSize) return;
        setFontSize(next);
        saveFontSize(next);
      }

      function handleDelete(note) {
        if (pendingDelete === note.id) {
          store.deleteNote(note.id);
          setPendingDelete(null);
          return;
        }
        setPendingDelete(note.id);
      }

      async function ingestImages(files) {
        const current = store.getSnapshot();
        const note = current.selectedId
          ? current.notes.find((item) => item.id === current.selectedId) || null
          : null;
        if (!note) return;
        const room = MAX_IMAGES_PER_NOTE - note.images.length;
        if (room <= 0) {
          setImageError(t('imageLimit'));
          return;
        }
        setImageBusy(true);
        setImageError(null);
        try {
          const prepared = [];
          const chosen = files.slice(0, Math.min(MAX_IMAGES_PER_PASTE, room));
          for (const file of chosen) {
            const image = await prepareImage(file);
            if (image) prepared.push(image);
          }
          if (!prepared.length) {
            setImageError(t('imageUnsupported'));
            return;
          }
          const outcome = store.addImages(note.id, prepared);
          if (outcome !== 'ok') {
            setImageError(outcome === 'full' ? t('storageFull') : t('imageFailed'));
            return;
          }
          if (!store.flush()) {
            store.removeImages(
              note.id,
              prepared.map((image) => image.id),
            );
            setImageError(t('storageFull'));
          }
        } catch (err) {
          setImageError(t('imageFailed'));
        } finally {
          setImageBusy(false);
        }
      }

      function handlePaste(event) {
        const files = imagesFromClipboard(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        void ingestImages(files);
      }

      function handleFileChange(event) {
        const files = imagesFromFileList(event.target.files);
        event.target.value = '';
        if (files.length) void ingestImages(files);
      }

      function handleDragOver(event) {
        if (!hasDraggedFiles(event.dataTransfer)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }

      function handleDragLeave(event) {
        const next = event.relatedTarget;
        if (next && event.currentTarget && event.currentTarget.contains(next)) return;
        setDragging(false);
      }

      function handleDrop(event) {
        if (!hasDraggedFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDragging(false);
        const files = imagesFromFileList(event.dataTransfer.files);
        if (files.length) void ingestImages(files);
      }

      async function handleCopyImage(image) {
        const copied = await copyImageToClipboard(image.dataUrl);
        if (copied) {
          setCopiedId(image.id);
          setImageError(null);
        } else {
          setImageError(t('copyFailed'));
        }
      }

      function handleRemoveImage(note, image) {
        if (pendingImage !== image.id) {
          setPendingImage(image.id);
          return;
        }
        setPendingImage(null);
        if (previewId === image.id) setPreviewId(null);
        store.removeImages(note.id, [image.id]);
        store.flush();
      }

      function openShare(note) {
        if (!flushEditor()) return;
        try {
          const latest = store.getSnapshot().notes.find((item) => item.id === note.id);
          const payload = createSharePayload(latest, shareName);
          setShareDraft(payload);
          setShareCode(encodeSharePayload(payload));
          setShareMessage(null);
          setShareDialog('share');
        } catch (err) {
          setShareDraft(null);
          setShareCode('');
          setShareMessage({ text: t('shareCodeTooLarge'), success: false });
          setShareDialog('share');
        }
      }

      function openImport() {
        if (!flushEditor()) return;
        setImportCode('');
        setShareMessage(null);
        setShareDialog('import');
      }

      function closeShareDialog() {
        setShareDialog(null);
        setShareMessage(null);
      }

      function handleShareNameChange(event) {
        const name = event.target.value.slice(0, 80);
        setShareName(name);
        saveShareName(name);
        if (!shareDraft) return;
        const next = Object.assign({}, shareDraft, { senderName: name.trim() });
        setShareDraft(next);
        try {
          setShareCode(encodeSharePayload(next));
          setShareMessage(null);
        } catch (err) {
          setShareCode('');
          setShareMessage({ text: t('shareCodeTooLarge'), success: false });
        }
      }

      async function handleCopyShareCode() {
        if (!shareCode) return;
        const copied = await copyTextToClipboard(shareCode);
        setShareMessage({
          text: t(copied ? 'shareCodeCopied' : 'shareCopyFailed'),
          success: copied,
        });
      }

      function handleExportH5() {
        if (!shareDraft) return;
        try {
          const html = buildStandaloneHtml(shareDraft, t, changelogLang(activeLocale));
          downloadTextFile(
            sanitizeShareFileName(shareDraft.title, t('h5Untitled')),
            html,
            'text/html;charset=utf-8',
          );
          setShareMessage({ text: t('h5Exported'), success: true });
        } catch (err) {
          setShareMessage({ text: t('h5Failed'), success: false });
        }
      }

      async function handleCopyH5() {
        if (!shareDraft) return;
        try {
          const html = buildStandaloneHtml(shareDraft, t, changelogLang(activeLocale));
          const copied = await copyTextToClipboard(html);
          setShareMessage({ text: t(copied ? 'h5Copied' : 'h5Failed'), success: copied });
        } catch (err) {
          setShareMessage({ text: t('h5Failed'), success: false });
        }
      }

      function handleImportShare() {
        let payload;
        try {
          payload = parseShareCode(importCode);
        } catch (err) {
          const key =
            err && err.code === 'too-large'
              ? 'shareCodeTooLarge'
              : err && err.code === 'unsupported'
                ? 'unsupportedShareCode'
                : 'invalidShareCode';
          setShareMessage({ text: t(key), success: false });
          return;
        }
        const result = store.importSharedNote(payload);
        if (result.status === 'full') {
          setShareMessage({ text: t('storageFull'), success: false });
          return;
        }
        if (result.status === 'invalid') {
          setShareMessage({ text: t('invalidShareCode'), success: false });
          return;
        }
        if (result.status === 'ok' && !store.flush()) {
          store.deleteNote(result.id);
          store.flush();
          setShareMessage({ text: t('storageFull'), success: false });
          return;
        }
        setImportCode('');
        setQuery('');
        setShareMessage({
          text: t(result.status === 'duplicate' ? 'importedDuplicate' : 'importedSuccess'),
          success: true,
        });
      }

      const header = h(
        'header',
        { className: 'dsh-notes-header' },
        h(
          'div',
          { className: 'dsh-notes-heading' },
          h('span', { className: 'dsh-notes-heading-mark' }, notebookGlyph(18)),
          h('h1', { className: 'dsh-notes-title' }, t('title')),
          h('span', { className: 'dsh-notes-count' }, notes.length + ' ' + t('noteCount')),
        ),
        h(
          'div',
          { className: 'dsh-notes-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-notes-btn dsh-notes-btn--ghost',
              disabled: !selected,
              onClick: () => {
                if (selected) openShare(selected);
              },
              title: t('shareNote'),
            },
            h('span', null, t('share')),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-notes-btn dsh-notes-btn--ghost',
              onClick: openImport,
              title: t('importShare'),
            },
            h('span', null, t('importShare')),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-notes-btn dsh-notes-btn--new',
              onClick: handleCreate,
              title: t('newNote'),
            },
            plusGlyph(14),
            h('span', null, t('newNote')),
          ),
        ),
      );

      const fileInput = h('input', {
        ref: fileInputRef,
        type: 'file',
        accept: 'image/*',
        multiple: true,
        style: { display: 'none' },
        onChange: handleFileChange,
      });

      const preview = previewImage
        ? h(
            'div',
            {
              className: 'dsh-notes-preview',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('previewImage'),
              onClick: () => setPreviewId(null),
            },
            h(
              'div',
              {
                className: 'dsh-notes-preview-panel',
                onClick: (event) => event.stopPropagation(),
              },
              h('img', {
                className: 'dsh-notes-preview-img',
                src: previewImage.dataUrl,
                alt: t('imageAlt'),
                draggable: false,
              }),
              h(
                'div',
                { className: 'dsh-notes-preview-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-notes-btn',
                    onClick: () => void handleCopyImage(previewImage),
                  },
                  copiedId === previewImage.id ? checkGlyph(14) : copyGlyph(14),
                  h('span', null, t(copiedId === previewImage.id ? 'copied' : 'copyImage')),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-notes-btn dsh-notes-btn--ghost',
                    'data-confirm': pendingImage === previewImage.id ? 'true' : 'false',
                    onClick: () => handleRemoveImage(selected, previewImage),
                  },
                  h(
                    'span',
                    null,
                    t(pendingImage === previewImage.id ? 'confirmRemove' : 'removeImage'),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-notes-btn',
                    onClick: () => setPreviewId(null),
                  },
                  h('span', null, t('close')),
                ),
              ),
            ),
          )
        : null;

      const shareOverlay = shareDialog
        ? h(
            'div',
            {
              className: 'dsh-notes-share-overlay',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t(shareDialog === 'share' ? 'shareSnapshotTitle' : 'importShareTitle'),
              onClick: closeShareDialog,
            },
            h(
              'div',
              {
                className: 'dsh-notes-share-panel',
                onClick: (event) => event.stopPropagation(),
              },
              h(
                'div',
                { className: 'dsh-notes-share-head' },
                h(
                  'div',
                  { className: 'dsh-notes-share-heading' },
                  h(
                    'h2',
                    { className: 'dsh-notes-share-title' },
                    t(shareDialog === 'share' ? 'shareSnapshotTitle' : 'importShareTitle'),
                  ),
                  h(
                    'p',
                    { className: 'dsh-notes-share-hint' },
                    t(shareDialog === 'share' ? 'shareSnapshotHint' : 'importShareHint'),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-notes-thumb-btn dsh-notes-share-close',
                    title: t('close'),
                    'aria-label': t('close'),
                    onClick: closeShareDialog,
                  },
                  closeGlyph(14),
                ),
              ),
              shareDialog === 'share'
                ? h(
                    React.Fragment,
                    null,
                    h(
                      'label',
                      { className: 'dsh-notes-field' },
                      h('span', { className: 'dsh-notes-field-label' }, t('senderName')),
                      h('input', {
                        className: 'dsh-notes-share-input',
                        type: 'text',
                        maxLength: 80,
                        value: shareName,
                        placeholder: t('senderNamePlaceholder'),
                        onChange: handleShareNameChange,
                      }),
                    ),
                    h(
                      'label',
                      { className: 'dsh-notes-field' },
                      h('span', { className: 'dsh-notes-field-label' }, t('shareCode')),
                      h('textarea', {
                        className: 'dsh-notes-share-code',
                        readOnly: true,
                        spellCheck: false,
                        value: shareCode,
                        onFocus: (event) => event.target.select(),
                      }),
                    ),
                    h('div', { className: 'dsh-notes-share-warning' }, t('sharePrivacy')),
                    h(
                      'div',
                      { className: 'dsh-notes-share-h5' },
                      h('span', { className: 'dsh-notes-field-label' }, t('h5Title')),
                      h('p', { className: 'dsh-notes-share-hint' }, t('h5Hint')),
                      h(
                        'div',
                        { className: 'dsh-notes-share-h5-actions' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-notes-btn',
                            disabled: !shareDraft,
                            onClick: handleExportH5,
                          },
                          h('span', null, t('exportH5')),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-notes-btn dsh-notes-btn--ghost',
                            disabled: !shareDraft,
                            onClick: () => void handleCopyH5(),
                          },
                          copyGlyph(14),
                          h('span', null, t('copyH5')),
                        ),
                      ),
                    ),
                  )
                : h(
                    'label',
                    { className: 'dsh-notes-field' },
                    h('span', { className: 'dsh-notes-field-label' }, t('shareCode')),
                    h('textarea', {
                      className: 'dsh-notes-share-code',
                      spellCheck: false,
                      value: importCode,
                      placeholder: t('importCodePlaceholder'),
                      onChange: (event) => {
                        setImportCode(event.target.value);
                        setShareMessage(null);
                      },
                    }),
                  ),
              shareMessage
                ? h(
                    'div',
                    {
                      className: 'dsh-notes-share-message',
                      'data-success': shareMessage.success ? 'true' : 'false',
                      role: 'status',
                    },
                    shareMessage.text,
                  )
                : null,
              h(
                'div',
                { className: 'dsh-notes-share-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-notes-btn dsh-notes-btn--ghost',
                    onClick: closeShareDialog,
                  },
                  t('close'),
                ),
                shareDialog === 'share'
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notes-btn dsh-notes-btn--new',
                        disabled: !shareCode,
                        onClick: () => void handleCopyShareCode(),
                      },
                      copyGlyph(14),
                      h('span', null, t('copyShareCode')),
                    )
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notes-btn dsh-notes-btn--new',
                        disabled: !importCode.trim(),
                        onClick: handleImportShare,
                      },
                      h('span', null, t('import')),
                    ),
              ),
            ),
          )
        : null;

      let content;

      if (notes.length === 0) {
        content = h(
          'div',
          { className: 'dsh-notes-body' },
          h(
            'div',
            { className: 'dsh-notes-empty' },
            h('div', { className: 'dsh-notes-empty-art' }, notebookGlyph(44)),
            h('p', { className: 'dsh-notes-empty-title' }, t('emptyTitle')),
            h('p', { className: 'dsh-notes-empty-hint' }, t('emptyHint')),
            h(
              'button',
              { type: 'button', className: 'dsh-notes-btn', onClick: handleCreate },
              plusGlyph(14),
              h('span', null, t('newNote')),
            ),
          ),
        );
      } else {
        const list = h(
          'div',
          {
            className: 'dsh-notes-list',
            onContextMenu: (event) => {
              event.preventDefault();
              setMenu(null);
            },
            onScroll: () => setMenu(null),
          },
          h(
            'div',
            { className: 'dsh-notes-list-search' },
            h('input', {
              className: 'dsh-notes-search',
              type: 'search',
              placeholder: t('searchPlaceholder'),
              'aria-label': t('searchPlaceholder'),
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          visible.length === 0
            ? h('p', { className: 'dsh-notes-list-empty' }, t('noResults'))
            : visible.map((note) =>
                  h(
                    'button',
                    {
                      key: note.id,
                      type: 'button',
                      className: 'dsh-notes-row',
                      'data-active': note.id === snap.selectedId ? 'true' : 'false',
                      'aria-current': note.id === snap.selectedId ? 'true' : undefined,
                      onClick: () => {
                        setMenu(null);
                        handleSelect(note.id);
                      },
                      onContextMenu: (event) => handleContextMenu(note, event),
                    },
                    h(
                      'span',
                      { className: 'dsh-notes-row-head' },
                      h('span', { className: 'dsh-notes-row-title' }, noteTitle(note, t)),
                      note.pinned
                        ? h(
                            'span',
                            {
                              className: 'dsh-notes-row-pinned',
                              title: t('pinned'),
                              'aria-label': t('pinned'),
                            },
                            pinGlyph(12),
                          )
                        : null,
                    ),
                    h('span', { className: 'dsh-notes-row-snippet' }, noteSnippet(note, t)),
                    h(
                      'span',
                      { className: 'dsh-notes-row-meta' },
                      formatWhen(note.updatedAt, formatters, t) +
                        (note.images.length ? ' · ' + note.images.length + ' ' + t('imageCount') : '') +
                        (note.system ? ' · ' + t('autoMaintained') : '') +
                        (note.sharedFrom ? ' · ' + t('importedShare') : ''),
                    ),
                  ),
                ),
        );

        const gallery = selected && selected.images.length
          ? h(
              'div',
              { className: 'dsh-notes-gallery' },
              selected.images.map((image) =>
                h(
                  'figure',
                  {
                    key: image.id,
                    className: 'dsh-notes-thumb',
                    'data-confirm': pendingImage === image.id ? 'true' : 'false',
                  },
                  h('img', {
                    src: image.dataUrl,
                    alt: t('imageAlt'),
                    loading: 'lazy',
                    draggable: false,
                    onClick: () => setPreviewId(image.id),
                  }),
                  h(
                    'div',
                    { className: 'dsh-notes-thumb-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notes-thumb-btn',
                        title: t(copiedId === image.id ? 'copied' : 'copyImage'),
                        'aria-label': t('copyImage'),
                        onClick: () => void handleCopyImage(image),
                      },
                      copiedId === image.id ? checkGlyph(13) : copyGlyph(13),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notes-thumb-btn dsh-notes-thumb-remove',
                        title: t(pendingImage === image.id ? 'confirmRemove' : 'removeImage'),
                        'aria-label': t(pendingImage === image.id ? 'confirmRemove' : 'removeImage'),
                        onClick: () => handleRemoveImage(selected, image),
                      },
                      closeGlyph(13),
                    ),
                  ),
                ),
              ),
            )
          : null;

        const editor = selected
          ? h(
              'section',
              {
                className: 'dsh-notes-editor',
                'aria-label': t('title'),
                'data-dragging': dragging ? 'true' : 'false',
                'data-drop-label': t('dropHint'),
                onPaste: handlePaste,
                onDragOver: handleDragOver,
                onDragEnter: handleDragOver,
                onDragLeave: handleDragLeave,
                onDrop: handleDrop,
              },
              fileInput,
              h(
                'div',
                { className: 'dsh-notes-editor-head' },
                selected.sharedFrom
                  ? h(
                      'div',
                      { className: 'dsh-notes-origin' },
                      h('span', { className: 'dsh-notes-origin-badge' }, t('importedShare')),
                      h(
                        'span',
                        null,
                        (selected.sharedFrom.senderName
                          ? t('importedFrom').replace('{name}', selected.sharedFrom.senderName)
                          : t('importedAnonymous')) +
                          (selected.sharedFrom.sharedAt
                            ? ' · ' + formatWhen(selected.sharedFrom.sharedAt, formatters, t)
                            : '') +
                          ' · ' +
                          t('snapshotBoundary'),
                      ),
                    )
                  : null,
              ),
              h(MarkdownEditor, {
                key: selected.id, note: selected, editorRef, fontSize,
                titlePlaceholder: t('titlePlaceholder'), bodyPlaceholder: t('bodyPlaceholder'),
                onChange: (...args) => handleBodyChange(selected.id, ...args),
              }),
              gallery,
              imageError
                ? h('div', { className: 'dsh-notes-image-error', role: 'status' }, imageError)
                : null,
              h(
                'footer',
                { className: 'dsh-notes-footer', 'data-error': store.isSaveError() ? 'true' : 'false' },
                h(
                  'span',
                  { className: 'dsh-notes-status' },
                  store.isSaveError()
                    ? t('saveFailed')
                    : t('saved') + ' · ' + formatWhen(selected.updatedAt, formatters, t),
                ),
                h(
                  'div',
                  { className: 'dsh-notes-right' },
                  imageBusy
                    ? h('span', { className: 'dsh-notes-characters' }, t('processingImage'))
                    : null,
                  h(
                    'div',
                    { className: 'dsh-notes-font-size', 'aria-label': t('bodyFontSize') },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notes-font-size-btn',
                        title: t('decreaseFontSize'),
                        'aria-label': t('decreaseFontSize'),
                        disabled: fontSize === FONT_SIZES[0],
                        onClick: () => adjustFontSize(-1),
                      },
                      'A−',
                    ),
                    h(
                      'span',
                      { className: 'dsh-notes-font-size-label', title: t('bodyFontSize') },
                      fontSize + ' px',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-notes-font-size-btn',
                        title: t('increaseFontSize'),
                        'aria-label': t('increaseFontSize'),
                        disabled: fontSize === FONT_SIZES[FONT_SIZES.length - 1],
                        onClick: () => adjustFontSize(1),
                      },
                      'A+',
                    ),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-notes-btn dsh-notes-btn--ghost',
                      title: t('addImage'),
                      disabled: imageBusy,
                      onClick: () => {
                        if (fileInputRef.current && typeof fileInputRef.current.click === 'function') {
                          fileInputRef.current.click();
                        }
                      },
                    },
                    imageGlyph(15),
                    h('span', null, t('addImage')),
                  ),
                  h(
                    'span',
                    { className: 'dsh-notes-characters' },
                    countCharacters(selected.body) + ' ' + t('characters'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-notes-btn dsh-notes-btn--ghost dsh-notes-danger',
                      'data-confirm': pendingDelete === selected.id ? 'true' : 'false',
                      onClick: () => handleDelete(selected),
                    },
                    t(pendingDelete === selected.id ? 'confirmDelete' : 'delete'),
                  ),
                ),
              ),
            )
          : h(
              'section',
              { className: 'dsh-notes-editor' },
              h(
                'div',
                { className: 'dsh-notes-empty' },
                h('div', { className: 'dsh-notes-empty-art' }, notebookGlyph(36)),
                h('p', { className: 'dsh-notes-empty-title' }, t('selectTitle')),
                h('p', { className: 'dsh-notes-empty-hint' }, t('selectHint')),
              ),
            );

        content = h('div', { className: 'dsh-notes-body' }, list, editor);
      }

      return h(
        'div',
        { className: 'dsh-notes-root', ref: rootRef },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        header,
        content,
        preview,
        shareOverlay,
        menuNote
          ? h(
              'div',
              {
                className: 'dsh-notes-menu',
                role: 'menu',
                style: { left: menu.x, top: menu.y },
                onMouseDown: (event) => event.stopPropagation(),
                onContextMenu: (event) => event.preventDefault(),
              },
              h(
                'button',
                {
                  type: 'button',
                  role: 'menuitem',
                  className: 'dsh-notes-menu-item',
                  onClick: () => handleTogglePin(menuNote),
                },
                pinGlyph(14),
                h('span', null, t(menuNote.pinned ? 'unpinNote' : 'pinNote')),
              ),
            )
          : null,
      );
    }

    /* ------------------------------------------------------------------ *
     * Plugin
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);

        // Dictionaries for every language the catalog knows about, plus the
        // tags this bundle ships, so a late-loaded language still resolves.
        ctx.effect(() => {
          const disposers = [];
          const ids = new Set(['en', 'zh', 'zh-Hans', 'zh-CN', 'zh-TW']);
          try {
            for (const locale of ctx.locale.getSnapshot().locales) ids.add(locale.id);
          } catch (err) {
            /* keep the shipped tags */
          }
          for (const id of ids) {
            const dict = String(id).toLowerCase().indexOf('zh') === 0 ? DICTS.zh : DICTS.en;
            try {
              disposers.push(ctx.locale.register(NS, id, dict));
            } catch (err) {
              /* already registered (another copy or a duplicate tag) */
            }
          }
          return () => {
            for (const dispose of disposers.reverse()) {
              try {
                dispose();
              } catch (err) {
                /* ignore */
              }
            }
          };
        }, 'notes-panel-locale');

        // One self-maintained version-log note per plugin. This plugin logs
        // itself, migrates the pre-1.5 single-log note, and accepts descriptors
        // from other plugins either directly (shared sink) or through a queue
        // written before this module loaded.
        currentLang = changelogLang(ctx.locale.getSnapshot().active);
        let versionLogSink = null;
        try {
          const pending =
            typeof window !== 'undefined' && Array.isArray(window.__dshPluginVersionLogQueue)
              ? window.__dshPluginVersionLogQueue.splice(0)
              : [];
          for (const descriptor of pending) registerPluginVersionLog(descriptor);
          registerPluginVersionLog(selfDescriptor());
          dedupeVersionLogNotes(currentLang);
          syncStoredPluginLogs();
          if (typeof window !== 'undefined') {
            versionLogSink = (descriptor) => {
              registerPluginVersionLog(descriptor);
            };
            window.__dshPluginVersionLogSink = versionLogSink;
          }
        } catch (err) {
          /* a broken version log must never block the panel */
        }
        ctx.effect(() => () => {
          if (typeof window === 'undefined') return;
          if (versionLogSink && window.__dshPluginVersionLogSink === versionLogSink) {
            try {
              delete window.__dshPluginVersionLogSink;
            } catch (err) {
              window.__dshPluginVersionLogSink = undefined;
            }
          }
        }, 'notes-panel-version-log');

        // Optional Cordis service for plugins that prefer ctx.get over the
        // shared sink; absence is harmless.
        ctx.effect(() => {
          if (!ctx || typeof ctx.provide !== 'function') return undefined;
          try {
            return ctx.provide('pluginVersionLog', {
              register: (descriptor) => registerPluginVersionLog(descriptor),
            });
          } catch (err) {
            return undefined;
          }
        }, 'notes-panel-version-log-service');

        // 「自驱动迭代」writes 自驱动 release entries into the target plugin's
        // note and maintains aggregate notes. Calls made before this module
        // loaded are queued; drain them once the stores are ready. Both sinks
        // are optional and are removed with the module.
        let selfDrivenSink = null;
        let managedNoteSink = null;
        try {
          drainSelfDrivenLogQueue();
          drainManagedNoteQueue();
          if (typeof window !== 'undefined') {
            selfDrivenSink = { append: (entry) => appendSelfDrivenEntry(entry) };
            managedNoteSink = { upsert: (note) => upsertManagedNote(note) };
            window.__dshSelfDrivenLogSink = selfDrivenSink;
            window.__dshManagedNoteSink = managedNoteSink;
          }
        } catch (err) {
          /* the sinks are optional; never block the panel */
        }
        ctx.effect(() => () => {
          if (typeof window === 'undefined') return;
          if (selfDrivenSink && window.__dshSelfDrivenLogSink === selfDrivenSink) {
            try {
              delete window.__dshSelfDrivenLogSink;
            } catch (err) {
              window.__dshSelfDrivenLogSink = undefined;
            }
          }
          if (managedNoteSink && window.__dshManagedNoteSink === managedNoteSink) {
            try {
              delete window.__dshManagedNoteSink;
            } catch (err) {
              window.__dshManagedNoteSink = undefined;
            }
          }
          // The drained queues are empty; drop the globals too so a later
          // mount starts from a clean queue. A caller that pushes after this
          // recreates the array through its `window.__... || []` pattern.
          for (const key of ['__dshSelfDrivenLogQueue', '__dshManagedNoteQueue']) {
            if (Array.isArray(window[key]) && window[key].length === 0) {
              try {
                delete window[key];
              } catch (err) {
                window[key] = undefined;
              }
            }
          }
        }, 'notes-panel-managed-note-sinks');

        // This plugin owns the notes it stores, so it registers the `notes`
        // Provider with the device-side resource registry: one search and
        // read interface over every plugin that keeps local content.
        ctx.effect(() => registerResourceProvider(createNotesResourceProvider(t)), 'notes-resource-provider');

        const View = (slotProps) =>
          h(NotesPanel, Object.assign({}, slotProps, { t, locale: ctx.locale }));

        const PanelIcon = (slotProps) => h(NotesIcon, slotProps);

        // The main key first: the sidebar button only navigates to a key that
        // is already registered.
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, View),
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 5,
              label: () => t('title'),
            },
            PanelIcon,
          ),
        );
      },
    };
  },
});
