/**
 * Self-driven iteration — Client half.
 *
 * Registers the sidebar entry `selfIteration` and its keyed `main` page, shows
 * the requirements detected by the Host half, and owns the Notes bridge: while
 * this module is loaded (even with the panel closed) it polls the Host state,
 * maintains the aggregate "self-driven iteration requests" note and appends one
 * `自驱动` / `Self-driven` entry per completed iteration to the target plugin's
 * version log.
 *
 * Storage, message scanning and the Agent drive live in the Host half
 * (`index.js` / `logic.js`); this file only talks to the documented
 * `/plugin/self-iteration` HTTP API and to the Notes plugin's `window` sinks.
 */
window.__ModuleLoader__.load({
  id: '@local/self-iteration',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'selfIteration';
    const PANEL_ID = 'selfIteration';
    const PLUGIN_ID = '@local/self-iteration';
    const API_PREFIX = '/plugin/self-iteration';
    const AGGREGATE_KEY = 'self-iteration-requests';

    /* Panel polls while mounted; the background note bridge polls on its own. */
    const PANEL_POLL_MS = 4000;
    const NOTE_SYNC_MS = 8000;
    const NOTE_SYNC_FIRST_MS = 1500;
    /* The Notes half may load after this one; wait before reporting it missing. */
    const SINK_GRACE_MS = 15000;

    /* Timed scan offered by the collapsed settings strip (CONTRACT §1
     * setScanInterval): 0 disables the Host's periodic scan. */
    const DEFAULT_SCAN_INTERVAL_MS = 5000;
    const SCAN_INTERVAL_CHOICES = Object.freeze([
      Object.freeze({ ms: 0, labelKey: 'intervalOff' }),
      Object.freeze({ ms: 5000, labelKey: 'interval5s' }),
      Object.freeze({ ms: 30000, labelKey: 'interval30s' }),
      Object.freeze({ ms: 60000, labelKey: 'interval1m' }),
      Object.freeze({ ms: 300000, labelKey: 'interval5m' }),
    ]);

    /* The simplified panel keeps advanced controls collapsed by default. */
    const PANEL_DEFAULTS = Object.freeze({
      settingsOpen: false,
      composerOpen: false,
      scanIntervalMs: DEFAULT_SCAN_INTERVAL_MS,
    });

    const OFFSET_MINUTES = 8 * 60; // Asia/Shanghai, no DST since 1991.

    /* ------------------------------------------------------------------ *
     * Copy (zh / en). The sidebar label is the literal key `panel.label`
     * because the Client locale service looks keys up as flat dictionary
     * properties (see LocaleRuntime#lookup).
     * ------------------------------------------------------------------ */

    const DICTS = {
      zh: {
        title: '自驱动迭代',
        'panel.label': '自驱动迭代',
        subtitle: '消息反馈 → 迭代需求 → 创造模式 Agent → 自驱动版本记录',
        stateRunning: '运行中',
        stateIdle: '空闲',
        stateDisabled: '已停用',
        autoLabel: '自动迭代',
        autoHint: '检测到需求后自动交给创造模式 Agent 执行',
        dryRunLabel: '试运行',
        dryRunHint: '只生成需求与提示词，不创建会话',
        scanNow: '扫描需求',
        scanHistory: '补扫最近 24 小时',
        scanning: '扫描中…',
        refresh: '刷新',
        refreshHint: '重新读取最新状态',
        settings: '设置',
        settingsHint: '自动迭代、试运行与定时扫描',
        timedScan: '定时扫描',
        scanIntervalHint: '定时自动扫描「消息」里的新反馈',
        intervalOff: '关闭',
        interval5s: '每 5 秒',
        interval30s: '每 30 秒',
        interval1m: '每 1 分钟',
        interval5m: '每 5 分钟',
        intervalEveryPrefix: '每 ',
        intervalSecondUnit: ' 秒',
        intervalMinuteUnit: ' 分钟',
        intervalMsUnit: ' 毫秒',
        addManual: '＋ 手动添加需求',
        composerCollapse: '收起输入框',
        dash: '—',
        composeLabel: '手动创建需求（用于测试）',
        composePlaceholder: '粘贴一条插件反馈，或描述想让哪个插件怎么改…（⌘/Ctrl + Enter 创建）',
        create: '创建需求',
        emptyTitle: '还没有迭代需求',
        emptyHint: '「消息」插件收到与 DSH 插件相关的反馈后，需求会自动出现在这里；也可以在上方手动创建一条。',
        loading: '正在读取自驱动迭代状态…',
        fetchErrorPrefix: '读取状态失败：',
        actionErrorPrefix: '操作失败：',
        notesErrorPrefix: '笔记同步失败：',
        notesUnavailable: '笔记插件尚未加载，记录已加入队列稍后重试',
        lastScan: '最近扫描',
        lastNoteSync: '最近笔记同步',
        never: '从未',
        synced: '已同步',
        failed: '失败',
        entriesSuffix: '条记录',
        statusPending: '待开始',
        statusRunning: '迭代中',
        statusDone: '已完成',
        statusSkipped: '未采纳',
        statusFailed: '失败',
        receivedPrefix: '收到',
        targetPlugin: '目标插件',
        versionLabel: '版本',
        attribution: '自驱动',
        start: '开始迭代',
        retry: '重试',
        dismiss: '忽略',
        remove: '删除',
        openSession: '打开会话',
        runningElapsed: '已运行',
        expand: '展开全文',
        collapse: '收起',
        reasonPrefix: '原因：',
        reasonDismissed: '已忽略',
        reasonNoReport: 'Agent 未上报结果',
        reasonTimeout: '迭代超时',
        reasonUnknown: '未说明',
        labelColon: '：',
        elapsedMinute: ' 分',
        elapsedSecond: ' 秒',
        elapsedHour: ' 小时',
        aggregateTitle: '自驱动迭代需求',
        aggregateIntro: '> 本笔记由「自驱动迭代」插件自动维护。它读取「消息」里收到的插件反馈，生成迭代需求，并交给创造模式的 Agent 完成；每条记录都会同时写进对应插件的版本记录，来源标为「自驱动」。',
        groupInProgress: '进行中',
        groupDone: '已完成',
        groupQueued: '待开始',
        groupNotAdopted: '未采纳',
        noteInProgress: '迭代中',
        noteStarted: '开始',
        noteQueued: '已排队，等待上一次迭代结束',
        noteReasonPrefix: '原因：',
        noteDonePlain: '已完成迭代',
        noteOpenParen: '（',
        noteCloseParen: '）',
        notePluginPrefix: '「',
        notePluginSuffix: '」',
        notePluginVersionGap: '',
      },
      en: {
        title: 'Self-driven Iteration',
        'panel.label': 'Self-driven Iteration',
        subtitle: 'Messages feedback → iteration requests → creation-mode Agent → self-driven version logs',
        stateRunning: 'Running',
        stateIdle: 'Idle',
        stateDisabled: 'Disabled',
        autoLabel: 'Auto iterate',
        autoHint: 'Start the creation-mode Agent automatically when a requirement is detected',
        dryRunLabel: 'Dry run',
        dryRunHint: 'Generate requirements and prompts only; do not create a session',
        scanNow: 'Scan requests',
        scanHistory: 'Scan last 24 hours',
        scanning: 'Scanning…',
        refresh: 'Refresh',
        refreshHint: 'Reload the latest state',
        settings: 'Settings',
        settingsHint: 'Auto iterate, dry run and timed scan',
        timedScan: 'Timed scan',
        scanIntervalHint: 'Automatically scan Messages for new feedback',
        intervalOff: 'Off',
        interval5s: 'Every 5s',
        interval30s: 'Every 30s',
        interval1m: 'Every 1 min',
        interval5m: 'Every 5 min',
        intervalEveryPrefix: 'every ',
        intervalSecondUnit: 's',
        intervalMinuteUnit: ' min',
        intervalMsUnit: 'ms',
        addManual: '+ Add request manually',
        composerCollapse: 'Hide editor',
        dash: '—',
        composeLabel: 'Create a requirement manually (for testing)',
        composePlaceholder: 'Paste plugin feedback, or describe what should change in which plugin… (⌘/Ctrl + Enter to create)',
        create: 'Create requirement',
        emptyTitle: 'No iteration requests yet',
        emptyHint: 'Requests appear automatically when the Messages plugin receives feedback about a DSH plugin; you can also create one manually above.',
        loading: 'Loading self-driven iteration state…',
        fetchErrorPrefix: 'Failed to load state: ',
        actionErrorPrefix: 'Action failed: ',
        notesErrorPrefix: 'Notes sync failed: ',
        notesUnavailable: 'The Notes plugin is not loaded yet; records are queued and will be retried',
        lastScan: 'Last scan',
        lastNoteSync: 'Last note sync',
        never: 'Never',
        synced: 'synced',
        failed: 'failed',
        entriesSuffix: 'entries',
        statusPending: 'Queued',
        statusRunning: 'In progress',
        statusDone: 'Done',
        statusSkipped: 'Not adopted',
        statusFailed: 'Failed',
        receivedPrefix: 'Received',
        targetPlugin: 'Target plugin',
        versionLabel: 'Version',
        attribution: 'Self-driven',
        start: 'Start iteration',
        retry: 'Retry',
        dismiss: 'Dismiss',
        remove: 'Delete',
        openSession: 'Open session',
        runningElapsed: 'Running for',
        expand: 'Show more',
        collapse: 'Show less',
        reasonPrefix: 'Reason: ',
        reasonDismissed: 'Dismissed',
        reasonNoReport: 'The agent reported no result',
        reasonTimeout: 'Iteration timed out',
        reasonUnknown: 'Not specified',
        labelColon: ': ',
        elapsedMinute: 'm',
        elapsedSecond: 's',
        elapsedHour: 'h',
        aggregateTitle: 'Self-driven iteration requests',
        aggregateIntro: '> This note is maintained automatically by the Self-driven Iteration plugin. It reads plugin feedback received in Messages, turns it into iteration requests and hands them to a creation-mode Agent; every result is also written into that plugin\'s version log with the source marked as Self-driven.',
        groupInProgress: 'In progress',
        groupDone: 'Done',
        groupQueued: 'Queued',
        groupNotAdopted: 'Not adopted',
        noteInProgress: 'In progress',
        noteStarted: 'started',
        noteQueued: 'Queued, waiting for the previous iteration to finish',
        noteReasonPrefix: 'Reason: ',
        noteDonePlain: 'Iteration finished',
        noteOpenParen: '(',
        noteCloseParen: ')',
        notePluginPrefix: '"',
        notePluginSuffix: '"',
        notePluginVersionGap: ' ',
      },
    };

    /* ------------------------------------------------------------------ *
     * Release history. Newest first: prepend an entry and bump package.json
     * (and VERSION) when this plugin ships.
     * ------------------------------------------------------------------ */

    const VERSION = '1.0.1';

    const CHANGELOG = [
      {
        version: '1.0.1',
        at: '2026-10-29T21:33+08:00',
        source: 'harness',
        points: {
          zh: [
            '修复：迭代工作区自动探测——不再使用 profile 目录，优先选择真正含 DSH 插件包的工作区，并参考工作区注册表与插件自身源码位置',
            '新增 cancel 动作：可以取消运行中的迭代（取消对应会话，需求记为失败并可重试）',
            '改进：Agent 未上报插件中英文名时，从目标插件的 locale/*.json 自动取显示名，汇总笔记显示「消息」而不是包名',
            '改进：提示词要求按插件安装形态交付——workspace link 直接热更新；tgz 包需要重新打包并用 plugin_manager 安装新包',
          ],
          en: [
            'Fixed: automatic workspace detection for iterations no longer picks the profile directory; it prefers a workspace that actually contains DSH plugin bundles, using the workspace registry and the plugin\'s own source location',
            'Added a cancel action: a running iteration can be cancelled (the Session is cancelled, the requirement is marked failed and can be retried)',
            'Improved: when the Agent omits the target plugin display name, it is read from the target plugin\'s locale/*.json so the aggregate note says 消息 instead of the package name',
            'Improved: the prompt now requires shipping in the plugin\'s installed form — a workspace link hot-reloads, while a tgz release must be rebuilt and installed through plugin_manager',
          ],
        },
      },
      {
        version: '1.0.0',
        at: '2026-10-29T21:20+08:00',
        source: 'harness',
        points: {
          zh: [
            '新增自驱动迭代：扫描「消息」插件收到的反馈，识别与 DSH 插件迭代相关的想法并生成迭代需求',
            '用创造模式（agent preset cordis）的主 Agent 执行迭代，需求按频率限制排队，一次只跑一个',
            '每次迭代完成后把版本记录写进对应插件的笔记，来源标为「自驱动」',
            '把所有自驱动需求汇总到一篇自动维护的笔记（进行中 / 已完成 / 待开始 / 未采纳）',
          ],
          en: [
            'Adds self-driven iteration: scan feedback received in the Messages plugin, recognize plugin-iteration ideas and turn them into iteration requests',
            'Runs iterations with the creation-mode main Agent (agent preset cordis), queueing requests under the rate limit and running one at a time',
            'Writes each iteration result into the target plugin\'s version log with the source marked as Self-driven',
            'Collects every self-driven request in one automatically maintained note (In progress / Done / Queued / Not adopted)',
          ],
        },
      },
    ];

    /* ------------------------------------------------------------------ *
     * Small pure helpers (also exposed through the test seam).
     * ------------------------------------------------------------------ */

    function dictOf(lang) {
      return DICTS[lang === 'zh' ? 'zh' : 'en'];
    }

    /** Resolve the active language from a LocaleFace, a snapshot or a string. */
    function resolveLang(locale) {
      try {
        const snapshot = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : locale;
        const active = snapshot && typeof snapshot.active === 'string'
          ? snapshot.active
          : (typeof snapshot === 'string' ? snapshot : '');
        if (active.toLowerCase().indexOf('zh') === 0) return 'zh';
      } catch (err) {
        /* fall through to English */
      }
      return 'en';
    }

    function messageOf(error) {
      if (error === undefined || error === null) return '';
      if (typeof error === 'string') return error;
      if (typeof error.message === 'string' && error.message !== '') return error.message;
      return String(error);
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value);
    }

    /** Shift a timestamp into the fixed +08:00 wall clock. */
    function offsetDate(input) {
      if (input === undefined || input === null || input === '' || input === 0) return null;
      const date = input instanceof Date ? input : new Date(input);
      if (Number.isNaN(date.getTime())) return null;
      return new Date(date.getTime() + OFFSET_MINUTES * 60000);
    }

    /** Minute-precise ISO timestamp with an explicit offset: 2026-10-29T21:40+08:00. */
    function formatAtMinuteWithOffset(input) {
      const wall = offsetDate(input);
      if (!wall) return '';
      return wall.getUTCFullYear() + '-' + pad2(wall.getUTCMonth() + 1) + '-' + pad2(wall.getUTCDate()) +
        'T' + pad2(wall.getUTCHours()) + ':' + pad2(wall.getUTCMinutes()) + '+08:00';
    }

    /** Short local wall time used inside notes and the panel: 2026-10-29 21:40. */
    function formatNoteTime(input) {
      const wall = offsetDate(input);
      if (!wall) return '';
      return wall.getUTCFullYear() + '-' + pad2(wall.getUTCMonth() + 1) + '-' + pad2(wall.getUTCDate()) +
        ' ' + pad2(wall.getUTCHours()) + ':' + pad2(wall.getUTCMinutes());
    }

    function formatElapsed(ms, lang) {
      const dict = dictOf(lang);
      const totalSeconds = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return hours + dict.elapsedHour + (minutes > 0 ? ' ' + minutes + dict.elapsedMinute : '');
      if (minutes > 0) return minutes + dict.elapsedMinute + (seconds > 0 ? ' ' + seconds + dict.elapsedSecond : '');
      return seconds + dict.elapsedSecond;
    }

    /** The interval the UI should show; tolerate a Host predating the field. */
    function effectiveScanInterval(state) {
      const value = state && state.scanIntervalMs;
      if (Number.isFinite(value) && value >= 0) return value;
      return DEFAULT_SCAN_INTERVAL_MS;
    }

    function scanIntervalOptionKey(ms) {
      for (const choice of SCAN_INTERVAL_CHOICES) {
        if (choice.ms === ms) return choice.labelKey;
      }
      return '';
    }

    /** Human label for a timed-scan interval (0 = off). */
    function formatScanInterval(ms, lang) {
      const dict = dictOf(lang);
      const value = Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_SCAN_INTERVAL_MS;
      const optionKey = scanIntervalOptionKey(value);
      if (optionKey !== '') return dict[optionKey];
      if (value > 0 && value % 60000 === 0) {
        return dict.intervalEveryPrefix + value / 60000 + dict.intervalMinuteUnit;
      }
      if (value > 0 && value % 1000 === 0) {
        return dict.intervalEveryPrefix + value / 1000 + dict.intervalSecondUnit;
      }
      return dict.intervalEveryPrefix + value + dict.intervalMsUnit;
    }

    /** Prevent user text from breaking the Markdown structure of a note. */
    function escapeInline(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/([\\`*_[\]<>])/g, '\\$1')
        .trim();
    }

    function cleanText(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/[\r\n\t]+/g, ' ')
        .trim();
    }

    function localized(value, lang) {
      if (typeof value === 'string') return value;
      if (!value || typeof value !== 'object') return '';
      const preferred = value[lang === 'zh' ? 'zh' : 'en'];
      if (typeof preferred === 'string' && preferred !== '') return preferred;
      if (typeof value.zh === 'string' && value.zh !== '') return value.zh;
      if (typeof value.en === 'string' && value.en !== '') return value.en;
      return '';
    }

    function contactNameOf(requirement) {
      const contact = requirement && requirement.contact;
      if (contact && typeof contact.name === 'string' && contact.name !== '') return contact.name;
      if (contact && typeof contact.id === 'string' && contact.id !== '') return contact.id;
      return '';
    }

    function pluginNameOf(iteration, lang) {
      if (!iteration) return '';
      const named = localized(iteration.pluginName, lang);
      if (named !== '') return named;
      return typeof iteration.pluginId === 'string' && iteration.pluginId !== '' ? iteration.pluginId : '';
    }

    const STATUS_LABEL_KEYS = {
      pending: 'statusPending',
      running: 'statusRunning',
      done: 'statusDone',
      skipped: 'statusSkipped',
      failed: 'statusFailed',
    };

    function statusLabelKey(status) {
      return STATUS_LABEL_KEYS[status] || 'statusPending';
    }

    const STATUS_GROUPS = {
      running: 'inProgress',
      done: 'done',
      pending: 'queued',
      skipped: 'notAdopted',
      failed: 'notAdopted',
    };

    function groupOfStatus(status) {
      return STATUS_GROUPS[status] || 'queued';
    }

    const REASON_LABEL_KEYS = {
      dismissed: 'reasonDismissed',
      'no-report': 'reasonNoReport',
      timeout: 'reasonTimeout',
    };

    function reasonKey(reason) {
      return REASON_LABEL_KEYS[reason] || '';
    }

    function describeReason(reason, lang) {
      const dict = dictOf(lang);
      const key = reasonKey(reason);
      if (key !== '') return dict[key];
      if (typeof reason === 'string' && reason.trim() !== '') return reason;
      return dict.reasonUnknown;
    }

    /** Requirements newest first (defensive copy; the Host already sorts them). */
    function listRequirements(state) {
      const list = state && Array.isArray(state.requirements) ? state.requirements : [];
      return list
        .filter((requirement) => requirement && typeof requirement === 'object')
        .slice()
        .sort((left, right) => {
          const a = Number(left.detectedAt) || 0;
          const b = Number(right.detectedAt) || 0;
          return b - a;
        });
    }

    function requirementKey(requirement) {
      if (!requirement) return '';
      if (typeof requirement.id === 'string' && requirement.id !== '') return requirement.id;
      if (typeof requirement.messageId === 'string' && requirement.messageId !== '') return requirement.messageId;
      return String(requirement.detectedAt || '');
    }

    function isRunningRequirement(requirement) {
      return !!requirement && requirement.status === 'running';
    }

    /**
     * Stable JSON fingerprint of everything the notes care about. `stats` is
     * deliberately excluded: reportNote writes it, and including it would make
     * the sync loop feed itself.
     */
    function stateFingerprint(state) {
      const snapshot = state && typeof state === 'object' ? state : {};
      const requirements = Array.isArray(snapshot.requirements) ? snapshot.requirements : [];
      const running = snapshot.running && typeof snapshot.running === 'object'
        ? [snapshot.running.requirementId, snapshot.running.sessionId, snapshot.running.startedAt]
        : null;
      const compact = {
        enabled: snapshot.enabled === true,
        autoIterate: snapshot.autoIterate === true,
        dryRun: snapshot.dryRun === true,
        running,
        requirements: requirements.map((requirement) => {
          const item = requirement && typeof requirement === 'object' ? requirement : {};
          const iteration = item.iteration && typeof item.iteration === 'object' ? item.iteration : null;
          return [
            item.id,
            item.status,
            item.sessionId,
            item.startedAt,
            item.finishedAt,
            item.reason,
            iteration
              ? [iteration.pluginId, iteration.version, iteration.noteApplied, iteration.recordedAt]
              : null,
          ];
        }),
      };
      try {
        return JSON.stringify(compact);
      } catch (err) {
        return String(Date.now()) + ':' + Math.random();
      }
    }

    /* ------------------------------------------------------------------ *
     * Action / report payload builders.
     * ------------------------------------------------------------------ */

    function buildAction(action, params) {
      const body = Object.assign({ action: String(action) }, params && typeof params === 'object' ? params : {});
      return body;
    }

    function buildNoteReportBody(report) {
      const source = report && typeof report === 'object' ? report : {};
      const payload = {
        at: Number.isFinite(source.at) ? source.at : Date.now(),
        ok: source.ok === true,
        aggregate: source.aggregate === true,
        appliedIds: Array.isArray(source.appliedIds)
          ? source.appliedIds.filter((id) => typeof id === 'string' && id !== '')
          : [],
      };
      if (typeof source.error === 'string' && source.error !== '') payload.error = source.error;
      return { action: 'reportNote', report: payload };
    }

    /* ------------------------------------------------------------------ *
     * Aggregate note (§4 of CONTRACT.md).
     * ------------------------------------------------------------------ */

    function buildAggregateItem(requirement, lang, dict) {
      const lines = [];
      const meta = [];
      const contact = contactNameOf(requirement);
      if (contact !== '') meta.push(contact);
      const received = formatNoteTime(requirement.receivedAt || requirement.detectedAt);
      if (received !== '') meta.push(received);
      const title = escapeInline(requirement.title || requirement.text || requirement.id || '');
      const parens = meta.length > 0
        ? dict.noteOpenParen + meta.join(' · ') + dict.noteCloseParen
        : '';
      lines.push('- **' + title + '**' + parens);

      const iteration = requirement.iteration && typeof requirement.iteration === 'object'
        ? requirement.iteration
        : null;

      if (requirement.status === 'running') {
        const sessionId = typeof requirement.sessionId === 'string' ? requirement.sessionId : '';
        const startedAt = formatNoteTime(requirement.startedAt || 0);
        let detail = dict.noteInProgress;
        if (sessionId !== '') detail += (lang === 'zh' ? '：' : ': ') + sessionId;
        if (startedAt !== '') {
          detail += ' · ' + (lang === 'zh' ? startedAt + ' ' + dict.noteStarted : dict.noteStarted + ' ' + startedAt);
        }
        lines.push('  - ' + detail);
      } else if (requirement.status === 'done') {
        if (iteration) {
          const parts = [];
          const target = pluginNameOf(iteration, lang);
          const version = typeof iteration.version === 'string' && iteration.version !== ''
            ? 'v' + iteration.version
            : '';
          const head = target !== ''
            ? dict.notePluginPrefix + target + dict.notePluginSuffix + dict.notePluginVersionGap + version
            : version;
          if (head !== '') parts.push(head);
          const recorded = formatNoteTime(iteration.recordedAt || requirement.finishedAt || requirement.detectedAt);
          if (recorded !== '') parts.push(recorded);
          parts.push(dict.attribution);
          lines.push('  - ' + parts.join(' · '));
          const summary = cleanText(localized(iteration.summary, lang));
          if (summary !== '') lines.push('  - ' + summary);
        } else {
          lines.push('  - ' + dict.noteDonePlain);
        }
      } else if (requirement.status === 'pending') {
        lines.push('  - ' + dict.noteQueued);
      } else {
        lines.push('  - ' + dict.noteReasonPrefix + describeReason(requirement.reason, lang));
      }
      return lines;
    }

    function buildAggregateNote(state, lang) {
      const locale = lang === 'zh' ? 'zh' : 'en';
      const dict = DICTS[locale];
      const requirements = listRequirements(state);
      const lines = ['# ' + dict.aggregateTitle, '', dict.aggregateIntro];
      const groups = [
        { key: 'groupInProgress', statuses: ['running'] },
        { key: 'groupDone', statuses: ['done'] },
        { key: 'groupQueued', statuses: ['pending'] },
        { key: 'groupNotAdopted', statuses: ['skipped', 'failed'] },
      ];
      for (const group of groups) {
        const items = requirements.filter((requirement) => group.statuses.indexOf(requirement.status) >= 0);
        if (items.length === 0) continue;
        lines.push('', '## ' + dict[group.key]);
        for (const requirement of items) {
          const itemLines = buildAggregateItem(requirement, locale, dict);
          for (const line of itemLines) lines.push(line);
        }
      }
      return lines.join('\n') + '\n';
    }

    function buildAggregateNotePayload(state, lang) {
      const locale = lang === 'zh' ? 'zh' : 'en';
      return {
        key: AGGREGATE_KEY,
        title: DICTS[locale].aggregateTitle,
        body: buildAggregateNote(state, locale),
      };
    }

    /* ------------------------------------------------------------------ *
     * Notes sinks and background sync.
     * ------------------------------------------------------------------ */

    function pendingSelfDrivenRequirements(state) {
      return listRequirements(state).filter((requirement) => {
        if (!requirement.iteration || typeof requirement.iteration !== 'object') return false;
        if (requirement.iteration.noteApplied === true) return false;
        return typeof requirement.id === 'string' && requirement.id !== '';
      });
    }

    /** One appendable `自驱动` version-log entry for the target plugin. */
    function buildSelfDrivenEntry(requirement, lang) {
      const locale = lang === 'zh' ? 'zh' : 'en';
      const iteration = requirement && requirement.iteration && typeof requirement.iteration === 'object'
        ? requirement.iteration
        : {};
      const points = iteration.points && typeof iteration.points === 'object' ? iteration.points : {};
      const zh = Array.isArray(points.zh) ? points.zh.filter((point) => typeof point === 'string') : [];
      const en = Array.isArray(points.en) ? points.en.filter((point) => typeof point === 'string') : [];
      const pluginName = iteration.pluginName && typeof iteration.pluginName === 'object'
        ? {
            zh: localized(iteration.pluginName, 'zh'),
            en: localized(iteration.pluginName, 'en'),
          }
        : { zh: '', en: '' };
      return {
        pluginId: typeof iteration.pluginId === 'string' ? iteration.pluginId : '',
        pluginName,
        version: typeof iteration.version === 'string' ? iteration.version : '',
        at: formatAtMinuteWithOffset(
          iteration.recordedAt || (requirement && requirement.finishedAt) || Date.now(),
        ),
        points: { zh: zh.slice(0, 4), en: en.slice(0, 4) },
        requirementId: requirement && typeof requirement.id === 'string' ? requirement.id : '',
      };
    }

    function readSinks(host) {
      const scope = host && typeof host === 'object' ? host : {};
      const managed = scope.__dshManagedNoteSink;
      const selfDriven = scope.__dshSelfDrivenLogSink;
      return {
        managedNote: managed && typeof managed.upsert === 'function' ? managed : null,
        selfDrivenLog: selfDriven && typeof selfDriven.append === 'function' ? selfDriven : null,
      };
    }

    function sinksAvailable(host) {
      const sinks = readSinks(host);
      return !!(sinks.managedNote || sinks.selfDrivenLog);
    }

    function pushQueue(host, name, value) {
      try {
        const scope = host && typeof host === 'object' ? host : {};
        let queue = scope[name];
        if (!Array.isArray(queue)) {
          queue = [];
          scope[name] = queue;
        }
        queue.push(value);
      } catch (err) {
        /* A frozen/hostile window must never break the sync loop. */
      }
    }

    function resultError(result, fallback) {
      return result && typeof result.error === 'string' && result.error !== '' ? result.error : fallback;
    }

    /**
     * Run one note-sync pass. Pure with respect to the supplied `host`, so the
     * unit tests can drive it without a browser. Never throws: a missing Notes
     * plugin degrades to queueing plus `ok:false, error:'notes-unavailable'`.
     */
    function runNoteSync(state, lang, host) {
      const locale = lang === 'zh' ? 'zh' : 'en';
      const scope = host && typeof host === 'object' ? host : {};
      const report = { at: 0, ok: true, aggregate: false, appliedIds: [] };
      const errors = [];
      const sinks = readSinks(scope);
      const aggregatePayload = buildAggregateNotePayload(state, locale);
      const pending = pendingSelfDrivenRequirements(state);

      if (!sinks.managedNote && !sinks.selfDrivenLog) {
        pushQueue(scope, '__dshManagedNoteQueue', aggregatePayload);
        for (const requirement of pending) {
          pushQueue(scope, '__dshSelfDrivenLogQueue', buildSelfDrivenEntry(requirement, locale));
        }
        report.ok = false;
        report.error = 'notes-unavailable';
        return report;
      }

      if (sinks.managedNote) {
        try {
          const result = sinks.managedNote.upsert(aggregatePayload);
          if (result && result.ok === true) report.aggregate = true;
          else errors.push(resultError(result, 'managed-note'));
        } catch (err) {
          errors.push(messageOf(err) || 'managed-note');
        }
      } else {
        pushQueue(scope, '__dshManagedNoteQueue', aggregatePayload);
        errors.push('notes-unavailable');
      }

      for (const requirement of pending) {
        const entry = buildSelfDrivenEntry(requirement, locale);
        if (sinks.selfDrivenLog) {
          try {
            const result = sinks.selfDrivenLog.append(entry);
            if (result && result.ok === true) report.appliedIds.push(requirement.id);
            else errors.push(resultError(result, 'self-driven-log'));
          } catch (err) {
            errors.push(messageOf(err) || 'self-driven-log');
          }
        } else {
          pushQueue(scope, '__dshSelfDrivenLogQueue', entry);
          errors.push('notes-unavailable');
        }
      }

      if (errors.length > 0) {
        report.ok = false;
        report.error = errors[0];
      }
      return report;
    }

    /* ------------------------------------------------------------------ *
     * HTTP transport (same-origin; the Host half owns the routes).
     * ------------------------------------------------------------------ */

    async function readJson(response) {
      if (!response || typeof response !== 'object') throw new Error('no-response');
      let data = null;
      try {
        data = await response.json();
      } catch (err) {
        data = null;
      }
      if (response.ok === false) {
        const detail = data && typeof data.error === 'string' && data.error !== ''
          ? data.error
          : 'HTTP ' + response.status;
        throw new Error(detail);
      }
      if (!data || data.ok !== true) {
        throw new Error(data && typeof data.error === 'string' && data.error !== '' ? data.error : 'request-failed');
      }
      return data;
    }

    async function fetchState() {
      const response = await fetch(API_PREFIX + '/state', {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await readJson(response);
      if (!data.state || typeof data.state !== 'object') throw new Error('invalid-state');
      return data.state;
    }

    async function postAction(body) {
      const response = await fetch(API_PREFIX + '/action', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return readJson(response);
    }

    /* ------------------------------------------------------------------ *
     * Workspace helpers.
     * ------------------------------------------------------------------ */

    function serviceOf(ctx, name) {
      try {
        const value = ctx && typeof ctx.get === 'function' ? ctx.get(name) : undefined;
        if (value !== undefined) return value;
      } catch (err) {
        /* fall through to the property form */
      }
      return ctx ? ctx[name] : undefined;
    }

    /** Reveal a session; tolerate a missing uiWorkspace / layout service. */
    function openSessionInWorkspace(ctx, sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return false;
      const workspace = serviceOf(ctx, 'uiWorkspace');
      if (workspace && typeof workspace.openSession === 'function') {
        const attempts = [
          // Other workspace plugins call openSession(sessionId); newer shells
          // also accept the object form. Try both and tolerate neither.
          () => workspace.openSession(sessionId),
          () => workspace.openSession({ kind: 'session', sessionId }),
        ];
        for (const attempt of attempts) {
          try {
            if (attempt() !== false) return true;
          } catch (err) {
            /* try the next calling convention */
          }
        }
      }
      const layout = serviceOf(ctx, 'layout');
      if (layout && typeof layout.selectPanel === 'function') {
        try {
          layout.selectPanel(null);
          return true;
        } catch (err) {
          /* no way to reveal it */
        }
      }
      return false;
    }

    /* ------------------------------------------------------------------ *
     * Panel UI.
     * ------------------------------------------------------------------ */

    function iterationGlyph(size) {
      const edge = typeof size === 'number' && size > 0 ? size : 20;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: edge,
          height: edge,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', { d: 'M18.75 8.1A7.8 7.8 0 1 0 19.7 13.35' }),
        h('path', { d: 'M17.4 14.1 19.7 13.35 19 11' }),
        h('path', { d: 'M12 8l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z', fill: 'currentColor', stroke: 'none' }),
      );
    }

    /** Small magnifier used by the header's single manual-scan button. */
    function scanGlyph(size) {
      const edge = typeof size === 'number' && size > 0 ? size : 16;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: edge,
          height: edge,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('circle', { cx: 10.6, cy: 10.6, r: 5.6 }),
        h('path', { d: 'M14.8 14.8 19.2 19.2' }),
      );
    }

    /** Small gear used by the header's settings toggle. */
    function settingsGlyph(size) {
      const edge = typeof size === 'number' && size > 0 ? size : 16;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: edge,
          height: edge,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('circle', { cx: 12, cy: 12, r: 3.1 }),
        h('path', { d: 'M12 2.9v2.3M12 18.8v2.3M2.9 12h2.3M18.8 12h2.3M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6' }),
      );
    }

    function SelfIterationIcon(props) {
      const size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 20;
      const active = !!(props && props.active);
      return h(
        'span',
        {
          className: 'dsh-si-panel-icon',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: active
              ? 'var(--dsw-alias-label-primary)'
              : 'var(--dsw-alias-label-secondary)',
          },
        },
        iterationGlyph(size),
      );
    }

    function useLocaleRevision(locale) {
      const [, setRevision] = React.useState(0);
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined;
        try {
          const dispose = locale.subscribe(() => setRevision((revision) => revision + 1));
          return typeof dispose === 'function' ? dispose : undefined;
        } catch (err) {
          return undefined;
        }
      }, [locale]);
    }

    function Switch(props) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.checked === true,
          className: 'dsh-si-toggle',
          title: props.hint,
          disabled: props.disabled === true || props.busy === true,
          onClick: props.onToggle,
        },
        h(
          'span',
          { className: 'dsh-si-toggle-track', 'aria-hidden': true },
          h('span', { className: 'dsh-si-toggle-thumb' }),
        ),
        h('span', { className: 'dsh-si-toggle-label' }, props.label),
      );
    }

    function StatusChip(props) {
      return h(
        'span',
        { className: 'dsh-si-chip', 'data-status': props.status },
        props.label,
      );
    }

    function IterationDetail(props) {
      const iteration = props.iteration;
      const t = props.t;
      const lang = props.lang;
      if (!iteration) return null;
      const target = pluginNameOf(iteration, lang);
      const summary = cleanText(localized(iteration.summary, lang));
      return h(
        'div',
        { className: 'dsh-si-iter' },
        h(
          'div',
          { className: 'dsh-si-iter-head' },
          target !== ''
            ? h('span', { className: 'dsh-si-iter-target' }, t('targetPlugin') + t('labelColon') + target)
            : null,
          typeof iteration.version === 'string' && iteration.version !== ''
            ? h('span', null, t('versionLabel') + t('labelColon') + 'v' + iteration.version)
            : null,
          h('span', { className: 'dsh-si-attrib' }, t('attribution')),
        ),
        summary !== '' ? h('p', { className: 'dsh-si-iter-summary' }, summary) : null,
      );
    }

    function RequirementActionButton(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-si-btn dsh-si-btn--small' + (props.className ? ' ' + props.className : ''),
          disabled: props.disabled === true,
          onClick: props.onClick,
        },
        props.label,
      );
    }

    function RequirementCard(props) {
      const requirement = props.requirement;
      const t = props.t;
      const lang = props.lang;
      const busy = props.busy || {};
      const key = requirementKey(requirement);
      const status = typeof requirement.status === 'string' ? requirement.status : 'pending';
      const text = typeof requirement.text === 'string' ? requirement.text : '';
      const contact = contactNameOf(requirement);
      const received = formatNoteTime(requirement.receivedAt || requirement.detectedAt);
      const meta = [];
      if (contact !== '') meta.push(contact);
      if (received !== '') meta.push(t('receivedPrefix') + ' ' + received);

      const runningState = props.runningState;
      const running = status === 'running';
      const sessionId = typeof requirement.sessionId === 'string' && requirement.sessionId !== ''
        ? requirement.sessionId
        : (running && runningState && runningState.requirementId === key && typeof runningState.sessionId === 'string'
            ? runningState.sessionId
            : '');
      const startedAt = Number(requirement.startedAt) > 0
        ? Number(requirement.startedAt)
        : (running && runningState && runningState.requirementId === key ? Number(runningState.startedAt) : 0);

      const actions = [];
      if (status === 'pending') {
        actions.push(h(RequirementActionButton, {
          key: 'start',
          className: 'dsh-si-btn--primary',
          label: t('start'),
          disabled: busy['start:' + key] === true,
          onClick: () => props.onStart(requirement),
        }));
        actions.push(h(RequirementActionButton, {
          key: 'dismiss',
          label: t('dismiss'),
          disabled: busy['dismiss:' + key] === true,
          onClick: () => props.onDismiss(requirement),
        }));
        actions.push(h(RequirementActionButton, {
          key: 'remove',
          className: 'dsh-si-btn--danger',
          label: t('remove'),
          disabled: busy['remove:' + key] === true,
          onClick: () => props.onRemove(requirement),
        }));
      } else if (running) {
        if (startedAt > 0) {
          actions.push(h(
            'span',
            { key: 'elapsed', className: 'dsh-si-elapsed' },
            t('runningElapsed') + ' ' + formatElapsed(Date.now() - startedAt, lang),
          ));
        }
        if (sessionId !== '') {
          actions.push(h(RequirementActionButton, {
            key: 'open',
            label: t('openSession'),
            onClick: () => props.onOpenSession(sessionId),
          }));
        }
      } else if (status === 'done') {
        if (sessionId !== '') {
          actions.push(h(RequirementActionButton, {
            key: 'open',
            label: t('openSession'),
            onClick: () => props.onOpenSession(sessionId),
          }));
        }
        actions.push(h(RequirementActionButton, {
          key: 'remove',
          className: 'dsh-si-btn--danger',
          label: t('remove'),
          disabled: busy['remove:' + key] === true,
          onClick: () => props.onRemove(requirement),
        }));
      } else {
        actions.push(h(RequirementActionButton, {
          key: 'retry',
          label: t('retry'),
          disabled: busy['start:' + key] === true,
          onClick: () => props.onStart(requirement),
        }));
        actions.push(h(RequirementActionButton, {
          key: 'remove',
          className: 'dsh-si-btn--danger',
          label: t('remove'),
          disabled: busy['remove:' + key] === true,
          onClick: () => props.onRemove(requirement),
        }));
      }

      const reason = status === 'failed' || status === 'skipped'
        ? h('div', { className: 'dsh-si-reason' }, t('reasonPrefix') + describeReason(requirement.reason, lang))
        : null;

      const longText = text.length > 150;
      const textNode = text !== ''
        ? h('p', { className: 'dsh-si-text', 'data-expanded': props.expanded === true ? 'true' : 'false' }, text)
        : null;
      const textToggle = longText
        ? h('button', {
            type: 'button',
            className: 'dsh-si-text-toggle',
            onClick: () => props.onToggleExpand(key),
          }, props.expanded === true ? t('collapse') : t('expand'))
        : null;

      return h(
        'article',
        { className: 'dsh-si-card', 'data-status': status },
        h(
          'div',
          { className: 'dsh-si-card-head' },
          h('h2', { className: 'dsh-si-card-title' }, requirement.title || requirement.id || ''),
          h(StatusChip, { status, label: t(statusLabelKey(status)) }),
        ),
        meta.length > 0 ? h('div', { className: 'dsh-si-meta' }, meta.join(' · ')) : null,
        textNode,
        textToggle,
        h(IterationDetail, { iteration: requirement.iteration, t, lang }),
        reason,
        actions.length > 0 ? h('div', { className: 'dsh-si-actions' }, actions) : null,
      );
    }

    function SelfIterationPanel(props) {
      const t = props.t;
      const ctx = props.ctx;
      const locale = props.locale || (ctx && ctx.locale);
      const lang = resolveLang(locale);
      useLocaleRevision(locale);

      const [state, setState] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [fetchError, setFetchError] = React.useState('');
      const [actionError, setActionError] = React.useState('');
      const [busy, setBusy] = React.useState({});
      const [draft, setDraft] = React.useState('');
      const [expanded, setExpanded] = React.useState({});
      /* The simplified panel: advanced controls and the manual composer are
       * collapsed behind their own small entries by default. */
      const [settingsOpen, setSettingsOpen] = React.useState(PANEL_DEFAULTS.settingsOpen);
      const [composerOpen, setComposerOpen] = React.useState(PANEL_DEFAULTS.composerOpen);
      const aliveRef = React.useRef(true);
      const busyRef = React.useRef({});

      const refresh = React.useCallback(async () => {
        try {
          const next = await fetchState();
          if (!aliveRef.current) return;
          setState(next);
          setFetchError('');
        } catch (err) {
          if (!aliveRef.current) return;
          setFetchError(messageOf(err));
        } finally {
          if (aliveRef.current) setLoading(false);
        }
      }, []);

      React.useEffect(() => {
        aliveRef.current = true;
        void refresh();
        const timer = setInterval(() => { void refresh(); }, PANEL_POLL_MS);
        return () => {
          aliveRef.current = false;
          clearInterval(timer);
        };
      }, [refresh]);

      const runAction = React.useCallback(async (key, body, onSuccess) => {
        if (busyRef.current[key] === true) return;
        busyRef.current[key] = true;
        setBusy((previous) => Object.assign({}, previous, { [key]: true }));
        setActionError('');
        try {
          if (body) await postAction(body);
          if (typeof onSuccess === 'function') onSuccess();
          await refresh();
        } catch (err) {
          if (aliveRef.current) setActionError(messageOf(err));
        } finally {
          delete busyRef.current[key];
          if (aliveRef.current) {
            setBusy((previous) => {
              const next = Object.assign({}, previous);
              delete next[key];
              return next;
            });
          }
        }
      }, [refresh]);

      const requirements = listRequirements(state);
      const runningRequirement = requirements.filter(isRunningRequirement)[0];
      const statusKey = !state
        ? 'idle'
        : state.enabled === false
          ? 'disabled'
          : (state.running || runningRequirement)
            ? 'running'
            : 'idle';
      const stateLabel = statusKey === 'running'
        ? t('stateRunning')
        : statusKey === 'disabled'
          ? t('stateDisabled')
          : t('stateIdle');

      const toggleAuto = () => {
        if (!state || busyRef.current.auto === true) return;
        void runAction('auto', buildAction('setAuto', { enabled: !state.autoIterate }));
      };
      const toggleDryRun = () => {
        if (!state || busyRef.current.dryRun === true) return;
        void runAction('dryRun', buildAction('setDryRun', { enabled: !state.dryRun }));
      };
      const scanNow = () => {
        if (!state || busyRef.current.scan === true) return;
        void runAction('scan', buildAction('scan'));
      };
      const scanHistory = () => {
        if (!state || busyRef.current.scanHistory === true) return;
        void runAction('scanHistory', buildAction('scanHistory', { hours: 24 }));
      };
      const reload = () => { void runAction('refresh', null); };
      const submitDraft = () => {
        const text = draft.trim();
        if (text === '' || busyRef.current.create === true) return;
        void runAction('create', buildAction('createFromText', { text }), () => setDraft(''));
      };
      const startRequirement = (requirement) => {
        void runAction('start:' + requirementKey(requirement), buildAction('start', { id: requirement.id }));
      };
      const dismissRequirement = (requirement) => {
        void runAction('dismiss:' + requirementKey(requirement), buildAction('dismiss', { id: requirement.id }));
      };
      const removeRequirement = (requirement) => {
        void runAction('remove:' + requirementKey(requirement), buildAction('remove', { id: requirement.id }));
      };
      const toggleExpanded = (key) => {
        setExpanded((previous) => Object.assign({}, previous, { [key]: !previous[key] }));
      };
      const changeScanInterval = (ms) => {
        if (!state || busyRef.current.interval === true) return;
        void runAction('interval', buildAction('setScanInterval', { ms }));
      };

      const header = h(
        'header',
        { className: 'dsh-si-header', title: t('subtitle') },
        h('span', { className: 'dsh-si-mark', 'aria-hidden': true }, iterationGlyph(16)),
        h(
          'div',
          { className: 'dsh-si-heading' },
          h('h1', { className: 'dsh-si-title' }, t('title')),
        ),
        h(
          'span',
          { className: 'dsh-si-state', title: stateLabel },
          h('span', { className: 'dsh-si-dot', 'data-state': statusKey, 'aria-hidden': true }),
          stateLabel,
        ),
        h(
          'div',
          { className: 'dsh-si-header-actions' },
          h('button', {
            type: 'button',
            className: 'dsh-si-btn dsh-si-btn--primary',
            disabled: !state || busy.scan === true,
            onClick: scanNow,
          }, scanGlyph(13), busy.scan === true ? t('scanning') : t('scanNow')),
          h('button', {
            type: 'button',
            className: 'dsh-si-icon-btn',
            title: t('settingsHint'),
            'aria-label': t('settings'),
            'aria-expanded': settingsOpen === true,
            'aria-controls': 'dsh-si-settings',
            onClick: () => setSettingsOpen((previous) => !previous),
          }, settingsGlyph(15)),
        ),
      );

      const scanIntervalMs = effectiveScanInterval(state);
      const intervalChoices = SCAN_INTERVAL_CHOICES.map((choice) =>
        h('button', {
          key: choice.ms,
          type: 'button',
          role: 'radio',
          'aria-checked': scanIntervalMs === choice.ms,
          'aria-label': t('timedScan') + t('labelColon') + formatScanInterval(choice.ms, lang),
          className: 'dsh-si-choice',
          disabled: !state || busy.interval === true,
          onClick: () => changeScanInterval(choice.ms),
        }, formatScanInterval(choice.ms, lang)));

      // The advanced controls live behind the gear and start collapsed; the
      // header itself keeps only the status dot and the one manual scan button.
      const settings = settingsOpen
        ? h(
            'section',
            { className: 'dsh-si-settings', id: 'dsh-si-settings' },
            h(
              'div',
              { className: 'dsh-si-settings-row' },
              h(Switch, {
                label: t('autoLabel'),
                hint: t('autoHint'),
                checked: !!(state && state.autoIterate),
                disabled: !state,
                busy: busy.auto === true,
                onToggle: toggleAuto,
              }),
              h(Switch, {
                label: t('dryRunLabel'),
                hint: t('dryRunHint'),
                checked: !!(state && state.dryRun),
                disabled: !state,
                busy: busy.dryRun === true,
                onToggle: toggleDryRun,
              }),
            ),
            h(
              'div',
              { className: 'dsh-si-settings-row' },
              h('span', { className: 'dsh-si-settings-label' }, t('timedScan')),
              h('div', { className: 'dsh-si-choices', role: 'radiogroup', 'aria-label': t('timedScan') }, intervalChoices),
              h('span', { className: 'dsh-si-settings-hint' }, t('scanIntervalHint')),
            ),
            h(
              'div',
              { className: 'dsh-si-settings-row' },
              h('button', {
                type: 'button',
                className: 'dsh-si-btn dsh-si-btn--small',
                disabled: !state || busy.scanHistory === true,
                onClick: scanHistory,
              }, busy.scanHistory === true ? t('scanning') : t('scanHistory')),
              h('button', {
                type: 'button',
                className: 'dsh-si-btn dsh-si-btn--small dsh-si-btn--ghost',
                title: t('refreshHint'),
                'aria-label': t('refresh'),
                disabled: busy.refresh === true,
                onClick: reload,
              }, t('refresh')),
            ),
          )
        : null;

      // Manual creation stays collapsed into one small line until the user
      // needs it, keeping the panel body focused on the requirement list.
      const compose = composerOpen
        ? h(
            'section',
            { className: 'dsh-si-compose', id: 'dsh-si-compose' },
            h('textarea', {
              className: 'dsh-si-textarea',
              rows: 2,
              value: draft,
              placeholder: t('composePlaceholder'),
              'aria-label': t('composeLabel'),
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  submitDraft();
                }
              },
            }),
            h(
              'div',
              { className: 'dsh-si-compose-actions' },
              h('button', {
                type: 'button',
                className: 'dsh-si-btn dsh-si-btn--primary',
                disabled: draft.trim() === '' || busy.create === true,
                onClick: submitDraft,
              }, t('create')),
              h('button', {
                type: 'button',
                className: 'dsh-si-btn dsh-si-btn--ghost',
                onClick: () => setComposerOpen(false),
              }, t('composerCollapse')),
            ),
          )
        : h('button', {
            type: 'button',
            className: 'dsh-si-compose-entry',
            'aria-expanded': false,
            'aria-controls': 'dsh-si-compose',
            onClick: () => setComposerOpen(true),
          }, t('addManual'));

      const banners = [];
      if (fetchError !== '') banners.push(t('fetchErrorPrefix') + fetchError);
      if (actionError !== '') banners.push(t('actionErrorPrefix') + actionError);
      const noteSync = state && state.stats && state.stats.noteSync && typeof state.stats.noteSync === 'object'
        ? state.stats.noteSync
        : null;
      if (noteSync && noteSync.ok === false) {
        const detail = noteSync.error === 'notes-unavailable'
          ? t('notesUnavailable')
          : (typeof noteSync.error === 'string' && noteSync.error !== '' ? noteSync.error : t('reasonUnknown'));
        banners.push(t('notesErrorPrefix') + detail);
      }
      const banner = banners.length > 0
        ? h(
            'div',
            { className: 'dsh-si-banner', role: 'status' },
            banners.map((line, index) => h('div', { key: index, className: 'dsh-si-banner-line' }, line)),
          )
        : null;

      let listContent;
      if (loading && !state) {
        listContent = h('div', { className: 'dsh-si-loading' }, t('loading'));
      } else if (requirements.length === 0) {
        listContent = h(
          'div',
          { className: 'dsh-si-empty' },
          h('span', { className: 'dsh-si-empty-art', 'aria-hidden': true }, iterationGlyph(28)),
          h('div', { className: 'dsh-si-empty-title' }, t('emptyTitle')),
          h('div', { className: 'dsh-si-empty-hint' }, t('emptyHint')),
        );
      } else {
        listContent = requirements.map((requirement) => {
          const key = requirementKey(requirement);
          return h(RequirementCard, {
            key,
            requirement,
            t,
            lang,
            busy,
            runningState: state && state.running,
            expanded: expanded[key] === true,
            onToggleExpand: toggleExpanded,
            onStart: startRequirement,
            onDismiss: dismissRequirement,
            onRemove: removeRequirement,
            onOpenSession: (sessionId) => { openSessionInWorkspace(ctx, sessionId); },
          });
        });
      }

      const stats = state && state.stats && typeof state.stats === 'object' ? state.stats : {};
      const scanTime = formatNoteTime(stats.lastScanAt);
      let syncText = t('never');
      let syncBad = false;
      if (noteSync) {
        const applied = Array.isArray(noteSync.appliedIds) ? noteSync.appliedIds.length : 0;
        const at = formatNoteTime(noteSync.at);
        const result = noteSync.ok === true
          ? t('synced') + (applied > 0 ? ' ' + applied + ' ' + t('entriesSuffix') : '')
          : t('failed');
        syncText = (at !== '' ? at + ' · ' : '') + result;
        syncBad = noteSync.ok !== true;
      }
      const footer = h(
        'footer',
        { className: 'dsh-si-footer' },
        h(
          'span',
          { className: 'dsh-si-footer-item' },
          t('timedScan') + t('labelColon') + (state ? formatScanInterval(scanIntervalMs, lang) : t('dash')),
        ),
        h('span', { className: 'dsh-si-footer-item' }, t('lastScan') + t('labelColon') + (scanTime !== '' ? scanTime : t('never'))),
        h(
          'span',
          { className: 'dsh-si-footer-item' + (syncBad ? ' dsh-si-footer-bad' : '') },
          t('lastNoteSync') + t('labelColon') + syncText,
        ),
      );

      return h(
        'div',
        { className: 'dsh-si-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        header,
        settings,
        banner,
        compose,
        h('div', { className: 'dsh-si-list' }, listContent),
        footer,
      );
    }

    /* ------------------------------------------------------------------ *
     * Styles: theme tokens only, so light/dark is inherited from the shell.
     * Rendered as a <style> element by the panel; unmounting removes it.
     * ------------------------------------------------------------------ */

    const CSS = [
      '.dsh-si-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5}',
      '.dsh-si-header{display:flex;align-items:center;gap:12px;flex:0 0 auto;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-si-mark{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 auto;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}',
      '.dsh-si-heading{flex:1 1 auto;min-width:0}',
      '.dsh-si-title{margin:0;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-si-state{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;padding:3px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);font-size:11.5px;line-height:1.4;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-si-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-state-idle-primary)}',
      '.dsh-si-dot[data-state="running"]{background:var(--dsw-alias-state-success-primary)}',
      '.dsh-si-dot[data-state="disabled"]{background:var(--dsw-alias-state-error-primary)}',
      '.dsh-si-header-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}',
      '.dsh-si-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:0 0 auto;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .15s ease,border-color .15s ease,color .15s ease}',
      '.dsh-si-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dsh-si-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-si-icon-btn[aria-expanded="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-si-settings{display:flex;flex-direction:column;gap:10px;flex:0 0 auto;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}',
      '.dsh-si-settings-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.dsh-si-settings-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-si-settings-hint{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}',
      '.dsh-si-choices{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px}',
      '.dsh-si-choice{display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}',
      '.dsh-si-choice:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dsh-si-choice:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-si-choice[aria-checked="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-si-choice:disabled{opacity:.55;cursor:default}',
      '.dsh-si-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease}',
      '.dsh-si-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-si-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-si-btn:disabled{opacity:.55;cursor:default}',
      '.dsh-si-btn--primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dsh-si-btn--primary:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-si-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-si-btn--ghost:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.dsh-si-btn--danger:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.dsh-si-btn--small{height:26px;padding:0 10px;font-size:12px}',
      '.dsh-si-toggle{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px 0 5px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.dsh-si-toggle:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-si-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-si-toggle:disabled{opacity:.55;cursor:default}',
      '.dsh-si-toggle[aria-checked="true"]{color:var(--dsw-alias-label-primary)}',
      '.dsh-si-toggle-track{position:relative;display:inline-block;width:26px;height:15px;flex:0 0 auto;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);transition:background-color .15s ease,border-color .15s ease}',
      '.dsh-si-toggle-thumb{position:absolute;top:1px;left:1px;width:11px;height:11px;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .15s ease,background-color .15s ease}',
      '.dsh-si-toggle[aria-checked="true"] .dsh-si-toggle-track{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-si-toggle[aria-checked="true"] .dsh-si-toggle-thumb{transform:translateX(11px);background:var(--dsw-alias-bg-base)}',
      '.dsh-si-compose{display:flex;align-items:flex-start;gap:8px;flex:0 0 auto;padding:10px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}',
      '.dsh-si-textarea{flex:1 1 auto;min-height:34px;max-height:96px;box-sizing:border-box;resize:vertical;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.45;outline:none;-webkit-appearance:none;appearance:none}',
      '.dsh-si-textarea::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-si-textarea:focus{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-si-compose-actions{display:flex;flex-direction:column;flex:0 0 auto}',
      '.dsh-si-compose-entry{display:flex;align-items:center;flex:0 0 auto;width:calc(100% - 40px);box-sizing:border-box;height:30px;margin:8px 20px 0;padding:0 10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;text-align:left;cursor:pointer}',
      '.dsh-si-compose-entry:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dsh-si-compose-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-si-banner{display:flex;flex-direction:column;gap:4px;flex:0 0 auto;margin:10px 20px 0;padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:17px}',
      '.dsh-si-banner-line{word-break:break-word}',
      '.dsh-si-list{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 20px}',
      '.dsh-si-card{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px}',
      '.dsh-si-card[data-status="running"]{border-color:var(--dsw-alias-state-business-primary)}',
      '.dsh-si-card-head{display:flex;align-items:flex-start;gap:8px}',
      '.dsh-si-card-title{flex:1 1 auto;min-width:0;margin:0;font-size:13px;font-weight:600;line-height:19px;color:var(--dsw-alias-label-primary);word-break:break-word}',
      '.dsh-si-chip{display:inline-flex;align-items:center;height:19px;padding:0 8px;flex:0 0 auto;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;font-weight:500;line-height:1;white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
      '.dsh-si-chip[data-status="running"]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.dsh-si-chip[data-status="done"]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.dsh-si-chip[data-status="failed"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.dsh-si-chip[data-status="skipped"]{color:var(--dsw-alias-label-tertiary);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-si-meta{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);word-break:break-word}',
      '.dsh-si-text{margin:0;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}',
      '.dsh-si-text[data-expanded="true"]{display:block;-webkit-line-clamp:unset;overflow:visible}',
      '.dsh-si-text-toggle{align-self:flex-start;padding:0;border:none;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.dsh-si-text-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-si-iter{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:8px 10px}',
      '.dsh-si-iter-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-si-iter-target{color:var(--dsw-alias-label-primary);font-weight:500}',
      '.dsh-si-attrib{display:inline-flex;align-items:center;height:17px;padding:0 6px;border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;color:var(--dsw-alias-brand-primary);font-size:10.5px;line-height:1;white-space:nowrap}',
      '.dsh-si-iter-summary{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);word-break:break-word}',
      '.dsh-si-reason{font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-warn-primary);word-break:break-word}',
      '.dsh-si-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:2px}',
      '.dsh-si-elapsed{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-si-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:36px 16px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;color:var(--dsw-alias-label-secondary);text-align:center}',
      '.dsh-si-empty-art{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-brand-primary);opacity:.8}',
      '.dsh-si-empty-title{font-size:13px;font-weight:500;line-height:19px;color:var(--dsw-alias-label-primary)}',
      '.dsh-si-empty-hint{max-width:420px;font-size:12px;line-height:17px}',
      '.dsh-si-loading{padding:32px 16px;text-align:center;font-size:12.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-si-footer{display:flex;flex-wrap:wrap;gap:6px 16px;flex:0 0 auto;padding:8px 20px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}',
      '.dsh-si-footer-bad{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-si-panel-icon{display:inline-flex;align-items:center;justify-content:center}',
    ].join('');

    /* ------------------------------------------------------------------ *
     * Test seam: rewritten by test/client.test.mjs; the running page never
     * sets it, so this statement is inert in production.
     * ------------------------------------------------------------------ */
    const __TEST_SEAM__ = null;

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);

        // Register this plugin's release list with the Notes plugin. The
        // three-step fallback (service → window sink → queue) keeps the
        // registration safe in any load order; see
        // notes-panel/templates/plugin-version-log.js.
        ctx.effect(() => {
          const descriptor = {
            id: PLUGIN_ID,
            title: { zh: DICTS.zh.title, en: DICTS.en.title },
            noteTitle: { zh: '自驱动迭代版本记录', en: 'Self-driven Iteration version log' },
            version: VERSION,
            entries: CHANGELOG,
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
        }, 'self-iteration-version-log');

        // Dictionaries for every known language plus the tags this bundle
        // ships, so a late-registered language still resolves to zh/en.
        ctx.effect(() => {
          const disposers = [];
          const ids = new Set(['en', 'zh', 'zh-Hans', 'zh-CN', 'zh-TW', 'en-US', 'en-GB']);
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
        }, 'self-iteration-locale');

        // Background note bridge: runs even while the panel is closed. State is
        // polled every 8s; the notes are only rewritten when the fingerprint,
        // the available sinks or the active language changed.
        ctx.effect(() => {
          if (typeof window === 'undefined') return undefined;
          const host = window;
          const startedAt = Date.now();
          let stopped = false;
          let working = false;
          let force = true;
          let lastFingerprint = '';
          let lastAvailable = false;
          let lastSyncOk = true;
          let lastPosted = false;
          let deferred = false;
          let lastLang = resolveLang(ctx.locale);
          let localeDispose = undefined;

          const tick = async () => {
            if (stopped || working) return;
            working = true;
            try {
              const state = await fetchState();
              if (stopped) return;
              const lang = resolveLang(ctx.locale);
              const fingerprint = stateFingerprint(state);
              const available = sinksAvailable(host);
              const pastGrace = Date.now() - startedAt >= SINK_GRACE_MS;
              const shouldSync = force ||
                fingerprint !== lastFingerprint ||
                available !== lastAvailable ||
                (deferred && pastGrace) ||
                (!lastSyncOk && available) ||
                (!lastPosted && lastFingerprint !== '');
              force = false;
              if (!shouldSync) return;
              if (!available && !pastGrace) {
                deferred = true;
                lastFingerprint = fingerprint;
                lastAvailable = available;
                return;
              }
              const report = runNoteSync(state, lang, host);
              report.at = Date.now();
              lastFingerprint = fingerprint;
              lastAvailable = available;
              lastSyncOk = report.ok === true;
              lastPosted = false;
              deferred = false;
              try {
                await postAction(buildNoteReportBody(report));
                lastPosted = true;
              } catch (err) {
                /* Host route may not exist yet; retry on a later tick. */
              }
            } catch (err) {
              /* Keep the loop alive; the panel surfaces fetch errors. */
            } finally {
              working = false;
            }
          };

          // Rebuild the aggregate note body in the new language on a switch.
          try {
            if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
              localeDispose = ctx.locale.subscribe(() => {
                if (stopped) return;
                const nextLang = resolveLang(ctx.locale);
                if (nextLang === lastLang) return;
                lastLang = nextLang;
                force = true;
                void tick();
              });
            }
          } catch (err) {
            /* locale service without subscribe: timer-based sync is enough */
          }

          const firstTimer = setTimeout(() => { void tick(); }, NOTE_SYNC_FIRST_MS);
          const interval = setInterval(() => { void tick(); }, NOTE_SYNC_MS);
          return () => {
            stopped = true;
            clearTimeout(firstTimer);
            clearInterval(interval);
            if (typeof localeDispose === 'function') {
              try {
                localeDispose();
              } catch (err) {
                /* ignore */
              }
            }
          };
        }, 'self-iteration-note-sync');

        const View = (slotProps) =>
          h(SelfIterationPanel, Object.assign({}, slotProps, { t, ctx, locale: ctx.locale }));

        const PanelIcon = (slotProps) => h(SelfIterationIcon, slotProps);

        // The main key first: the sidebar button only navigates to a key that
        // already exists.
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, View),
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 8,
              label: () => t('panel.label'),
            },
            PanelIcon,
          ),
        );
      },
    };
  },
});
