/**
 * Chat room — Client half.
 *
 * A message list in the sidebar: the left rail lists people, the main column is
 * the conversation with the selected person. Underneath, every installation has
 * one inbox topic; an add code is that inbox, so adding a contact is a single
 * paste and nobody has to "create" a conversation first. A first message from an
 * unknown sender creates the contact on the receiving side.
 *
 * The Host half owns the relay connections and exposes a same-origin API, so
 * this module only renders state and calls that API.
 */
window.__ModuleLoader__.load({
  id: '@local/chat-room',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'chatRoom';
    const PANEL_ID = 'chatroom';
    const API = '/plugin/chat-room';
    const DEFAULT_RELAY = 'https://ntfy.sh';
    const MAX_TEXT = 2000;
    const PLUGIN_ZIP = 'chat-room-1.11.2.tgz';

    /**
     * The stylesheet is injected once for the whole plugin, not by the panel:
     * the sidebar entry shows an update dot even while the panel is closed,
     * and that dot needs its rules.
     */
    /* The primary button is painted with the theme accent. The text uses the
       colour that is paired with it, so the two always differ. The colour is
       set inline as well, because a stylesheet left over from an earlier
       version would otherwise hide the text. */
    /* The primary button paints itself completely: a raised surface, the
       primary label colour and the accent as a border. Every part is inline,
       so neither an old stylesheet nor a missing theme token can hide the
       label. */
    const PRIMARY_TEXT = {
      background: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-primary)',
      borderColor: 'var(--dsw-alias-brand-primary)',
      fontWeight: 600,
    };

    /* The version of this front-end build. It is shown in the settings, so a
       stale page can be told apart from a current one at a glance. */
    const CLIENT_BUILD = '1.11.2';

    function injectStyles() {
      if (typeof document === 'undefined') return;
      const existing = document.getElementById('dsh-msg-styles');
      if (existing) {
        // A reload must not leave the old rules behind: the page keeps the
        // style element, so its content is replaced instead.
        if (existing.textContent !== CSS) existing.textContent = CSS;
        return;
      }
      const style = document.createElement('style');
      style.id = 'dsh-msg-styles';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    /* ------------------------------------------------------------------ *
     * Copy
     * ------------------------------------------------------------------ */

    const DICTS = {
      zh: {
        title: '消息',
        subtitle: '粘贴添加码就能开始聊天',
        addContact: '添加联系人',
        myCode: '我的添加码',
        myCodeShort: '我的码',
        contactCount: '位联系人',
        searchPlaceholder: '搜索联系人',
        noContactsTitle: '还没有联系人',
        noContactsHint: '点「添加联系人」粘贴对方给你的添加码；把自己的添加码发给对方也可以。',
        noMessages: '还没有消息',
        noMessagesHint: '发第一条消息打个招呼吧',
        selectContact: '选择一个联系人',
        selectContactHint: '从左边点一个联系人开始聊天。',
        composerPlaceholder: '输入消息，Enter 发送，Shift+Enter 换行；粘贴图片可直接发送',
        send: '发送',
        sending: '发送中',
        failed: '发送失败',
        retry: '重试',
        relayOnline: '连接正常',
        relayConnecting: '连接中…',
        relayError: '连接异常',
        relayIdle: '未连接',
        you: '你',
        unreadTitle: '{count} 条新消息',
        selfChat: '我聊',
        selfBadge: '自己',
        selfChatHint: '给自己记一条，只存在这台机器上',
        pin: '置顶',
        unpin: '取消置顶',
        pinned: '已置顶',
        reply: '引用',
        updatedTo: '已更新到',
        reloadHint: '刷新页面后新版本才会显示出来',
        reloadNow: '刷新页面',
        replyingTo: '回复',
        cancelReply: '取消引用',
        jumpToQuoted: '跳到被引用的消息',
        imageBadge: '[图片]',
        attachFailed: '图片没发出去，请重试',
        imageTooLarge: '图片太大了（上限 4 MB）',
        imageView: '查看图片',
        dateToday: '今天',
        dateYesterday: '昨天',
        dateDayBefore: '前天',
        unnamed: '未命名联系人',
        addTitle: '添加联系人',
        addHint: '把对方发给你的添加码粘进来即可，不需要对方先建会话。',
        addCodeLabel: '添加码',
        addCodePlaceholder: '粘贴 DSHCHAT2: 开头的添加码',
        addButton: '添加',
        badCard: '添加码无效，请确认完整复制',
        ownCode: '这是你自己的添加码，发给对方即可',
        tooMany: '联系人数量已达上限（30 个）',
        info: '编辑',
        contactInfo: '编辑',
        renameLabel: '备注名',
        namePlaceholder: '比如：小明',
        save: '保存',
        cancel: '取消',
        close: '关闭',
        clear: '清空记录',
        clearConfirm: '再点一次确认清空',
        remove: '删除联系人',
        removeConfirm: '再点一次确认删除',
        myCodeTitle: '我的添加码',
        myCodeHint: '把下面这段发给对方。对方只需要两步：上传插件包并说一句口令，然后粘贴这行添加码。',
        copyCode: '复制添加码',
        copyCard: '复制整段说明',
        copied: '已复制',
        settingsTitle: '我的设置',
        updateTitle: '插件更新',
        updateVersion: '当前版本',
        updateSource: '更新源（npm 包名或清单地址）',
        updateSourceHint: '填 npm 包名或 https 的清单地址；留空则用插件自带的更新地址',
        updateCheck: '检查更新',
        updateInstall: '立即更新',
        updateSave: '保存更新源',
        updateAvailable: '发现新版本',
        updateUpToDate: '已是最新版本',
        updateChecking: '正在检查…',
        updateInstalling: '正在更新…',
        updateSourceSaved: '更新源已保存',
        updateSourceInUse: '当前使用：',
        updateClientBuild: '界面',
        updateCheckedAt: '上次检查：',
        updateNeedSource: '请先填写更新源',
        updateBadSource: '更新源只接受 npm 包名或 https 清单地址',
        updateFailed: '更新失败，请重试',
        updateNotBundle: '更新源不是一个插件包',
        updateNotPublished: '更新源还没发布新版本，或包名写错了',
        updateFake: '这是模拟的新版本，不能真的安装',
        updateSimulated: '模拟更新完成（真更新要用已发布的版本）',
        updateNoManager: '这个 DSH 里没有插件管理器，无法自动更新',
        updateBusy: '正在更新中，请稍候',
        updateManifestFailed: '读不到发布清单',
        updateDownloadFailed: '下载新版本失败',
        updateMismatch: '更新源的包名与当前插件不一致，已拒绝更新',
        myName: '我的昵称',
        defaultRelay: '中继地址',
        relayHint: '双方要用同一个中继；改这里只影响以后发给别人的添加码。',
        limitsHint: '公共中继免费版约每天 250 条、消息保留 12 小时。',
        loadError: '聊天服务没有响应',
        threadLoadError: '这个联系人的历史记录没加载出来',
        pluginHint: '对方还没装插件？把插件包和这一步说明一起发给对方。',
        waitingPeer: '等对方先说话',
        noNameYet: '未设置昵称',
        autoAdded: '对方发来消息，已自动添加',
        addedYou: '对方添加了你',
        renameHint: '点名字可以改备注',
        autoAddedInfo: '对方先发来消息，所以自动出现在你的列表里。改个备注名会好认很多。',
        newBadge: '新',
        setYourName: '点右侧齿轮改个昵称',
        emptyPreview: '还没有消息',
        badRelay: '中继地址无效',
        needName: '请先填一个备注名',
      },
      en: {
        title: 'Messages',
        subtitle: 'Paste an add code and start chatting',
        addContact: 'Add contact',
        myCode: 'My add code',
        myCodeShort: 'My code',
        contactCount: 'contacts',
        searchPlaceholder: 'Search contacts',
        noContactsTitle: 'No contacts yet',
        noContactsHint: 'Tap "Add contact" and paste the code the other person sent you, or send them your own code.',
        noMessages: 'No messages yet',
        noMessagesHint: 'Say hello to start',
        selectContact: 'Pick a contact',
        selectContactHint: 'Choose someone on the left to start chatting.',
        composerPlaceholder: 'Type a message. Enter sends, Shift+Enter adds a line; paste a picture to send it',
        send: 'Send',
        sending: 'Sending',
        failed: 'Failed',
        retry: 'Retry',
        relayOnline: 'Connected',
        relayConnecting: 'Connecting…',
        relayError: 'Connection problem',
        relayIdle: 'Not connected',
        you: 'You',
        unreadTitle: '{count} unread',
        selfChat: 'Chat with myself',
        selfBadge: 'me',
        selfChatHint: 'Notes to yourself, kept on this machine only',
        pin: 'Pin to top',
        unpin: 'Unpin',
        pinned: 'Pinned',
        reply: 'Quote',
        updatedTo: 'Updated to',
        reloadHint: 'the new version shows up after a page reload',
        reloadNow: 'Reload',
        replyingTo: 'Replying to',
        cancelReply: 'Cancel quote',
        jumpToQuoted: 'Jump to the quoted message',
        imageBadge: '[image]',
        attachFailed: 'The picture did not go out, please try again',
        imageTooLarge: 'That picture is too large (4 MB at most)',
        imageView: 'View picture',
        dateToday: 'Today',
        dateYesterday: 'Yesterday',
        dateDayBefore: 'The day before yesterday',
        unnamed: 'Unnamed contact',
        addTitle: 'Add a contact',
        addHint: 'Paste the add code the other person sent you. They do not need to create anything first.',
        addCodeLabel: 'Add code',
        addCodePlaceholder: 'Paste the code starting with DSHCHAT2:',
        addButton: 'Add',
        badCard: 'Invalid add code; make sure it was copied completely',
        ownCode: 'That is your own add code — send it to the other person instead',
        tooMany: 'Contact limit reached (30)',
        info: 'Edit',
        contactInfo: 'Edit',
        renameLabel: 'Display name',
        namePlaceholder: 'e.g. Alex',
        save: 'Save',
        cancel: 'Cancel',
        close: 'Close',
        clear: 'Clear history',
        clearConfirm: 'Click again to clear',
        remove: 'Remove contact',
        removeConfirm: 'Click again to remove',
        myCodeTitle: 'My add code',
        myCodeHint: 'Send this block to the other person. They need two steps: install the plugin and say one phrase, then paste this code.',
        copyCode: 'Copy code',
        copyCard: 'Copy whole note',
        copied: 'Copied',
        settingsTitle: 'My settings',
        updateTitle: 'Plugin updates',
        updateVersion: 'Current version',
        updateSource: 'Update source (npm package name or manifest address)',
        updateSourceHint: 'With a package name or an https manifest address; empty means the built-in update address is used',
        updateCheck: 'Check for updates',
        updateInstall: 'Update now',
        updateSave: 'Save update source',
        updateAvailable: 'A new version is available',
        updateUpToDate: 'You are up to date',
        updateChecking: 'Checking…',
        updateInstalling: 'Installing…',
        updateSourceSaved: 'Update source saved',
        updateSourceInUse: 'In use:',
        updateClientBuild: 'front end',
        updateCheckedAt: 'Last checked:',
        updateNeedSource: 'Set an update source first',
        updateBadSource: 'The update source must be an npm package name or an https manifest address',
        updateFailed: 'The update failed, please try again',
        updateNotBundle: 'The update source is not a plugin package',
        updateNotPublished: 'Nothing is published under that name yet, or the name is wrong',
        updateFake: 'This version is simulated, so it cannot really be installed',
        updateSimulated: 'Simulated update finished (a real one needs a published version)',
        updateNoManager: 'This DSH has no plugin manager, so it cannot update itself',
        updateBusy: 'An update is already running, please wait',
        updateManifestFailed: 'The release manifest could not be read',
        updateDownloadFailed: 'The new version could not be downloaded',
        updateMismatch: 'The update source names a different package, so the update was refused',
        myName: 'My name',
        defaultRelay: 'Relay',
        relayHint: 'Both sides must use the same relay. Changing it only affects codes you send later.',
        limitsHint: 'The public relay allows about 250 messages a day and keeps them for 12 hours.',
        loadError: 'The chat service did not respond',
        threadLoadError: 'History for this contact did not load',
        pluginHint: 'Other person has no plugin yet? Send them the package with the one-step install note.',
        waitingPeer: 'Waiting for them to speak',
        noNameYet: 'No display name yet',
        autoAdded: 'They wrote first, so they were added automatically',
        addedYou: 'They added you',
        renameHint: 'Click a name to rename it',
        autoAddedInfo: 'They wrote first, so they appeared in your list automatically. Give them a display name so you recognize them.',
        newBadge: 'NEW',
        setYourName: 'Tap the gear to set your name',
        emptyPreview: 'No messages yet',
        badRelay: 'That relay address is not valid',
        needName: 'Enter a display name first',
      },
    };

    /* ------------------------------------------------------------------ *
     * Helpers: URLs, formatting, merging
     * ------------------------------------------------------------------ */

    function normalizeRelay(value) {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim().replace(/\/+$/, '');
      if (!trimmed) return null;
      let parsed;
      try {
        parsed = new URL(trimmed);
      } catch (err) {
        return null;
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      if (parsed.search || parsed.hash) return null;
      return parsed.origin + parsed.pathname.replace(/\/+$/, '');
    }

    function formatTime(at) {
      const date = new Date(at);
      if (!Number.isFinite(date.getTime())) return '';
      try {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (err) {
        return '';
      }
    }

    function shortTime(at) {
      const date = new Date(at);
      if (!Number.isFinite(date.getTime())) return '';
      const now = new Date();
      try {
        if (
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() &&
          date.getDate() === now.getDate()
        ) {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
      } catch (err) {
        return '';
      }
    }

    function initial(name) {
      const trimmed = (name || '').trim();
      if (!trimmed) return '·';
      const first = Array.from(trimmed)[0] || '·';
      return first.toUpperCase();
    }

    function upsertMessage(list, message) {
      const messages = Array.isArray(list) ? list.slice() : [];
      const index = messages.findIndex((entry) => entry.id === message.id);
      if (index >= 0) messages[index] = message;
      else {
        messages.push(message);
        if (messages.length > 400) messages.splice(0, messages.length - 400);
      }
      return messages;
    }

    /** Where a row sits: notes to myself stay first, then pinned rows, then
     *  the rest in the order the last message arrived. */
    function contactRank(contact) {
      if (!contact) return 0;
      if (contact.self) return 2;
      return contact.pinned ? 1 : 0;
    }

    function sortContacts(contacts) {
      return contacts.slice().sort((left, right) => {
        const rank = contactRank(right) - contactRank(left);
        if (rank) return rank;
        const leftAt = left.lastMessage ? left.lastMessage.at : left.createdAt || 0;
        const rightAt = right.lastMessage ? right.lastMessage.at : right.createdAt || 0;
        return rightAt - leftAt;
      });
    }

    function statusLabel(status, t) {
      if (status === 'online') return t('relayOnline');
      if (status === 'connecting') return t('relayConnecting');
      if (status === 'error') return t('relayError');
      return t('relayIdle');
    }

    function activeLang(locale) {
      try {
        const snapshot =
          locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : null;
        const active = snapshot ? snapshot.active : '';
        const id =
          typeof active === 'string'
            ? active
            : active && typeof active.id === 'string'
              ? active.id
              : '';
        return String(id).toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
      } catch (err) {
        return 'zh';
      }
    }

    /** The day a message belongs to, as a comparable key. */
    function dayKey(at) {
      const date = new Date(at);
      return (
        date.getFullYear() +
        '-' +
        String(date.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getDate()).padStart(2, '0')
      );
    }

    /** The heading that separates two days: today, yesterday or a date. */
    function dayLabel(at, lang, t) {
      const date = new Date(at);
      const today = new Date();
      const startToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime();
      const startDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      ).getTime();
      const days = Math.round((startToday - startDay) / 86400000);
      if (days === 0) return t('dateToday');
      if (days === 1) return t('dateYesterday');
      if (days === 2) return t('dateDayBefore');
      try {
        return date.toLocaleDateString(
          lang === 'zh' ? 'zh-CN' : 'en-US',
          { year: 'numeric', month: 'long', day: 'numeric' },
        );
      } catch (err) {
        return dayKey(at);
      }
    }

    function buildCardText(lang, { name, code }) {
      if (lang === 'en') {
        return [
          'DSH add code' + (name ? ' — ' + name : ''),
          '',
          'Step 1 — install the plugin (one approval in total):',
          '• Drop ' + PLUGIN_ZIP + ' into the DSH message box and say:',
          '  "Use plugin_manager to install the ' + PLUGIN_ZIP + ' I just uploaded. Only call plugin_manager for this, do not run any other commands."',
          '• If DSH says the plugin_manager tool is unavailable, switch the mode selector at the top right from Standard to Creator and send it again.',
          '• Approve once when asked: the plugin has no dependencies and runs no install scripts.',
          '• The add code in step 2 carries the update address, so the plugin can check for new versions on its own.',
          'Step 2 — add me: open the Messages panel, tap "Add contact" and paste the code below:',
          '',
          code,
          '',
          'Once those two steps are done we can chat here in real time.',
        ].join('\n');
      }
      return [
        '【DSH 添加码】' + (name ? name : ''),
        '',
        '第 1 步（装插件，全程只要 1 次授权）：',
        '· 把我发你的 ' + PLUGIN_ZIP + ' 拖进 DSH 输入框，然后说一句：',
        '  「用 plugin_manager 安装我刚上传的 ' + PLUGIN_ZIP + '，只调用 plugin_manager 这一步，不要执行其它命令」',
        '· 如果 DSH 说没有 plugin_manager 工具：把右上角模式从「标准模式」切成「Creator 模式」再发一次。',
        '· 弹出授权时点「允许一次」即可：插件没有依赖、不跑任何安装脚本。',
        '· 装好后第 2 步的添加码会把「更新地址」一起带给你，之后插件能自己检查新版本，不用再找我要安装包。',
        '第 2 步（加我）：打开 DSH 左侧「消息」面板，点「添加联系人」，把下面这行添加码粘进去：',
        '',
        code,
        '',
        '两步做完，我们就能直接在这里聊天了。',
      ].join('\n');
    }

    /* ------------------------------------------------------------------ *
     * Artwork
     * ------------------------------------------------------------------ */

    function contactsGlyph(size, extraProps) {
      return h(
        'svg',
        Object.assign(
          {
            viewBox: '0 0 24 24',
            width: size,
            height: size,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
            focusable: 'false',
            style: { display: 'block' },
          },
          extraProps,
        ),
        [
          h('circle', { key: 'head', cx: 9.2, cy: 8.4, r: 3.1 }),
          h('path', { key: 'body', d: 'M3.6 19.1c.5-3 2.8-4.7 5.6-4.7s5.1 1.7 5.6 4.7' }),
          h('path', { key: 'list-1', d: 'M17.2 8.4h3.2' }),
          h('path', { key: 'list-2', d: 'M17.2 12h3.2' }),
          h('path', { key: 'list-3', d: 'M17.2 15.6h2.2' }),
        ],
      );
    }

    /** One person: the conversation with myself. */
    function selfGlyph(size) {
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
        h('circle', { cx: 12, cy: 8, r: 3.6 }),
        h('path', { d: 'M5 20c0-3.4 3.1-5.6 7-5.6s7 2.2 7 5.6' }),
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
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', { d: 'M8 3.5v9M3.5 8h9' }),
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
          h('path', {
            key: 'front',
            d: 'M10.2 11.6v.9A1.9 1.9 0 0 1 8.3 14.4H4.3a1.9 1.9 0 0 1-1.9-1.9V8.5a1.9 1.9 0 0 1 1.9-1.9h.9',
          }),
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
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [
          h('path', { key: 'pencil', d: 'M10.6 2.9l2.5 2.5-7.4 7.4-3.1.6.6-3.1z' }),
          h('path', { key: 'tip', d: 'M9.4 4.1l2.5 2.5' }),
        ],
      );
    }

    /** A pin: marks a conversation that stays at the top of the list. */
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

    function gearGlyph(size) {
      // A cog with eight teeth: the old glyph read as a sun.
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block' },
        },
        [
          h('circle', { key: 'hub', cx: 12, cy: 12, r: 3 }),
          h('path', {
            key: 'cog',
            d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
          }),
        ],
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


    /* ------------------------------------------------------------------ *
     *  Update watcher
     *
     *  The sidebar entry lives outside the panel, so it needs its own view
     *  of the update state. One watcher feeds every consumer.
     * ------------------------------------------------------------------ */
    const updateWatch = {
      available: false,
      version: '',
      listeners: new Set(),
      started: false,
    };

    function publishUpdateWatch(state) {
      const update = (state && state.update) || null;
      const available = Boolean(update && update.available);
      const version = (update && update.latest) || '';
      if (available === updateWatch.available && version === updateWatch.version) return;
      updateWatch.available = available;
      updateWatch.version = version;
      for (const listener of updateWatch.listeners) listener(available, version);
    }

    function startUpdateWatch() {
      if (updateWatch.started || typeof window === 'undefined') return;
      updateWatch.started = true;
      const base = '/plugin/chat-room';
      const read = async () => {
        try {
          const response = await fetch(base + '/state', { headers: { accept: 'application/json' } });
          const body = await response.json();
          if (body && body.ok && body.state) publishUpdateWatch(body.state);
        } catch (error) {
          /* the panel shows the connection error */
        }
      };
      void read();
      try {
        const source = new EventSource(base + '/events');
        source.addEventListener('state', (event) => {
          try {
            // The frame carries the state itself, not a wrapper.
            const frame = JSON.parse(event.data);
            publishUpdateWatch(frame && frame.state ? frame.state : frame);
          } catch (error) {
            /* ignore a broken frame */
          }
        });
        source.addEventListener('message', (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (!payload || typeof payload.contactId !== 'string') return;
            const message = payload.message;
            if (!message || typeof message.id !== 'string') return;
            // Own sends are not unread, and neither is the open conversation.
            if (message.mine) return;
            if (payload.contactId === unreadWatch.activeId) return;
            addUnread(payload.contactId);
          } catch (error) {
            /* ignore a broken frame */
          }
        });
      } catch (error) {
        /* no live updates without a stream */
      }
    }

    /* Unread counting lives outside the panel: the sidebar entry has to show
     * a dot while the panel is closed, and one stream is enough for both. */
    const unreadWatch = {
      counts: {},
      activeId: '',
      listeners: new Set(),
    };

    function unreadTotal() {
      let total = 0;
      for (const id of Object.keys(unreadWatch.counts)) total += unreadWatch.counts[id] || 0;
      return total;
    }

    function notifyUnread() {
      const counts = unreadWatch.counts;
      const total = unreadTotal();
      for (const listener of unreadWatch.listeners) listener(counts, total);
    }

    function addUnread(contactId) {
      if (!contactId) return;
      unreadWatch.counts = Object.assign({}, unreadWatch.counts, {
        [contactId]: (unreadWatch.counts[contactId] || 0) + 1,
      });
      notifyUnread();
    }

    function clearUnread(contactId) {
      if (!contactId || !unreadWatch.counts[contactId]) return;
      unreadWatch.counts = Object.assign({}, unreadWatch.counts, { [contactId]: 0 });
      notifyUnread();
    }

    /** The open conversation: its messages are being read, not waiting. */
    function setActiveConversation(contactId) {
      unreadWatch.activeId = contactId || '';
    }

    function useUnreadWatch() {
      const read = () => ({ counts: unreadWatch.counts, total: unreadTotal() });
      const [value, setValue] = React.useState(read);
      React.useEffect(() => {
        const listener = (counts, total) => setValue({ counts, total });
        unreadWatch.listeners.add(listener);
        setValue(read());
        return () => unreadWatch.listeners.delete(listener);
      }, []);
      return value;
    }

    function useUpdateWatch() {
      const [value, setValue] = React.useState({
        available: updateWatch.available,
        version: updateWatch.version,
      });
      React.useEffect(() => {
        startUpdateWatch();
        const listener = (available, version) => setValue({ available, version });
        updateWatch.listeners.add(listener);
        return () => updateWatch.listeners.delete(listener);
      }, []);
      return value;
    }

    /**
     * Locale entries are string templates in DSH. Keep the sidebar alive even
     * if a malformed dictionary slips into a future build: a notification
     * title is optional, while throwing here removes the whole slot row.
     */
    function formatUnreadTitle(translate, count) {
      const value = String(count || 0);
      if (typeof translate === 'function') {
        try {
          const title = translate('unreadTitle', { count: value });
          if (typeof title === 'string' && title) return title;
        } catch (error) {
          /* use the safe fallback below */
        }
      }
      return value + ' unread';
    }

    /** The update dot. It carries its own rules as well, so a missing
     *  stylesheet can never leave it invisible. */
    /**
     * Picks the first picture out of a clipboard or drop payload. Only an
     * entry that really carries an image is taken, so a text paste is left to
     * the editor. The client half cannot import the protocol module, so this
     * lives here on its own.
     */
    function pickPastedImage(items) {
      const list = items && typeof items.length === 'number' ? Array.from(items) : [];
      for (const item of list) {
        if (!item || typeof item.type !== 'string') continue;
        if (item.type.indexOf('image/') !== 0) continue;
        const file = typeof item.getAsFile === 'function' ? item.getAsFile() : item;
        if (file && typeof file === 'object' && typeof file.type === 'string' && file.type.indexOf('image/') === 0) {
          return file;
        }
      }
      return null;
    }

    /**
     * Keeps a floating menu inside the viewport: clamp its anchor so the menu
     * never runs off the right or bottom edge. Without a viewport (tests) the
     * anchor is used as is, only never below zero.
     */
    function clampMenuPosition(x, y, viewport, size) {
      const margin = 8;
      const left = Math.max(0, Number(x) || 0);
      const top = Math.max(0, Number(y) || 0);
      const width = Number(viewport && viewport.width) || 0;
      const height = Number(viewport && viewport.height) || 0;
      if (!width || !height) return { left, top };
      return {
        left: Math.max(margin, Math.min(left, width - (Number(size && size.width) || 0) - margin)),
        top: Math.max(margin, Math.min(top, height - (Number(size && size.height) || 0) - margin)),
      };
    }

    function updateDot(extra) {
      return h('span', {
        className: 'dsh-msg-update-dot' + (extra ? ' ' + extra : ''),
        style: {
          position: 'absolute',
          display: 'block',
          width: '6px',
          height: '6px',
          borderRadius: '999px',
          background: 'var(--dsw-alias-state-error-primary)',
          pointerEvents: 'none',
        },
      });
    }

    function ContactIcon(props) {
      const size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 20;
      const active = !!(props && props.active);
      const update = useUpdateWatch();
      const unread = useUnreadWatch();
      // The translator is bound inside apply(), so it comes in as a prop. A
      // missing one must never take the sidebar row down with it.
      const translate = props && typeof props.t === 'function' ? props.t : null;
      const parts = [];
      if (unread.total > 0) {
        parts.push(
          translate
            ? formatUnreadTitle(translate, unread.total)
            : unread.total + ' unread',
        );
      }
      if (update.available) {
        parts.push(
          (translate ? translate('updateAvailable') : 'New version') + ' ' + update.version,
        );
      }
      const title = parts.length ? parts.join(' · ') : undefined;
      return h(
        'span',
        {
          className: 'dsh-msg-icon',
          title,
          style: {
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
          },
        },
        contactsGlyph(size),
        unread.total > 0 || update.available ? updateDot('dsh-msg-update-dot--icon') : null,
      );
    }

    /* ------------------------------------------------------------------ *
     * Styles: theme tokens only, rendered as a <style> element so unmounting
     * removes them.
     * ------------------------------------------------------------------ */

    const CSS = [
      '.dsh-msg-root{position:relative;display:flex;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5}',
      '.dsh-msg-rail{display:flex;flex-direction:column;flex:0 0 288px;width:288px;min-width:0;border-right:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-msg-rail-head{display:flex;align-items:center;gap:8px;flex:0 0 auto;padding:14px 16px 10px}',
      '.dsh-msg-rail-mark{display:inline-flex;color:var(--dsw-alias-brand-primary)}',
      '.dsh-msg-rail-title{margin:0;font-size:15px;font-weight:600;white-space:nowrap}',
      '.dsh-msg-rail-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-msg-rail-version{position:relative;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-msg-rail-version[data-update=\'true\']{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dsh-msg-rail-actions{display:flex;align-items:center;gap:6px;margin-left:auto}',
      '.dsh-msg-search{box-sizing:border-box;height:30px;width:calc(100% - 32px);margin:0 16px 8px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}',
      '.dsh-msg-search::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-search:focus{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-msg-list{flex:1 1 auto;min-height:0;overflow-y:auto;padding:0 8px 8px}',
      '.dsh-msg-list-empty{margin:16px 8px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-row{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 2px;padding:9px 10px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color .12s ease,border-color .12s ease}',
      '.dsh-msg-row:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-msg-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      ".dsh-msg-row[data-active='true']{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}",
      '.dsh-msg-avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:36px;height:36px;border-radius:50%;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.dsh-msg-row-body{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0}',
      '.dsh-msg-row-top{display:flex;align-items:baseline;gap:8px}',
      '.dsh-msg-row-name{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 auto;cursor:text}',
      '.dsh-msg-rename{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--dsw-alias-label-secondary);opacity:0;transition:opacity .12s ease}',
      '.dsh-msg-row:hover .dsh-msg-rename,.dsh-msg-row:focus-within .dsh-msg-rename{opacity:1}',
      '.dsh-msg-row-time{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:0 0 auto}',
      '.dsh-msg-pinned{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;align-self:center;margin:-4px -4px -4px 0;color:var(--dsw-alias-brand-primary)}',
      '.dsh-msg-menu{position:fixed;z-index:50;min-width:176px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 32px rgba(0,0,0,.16)}',
      '.dsh-msg-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer;white-space:nowrap}',
      '.dsh-msg-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-msg-menu-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-msg-row-preview{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-msg-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:10.5px;font-weight:600;flex:0 0 auto}',
      '.dsh-msg-rail-foot{display:flex;align-items:center;gap:8px;flex:0 0 auto;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-msg-self{display:flex;flex-direction:column;min-width:0;flex:1 1 auto}',
      '.dsh-msg-self-name{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-msg-self-hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-msg-main{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0}',
      '.dsh-msg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease}',
      '.dsh-msg-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-msg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-msg-btn[disabled]{opacity:.55;cursor:default}',
      '.dsh-msg-btn--primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
      '.dsh-msg-btn--primary:hover{background:var(--dsw-alias-brand-primary);border-color:transparent;opacity:.92}',
      '.dsh-msg-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-btn--ghost:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.dsh-msg-btn--icon{width:30px;padding:0;position:relative}',
      '.dsh-msg-update-dot{position:absolute;top:3px;right:3px;display:block;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-error-primary);pointer-events:none}',
      '.dsh-msg-update-dot--icon{top:-1px;right:-2px;width:6px;height:6px}',
      '.dsh-msg-btn--code{height:28px;padding:0 10px;font-size:12px}',
      '.dsh-msg-danger:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      ".dsh-msg-danger[data-armed='true']{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
      '.dsh-msg-thread{display:flex;flex-direction:column;height:100%;min-height:0}',
      '.dsh-msg-thread-head{display:flex;align-items:center;gap:10px;flex:0 0 auto;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);min-height:56px;box-sizing:border-box}',
      '.dsh-msg-thread-title{display:flex;flex-direction:column;min-width:0}',
      '.dsh-msg-thread-name{margin:0;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-msg-thread-status{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-msg-chip{display:inline-flex;align-items:center;height:18px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-msg-thread-actions{display:flex;align-items:center;gap:6px;margin-left:auto}',
      '.dsh-msg-banner{display:flex;align-items:center;gap:10px;margin:10px 20px 0;padding:8px 12px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-msg-banner--info{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-banner-detail{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-msg-messages{flex:1 1 auto;min-height:0;overflow-y:auto;padding:18px 24px 8px}',
      '.dsh-msg-daysep{display:flex;justify-content:center;margin:16px 0 10px}',
      '.dsh-msg-daysep span{padding:2px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.6;white-space:nowrap}',
      '.dsh-msg-thread-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;min-height:220px;color:var(--dsw-alias-label-secondary);padding:0 24px;text-align:center}',
      '.dsh-msg-thread-empty-art{display:inline-flex;color:var(--dsw-alias-border-l2)}',
      '.dsh-msg-thread-empty-title{margin:0;font-size:13.5px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-msg-thread-empty-hint{margin:0;font-size:12px}',
      '.dsh-msg-message{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin-bottom:12px;max-width:100%}',
      ".dsh-msg-message[data-mine='true']{align-items:flex-end}",
      '.dsh-msg-bubble{max-width:min(560px,78%);padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.55}',
      '.dsh-msg-text{white-space:pre-wrap}',
      '.dsh-msg-image{display:block;max-width:min(320px,100%);max-height:320px;margin:4px 0;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);cursor:zoom-in;object-fit:contain;background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-msg-quote{display:flex;flex-direction:column;gap:1px;margin:0 0 6px;padding:4px 8px;border-left:3px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;white-space:normal}',
      '.dsh-msg-quote-name{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-quote-text{font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.dsh-msg-reply{margin-left:6px;padding:0 4px;border:none;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer;opacity:0;transition:opacity .12s ease}',
      '.dsh-msg-message:hover .dsh-msg-reply{opacity:1}',
      '.dsh-msg-reply:hover{color:var(--dsw-alias-brand-primary)}',
      '.dsh-msg-replybar{display:flex;align-items:center;gap:8px;margin:0 24px 6px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-replybar-mark{color:var(--dsw-alias-brand-primary)}',
      '.dsh-msg-replybar-name{font-weight:600;white-space:nowrap}',
      '.dsh-msg-replybar-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-msg-replybar-close{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;padding:0 2px}',
      '.dsh-msg-replybar-close:hover{color:var(--dsw-alias-label-primary)}',
      ".dsh-msg-message[data-mine='true'] .dsh-msg-bubble{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}",
      '.dsh-msg-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary);padding:0 4px;opacity:.9}',
      ".dsh-msg-message[data-mine='false'] .dsh-msg-meta{color:var(--dsw-alias-label-primary)}",
      ".dsh-msg-meta[data-failed='true']{color:var(--dsw-alias-state-error-primary);opacity:1}",
      '.dsh-msg-composer{display:flex;align-items:flex-end;gap:10px;flex:0 0 auto;padding:12px 24px 16px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-msg-composer-input{flex:1 1 auto;box-sizing:border-box;min-height:52px;max-height:180px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.55;resize:none;outline:none}',
      '.dsh-msg-composer-input:focus{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-msg-composer-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dsh-msg-welcome{display:flex;flex:1 1 auto;align-items:flex-start;justify-content:center;overflow-y:auto;padding:48px 24px}',
      '.dsh-msg-card{display:flex;flex-direction:column;gap:14px;width:min(520px,100%);padding:24px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-msg-card-head{display:flex;align-items:center;gap:10px}',
      '.dsh-msg-card-mark{display:inline-flex;color:var(--dsw-alias-brand-primary)}',
      '.dsh-msg-card-title{margin:0;font-size:18px;font-weight:600}',
      '.dsh-msg-card-hint{margin:0;font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-section{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px}',
      '.dsh-msg-overlay{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.28)}',
      '.dsh-msg-overlay-panel{display:flex;flex-direction:column;gap:14px;width:min(680px,92vw);max-height:min(780px,88vh);overflow-y:auto;padding:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-base);box-shadow:0 16px 48px rgba(0,0,0,.18)}',
      '.dsh-msg-overlay-head{display:flex;align-items:flex-start;gap:12px}',
      '.dsh-msg-overlay-title{margin:0;font-size:17px;font-weight:600}',
      '.dsh-msg-overlay-hint{margin:4px 0 0;font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-close{margin-left:auto;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dsh-msg-close:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-msg-lightbox{position:fixed;inset:0;z-index:60;padding:32px;background:rgba(0,0,0,.78);cursor:zoom-out}',
      '.dsh-msg-lightbox-image{max-width:100%;max-height:100%;border-radius:10px;object-fit:contain;background:var(--dsw-alias-bg-layer-2);box-shadow:0 18px 60px rgba(0,0,0,.45)}',
      '.dsh-msg-lightbox-close{position:absolute;top:16px;right:16px;width:32px;height:32px;margin:0;border-color:transparent;background:rgba(0,0,0,.45);color:var(--dsw-alias-bg-base)}',
      '.dsh-msg-lightbox-close:hover{background:rgba(0,0,0,.6)}',
      '.dsh-msg-field{display:flex;flex-direction:column;gap:6px}',
      '.dsh-msg-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsh-msg-input,.dsh-msg-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}',
      '.dsh-msg-input{height:34px;padding:0 10px}',
      '.dsh-msg-textarea{min-height:96px;padding:8px 10px;resize:vertical;line-height:1.55}',
      '.dsh-msg-input:focus,.dsh-msg-textarea:focus{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-msg-small{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary)}',
      '.dsh-msg-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.dsh-msg-row-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dsh-msg-grow{flex:1 1 auto}',
      '.dsh-msg-code{box-sizing:border-box;width:100%;min-height:170px;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6;resize:vertical;outline:none}',
      '.dsh-msg-code:focus{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-msg-divider{height:1px;background:var(--dsw-alias-border-l1);margin:2px 0}',
    ].join('\n');

    /* ------------------------------------------------------------------ *
     * Panel
     * ------------------------------------------------------------------ */

    function ContactsPanel(props) {
      const t = props.t;
      const lang = activeLang(props.locale);

      const [state, setState] = React.useState(null);
      const [threads, setThreads] = React.useState({});
      const unread = useUnreadWatch().counts;
      const [loadError, setLoadError] = React.useState('');
      const [threadError, setThreadError] = React.useState('');
      const [reloadKey, setReloadKey] = React.useState(0);
      const [streamEpoch, setStreamEpoch] = React.useState(0);
      const [threadReload, setThreadReload] = React.useState(0);
      const [draft, setDraft] = React.useState('');
      const [sendError, setSendError] = React.useState('');
      const [replyTo, setReplyTo] = React.useState(null);
      const [imageBusy, setImageBusy] = React.useState(false);
      const [search, setSearch] = React.useState('');
      const [overlay, setOverlay] = React.useState(null);
      // A right-click on a row opens this little pin menu, anchored where the
      // pointer was. Pin lives here instead of on a hover-only button.
      const [rowMenu, setRowMenu] = React.useState(null);
      const [addCodeInput, setAddCodeInput] = React.useState('');
      const [addBusy, setAddBusy] = React.useState(false);
      const [formError, setFormError] = React.useState('');
      const [copied, setCopied] = React.useState('');
      const [renameDraft, setRenameDraft] = React.useState('');
      const [clearArmed, setClearArmed] = React.useState(false);
      const [removeArmed, setRemoveArmed] = React.useState(false);
      const [settingsNick, setSettingsNick] = React.useState('');
      const [settingsRelay, setSettingsRelay] = React.useState(DEFAULT_RELAY);
      const [updateSpec, setUpdateSpec] = React.useState('');
      const [updateBusy, setUpdateBusy] = React.useState(false);
      const [updateNotice, setUpdateNotice] = React.useState('');
      const messageListRef = React.useRef(null);
      const menuRef = React.useRef(null);
      const copyTimer = React.useRef(null);
      const threadToken = React.useRef(0);
      const stateRef = React.useRef(null);
      const threadsRef = React.useRef({});
      const loadedRef = React.useRef(new Set());

      // A zoomed picture closes on Escape; the backdrop and the close button
      // already close it.
      React.useEffect(() => {
        if (!overlay || overlay.kind !== 'image') return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOverlay(null);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [overlay]);

      // The row menu belongs to one right-click: any other click, Escape, a
      // right-click elsewhere, a scroll or a resize closes it. Focus moves to
      // the menu item so the Context-menu key and Shift+F10 work as well.
      React.useEffect(() => {
        if (!rowMenu) return undefined;
        const menu = menuRef.current;
        const item = menu ? menu.querySelector('[role="menuitem"]') : null;
        if (item && typeof item.focus === 'function') item.focus({ preventScroll: true });
        const close = (event) => {
          const target = event && event.target;
          // A click or right-click inside the menu leaves it open; every other
          // target (window blur/resize carry none) closes it.
          if (menu && target && typeof target.nodeType === 'number' && menu.contains(target)) {
            // A right-click inside the menu must not open the browser menu.
            if (event.type === 'contextmenu') event.preventDefault();
            return;
          }
          setRowMenu(null);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setRowMenu(null);
        };
        document.addEventListener('mousedown', close, true);
        document.addEventListener('contextmenu', close, true);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', close);
        window.addEventListener('blur', close);
        return () => {
          document.removeEventListener('mousedown', close, true);
          document.removeEventListener('contextmenu', close, true);
          document.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('resize', close);
          window.removeEventListener('blur', close);
        };
      }, [rowMenu]);

      const applyState = React.useCallback((next) => {
        if (!next || typeof next !== 'object') return;
        if (!next.self || !Array.isArray(next.contacts)) return;
        publishUpdateWatch(next);
        setState((previous) => {
          if (!previous || !Array.isArray(previous.contacts)) return next;
          // An incoming null preview is authoritative (history was cleared);
          // only a *newer* non-null preview wins over the local one.
          const byId = new Map();
          for (const entry of previous.contacts) byId.set(entry.id, entry);
          const contacts = next.contacts.map((entry) => {
            const old = byId.get(entry.id);
            if (!old || !entry.lastMessage || !old.lastMessage) return entry;
            return old.lastMessage.at > entry.lastMessage.at
              ? Object.assign({}, entry, { lastMessage: old.lastMessage })
              : entry;
          });
          return Object.assign({}, next, { contacts });
        });
        const live = new Set(next.contacts.map((contact) => contact.id));
        for (const id of Array.from(loadedRef.current)) {
          if (!live.has(id)) loadedRef.current.delete(id);
        }
        setLoadError('');
      }, []);

      const post = React.useCallback(
        async (path, body) => {
          try {
            const response = await fetch(API + path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body || {}),
            });
            const payload = await response.json().catch(() => null);
            if (payload && payload.state) applyState(payload.state);
            return payload || { ok: false, error: 'network' };
          } catch (err) {
            return { ok: false, error: 'network' };
          }
        },
        [applyState],
      );

      // Bootstrap: one snapshot, then the live stream.
      React.useEffect(() => {
        // Look for a new version as soon as the panel opens, so the red dot
        // does not wait for the half-hourly round.
        void post('/update/check', {}).catch(() => undefined);
        let disposed = false;
        let source = null;
        fetch(API + '/state', { headers: { Accept: 'application/json' }, cache: 'no-store' })
          .then((response) => response.json())
          .then((payload) => {
            if (disposed) return;
            if (payload && payload.ok && payload.state) applyState(payload.state);
            else throw new Error('bad-state');
          })
          .catch(() => {
            if (!disposed) setLoadError(t('loadError'));
          });
        if (typeof window.EventSource === 'function') {
          try {
            source = new window.EventSource(API + '/events');
            source.addEventListener('hello', () => {
              // A fresh stream means we may have missed messages: forget the
              // "history loaded" marks and let the loader refetch.
              loadedRef.current = new Set();
              setStreamEpoch((value) => value + 1);
            });
            source.addEventListener('state', (event) => {
              try {
                applyState(JSON.parse(event.data));
              } catch (err) {
                /* ignore a torn frame; the next snapshot is complete */
              }
            });
            source.addEventListener('contact', (event) => {
              try {
                const contact = JSON.parse(event.data);
                if (!contact || typeof contact.id !== 'string') return;
                setState((previous) => {
                  if (!previous || !Array.isArray(previous.contacts)) return previous;
                  const contacts = previous.contacts.map((entry) => {
                    if (entry.id !== contact.id) return entry;
                    if (!entry.lastMessage || !contact.lastMessage) return contact;
                    return entry.lastMessage.at > contact.lastMessage.at
                      ? Object.assign({}, contact, { lastMessage: entry.lastMessage })
                      : contact;
                  });
                  return Object.assign({}, previous, { contacts });
                });
              } catch (err) {
                /* ignore */
              }
            });
            source.addEventListener('message', (event) => {
              try {
                const payload = JSON.parse(event.data);
                if (!payload || typeof payload.contactId !== 'string') return;
                const message = payload.message;
                if (
                  !message ||
                  typeof message.id !== 'string' ||
                  typeof message.text !== 'string'
                ) {
                  return;
                }
                setThreads((previous) => ({
                  ...previous,
                  [payload.contactId]: upsertMessage(previous[payload.contactId], message),
                }));

              } catch (err) {
                /* ignore */
              }
            });
            source.addEventListener('thread', (event) => {
              try {
                const payload = JSON.parse(event.data);
                if (!payload || typeof payload.contactId !== 'string') return;
                if (!Array.isArray(payload.messages)) return;
                setThreads((previous) => ({
                  ...previous,
                  [payload.contactId]: payload.messages,
                }));
                loadedRef.current.add(payload.contactId);
              } catch (err) {
                /* ignore */
              }
            });
          } catch (err) {
            /* the initial snapshot reports connectivity problems */
          }
        }
        return () => {
          disposed = true;
          if (source) source.close();
        };
      }, [applyState, t, reloadKey]);

      const activeId = state ? state.activeId || '' : '';
      const activeContact = state
        ? state.contacts.find((contact) => contact.id === activeId) || null
        : null;
      const messages = threads[activeId] || [];
      const status = state ? state.status || 'idle' : 'idle';

      React.useEffect(() => {
        stateRef.current = state;
      }, [state]);
      React.useEffect(() => {
        threadsRef.current = threads;
      }, [threads]);

      // Load a conversation's stored history the first time it is opened, and
      // again whenever the page stream restarted or the user asked to retry.
      React.useEffect(() => {
        if (!activeId) {
          setThreadError('');
          return undefined;
        }
        if (loadedRef.current.has(activeId)) return undefined;
        const token = ++threadToken.current;
        let cancelled = false;
        setThreadError('');
        fetch(API + '/thread?id=' + encodeURIComponent(activeId), { cache: 'no-store' })
          .then((response) => response.json())
          .then((payload) => {
            if (cancelled || token !== threadToken.current) return;
            if (!payload || !payload.ok || !Array.isArray(payload.messages)) {
              setThreadError(t('threadLoadError'));
              return;
            }
            const fetched = payload.messages;
            setThreads((previous) => {
              const seeded = Array.isArray(previous[activeId]) ? previous[activeId] : [];
              const byId = new Map();
              for (const entry of fetched) byId.set(entry.id, entry);
              for (const entry of seeded) {
                const existing = byId.get(entry.id);
                if (!existing) {
                  byId.set(entry.id, entry);
                  continue;
                }
                // pending only ever clears, so the non-pending copy is newer.
                if (existing.pending && !entry.pending) byId.set(entry.id, entry);
              }
              const merged = Array.from(byId.values()).sort(
                (left, right) => (left.at || 0) - (right.at || 0),
              );
              if (merged.length > 400) merged.splice(0, merged.length - 400);
              return { ...previous, [activeId]: merged };
            });
            loadedRef.current.add(activeId);
            setThreadError('');
          })
          .catch(() => {
            if (!cancelled && token === threadToken.current) setThreadError(t('threadLoadError'));
          });
        return () => {
          cancelled = true;
        };
      }, [activeId, streamEpoch, threadReload, t]);

      // The open conversation is being read: its dot goes away, and incoming
      // messages there are not counted. Closing the panel releases it again.
      React.useEffect(() => {
        setActiveConversation(activeId);
        if (activeId) clearUnread(activeId);
        return () => setActiveConversation('');
      }, [activeId]);

      const messageCount = messages.length;
      React.useEffect(() => {
        const element = messageListRef.current;
        if (!element) return;
        element.scrollTop = element.scrollHeight;
      }, [activeId, messageCount]);

      React.useEffect(
        () => () => {
          if (copyTimer.current) clearTimeout(copyTimer.current);
        },
        [],
      );

      const copyText = React.useCallback((text, key) => {
        const done = () => {
          setCopied(key);
          if (copyTimer.current) clearTimeout(copyTimer.current);
          copyTimer.current = setTimeout(() => setCopied(''), 1800);
        };
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(done).catch(() => {});
            return;
          }
        } catch (err) {
          /* fall through to the manual selection path */
        }
        try {
          const area = document.createElement('textarea');
          area.value = text;
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          document.body.removeChild(area);
          done();
        } catch (err) {
          /* clipboard unavailable; the text stays selectable */
        }
      }, []);

      const openContact = React.useCallback(
        async (contactId) => {
          if (contactId === activeId) return;
          const result = await post('/active', { id: contactId });
          if (!result.ok) {
            setSendError(result.detail || t('loadError'));
            return;
          }
          setDraft('');
          setSendError('');
        },
        [activeId, post, t],
      );

      // Pinning only changes where the row sits, never what it contains.
      const setPinned = React.useCallback(
        async (contactId, pinned) => {
          const result = await post('/contacts/pin', { id: contactId, pinned });
          if (!result.ok) setSendError(result.detail || t('loadError'));
        },
        [post, t],
      );

      // A right-click on a conversation opens the pin menu where the pointer
      // is. "Chat with myself" is always first and needs no pin, so it keeps
      // the browser menu; the Context-menu key reports no pointer position, so
      // it falls back to the row itself.
      const openRowMenu = React.useCallback(
        (event, contact) => {
          if (!contact || contact.self) return;
          event.preventDefault();
          event.stopPropagation();
          let x = event.clientX;
          let y = event.clientY;
          if (!x && !y) {
            const target = event.currentTarget || event.target;
            const rect =
              target && typeof target.getBoundingClientRect === 'function'
                ? target.getBoundingClientRect()
                : null;
            if (rect) {
              x = rect.left + 12;
              y = rect.bottom;
            }
          }
          setRowMenu({
            id: contact.id,
            pinned: contact.pinned === true,
            name: contact.name || t('unnamed'),
            x,
            y,
          });
        },
        [t],
      );

      // One row in a floating menu: the pin toggle, anchored at the click.
      const renderRowMenu = () => {
        if (!rowMenu) return null;
        const viewport =
          typeof window === 'undefined'
            ? null
            : { width: window.innerWidth, height: window.innerHeight };
        const position = clampMenuPosition(rowMenu.x, rowMenu.y, viewport, {
          width: 176,
          height: 40,
        });
        return h(
          'div',
          {
            className: 'dsh-msg-menu',
            role: 'menu',
            'aria-label': rowMenu.name,
            ref: menuRef,
            style: { left: position.left + 'px', top: position.top + 'px' },
            onMouseDown: (event) => event.stopPropagation(),
            onContextMenu: (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
          },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-msg-menu-item',
              role: 'menuitem',
              onClick: () => {
                const next = !rowMenu.pinned;
                setRowMenu(null);
                void setPinned(rowMenu.id, next);
              },
            },
            pinGlyph(12),
            rowMenu.pinned ? t('unpin') : t('pin'),
          ),
        );
      };

      const handleSend = async () => {
        const text = draft.trim();
        const targetId = activeId;
        if (!text || !targetId) return;
        if (text.length > MAX_TEXT) {
          setSendError(t('failed'));
          return;
        }
        setDraft('');
        setSendError('');
        const result = await post('/send', {
          id: targetId,
          text,
          quote: replyTo || null,
        });
        if (result.ok) {
          setReplyTo(null);
          return;
        }
        // Only restore into the same conversation, and never overwrite text the
        // user typed while the send was in flight.
        const stillHere = stateRef.current && stateRef.current.activeId === targetId;
        if (!stillHere) return;
        setDraft((previous) => (previous ? previous : text));
        setSendError(t('failed') + (result.detail ? ' · ' + result.detail : ''));
      };

      /** Shrinks a big photo so it fits the relay comfortably. */
      const prepareImage = async (file) => {
        const passthrough = { blob: file, name: file.name || 'image', type: file.type };
        if (!file || !file.type || file.size <= 1500 * 1024) return passthrough;
        if (file.type === 'image/gif') return passthrough;
        try {
          const bitmap = await createImageBitmap(file);
          const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) =>
            canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.85),
          );
          if (!blob) return passthrough;
          const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
          return { blob, name, type: 'image/jpeg' };
        } catch (err) {
          return passthrough;
        }
      };

      /** Sends one picture to the open conversation. */
      const sendPicture = async (file) => {
        const targetId = activeId;
        if (!file || !targetId || imageBusy) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
          setSendError(t('attachFailed'));
          return;
        }
        if (file.size > 4 * 1024 * 1024) {
          setSendError(t('imageTooLarge'));
          return;
        }
        setSendError('');
        setImageBusy(true);
        try {
          const prepared = await prepareImage(file);
          const response = await fetch(
            API +
              '/image?id=' +
              encodeURIComponent(targetId) +
              '&name=' +
              encodeURIComponent(prepared.name),
            {
              method: 'POST',
              headers: { 'Content-Type': prepared.type },
              body: prepared.blob,
            },
          );
          const result = await response.json();
          if (!result || !result.ok) setSendError(t('attachFailed'));
        } catch (err) {
          setSendError(t('attachFailed'));
        }
        setImageBusy(false);
      };

      /**
       * A pasted picture is sent straight away: copying a screenshot and
       * pasting it into the conversation is the whole gesture. Ordinary text
       * pastes are left to the textarea.
       */
      const handlePaste = async (event) => {
        const data = event.clipboardData || (event.nativeEvent && event.nativeEvent.clipboardData);
        const file = pickPastedImage(data ? data.items : null);
        if (!file) return;
        event.preventDefault();
        await sendPicture(file);
      };

      /** Opens the conversation with myself, creating it on first use. */
      const openSelfChat = async () => {
        setSendError('');
        const result = await post('/self-chat', {});
        if (!result || !result.ok) {
          setSendError(t('loadError'));
          return;
        }
        if (result.state) applyState(result.state);
        setThreadReload((value) => value + 1);
      };

      const handleAdd = async () => {
        setFormError('');
        const code = addCodeInput.trim();
        if (!code) return;
        setAddBusy(true);
        const result = await post('/contacts', { code });
        setAddBusy(false);
        if (!result.ok) {
          const known = {
            'invalid-code': t('badCard'),
            'own-code': t('ownCode'),
            'too-many-contacts': t('tooMany'),
          };
          setFormError(known[result.error] || result.detail || t('loadError'));
          return;
        }
        setAddCodeInput('');
        setOverlay(null);
      };

      const openInfo = (contact) => {
        setRenameDraft(contact.name || '');
        setClearArmed(false);
        setRemoveArmed(false);
        setFormError('');
        setCopied('');
        setOverlay({ kind: 'info', contactId: contact.id });
      };

      const handleSaveSettings = async () => {
        setFormError('');
        const name = settingsNick.trim();
        if (!name) {
          setFormError(t('needName'));
          return;
        }
        if (!normalizeRelay(settingsRelay)) {
          setFormError(t('badRelay'));
          return;
        }
        const result = await post('/self', { nick: name, relay: settingsRelay });
        if (result.ok) setOverlay(null);
        else setFormError(result.detail || t('loadError'));
      };

      /* -------------------------------------------------------------- *
       * Render helpers
       * -------------------------------------------------------------- */

      const renderAvatar = (contact) =>
        h('span', { className: 'dsh-msg-avatar' }, initial(contact.name || ''));

      const renderOverlay = () => {
        if (!overlay) return null;

        if (overlay.kind === 'image') {
          return h(
            'div',
            {
              className: 'dsh-msg-overlay dsh-msg-lightbox',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('imageView'),
              onClick: () => setOverlay(null),
            },
            h('img', {
              className: 'dsh-msg-lightbox-image',
              src:
                API +
                '/image?id=' +
                encodeURIComponent(overlay.messageId) +
                '&v=' +
                (overlay.at || 0),
              alt: overlay.name || t('imageBadge'),
              onClick: () => setOverlay(null),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-msg-close dsh-msg-lightbox-close',
                title: t('close'),
                'aria-label': t('close'),
                onClick: (event) => {
                  event.stopPropagation();
                  setOverlay(null);
                },
              },
              closeGlyph(15),
            ),
          );
        }

        if (overlay.kind === 'add') {
          return h(
            'div',
            {
              className: 'dsh-msg-overlay',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('addTitle'),
              onClick: () => setOverlay(null),
            },
            h(
              'div',
              { className: 'dsh-msg-overlay-panel', onClick: (event) => event.stopPropagation() },
              h(
                'div',
                { className: 'dsh-msg-overlay-head' },
                h(
                  'div',
                  null,
                  h('h2', { className: 'dsh-msg-overlay-title' }, t('addTitle')),
                  h('p', { className: 'dsh-msg-overlay-hint' }, t('addHint')),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-close',
                    title: t('close'),
                    'aria-label': t('close'),
                    onClick: () => setOverlay(null),
                  },
                  closeGlyph(13),
                ),
              ),
              h(
                'label',
                { className: 'dsh-msg-field' },
                h('span', { className: 'dsh-msg-label' }, t('addCodeLabel')),
                h('textarea', {
                  className: 'dsh-msg-textarea',
                  spellCheck: false,
                  value: addCodeInput,
                  placeholder: t('addCodePlaceholder'),
                  onChange: (event) => setAddCodeInput(event.target.value),
                }),
              ),
              formError ? h('div', { className: 'dsh-msg-error' }, formError) : null,
              h(
                'div',
                { className: 'dsh-msg-row-actions' },
                h('span', { className: 'dsh-msg-grow' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-btn dsh-msg-btn--ghost',
                    onClick: () => setOverlay(null),
                  },
                  t('cancel'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                    disabled: addBusy || !addCodeInput.trim(),
                    onClick: () => void handleAdd(),
                  },
                  t('addButton'),
                ),
              ),
            ),
          );
        }

        if (overlay.kind === 'mycard') {
          const code = state ? state.addCode || '' : '';
          const cardText = buildCardText(lang, {
            name: state ? state.self.nick : '',
            code,
          });
          return h(
            'div',
            {
              className: 'dsh-msg-overlay',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('myCodeTitle'),
              onClick: () => setOverlay(null),
            },
            h(
              'div',
              { className: 'dsh-msg-overlay-panel', onClick: (event) => event.stopPropagation() },
              h(
                'div',
                { className: 'dsh-msg-overlay-head' },
                h(
                  'div',
                  null,
                  h('h2', { className: 'dsh-msg-overlay-title' }, t('myCodeTitle')),
                  h('p', { className: 'dsh-msg-overlay-hint' }, t('myCodeHint')),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-close',
                    title: t('close'),
                    'aria-label': t('close'),
                    onClick: () => setOverlay(null),
                  },
                  closeGlyph(13),
                ),
              ),
              h('textarea', {
                className: 'dsh-msg-code',
                readOnly: true,
                spellCheck: false,
                value: cardText,
                onFocus: (event) => event.target.select(),
              }),
              h(
                'div',
                { className: 'dsh-msg-row-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-btn dsh-msg-btn--ghost',
                    onClick: () => copyText(code, 'code'),
                  },
                  copyGlyph(13),
                  h('span', null, copied === 'code' ? t('copied') : t('copyCode')),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                    onClick: () => copyText(cardText, 'card'),
                  },
                  copyGlyph(13),
                  h('span', null, copied === 'card' ? t('copied') : t('copyCard')),
                ),
              ),
            ),
          );
        }

        const handleSaveUpdateSource = async () => {
          const spec = updateSpec.trim();
          if (spec && !/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[a-z0-9][a-z0-9._^~<>=*-]*)?$/i.test(spec)) {
            setUpdateNotice(t('updateBadSource'));
            return;
          }
          setUpdateBusy(true);
          const result = await post('/update/source', { spec });
          setUpdateBusy(false);
          if (!result.ok) {
            setUpdateNotice(t('updateFailed'));
            return;
          }
          setUpdateNotice(t('updateSourceSaved'));
        };

        const handleCheckUpdate = async () => {
          if (!updateSpec.trim()) {
            setUpdateNotice(t('updateNeedSource'));
            return;
          }
          setUpdateBusy(true);
          setUpdateNotice(t('updateChecking'));
          const result = await post('/update/check', { force: true });
          setUpdateBusy(false);
          if (!result.ok) {
            setUpdateNotice(updateErrorText(result.error));
            return;
          }
          const update = result.state && result.state.update;
          setUpdateNotice(update && update.available ? t('updateAvailable') + ' ' + update.latest : t('updateUpToDate'));
        };

        const updateErrorText = (error) => {
          if (error === 'not-a-bundle') return t('updateNotBundle');
          if (error === 'spec-mismatch') return t('updateMismatch');
          if (error === 'not-found') return t('updateNotPublished');
          if (error === 'fake-update') return t('updateFake');
          if (error === 'no-plugin-manager') return t('updateNoManager');
          if (error === 'busy') return t('updateBusy');
          if (error === 'manifest-failed') return t('updateManifestFailed');
          if (error === 'download-failed') return t('updateDownloadFailed');
          return t('updateFailed') + (error ? '（' + error + '）' : '');
        };

        const handleInstallUpdate = async () => {
          setUpdateBusy(true);
          setUpdateNotice(t('updateInstalling'));
          const result = await post('/update/install', {});
          setUpdateBusy(false);
          if (!result.ok) {
            setUpdateNotice(updateErrorText(result.error));
            return;
          }
          setUpdateNotice(
            result.application === 'simulated' ? t('updateSimulated') : t('updateUpToDate'),
          );
        };

        if (overlay.kind === 'settings') {
          const effectiveUpdateSpec =
            (state && state.update && state.update.spec) || '';
          const checkedAt = (state && state.update && state.update.checkedAt) || 0;
          const lastCheckedAt = checkedAt
            ? t('updateCheckedAt') +
              ' ' +
              new Date(checkedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          return h(
            'div',
            {
              className: 'dsh-msg-overlay',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('settingsTitle'),
              onClick: () => setOverlay(null),
            },
            h(
              'div',
              { className: 'dsh-msg-overlay-panel', onClick: (event) => event.stopPropagation() },
              h(
                'div',
                { className: 'dsh-msg-overlay-head' },
                h(
                  'div',
                  null,
                  h('h2', { className: 'dsh-msg-overlay-title' }, t('settingsTitle')),
                  h('p', { className: 'dsh-msg-overlay-hint' }, t('limitsHint')),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-close',
                    title: t('close'),
                    'aria-label': t('close'),
                    onClick: () => setOverlay(null),
                  },
                  closeGlyph(13),
                ),
              ),
              h(
                'label',
                { className: 'dsh-msg-field' },
                h('span', { className: 'dsh-msg-label' }, t('myName')),
                h('input', {
                  className: 'dsh-msg-input',
                  type: 'text',
                  maxLength: 40,
                  value: settingsNick,
                  onChange: (event) => setSettingsNick(event.target.value),
                }),
              ),
              h(
                'label',
                { className: 'dsh-msg-field' },
                h('span', { className: 'dsh-msg-label' }, t('defaultRelay')),
                h('input', {
                  className: 'dsh-msg-input',
                  type: 'url',
                  spellCheck: false,
                  value: settingsRelay,
                  onChange: (event) => setSettingsRelay(event.target.value),
                }),
                h('span', { className: 'dsh-msg-small' }, t('relayHint')),
              ),
              h(
                'div',
                { className: 'dsh-msg-section' },
                h('span', { className: 'dsh-msg-label' }, t('updateTitle')),
                h(
                  'span',
                  { className: 'dsh-msg-small' },
                  t('updateVersion') +
                    ' ' +
                    ((state && state.update && state.update.current) || '1.4.0') +
                    ' · ' +
                    t('updateClientBuild') +
                    ' ' +
                    CLIENT_BUILD,
                ),
                h(
                  'label',
                  { className: 'dsh-msg-field' },
                  h('span', { className: 'dsh-msg-label' }, t('updateSource')),
                  h('input', {
                    className: 'dsh-msg-input',
                    type: 'text',
                    spellCheck: false,
                    placeholder: 'dsh-chat-room 或 https://…/release.json',
                    value: updateSpec,
                    onChange: (event) => setUpdateSpec(event.target.value),
                  }),
                  h('span', { className: 'dsh-msg-small' }, t('updateSourceHint')),
                  effectiveUpdateSpec
                    ? h(
                        'span',
                        { className: 'dsh-msg-small' },
                        t('updateSourceInUse') + ' ' + effectiveUpdateSpec,
                      )
                    : null,
                  lastCheckedAt
                    ? h('span', { className: 'dsh-msg-small' }, lastCheckedAt)
                    : null,
                ),
                h(
                  'div',
                  { className: 'dsh-msg-row-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-msg-btn',
                      disabled: updateBusy,
                      onClick: () => void handleSaveUpdateSource(),
                    },
                    t('updateSave'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-msg-btn',
                      disabled: updateBusy,
                      onClick: () => void handleCheckUpdate(),
                    },
                    t('updateCheck'),
                  ),
                  state && state.update && state.update.available
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                          disabled: updateBusy,
                          onClick: () => void handleInstallUpdate(),
                        },
                        t('updateInstall'),
                      )
                    : null,
                  h('span', { className: 'dsh-msg-grow' }),
                ),
                state && state.update && state.update.available
                  ? h(
                      'span',
                      { className: 'dsh-msg-small' },
                      t('updateAvailable') + ' ' + state.update.latest,
                    )
                  : null,
                updateNotice ? h('span', { className: 'dsh-msg-small' }, updateNotice) : null,
              ),
              formError ? h('div', { className: 'dsh-msg-error' }, formError) : null,
              h(
                'div',
                { className: 'dsh-msg-row-actions' },
                h('span', { className: 'dsh-msg-grow' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                    onClick: () => void handleSaveSettings(),
                  },
                  t('save'),
                ),
              ),
            ),
          );
        }

        // Contact info: rename, clear history, remove.
        const contact = state
          ? state.contacts.find((entry) => entry.id === overlay.contactId) || null
          : null;
        if (!contact) return null;
        return h(
          'div',
          {
            className: 'dsh-msg-overlay',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('contactInfo'),
            onClick: () => setOverlay(null),
          },
          h(
            'div',
            { className: 'dsh-msg-overlay-panel', onClick: (event) => event.stopPropagation() },
            h(
              'div',
              { className: 'dsh-msg-overlay-head' },
              h(
                'div',
                null,
                h('h2', { className: 'dsh-msg-overlay-title' }, t('contactInfo')),
                h(
                  'p',
                  { className: 'dsh-msg-overlay-hint' },
                  contact.name || t('unnamed'),
                ),
                contact.auto
                  ? h('p', { className: 'dsh-msg-small' }, t('autoAddedInfo'))
                  : null,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-close',
                  title: t('close'),
                  'aria-label': t('close'),
                  onClick: () => setOverlay(null),
                },
                closeGlyph(13),
              ),
            ),
            h(
              'label',
              { className: 'dsh-msg-field' },
              h('span', { className: 'dsh-msg-label' }, t('renameLabel')),
              h('input', {
                className: 'dsh-msg-input',
                type: 'text',
                maxLength: 40,
                value: renameDraft,
                placeholder: t('namePlaceholder'),
                onChange: (event) => setRenameDraft(event.target.value),
              }),
            ),
            formError ? h('div', { className: 'dsh-msg-error' }, formError) : null,
            h('div', { className: 'dsh-msg-divider' }),
            h(
              'div',
              { className: 'dsh-msg-row-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-btn dsh-msg-danger',
                  'data-armed': clearArmed ? 'true' : 'false',
                  onClick: async () => {
                    if (!clearArmed) {
                      setClearArmed(true);
                      return;
                    }
                    setClearArmed(false);
                    const result = await post('/clear', { id: contact.id });
                    if (!result.ok) setFormError(result.detail || t('loadError'));
                  },
                },
                clearArmed ? t('clearConfirm') : t('clear'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-btn dsh-msg-danger',
                  'data-armed': removeArmed ? 'true' : 'false',
                  onClick: async () => {
                    if (!removeArmed) {
                      setRemoveArmed(true);
                      return;
                    }
                    setRemoveArmed(false);
                    const result = await post('/contacts/remove', { id: contact.id });
                    if (result.ok) setOverlay(null);
                    else setFormError(result.detail || t('loadError'));
                  },
                },
                removeArmed ? t('removeConfirm') : t('remove'),
              ),
              h('span', { className: 'dsh-msg-grow' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                  onClick: async () => {
                    const name = renameDraft.trim();
                    if (!name) {
                      setFormError(t('needName'));
                      return;
                    }
                    const result = await post('/contacts/rename', { id: contact.id, name });
                    if (!result.ok) {
                      setFormError(result.detail || t('loadError'));
                      return;
                    }
                    setFormError('');
                    setOverlay(null);
                  },
                },
                t('save'),
              ),
            ),
          ),
        );
      };

      /* -------------------------------------------------------------- *
       * Render: shell
       * -------------------------------------------------------------- */

      const contacts = state ? sortContacts(state.contacts) : [];
      const visible = contacts.filter((contact) => {
        if (!search.trim()) return true;
        const query = search.trim().toLowerCase();
        const preview = contact.lastMessage ? contact.lastMessage.text : '';
        return (
          (contact.name || '').toLowerCase().indexOf(query) >= 0 ||
          preview.toLowerCase().indexOf(query) >= 0
        );
      });

      const openAdd = () => {
        setAddCodeInput('');
        setFormError('');
        setOverlay({ kind: 'add' });
      };
      const openMyCode = () => {
        setCopied('');
        setOverlay({ kind: 'mycard' });
      };

      const rail = h(
        'aside',
        { className: 'dsh-msg-rail', 'aria-label': t('title') },
        h(
          'div',
          { className: 'dsh-msg-rail-head' },
          h('span', { className: 'dsh-msg-rail-mark' }, contactsGlyph(17)),
          h('h1', { className: 'dsh-msg-rail-title' }, t('title')),
          h(
            'span',
            {
              className: 'dsh-msg-rail-version',
              'data-update': state && state.update && state.update.available ? 'true' : 'false',
            },
            'v' +
              ((state && state.update && state.update.current) || CLIENT_BUILD) +
              (state && state.update && state.update.available
                ? ' ↑' + state.update.latest
                : ''),
          ),
          state
            ? h(
                'span',
                { className: 'dsh-msg-rail-count' },
                contacts.length + ' ' + t('contactCount'),
              )
            : null,
          h(
            'div',
            { className: 'dsh-msg-rail-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-msg-btn dsh-msg-btn--icon',
                title: t('selfChat'),
                'aria-label': t('selfChat'),
                onClick: () => void openSelfChat(),
              },
              selfGlyph(15),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-msg-btn dsh-msg-btn--icon',
                title: t('addContact'),
                'aria-label': t('addContact'),
                onClick: openAdd,
              },
              plusGlyph(14),
            ),
          ),
        ),
        contacts.length
          ? h('input', {
              className: 'dsh-msg-search',
              type: 'search',
              value: search,
              placeholder: t('searchPlaceholder'),
              'aria-label': t('searchPlaceholder'),
              onChange: (event) => setSearch(event.target.value),
            })
          : null,
        h(
          'div',
          { className: 'dsh-msg-list', onScroll: () => setRowMenu(null) },
          visible.length
            ? visible.map((contact) =>
                h(
                  'button',
                  {
                    key: contact.id,
                    type: 'button',
                    className: 'dsh-msg-row',
                    'data-active': contact.id === activeId ? 'true' : 'false',
                    'aria-current': contact.id === activeId ? 'true' : undefined,
                    onClick: () => void openContact(contact.id),
                    onContextMenu: (event) => openRowMenu(event, contact),
                    // The keyboard context-menu key opens the same menu.
                    onKeyDown: (event) => {
                      if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) {
                        return;
                      }
                      event.preventDefault();
                      openRowMenu(event, contact);
                    },
                  },
                  renderAvatar(contact),
                  h(
                    'span',
                    { className: 'dsh-msg-row-body' },
                    h(
                      'span',
                      { className: 'dsh-msg-row-top' },
                      h(
                        'span',
                        {
                          className: 'dsh-msg-row-name',
                          title: t('renameHint'),
                          onClick: (event) => {
                            event.stopPropagation();
                            openInfo(contact);
                          },
                        },
                        contact.name || t('unnamed'),
                        contact.self
                          ? h('span', { className: 'dsh-msg-chip' }, t('selfBadge'))
                          : null,
                        h(
                          'span',
                          { className: 'dsh-msg-rename', 'aria-hidden': true },
                          pencilGlyph(12),
                        ),
                      ),
                      h(
                        'span',
                        { className: 'dsh-msg-row-time' },
                        contact.lastMessage ? shortTime(contact.lastMessage.at) : '',
                      ),
                      // A pinned row keeps a small marker, but pinning itself
                      // is on the row's right-click menu. Notes to myself are
                      // always first, so they never carry a pin.
                      contact.pinned && !contact.self
                        ? h(
                            'span',
                            {
                              className: 'dsh-msg-pinned',
                              title: t('pinned'),
                              'aria-label': t('pinned'),
                            },
                            pinGlyph(12),
                          )
                        : null,
                    ),
                    h(
                      'span',
                      { className: 'dsh-msg-row-preview' },
                      contact.lastMessage
                        ? (contact.lastMessage.mine ? t('you') + ': ' : '') +
                          contact.lastMessage.text
                        : contact.via === 'ping'
                          ? t('addedYou')
                          : contact.auto
                            ? t('autoAdded')
                            : t('waitingPeer'),
                    ),
                  ),
                  unread[contact.id]
                    ? h(
                        'span',
                        {
                          className: 'dsh-msg-badge',
                          title: formatUnreadTitle(t, unread[contact.id]),
                        },
                        String(unread[contact.id]),
                      )
                    : contact.auto && !contact.lastMessage
                      ? h('span', { className: 'dsh-msg-badge' }, t('newBadge'))
                      : null,
                ),
              )
            : h(
                'p',
                { className: 'dsh-msg-list-empty' },
                contacts.length ? t('searchPlaceholder') : t('noContactsHint'),
              ),
        ),
        state
          ? h(
              'div',
              { className: 'dsh-msg-rail-foot' },
              h(
                'div',
                { className: 'dsh-msg-self' },
                h('span', { className: 'dsh-msg-self-name' }, state.self.nick || t('you')),
                h(
                  'span',
                  { className: 'dsh-msg-self-hint' },
                  state.self.unnamed ? t('setYourName') : statusLabel(status, t),
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-btn dsh-msg-btn--code',
                  title: t('myCodeTitle'),
                  onClick: openMyCode,
                },
                t('myCodeShort'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-btn dsh-msg-btn--icon',
                  title: state.update && state.update.available
                    ? t('updateAvailable') + ' ' + state.update.latest
                    : t('settingsTitle'),
                  'aria-label': t('settingsTitle'),
                  onClick: () => {
                    setSettingsNick(state.self.nick || '');
                    setSettingsRelay(state.relay || DEFAULT_RELAY);
                    setUpdateSpec((state.update && state.update.spec) || '');
                    setUpdateNotice('');
                    setFormError('');
                    setOverlay({ kind: 'settings' });
                  },
                },
                gearGlyph(16),
                state.update && state.update.available ? updateDot() : null,
              ),
            )
          : null,
      );

      let main;
      if (!state) {
        main = h(
          'div',
          { className: 'dsh-msg-welcome' },
          h(
            'div',
            { className: 'dsh-msg-card' },
            h(
              'div',
              { className: 'dsh-msg-card-head' },
              h('span', { className: 'dsh-msg-card-mark' }, contactsGlyph(22)),
              h('h1', { className: 'dsh-msg-card-title' }, t('title')),
            ),
            h('p', { className: 'dsh-msg-card-hint' }, loadError || '…'),
            loadError
              ? h(
                  'div',
                  { className: 'dsh-msg-row-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                      onClick: () => {
                        setLoadError('');
                        setReloadKey((value) => value + 1);
                      },
                    },
                    t('retry'),
                  ),
                )
              : null,
          ),
        );
      } else if (!state.contacts.length) {
        main = h(
          'div',
          { className: 'dsh-msg-welcome' },
          h(
            'div',
            { className: 'dsh-msg-card' },
            h(
              'div',
              { className: 'dsh-msg-card-head' },
              h('span', { className: 'dsh-msg-card-mark' }, contactsGlyph(22)),
              h('h1', { className: 'dsh-msg-card-title' }, t('noContactsTitle')),
            ),
            h('p', { className: 'dsh-msg-card-hint' }, t('noContactsHint')),
            h(
              'div',
              { className: 'dsh-msg-row-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                  onClick: openAdd,
                },
                t('addContact'),
              ),
              h(
                'button',
                { type: 'button', className: 'dsh-msg-btn', onClick: openMyCode },
                t('myCode'),
              ),
            ),
          ),
        );
      } else if (!activeContact) {
        main = h(
          'div',
          { className: 'dsh-msg-welcome' },
          h(
            'div',
            { className: 'dsh-msg-card' },
            h(
              'div',
              { className: 'dsh-msg-card-head' },
              h('span', { className: 'dsh-msg-card-mark' }, contactsGlyph(22)),
              h('h1', { className: 'dsh-msg-card-title' }, t('selectContact')),
            ),
            h('p', { className: 'dsh-msg-card-hint' }, t('selectContactHint')),
            h(
              'div',
              { className: 'dsh-msg-row-actions' },
              h(
                'button',
                { type: 'button', className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT, onClick: openAdd },
                t('addContact'),
              ),
              h(
                'button',
                { type: 'button', className: 'dsh-msg-btn', onClick: openMyCode },
                t('myCode'),
              ),
            ),
          ),
        );
      } else {
        const threadMessages = messages;
        main = h(
          'section',
          { className: 'dsh-msg-thread', 'aria-label': activeContact.name || t('unnamed') },
          h(
            'header',
            { className: 'dsh-msg-thread-head' },
            renderAvatar(activeContact),
            h(
              'div',
              { className: 'dsh-msg-thread-title' },
              h(
                'h2',
                { className: 'dsh-msg-thread-name' },
                activeContact.name || t('unnamed'),
                activeContact.self
                  ? h('span', { className: 'dsh-msg-chip' }, t('selfBadge'))
                  : null,
              ),
              h(
                'span',
                { className: 'dsh-msg-thread-status' },
                statusLabel(status, t),
                activeContact.short
                  ? h('span', { className: 'dsh-msg-chip' }, '#' + activeContact.short)
                  : null,
                activeContact.unnamed
                  ? h('span', { className: 'dsh-msg-chip' }, t('noNameYet'))
                  : null,
                activeContact.via === 'ping' && messages.length === 0
                  ? h('span', { className: 'dsh-msg-chip' }, t('addedYou'))
                  : null,
              ),
            ),
            h(
              'div',
              { className: 'dsh-msg-thread-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-msg-btn',
                  onClick: () => openInfo(activeContact),
                },
                t('info'),
              ),
            ),
          ),
          status === 'error' && state.error
            ? h(
                'div',
                { className: 'dsh-msg-banner' },
                h('span', null, t('relayError')),
                h('span', { className: 'dsh-msg-banner-detail' }, state.error),
              )
            : null,
          threadError
            ? h(
                'div',
                { className: 'dsh-msg-banner' },
                h('span', null, threadError),
                h('span', { className: 'dsh-msg-grow' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-btn dsh-msg-btn--ghost',
                    onClick: () => {
                      loadedRef.current.delete(activeId);
                      setThreadError('');
                      setThreadReload((value) => value + 1);
                    },
                  },
                  t('retry'),
                ),
              )
            : null,
          h(
            'div',
            { className: 'dsh-msg-messages', ref: messageListRef },
            threadMessages.length === 0
              ? h(
                  'div',
                  { className: 'dsh-msg-thread-empty' },
                  h('div', { className: 'dsh-msg-thread-empty-art' }, contactsGlyph(40)),
                  h('p', { className: 'dsh-msg-thread-empty-title' }, t('noMessages')),
                  h('p', { className: 'dsh-msg-thread-empty-hint' }, t('noMessagesHint')),
                )
              : (() => {
                  // A heading marks where a new day starts.
                  const rows = [];
                  let lastDay = '';
                  threadMessages.forEach((message) => {
                    const key = dayKey(message.at);
                    if (key !== lastDay) {
                      lastDay = key;
                      rows.push(
                        h(
                          'div',
                          { key: 'day-' + key, className: 'dsh-msg-daysep' },
                          h('span', null, dayLabel(message.at, lang, t)),
                        ),
                      );
                    }
                    rows.push(
                      h(
                        'div',
                        {
                          key: message.id,
                          className: 'dsh-msg-message',
                          'data-mine': message.mine ? 'true' : 'false',
                          'data-msg-id': message.id,
                        },
                        h(
                          'div',
                          { className: 'dsh-msg-bubble' },
                          message.quote
                            ? h(
                                'div',
                                {
                                  className: 'dsh-msg-quote',
                                  title: t('jumpToQuoted'),
                                  onClick: () => {
                                    try {
                                      const target = document.querySelector(
                                        '[data-msg-id="' + message.quote.id + '"]',
                                      );
                                      if (target && target.scrollIntoView) {
                                        target.scrollIntoView({ block: 'center' });
                                      }
                                    } catch (err) {
                                      /* the quoted message may be gone */
                                    }
                                  },
                                },
                                h(
                                  'span',
                                  { className: 'dsh-msg-quote-name' },
                                  message.quote.name || t('unnamed'),
                                ),
                                h(
                                  'span',
                                  { className: 'dsh-msg-quote-text' },
                                  message.quote.text || t('imageBadge'),
                                ),
                              )
                            : null,
                          message.image
                            ? h('img', {
                                className: 'dsh-msg-image',
                                src:
                                  '/plugin/chat-room/image?id=' +
                                  encodeURIComponent(message.id) +
                                  '&v=' +
                                  (message.at || 0),
                                alt: message.image.name || t('imageBadge'),
                                loading: 'lazy',
                                onClick: () =>
                                  setOverlay({
                                    kind: 'image',
                                    messageId: message.id,
                                    at: message.at || 0,
                                    name: message.image.name || '',
                                  }),
                              })
                            : null,
                          message.text
                            ? h('div', { className: 'dsh-msg-text' }, message.text)
                            : null,
                        ),
                        h(
                          'div',
                          {
                            className: 'dsh-msg-meta',
                            'data-failed': message.failed ? 'true' : 'false',
                          },
                          // The name of the person who wrote it comes first,
                          // so a message is never left without an author.
                          (message.mine
                            ? t('you')
                            : activeContact.name || t('unnamed')) +
                            ' · ' +
                            formatTime(message.at) +
                            (message.pending ? ' · ' + t('sending') : '') +
                            (message.failed ? ' · ' + t('failed') : ''),
                          message.pending
                            ? null
                            : h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'dsh-msg-reply',
                                  onClick: () =>
                                    setReplyTo({
                                      id: message.id,
                                      name: message.mine
                                        ? t('you')
                                        : activeContact.name || t('unnamed'),
                                      text: message.image
                                        ? t('imageBadge')
                                        : String(message.text || '').slice(0, 160),
                                    }),
                                },
                                t('reply'),
                              ),
                        ),
                      ),
                    );
                  });
                  return rows;
                })(),
          ),
          sendError ? h('div', { className: 'dsh-msg-banner' }, h('span', null, sendError)) : null,
          state &&
          state.update &&
          state.update.current &&
          state.update.current !== CLIENT_BUILD
            ? h(
                'div',
                { className: 'dsh-msg-banner dsh-msg-banner--info' },
                h(
                  'span',
                  null,
                  t('updatedTo') + ' ' + state.update.current + ' · ' + t('reloadHint'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-btn dsh-msg-btn--code',
                    onClick: () => {
                      try {
                        window.location.reload();
                      } catch (err) {
                        /* nothing else to do */
                      }
                    },
                  },
                  t('reloadNow'),
                ),
              )
            : null,
          replyTo
            ? h(
                'div',
                { className: 'dsh-msg-replybar' },
                h('span', { className: 'dsh-msg-replybar-mark' }, '↩'),
                h(
                  'span',
                  { className: 'dsh-msg-replybar-name' },
                  t('replyingTo') + ' ' + replyTo.name,
                ),
                h('span', { className: 'dsh-msg-replybar-text' }, replyTo.text),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-msg-replybar-close',
                    'aria-label': t('cancelReply'),
                    onClick: () => setReplyTo(null),
                  },
                  '✕',
                ),
              )
            : null,
          h(
            'div',
            { className: 'dsh-msg-composer' },
            h('textarea', {
              className: 'dsh-msg-composer-input',
              value: draft,
              maxLength: MAX_TEXT,
              placeholder: t('composerPlaceholder'),
              'aria-label': t('composerPlaceholder'),
              onChange: (event) => setDraft(event.target.value),
              onPaste: (event) => void handlePaste(event),
              onDragOver: (event) => {
                if (event.dataTransfer) event.preventDefault();
              },
              onDrop: (event) => {
                const transfer = event.dataTransfer;
                const file = pickPastedImage(transfer && transfer.files ? transfer.files : null);
                if (!file) return;
                event.preventDefault();
                void sendPicture(file);
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void handleSend();
                }
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-msg-btn dsh-msg-btn--primary',
                    style: PRIMARY_TEXT,
                disabled: !draft.trim(),
                onClick: () => void handleSend(),
              },
              t('send'),
            ),
          ),
        );
      }

      return h(
        'div',
        { className: 'dsh-msg-root' },
        rail,
        h('div', { className: 'dsh-msg-main' }, main),
        renderOverlay(),
        renderRowMenu(),
      );
    }

    /* ------------------------------------------------------------------ *
     * Device-side resource Provider — source: 'messages'
     *
     * The transcripts live on the Host side, so this Provider reads them
     * through the same-origin API the panel itself uses. The browser never
     * keeps a copy of the messages, and nothing else has to know how they
     * are stored: the registry only sees the Provider below.
     *
     * A message id is "<contactId>::<messageId>", so a later read can find
     * the exact line again. Next to that the Provider understands the
     * aggregate selector "all" and the conversation selector
     * "contact:<contactId>".
     * ------------------------------------------------------------------ */

    /** How many contacts one search reads. A search must stay cheap. */
    const MAX_SEARCH_CONTACTS = 12;

    /** How much of a message a search snippet shows. */
    const SNIPPET_LENGTH = 160;

    /** The words this provider needs in both languages. */
    const PROVIDER_WORDS = {
      zh: { you: '你', unnamed: '未命名联系人', chatWith: (name) => `与 ${name} 的对话` },
      en: { you: 'You', unnamed: 'Unnamed contact', chatWith: (name) => `Chat with ${name}` },
    };

    /** 'zh' for a Chinese locale, 'en' for everything else. */
    function providerLang(locale) {
      return String(locale || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
    }

    /** The name the panel shows for a contact. */
    function providerContactName(contact, lang) {
      const name = contact && typeof contact.name === 'string' ? contact.name.trim() : '';
      return name || PROVIDER_WORDS[lang].unnamed;
    }

    /** The name of the person who wrote a message. */
    function providerSender(message, contact, lang) {
      if (message && message.mine === true) return PROVIDER_WORDS[lang].you;
      const from = message && typeof message.from === 'string' ? message.from.trim() : '';
      if (from) return from;
      return providerContactName(contact, lang);
    }

    /** The colon between a sender and their text. */
    function providerSeparator(lang) {
      return lang === 'zh' ? '：' : ': ';
    }

    /** "2026-10-27 16:20" in the local time of this machine. */
    function providerStamp(at) {
      if (!Number.isFinite(at) || at <= 0) return '';
      const date = new Date(at);
      const pad = (value) => String(value).padStart(2, '0');
      return (
        date.getFullYear() +
        '-' +
        pad(date.getMonth() + 1) +
        '-' +
        pad(date.getDate()) +
        ' ' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes())
      );
    }

    /** Is a timestamp inside the requested range? */
    function providerInRange(timeRange, at) {
      if (!timeRange || typeof timeRange !== 'object') return true;
      const hasFrom = Number.isFinite(timeRange.from);
      const hasTo = Number.isFinite(timeRange.to);
      if (!hasFrom && !hasTo) return true;
      const stamp = Number.isFinite(at) ? at : 0;
      if (stamp <= 0) return false;
      if (hasFrom && stamp < timeRange.from) return false;
      if (hasTo && stamp > timeRange.to) return false;
      return true;
    }

    /** The newest message time of a contact, or the contact's creation time. */
    function providerLastAt(contact) {
      const last = contact && contact.lastMessage ? contact.lastMessage.at : 0;
      if (Number.isFinite(last) && last > 0) return last;
      return contact && Number.isFinite(contact.createdAt) ? contact.createdAt : 0;
    }

    /**
     * Registers one Provider with the device-side resource registry.
     *
     * The registry lives in another bundle, so the helper travels with the
     * plugin that uses it. The registration works in either load order: if
     * the registry is already mounted the Provider goes through its sink,
     * otherwise it waits in the queue and the registry drains the queue when
     * it loads.
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

    /** One JSON request to the Host half of this plugin. */
    async function fetchJson(path, signal) {
      const response = await fetch(API + path, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      if (!response || !response.ok) {
        throw new Error('chat-room API answered HTTP ' + (response ? response.status : 'error'));
      }
      return response.json();
    }

    /**
     * The Provider of this plugin: the transcripts the Host half keeps.
     *
     * `localeId` returns the active locale of the panel, so the names inside
     * a conversation transcript read like the rest of the panel.
     */
    function createMessagesProvider(options) {
      const settings = options && typeof options === 'object' ? options : {};
      const localeId = typeof settings.localeId === 'function' ? settings.localeId : () => '';

      /** The contact list with the contact cards the Host half sends. */
      async function fetchState(signal) {
        const payload = await fetchJson('/state', signal);
        if (!payload || payload.ok !== true || !payload.state) {
          throw new Error('chat-room state is not available');
        }
        return payload.state;
      }

      /** One conversation. A contact that does not exist has no thread. */
      async function fetchThread(contactId, signal) {
        if (!contactId) return null;
        const payload = await fetchJson('/thread?id=' + encodeURIComponent(contactId), signal);
        if (!payload || payload.ok !== true) return null;
        return {
          contact:
            payload.contact && typeof payload.contact === 'object' ? payload.contact : null,
          messages: Array.isArray(payload.messages) ? payload.messages : [],
        };
      }

      /** One message, addressed by "<contactId>::<messageId>". */
      function messageItem(id, message, contact, lang) {
        const at = Number.isFinite(message.at) ? message.at : 0;
        const mine = message.mine === true;
        const name = providerContactName(contact, lang);
        const contactId = contact && typeof contact.id === 'string' ? contact.id : '';
        return {
          id,
          // The heading of a message names its sender, so an own message is
          // not filed under the other person's name.
          title: providerSender(message, contact, lang),
          text: typeof message.text === 'string' ? message.text : '',
          updatedAt: at,
          createdAt: at,
          itemType: 'message',
          attributes: {
            contact: name,
            contact_id: contactId,
            direction: mine ? 'out' : 'in',
            at,
          },
          meta: {
            contactId,
            contactName: contact && typeof contact.name === 'string' ? contact.name.trim() : '',
            mine,
            from: typeof message.from === 'string' ? message.from : '',
          },
        };
      }

      /** One conversation as one transcript, one line per message. */
      function chatItem(id, contact, messages, lang) {
        const list = (Array.isArray(messages) ? messages : [])
          .filter((entry) => entry && typeof entry === 'object')
          .slice()
          .sort(
            (left, right) =>
              (Number.isFinite(left.at) ? left.at : 0) - (Number.isFinite(right.at) ? right.at : 0),
          );
        const name = providerContactName(contact, lang);
        const lines = [];
        let updated = 0;
        let created = 0;
        for (const message of list) {
          const at = Number.isFinite(message.at) ? message.at : 0;
          if (at) {
            if (!created || at < created) created = at;
            if (at > updated) updated = at;
          }
          const text = typeof message.text === 'string' ? message.text : '';
          lines.push(
            '[' + providerStamp(at) + '] ' + providerSender(message, contact, lang) + ': ' + text,
          );
        }
        const fallback =
          contact && Number.isFinite(contact.createdAt) ? contact.createdAt : 0;
        if (!updated) updated = fallback;
        if (!created) created = updated;
        return {
          id,
          title: name,
          text: lines.join('\n'),
          updatedAt: updated,
          createdAt: created,
          itemType: 'chat',
          attributes: { name, updated_at: updated },
          meta: {
            contactId: contact && typeof contact.id === 'string' ? contact.id : '',
            contactName: contact && typeof contact.name === 'string' ? contact.name.trim() : '',
            mine: false,
            from: '',
          },
        };
      }

      return {
        source: 'messages',
        title: { zh: '消息', en: 'Messages' },
        kind: 'conversation',
        icon: 'session',
        aliases: [
          '消息',
          '聊天',
          '对话',
          '联系人',
          'message',
          'messages',
          'chat',
          'chatroom',
          'contact',
        ],
        labels: {
          all: { zh: '全部消息', en: 'All messages' },
          unit: { zh: '位联系人', en: 'contacts' },
          item: { zh: '消息', en: 'Messages' },
          group: { zh: '会话', en: 'Chats' },
          empty: { zh: '暂无消息', en: 'No messages' },
        },
        /** The aggregate candidate: how many people this installation talks to. */
        async describe(locale) {
          const state = await fetchState().catch(() => null);
          const count = state && Array.isArray(state.contacts) ? state.contacts.length : 0;
          if (providerLang(locale) === 'zh') return count + ' 位联系人';
          return count + ' contact' + (count === 1 ? '' : 's');
        },
        /**
         * Every stored message that matches the query, newest first. The work
         * is bounded: at most twelve conversations are read.
         */
        async search(params) {
          const request = params && typeof params === 'object' ? params : {};
          const query =
            typeof request.query === 'string' ? request.query.trim().toLowerCase() : '';
          const timeRange =
            request.timeRange && typeof request.timeRange === 'object' ? request.timeRange : null;
          const signal = request.signal;
          const offset =
            Number.isFinite(request.offset) && request.offset > 0 ? Math.floor(request.offset) : 0;
          const limit =
            Number.isFinite(request.limit) && request.limit > 0 ? Math.floor(request.limit) : 20;
          const lang = providerLang(localeId());

          const state = await fetchState(signal);
          const contacts = (
            state && Array.isArray(state.contacts) ? state.contacts : []
          ).filter((contact) => contact && typeof contact.id === 'string' && contact.id);
          // The newest conversation first, so the bound below keeps the ones
          // that were actually used lately.
          const ordered = contacts
            .slice()
            .sort((left, right) => providerLastAt(right) - providerLastAt(left));
          const picked = ordered.slice(0, MAX_SEARCH_CONTACTS);

          const found = [];
          const threads = await Promise.all(
            picked.map((contact) => fetchThread(contact.id, signal).catch(() => null)),
          );
          for (let index = 0; index < picked.length; index += 1) {
            const contact = picked[index];
            const thread = threads[index];
            if (!thread) continue;
            const name = providerContactName(contact, lang);
            for (const message of thread.messages) {
              if (!message || typeof message !== 'object') continue;
              if (typeof message.id !== 'string' || !message.id) continue;
              const text = typeof message.text === 'string' ? message.text : '';
              if (!text.trim()) continue;
              const at = Number.isFinite(message.at) ? message.at : 0;
              if (!providerInRange(timeRange, at)) continue;
              if (
                query &&
                name.toLowerCase().indexOf(query) < 0 &&
                text.toLowerCase().indexOf(query) < 0
              ) {
                continue;
              }
              const mine = message.mine === true;
              const preview = text.trim().slice(0, SNIPPET_LENGTH);
              found.push({
                id: contact.id + '::' + message.id,
                // The label of a message is "sender: text", the way the panel
                // and the # menu have always shown it.
                title:
                  providerSender(message, contact, lang) + providerSeparator(lang) + preview,
                snippet: preview,
                updatedAt: at,
                createdAt: at,
                meta: {
                  contactId: contact.id,
                  contactName:
                    contact && typeof contact.name === 'string' ? contact.name.trim() : '',
                  mine,
                  from: typeof message.from === 'string' ? message.from : '',
                  group: {
                    id: contact.id,
                    title: name,
                    label: PROVIDER_WORDS[lang].chatWith(name),
                    readId: 'contact:' + contact.id,
                  },
                },
              });
            }
          }
          found.sort((left, right) => right.updatedAt - left.updatedAt);
          return { items: found.slice(offset, offset + limit), total: found.length };
        },
        /**
         * The messages behind the requested ids: one message per
         * "<contactId>::<messageId>", one transcript per "contact:<contactId>"
         * and one transcript per contact for the aggregate selector "all".
         */
        async read(params) {
          const request = params && typeof params === 'object' ? params : {};
          const ids = Array.isArray(request.ids) ? request.ids : [];
          const signal = request.signal;
          const lang = providerLang(localeId());

          const threads = new Map();
          const loadThread = (contactId) => {
            if (!contactId) return Promise.resolve(null);
            if (!threads.has(contactId)) {
              threads.set(contactId, fetchThread(contactId, signal).catch(() => null));
            }
            return threads.get(contactId);
          };

          const messageRefs = [];
          const conversationRefs = [];
          let wantAll = false;
          for (const raw of ids) {
            const id = typeof raw === 'string' ? raw.trim() : '';
            if (!id) continue;
            if (id === 'all') {
              wantAll = true;
              continue;
            }
            if (id.indexOf('contact:') === 0) {
              conversationRefs.push(id.slice('contact:'.length));
              continue;
            }
            const separator = id.indexOf('::');
            if (separator > 0) {
              messageRefs.push({
                id,
                contactId: id.slice(0, separator),
                messageId: id.slice(separator + 2),
              });
            }
            // Anything else cannot be resolved and is simply left out.
          }

          const items = [];

          for (const ref of messageRefs) {
            const thread = await loadThread(ref.contactId);
            if (!thread) continue;
            const message = thread.messages.find(
              (entry) => entry && entry.id === ref.messageId,
            );
            if (!message) continue;
            items.push(messageItem(ref.id, message, thread.contact, lang));
          }

          for (const contactId of conversationRefs) {
            const thread = await loadThread(contactId);
            if (!thread) continue;
            items.push(chatItem('contact:' + contactId, thread.contact, thread.messages, lang));
          }

          if (wantAll) {
            const state = await fetchState(signal).catch(() => null);
            const contacts = (
              state && Array.isArray(state.contacts) ? state.contacts : []
            ).filter((contact) => contact && typeof contact.id === 'string' && contact.id);
            const ordered = contacts
              .slice()
              .sort((left, right) => providerLastAt(right) - providerLastAt(left));
            for (const contact of ordered) {
              const thread = await loadThread(contact.id);
              if (!thread) continue;
              items.push(chatItem(contact.id, thread.contact || contact, thread.messages, lang));
            }
          }

          return { items };
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Plugin
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      // Exposed so the unit test can exercise the clipboard picker without a
      // browser; the loader ignores anything beyond inject/apply.
      __test: {
        pickPastedImage,
        formatUnreadTitle,
        sortContacts,
        clampMenuPosition,
        localeWords: DICTS,
      },
      apply(ctx) {
        const t = ctx.locale.bind(NS);

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
              /* already registered */
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
        }, 'chat-room-locale');

        // Register this plugin's release list with the Notes plugin. Exactly one
        // registration per plugin: the service keys descriptors by plugin id.
        ctx.effect(() => {
          const descriptor = {
            id: '@local/chat-room',
            title: { zh: '消息', en: 'Messages' },
            noteTitle: { zh: '消息版本记录', en: 'Messages version log' },
            previousNoteTitles: [
              { zh: '联系人版本记录', en: 'Contacts version log' },
              { zh: '消息插件版本记录', en: 'Messages plugin version log' },
            ],
            version: '1.11.2',
            entries: [
              {
                version: '1.11.2',
                at: '2026-10-29T23:29+08:00',
                source: 'self-driven',
                points: {
                  zh: [
                    '会话置顶改成右键菜单：在会话上点右键即可「置顶」或「取消置顶」，鼠标悬停时不再冒出图钉按钮',
                    '已置顶的会话仍带一个小图钉标记；「我聊」始终排在最前，右键不弹置顶菜单',
                  ],
                  en: [
                    'Pinning now lives in a right-click menu: right-click a conversation to pin or unpin it, and no pin button pops up on hover anymore',
                    'Pinned conversations keep a small pin marker; "Chat with myself" always stays first and has no pin menu',
                  ],
                },
              },
              {
                version: '1.11.1',
                at: '2026-10-29T23:11+08:00',
                source: 'external',
                sourceName: 'Codex',
                points: {
                  zh: [
                    '发布签名私钥只保存在本机 plugin-data 目录，不再进入插件源码、同步镜像或公开仓库',
                    '发布脚本默认从受保护的数据目录读取密钥，并在源码层忽略任何误放的私钥文件',
                  ],
                  en: [
                    'The release-signing private key now stays only in the local plugin-data directory and never enters plugin source, sync mirrors or public repositories',
                    'The release script reads the key from protected local data by default, while source control ignores any accidentally placed private-key file',
                  ],
                },
              },
              {
                version: '1.11.0',
                at: '2026-10-29T23:01+08:00',
                source: 'self-driven',
                points: {
                  zh: [
                    '会话列表支持置顶：鼠标移到一条会话上，点右侧的小图钉即可置顶，置顶的会话排在列表最前并一直显示图钉',
                    '再点一次图钉取消置顶；置顶只存在这台机器上，重启 DSH 后仍然保留',
                    '「我聊」始终排在最前，不受置顶影响',
                  ],
                  en: [
                    'Conversations can now be pinned: hover a row and click the small pin on the right; pinned rows sort to the top of the list and keep showing the pin',
                    'Click the pin again to unpin; the choice is stored on this machine and survives a restart',
                    '"Chat with myself" always stays first, regardless of pins',
                  ],
                },
              },
              {
                version: '1.10.0',
                at: '2026-10-29T21:29+08:00',
                source: 'self-driven',
                points: {
                  zh: [
                    '点开聊天里的图片现在会在应用内放大查看，不再依赖新标签页（桌面端常常打不开，看起来就像点了没反应）',
                    '放大后点图片、点空白处或按 Esc 都能关掉，右上角也有一个关闭按钮',
                  ],
                  en: [
                    'Clicking a picture in a conversation now zooms it inside the app instead of relying on a new browser tab, which the desktop app often cannot open',
                    'Click the picture, the backdrop or press Esc to close it; the close button in the corner works as well',
                  ],
                },
              },
              {
                version: '1.9.9',
                at: '2026-10-29T21:15+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '新增「我聊」：标题栏右侧的小人按钮，点开就是给自己记东西的会话，列表里排最前并带「自己」标记',
                    '给自己的消息只存在这台机器上：不走中继、不占额度、立刻送达；图片同样存本机，历史不会过期',
                    '给自己发图片、引用自己的消息、清空历史，都和普通会话一样',
                  ],
                  en: [
                    'New "chat with myself": the person button in the title row opens a conversation with yourself, pinned at the top of the list and marked "me"',
                    'Notes to yourself stay on this machine: they skip the relay, cost nothing and arrive at once; pictures are kept locally too',
                    'Pictures, quotes and clearing the history work like an ordinary conversation',
                  ],
                },
              },
              {
                version: '1.9.8',
                at: '2026-10-29T01:40+08:00',
                source: 'external',
                sourceName: 'Codex',
                points: {
                  zh: [
                    '根治侧栏「消息」在出现未读时整行消失：未读文案改为 DSH 支持的字符串模板，不再把函数交给多语言服务',
                    '侧栏图标和会话徽标共用防崩格式化：即使以后翻译项损坏，也只降级提示文案，不会再连带移除整个侧栏入口',
                    '新增回归测试，覆盖模板参数和翻译异常时的安全降级',
                  ],
                  en: [
                    'Fixed the Messages sidebar row disappearing as soon as an unread item arrived: the unread copy is now a DSH-compatible string template instead of a function passed to the locale service',
                    'The sidebar icon and conversation badge share a crash-safe formatter, so a malformed future translation can only degrade its tooltip instead of removing the whole slot row',
                    'Added regression coverage for template parameters and the safe fallback when translation fails',
                  ],
                },
              },
              {
                version: '1.9.7',
                at: '2026-10-28T15:50+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '去掉输入框旁边的「图片」按钮：现在直接把图片复制/截图粘贴进输入框就会发送，拖一张图片到输入框也可以',
                    '输入框的提示文案里写明了「粘贴图片可直接发送」，不用再猜',
                    '粘贴文字不受影响，只有真的带图片才会拦截',
                  ],
                  en: [
                    'The picture button next to the input is gone: copy or screenshot an image and paste it into the input to send it, or drop a file onto the input',
                    'The placeholder says that a pasted picture is sent, so nobody has to guess',
                    'Pasting text is untouched; only a real picture is intercepted',
                  ],
                },
              },
              {
                version: '1.9.6',
                at: '2026-10-28T15:35+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：界面版本号常量和安装包名常量停留在 1.8.0，所以「已更新到 x.y.z」的提示一直显示（它其实是对的：前端版本比已装版本旧）',
                    '打包时新增校验：界面版本、安装包名、版本记录三处必须与 package.json 的版本一致，不一致直接构建失败',
                  ],
                  en: [
                    'Fixed: the front-end build constant and the package file name constant were still 1.8.0, so the "updated to x.y.z" notice kept showing (it was right: the front end was older than the installed version)',
                    'The build now refuses to package when the front-end build, the package file name or the version log disagree with package.json',
                  ],
                },
              },
              {
                version: '1.9.5',
                at: '2026-10-28T15:15+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '刷新提示改用更可靠的判断：只要「当前安装的版本」和「页面里前端版本」不一致就提示，不再依赖状态里的额外字段',
                    '从这一版起，换包后页面上方会出现提示条和刷新按钮',
                  ],
                  en: [
                    'The reload notice now compares the installed version with the front end in the page instead of relying on an extra state field',
                    'From this version on a swap shows a notice with a reload button',
                  ],
                },
              },
              {
                version: '1.9.4',
                at: '2026-10-28T15:08+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：读回状态时把「已更新」标记丢掉了（normalize 只保留已知字段），所以刷新提示一直不出现',
                    '现在换包后、以及页面刷新前，都能看到「已更新到 x.y.z，刷新页面」的提示',
                  ],
                  en: [
                    'Fixed: reading the state back dropped the finished-update mark, because the normalizer only kept known fields, so the reload notice never appeared',
                    'After a swap the notice now shows until the page is reloaded',
                  ],
                },
              },
              {
                version: '1.9.3',
                at: '2026-10-28T15:00+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：更新完成的记录写在了强制重载之后，宿主已经在重启所以没存下来；现在先存再做开关',
                  ],
                  en: [
                    'Fixed: the finished-update record was written after the forced reload, so the restarting host never saved it; it is saved first now',
                  ],
                },
              },
              {
                version: '1.9.2',
                at: '2026-10-28T14:52+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '「已更新，刷新页面」提示改成持久化的：换包时宿主会重启，之前那条提示会跟着丢',
                    '提示只在前端版本落后于已装版本时出现，刷新后自动消失',
                  ],
                  en: [
                    'The after-update notice is persisted now: the host restarts as part of the swap, which used to drop it',
                    'It only appears while the page front end is behind the installed version, and goes away after a reload',
                  ],
                },
              },
              {
                version: '1.9.1',
                at: '2026-10-28T14:40+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：自动更新换包之后，浏览器里的前端没有重新加载，侧栏「消息」入口会消失（条目还在但是 inactive）',
                    '现在装完会再做一次开关，强制页面重新加载新前端',
                    '兜底：更新完成后界面顶部会出现一条提示，带「刷新页面」按钮',
                  ],
                  en: [
                    'Fixed: after an automatic update the front end in the page was not reloaded, so the sidebar entry could disappear while the row stayed inactive',
                    'The swap now switches the bundle off and on again, which makes the page load the new front end',
                    'As a fallback a notice with a reload button appears after an update',
                  ],
                },
              },
              {
                version: '1.9.0',
                at: '2026-10-28T14:45+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '可以发图片了：输入框左边的图片按钮，选一张就发出去（超过 1.5 MB 会自动压缩到 1600px 的 JPEG）',
                    '图片走中继的附件通道传，收到的同时会存一份到本机，所以过几天再看历史消息图片还在',
                    '可以引用某条消息回复：鼠标移到消息上点「引用」，上方会出现回复条；发出的消息里带着被引用的内容，点引用块可以跳回原消息',
                    '图片按 /plugin/chat-room/image 同源提供，不需要额外服务',
                  ],
                  en: [
                    'Pictures can be sent now: the picture button next to the input opens a picker (anything above 1.5 MB is scaled down to a 1600px JPEG)',
                    'Pictures travel as relay attachments and a copy is kept on this machine, so the history still shows them days later',
                    'A message can be quoted: hover a message and quote it, a bar appears above the input, and the sent message carries the quote; clicking the quote block jumps back to the original',
                    'Pictures are served same-origin at /plugin/chat-room/image, with no extra service',
                  ],
                },
              },
              {
                version: '1.8.2',
                at: '2026-10-28T14:25+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '新消息会用红点提示：侧栏「消息」入口上一个红点（所有未读合计），左侧对应会话格子上一个红色数字徽标（这个人有几条未读）',
                    '点消：点开某个会话就清掉那个人的红点，侧栏红点在全部读完后自动消失',
                    '未读计数放在常驻的监听里，所以面板关着的时候新消息也会点亮侧栏红点',
                    '自己的消息和正打开的会话不算未读',
                  ],
                  en: [
                    'New messages show a red dot: one on the sidebar entry (all unread together) and a red count on the conversation cell (how many are waiting from that person)',
                    'Clicking clears it: opening a conversation clears that person\'s dot, and the sidebar dot disappears once nothing is unread',
                    'Counting happens in the always-on watcher, so a message lights the sidebar dot even while the panel is closed',
                    'Your own messages and the open conversation are not counted',
                  ],
                },
              },
              {
                version: '1.8.1',
                at: '2026-10-27T19:45+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '消息按日期分组：跨天时中间插一条日期分隔条（今天 / 昨天 / 前天 / 具体日期）',
                    '分隔条居中、淡色，看起来像常见的聊天软件那样',
                    '这一版同时带上 1.8.0 的端侧资源 Provider（来源 id：messages）',
                  ],
                  en: [
                    'Messages are grouped by day: a heading separates one day from the next (today, yesterday, the day before, or the date)',
                    'The heading sits in the middle in a quiet colour, the way chat apps usually mark a new day',
                    'This build also carries the resource Provider of 1.8.0 (source id: messages)',
                  ],
                },
              },
              {
                version: '1.8.0',
                at: '2026-10-27T16:48+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '新增端侧资源接口的 Provider（来源 id：messages）：这个插件的聊天记录现在可以被统一检索和读取',
                    '检索走同源的插件接口读宿主端的记录，不读浏览器本地存储',
                    '一条消息的 id 是「联系人 id::消息 id」，还能用「all」取全部、用「contact:联系人 id」取整段对话',
                    '检索最多读 12 个联系人的会话，保证一次搜索不会太重',
                    '结果还是「谁说的：说了什么」的样子（你：你好），整段对话也能整段引用',
                  ],
                  en: [
                    'Added a Provider for the device-side resource interface (source id: messages): the transcripts of this plugin can now be searched and read through the unified interface',
                    'The search reads the Host-side transcripts through the same-origin plugin API, never from browser storage',
                    'A message id is "contact id::message id"; "all" returns every conversation and "contact:contact id" returns one whole conversation',
                    'A search reads at most twelve conversations, so one query never gets heavy',
                    'A result still reads "who said what" (You: hi), and a whole conversation can be quoted at once',
                  ],
                },
              },
              {
                version: '1.7.1',
                at: '2026-10-26T22:20+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '消息下面统一成「名字 · 时间」：自己的消息是「你 · 08:04」，对方的是「备注名 · 08:04」',
                  ],
                  en: [
                    'The line under a message now always reads name then time: your own messages say you, the other person says the remark you gave them',
                  ],
                },
              },
              {
                version: '1.7.0',
                at: '2026-10-26T21:55+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '每条消息下面都标出是谁发的：对方的消息显示你给他起的备注名，自己的消息显示「你」',
                    '这样两个人的对话里，一眼能看出哪句是谁说的',
                  ],
                  en: [
                    'Every message now carries the name of its author: a message from the other person shows the remark you gave them, and your own messages show you',
                    'In a conversation between two people it is now obvious at a glance who said what',
                  ],
                },
              },
              {
                version: '1.6.9',
                at: '2026-10-26T21:30+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '面板上的版本号在有新版时会变红并显示目标版本，比如 v1.6.9 ↑1.7.0',
                  ],
                  en: [
                    'The version in the panel turns red and shows the new version when one is out, for example v1.6.9 ↑1.7.0',
                  ],
                },
              },
              {
                version: '1.6.8',
                at: '2026-10-26T21:20+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '面板标题旁边常驻显示当前版本号（v1.6.8），不用进设置就能看到自己装的是哪一版',
                    '主按钮改成完整内联样式，浅色深色主题下都清楚（深色下白底白字的问题彻底解决）',
                  ],
                  en: [
                    'The panel title now always shows the installed version (v1.6.8), so it is visible without opening the settings',
                    'The primary button paints itself inline and reads clearly in both the dark and the light theme',
                  ],
                },
              },
              {
                version: '1.6.7',
                at: '2026-10-26T21:45+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '主按钮整个外观改成内联（底色、文字、边框、字重），不再依赖样式表里的强调色，标签不可能再看不见',
                    '强调色改成描边，按钮在深浅两种主题下都清楚',
                  ],
                  en: [
                    'The primary button paints its whole appearance inline (background, text, border, weight) instead of relying on the accent in the stylesheet, so the label can no longer be invisible',
                    'The accent became a border, so the button reads clearly in both the dark and the light theme',
                  ],
                },
              },
              {
                version: '1.6.6',
                at: '2026-10-26T21:35+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '设置里的「插件更新」现在同时显示宿主版本和界面版本，一眼能看出页面加载的是不是最新代码',
                    '界面上主按钮的文字颜色用内联样式，样式表再旧也压不住它',
                  ],
                  en: [
                    'The update section now shows the host version and the front-end version side by side, so a stale page is obvious at a glance',
                    'The primary button paints its text inline, so even an old stylesheet cannot hide it',
                  ],
                },
              },
              {
                version: '1.6.5',
                at: '2026-10-26T21:20+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '主按钮的文字颜色改成内联：就算页面里还挂着旧版本的样式表，按钮上的字也一定看得见',
                    '内联样式优先于任何样式表，不会再出现「白底白字」',
                  ],
                  en: [
                    'The primary button paints its text inline, so the label stays readable even when a stylesheet from an earlier version is still in the page',
                    'An inline style beats any stylesheet, so white on white cannot happen again',
                  ],
                },
              },
              {
                version: '1.6.4',
                at: '2026-10-26T21:05+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：热重载后样式表没被更新（发现同 id 的旧样式就直接跳过），页面一直用旧规则，所以上一版的按钮配色修复没生效',
                    '现在样式内容会被替换，刷新或重载后就是新的',
                  ],
                  en: [
                    'Fixed: after a reload the stylesheet was not updated (an old style element with the same id was kept), so the page kept the old rules and the button colours of the last release never showed',
                    'The style content is replaced now, so a reload or a refresh brings the new rules',
                  ],
                },
              },
              {
                version: '1.6.3',
                at: '2026-10-26T20:58+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '例行发布：验证签名通知即时生效',
                  ],
                  en: [
                    'Routine release: verifying that a signed notice takes effect at once',
                  ],
                },
              },
              {
                version: '1.6.2',
                at: '2026-10-26T20:45+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '发布通知改成签名的：通知里带版本号、下载地址和 sha256，插件用内置公钥验签后才认',
                    '这样新版本几秒内就能被发现，不用等 CDN 把清单刷新；伪造的通知会被直接丢掉',
                    '签名私钥只放在本机插件数据目录，不随插件或仓库分发',
                  ],
                  en: [
                    'The release notice is signed now: it carries the version, the download address and the sha256, and the plugin only believes it after checking the signature with its built-in public key',
                    'That way a new release is found within seconds instead of waiting for a CDN to refresh the manifest; a forged notice is dropped',
                    'The signing key lives only in the local plugin data directory and is never distributed with the plugin',
                  ],
                },
              },
              {
                version: '1.6.1',
                at: '2026-10-26T21:30+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '实测：发布通知到达后，插件自己发现了新版本（不用手动点「检查更新」）',
                  ],
                  en: [
                    'Verified: after the release notice arrived the plugin found the new version on its own, without anyone pressing the check button',
                  ],
                },
              },
              {
                version: '1.6.0',
                at: '2026-10-26T21:20+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '新增：发布版会订阅一个「发布通知」通道，我一发新版它立刻就知道，红点不用等轮询或 CDN 缓存',
                    '通知只是「有新东西了」的提示，具体版本号和校验值仍然从发布清单读，通知本身不会让插件装任何东西',
                  ],
                  en: [
                    'New: the published build listens on a release notice channel, so a new release is known right away instead of after a poll or a CDN cache',
                    'The notice is only a hint that something was published; the version and the checksum still come from the release manifest, and the notice itself never makes the plugin install anything',
                  ],
                },
              },
              {
                version: '1.5.10',
                at: '2026-10-26T21:00+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '「插件更新」里显示上次检查的时间，方便确认自动更新是不是在跑',
                    '查更新会同时问两个地址并取版本号更高的那个，单个 CDN 的缓存不会再挡住新版本',
                  ],
                  en: [
                    'The update section shows when the last check happened, so it is visible that the automatic update is running',
                    'The check asks two addresses and keeps the newer answer, so one CDN cache can no longer hold a release back',
                  ],
                },
              },
              {
                version: '1.5.9',
                at: '2026-10-26T20:50+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修好：存过更新源之后，就只问那一个地址，内置的两个地址等于白留——现在统一判断：内置地址就全问，用户自己填的地址就单独问',
                    '这就是「发布版自带更新源」之前一直没真正生效的原因',
                  ],
                  en: [
                    'Fixed: once an update source was stored, only that one address was asked and the built-in ones were left out; now one rule decides: the built-in addresses are all asked, an address the user set is asked alone',
                    'This is why the published build did not really bring its own update source until now',
                  ],
                },
              },
              {
                version: '1.5.8',
                at: '2026-10-26T20:40+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修好：之前手填过更新源（或状态里存着默认地址）时，只问那一个地址；现在存的是内置地址就会问全部内置地址，取版本号更高的',
                    '在设置里把更新源清空，也会回到内置地址',
                  ],
                  en: [
                    'Fixed: a stored update source (or a stored built-in address) made the plugin ask only that one address; now every built-in address is asked and the newest answer wins',
                    'Clearing the update source in the settings falls back to the built-in addresses as well',
                  ],
                },
              },
              {
                version: '1.5.7',
                at: '2026-10-26T20:30+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '查更新时同时问两个地址（jsDelivr 和 raw.githubusercontent.com），取版本号更高的那个——单个 CDN 缓存几分钟到半小时，会把新版本挡在门外',
                    '发布版自带的更新地址不受影响：装上就能自己查',
                  ],
                  en: [
                    'The update check asks two addresses (jsDelivr and raw.githubusercontent.com) and keeps the newer answer; one CDN caches the manifest for minutes to half an hour, which could hold a release back',
                    'The published build is unaffected: it checks on its own after installing',
                  ],
                },
              },
              {
                version: '1.5.6',
                at: '2026-10-26T20:15+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：设置里的「保存」按钮白底白字，文字看不见——主题的强调色在深色模式下接近白色，按钮文字改为与它配对的主文字色',
                    '未读数徽标同样修正（原来是白底白字）',
                  ],
                  en: [
                    'Fixed: the save button in the settings was white on white; the theme accent is nearly white in the dark theme, so the button text now uses the label colour that is paired with it',
                    'The unread badge is fixed the same way',
                  ],
                },
              },
              {
                version: '1.5.5',
                at: '2026-10-26T19:55+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '发布版自带更新地址：装上就知道去哪找新版本，不用再手填更新源',
                    '设置里会显示「当前使用：」的实际更新地址；留空即用自带的',
                  ],
                  en: [
                    'The published build brings its own update address: after installing it the plugin knows where its releases are, and no update source has to be typed in',
                    'The settings show the address that is really in use; leaving the field empty uses the built-in one',
                  ],
                },
              },
              {
                version: '1.5.4',
                at: '2026-10-26T19:35+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：点「检查更新」报 internal——那条路由用了请求体却忘了先解析，服务端直接 500',
                    '保存更新源不受影响，之前就能正常保存',
                  ],
                  en: [
                    'Fixed: the update check reported an internal error; that route read the request body without parsing it first, so the server answered with a 500',
                    'Saving the update source was never affected',
                  ],
                },
              },
              {
                version: '1.5.3',
                at: '2026-10-26T19:00+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '打开消息面板时立刻查一次更新，红点不用再等半小时（服务端有 5 分钟节流，手动点「检查更新」会强制查）',
                    '更新源改为公网清单地址，插件自己从 GitHub 上的 release.json 取新版本',
                  ],
                  en: [
                    'The panel checks for a new version as soon as it opens, so the red dot does not wait half an hour (the server throttles to five minutes; the manual check forces it)',
                    'The update source is now a public manifest address: the plugin reads new versions from release.json on GitHub',
                  ],
                },
              },
              {
                version: '1.5.2',
                at: '2026-10-26T18:40+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '自动更新全链路实测通过：读清单 → 下载 → 校验 sha256 → 换包 → 热生效，联系人与聊天记录完整保留，profile 无残留覆盖',
                  ],
                  en: [
                    'The whole automatic update path is verified: read the manifest, download, check the sha256, swap the package, apply it live, with contacts and history intact and no stray override left behind',
                  ],
                },
              },
              {
                version: '1.5.1',
                at: '2026-10-26T18:30+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：自动更新装完后插件没加载——更新流程把插件行停用（为了能卸载旧包），这个停用被写进了 profile 补丁，换完包没清掉，行就一直关着',
                    '现在装完会把插件行重新打开，profile 里不留多余覆盖',
                  ],
                  en: [
                    'Fixed: after an automatic update the plugin did not load; the row was switched off so the old package could be removed, that switch was remembered in the profile and never cleared, so the row stayed off',
                    'The row is switched on again after the update, leaving no stray override behind',
                  ],
                },
              },
              {
                version: '1.5.0',
                at: '2026-10-26T18:10+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '更新源现在也接受一个 https 的「发布清单」地址：插件读清单拿到新版本号、下载地址和 sha256，下载后校验再安装',
                    '这样不需要 npm 账号——把安装包和 release.json 放在一个公开仓库里即可',
                    '新增 scripts/release.sh：一条命令完成打包、写清单、推送',
                  ],
                  en: [
                    'The update source now also takes an https release manifest: the plugin reads the version, the download address and the sha256 from it, verifies the download and installs it',
                    'That removes the need for an npm account; the package and a release.json in a public repository are enough',
                    'New scripts/release.sh: one command builds, writes the manifest and pushes',
                  ],
                },
              },
              {
                version: '1.4.11',
                at: '2026-10-26T17:55+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '对方装上就能自动更新，不用再设置：发布版的包名就是发布名，插件据此自动填好更新源',
                    '本地开发版（@local/ 开头）不会去 registry 找自己',
                  ],
                  en: [
                    'Installing it is enough: a published package carries the name its releases live under, so the update source fills itself in',
                    'A workspace install (a scoped name) never looks itself up on the registry',
                  ],
                },
              },
              {
                version: '1.4.10',
                at: '2026-10-26T17:40+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复关键打包问题：发出去的包里补丁行名还是 @local/chat-room，与包名 dsh-chat-room 不一致，在对方机器上插件根本装不上（1.3.0 起的所有包都中招）',
                    '打包时统一改名：package.json、补丁行、客户端模块 id 三处一致',
                    '新增构建期自检：三者不一致直接构建失败',
                  ],
                  en: [
                    'Fixed a packaging fault: the shipped package still named the patch row @local/chat-room while the package was dsh-chat-room, so the plugin could not load on the other machine (every package since 1.3.0 was affected)',
                    'The build now renames all three: package.json, the patch row and the client module id',
                    'New build-time check: the build fails when they disagree',
                  ],
                },
              },
              {
                version: '1.4.9',
                at: '2026-10-26T17:55+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '更新失败时不再只说「请重试」，会说明具体原因（包名不对、不是插件包、没发布、没有插件管理器等）',
                    '模拟版本现在可以「安装」：点立即更新会走完整个流程，红点消失，方便在没有发布的情况下验证交互',
                  ],
                  en: [
                    'A failed update now says why (wrong name, not a plugin package, nothing published, no plugin manager) instead of a bare "please retry"',
                    'A simulated version can now be "installed": the whole flow runs and the red dot goes away, so the interaction can be checked without publishing',
                  ],
                },
              },
              {
                version: '1.4.8',
                at: '2026-10-26T17:45+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '更新红点改成小一点的实心圆点，去掉白色描边，看着像真正的提醒点',
                  ],
                  en: [
                    'The update dot is a smaller solid round dot without the white ring, so it reads as a real notification',
                  ],
                },
              },
              {
                version: '1.4.7',
                at: '2026-10-26T17:35+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：红点是白的——错误色 token 写错了（应为 --dsw-alias-state-error-primary），取不到值时背景透明，只剩白色描边',
                    '全文件核对了主题 token 引用，只此一处无效',
                  ],
                  en: [
                    'Fixed: the dot was white; the error colour token was wrong (--dsw-alias-state-error-primary is the real one), so the background was transparent and only the white ring showed',
                    'Every theme token in the file was checked against the catalog; this was the only invalid one',
                  ],
                },
              },
              {
                version: '1.4.6',
                at: '2026-10-26T17:25+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：侧栏入口的红点还是看不见——样式表原来由面板注入，面板没打开时红点没有任何样式',
                    '样式表改为插件加载时注入一次，侧栏红点、齿轮红点在任何页面都有效',
                  ],
                  en: [
                    'Fixed: the sidebar dot was still invisible; the stylesheet was injected by the panel, so with the panel closed the dot had no rules at all',
                    'The stylesheet is now injected once when the plugin loads, so the sidebar dot and the gear dot work on every page',
                  ],
                },
              },
              {
                version: '1.4.5',
                at: '2026-10-26T17:45+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：侧栏入口的红点不亮——状态帧里直接就是 state 本身，之前的解析多套了一层，图标一直没收到更新状态',
                    '侧栏图标现在会在有新版时亮红点',
                  ],
                  en: [
                    'Fixed: the red dot on the sidebar entry never appeared; the state frame carries the state itself, and the parser expected a wrapper, so the icon never learned about an update',
                    'The sidebar entry now shows the red dot when a version is available',
                  ],
                },
              },
              {
                version: '1.4.4',
                at: '2026-10-26T17:35+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：侧栏「消息」入口在有新版时可能整行消失——图标组件用了作用域外的翻译函数，渲染时抛错',
                    '翻译函数改为从属性传入，并且缺失时降级而不是崩溃',
                  ],
                  en: [
                    'Fixed: the Messages entry in the sidebar could disappear when a version was available; the icon used a translator from another scope and threw while rendering',
                    'The translator now comes in as a prop and degrades instead of throwing',
                  ],
                },
              },
              {
                version: '1.4.3',
                at: '2026-10-26T17:25+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '有新版时不再弹横幅，只在两个地方透一个小红点：设置齿轮的右上角，和左侧「消息」入口的图标上',
                    '点齿轮进设置，里面直接有「立即更新」按钮',
                  ],
                  en: [
                    'An available version no longer shows a banner: a small red dot appears in two places, on the settings gear and on the Messages entry in the sidebar',
                    'Open the settings to update; the "Update now" button is right there',
                  ],
                },
              },
              {
                version: '1.4.2',
                at: '2026-10-26T17:12+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '联系人信息弹窗改名「编辑」，对话右上角的入口也改成「编辑」',
                    '新增测试开关：插件数据目录里放一个 fake-update.json 就能模拟「有新版」，方便验证红点和更新提示',
                  ],
                  en: [
                    'The contact dialog is now called "Edit", and the entry in the conversation header says "Edit" too',
                    'New test switch: a fake-update.json in the plugin data folder simulates an available version, so the red dot and the update prompt can be checked',
                  ],
                },
              },
              {
                version: '1.4.1',
                at: '2026-10-26T17:10+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '设置按钮换成真正的齿轮图标（原来那个像太阳）',
                    '有新版时，齿轮右上角亮一个红点，鼠标移上去直接告诉你是什么版本',
                  ],
                  en: [
                    'The settings button is a real cog now; the old one read as a sun',
                    'When a new version waits, a red dot appears on the gear and hovering it says which version it is',
                  ],
                },
              },
              {
                version: '1.4.0',
                at: '2026-10-26T16:35+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '插件现在能自己查更新：设置里填一次更新源（npm 包名），之后它会定期检查，发现新版本就在面板顶部提示，点一下即可安装，装完即时生效、不用重启 DSH',
                    '更新源可以写进添加码，对方加你时自动学到更新地址，之后不用再传文件',
                    '安全：只接受 npm 包名（拒绝路径和网址），且只允许替换成同一个包；指向别的包会被拒绝，不会把现有插件卸掉',
                    '自愈：上次启动失败留下的路由会自动释放，不用再重启 DSH',
                  ],
                  en: [
                    'The plugin can now check for updates itself: set the update source (an npm package name) once in the settings and it checks regularly, then offers the update in the panel; installing it applies immediately without restarting DSH',
                    'The update source can travel inside the add code, so the other person learns where updates live without exchanging files',
                    'Safety: only npm package names are accepted (paths and urls are refused) and only the same package may replace this one, so a stray source can never take the working plugin away',
                    'Self-healing: a route left behind by a failed start is released automatically, so no restart is needed',
                  ],
                },
              },
              {
                version: '1.3.0',
                at: '2026-10-26T16:12+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '别人添加我后立刻出现在我的消息列表：添加时向对方收件会话发一个 ping，对方收到即自动建好联系人，不用等对方先发消息',
                    '联系方式可辨：列表显示「对方添加了你」或「对方发来消息，已自动添加」，对话头部有对应标签',
                    '备注名更好改了：左侧点联系人名字即可改名（原先只能进「信息」弹窗找输入框）',
                  ],
                  en: [
                    'A contact that adds you now appears in your list right away: adding sends a ping to their inbox, so they show up without waiting for a first message',
                    'The origin is visible: the list says "They added you" or "They wrote first", and the conversation header carries the same tag',
                    'Renaming is one click away: click a name in the list to rename it, instead of hunting for the field inside the info dialog',
                  ],
                },
              },
              {
                version: '1.2.3',
                at: '2026-10-26T16:05+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修好「加了人却看不出来」：默认昵称从人人相同的「我」改成每台机器唯一的「用户-xxxx」，双方昵称不再撞名',
                    '历史默认值「我」不再作为联系人名显示，改为「未命名联系人」并标注「未设置昵称」',
                    '自动添加的联系人带「新」标记，说明写清「对方发来消息，已自动添加」，可直接改备注名',
                    '底部提示「点右侧齿轮改个昵称」，自己的身份在会话里不再和对方混淆',
                  ],
                  en: [
                    'Fixed the invisible contact: the shared default name is now a unique "用户-xxxx" per install, so two people never look alike',
                    'The old shared default is no longer shown as a contact name; it reads "Unnamed contact" with a "no display name yet" chip',
                    'Automatically added contacts carry a "NEW" badge and an explanation, and can be renamed right away',
                    'The footer nudges you to set your own name, so your identity is never confused with the other person',
                  ],
                },
              },
              {
                version: '1.2.2',
                at: '2026-10-26T15:44+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '安装只需 1 次授权：改用 .tgz 插件包，install_bundle 可直接安装，不用解压、不用 shell',
                    '口令改成可直接照抄的一句，并明确要求只调用 plugin_manager、不要执行其它命令（避免 agent 自行跑 dsh --dump-config 之类的命令）',
                    '补充：若 DSH 没有 plugin_manager 工具，先把模式从「标准模式」切到「Creator 模式」',
                  ],
                  en: [
                    'Installation now needs a single approval: the package ships as a .tgz that install_bundle takes directly, with no unzip and no shell',
                    'The install phrase is now copy-pasteable and says to call only plugin_manager and run no other commands, so the agent does not improvise CLI calls',
                    'Added: if DSH has no plugin_manager tool, switch the mode from Standard to Creator first',
                  ],
                },
              },
              {
                version: '1.2.1',
                at: '2026-10-26T14:30+08:00',
                source: 'harness',
                points: {
                  zh: ['补充：侧边栏底部常驻「我的码」入口，有联系人之后也能随时复制自己的添加码'],
                  en: ['Added: a persistent "My code" entry in the sidebar footer so your add code stays reachable once contacts exist'],
                },
              },
              {
                version: '1.2.0',
                at: '2026-10-26T14:33+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '改成「每个 ID 自带收件会话」：添加码就是你的 ID，粘贴即可加人，不再需要先「新建联系人」',
                    '面板只保留【添加联系人】与【我的添加码】；对方发来第一条消息时自动成为联系人',
                    '对方入群只需两步：把 zip 拖进 DSH 输入框并说一句「安装我刚上传的联系人插件」，再打开消息面板粘贴添加码',
                    '修复：断线重连后自动补拉会话历史；历史加载失败可在会话里直接重试',
                    '修复：清空记录后列表预览不再残留；自己的消息不再计入未读',
                    '修复：切换联系人失败会提示；发送失败不会覆盖发送期间新输入的文字',
                  ],
                  en: [
                    'Every installation now owns an inbox topic: the add code is your id, so pasting it is enough and no "create contact" step exists',
                    'The panel keeps only "Add contact" and "My add code"; a first message from a stranger creates the contact automatically',
                    'Two steps for the other person: drop the zip into the DSH message box and say one phrase, then paste the add code in the Messages panel',
                    'Fixed: a reconnected page stream refetches conversation history; a failed history load can be retried in place',
                    'Fixed: clearing history no longer leaves a stale preview; your own messages are not counted as unread',
                    'Fixed: switching contacts reports failures; a failed send no longer overwrites text typed while it was in flight',
                  ],
                },
              },
              {
                version: '1.1.2',
                at: '2026-10-26T14:17+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '修复：打开从未看过的联系人时只显示挂载后收到的新消息；改为首次打开拉取历史并与实时消息合并',
                    '修复：发送失败后切换到别的对话时，不再把草稿塞进新对话框',
                    '修复：新建联系人后名片弹窗不再沿用上一个联系人的状态',
                  ],
                  en: [
                    'Fixed: opening a never-viewed contact showed only messages received since mount; history is fetched and merged on first open',
                    'Fixed: a failed send no longer moves the draft into a conversation the user switched to',
                    'Fixed: the card dialog for a new contact no longer inherits the previous contact state',
                  ],
                },
              },
              {
                version: '1.1.1',
                at: '2026-10-26T14:13+08:00',
                source: 'harness',
                points: {
                  zh: ['侧边栏与面板标题从「联系人」改为「消息」'],
                  en: ['Renamed the sidebar entry and panel title from Contacts to Messages'],
                },
              },
              {
                version: '1.1.0',
                at: '2026-10-26T14:07+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '改版：从「一个聊天室」改为「联系人列表 + 一对一对话」',
                    '新增：名片机制、每个联系人独立的会话/历史/未读/状态',
                    '兼容：旧版单房间聊天室自动迁移成一条联系人对话',
                  ],
                  en: [
                    'Redesigned from a single chat room into a contact list with one-to-one conversations',
                    'New: contact cards, per-contact conversation, history, unread badges and relay status',
                    'Upgrade path: the previous single-room chat migrates into one contact',
                  ],
                },
              },
              {
                version: '1.0.0',
                at: '2026-10-26T13:26+08:00',
                source: 'harness',
                points: {
                  zh: ['首个版本：侧边栏聊天室面板，创建/加入房间，通过公共中继跨网络收发消息'],
                  en: ['First release: sidebar chat room with create/join room over a public relay'],
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
        }, 'chat-room-version-log');

        // Offer the stored transcripts to the device-side resource registry,
        // so a consumer can search and read the conversations of this
        // installation next to the notes of the other plugins.
        ctx.effect(() => {
          const provider = createMessagesProvider({
            localeId: () => activeLang(ctx.locale),
          });
          return registerResourceProvider(provider);
        }, 'chatroom-resource-provider');

        injectStyles();

        const View = (slotProps) =>
          h(ContactsPanel, Object.assign({}, slotProps, { t, locale: ctx.locale }));

        const PanelIcon = (slotProps) =>
          h(ContactIcon, Object.assign({}, slotProps, { t }));

        // Register the main key first: the sidebar button only navigates to a
        // key that already exists.
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, View),
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 7,
              label: () => t('title'),
            },
            PanelIcon,
          ),
        );
      },
    };
  },
});
