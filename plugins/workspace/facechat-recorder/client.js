/**
 * Face-to-face recorder — Client half.
 *
 * A main-column page plus a sidebar entry. It records the microphone in the
 * browser, runs an energy VAD to cut the conversation into utterances, asks the
 * Harness speech remote (mounted by the voice-input bundle) to transcribe each
 * utterance near-real-time, and clusters MFCC/pitch embeddings online so the
 * transcript can be labelled by speaker.
 *
 * The page also keeps a browser-local recording history, lets the user rename
 * speakers, reassign a line, prepare the local ASR model and export Markdown.
 */
window.__ModuleLoader__.load({
  id: '@local/facechat-recorder',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'facechat';
    const PANEL_ID = 'facechat';

    const STORAGE_KEY = 'dsh.facechat.v1';
    const DRAFT_KEY = 'dsh.facechat.draft.v1';
    const DEVICE_KEY = 'dsh.facechat.device.v1';
    const GLOSSARY_KEY = 'dsh.facechat.glossary.v1';
    const GLOSSARY_ENABLED_KEY = 'dsh.facechat.glossary-enabled.v1';
    const LANGUAGE_TIP_KEY = 'dsh.facechat.language-tip.v1';
    const MAX_HISTORY = 120;
    const MAX_STORE_BYTES = 3600000;

    /* Capture / analysis constants. */
    const TARGET_RATE = 16000;
    const FRAME_SAMPLES = 320;          // 20 ms at 16 kHz
    const MAX_UTTERANCE_MS = 12000;     // force a cut so the ASR request is bounded
    const MIN_UTTERANCE_MS = 450;
    const INTERIM_INTERVAL_MS = 1500;   // partial transcript cadence while speaking
    const INTERIM_MIN_MS = 900;

    const MAX_SPEAKERS = 6;

    const DICTS = {
      zh: {
        title: '面聊录音',
        navTitle: '面聊',
        start: '开始录音',
        stop: '停止并保存',
        starting: '正在启动麦克风…',
        stopping: '正在整理录音…',
        ready: '就绪',
        recording: '录音转写中',
        saved: '已保存',
        elapsed: '时长',
        level: '麦克风电平',
        history: '录音记录',
        historyEmpty: '还没有录音记录',
        newRecording: '新的面聊',
        emptyTitle: '开始一场面聊记录',
        emptyHint: '点击开始录音，插件会边录边把对话转成文字，并按声音自动区分话者。把麦克风放在两人中间，效果更好。',
        emptyTip: '音频在本机识别，不会写入会话记录；转写文字会保存在当前浏览器。',
        transcript: '转写',
        summary: '总结',
        summaryHint: '总结按话者身份组织；改名或重新指派片段后会自动更新。',
        summaryOverview: '对话脉络',
        summaryBySpeaker: '按话者总结',
        summarySignals: '可能的结论与后续',
        summaryEmpty: '转写内容足够后，这里会自动生成基于话者的总结。',
        summaryNoHighlight: '暂时没有足够的有效发言。',
        speakingShare: '发言占比 {n}%',
        extractedSignal: '根据逐字稿中的结论、计划与行动表述自动提取。',
        waitingSpeech: '正在聆听…',
        listening: '正在收音…',
        interimPending: '识别中…',
        lineFailed: '识别失败',
        noSpeechYet: '还没有识别到语音。对着麦克风说话，文字会出现在这里。',
        transcriptEmpty: '这次录音没有可显示的文字。',
        lineCount: '{n} 段',
        speakerCount: '{n} 位话者',
        speakers: '话者',
        speakerLabel: '话者 {n}',
        addSpeaker: '新增话者',
        noSpeakerYet: '识别出话者后，可以在这里给他们改名。',
        speakerHint: '点击名字可以直接改名。',
        speakerCorrectHint: '自动区分可能有误，点片段上的话者标签可以改派。',
        glossary: '术语表',
        glossaryTitle: '转写术语表',
        glossaryHint: '每行一条：错误写法=正确写法。纠正会应用到之后的所有转写，保存时也会更新当前记录。内置词条已覆盖常见技术词。',
        glossaryPlaceholder: '例如：\nget up=GitHub\nbench mark=benchmark\ndeepre=DeepSeek',
        glossaryEnabled: '自动纠正转写中的术语',
        glossaryDefaults: '查看内置词条',
        glossaryReset: '恢复默认',
        save: '保存',
        languageTipTitle: '提高识别准确率',
        languageTipText: '识别语言当前为「自动」。中英混说时建议固定为「中文」，可明显减少 GitHub、benchmark 这类术语的误识别。',
        useChinese: '改用中文识别',
        gotIt: '知道了',
        mergeInto: '合并到…',
        mergeSpeaker: '合并话者',
        speakerStats: '{n} 段 · {time}',
        speakerMenuTitle: '选择这个片段的话者',
        changeSpeaker: '更改话者',
        renameSpeaker: '话者名字',
        statusReady: '语音识别已就绪',
        statusPreparing: '识别模型准备中',
        statusUnprepared: '识别模型未准备',
        statusFailed: '识别服务异常',
        speechService: '识别服务',
        language: '识别语言',
        langAuto: '自动识别',
        langZh: '中文',
        langEn: '英语',
        langYue: '粤语',
        langJa: '日语',
        langKo: '韩语',
        modelNotReady: '本地识别模型尚未准备',
        modelNotReadyHint: '首次使用需要下载本地语音识别模型。模型由 Harness 语音服务保存和复用，不会进入对话记录。',
        modelEstimate: '建议预留约 {gb} GB 磁盘、约 {mem} GB 内存；首次准备约 {min}–{max} 分钟。',
        modelDownloading: '正在下载模型：{completed} / {total} MB（{percent}%）',
        modelDownloadingUnknown: '正在下载模型：已下载 {completed} MB',
        modelStep: '当前步骤：{step}',
        stepCheck: '检查本地资源',
        stepModel: '准备识别模型',
        stepVad: '准备语音检测模型',
        stepVerify: '校验模型文件',
        stepLoad: '加载识别模型',
        prepare: '下载并准备',
        preparing: '准备中…',
        cancelPrepare: '取消准备',
        retryPrepare: '重试准备',
        downloadSource: '模型下载源',
        sourceAuto: '自动选择（推荐）',
        sourceHuggingFace: 'Hugging Face',
        sourceMirror: 'HF-Mirror（国内镜像）',
        modelReady: '本地识别已就绪，录音时自动唤醒。',
        modelFailure: '模型准备失败：{message}',
        speechConnecting: '正在连接语音识别服务…',
        speechUnavailable: '语音识别服务不可用。请确认 Harness 的「语音输入」插件已启用后刷新页面。',
        speechDisconnected: '语音识别服务连接已断开，正在重试…',
        localSpeech: '音频在运行 Harness 的本机识别，不会写入会话记录。',
        cloudSpeech: '音频会发送到所选云端识别服务。',
        audioInMemory: '音频文件仅保存在本次页面内，刷新前可以下载。',
        exportCopy: '复制 Markdown',
        exportDownload: '下载 Markdown',
        exportAudio: '下载音频',
        copied: '已复制',
        copyFailed: '复制失败，请重试',
        exportEmpty: '还没有可导出的文字',
        delete: '删除',
        confirmDelete: '确认删除',
        newSession: '新建录音',
        recoveredDraft: '发现上一次未正常结束的录音',
        recoveredDraftHint: '共有 {n} 段文字，可以恢复查看并导出。',
        recover: '恢复记录',
        discard: '丢弃',
        storageError: '浏览器存储空间不足，录音记录未能保存',
        historyRowMeta: '{duration} · {count} 段',
        untitled: '面聊录音 {time}',
        micTip: '把麦克风放在两人中间，转写更准确。',
        audioReady: '音频可下载',
        audioMissing: '音频未保留',
        transcribeFailure: '部分片段识别失败：{message}',
        errorPermission: '麦克风权限未开启，请在浏览器或系统设置中允许访问。',
        errorUnsupported: '当前环境不支持麦克风录音。',
        errorDeviceMissing: '找不到可用的麦克风。',
        errorInterrupted: '录音被中断，请重试。',
        errorNotReady: '识别服务尚未就绪，请先下载并准备模型。',
        errorSpeechUnavailable: '语音识别服务不可用。',
        errorTranscribe: '语音识别失败：{message}',
        errorEmpty: '没有识别到语音，请检查麦克风后再试。',
        errorCapture: '启动麦克风失败：{message}',
        errorStorage: '浏览器存储空间不足。',
        close: '关闭',
      },
      en: {
        title: 'Face-to-face Recorder',
        navTitle: 'Facechat',
        start: 'Start recording',
        stop: 'Stop and save',
        starting: 'Starting microphone…',
        stopping: 'Finishing the recording…',
        ready: 'Ready',
        recording: 'Recording & transcribing',
        saved: 'Saved',
        elapsed: 'Duration',
        level: 'Microphone level',
        history: 'Recordings',
        historyEmpty: 'No recordings yet',
        newRecording: 'New conversation',
        emptyTitle: 'Record a face-to-face conversation',
        emptyHint: 'Press start and the panel transcribes the conversation while it happens and separates speakers by voice. Put the microphone between the two people for the best result.',
        emptyTip: 'Audio is recognised on this machine and never enters the session log; the transcript is kept in this browser.',
        transcript: 'Transcript',
        summary: 'Summary',
        summaryHint: 'The summary is organized by speaker identity and refreshes after a rename or line reassignment.',
        summaryOverview: 'Conversation flow',
        summaryBySpeaker: 'By speaker',
        summarySignals: 'Possible decisions and next steps',
        summaryEmpty: 'A speaker-aware summary will appear once there is enough transcript text.',
        summaryNoHighlight: 'There is not enough substantive speech yet.',
        speakingShare: '{n}% of speaking time',
        extractedSignal: 'Automatically extracted from decision, plan, and action language in the transcript.',
        waitingSpeech: 'Listening…',
        listening: 'Listening…',
        interimPending: 'Transcribing…',
        lineFailed: 'Transcription failed',
        noSpeechYet: 'No speech recognized yet. Speak toward the microphone and text will appear here.',
        transcriptEmpty: 'This recording has no displayable text.',
        lineCount: '{n} lines',
        speakerCount: '{n} speakers',
        speakers: 'Speakers',
        speakerLabel: 'Speaker {n}',
        addSpeaker: 'Add speaker',
        noSpeakerYet: 'Once speakers are recognized you can rename them here.',
        speakerHint: 'Click a name to rename it.',
        speakerCorrectHint: 'Automatic separation can be wrong; click a line’s speaker chip to correct it.',
        glossary: 'Glossary',
        glossaryTitle: 'Transcript glossary',
        glossaryHint: 'One rule per line: wrong spelling=correct term. Corrections apply to every later transcript and also update the open recording when you save. The built-in list already covers common technical terms.',
        glossaryPlaceholder: 'For example:\nget up=GitHub\nbench mark=benchmark\ndeepre=DeepSeek',
        glossaryEnabled: 'Correct glossary terms automatically',
        glossaryDefaults: 'Show built-in terms',
        glossaryReset: 'Restore defaults',
        save: 'Save',
        languageTipTitle: 'Improve recognition accuracy',
        languageTipText: 'The recognition language is Automatic. For Chinese/English code-switching, choose Chinese explicitly; it noticeably reduces mixed-up technical terms such as GitHub or benchmark.',
        useChinese: 'Use Chinese recognition',
        gotIt: 'Got it',
        mergeInto: 'Merge into…',
        mergeSpeaker: 'Merge speaker',
        speakerStats: '{n} lines · {time}',
        speakerMenuTitle: 'Choose the speaker for this line',
        changeSpeaker: 'Change speaker',
        renameSpeaker: 'Speaker name',
        statusReady: 'Speech recognition ready',
        statusPreparing: 'Preparing recognition model',
        statusUnprepared: 'Recognition model not prepared',
        statusFailed: 'Recognition service problem',
        speechService: 'Recognition service',
        language: 'Recognition language',
        langAuto: 'Detect automatically',
        langZh: 'Chinese',
        langEn: 'English',
        langYue: 'Cantonese',
        langJa: 'Japanese',
        langKo: 'Korean',
        modelNotReady: 'The local recognition model is not prepared yet',
        modelNotReadyHint: 'First use downloads the local speech recognition model. The Harness speech service stores and reuses it; it never becomes part of the conversation.',
        modelEstimate: 'Allow about {gb} GB of disk and {mem} GB of memory; first setup takes roughly {min}–{max} minutes.',
        modelDownloading: 'Downloading model: {completed} / {total} MB ({percent}%)',
        modelDownloadingUnknown: 'Downloading model: {completed} MB so far',
        modelStep: 'Current step: {step}',
        stepCheck: 'Check local resources',
        stepModel: 'Prepare recognition model',
        stepVad: 'Prepare voice detection model',
        stepVerify: 'Verify model files',
        stepLoad: 'Load the recognition model',
        prepare: 'Download and prepare',
        preparing: 'Preparing…',
        cancelPrepare: 'Cancel preparation',
        retryPrepare: 'Retry preparation',
        downloadSource: 'Model download source',
        sourceAuto: 'Automatic (recommended)',
        sourceHuggingFace: 'Hugging Face',
        sourceMirror: 'HF-Mirror (China mirror)',
        modelReady: 'Local recognition is ready; recording wakes it automatically.',
        modelFailure: 'Model preparation failed: {message}',
        speechConnecting: 'Connecting to speech recognition…',
        speechUnavailable: 'Speech recognition is unavailable. Make sure the Harness voice-input plugin is enabled, then refresh the page.',
        speechDisconnected: 'The speech recognition connection was lost. Reconnecting…',
        localSpeech: 'Audio is recognized on the machine running Harness and never enters the session log.',
        cloudSpeech: 'Audio is sent to the selected cloud recognition service.',
        audioInMemory: 'The audio file only lives on this page and can be downloaded before a refresh.',
        exportCopy: 'Copy Markdown',
        exportDownload: 'Download Markdown',
        exportAudio: 'Download audio',
        copied: 'Copied',
        copyFailed: 'Copy failed. Try again.',
        exportEmpty: 'No text to export yet',
        delete: 'Delete',
        confirmDelete: 'Confirm delete',
        newSession: 'New recording',
        recoveredDraft: 'An unfinished recording was found',
        recoveredDraftHint: '{n} lines were kept and can be restored for review or export.',
        recover: 'Restore',
        discard: 'Discard',
        storageError: 'Browser storage is full; the recording was not saved',
        historyRowMeta: '{duration} · {count} lines',
        untitled: 'Conversation {time}',
        micTip: 'Put the microphone between the two people for a better transcript.',
        audioReady: 'Audio available',
        audioMissing: 'Audio not kept',
        transcribeFailure: 'Some lines failed to transcribe: {message}',
        errorPermission: 'Microphone permission is off. Allow it in the browser or system settings.',
        errorUnsupported: 'This environment cannot record from a microphone.',
        errorDeviceMissing: 'No usable microphone was found.',
        errorInterrupted: 'The recording was interrupted. Please try again.',
        errorNotReady: 'Recognition is not ready. Download and prepare the model first.',
        errorSpeechUnavailable: 'Speech recognition is unavailable.',
        errorTranscribe: 'Speech recognition failed: {message}',
        errorEmpty: 'No speech was recognized. Check the microphone and try again.',
        errorCapture: 'Starting the microphone failed: {message}',
        errorStorage: 'Browser storage is full.',
        close: 'Close',
      },
    };

    /* ------------------------------------------------------------------ *
     * Small utilities
     * ------------------------------------------------------------------ */

    function makeId() {
      try {
        if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
      } catch (err) {
        /* fall through to a local id */
      }
      return 'fc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function clamp(value, low, high) {
      return value < low ? low : value > high ? high : value;
    }

    function zeros(length) {
      return new Float32Array(length);
    }

    function concatFloat32(parts, totalLength) {
      let length = totalLength;
      if (typeof length !== 'number') {
        length = 0;
        for (const part of parts) length += part.length;
      }
      const out = new Float32Array(length);
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    }

    function formatDuration(ms) {
      const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      const pad = (value) => (value < 10 ? '0' + value : String(value));
      return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : pad(minutes) + ':' + pad(seconds);
    }

    function formatClock(ms) {
      const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      const pad = (value) => (value < 10 ? '0' + value : String(value));
      return pad(minutes) + ':' + pad(seconds);
    }

    function localeTag(active) {
      return typeof active === 'string' && active ? active : undefined;
    }

    function formatHistoryWhen(timestamp, active) {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';
      const now = new Date();
      const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
      try {
        if (sameDay) {
          return date.toLocaleTimeString(localeTag(active), { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString(localeTag(active), {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch (err) {
        return date.toLocaleString();
      }
    }

    function formatSessionStamp(timestamp, active) {
      const date = new Date(timestamp);
      try {
        return date.toLocaleString(localeTag(active), {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch (err) {
        return date.toLocaleString();
      }
    }

    /**
     * Strip SenseVoice rich-text control tokens and tidy whitespace so the
     * transcript stays readable even when the provider returns raw tags.
     */
    function cleanTranscript(text) {
      if (typeof text !== 'string') return '';
      return text
        .replace(/<\|[^|>]*\|>/g, '')
        .replace(/\[[A-Z_]{3,}\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    /* ------------------------------------------------------------------ *
     * Transcript glossary
     *
     * The local SenseVoice model frequently mangles technical proper nouns in
     * Chinese/English code-switching speech ("githh" / "get up" for GitHub,
     * "bench mark" for benchmark). A small deterministic glossary plus
     * user-supplied corrections fixes those without another model pass.
     * ------------------------------------------------------------------ */

    const DEFAULT_GLOSSARY = [
      {
        term: 'benchmark',
        aliases: ['bench mark', 'bench-mark', 'ben chmark', 'ben ch mark', 'ventnch mark', 'winnch mark', 'winch mark', 'benchmarck', 'benchmak'],
      },
      {
        term: 'GitHub',
        aliases: ['git hub', 'git-hub', 'get up', 'getup', 'githh', 'gith', 'githab', 'githup', 'get hub', 'gitup'],
      },
      {
        term: 'DeepSeek',
        aliases: ['deep seek', 'deep-seek', 'deepre', 'deep reek', 'deep sick', 'deep seak', 'deepseak'],
      },
      {
        term: 'DeepSeek-R1',
        aliases: ['deepseek r1', 'deep seek r1', 'deep seek r one', 'deepseek-r1'],
      },
      {
        term: 'DeepSeek-V3',
        aliases: ['deepseek v3', 'deep seek v3', 'deep seek v three'],
      },
      {
        term: 'Deep Research',
        aliases: ['deep research', 'deep re search', 'dee pre search', 'deepresearch', 'deep reseach'],
      },
      { term: 'SenseVoice', aliases: ['sense voice'] },
      { term: 'Harness', aliases: ['harnes'] },
      { term: 'API', aliases: ['a p i', 'ap i'] },
      { term: 'LLM', aliases: ['l l m'] },
      { term: 'RAG', aliases: ['r a g'] },
      { term: 'prompt', aliases: ['promt', 'promts'] },
      { term: 'fine-tune', aliases: ['fine tune', 'finetune', 'fine tuned'] },
      { term: 'inference', aliases: ['inferance', 'inferencing'] },
      { term: 'transformer', aliases: ['transfermer'] },
      { term: 'OpenAI', aliases: ['open ai'] },
    ];

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function splitGlossaryTerm(term) {
      const pieces = [];
      for (const chunk of String(term).split(/[\s-]+/)) {
        const matches = chunk.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g);
        if (matches && matches.length) pieces.push.apply(pieces, matches);
        else if (chunk) pieces.push(chunk);
      }
      return pieces.length ? pieces : [String(term)];
    }

    function glossaryRegex(source) {
      // Bracketed ASCII letter/digit boundaries also work next to CJK text,
      // where \b would not fire between a Han character and a Latin letter.
      return new RegExp('(^|[^A-Za-z0-9_])(' + source + ')(?![A-Za-z0-9_])', 'gi');
    }

    function canonicalGlossaryRule(term) {
      const source = splitGlossaryTerm(term).map(escapeRegExp).join('[\\s-]*');
      return { re: glossaryRegex(source), term };
    }

    function aliasGlossaryRule(alias, term) {
      const pieces = String(alias)
        .trim()
        .split(/\s+/)
        .map(escapeRegExp)
        .filter(Boolean);
      if (!pieces.length) return null;
      return { re: glossaryRegex(pieces.join('[\\s-]+')), term };
    }

    function parseGlossaryText(text) {
      const rules = [];
      for (const rawLine of String(text || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.charAt(0) === '#') continue;
        let alias = '';
        let term = '';
        const arrow = line.indexOf('=>');
        if (arrow > 0) {
          alias = line.slice(0, arrow).trim();
          term = line.slice(arrow + 2).trim();
        } else {
          const equals = line.indexOf('=');
          if (equals > 0) {
            alias = line.slice(0, equals).trim();
            term = line.slice(equals + 1).trim();
          }
        }
        if (alias && term) rules.push({ alias, term });
      }
      return rules;
    }

    function buildGlossaryRules(userRules) {
      const rules = [];
      for (const entry of DEFAULT_GLOSSARY) {
        rules.push(canonicalGlossaryRule(entry.term));
        for (const alias of entry.aliases) {
          const rule = aliasGlossaryRule(alias, entry.term);
          if (rule) rules.push(rule);
        }
      }
      for (const entry of userRules || []) {
        const aliasRule = aliasGlossaryRule(entry.alias, entry.term);
        if (aliasRule) rules.push(aliasRule);
        rules.push(canonicalGlossaryRule(entry.term));
      }
      // Longer matches first so specific phrases win over their substrings.
      rules.sort((a, b) => b.re.source.length - a.re.source.length);
      return rules;
    }

    function applyGlossaryRules(text, rules) {
      let out = text;
      for (const rule of rules) {
        out = out.replace(rule.re, (match, prefix) => prefix + rule.term);
      }
      return out.replace(/\s{2,}/g, ' ').trim();
    }

    function createTranscriptRefiner(userText, enabled) {
      const rules = buildGlossaryRules(parseGlossaryText(userText));
      return function refine(text) {
        const cleaned = cleanTranscript(text);
        if (enabled === false || !rules.length) return cleaned;
        return applyGlossaryRules(cleaned, rules);
      };
    }

    function createGlossaryStore() {
      let userText = '';
      let enabled = true;
      try {
        userText = window.localStorage.getItem(GLOSSARY_KEY) || '';
        enabled = window.localStorage.getItem(GLOSSARY_ENABLED_KEY) !== '0';
      } catch (err) {
        /* defaults still apply when storage is unavailable */
      }
      let refine = createTranscriptRefiner(userText, enabled);
      const listeners = new Set();

      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (err) {
            /* one faulty view must not stop the others */
          }
        }
      }

      function persist() {
        try {
          window.localStorage.setItem(GLOSSARY_KEY, userText);
          window.localStorage.setItem(GLOSSARY_ENABLED_KEY, enabled ? '1' : '0');
        } catch (err) {
          /* the glossary still applies for this page */
        }
      }

      return {
        getSnapshot() {
          return { userText, enabled, defaults: DEFAULT_GLOSSARY };
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        setUserText(text) {
          userText = typeof text === 'string' ? text : '';
          refine = createTranscriptRefiner(userText, enabled);
          persist();
          emit();
        },
        setEnabled(value) {
          enabled = !!value;
          refine = createTranscriptRefiner(userText, enabled);
          persist();
          emit();
        },
        refine(text) {
          return refine(text);
        },
      };
    }

    function loadLanguageTipDismissed() {
      try {
        return window.localStorage.getItem(LANGUAGE_TIP_KEY) === '1';
      } catch (err) {
        return false;
      }
    }

    function saveLanguageTipDismissed() {
      try {
        window.localStorage.setItem(LANGUAGE_TIP_KEY, '1');
      } catch (err) {
        /* the tip just reappears on the next page load */
      }
    }

    function downloadBlob(blob, filename) {
      try {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        return true;
      } catch (err) {
        return false;
      }
    }

    /* ------------------------------------------------------------------ *
     * DSP: FFT / mel / MFCC / pitch / embedding
     *
     * Runs on the main thread but only when one utterance ends, which is the
     * silence gap after speech, so it does not starve the capture callback.
     * ------------------------------------------------------------------ */

    const FFT_SIZE = 512;
    const FRAME_LEN = 400; // 25 ms
    const HOP = 160; // 10 ms
    const MEL_BANDS = 26;
    const N_CEPS = 13;
    const N_MFCC_DIMS = 12; // c1..c12; c0 tracks loudness, not speaker

    let DSP_CACHE = null;

    function getDspCache() {
      if (DSP_CACHE) return DSP_CACHE;
      const window = new Float64Array(FRAME_LEN);
      for (let i = 0; i < FRAME_LEN; i++) {
        window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME_LEN - 1));
      }
      const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
      const melToHz = (mel) => 700 * (Math.pow(10, mel / 2595) - 1);
      const fMin = 80;
      const fMax = Math.min(7600, TARGET_RATE / 2 - 100);
      const melMin = hzToMel(fMin);
      const melMax = hzToMel(fMax);
      const points = [];
      for (let i = 0; i < MEL_BANDS + 2; i++) {
        points.push(melToHz(melMin + ((melMax - melMin) * i) / (MEL_BANDS + 1)));
      }
      const bins = points.map((hz) => Math.floor(((FFT_SIZE + 1) * hz) / TARGET_RATE));
      const bank = [];
      for (let m = 1; m <= MEL_BANDS; m++) {
        const left = bins[m - 1];
        const center = Math.max(left + 1, bins[m]);
        const right = Math.max(center + 1, bins[m + 1]);
        const filter = new Float64Array(FFT_SIZE / 2 + 1);
        for (let k = left; k < center && k < filter.length; k++) {
          filter[k] = (k - left) / (center - left);
        }
        for (let k = center; k < right && k < filter.length; k++) {
          filter[k] = (right - k) / (right - center);
        }
        bank.push(filter);
      }
      DSP_CACHE = { window, bank };
      return DSP_CACHE;
    }

    function fft(re, im) {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
          const reTmp = re[i];
          re[i] = re[j];
          re[j] = reTmp;
          const imTmp = im[i];
          im[i] = im[j];
          im[j] = imTmp;
        }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const angle = (-2 * Math.PI) / len;
        const wRe = Math.cos(angle);
        const wIm = Math.sin(angle);
        const half = len >> 1;
        for (let start = 0; start < n; start += len) {
          let curRe = 1;
          let curIm = 0;
          for (let j = 0; j < half; j++) {
            const aRe = re[start + j];
            const aIm = im[start + j];
            const bRe = re[start + j + half] * curRe - im[start + j + half] * curIm;
            const bIm = re[start + j + half] * curIm + im[start + j + half] * curRe;
            re[start + j] = aRe + bRe;
            im[start + j] = aIm + bIm;
            re[start + j + half] = aRe - bRe;
            im[start + j + half] = aIm - bIm;
            const nextRe = curRe * wRe - curIm * wIm;
            curIm = curRe * wIm + curIm * wRe;
            curRe = nextRe;
          }
        }
      }
    }

    function createFrameAnalyzer() {
      const cache = getDspCache();
      const re = new Float64Array(FFT_SIZE);
      const im = new Float64Array(FFT_SIZE);
      const melEnergy = new Float64Array(MEL_BANDS);
      const mfcc = new Float64Array(N_CEPS);
      const bins = FFT_SIZE / 2 + 1;
      return {
        mfcc,
        /**
         * Analyse one 25 ms frame in place.
         * @returns the spectral centroid in Hz.
         */
        analyze(samples, start) {
          let mean = 0;
          for (let i = 0; i < FRAME_LEN; i++) mean += samples[start + i];
          mean /= FRAME_LEN;
          re.fill(0);
          im.fill(0);
          let previous = start > 0 ? samples[start - 1] : samples[start];
          for (let i = 0; i < FRAME_LEN; i++) {
            const value = samples[start + i];
            const emphasized = (value - mean) - 0.97 * previous;
            previous = value;
            re[i] = emphasized * cache.window[i];
          }
          fft(re, im);
          melEnergy.fill(1e-10);
          let centroidNum = 0;
          let centroidDen = 0;
          for (let k = 0; k < bins; k++) {
            const power = re[k] * re[k] + im[k] * im[k];
            centroidNum += power * k;
            centroidDen += power;
            for (let m = 0; m < MEL_BANDS; m++) melEnergy[m] += power * cache.bank[m][k];
          }
          for (let m = 0; m < MEL_BANDS; m++) melEnergy[m] = Math.log(melEnergy[m] + 1e-10);
          for (let c = 0; c < N_CEPS; c++) {
            let sum = 0;
            for (let m = 0; m < MEL_BANDS; m++) {
              sum += melEnergy[m] * Math.cos((Math.PI * c * (m + 0.5)) / MEL_BANDS);
            }
            mfcc[c] = sum;
          }
          const centroid = centroidDen > 1e-12 ? ((centroidNum / centroidDen) * TARGET_RATE) / FFT_SIZE : 0;
          return centroid;
        },
      };
    }

    /**
     * Estimate the fundamental frequency (70–320 Hz) with normalised
     * autocorrelation and parabolic interpolation.
     * @returns Hz, or 0 when the frame is unvoiced.
     */
    function estimatePitch(samples, start) {
      const minLag = 50; // 320 Hz
      const maxLag = 228; // 70 Hz
      const available = samples.length - start;
      if (available < 320) return 0;
      const win = Math.min(640, available);
      if (win - maxLag < 120) return 0;
      let mean = 0;
      for (let i = 0; i < win; i++) mean += samples[start + i];
      mean /= win;
      let energy = 0;
      for (let i = 0; i < win; i++) {
        const value = samples[start + i] - mean;
        energy += value * value;
      }
      if (energy < 1e-7) return 0;
      const scores = new Float64Array(maxLag + 2);
      let bestLag = 0;
      let bestScore = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        const overlap = win - lag;
        if (overlap < 120) break;
        let corr = 0;
        let e1 = 0;
        let e2 = 0;
        for (let i = 0; i < overlap; i++) {
          const a = samples[start + i] - mean;
          const b = samples[start + i + lag] - mean;
          corr += a * b;
          e1 += a * a;
          e2 += b * b;
        }
        const score = corr / Math.sqrt(e1 * e2 + 1e-12);
        scores[lag] = score;
        if (score > bestScore) {
          bestScore = score;
          bestLag = lag;
        }
      }
      if (bestLag === 0 || bestScore < 0.32) return 0;
      // A purely periodic signal scores almost equally at every multiple of its
      // period; prefer the shortest lag close to the best score so we report
      // the fundamental instead of a sub-harmonic.
      let chosen = bestLag;
      for (let lag = minLag; lag < bestLag; lag++) {
        if (scores[lag] >= bestScore - 0.02) {
          chosen = lag;
          break;
        }
      }
      const left = scores[chosen - 1] || scores[chosen];
      const right = scores[chosen + 1] || scores[chosen];
      const denominator = left - 2 * scores[chosen] + right;
      const offset = Math.abs(denominator) > 1e-9 ? (0.5 * (left - right)) / denominator : 0;
      return TARGET_RATE / (chosen + clamp(offset, -1, 1));
    }

    function median(values) {
      if (!values.length) return 0;
      const sorted = values.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Build one speaker embedding from an utterance: 12 mean MFCCs plus a
     * weighted log-pitch term and a spectral-centroid term. The pitch term is
     * what keeps voices with similar formants but different registers apart.
     * @returns {{ vector: number[], f0: number, centroid: number }} or null.
     */
    function extractEmbedding(samples) {
      if (!samples || samples.length < FRAME_LEN * 2) return null;
      const frameCount = Math.floor((samples.length - FRAME_LEN) / HOP) + 1;
      if (frameCount < 4) return null;
      const frameRms = new Float64Array(frameCount);
      let rmsSum = 0;
      for (let f = 0; f < frameCount; f++) {
        let sum = 0;
        const start = f * HOP;
        for (let i = 0; i < FRAME_LEN; i++) {
          const value = samples[start + i];
          sum += value * value;
        }
        const rms = Math.sqrt(sum / FRAME_LEN);
        frameRms[f] = rms;
        rmsSum += rms;
      }
      const meanRms = rmsSum / frameCount;
      const threshold = Math.max(0.0035, meanRms * 0.55);
      const analyzer = createFrameAnalyzer();
      const mfccSum = new Float64Array(N_MFCC_DIMS);
      const f0s = [];
      let voiced = 0;
      let centroidSum = 0;
      for (let f = 0; f < frameCount; f++) {
        if (frameRms[f] < threshold) continue;
        const centroid = analyzer.analyze(samples, f * HOP);
        for (let c = 1; c < N_CEPS; c++) mfccSum[c - 1] += analyzer.mfcc[c];
        centroidSum += centroid;
        if (voiced % 2 === 0) {
          const f0 = estimatePitch(samples, f * HOP);
          if (f0 > 0) f0s.push(f0);
        }
        voiced++;
      }
      if (voiced < 3) return null;
      const mfccMean = new Array(N_MFCC_DIMS);
      for (let i = 0; i < N_MFCC_DIMS; i++) mfccMean[i] = mfccSum[i] / voiced;
      const f0 = median(f0s);
      const pitchTerm = f0 > 0 ? clamp(Math.log2(f0 / 130), -1.2, 1.2) * 6.2 : 0;
      const centroid = centroidSum / voiced;
      const centroidTerm = clamp(centroid / 8000 - 0.45, -0.5, 0.5) * 3;
      return { vector: mfccMean.concat([pitchTerm, centroidTerm]), f0, centroid };
    }

    function normalizeVector(vector) {
      let norm = 0;
      for (const value of vector) norm += value * value;
      norm = Math.sqrt(norm);
      if (!(norm > 1e-9)) return vector.map(() => 0);
      return vector.map((value) => value / norm);
    }

    function cosineSimilarity(a, b) {
      let dot = 0;
      const length = Math.min(a.length, b.length);
      for (let i = 0; i < length; i++) dot += a[i] * b[i];
      return dot;
    }

    /**
     * Online speaker clustering over utterance embeddings.
     *
     * The first confident utterance founds the first speaker; later utterances
     * join the nearest centroid when cosine similarity is high enough, and a
     * clearly different voice opens a new speaker (bounded by MAX_SPEAKERS).
     * Short utterances prefer the previous speaker to avoid flapping.
     */
    function createSpeakerClusterer(options) {
      const settings = options || {};
      const threshold = typeof settings.threshold === 'number' ? settings.threshold : 0.87;
      const maxSpeakers = settings.maxSpeakers || MAX_SPEAKERS;
      const minNewSpeakerMs = settings.minNewSpeakerMs || 850;
      const centroids = [];
      let last = -1;

      function similarities(vector) {
        const result = new Array(centroids.length);
        for (let i = 0; i < centroids.length; i++) result[i] = cosineSimilarity(vector, centroids[i]);
        return result;
      }

      function bestOf(sims) {
        let index = -1;
        let score = -Infinity;
        for (let i = 0; i < sims.length; i++) {
          if (sims[i] > score) {
            score = sims[i];
            index = i;
          }
        }
        return { index, score };
      }

      function updateCentroid(index, vector, durationMs) {
        const alpha = clamp(durationMs / 9000, 0.12, 0.34);
        const current = centroids[index];
        const mixed = new Array(current.length);
        for (let i = 0; i < current.length; i++) mixed[i] = current[i] * (1 - alpha) + vector[i] * alpha;
        centroids[index] = normalizeVector(mixed);
      }

      return {
        /** Predict a speaker without changing the model (interim captions). */
        peek(embedding) {
          if (!embedding || !centroids.length) return null;
          const vector = normalizeVector(embedding.vector);
          const sims = similarities(vector);
          const best = bestOf(sims);
          if (best.index < 0 || best.score < 0.78) return null;
          return best.index;
        },
        /** Assign an utterance and update the model. Returns the speaker index. */
        assign(embedding, durationMs) {
          const duration = Number(durationMs) || 0;
          if (!embedding) return last >= 0 ? last : 0;
          const vector = normalizeVector(embedding.vector);
          if (!centroids.length) {
            centroids.push(vector);
            last = 0;
            return 0;
          }
          const sims = similarities(vector);
          const best = bestOf(sims);
          let speaker;
          if (best.score >= threshold) {
            speaker = best.index;
          } else if (centroids.length < maxSpeakers && duration >= minNewSpeakerMs) {
            centroids.push(vector);
            speaker = centroids.length - 1;
            last = speaker;
            return speaker;
          } else {
            speaker = best.index;
          }
          if (
            last >= 0 &&
            last !== speaker &&
            duration < 1200 &&
            sims[last] >= best.score - 0.07
          ) {
            speaker = last;
          }
          updateCentroid(speaker, vector, duration);
          last = speaker;
          return speaker;
        },
        /** Fold the `from` centroid into `to` and shift the remaining indexes. */
        merge(from, to) {
          if (from === to) return;
          if (from < 0 || to < 0 || from >= centroids.length || to >= centroids.length) return;
          if (centroids[from] && centroids[to]) {
            const mixed = centroids[to].map((value, index) => (value + centroids[from][index]) / 2);
            centroids[to] = normalizeVector(mixed);
          }
          centroids.splice(from, 1);
          const adjustedTo = to > from ? to - 1 : to;
          if (last === from) last = adjustedTo;
          else if (last > from) last -= 1;
        },
        /** Forget every learned speaker (a fresh recording). */
        reset() {
          centroids.length = 0;
          last = -1;
        },
        speakerCount() {
          return centroids.length;
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Canonical 16 kHz mono PCM16 WAV (the speech remote's accepted format)
     * ------------------------------------------------------------------ */

    function encodeWave(samples) {
      const bytes = new Uint8Array(44 + samples.length * 2);
      const view = new DataView(bytes.buffer);
      const text = (at, value) => {
        for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
      };
      text(0, 'RIFF');
      view.setUint32(4, bytes.length - 8, true);
      text(8, 'WAVE');
      text(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, TARGET_RATE, true);
      view.setUint32(28, TARGET_RATE * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      text(36, 'data');
      view.setUint32(40, samples.length * 2, true);
      for (let i = 0; i < samples.length; i++) {
        const value = clamp(samples[i], -1, 1);
        view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
      }
      return bytes;
    }

    function audioBase64(bytes) {
      let text = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      return btoa(text);
    }

    /* ------------------------------------------------------------------ *
     * Sample-rate fallback: the AudioContext normally runs at 16 kHz, but a
     * platform that ignores the requested rate is resampled here.
     * ------------------------------------------------------------------ */

    function createLinearResampler(fromRate, toRate) {
      const ratio = fromRate / toRate;
      let last = 0;
      let position = 0;
      return {
        push(input) {
          const source = new Float32Array(input.length + 1);
          source[0] = last;
          source.set(input, 1);
          const output = [];
          while (position < source.length - 1) {
            const index = Math.floor(position);
            const fraction = position - index;
            output.push(source[index] * (1 - fraction) + source[index + 1] * fraction);
            position += ratio;
          }
          position -= source.length - 1;
          last = source[source.length - 1];
          return new Float32Array(output);
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Energy VAD: cuts the stream into utterances, keeps a pre-roll, bounds
     * each utterance so one ASR request stays well inside the Remote limits.
     * ------------------------------------------------------------------ */

    function createVadSegmenter(onEvent) {
      const preRollFrames = 18; // ~360 ms
      const startRun = 3; // 60 ms above threshold
      const endSilenceFrames = 32; // 640 ms of silence ends the utterance
      const minSpeechFrames = 16; // 320 ms
      const maxFrames = Math.round(MAX_UTTERANCE_MS / 20);
      const tailFrames = 10;
      const thresholdFloor = 0.006;
      const thresholdFactor = 2.6;

      let pending = zeros(0);
      let noise = 0.004;
      let state = 'silence';
      let speechRun = 0;
      let silenceRun = 0;
      let utterance = null;
      let pre = [];
      let frameIndex = 0;

      function frameRms(frame) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        return Math.sqrt(sum / frame.length);
      }

      function updateNoise(rms, isSpeech) {
        if (!isSpeech) {
          if (rms < noise) noise = noise * 0.9 + rms * 0.1;
          else noise = noise * 0.996 + rms * 0.004;
          noise = clamp(noise, 0.0004, 0.05);
        }
      }

      function emit(event) {
        try {
          onEvent(event);
        } catch (err) {
          /* a listener failure must not stop capture */
        }
      }

      function begin(startFrame) {
        state = 'speech';
        silenceRun = 0;
        utterance = {
          startFrame,
          frames: pre.length ? pre.slice() : [],
        };
        pre = [];
        emit({ type: 'start', startMs: Math.max(0, startFrame * 20) });
      }

      function finish(forced) {
        const current = utterance;
        const trailingSilence = silenceRun;
        utterance = null;
        state = 'silence';
        speechRun = 0;
        silenceRun = 0;
        if (!current) return;
        let frames = current.frames;
        if (!forced) {
          const drop = Math.max(0, trailingSilence - 8);
          frames = frames.slice(0, Math.max(0, frames.length - drop));
        }
        const kept = frames.length;
        if (kept < minSpeechFrames) {
          pre = [];
          emit({ type: 'drop' });
          return;
        }
        const samples = concatFloat32(frames);
        const startMs = current.startFrame * 20;
        emit({
          type: 'end',
          samples,
          startMs,
          endMs: startMs + kept * 20,
          durationMs: kept * 20,
        });
        if (forced) {
          const tail = frames.slice(Math.max(0, frames.length - tailFrames));
          const tailStart = current.startFrame + frames.length - tail.length;
          pre = [];
          begin(tailStart);
          utterance.frames = tail;
        }
      }

      function processFrame(frame) {
        const rms = frameRms(frame);
        const threshold = Math.max(thresholdFloor, noise * thresholdFactor);
        const isSpeech = rms > threshold;
        updateNoise(rms, isSpeech);
        if (state === 'silence') {
          pre.push(frame);
          if (pre.length > preRollFrames) pre.shift();
          if (isSpeech) speechRun++;
          else speechRun = 0;
          if (speechRun >= startRun) {
            const startFrame = Math.max(0, frameIndex - pre.length + 1);
            begin(startFrame);
          }
        } else if (utterance) {
          utterance.frames.push(frame);
          if (isSpeech) silenceRun = 0;
          else silenceRun++;
          const elapsed = utterance.frames.length * 20;
          emit({ type: 'progress', elapsedMs: elapsed, startMs: utterance.startFrame * 20 });
          if (silenceRun >= endSilenceFrames) finish(false);
          else if (utterance.frames.length >= maxFrames) finish(true);
        }
        frameIndex++;
      }

      return {
        push(samples) {
          pending = concatFloat32([pending, samples]);
          let offset = 0;
          while (pending.length - offset >= FRAME_SAMPLES) {
            const frame = pending.slice(offset, offset + FRAME_SAMPLES);
            offset += FRAME_SAMPLES;
            processFrame(frame);
          }
          pending = offset >= pending.length ? zeros(0) : pending.slice(offset);
        },
        /** Current utterance audio, or null outside speech (used for interim captions). */
        currentSamples() {
          if (!utterance || !utterance.frames.length) return null;
          return concatFloat32(utterance.frames);
        },
        currentStartMs() {
          return utterance ? utterance.startFrame * 20 : 0;
        },
        isSpeaking() {
          return state === 'speech';
        },
        reset() {
          pending = zeros(0);
          state = 'silence';
          speechRun = 0;
          silenceRun = 0;
          utterance = null;
          pre = [];
          frameIndex = 0;
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Speech service bridge
     *
     * The Harness voice-input bundle mounts the `speech` Remote. This bridge
     * waits for that namespace, follows the provider catalog, and exposes the
     * three actions the panel needs. If the namespace never appears, the page
     * stays usable and explains what to enable.
     * ------------------------------------------------------------------ */

    function delay(ms, signal) {
      return new Promise((resolve) => {
        if (signal && signal.aborted) return resolve();
        const timer = setTimeout(done, ms);
        function done() {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', done);
          resolve();
        }
        if (signal) signal.addEventListener('abort', done, { once: true });
      });
    }

    function createSpeechBridge(ctx) {
      let current = {
        available: false,
        connected: false,
        catalog: null,
        error: null,
        speech: null,
      };
      const listeners = new Set();

      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (err) {
            /* one faulty view must not stop the others */
          }
        }
      }

      function set(patch) {
        current = Object.assign({}, current, patch);
        emit();
      }

      async function observe(speech, signal) {
        while (!signal.aborted) {
          try {
            for await (const frame of speech.follow(signal)) {
              if (signal.aborted) break;
              const value = frame && typeof frame === 'object' && 'value' in frame ? frame.value : frame;
              if (value && Array.isArray(value.providers)) {
                set({ connected: true, catalog: value, error: null });
              }
              if (frame && typeof frame.accept === 'function') {
                try {
                  frame.accept();
                } catch (err) {
                  /* accepting a coalesced frame twice is harmless */
                }
              }
            }
          } catch (err) {
            if (signal.aborted) break;
            set({ connected: false, error: err && err.message ? err.message : String(err) });
          }
          if (signal.aborted) break;
          await delay(2000, signal);
        }
      }

      function connect(context) {
        let attached = false;

        function attach(ownerCtx) {
          if (attached) return;
          let speech;
          try {
            speech = ownerCtx.remote && ownerCtx.remote.speech;
          } catch (err) {
            return;
          }
          if (!speech) return;
          attached = true;
          const controller = new AbortController();
          set({ available: true, connected: true, speech });
          observe(speech, controller.signal);
          ownerCtx.effect(() => () => {
            attached = false;
            controller.abort();
            set({ available: false, connected: false, catalog: null, speech: null });
          });
        }

        // The voice-input plugin normally mounts the speech Remote before this
        // bundle runs; attach immediately when possible, otherwise wait for the
        // injected service to appear.
        attach(context);
        const scope = context.inject(['remote.speech'], (child) => attach(child));
        context.effect(() => () => {
          try {
            scope.dispose();
          } catch (err) {
            /* already disposed */
          }
        });
      }

      async function call(method, args) {
        const speech = current.speech;
        if (!speech || typeof speech[method] !== 'function') {
          return { ok: false, error: { message: 'speech service unavailable' } };
        }
        try {
          const result = await speech[method].apply(speech, args);
          if (result && typeof result === 'object' && 'ok' in result) return result;
          return { ok: true, value: result };
        } catch (err) {
          return { ok: false, error: { message: err && err.message ? err.message : String(err) } };
        }
      }

      return {
        connect,
        getSnapshot() {
          return current;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        prepare(providerId, options) {
          // The speech Remote declares a fixed two-argument signature.  Passing
          // only the provider id makes the RPC codec reject the request before
          // it reaches the local provider, so always include an options object.
          return call('prepare', [providerId, options || {}]);
        },
        cancelPreparation(providerId) {
          return call('cancelPreparation', [providerId]);
        },
        configure(patch) {
          return call('configure', [patch]);
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Microphone capture
     * ------------------------------------------------------------------ */

    function createCaptureError(kind, error) {
      const value = new Error(kind);
      value.kind = kind;
      value.cause = error;
      return value;
    }

    function mapCaptureError(error) {
      if (error && error.kind) return error;
      const name = error && error.name ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') return createCaptureError('permission', error);
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return createCaptureError('deviceMissing', error);
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        return createCaptureError('unsupported', error);
      }
      return createCaptureError('capture', error);
    }

    function readSavedDeviceId() {
      try {
        const value = window.localStorage.getItem(DEVICE_KEY);
        return typeof value === 'string' ? value : '';
      } catch (err) {
        return '';
      }
    }

    function saveDeviceId(deviceId) {
      try {
        window.localStorage.setItem(DEVICE_KEY, deviceId || '');
      } catch (err) {
        /* device preference is optional */
      }
    }

    function createCapture(options) {
      const onSamples = options.onSamples;
      const onError = options.onError;
      let stream = null;
      let context = null;
      let source = null;
      let processor = null;
      let mute = null;
      let resampler = null;
      let recorder = null;
      let recorderChunks = [];
      let closed = false;
      let level = 0;
      let disposed = false;

      function releaseTracks() {
        if (!stream) return;
        try {
          for (const track of stream.getTracks()) track.stop();
        } catch (err) {
          /* ignore */
        }
        stream = null;
      }

      function stopRecorder() {
        return new Promise((resolve) => {
          const active = recorder;
          recorder = null;
          if (!active || active.state === 'inactive') return resolve();
          const finish = () => resolve();
          active.onstop = finish;
          try {
            active.stop();
          } catch (err) {
            resolve();
          }
          setTimeout(finish, 2000);
        });
      }

      function interrupt(error) {
        if (closed) return;
        try {
          onError(mapCaptureError(error || createCaptureError('interrupted')));
        } catch (err) {
          /* ignore listener failure */
        }
      }

      return {
        async start(deviceId) {
          if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            throw createCaptureError('unsupported');
          }
          if (typeof AudioContext === 'undefined') throw createCaptureError('unsupported');
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: Object.assign(
                {
                  channelCount: 1,
                  echoCancellation: false,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
                deviceId ? { deviceId: { exact: deviceId } } : {},
              ),
              video: false,
            });
          } catch (error) {
            throw mapCaptureError(error);
          }
          if (disposed) {
            releaseTracks();
            throw createCaptureError('cancelled');
          }
          const track = stream.getAudioTracks()[0];
          if (track) {
            saveDeviceId(deviceId || '');
            track.addEventListener(
              'ended',
              () => {
                if (!closed) interrupt(createCaptureError('interrupted'));
              },
              { signal: undefined },
            );
          }
          try {
            try {
              context = new AudioContext({ sampleRate: TARGET_RATE, latencyHint: 'interactive' });
            } catch (err) {
              context = new AudioContext();
            }
            if (context.state === 'suspended') await context.resume();
            const rate = context.sampleRate;
            resampler = rate === TARGET_RATE ? null : createLinearResampler(rate, TARGET_RATE);
            source = context.createMediaStreamSource(stream);
            processor = context.createScriptProcessor(2048, 1, 1);
            mute = context.createGain();
            mute.gain.value = 0;
            processor.onaudioprocess = (event) => {
              if (closed) return;
              const input = event.inputBuffer.getChannelData(0);
              let samples;
              try {
                samples = resampler ? resampler.push(input) : new Float32Array(input);
              } catch (err) {
                return;
              }
              let sum = 0;
              for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
              level = Math.sqrt(sum / Math.max(1, samples.length));
              try {
                onSamples(samples);
              } catch (err) {
                /* ignore pipeline failure */
              }
            };
            source.connect(processor);
            processor.connect(mute);
            mute.connect(context.destination);
          } catch (error) {
            releaseTracks();
            throw mapCaptureError(error);
          }
          try {
            const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
            const mime = candidates.find((item) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(item));
            recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            recorder.ondataavailable = (event) => {
              if (event.data && event.data.size > 0) recorderChunks.push(event.data);
            };
            recorder.onerror = () => interrupt(createCaptureError('interrupted'));
            recorder.start(1000);
          } catch (err) {
            recorder = null;
            recorderChunks = [];
          }
        },
        async stop() {
          if (closed) return null;
          closed = true;
          if (processor) {
            try {
              processor.disconnect();
            } catch (err) {
              /* ignore */
            }
            processor.onaudioprocess = null;
            processor = null;
          }
          if (source) {
            try {
              source.disconnect();
            } catch (err) {
              /* ignore */
            }
            source = null;
          }
          if (mute) {
            try {
              mute.disconnect();
            } catch (err) {
              /* ignore */
            }
            mute = null;
          }
          await stopRecorder();
          releaseTracks();
          const ctx = context;
          context = null;
          if (ctx && ctx.state !== 'closed') {
            try {
              await ctx.close();
            } catch (err) {
              /* ignore */
            }
          }
          if (!recorderChunks.length) return null;
          const type = recorderChunks[0] && recorderChunks[0].type ? recorderChunks[0].type : 'audio/webm';
          return new Blob(recorderChunks, { type });
        },
        async dispose() {
          if (disposed) return;
          disposed = true;
          closed = true;
          try {
            if (processor) processor.disconnect();
          } catch (err) {
            /* ignore */
          }
          try {
            if (source) source.disconnect();
          } catch (err) {
            /* ignore */
          }
          try {
            if (mute) mute.disconnect();
          } catch (err) {
            /* ignore */
          }
          if (recorder && recorder.state !== 'inactive') {
            try {
              recorder.stop();
            } catch (err) {
              /* ignore */
            }
          }
          releaseTracks();
          const ctx = context;
          context = null;
          if (ctx && ctx.state !== 'closed') {
            try {
              await ctx.close();
            } catch (err) {
              /* ignore */
            }
          }
        },
        getLevel() {
          return level;
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Transcription queue: finals are never dropped, interim captions are
     * best-effort and skipped while a final is queued or running.
     * ------------------------------------------------------------------ */

    function createTranscriptionQueue(speech, selection, handlers) {
      const finals = [];
      let interimJob = null;
      let running = false;
      let disposed = false;
      const controller = new AbortController();
      let idleWaiters = [];

      function settleIdle() {
        if (running || finals.length || interimJob) return;
        const waiters = idleWaiters;
        idleWaiters = [];
        for (const resolve of waiters) resolve();
      }

      async function transcribe(job) {
        const bytes = encodeWave(job.samples);
        const request = { audioBase64: audioBase64(bytes) };
        if (selection.providerId) request.providerId = selection.providerId;
        if (selection.language) request.language = selection.language;
        const result = await speech.transcribe(request, controller.signal);
        if (result && typeof result === 'object' && 'ok' in result) {
          if (result.ok) return result.value;
          throw new Error(result.error && result.error.message ? result.error.message : 'transcription failed');
        }
        return result;
      }

      function pump() {
        if (disposed || running) return;
        const job = finals.shift() || interimJob;
        interimJob = null;
        if (!job) {
          settleIdle();
          return;
        }
        running = true;
        transcribe(job)
          .then((value) => {
            if (!disposed) handlers.onResult(job, value);
          })
          .catch((error) => {
            if (!disposed) handlers.onError(job, error);
          })
          .then(() => {
            running = false;
            pump();
          });
      }

      return {
        enqueueFinal(job) {
          if (disposed) return;
          finals.push(job);
          pump();
        },
        canInterim() {
          return !disposed && !running && !finals.length;
        },
        requestInterim(job) {
          if (disposed || running || finals.length) return false;
          interimJob = job;
          pump();
          return true;
        },
        idle(timeoutMs) {
          if (!running && !finals.length) return Promise.resolve();
          return new Promise((resolve) => {
            let timer = null;
            const done = () => {
              if (timer) clearTimeout(timer);
              settleIdle();
              resolve();
            };
            idleWaiters.push(done);
            if (timeoutMs) {
              timer = setTimeout(() => {
                const index = idleWaiters.indexOf(done);
                if (index >= 0) idleWaiters.splice(index, 1);
                resolve();
              }, timeoutMs);
            }
          });
        },
        cancel() {
          disposed = true;
          controller.abort();
          finals.length = 0;
          interimJob = null;
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Recording history in localStorage
     * ------------------------------------------------------------------ */

    function normalizeSession(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const lines = [];
      if (Array.isArray(raw.lines)) {
        for (const item of raw.lines) {
          if (!item || typeof item.text !== 'string' || !item.text) continue;
          lines.push({
            id: typeof item.id === 'string' && item.id ? item.id : makeId(),
            speaker: Number.isFinite(item.speaker) ? Math.max(0, Math.floor(item.speaker)) : 0,
            text: item.text,
            startMs: Number.isFinite(item.startMs) ? item.startMs : 0,
            endMs: Number.isFinite(item.endMs) ? item.endMs : 0,
            durationMs: Number.isFinite(item.durationMs) ? item.durationMs : 0,
          });
        }
      }
      if (!lines.length) return null;
      const speakers = Array.isArray(raw.speakers)
        ? raw.speakers.slice(0, 16).map((item) => ({
            name: item && typeof item.name === 'string' ? item.name : '',
          }))
        : [];
      const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
        title: typeof raw.title === 'string' && raw.title ? raw.title : '',
        createdAt,
        durationMs: Number.isFinite(raw.durationMs) ? Math.max(0, raw.durationMs) : 0,
        language: typeof raw.language === 'string' ? raw.language : '',
        speakers,
        lines,
      };
    }

    function loadHistoryState() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { sessions: [] };
        const parsed = JSON.parse(raw);
        const source = parsed && Array.isArray(parsed.sessions) ? parsed.sessions : [];
        const sessions = [];
        const seen = new Set();
        for (const item of source) {
          const session = normalizeSession(item);
          if (session && !seen.has(session.id)) {
            seen.add(session.id);
            sessions.push(session);
          }
        }
        sessions.sort((a, b) => b.createdAt - a.createdAt);
        return { sessions: sessions.slice(0, MAX_HISTORY) };
      } catch (err) {
        return { sessions: [] };
      }
    }

    function createHistoryStore() {
      let sessions = loadHistoryState().sessions;
      let error = null;
      const listeners = new Set();

      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (err) {
            /* one faulty view must not stop the others */
          }
        }
      }

      function persist() {
        try {
          let payload = sessions;
          let json = JSON.stringify({ sessions: payload });
          while (json.length > MAX_STORE_BYTES && payload.length > 1) {
            payload = payload.slice(0, payload.length - 1);
            json = JSON.stringify({ sessions: payload });
          }
          sessions = payload;
          window.localStorage.setItem(STORAGE_KEY, json);
          if (error) {
            error = null;
            emit();
          }
          return { ok: true };
        } catch (err) {
          error = { key: 'storageError' };
          emit();
          return { ok: false };
        }
      }

      function setSessions(next) {
        sessions = next;
        emit();
        return persist();
      }

      return {
        getSnapshot() {
          return { sessions, error };
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        get(id) {
          const found = sessions.find((session) => session.id === id);
          return found || null;
        },
        add(session) {
          const next = [session].concat(sessions.filter((item) => item.id !== session.id)).slice(0, MAX_HISTORY);
          return setSessions(next);
        },
        update(id, patch) {
          let changed = false;
          const next = sessions.map((session) => {
            if (session.id !== id) return session;
            changed = true;
            return Object.assign({}, session, patch);
          });
          if (!changed) return { ok: true };
          return setSessions(next);
        },
        remove(id) {
          return setSessions(sessions.filter((session) => session.id !== id));
        },
      };
    }

    function loadDraft() {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const session = normalizeSession({
          id: 'draft-' + (parsed && parsed.startedAt ? parsed.startedAt : Date.now()),
          title: parsed && parsed.title,
          createdAt: parsed && parsed.startedAt,
          durationMs: parsed && parsed.durationMs,
          speakers: parsed && parsed.speakers,
          lines: parsed && parsed.lines,
        });
        if (!session) return null;
        return session;
      } catch (err) {
        return null;
      }
    }

    function saveDraft(session) {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            version: 1,
            startedAt: session.createdAt,
            durationMs: session.durationMs,
            title: session.title,
            speakers: session.speakers,
            lines: session.lines,
          }),
        );
      } catch (err) {
        /* the draft is best-effort; the history still saves on stop */
      }
    }

    function clearDraft() {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch (err) {
        /* ignore */
      }
    }

    /* ------------------------------------------------------------------ *
     * Device resource Provider
     *
     * The unified device-side resource interface (the `resource-api` bundle)
     * asks every plugin that owns local content for its own Provider. This
     * plugin owns the recordings in `dsh.facechat.v1`, so the Provider below
     * is the only place that knows how they are stored: it reads them through
     * the same `loadHistoryState()` reader the page uses.
     * ------------------------------------------------------------------ */

    /**
     * Register one Provider with the device-side resource registry.
     *
     * Copied from `resource-api/templates/provider.js`. The registration is
     * safe in either load order: if the registry is already mounted the
     * Provider goes through its sink, otherwise it is queued and the registry
     * drains the queue when it loads.
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

    function facechatIsChinese(locale) {
      return typeof locale === 'string' && locale.toLowerCase().indexOf('zh') === 0;
    }

    function facechatDict(locale) {
      return facechatIsChinese(locale) ? DICTS.zh : DICTS.en;
    }

    function facechatSpeakerName(session, index, locale) {
      const entry = session.speakers && session.speakers[index];
      if (entry && entry.name) return entry.name;
      return String(facechatDict(locale).speakerLabel || 'Speaker {n}').replace('{n}', String(index + 1));
    }

    function facechatSpeakerNames(session, locale) {
      const lines = Array.isArray(session.lines) ? session.lines : [];
      const indexes = Array.from(usedSpeakerIndexes(lines).seen).sort((left, right) => left - right);
      return indexes.map((index) => facechatSpeakerName(session, index, locale));
    }

    function facechatSessionTitle(session, locale) {
      if (session.title) return session.title;
      const stamp = formatSessionStamp(session.createdAt, locale);
      return String(facechatDict(locale).untitled || 'Conversation {time}').replace('{time}', stamp);
    }

    /**
     * The transcript as plain text: one line per utterance, prefixed with the
     * elapsed timestamp and the speaker, e.g. "[00:12] 张三: 我们开始吧".
     */
    function facechatTranscriptText(session, locale) {
      const lines = Array.isArray(session.lines) ? session.lines : [];
      return lines
        .filter((line) => line && line.text)
        .map(
          (line) =>
            '[' + formatClock(line.startMs) + '] ' + facechatSpeakerName(session, line.speaker, locale) + ': ' + line.text,
        )
        .join('\n');
    }

    /** A trimmed one-line preview of the first transcript lines. */
    function facechatSnippet(session, locale) {
      const lines = Array.isArray(session.lines) ? session.lines : [];
      const parts = [];
      for (const line of lines) {
        if (!line || !line.text) continue;
        parts.push(facechatSpeakerName(session, line.speaker, locale) + ': ' + line.text);
        if (parts.length >= 3) break;
      }
      const text = parts.join(' ').replace(/\s+/g, ' ').trim();
      return text.length > 160 ? text.slice(0, 159).trimEnd() + '…' : text;
    }

    function facechatIsoDate(timestamp) {
      const date = new Date(Number(timestamp) || 0);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }

    function facechatInTimeRange(timeRange, timestamp) {
      if (!timeRange || typeof timeRange !== 'object') return true;
      const from = Number.isFinite(timeRange.from) ? timeRange.from : null;
      const to = Number.isFinite(timeRange.to) ? timeRange.to : null;
      if (from === null && to === null) return true;
      const value = Number(timestamp) || 0;
      if (from !== null && value < from) return false;
      if (to !== null && value > to) return false;
      return true;
    }

    function facechatMatches(session, needle, locale) {
      if (session.title && session.title.toLowerCase().indexOf(needle) >= 0) return true;
      const speakers = Array.isArray(session.speakers) ? session.speakers : [];
      for (let index = 0; index < speakers.length; index += 1) {
        if (facechatSpeakerName(session, index, locale).toLowerCase().indexOf(needle) >= 0) return true;
      }
      const lines = Array.isArray(session.lines) ? session.lines : [];
      for (const line of lines) {
        if (!line || !line.text) continue;
        if (String(line.text).toLowerCase().indexOf(needle) >= 0) return true;
        if (facechatSpeakerName(session, line.speaker, locale).toLowerCase().indexOf(needle) >= 0) return true;
      }
      return false;
    }

    /**
     * Build the Provider that owns this plugin's recordings.
     *
     * @param {function(): string} getLocale - returns the active locale id.
     * @returns {object} the Provider descriptor.
     */
    function createFacechatProvider(getLocale) {
      const localeOf = () => {
        try {
          return typeof getLocale === 'function' ? String(getLocale() || '') : '';
        } catch (_err) {
          return '';
        }
      };

      return {
        source: 'facechat',
        title: { zh: '面聊', en: 'Facechat' },
        kind: 'conversation',
        icon: 'session',
        aliases: ['面聊', '录音', '逐字稿', 'meeting', 'facechat', 'transcript'],
        labels: {
          all: { zh: '全部面聊', en: 'All facechat recordings' },
          unit: { zh: '段录音', en: 'recordings' },
          item: { zh: '面聊', en: 'Facechat' },
          empty: { zh: '无逐字稿', en: 'No transcript' },
        },
        async describe(locale) {
          const count = loadHistoryState().sessions.length;
          if (facechatIsChinese(locale)) return count + ' 段录音';
          return count + ' recording' + (count === 1 ? '' : 's');
        },
        async search({ query, timeRange, offset, limit, signal } = {}) {
          if (signal && signal.aborted) return { items: [], total: 0 };
          const locale = localeOf();
          const needle = String(query || '').trim().toLowerCase();
          const matched = loadHistoryState().sessions.filter((session) => {
            if (!facechatInTimeRange(timeRange, session.createdAt)) return false;
            if (!needle) return true;
            return facechatMatches(session, needle, locale);
          });
          const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
          const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : matched.length;
          const items = matched.slice(start, start + size).map((session) => ({
            id: session.id,
            title: facechatSessionTitle(session, locale),
            snippet: facechatSnippet(session, locale),
            updatedAt: session.createdAt,
            createdAt: session.createdAt,
            meta: {
              durationMs: session.durationMs,
              language: session.language,
              speakers: facechatSpeakerNames(session, locale),
            },
          }));
          return { items, total: matched.length };
        },
        async read({ ids } = {}) {
          const locale = localeOf();
          const sessions = loadHistoryState().sessions;
          const wanted = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
          const selected = [];
          const collect = (session) => {
            if (!selected.includes(session)) selected.push(session);
          };
          if (wanted.indexOf('all') >= 0) {
            for (const session of sessions) collect(session);
          } else {
            for (const id of wanted) {
              const found = sessions.find((session) => session.id === id);
              if (found) collect(found);
            }
          }
          const items = selected.map((session) => ({
            id: session.id,
            title: facechatSessionTitle(session, locale),
            text: facechatTranscriptText(session, locale),
            updatedAt: session.createdAt,
            createdAt: session.createdAt,
            itemType: 'facechat',
            attributes: { created_at: facechatIsoDate(session.createdAt) },
            meta: {
              durationMs: session.durationMs,
              speakers: facechatSpeakerNames(session, locale),
            },
          }));
          return { items };
        },
      };
    }

    /* ------------------------------------------------------------------ *
     * Recorder engine: lives in the plugin scope, so switching panels does
     * not stop an ongoing recording.
     * ------------------------------------------------------------------ */

    function createEngine(deps) {
      const speechBridge = deps.speech;
      const history = deps.history;
      const glossary = deps.glossary;

      let state = {
        view: 'idle',
        phase: 'idle',
        error: null,
        notice: null,
        startedAt: 0,
        durationMs: 0,
        language: '',
        title: '',
        lines: [],
        speakers: [],
        interim: null,
        review: null,
        selectedId: null,
        audioUrl: null,
        audioMime: '',
        audioSessionId: null,
        recoveredDraft: loadDraft(),
      };
      const listeners = new Set();
      let capture = null;
      let vad = null;
      let clusterer = null;
      let queue = null;
      let startedAt = 0;
      let chunk = null;
      let chunkSeq = 0;
      let lastInterimAt = 0;
      let draftTimer = null;

      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (err) {
            /* one faulty view must not stop the others */
          }
        }
      }

      function set(patch) {
        state = Object.assign({}, state, patch);
        emit();
      }

      function revokeAudio() {
        if (state.audioUrl) {
          try {
            URL.revokeObjectURL(state.audioUrl);
          } catch (err) {
            /* ignore */
          }
        }
      }

      function ensureSpeakers(list, index) {
        const next = list.slice();
        while (next.length <= index) next.push({ name: '' });
        return next;
      }

      function speakerName(index) {
        const entry = state.speakers[index];
        return entry && entry.name ? entry.name : '';
      }

      function draftSession() {
        const lines = state.lines
          .filter((line) => line.text)
          .map((line) => ({
            id: line.id,
            speaker: line.speaker,
            text: line.text,
            startMs: line.startMs,
            endMs: line.endMs,
            durationMs: line.durationMs,
          }));
        if (!lines.length) return null;
        return {
          id: 'draft',
          title: state.title,
          createdAt: startedAt || state.startedAt || Date.now(),
          durationMs: startedAt ? Date.now() - startedAt : state.durationMs,
          language: state.language,
          speakers: state.speakers.map((entry) => ({ name: entry.name || '' })),
          lines,
        };
      }

      function scheduleDraft() {
        if (draftTimer) return;
        draftTimer = setTimeout(() => {
          draftTimer = null;
          const session = draftSession();
          if (session) saveDraft(session);
        }, 1200);
      }

      function flushDraft() {
        if (draftTimer) {
          clearTimeout(draftTimer);
          draftTimer = null;
        }
        const session = draftSession();
        if (session) saveDraft(session);
      }

      function setSpeakers(index) {
        const speakers = ensureSpeakers(state.speakers, index);
        set({ speakers });
      }

      function handleCaptureFailure(error) {
        if (state.phase !== 'recording' && state.phase !== 'starting') return;
        flushDraft();
        if (capture) {
          capture.dispose().catch(() => void 0);
          capture = null;
        }
        if (queue) {
          queue.cancel();
          queue = null;
        }
        vad = null;
        chunk = null;
        const durationMs = startedAt ? Math.max(0, Date.now() - startedAt) : state.durationMs;
        const speakers = state.speakers.map((entry) => ({ name: entry.name || '' }));
        const lines = state.lines
          .filter((line) => line.text)
          .map((line) => ({
            id: line.id,
            speaker: line.speaker,
            text: line.text,
            startMs: line.startMs,
            endMs: line.endMs,
            durationMs: line.durationMs,
          }));
        const errorState = {
          key: captureErrorKey(error),
          params: { message: error && error.message && error.message !== error.kind ? error.message : '' },
        };
        if (lines.length) {
          const session = {
            id: makeId(),
            title: state.title || '',
            createdAt: startedAt || Date.now(),
            durationMs,
            language: state.language,
            speakers,
            lines,
          };
          history.add(session);
          clearDraft();
          set({
            phase: 'idle',
            view: 'review',
            review: session,
            selectedId: session.id,
            lines,
            speakers,
            interim: null,
            durationMs,
            startedAt: startedAt || Date.now(),
            error: errorState,
            recoveredDraft: null,
          });
        } else {
          set({ phase: 'idle', interim: null, durationMs, error: errorState });
        }
        startedAt = 0;
      }

      function captureErrorKey(error) {
        const kind = error && error.kind ? error.kind : 'capture';
        if (kind === 'permission') return 'errorPermission';
        if (kind === 'unsupported') return 'errorUnsupported';
        if (kind === 'deviceMissing') return 'errorDeviceMissing';
        if (kind === 'interrupted') return 'errorInterrupted';
        return 'errorCapture';
      }

      function handleVadEvent(event) {
        if (state.phase !== 'recording') return;
        if (event.type === 'start') {
          chunkSeq++;
          chunk = { gen: chunkSeq, startMs: event.startMs };
          lastInterimAt = 0;
          if (state.interim) set({ interim: null });
          return;
        }
        if (event.type === 'drop') {
          chunk = null;
          lastInterimAt = 0;
          if (state.interim) set({ interim: null });
          return;
        }
        if (event.type === 'progress') {
          if (!chunk || !vad || !queue) return;
          if (event.elapsedMs < INTERIM_MIN_MS) return;
          if (event.elapsedMs - lastInterimAt < INTERIM_INTERVAL_MS) return;
          const samples = vad.currentSamples();
          if (!samples || samples.length < FRAME_SAMPLES * 4) return;
          const gen = chunk.gen;
          const startMs = chunk.startMs;
          lastInterimAt = event.elapsedMs;
          const job = { kind: 'interim', gen, samples, startMs };
          // Leave the audio callback before encoding/base64 work.
          setTimeout(() => {
            if (state.phase !== 'recording') return;
            if (!queue || !queue.canInterim()) return;
            if (!queue.requestInterim(job)) return;
            set({ interim: { text: '', startMs, pending: true } });
          }, 0);
          return;
        }
        if (event.type === 'end') {
          const current = chunk;
          chunk = null;
          lastInterimAt = 0;
          set({ interim: null });
          // Embedding and WAV encoding are deferred out of the capture callback.
          setTimeout(() => {
            if (state.phase !== 'recording' && state.phase !== 'stopping') return;
            finalizeUtterance(event, current);
          }, 0);
        }
      }

      function finalizeUtterance(event, current) {
        if (!current || event.durationMs < MIN_UTTERANCE_MS) {
          if (state.interim) set({ interim: null });
          return;
        }
        let embedding = null;
        try {
          embedding = extractEmbedding(event.samples);
        } catch (err) {
          embedding = null;
        }
        let speakerIndex = 0;
        try {
          speakerIndex = clusterer ? clusterer.assign(embedding, event.durationMs) : 0;
        } catch (err) {
          speakerIndex = 0;
        }
        const speakers = ensureSpeakers(state.speakers, speakerIndex);
        const line = {
          id: makeId(),
          speaker: speakerIndex,
          text: '',
          status: 'pending',
          startMs: event.startMs,
          endMs: event.endMs,
          durationMs: event.durationMs,
        };
        set({ lines: state.lines.concat([line]), speakers, interim: null });
        if (queue) {
          queue.enqueueFinal({ kind: 'final', samples: event.samples, lineId: line.id });
        }
        scheduleDraft();
      }

      function handleTranscription(job, value) {
        if (!value || typeof value.text !== 'string') return;
        const text = glossary ? glossary.refine(value.text) : cleanTranscript(value.text);
        if (job.kind === 'interim') {
          if (!chunk || chunk.gen !== job.gen || state.phase !== 'recording') return;
          if (!text) return;
          set({ interim: { text, startMs: job.startMs, pending: false } });
          return;
        }
        const index = state.lines.findIndex((line) => line.id === job.lineId);
        if (index < 0) return;
        if (!text) {
          const lines = state.lines.slice();
          lines.splice(index, 1);
          set({ lines });
          return;
        }
        const lines = state.lines.slice();
        lines[index] = Object.assign({}, lines[index], { text, status: 'final' });
        set({ lines });
        scheduleDraft();
      }

      function handleTranscriptionError(job, error) {
        const message = error && error.message ? error.message : String(error);
        if (job.kind === 'interim') {
          if (state.interim && state.interim.pending) set({ interim: null });
          return;
        }
        const index = state.lines.findIndex((line) => line.id === job.lineId);
        if (index >= 0) {
          const lines = state.lines.slice();
          lines[index] = Object.assign({}, lines[index], { status: 'error', text: '' });
          set({ lines, notice: { key: 'transcribeFailure', params: { message } } });
        }
      }

      async function start() {
        if (state.phase === 'starting' || state.phase === 'recording' || state.phase === 'stopping') return;
        const speech = speechBridge.getSnapshot();
        const catalog = speech.catalog;
        const provider = catalog
          ? catalog.providers.find((item) => item.id === catalog.selection.providerId)
          : null;
        if (!speech.available || !speech.connected) {
          set({ error: { key: 'errorSpeechUnavailable' } });
          return;
        }
        if (!catalog || !provider) {
          set({ error: { key: 'errorNotReady' } });
          return;
        }
        const preparation = provider.preparation && provider.preparation.phase;
        if (preparation !== 'ready' && preparation !== 'standby' && preparation !== 'waking') {
          set({ error: { key: 'errorNotReady' } });
          return;
        }
        revokeAudio();
        clusterer = createSpeakerClusterer({});
        chunk = null;
        chunkSeq = 0;
        lastInterimAt = 0;
        startedAt = 0;
        set({
          view: 'live',
          phase: 'starting',
          error: null,
          notice: null,
          startedAt: 0,
          durationMs: 0,
          language: catalog.selection.language || '',
          title: '',
          lines: [],
          speakers: [{ name: '' }],
          interim: null,
          review: null,
          selectedId: null,
          audioUrl: null,
          audioMime: '',
          audioSessionId: null,
          recoveredDraft: null,
        });
        queue = createTranscriptionQueue(
          speech.speech,
          {
            providerId: provider.id,
            language: catalog.selection.language || '',
          },
          { onResult: handleTranscription, onError: handleTranscriptionError },
        );
        vad = createVadSegmenter(handleVadEvent);
        capture = createCapture({
          onSamples(samples) {
            if (!vad) return;
            vad.push(samples);
          },
          onError(error) {
            handleCaptureFailure(error);
          },
        });
        try {
          await capture.start(readSavedDeviceId());
        } catch (error) {
          if (capture) {
            capture.dispose().catch(() => void 0);
            capture = null;
          }
          if (queue) {
            queue.cancel();
            queue = null;
          }
          vad = null;
          set({
            phase: 'idle',
            view: 'idle',
            error: {
              key: captureErrorKey(error),
              params: { message: error && error.message && error.message !== error.kind ? error.message : '' },
            },
          });
          return;
        }
        startedAt = Date.now();
        set({ phase: 'recording', startedAt });
      }

      async function stop() {
        if (state.phase !== 'recording' && state.phase !== 'starting') return;
        set({ phase: 'stopping' });
        const started = startedAt || Date.now();
        let blob = null;
        if (capture) {
          try {
            blob = await capture.stop();
          } catch (err) {
            blob = null;
          }
          capture = null;
        }
        vad = null;
        if (queue) {
          await queue.idle(30000);
          queue.cancel();
          queue = null;
        }
        if (draftTimer) {
          clearTimeout(draftTimer);
          draftTimer = null;
        }
        const durationMs = Math.max(0, Date.now() - started);
        const speakers = state.speakers.map((entry) => ({ name: entry.name || '' }));
        const lines = state.lines
          .filter((line) => line.text)
          .map((line) => ({
            id: line.id,
            speaker: line.speaker,
            text: line.text,
            startMs: line.startMs,
            endMs: line.endMs,
            durationMs: line.durationMs,
          }));
        const now = Date.now();
        const session = {
          id: makeId(),
          title: state.title || '',
          createdAt: started,
          durationMs,
          language: state.language,
          speakers,
          lines,
        };
        let saveError = null;
        if (lines.length) {
          const result = history.add(session);
          if (result && result.ok === false) saveError = { key: 'storageError' };
        }
        let audioUrl = null;
        let audioSessionId = null;
        if (blob && blob.size > 0) {
          audioUrl = URL.createObjectURL(blob);
          audioSessionId = session.id;
        }
        clearDraft();
        chunk = null;
        chunkSeq = 0;
        lastInterimAt = 0;
        clusterer = null;
        revokeAudio();
        set({
          phase: 'idle',
          view: lines.length ? 'review' : 'idle',
          review: lines.length ? session : null,
          selectedId: lines.length ? session.id : null,
          lines,
          speakers,
          interim: null,
          startedAt: started,
          durationMs,
          language: session.language,
          audioUrl,
          audioMime: blob && blob.type ? blob.type : 'audio/webm',
          audioSessionId,
          recoveredDraft: null,
          error: saveError,
          notice: lines.length ? null : { key: 'errorEmpty' },
        });
        startedAt = 0;
      }

      function clearPlayback() {
        const audioSessionId = state.audioSessionId;
        revokeAudio();
        set({ audioUrl: null, audioMime: '', audioSessionId: null });
        return audioSessionId;
      }

      function selectSession(id) {
        if (state.phase === 'recording' || state.phase === 'starting' || state.phase === 'stopping') return;
        const session = history.get(id);
        if (!session) return;
        if (state.audioSessionId && state.audioSessionId !== id) clearPlayback();
        set({
          view: 'review',
          review: session,
          selectedId: id,
          durationMs: session.durationMs,
          title: session.title || '',
          language: session.language || '',
          error: null,
          notice: null,
        });
      }

      function closeReview() {
        if (state.phase === 'recording') return;
        const keepAudio = state.audioSessionId && state.review && state.review.id === state.audioSessionId;
        if (!keepAudio) clearPlayback();
        set({
          view: 'idle',
          review: null,
          selectedId: null,
          lines: [],
          speakers: [],
          durationMs: 0,
          title: '',
          error: null,
          notice: null,
        });
      }

      function updateReview(mutator) {
        if (!state.review) return;
        const next = mutator({
          lines: state.review.lines.slice(),
          speakers: state.review.speakers.map((entry) => ({ name: entry.name || '' })),
          title: state.review.title || '',
        });
        const review = Object.assign({}, state.review, next);
        history.update(review.id, {
          title: review.title,
          speakers: review.speakers,
          lines: review.lines,
        });
        set({ review, title: review.title });
      }

      function renameSpeaker(index, name) {
        const value = typeof name === 'string' ? name : '';
        if (state.view === 'review') {
          updateReview((draft) => {
            const speakers = draft.speakers.slice();
            while (speakers.length <= index) speakers.push({ name: '' });
            speakers[index] = { name: value };
            return { speakers };
          });
        } else {
          const speakers = ensureSpeakers(state.speakers, index).map((entry, i) =>
            i === index ? { name: value } : entry,
          );
          set({ speakers });
          scheduleDraft();
        }
      }

      function addSpeaker() {
        if (state.view === 'review') {
          let nextIndex = 0;
          updateReview((draft) => {
            nextIndex = draft.speakers.length;
            return { speakers: draft.speakers.concat([{ name: '' }]) };
          });
          return nextIndex;
        }
        const index = state.speakers.length;
        set({ speakers: state.speakers.concat([{ name: '' }]) });
        scheduleDraft();
        return index;
      }

      function reassignLine(lineId, speakerIndex) {
        const index = Math.max(0, Math.floor(speakerIndex));
        if (state.view === 'review') {
          updateReview((draft) => {
            const speakers = draft.speakers.slice();
            while (speakers.length <= index) speakers.push({ name: '' });
            const lines = draft.lines.map((line) =>
              line.id === lineId ? Object.assign({}, line, { speaker: index }) : line,
            );
            return { speakers, lines };
          });
        } else {
          const lines = state.lines.map((line) =>
            line.id === lineId ? Object.assign({}, line, { speaker: index }) : line,
          );
          set({ lines, speakers: ensureSpeakers(state.speakers, index) });
          scheduleDraft();
        }
      }

      function mergeSpeakers(fromIndex, toIndex) {
        const from = Math.max(0, Math.floor(fromIndex));
        const to = Math.max(0, Math.floor(toIndex));
        if (from === to) return;
        const adjustedTo = to > from ? to - 1 : to;
        const remap = (index) => (index === from ? adjustedTo : index > from ? index - 1 : index);
        if (state.view === 'review') {
          updateReview((draft) => ({
            lines: draft.lines.map((line) => Object.assign({}, line, { speaker: remap(line.speaker) })),
            speakers: draft.speakers.filter((entry, index) => index !== from),
          }));
          return;
        }
        if (clusterer) {
          const known = typeof clusterer.speakerCount === 'function' ? clusterer.speakerCount() : -1;
          if (known === state.speakers.length) clusterer.merge(from, to);
          else clusterer.reset();
        }
        set({
          lines: state.lines.map((line) => Object.assign({}, line, { speaker: remap(line.speaker) })),
          speakers: state.speakers.filter((entry, index) => index !== from),
        });
        scheduleDraft();
      }

      function reapplyGlossary() {
        if (!glossary) return;
        if (state.view === 'review') {
          updateReview((draft) => ({
            lines: draft.lines.map((line) => Object.assign({}, line, { text: glossary.refine(line.text) })),
          }));
          return;
        }
        if (!state.lines.length) return;
        set({
          lines: state.lines.map((line) =>
            line.text ? Object.assign({}, line, { text: glossary.refine(line.text) }) : line,
          ),
        });
        scheduleDraft();
      }

      function updateTitle(title) {
        const value = typeof title === 'string' ? title : '';
        if (state.view === 'review') {
          updateReview(() => ({ title: value }));
        } else {
          set({ title: value });
          scheduleDraft();
        }
      }

      function deleteSession(id) {
        const result = history.remove(id);
        if (state.selectedId === id || (state.review && state.review.id === id)) {
          if (state.audioSessionId === id) clearPlayback();
          set({
            view: 'idle',
            review: null,
            selectedId: null,
            lines: [],
            speakers: [],
            durationMs: 0,
            title: '',
          });
        }
        return result;
      }

      function recoverDraft() {
        const draft = state.recoveredDraft;
        if (!draft) return;
        const result = history.add(draft);
        clearDraft();
        if (state.audioSessionId) clearPlayback();
        set({
          view: 'review',
          review: draft,
          selectedId: draft.id,
          durationMs: draft.durationMs,
          title: draft.title || '',
          language: draft.language || '',
          recoveredDraft: null,
          error: result && result.ok === false ? { key: 'storageError' } : null,
          notice: null,
        });
      }

      function discardDraft() {
        clearDraft();
        set({ recoveredDraft: null });
      }

      function getElapsedMs() {
        if (state.phase === 'recording' && startedAt) return Math.max(0, Date.now() - startedAt);
        return state.durationMs;
      }

      function getLevel() {
        return capture ? capture.getLevel() : 0;
      }

      function dispose() {
        if (draftTimer) {
          clearTimeout(draftTimer);
          draftTimer = null;
        }
        if (capture) {
          capture.dispose().catch(() => void 0);
          capture = null;
        }
        if (queue) {
          queue.cancel();
          queue = null;
        }
        revokeAudio();
      }

      return {
        getSnapshot() {
          return state;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        start,
        stop,
        dispose,
        getElapsedMs,
        getLevel,
        selectSession,
        closeReview,
        renameSpeaker,
        addSpeaker,
        reassignLine,
        mergeSpeakers,
        reapplyGlossary,
        updateTitle,
        deleteSession,
        recoverDraft,
        discardDraft,
        speakerName,
      };
    }

    /* ------------------------------------------------------------------ *
     * Localized helpers and Markdown export
     * ------------------------------------------------------------------ */

    function isChineseLocale(active) {
      return typeof active === 'string' && active.toLowerCase().indexOf('zh') === 0;
    }

    function speakerDisplayName(speakers, index, t) {
      const entry = speakers && speakers[index];
      if (entry && entry.name) return entry.name;
      return t('speakerLabel', { n: String(index + 1) });
    }

    function usedSpeakerIndexes(lines) {
      const seen = new Set();
      let max = -1;
      for (const line of lines) {
        if (Number.isFinite(line.speaker)) {
          seen.add(line.speaker);
          if (line.speaker > max) max = line.speaker;
        }
      }
      return { seen, max };
    }

    function cleanSummaryText(value) {
      let text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
      text = text.replace(/^(?:(?:嗯+|啊+|呃+|对对+|对|然后|就是|那个|这个)[,，。.!！?？\s]*)+/i, '').trim();
      return text;
    }

    function splitSummarySentences(value) {
      const text = cleanSummaryText(value);
      if (!text) return [];
      const matches = text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || [text];
      return matches.map(cleanSummaryText).filter(Boolean);
    }

    function summarySignal(text) {
      return /(?:决定|结论|下一步|接下来|需要|应该|计划|建议|负责|确认|目标|优先|会把|可以把|要做|decision|decide|next step|need to|should|plan|recommend|owner|follow up|action item)/i.test(text);
    }

    function summaryCandidateScore(text, lineIndex, totalLines) {
      const length = text.length;
      let score = Math.min(length, 110) / 8;
      if (length >= 14 && length <= 120) score += 5;
      if (summarySignal(text)) score += 9;
      const cues = text.match(/(?:因为|所以|但是|其实|核心|重点|问题|能力|风险|意味着|包括|目的|because|therefore|however|actually|core|important|problem|risk|means|include|purpose)/gi);
      if (cues) score += Math.min(6, cues.length * 2);
      if (/[?？]$/.test(text)) score -= 1.5;
      if (length < 8) score -= 8;
      if (totalLines > 1) score += (lineIndex / (totalLines - 1)) * 0.75;
      return score;
    }

    function summaryFingerprint(text) {
      return text.toLowerCase().replace(/[\s，。！？!?；;：:,.'"“”‘’()（）\-]/g, '').slice(0, 72);
    }

    function pickSummaryCandidates(candidates, limit) {
      const picked = [];
      const sorted = candidates.slice().sort((a, b) => b.score - a.score || a.lineIndex - b.lineIndex);
      for (const candidate of sorted) {
        if (picked.length >= limit) break;
        const fingerprint = summaryFingerprint(candidate.text);
        if (!fingerprint) continue;
        const duplicate = picked.some((entry) => {
          const other = summaryFingerprint(entry.text);
          return fingerprint === other || (fingerprint.length > 18 && (fingerprint.indexOf(other) >= 0 || other.indexOf(fingerprint) >= 0));
        });
        if (!duplicate) picked.push(candidate);
      }
      return picked;
    }

    function buildIdentitySummary(data, t) {
      const lines = (data.lines || []).filter((line) => line && line.text);
      const speakers = data.speakers || [];
      const bySpeaker = new Map();
      const allCandidates = [];
      let totalDurationMs = 0;

      lines.forEach((line, lineIndex) => {
        const speaker = Number.isFinite(line.speaker) ? Math.max(0, Math.floor(line.speaker)) : 0;
        const durationMs = Number(line.durationMs) || Math.max(0, (Number(line.endMs) || 0) - (Number(line.startMs) || 0));
        totalDurationMs += durationMs;
        let entry = bySpeaker.get(speaker);
        if (!entry) {
          entry = { index: speaker, lineCount: 0, durationMs: 0, candidates: [] };
          bySpeaker.set(speaker, entry);
        }
        entry.lineCount += 1;
        entry.durationMs += durationMs;
        for (const sentence of splitSummarySentences(line.text)) {
          if (sentence.length < 6) continue;
          const candidate = {
            speaker,
            text: sentence.length > 150 ? sentence.slice(0, 147).trimEnd() + '…' : sentence,
            startMs: Number(line.startMs) || 0,
            lineIndex,
            score: summaryCandidateScore(sentence, lineIndex, lines.length),
            signal: summarySignal(sentence),
          };
          entry.candidates.push(candidate);
          allCandidates.push(candidate);
        }
      });

      const speakerSections = [...bySpeaker.values()]
        .sort((a, b) => a.index - b.index)
        .map((entry) => ({
          index: entry.index,
          name: speakerDisplayName(speakers, entry.index, t),
          lineCount: entry.lineCount,
          durationMs: entry.durationMs,
          share: totalDurationMs > 0 ? Math.round((entry.durationMs / totalDurationMs) * 100) : Math.round((entry.lineCount / Math.max(1, lines.length)) * 100),
          highlights: pickSummaryCandidates(entry.candidates, 3).sort((a, b) => a.lineIndex - b.lineIndex),
        }));

      const overviewSeed = [];
      for (const section of speakerSections) {
        if (section.highlights[0]) overviewSeed.push(section.highlights[0]);
      }
      const keyMoments = pickSummaryCandidates(overviewSeed.concat(allCandidates), 6).sort((a, b) => a.lineIndex - b.lineIndex);
      const signals = pickSummaryCandidates(allCandidates.filter((candidate) => candidate.signal), 5).sort(
        (a, b) => a.lineIndex - b.lineIndex,
      );
      return { speakerSections, keyMoments, signals, totalDurationMs };
    }

    function buildMarkdown(data, t, active) {
      const lines = (data.lines || []).filter((line) => line.text);
      const speakers = data.speakers || [];
      const indexes = usedSpeakerIndexes(lines);
      const speakerCount = Math.max(1, indexes.seen.size);
      const stamp = formatSessionStamp(data.createdAt || Date.now(), active);
      const title = data.title || t('untitled', { time: stamp });
      const zh = isChineseLocale(active);
      const separator = zh ? '：' : ': ';
      const header = '> ' + t('elapsed') + ' ' + formatDuration(data.durationMs || 0) + ' · ' + t('speakerCount', { n: String(speakerCount) });
      const body = lines.map((line) => {
        const name = speakerDisplayName(speakers, line.speaker, t);
        return '- ' + formatClock(line.startMs) + ' **' + name + '**' + separator + line.text;
      });
      const summary = buildIdentitySummary(data, t);
      const summaryBlocks = ['## ' + t('summary'), '', '> ' + t('summaryHint'), ''];
      if (summary.keyMoments.length) {
        summaryBlocks.push('### ' + t('summaryOverview'), '');
        for (const item of summary.keyMoments) {
          summaryBlocks.push('- ' + formatClock(item.startMs) + ' **' + speakerDisplayName(speakers, item.speaker, t) + '**' + separator + item.text);
        }
        summaryBlocks.push('');
      }
      if (summary.speakerSections.length) {
        summaryBlocks.push('### ' + t('summaryBySpeaker'), '');
        for (const section of summary.speakerSections) {
          summaryBlocks.push('#### ' + section.name);
          summaryBlocks.push(
            t('speakerStats', { n: String(section.lineCount), time: formatDuration(section.durationMs) }) +
              ' · ' +
              t('speakingShare', { n: String(section.share) }),
          );
          for (const item of section.highlights) summaryBlocks.push('- ' + item.text);
          summaryBlocks.push('');
        }
      }
      if (summary.signals.length) {
        summaryBlocks.push('### ' + t('summarySignals'), '');
        for (const item of summary.signals) {
          summaryBlocks.push('- **' + speakerDisplayName(speakers, item.speaker, t) + '**' + separator + item.text);
        }
        summaryBlocks.push('');
      }
      return ['# ' + title, '', header, '', ...summaryBlocks, '## ' + t('transcript'), '', ...body, ''].join('\n');
    }

    function audioExtension(mime) {
      const value = typeof mime === 'string' ? mime : '';
      if (value.indexOf('mp4') >= 0) return 'm4a';
      if (value.indexOf('ogg') >= 0) return 'ogg';
      return 'webm';
    }

    /* ------------------------------------------------------------------ *
     * Icons (original artwork, currentColor so the host theme drives them)
     * ------------------------------------------------------------------ */

    function iconFrame(size, children, extra) {
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
          extra || {},
        ),
        children,
      );
    }

    function microphoneGlyph(size, weight) {
      return iconFrame(
        size,
        [
          h('rect', { key: 'capsule', x: 9, y: 2.5, width: 6, height: 11, rx: 3 }),
          h('path', { key: 'arc', d: 'M5.5 11.5v.6a6.5 6.5 0 0 0 13 0v-.6' }),
          h('path', { key: 'stem', d: 'M12 18.6v3' }),
        ],
        weight ? { strokeWidth: weight } : undefined,
      );
    }

    function stopGlyph(size) {
      return iconFrame(size, h('rect', { key: 'stop', x: 7, y: 7, width: 10, height: 10, rx: 2, fill: 'currentColor', stroke: 'none' }));
    }

    function copyGlyph(size) {
      return iconFrame(size, [
        h('rect', { key: 'a', x: 9, y: 9, width: 11, height: 11, rx: 2.5 }),
        h('path', { key: 'b', d: 'M15 5.5V5a2 2 0 0 0-2-2H5.5A2 2 0 0 0 3.5 5v7.5a2 2 0 0 0 2 2H6' }),
      ]);
    }

    function downloadGlyph(size) {
      return iconFrame(size, [
        h('path', { key: 'a', d: 'M12 3.5v11' }),
        h('path', { key: 'b', d: 'm7.5 10.5 4.5 4.5 4.5-4.5' }),
        h('path', { key: 'c', d: 'M4.5 19.5h15' }),
      ]);
    }

    function trashGlyph(size) {
      return iconFrame(size, [
        h('path', { key: 'a', d: 'M4.5 6.5h15' }),
        h('path', { key: 'b', d: 'M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5' }),
        h('path', { key: 'c', d: 'M6.5 6.5l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12' }),
        h('path', { key: 'd', d: 'M10.2 10.5v6M13.8 10.5v6' }),
      ]);
    }

    function checkGlyph(size) {
      return iconFrame(size, h('path', { key: 'check', d: 'm5 12.5 4.2 4.2L19 6.8' }));
    }

    function chevronGlyph(size) {
      return iconFrame(size, h('path', { key: 'chevron', d: 'm6 9 6 6 6-6' }));
    }

    function waveBarsGlyph(size) {
      return iconFrame(size, [
        h('path', { key: 'a', d: 'M3 12h2' }),
        h('path', { key: 'b', d: 'M7 8.5v7' }),
        h('path', { key: 'c', d: 'M11 5.5v13' }),
        h('path', { key: 'd', d: 'M15 8.5v7' }),
        h('path', { key: 'e', d: 'M19 10.5v3' }),
      ]);
    }

    function speakerGlyph(size) {
      return iconFrame(size, [
        h('circle', { key: 'head', cx: 9, cy: 8, r: 3 }),
        h('path', { key: 'body', d: 'M3.5 19a5.5 5.5 0 0 1 11 0' }),
        h('path', { key: 'second', d: 'M15.5 6.2a2.6 2.6 0 0 1 0 5' }),
        h('path', { key: 'secondbody', d: 'M17 13.5a4.6 4.6 0 0 1 3.5 4.5' }),
      ]);
    }

    function alertGlyph(size) {
      return iconFrame(size, [
        h('circle', { key: 'circle', cx: 12, cy: 12, r: 9 }),
        h('path', { key: 'line', d: 'M12 7.5v5.5' }),
        h('path', { key: 'dot', d: 'M12 16.5h.01' }),
      ]);
    }

    function glossaryGlyph(size) {
      return iconFrame(size, [
        h('path', { key: 'a', d: 'M3.5 19 8 5.5l4.5 13.5' }),
        h('path', { key: 'cross', d: 'M5.2 14.5h5.6' }),
        h('path', { key: 'c', d: 'M15.5 19v-5.2a2.3 2.3 0 0 1 4.6 0V19' }),
        h('path', { key: 'd', d: 'M20.1 16.4h-2.2a2.1 2.1 0 0 1 0-4.2h2.2' }),
      ]);
    }

    function FacechatIcon(props) {
      const size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 20;
      const active = !!(props && props.active);
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
          },
        },
        h(
          'svg',
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
          [
            h('rect', { key: 'capsule', x: 9.2, y: 2.2, width: 5.6, height: 10.4, rx: 2.8 }),
            h('path', { key: 'arc', d: 'M6.2 10.8v.6a5.8 5.8 0 0 0 11.6 0v-.6' }),
            h('path', { key: 'stem', d: 'M12 17.2v3' }),
            h('circle', { key: 'p1', cx: 19.6, cy: 5.2, r: 1.5, fill: 'currentColor', stroke: 'none' }),
            h('circle', { key: 'p2', cx: 21.2, cy: 9.4, r: 1.1, fill: 'currentColor', stroke: 'none' }),
          ],
        ),
      );
    }

    /* ------------------------------------------------------------------ *
     * Styles: theme tokens only, so light/dark switching is inherited.
     * Rendered by the page, so unmounting removes the stylesheet.
     * ------------------------------------------------------------------ */

    const SPEAKER_TOKEN_CLASSES = [
      '.dsh-facechat-spk-0{--fc-spk:var(--dsw-alias-brand-primary)}',
      '.dsh-facechat-spk-1{--fc-spk:var(--dsw-alias-state-success-primary)}',
      '.dsh-facechat-spk-2{--fc-spk:var(--dsw-alias-state-warn-primary)}',
      '.dsh-facechat-spk-3{--fc-spk:var(--dsw-alias-state-error-primary)}',
      '.dsh-facechat-spk-4{--fc-spk:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-spk-5{--fc-spk:var(--dsw-alias-state-idle-primary)}',
    ];

    const CSS = [
      '.dsh-facechat-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5}',
      '.dsh-facechat-header{display:flex;align-items:center;gap:12px;flex:0 0 auto;padding:12px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}',
      '.dsh-facechat-heading{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dsh-facechat-heading-mark{display:inline-flex;color:var(--dsw-alias-brand-primary);flex:none}',
      '.dsh-facechat-title{margin:0;font-size:15px;font-weight:600;line-height:22px;white-space:nowrap}',
      '.dsh-facechat-status{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none}',
      '.dsh-facechat-status-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}',
      ".dsh-facechat-status[data-tone='live']{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-error-primary)}",
      ".dsh-facechat-status[data-tone='live'] .dsh-facechat-status-dot{background:var(--dsw-alias-state-error-primary)}",
      ".dsh-facechat-status[data-tone='ready'] .dsh-facechat-status-dot{background:var(--dsw-alias-state-success-primary)}",
      ".dsh-facechat-status[data-tone='warn'] .dsh-facechat-status-dot{background:var(--dsw-alias-state-warn-primary)}",
      '.dsh-facechat-timer{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-facechat-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;min-width:0}',
      '.dsh-facechat-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease}',
      '.dsh-facechat-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-facechat-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-facechat-btn:disabled{opacity:.5;cursor:default}',
      '.dsh-facechat-btn--primary{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}',
      '.dsh-facechat-btn--primary:hover:not(:disabled){background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);opacity:.9}',
      '.dsh-facechat-btn--stop{background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}',
      '.dsh-facechat-btn--stop:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);opacity:.9}',
      '.dsh-facechat-btn--ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.dsh-facechat-btn--danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      ".dsh-facechat-btn--danger[data-confirm='true']{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
      '.dsh-facechat-select{height:28px;max-width:150px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}',
      '.dsh-facechat-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-facechat-body{display:flex;flex:1 1 auto;min-height:0}',
      '.dsh-facechat-sidebar{display:flex;flex-direction:column;flex:0 0 268px;width:268px;min-height:0;border-right:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-facechat-side-section{display:flex;flex-direction:column;min-height:0}',
      '.dsh-facechat-side-section--history{flex:1 1 auto}',
      '.dsh-facechat-side-section--speakers{flex:0 1 auto;max-height:46%;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-facechat-side-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px 6px;flex:0 0 auto}',
      '.dsh-facechat-side-title{margin:0;font-size:11.5px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}',
      '.dsh-facechat-side-count{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-history{flex:1 1 auto;overflow-y:auto;padding:2px 8px 10px;min-height:0}',
      '.dsh-facechat-history-empty{padding:14px 8px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-history-row{display:flex;flex-direction:column;gap:3px;width:100%;margin:0 0 2px;padding:9px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color .12s ease,border-color .12s ease}',
      '.dsh-facechat-history-row:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-history-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      ".dsh-facechat-history-row[data-active='true']{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}",
      '.dsh-facechat-history-title{display:block;font-size:13px;font-weight:500;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-facechat-history-meta{display:block;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-draft{margin:8px 8px 2px;padding:10px;border:1px solid var(--dsw-alias-state-warn-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-draft-title{display:block;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsh-facechat-draft-hint{display:block;margin-top:2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-draft-actions{display:flex;gap:6px;margin-top:8px}',
      '.dsh-facechat-draft-actions .dsh-facechat-btn{height:26px;padding:0 9px;font-size:12px}',
      '.dsh-facechat-speakers{flex:1 1 auto;overflow-y:auto;padding:0 10px 10px;min-height:0}',
      '.dsh-facechat-speaker{display:flex;align-items:center;gap:8px;padding:3px 0}',
      '.dsh-facechat-speaker-dot{width:10px;height:10px;border-radius:50%;background:var(--fc-spk);flex:none}',
      '.dsh-facechat-speaker-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}',
      '.dsh-facechat-speaker-name-button{width:100%;min-width:0;padding:3px 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:text;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-facechat-speaker-name-button:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-speaker-name-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-facechat-speaker-input{width:100%;min-width:0;padding:3px 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}',
      '.dsh-facechat-speaker-input:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-speaker-input:focus{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-speaker-input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-speaker-meta{font-size:10.5px;line-height:14px;color:var(--dsw-alias-label-secondary);padding-left:6px}',
      '.dsh-facechat-speaker-hint{padding:2px 4px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-speaker-merge{flex:none;max-width:82px;height:22px;padding:0 2px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;opacity:.55;cursor:pointer}',
      '.dsh-facechat-speaker-merge:hover,.dsh-facechat-speaker-merge:focus-visible{opacity:1;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dsh-facechat-main{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0}',
      '.dsh-facechat-banners{flex:0 0 auto;display:flex;flex-direction:column;gap:8px;padding:10px 20px 0}',
      '.dsh-facechat-banner{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:1.55}',
      ".dsh-facechat-banner[data-tone='error']{border-color:var(--dsw-alias-state-error-primary)}",
      ".dsh-facechat-banner[data-tone='warn']{border-color:var(--dsw-alias-state-warn-primary)}",
      ".dsh-facechat-banner[data-tone='info']{border-color:var(--dsw-alias-border-l2)}",
      '.dsh-facechat-banner-icon{flex:none;margin-top:1px;color:var(--dsw-alias-label-secondary);display:inline-flex}',
      ".dsh-facechat-banner[data-tone='error'] .dsh-facechat-banner-icon{color:var(--dsw-alias-state-error-primary)}",
      ".dsh-facechat-banner[data-tone='warn'] .dsh-facechat-banner-icon{color:var(--dsw-alias-state-warn-primary)}",
      ".dsh-facechat-banner[data-tone='info'] .dsh-facechat-banner-icon{color:var(--dsw-alias-brand-primary)}",
      '.dsh-facechat-banner-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}',
      '.dsh-facechat-banner-title{font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsh-facechat-banner-text{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.dsh-facechat-banner-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px}',
      '.dsh-facechat-banner-actions .dsh-facechat-btn{height:26px;padding:0 10px;font-size:12px}',
      '.dsh-facechat-progress{width:100%;max-width:320px;height:6px;accent-color:var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))}',
      '.dsh-facechat-banner-select{height:26px;max-width:260px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px}',
      '.dsh-facechat-banner-note{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-transcript{display:flex;flex-direction:column;flex:1 1 auto;overflow-y:auto;min-height:0;padding:14px 24px 28px}',
      '.dsh-facechat-lines{display:flex;flex-direction:column;flex:0 0 auto}',
      '.dsh-facechat-transcript-head{display:flex;align-items:center;gap:8px;padding-bottom:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px}',
      '.dsh-facechat-review-head{display:flex;flex-direction:column;gap:4px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-facechat-review-title{width:100%;padding:2px 0;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:19px;font-weight:600;line-height:1.4;outline:none}',
      '.dsh-facechat-review-title::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dsh-facechat-review-meta{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-view-tabs{display:flex;align-items:center;gap:4px;width:max-content;margin:0 0 14px;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-view-tab{height:28px;padding:0 13px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;cursor:pointer}',
      '.dsh-facechat-view-tab:hover{color:var(--dsw-alias-label-primary)}',
      ".dsh-facechat-view-tab[data-active='true']{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent)}",
      '.dsh-facechat-view-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-facechat-summary{display:flex;flex-direction:column;gap:18px;padding-bottom:18px}',
      '.dsh-facechat-summary-hint{margin:-4px 0 0;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.6}',
      '.dsh-facechat-summary-section{display:flex;flex-direction:column;gap:9px}',
      '.dsh-facechat-summary-section-title{margin:0;font-size:13px;font-weight:600;line-height:20px}',
      '.dsh-facechat-summary-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-summary-row{display:grid;grid-template-columns:40px minmax(82px,auto) minmax(0,1fr);align-items:start;gap:10px;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-facechat-summary-row:first-child{border-top:0}',
      '.dsh-facechat-summary-time{padding-top:2px;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-variant-numeric:tabular-nums;text-align:right}',
      '.dsh-facechat-summary-speaker{display:inline-flex;align-items:center;gap:6px;min-width:0;padding-top:1px;color:var(--fc-spk);font-size:11.5px;font-weight:600}',
      '.dsh-facechat-summary-speaker .dsh-facechat-chip-dot{flex:none}',
      '.dsh-facechat-summary-text{margin:0;font-size:13px;line-height:1.65;word-break:break-word}',
      '.dsh-facechat-summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}',
      '.dsh-facechat-summary-card{display:flex;flex-direction:column;gap:8px;padding:12px 13px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.dsh-facechat-summary-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.dsh-facechat-summary-card-meta{color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:16px;text-align:right}',
      '.dsh-facechat-summary-points{display:flex;flex-direction:column;gap:7px;margin:0;padding:0;list-style:none}',
      '.dsh-facechat-summary-point{position:relative;padding-left:12px;font-size:12.5px;line-height:1.6;word-break:break-word}',
      '.dsh-facechat-summary-point::before{content:"";position:absolute;left:1px;top:.72em;width:4px;height:4px;border-radius:50%;background:var(--fc-spk)}',
      '.dsh-facechat-summary-note{margin:-3px 0 0;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.55}',
      '.dsh-facechat-line{display:flex;align-items:flex-start;gap:10px;padding:7px 0}',
      '.dsh-facechat-line-time{flex:0 0 40px;padding-top:4px;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}',
      '.dsh-facechat-line-body{flex:1 1 auto;min-width:0;position:relative}',
      '.dsh-facechat-line-head{display:flex;align-items:center;gap:6px;margin-bottom:2px;min-width:0}',
      '.dsh-facechat-chip{display:inline-flex;align-items:center;gap:6px;max-width:220px;height:22px;padding:0 8px;border:1px solid color-mix(in srgb, var(--fc-spk) 34%, transparent);border-radius:999px;background:color-mix(in srgb, var(--fc-spk) 13%, transparent);color:var(--fc-spk);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-facechat-chip:hover{background:color-mix(in srgb, var(--fc-spk) 20%, transparent)}',
      '.dsh-facechat-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-facechat-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--fc-spk);flex:none}',
      '.dsh-facechat-chip-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-facechat-line-text{margin:0;font-size:14px;line-height:1.68;white-space:pre-wrap;word-break:break-word}',
      '.dsh-facechat-line[data-state="pending"] .dsh-facechat-line-text,.dsh-facechat-line[data-state="interim"] .dsh-facechat-line-text{color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-line[data-state="error"] .dsh-facechat-line-text{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-facechat-interim{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-interim-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);animation:dsh-facechat-pulse 1.1s ease-in-out infinite;flex:none}',
      '@keyframes dsh-facechat-pulse{0%,100%{opacity:.35}50%{opacity:1}}',
      '.dsh-facechat-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:36px 28px;text-align:center}',
      '.dsh-facechat-empty-art{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:20px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);margin-bottom:2px}',
      '.dsh-facechat-empty-title{margin:0;font-size:17px;font-weight:600;line-height:24px}',
      '.dsh-facechat-empty-hint{margin:0;max-width:460px;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-empty-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px}',
      '.dsh-facechat-empty-tip{max-width:460px;font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-secondary);opacity:.9}',
      '.dsh-facechat-waiting{display:flex;align-items:center;justify-content:center;gap:8px;padding:28px 0;color:var(--dsw-alias-label-secondary);font-size:12.5px}',
      '.dsh-facechat-footer{display:flex;align-items:center;gap:10px;flex:0 0 auto;padding:9px 20px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}',
      '.dsh-facechat-footer-status{display:inline-flex;align-items:center;gap:6px;min-width:0}',
      '.dsh-facechat-footer-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap}',
      '.dsh-facechat-footer-actions .dsh-facechat-btn{height:26px;padding:0 9px;font-size:11.5px}',
      '.dsh-facechat-footer-note{font-size:10.5px;opacity:.85}',
      '.dsh-facechat-meter{display:inline-flex;align-items:flex-end;gap:2px;height:16px;width:52px;flex:none}',
      '.dsh-facechat-meter span{display:block;flex:1 1 auto;min-width:2px;border-radius:1px;background:var(--dsw-alias-state-success-primary);opacity:.25;transition:opacity .1s linear}',
      '.dsh-facechat-meter span[data-active="true"]{opacity:.95}',
      '.dsh-facechat-menu{position:absolute;top:28px;left:0;z-index:40;min-width:190px;max-width:250px;padding:5px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent)}',
      '.dsh-facechat-menu-title{padding:4px 8px 6px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}',
      '.dsh-facechat-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-facechat-menu-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-facechat-menu-dot{width:8px;height:8px;border-radius:50%;background:var(--fc-spk);flex:none}',
      '.dsh-facechat-menu-add{color:var(--dsw-alias-brand-primary)}',
      '.dsh-facechat-action-error{padding:0 20px 8px;font-size:12px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}',
      '.dsh-facechat-modal{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-overlay)}',
      '.dsh-facechat-modal-card{display:flex;flex-direction:column;gap:10px;width:min(560px,94vw);max-height:84vh;padding:16px 18px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 14px 40px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);overflow:hidden}',
      '.dsh-facechat-modal-head{display:flex;align-items:center;gap:10px;flex:none}',
      '.dsh-facechat-modal-title{margin:0;font-size:15px;font-weight:600;line-height:22px}',
      '.dsh-facechat-modal-close{margin-left:auto;width:28px;padding:0;font-size:18px;line-height:1}',
      '.dsh-facechat-modal-hint{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-glossary-toggle{display:flex;align-items:center;gap:7px;flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-glossary-toggle input{accent-color:var(--dsw-alias-brand-primary)}',
      '.dsh-facechat-glossary-text{width:100%;flex:1 1 auto;min-height:150px;max-height:260px;resize:vertical;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.6;outline:none;white-space:pre-wrap}',
      '.dsh-facechat-glossary-text:focus{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-facechat-glossary-text::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.dsh-facechat-glossary-defaults-wrap{flex:none;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-glossary-defaults-wrap summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}',
      '.dsh-facechat-glossary-defaults{max-height:150px;overflow-y:auto;margin-top:6px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-2);line-height:1.65}',
      '.dsh-facechat-glossary-defaults b{font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dsh-facechat-modal-actions{display:flex;justify-content:flex-end;gap:8px;flex:none;flex-wrap:wrap}',
      '.dsh-facechat-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
      ...SPEAKER_TOKEN_CLASSES,
      '@media (max-width:980px){.dsh-facechat-sidebar{flex-basis:220px;width:220px}.dsh-facechat-transcript{padding:12px 16px 24px}.dsh-facechat-header{padding:10px 14px}.dsh-facechat-footer{padding:8px 14px}}',
      '@media (max-width:720px){.dsh-facechat-sidebar{display:none}.dsh-facechat-transcript{padding:10px 12px 20px}.dsh-facechat-header{padding:9px 12px}.dsh-facechat-title{font-size:14px}.dsh-facechat-summary-row{grid-template-columns:38px minmax(72px,auto) minmax(0,1fr);gap:7px;padding:9px}.dsh-facechat-summary-grid{grid-template-columns:1fr}}',
    ].join('\n');

    /* ------------------------------------------------------------------ *
     * Small views
     * ------------------------------------------------------------------ */

    function LevelMeter(props) {
      const level = props.level || 0;
      const decibels = 20 * Math.log10(Math.max(level, 1e-5));
      const active = Math.ceil(clamp((decibels + 60) / 60, 0, 1) * 8);
      return h(
        'span',
        { className: 'dsh-facechat-meter', role: 'img', 'aria-label': props.label },
        Array.from({ length: 8 }, (_, index) =>
          h('span', { key: index, 'data-active': index < active ? 'true' : 'false' }),
        ),
      );
    }

    function SpeakerChip(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-facechat-chip dsh-facechat-spk-' + (props.index % 6),
          title: props.title,
          'aria-label': props.title,
          onClick: props.onClick,
        },
        h('span', { className: 'dsh-facechat-chip-dot' }),
        h('span', { className: 'dsh-facechat-chip-label' }, props.name),
      );
    }

    function SpeakerMenu(props) {
      const menuRef = React.useRef(null);
      React.useEffect(() => {
        const onPointer = (event) => {
          if (menuRef.current && !menuRef.current.contains(event.target)) props.onClose();
        };
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            props.onClose();
          }
        };
        document.addEventListener('mousedown', onPointer, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('mousedown', onPointer, true);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [props.onClose]);
      return h(
        'div',
        { className: 'dsh-facechat-menu', ref: menuRef, role: 'menu', 'aria-label': props.t('speakerMenuTitle') },
        h('div', { className: 'dsh-facechat-menu-title' }, props.t('speakerMenuTitle')),
        props.speakers.map((speaker, index) =>
          h(
            'button',
            {
              key: index,
              type: 'button',
              className: 'dsh-facechat-menu-item',
              role: 'menuitemradio',
              'aria-checked': index === props.current ? 'true' : 'false',
              onClick: () => props.onPick(index),
            },
            h('span', { className: 'dsh-facechat-menu-dot dsh-facechat-spk-' + (index % 6) }),
            h('span', null, props.nameFor(index)),
            index === props.current ? h('span', { style: { marginLeft: 'auto', opacity: 0.7 } }, checkGlyph(13)) : null,
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-facechat-menu-item dsh-facechat-menu-add',
            role: 'menuitem',
            onClick: props.onAdd,
          },
          speakerGlyph(14),
          h('span', null, props.t('addSpeaker')),
        ),
      );
    }

    function TranscriptLine(props) {
      const line = props.line;
      const state = line.status === 'pending' ? 'pending' : line.status === 'error' ? 'error' : 'final';
      const text =
        state === 'pending' ? props.t('interimPending') : state === 'error' ? props.t('lineFailed') : line.text;
      return h(
        'div',
        { className: 'dsh-facechat-line', 'data-state': state, 'data-line-id': line.id },
        h('span', { className: 'dsh-facechat-line-time' }, formatClock(line.startMs)),
        h(
          'div',
          { className: 'dsh-facechat-line-body' },
          h(
            'div',
            { className: 'dsh-facechat-line-head' },
            h(SpeakerChip, {
              index: line.speaker,
              name: props.nameFor(line.speaker),
              title: props.t('changeSpeaker'),
              onClick: () => props.onOpenMenu(line.id),
            }),
          ),
          h('p', { className: 'dsh-facechat-line-text' }, text),
          props.menuOpen
            ? h(SpeakerMenu, {
                t: props.t,
                speakers: props.speakers,
                current: line.speaker,
                nameFor: props.nameFor,
                onPick: (index) => props.onPick(line.id, index),
                onAdd: () => props.onAdd(line.id),
                onClose: props.onCloseMenu,
              })
            : null,
        ),
      );
    }

    function SpeakerNameEditor(props) {
      const [editing, setEditing] = React.useState(false);
      const [value, setValue] = React.useState(props.name || '');
      const inputRef = React.useRef(null);
      const skipBlurCommit = React.useRef(false);
      React.useEffect(() => {
        if (!editing) setValue(props.name || '');
      }, [props.name, editing]);
      React.useEffect(() => {
        if (!editing || !inputRef.current) return;
        const input = inputRef.current;
        input.focus();
        input.select();
      }, [editing]);

      const beginEditing = () => {
        skipBlurCommit.current = false;
        setValue(props.name || props.placeholder);
        setEditing(true);
      };

      const commit = (next) => {
        const trimmed = typeof next === 'string' ? next.trim() : '';
        const normalized = !props.name && trimmed === props.placeholder ? '' : trimmed;
        props.onRename(props.index, normalized);
        setEditing(false);
      };

      if (!editing) {
        return h(
          'button',
          {
            type: 'button',
            className: 'dsh-facechat-speaker-name-button',
            title: props.t('renameSpeaker'),
            'aria-label': props.t('renameSpeaker') + ': ' + (props.name || props.placeholder),
            onClick: beginEditing,
          },
          props.name || props.placeholder,
        );
      }

      return h('input', {
        ref: inputRef,
        className: 'dsh-facechat-speaker-input',
        type: 'text',
        value: value,
        placeholder: props.placeholder,
        'aria-label': props.placeholder,
        onChange: (event) => setValue(event.target.value),
        onInput: (event) => setValue(event.currentTarget.value),
        onBlur: () => {
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          commit(value);
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape' || event.key === 'Esc') {
            event.preventDefault();
            skipBlurCommit.current = true;
            setValue(props.name || '');
            setEditing(false);
          }
        },
      });
    }

    function SpeakerList(props) {
      const speakers = props.speakers;
      const stats = props.stats;
      const count = Math.max(
        speakers.length,
        ...(props.lines.length ? props.lines.map((line) => (Number.isFinite(line.speaker) ? line.speaker + 1 : 1)) : [0]),
      );
      if (!props.lines.length) {
        return h('div', { className: 'dsh-facechat-speaker-hint' }, props.t('noSpeakerYet'));
      }
      return h(
        'div',
        { className: 'dsh-facechat-speakers' },
        h('div', { className: 'dsh-facechat-speaker-hint' }, props.t('speakerHint')),
        Array.from({ length: count }, (_, index) => {
          const entry = speakers[index] || { name: '' };
          const item = stats[index] || { count: 0, durationMs: 0 };
          return h(
            'div',
            { className: 'dsh-facechat-speaker', key: index },
            h('span', { className: 'dsh-facechat-speaker-dot dsh-facechat-spk-' + (index % 6) }),
            h(
              'div',
              { className: 'dsh-facechat-speaker-body' },
              h(SpeakerNameEditor, {
                index,
                name: entry.name || '',
                placeholder: props.t('speakerLabel', { n: String(index + 1) }),
                t: props.t,
                onRename: props.onRename,
              }),
              h(
                'span',
                { className: 'dsh-facechat-speaker-meta' },
                props.t('speakerStats', { n: String(item.count), time: formatDuration(item.durationMs) }),
              ),
            ),
            h(
              'select',
              {
                className: 'dsh-facechat-speaker-merge',
                value: '',
                title: props.t('mergeSpeaker'),
                'aria-label':
                  props.t('mergeSpeaker') + ': ' + (entry.name || props.t('speakerLabel', { n: String(index + 1) })),
                onChange: (event) => {
                  const target = Number(event.target.value);
                  if (
                    Number.isInteger(target) &&
                    target >= 0 &&
                    target !== index &&
                    typeof props.onMerge === 'function'
                  ) {
                    props.onMerge(index, target);
                  }
                },
              },
              h('option', { value: '', key: 'placeholder' }, props.t('mergeInto')),
              Array.from({ length: count }, (_, other) =>
                other === index
                  ? null
                  : h(
                      'option',
                      { key: String(other), value: String(other) },
                      props.t('speakerLabel', { n: String(other + 1) }),
                    ),
              ),
            ),
          );
        }),
        h('div', { className: 'dsh-facechat-speaker-hint' }, props.t('speakerCorrectHint')),
      );
    }

    function SummarySpeakerLabel(props) {
      return h(
        'span',
        { className: 'dsh-facechat-summary-speaker dsh-facechat-spk-' + (props.index % 6) },
        h('span', { className: 'dsh-facechat-chip-dot' }),
        h('span', { className: 'dsh-facechat-chip-label' }, props.name),
      );
    }

    function SummaryView(props) {
      const summary = buildIdentitySummary(props.data, props.t);
      if (!summary.keyMoments.length && !summary.speakerSections.length) {
        return h('div', { className: 'dsh-facechat-waiting' }, props.t('summaryEmpty'));
      }
      return h(
        'div',
        { className: 'dsh-facechat-summary' },
        h('p', { className: 'dsh-facechat-summary-hint' }, props.t('summaryHint')),
        summary.keyMoments.length
          ? h(
              'section',
              { className: 'dsh-facechat-summary-section' },
              h('h2', { className: 'dsh-facechat-summary-section-title' }, props.t('summaryOverview')),
              h(
                'div',
                { className: 'dsh-facechat-summary-list' },
                summary.keyMoments.map((item, index) =>
                  h(
                    'div',
                    { className: 'dsh-facechat-summary-row', key: item.lineIndex + '-' + index },
                    h('span', { className: 'dsh-facechat-summary-time' }, formatClock(item.startMs)),
                    h(SummarySpeakerLabel, {
                      index: item.speaker,
                      name: speakerDisplayName(props.data.speakers || [], item.speaker, props.t),
                    }),
                    h('p', { className: 'dsh-facechat-summary-text' }, item.text),
                  ),
                ),
              ),
            )
          : null,
        summary.speakerSections.length
          ? h(
              'section',
              { className: 'dsh-facechat-summary-section' },
              h('h2', { className: 'dsh-facechat-summary-section-title' }, props.t('summaryBySpeaker')),
              h(
                'div',
                { className: 'dsh-facechat-summary-grid' },
                summary.speakerSections.map((section) =>
                  h(
                    'article',
                    { className: 'dsh-facechat-summary-card dsh-facechat-spk-' + (section.index % 6), key: section.index },
                    h(
                      'div',
                      { className: 'dsh-facechat-summary-card-head' },
                      h(SummarySpeakerLabel, { index: section.index, name: section.name }),
                      h(
                        'span',
                        { className: 'dsh-facechat-summary-card-meta' },
                        props.t('speakerStats', { n: String(section.lineCount), time: formatDuration(section.durationMs) }),
                        h('br'),
                        props.t('speakingShare', { n: String(section.share) }),
                      ),
                    ),
                    section.highlights.length
                      ? h(
                          'ul',
                          { className: 'dsh-facechat-summary-points' },
                          section.highlights.map((item, index) =>
                            h('li', { className: 'dsh-facechat-summary-point', key: item.lineIndex + '-' + index }, item.text),
                          ),
                        )
                      : h('p', { className: 'dsh-facechat-summary-note' }, props.t('summaryNoHighlight')),
                  ),
                ),
              ),
            )
          : null,
        summary.signals.length
          ? h(
              'section',
              { className: 'dsh-facechat-summary-section' },
              h('h2', { className: 'dsh-facechat-summary-section-title' }, props.t('summarySignals')),
              h('p', { className: 'dsh-facechat-summary-note' }, props.t('extractedSignal')),
              h(
                'div',
                { className: 'dsh-facechat-summary-list' },
                summary.signals.map((item, index) =>
                  h(
                    'div',
                    { className: 'dsh-facechat-summary-row', key: item.lineIndex + '-' + index },
                    h('span', { className: 'dsh-facechat-summary-time' }, formatClock(item.startMs)),
                    h(SummarySpeakerLabel, {
                      index: item.speaker,
                      name: speakerDisplayName(props.data.speakers || [], item.speaker, props.t),
                    }),
                    h('p', { className: 'dsh-facechat-summary-text' }, item.text),
                  ),
                ),
              ),
            )
          : null,
      );
    }

    function HistoryRow(props) {
      const session = props.session;
      const count = session.lines.length;
      const title =
        session.title ||
        props.t('untitled', { time: formatSessionStamp(session.createdAt, props.active) });
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-facechat-history-row',
          'data-active': props.active ? 'true' : 'false',
          onClick: () => props.onSelect(session.id),
          'aria-current': props.active ? 'true' : undefined,
        },
        h('span', { className: 'dsh-facechat-history-title' }, title),
        h(
          'span',
          { className: 'dsh-facechat-history-meta' },
          props.t('historyRowMeta', {
            duration: formatDuration(session.durationMs),
            count: String(count),
          }),
        ),
      );
    }

    function RecoveredDraft(props) {
      const draft = props.draft;
      return h(
        'div',
        { className: 'dsh-facechat-draft', role: 'status' },
        h('span', { className: 'dsh-facechat-draft-title' }, props.t('recoveredDraft')),
        h(
          'span',
          { className: 'dsh-facechat-draft-hint' },
          props.t('recoveredDraftHint', { n: String(draft.lines.length) }),
        ),
        h(
          'div',
          { className: 'dsh-facechat-draft-actions' },
          h(
            'button',
            { type: 'button', className: 'dsh-facechat-btn dsh-facechat-btn--primary', onClick: props.onRecover },
            props.t('recover'),
          ),
          h('button', { type: 'button', className: 'dsh-facechat-btn', onClick: props.onDiscard }, props.t('discard')),
        ),
      );
    }

    function GlossaryDialog(props) {
      const initial = props.glossary.getSnapshot();
      const [text, setText] = React.useState(initial.userText);
      const [enabled, setEnabled] = React.useState(initial.enabled);
      const areaRef = React.useRef(null);

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape' || event.key === 'Esc') {
            event.stopPropagation();
            props.onClose();
          }
        };
        document.addEventListener('keydown', onKey, true);
        if (areaRef.current) areaRef.current.focus();
        return () => document.removeEventListener('keydown', onKey, true);
      }, [props]);

      const save = () => {
        props.glossary.setUserText(text);
        props.glossary.setEnabled(enabled);
        props.onSaved();
        props.onClose();
      };
      const reset = () => {
        setText('');
        setEnabled(true);
        props.glossary.setUserText('');
        props.glossary.setEnabled(true);
        props.onSaved();
      };
      return h(
        'div',
        {
          className: 'dsh-facechat-modal',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': props.t('glossaryTitle'),
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) props.onClose();
          },
        },
        h(
          'div',
          { className: 'dsh-facechat-modal-card' },
          h(
            'div',
            { className: 'dsh-facechat-modal-head' },
            h('span', { className: 'dsh-facechat-heading-mark' }, glossaryGlyph(16)),
            h('h2', { className: 'dsh-facechat-modal-title' }, props.t('glossaryTitle')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-facechat-btn dsh-facechat-btn--ghost dsh-facechat-modal-close',
                'aria-label': props.t('close'),
                title: props.t('close'),
                onClick: props.onClose,
              },
              '×',
            ),
          ),
          h('p', { className: 'dsh-facechat-modal-hint' }, props.t('glossaryHint')),
          h(
            'label',
            { className: 'dsh-facechat-glossary-toggle' },
            h('input', {
              type: 'checkbox',
              checked: enabled,
              onChange: (event) => setEnabled(event.target.checked),
            }),
            props.t('glossaryEnabled'),
          ),
          h('textarea', {
            ref: areaRef,
            className: 'dsh-facechat-glossary-text',
            value: text,
            spellCheck: false,
            placeholder: props.t('glossaryPlaceholder'),
            onChange: (event) => setText(event.target.value),
          }),
          h(
            'details',
            { className: 'dsh-facechat-glossary-defaults-wrap' },
            h('summary', null, props.t('glossaryDefaults')),
            h(
              'div',
              { className: 'dsh-facechat-glossary-defaults' },
              initial.defaults.map((entry) =>
                h(
                  'div',
                  { key: entry.term },
                  h('b', null, entry.term),
                  ' ← ',
                  entry.aliases.join(', '),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dsh-facechat-modal-actions' },
            h(
              'button',
              { type: 'button', className: 'dsh-facechat-btn dsh-facechat-btn--ghost', onClick: reset },
              props.t('glossaryReset'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsh-facechat-btn', onClick: props.onClose },
              props.t('close'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsh-facechat-btn dsh-facechat-btn--primary', onClick: save },
              props.t('save'),
            ),
          ),
        ),
      );
    }

    function providerStatus(speechSnap) {
      const catalog = speechSnap && speechSnap.catalog ? speechSnap.catalog : null;
      const provider = catalog
        ? catalog.providers.find((item) => item.id === catalog.selection.providerId) || null
        : null;
      return {
        catalog,
        provider,
        preparation: provider && provider.preparation ? provider.preparation : null,
      };
    }

    function preparationStepLabel(preparation, t) {
      const step = preparation && preparation.step;
      if (!step) return '';
      if (step === 'check') return t('stepCheck');
      if (step === 'model') return t('stepModel');
      if (step === 'vad') return t('stepVad');
      if (step === 'verify') return t('stepVerify');
      if (step === 'load') return t('stepLoad');
      return '';
    }

    function SetupBanner(props) {
      const snap = props.speechSnap;
      const status = providerStatus(snap);
      const provider = status.provider;
      const prep = status.preparation;
      if (!snap.available) {
        return h(
          'div',
          { className: 'dsh-facechat-banner', 'data-tone': 'error' },
          h('span', { className: 'dsh-facechat-banner-icon' }, alertGlyph(16)),
          h(
            'div',
            { className: 'dsh-facechat-banner-body' },
            h('span', { className: 'dsh-facechat-banner-title' }, props.t('speechService')),
            h('span', { className: 'dsh-facechat-banner-text' }, props.t('speechUnavailable')),
          ),
        );
      }
      if (!snap.connected) {
        return h(
          'div',
          { className: 'dsh-facechat-banner', 'data-tone': 'warn' },
          h('span', { className: 'dsh-facechat-banner-icon' }, waveBarsGlyph(16)),
          h(
            'div',
            { className: 'dsh-facechat-banner-body' },
            h(
              'span',
              { className: 'dsh-facechat-banner-text' },
              snap.error ? props.t('speechDisconnected') : props.t('speechConnecting'),
            ),
          ),
        );
      }
      if (!provider || !prep) {
        return h(
          'div',
          { className: 'dsh-facechat-banner', 'data-tone': 'warn' },
          h('span', { className: 'dsh-facechat-banner-icon' }, alertGlyph(16)),
          h(
            'div',
            { className: 'dsh-facechat-banner-body' },
            h('span', { className: 'dsh-facechat-banner-text' }, props.t('errorNotReady')),
          ),
        );
      }
      const phase = prep.phase;
      if (phase === 'ready' || phase === 'standby') return null;
      if (provider.location === 'cloud' && phase !== 'failed' && phase !== 'unprepared') return null;
      const sources = Array.isArray(provider.downloadSources) ? provider.downloadSources : [];
      const canPrepare = phase === 'unprepared' || phase === 'failed' || phase === 'cancelled';
      const preparing = phase === 'downloading' || phase === 'checking' || phase === 'loading' || phase === 'waking' || phase === 'cancelling';
      const estimate = provider.setupEstimate;
      const estimateText =
        estimate && provider.location === 'host-local'
          ? props.t('modelEstimate', {
              gb: (estimate.recommendedDiskBytes / 1e9).toFixed(1),
              mem: (estimate.expectedMemoryBytes / 1e9).toFixed(1),
              min: String(estimate.minimumMinutes),
              max: String(estimate.maximumMinutes),
            })
          : '';
      const metric =
        phase === 'downloading'
          ? prep.totalBytes
            ? props.t('modelDownloading', {
                completed: (prep.completedBytes / 1e6).toFixed(1),
                total: (prep.totalBytes / 1e6).toFixed(1),
                percent: String(Math.floor((prep.completedBytes / prep.totalBytes) * 100)),
              })
            : props.t('modelDownloadingUnknown', { completed: (prep.completedBytes / 1e6).toFixed(1) })
          : preparing
            ? props.t('modelStep', { step: preparationStepLabel(prep, props.t) })
            : '';
      const sourceLabel = (origin) => {
        if (origin === 'https://huggingface.co') return props.t('sourceHuggingFace');
        if (origin === 'https://hf-mirror.com') return props.t('sourceMirror');
        return origin;
      };
      return h(
        'div',
        { className: 'dsh-facechat-banner', 'data-tone': phase === 'failed' ? 'error' : phase === 'unprepared' ? 'warn' : 'info' },
        h('span', { className: 'dsh-facechat-banner-icon' }, alertGlyph(16)),
        h(
          'div',
          { className: 'dsh-facechat-banner-body' },
          h(
            'span',
            { className: 'dsh-facechat-banner-title' },
            phase === 'failed' ? props.t('statusFailed') : props.t('modelNotReady'),
          ),
          phase === 'failed'
            ? h('span', { className: 'dsh-facechat-banner-text' }, props.t('modelFailure', { message: prep.message || '' }))
            : h('span', { className: 'dsh-facechat-banner-text' }, props.t('modelNotReadyHint')),
          estimateText && (phase === 'unprepared' || phase === 'failed') ? h('span', { className: 'dsh-facechat-banner-note' }, estimateText) : null,
          metric ? h('span', { className: 'dsh-facechat-banner-text', role: 'status' }, metric) : null,
          phase === 'downloading' && prep.totalBytes
            ? h('progress', {
                className: 'dsh-facechat-progress',
                value: prep.completedBytes,
                max: prep.totalBytes,
                'aria-label': props.t('modelNotReady'),
              })
            : null,
          canPrepare && sources.length
            ? h(
                'label',
                { className: 'dsh-facechat-banner-note' },
                props.t('downloadSource') + ' ',
                h(
                  'select',
                  {
                    className: 'dsh-facechat-banner-select',
                    value: props.source,
                    disabled: props.busy,
                    onChange: (event) => props.onSource(event.target.value),
                  },
                  h('option', { value: '' }, props.t('sourceAuto')),
                  sources.map((origin) => h('option', { key: origin, value: origin }, sourceLabel(origin))),
                ),
              )
            : null,
          h(
            'div',
            { className: 'dsh-facechat-banner-actions' },
            canPrepare
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-facechat-btn dsh-facechat-btn--primary',
                    disabled: props.busy,
                    onClick: () => props.onPrepare(provider.id),
                  },
                  props.busy ? props.t('preparing') : phase === 'unprepared' ? props.t('prepare') : props.t('retryPrepare'),
                )
              : null,
            preparing && phase !== 'cancelling'
              ? h(
                  'button',
                  { type: 'button', className: 'dsh-facechat-btn', disabled: props.busy, onClick: () => props.onCancel(provider.id) },
                  props.t('cancelPrepare'),
                )
              : null,
            phase === 'ready' || phase === 'standby' ? h('span', { className: 'dsh-facechat-banner-note' }, props.t('modelReady')) : null,
          ),
          props.actionError ? h('span', { className: 'dsh-facechat-banner-text' }, props.actionError) : null,
        ),
      );
    }

    function EmptyHero(props) {
      return h(
        'div',
        { className: 'dsh-facechat-empty' },
        h('div', { className: 'dsh-facechat-empty-art' }, microphoneGlyph(30, 1.4)),
        h('h2', { className: 'dsh-facechat-empty-title' }, props.t('emptyTitle')),
        h('p', { className: 'dsh-facechat-empty-hint' }, props.t('emptyHint')),
        h(
          'div',
          { className: 'dsh-facechat-empty-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-facechat-btn dsh-facechat-btn--primary',
              onClick: props.onStart,
              disabled: !props.canStart,
            },
            microphoneGlyph(15),
            props.t('start'),
          ),
        ),
        h('p', { className: 'dsh-facechat-empty-tip' }, props.t('micTip')),
        h('p', { className: 'dsh-facechat-empty-tip' }, props.t('emptyTip')),
      );
    }

    function languageLabel(language, t) {
      if (language === 'auto') return t('langAuto');
      if (language === 'zh') return t('langZh');
      if (language === 'en') return t('langEn');
      if (language === 'yue') return t('langYue');
      if (language === 'ja') return t('langJa');
      if (language === 'ko') return t('langKo');
      return language;
    }

    function copyTextFallback(text) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }

    function saveUrl(url, filename) {
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return true;
      } catch (err) {
        return false;
      }
    }

    function fileStamp(timestamp) {
      const date = new Date(timestamp || Date.now());
      const pad = (value) => (value < 10 ? '0' + value : String(value));
      return (
        date.getFullYear().toString() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        '-' +
        pad(date.getHours()) +
        pad(date.getMinutes())
      );
    }

    /* ------------------------------------------------------------------ *
     * Main page
     * ------------------------------------------------------------------ */

    function FacechatPanel(props) {
      const t = props.t;
      const localeFace = props.locale;
      const engine = props.engine;
      const speechBridge = props.speech;
      const historyStore = props.history;
      const glossary = props.glossary;

      const [snap, setSnap] = React.useState(() => engine.getSnapshot());
      const [speechSnap, setSpeechSnap] = React.useState(() => speechBridge.getSnapshot());
      const [historySnap, setHistorySnap] = React.useState(() => historyStore.getSnapshot());
      const [, setLocaleRevision] = React.useState(0);
      const [now, setNow] = React.useState(Date.now());
      const [level, setLevel] = React.useState(0);
      const [pendingDelete, setPendingDelete] = React.useState(null);
      const [copied, setCopied] = React.useState(false);
      const [actionError, setActionError] = React.useState('');
      const [source, setSource] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [menu, setMenu] = React.useState(null);
      const [titleDraft, setTitleDraft] = React.useState(snap.title || '');
      const [contentView, setContentView] = React.useState('transcript');
      const [glossaryOpen, setGlossaryOpen] = React.useState(false);
      const [languageTipDismissed, setLanguageTipDismissed] = React.useState(loadLanguageTipDismissed);

      const titleTimer = React.useRef(null);
      const copiedTimer = React.useRef(null);
      const scrollRef = React.useRef(null);
      const stuckRef = React.useRef(true);

      let activeLocale;
      try {
        activeLocale = localeFace && localeFace.getSnapshot ? localeFace.getSnapshot().active : undefined;
      } catch (err) {
        activeLocale = undefined;
      }

      React.useEffect(() => engine.subscribe(() => setSnap(engine.getSnapshot())), [engine]);
      React.useEffect(() => speechBridge.subscribe(() => setSpeechSnap(speechBridge.getSnapshot())), [speechBridge]);
      React.useEffect(() => historyStore.subscribe(() => setHistorySnap(historyStore.getSnapshot())), [historyStore]);
      React.useEffect(() => {
        if (!localeFace || typeof localeFace.subscribe !== 'function') return undefined;
        return localeFace.subscribe(() => setLocaleRevision((value) => value + 1));
      }, [localeFace]);

      React.useEffect(() => {
        if (snap.phase !== 'recording') return undefined;
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
      }, [snap.phase]);

      React.useEffect(() => {
        if (snap.phase !== 'recording') {
          setLevel(0);
          return undefined;
        }
        const timer = setInterval(() => setLevel(engine.getLevel()), 120);
        return () => clearInterval(timer);
      }, [snap.phase, engine]);

      React.useEffect(() => {
        setTitleDraft(snap.title || '');
      }, [snap.title, snap.selectedId, snap.view]);

      React.useEffect(() => {
        setMenu(null);
      }, [snap.selectedId, snap.view]);

      React.useEffect(() => {
        setContentView('transcript');
      }, [snap.selectedId, snap.view]);

      React.useEffect(() => {
        const element = scrollRef.current;
        if (!element || !stuckRef.current || contentView !== 'transcript') return;
        element.scrollTop = element.scrollHeight;
      }, [snap.lines.length, snap.interim && snap.interim.text, snap.interim && snap.interim.pending, snap.phase, snap.view, contentView]);

      React.useEffect(
        () => () => {
          if (titleTimer.current) clearTimeout(titleTimer.current);
          if (copiedTimer.current) clearTimeout(copiedTimer.current);
        },
        [],
      );

      const isReview = snap.view === 'review' && !!snap.review;
      const data = isReview
        ? snap.review
        : {
            title: snap.title,
            lines: snap.lines,
            speakers: snap.speakers,
            durationMs: snap.phase === 'recording' ? Math.max(0, now - snap.startedAt) : snap.durationMs,
            createdAt: snap.startedAt || undefined,
          };
      const lines = data.lines || [];
      const speakers = data.speakers || [];
      const indexes = usedSpeakerIndexes(lines);
      const speakerTotal = Math.max(speakers.length, indexes.max + 1, 1);
      const speakerList = Array.from({ length: speakerTotal }, (_, index) => speakers[index] || { name: '' });
      const nameFor = (index) => speakerDisplayName(speakers, index, t);
      const stats = {};
      for (const line of lines) {
        const entry = stats[line.speaker] || (stats[line.speaker] = { count: 0, durationMs: 0 });
        entry.count++;
        entry.durationMs +=
          Number(line.durationMs) || Math.max(0, (Number(line.endMs) || 0) - (Number(line.startMs) || 0));
      }

      const status = providerStatus(speechSnap);
      const provider = status.provider;
      const preparation = status.preparation;
      const canStart = !!(
        speechSnap.available &&
        speechSnap.connected &&
        provider &&
        preparation &&
        ['ready', 'standby', 'waking'].indexOf(preparation.phase) >= 0
      );

      const recording = snap.phase === 'recording';
      const starting = snap.phase === 'starting';
      const stopping = snap.phase === 'stopping';
      const elapsed = recording ? Math.max(0, now - snap.startedAt) : snap.durationMs || 0;
      const canExport = lines.some((line) => line.text) && !starting && !stopping;
      const audioAvailable = !!(
        snap.audioUrl &&
        snap.audioSessionId &&
        snap.review &&
        snap.audioSessionId === snap.review.id &&
        snap.view === 'review'
      );
      const showLanguageTip = !!(
        !recording &&
        !starting &&
        !stopping &&
        snap.view !== 'review' &&
        canStart &&
        status.catalog &&
        status.catalog.selection.language === 'auto' &&
        isChineseLocale(activeLocale) &&
        !languageTipDismissed
      );

      const startRecording = () => {
        if (titleTimer.current) {
          clearTimeout(titleTimer.current);
          titleTimer.current = null;
        }
        setActionError('');
        setPendingDelete(null);
        void engine.start();
      };
      const stopRecording = () => {
        void engine.stop();
      };
      const prepare = async (providerId) => {
        setBusy(true);
        setActionError('');
        const result = await speechBridge.prepare(providerId, source ? { downloadSource: source } : undefined);
        if (result && result.ok === false) {
          setActionError(result.error && result.error.message ? result.error.message : t('statusFailed'));
        }
        setBusy(false);
      };
      const cancelPreparation = async (providerId) => {
        setBusy(true);
        const result = await speechBridge.cancelPreparation(providerId);
        if (result && result.ok === false) {
          setActionError(result.error && result.error.message ? result.error.message : t('statusFailed'));
        }
        setBusy(false);
      };
      const changeLanguage = async (language) => {
        setActionError('');
        const result = await speechBridge.configure({ language });
        if (result && result.ok === false) {
          setActionError(result.error && result.error.message ? result.error.message : t('statusFailed'));
        }
      };
      const markdown = () => buildMarkdown(data, t, activeLocale);

      const copyMarkdown = async () => {
        const text = markdown();
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
          } else if (!copyTextFallback(text)) {
            throw new Error('copy failed');
          }
          setCopied(true);
          if (copiedTimer.current) clearTimeout(copiedTimer.current);
          copiedTimer.current = setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          setActionError(t('copyFailed'));
        }
      };
      const downloadMarkdown = () => {
        const ok = downloadBlob(
          new Blob([markdown()], { type: 'text/markdown;charset=utf-8' }),
          'facechat-' + fileStamp(data.createdAt) + '.md',
        );
        if (!ok) setActionError(t('copyFailed'));
      };
      const downloadAudio = () => {
        if (!snap.audioUrl) return;
        saveUrl(snap.audioUrl, 'facechat-' + fileStamp(data.createdAt) + '.' + audioExtension(snap.audioMime));
      };
      const requestDelete = (id) => {
        if (pendingDelete === id) {
          const result = engine.deleteSession(id);
          setPendingDelete(null);
          if (result && result.ok === false) setActionError(t('storageError'));
        } else {
          setPendingDelete(id);
          setTimeout(() => {
            setPendingDelete((current) => (current === id ? null : current));
          }, 4000);
        }
      };
      const changeTitle = (value) => {
        setTitleDraft(value);
        if (titleTimer.current) clearTimeout(titleTimer.current);
        titleTimer.current = setTimeout(() => {
          titleTimer.current = null;
          engine.updateTitle(value);
        }, 400);
      };
      const commitTitle = () => {
        if (titleTimer.current) {
          clearTimeout(titleTimer.current);
          titleTimer.current = null;
        }
        engine.updateTitle(titleDraft);
      };
      const openMenu = (lineId) => setMenu({ lineId });
      const closeMenu = () => setMenu(null);
      const pickSpeaker = (lineId, index) => {
        engine.reassignLine(lineId, index);
        setMenu(null);
      };
      const addSpeakerForLine = (lineId) => {
        const index = engine.addSpeaker();
        engine.reassignLine(lineId, index);
        setMenu(null);
      };
      const toggleDraft = (action) => {
        if (action === 'recover') engine.recoverDraft();
        else engine.discardDraft();
      };
      const openGlossary = () => setGlossaryOpen(true);
      const applyGlossary = () => {
        engine.reapplyGlossary();
        setGlossaryOpen(false);
      };
      const dismissLanguageTip = () => {
        setLanguageTipDismissed(true);
        saveLanguageTipDismissed();
      };
      const useChineseRecognition = () => {
        dismissLanguageTip();
        void changeLanguage('zh');
      };

      const statusPillTone = recording
        ? 'live'
        : starting || stopping
          ? 'warn'
          : isReview
            ? 'ready'
            : canStart
              ? 'ready'
              : 'warn';
      const statusPillText = recording
        ? t('recording')
        : starting
          ? t('starting')
          : stopping
            ? t('stopping')
            : isReview
              ? t('saved')
              : canStart
                ? t('ready')
                : t('statusUnprepared');

      const engineErrorKey = snap.error && snap.error.key;
      const showEngineError =
        engineErrorKey && engineErrorKey !== 'errorSpeechUnavailable' && engineErrorKey !== 'errorNotReady';

      const header = h(
        'header',
        { className: 'dsh-facechat-header' },
        h(
          'div',
          { className: 'dsh-facechat-heading' },
          h('span', { className: 'dsh-facechat-heading-mark' }, microphoneGlyph(18, 1.9)),
          h('h1', { className: 'dsh-facechat-title' }, t('title')),
        ),
        h(
          'span',
          { className: 'dsh-facechat-status', 'data-tone': statusPillTone },
          h('span', { className: 'dsh-facechat-status-dot' }),
          statusPillText,
        ),
        recording || stopping || isReview
          ? h('span', { className: 'dsh-facechat-timer' }, formatDuration(elapsed))
          : null,
        recording ? h(LevelMeter, { level, label: t('level') }) : null,
        h(
          'div',
          { className: 'dsh-facechat-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-facechat-btn dsh-facechat-btn--ghost',
              title: t('glossary'),
              'aria-label': t('glossary'),
              onClick: openGlossary,
            },
            glossaryGlyph(15),
            h('span', null, t('glossary')),
          ),
          status.catalog && provider
            ? h(
                'select',
                {
                  className: 'dsh-facechat-select',
                  value: status.catalog.selection.language,
                  'aria-label': t('language'),
                  title: t('language'),
                  disabled: recording || starting || stopping || !speechSnap.connected,
                  onChange: (event) => changeLanguage(event.target.value),
                },
                (provider.languages || ['auto']).map((language) =>
                  h('option', { key: language, value: language }, languageLabel(language, t)),
                ),
              )
            : null,
          recording
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-facechat-btn dsh-facechat-btn--stop',
                  onClick: stopRecording,
                },
                stopGlyph(14),
                t('stop'),
              )
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-facechat-btn dsh-facechat-btn--primary',
                  onClick: startRecording,
                  disabled: !canStart || starting || stopping,
                },
                microphoneGlyph(15),
                starting ? t('starting') : isReview ? t('newRecording') : t('start'),
              ),
        ),
      );

      const sidebar = h(
        'aside',
        { className: 'dsh-facechat-sidebar' },
        h(
          'div',
          { className: 'dsh-facechat-side-section dsh-facechat-side-section--history' },
          h(
            'div',
            { className: 'dsh-facechat-side-head' },
            h('h2', { className: 'dsh-facechat-side-title' }, t('history')),
            h('span', { className: 'dsh-facechat-side-count' }, String(historySnap.sessions.length)),
          ),
          snap.recoveredDraft && snap.view !== 'live'
            ? h(RecoveredDraft, {
                draft: snap.recoveredDraft,
                t,
                onRecover: () => toggleDraft('recover'),
                onDiscard: () => toggleDraft('discard'),
              })
            : null,
          h(
            'div',
            { className: 'dsh-facechat-history' },
            historySnap.sessions.length
              ? historySnap.sessions.map((session) =>
                  h(HistoryRow, {
                    key: session.id,
                    session,
                    t,
                    active: snap.selectedId === session.id,
                    activeLocale,
                    onSelect: (id) => {
                      if (!recording && !starting && !stopping) engine.selectSession(id);
                    },
                  }),
                )
              : h('div', { className: 'dsh-facechat-history-empty' }, t('historyEmpty')),
          ),
        ),
        h(
          'div',
          { className: 'dsh-facechat-side-section dsh-facechat-side-section--speakers' },
          h(
            'div',
            { className: 'dsh-facechat-side-head' },
            h('h2', { className: 'dsh-facechat-side-title' }, t('speakers')),
            h('span', { className: 'dsh-facechat-side-count' }, t('speakerCount', { n: String(Math.max(1, indexes.seen.size)) })),
          ),
          h(SpeakerList, {
            speakers: speakerList,
            stats,
            lines,
            t,
            onRename: (index, name) => engine.renameSpeaker(index, name),
            onMerge: (from, to) => engine.mergeSpeakers(from, to),
          }),
        ),
      );

      let transcript;
      if (snap.view === 'idle') {
        transcript = h(
          'div',
          { className: 'dsh-facechat-transcript', ref: scrollRef },
          h(EmptyHero, { t, onStart: startRecording, canStart: canStart || starting }),
        );
      } else {
        const transcriptHead = isReview
          ? h(
              'div',
              { className: 'dsh-facechat-review-head' },
              h('input', {
                className: 'dsh-facechat-review-title',
                type: 'text',
                value: titleDraft,
                placeholder: t('untitled', { time: formatSessionStamp(data.createdAt, activeLocale) }),
                'aria-label': t('title'),
                onChange: (event) => changeTitle(event.target.value),
                onBlur: commitTitle,
              }),
              h(
                'div',
                { className: 'dsh-facechat-review-meta' },
                [
                  formatDuration(data.durationMs),
                  formatSessionStamp(data.createdAt, activeLocale),
                  t('speakerCount', { n: String(Math.max(1, indexes.seen.size)) }),
                  t('lineCount', { n: String(lines.length) }),
                ].join(' · '),
              ),
            )
          : h(
              'div',
              { className: 'dsh-facechat-transcript-head' },
              h('span', { className: 'dsh-facechat-chip-dot', style: { background: 'var(--dsw-alias-state-error-primary)' } }),
              t('transcript'),
              h('span', { className: 'dsh-facechat-timer' }, formatDuration(elapsed)),
            );

        const transcriptEmpty =
          !lines.length && !(snap.interim && snap.interim.text)
            ? h(
                'div',
                { className: 'dsh-facechat-waiting' },
                recording ? h('span', { className: 'dsh-facechat-interim-dot' }) : null,
                recording || starting ? t('noSpeechYet') : t('transcriptEmpty'),
              )
            : null;

        const viewTabs = h(
          'div',
          { className: 'dsh-facechat-view-tabs', role: 'tablist', 'aria-label': t('transcript') + ' / ' + t('summary') },
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              className: 'dsh-facechat-view-tab',
              'data-active': contentView === 'transcript' ? 'true' : 'false',
              'aria-selected': contentView === 'transcript' ? 'true' : 'false',
              onClick: () => setContentView('transcript'),
            },
            t('transcript'),
          ),
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              className: 'dsh-facechat-view-tab',
              'data-active': contentView === 'summary' ? 'true' : 'false',
              'aria-selected': contentView === 'summary' ? 'true' : 'false',
              onClick: () => setContentView('summary'),
            },
            t('summary'),
          ),
        );

        transcript = h(
          'div',
          { className: 'dsh-facechat-transcript', ref: scrollRef },
          transcriptHead,
          viewTabs,
          contentView === 'summary'
            ? h(SummaryView, { data, t })
            : h(
                'div',
                { className: 'dsh-facechat-lines' },
                lines.map((line) =>
                  h(TranscriptLine, {
                    key: line.id,
                    line,
                    speakers: speakerList,
                    nameFor,
                    t,
                    menuOpen: !!(menu && menu.lineId === line.id),
                    onOpenMenu: openMenu,
                    onCloseMenu: closeMenu,
                    onPick: pickSpeaker,
                    onAdd: addSpeakerForLine,
                  }),
                ),
                snap.view === 'live' && recording && snap.interim
                  ? h(
                      'div',
                      { className: 'dsh-facechat-line', 'data-state': 'interim' },
                      h('span', { className: 'dsh-facechat-line-time' }, formatClock(snap.interim.startMs)),
                      h(
                        'div',
                        { className: 'dsh-facechat-line-body' },
                        h(
                          'div',
                          { className: 'dsh-facechat-line-head' },
                          h(
                            'span',
                            { className: 'dsh-facechat-interim' },
                            h('span', { className: 'dsh-facechat-interim-dot' }),
                            snap.interim.text ? t('listening') : t('interimPending'),
                          ),
                        ),
                        snap.interim.text ? h('p', { className: 'dsh-facechat-line-text' }, snap.interim.text) : null,
                      ),
                    )
                  : null,
                transcriptEmpty,
              ),
        );
      }

      const banners = h(
        'div',
        { className: 'dsh-facechat-banners' },
        h(SetupBanner, {
          speechSnap,
          t,
          source,
          onSource: setSource,
          onPrepare: prepare,
          onCancel: cancelPreparation,
          busy,
          actionError: '',
        }),
        showLanguageTip
          ? h(
              'div',
              { className: 'dsh-facechat-banner', 'data-tone': 'info' },
              h('span', { className: 'dsh-facechat-banner-icon' }, glossaryGlyph(16)),
              h(
                'div',
                { className: 'dsh-facechat-banner-body' },
                h('span', { className: 'dsh-facechat-banner-title' }, t('languageTipTitle')),
                h('span', { className: 'dsh-facechat-banner-text' }, t('languageTipText')),
                h(
                  'div',
                  { className: 'dsh-facechat-banner-actions' },
                  h(
                    'button',
                    { type: 'button', className: 'dsh-facechat-btn dsh-facechat-btn--primary', onClick: useChineseRecognition },
                    t('useChinese'),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'dsh-facechat-btn', onClick: dismissLanguageTip },
                    t('gotIt'),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'dsh-facechat-btn dsh-facechat-btn--ghost', onClick: openGlossary },
                    t('glossary'),
                  ),
                ),
              ),
            )
          : null,
        actionError
          ? h(
              'div',
              { className: 'dsh-facechat-banner', 'data-tone': 'error' },
              h('span', { className: 'dsh-facechat-banner-icon' }, alertGlyph(16)),
              h(
                'div',
                { className: 'dsh-facechat-banner-body' },
                h('span', { className: 'dsh-facechat-banner-text' }, actionError),
              ),
            )
          : null,
        showEngineError
          ? h(
              'div',
              { className: 'dsh-facechat-banner', 'data-tone': 'error' },
              h('span', { className: 'dsh-facechat-banner-icon' }, alertGlyph(16)),
              h(
                'div',
                { className: 'dsh-facechat-banner-body' },
                h(
                  'span',
                  { className: 'dsh-facechat-banner-text' },
                  t(snap.error.key, snap.error.params || {}),
                ),
              ),
            )
          : null,
        snap.notice
          ? h(
              'div',
              { className: 'dsh-facechat-banner', 'data-tone': snap.notice.key === 'transcribeFailure' ? 'warn' : 'error' },
              h('span', { className: 'dsh-facechat-banner-icon' }, alertGlyph(16)),
              h(
                'div',
                { className: 'dsh-facechat-banner-body' },
                h(
                  'span',
                  { className: 'dsh-facechat-banner-text' },
                  snap.notice.key === 'transcribeFailure'
                    ? t('transcribeFailure', snap.notice.params || {})
                    : t(snap.notice.key, snap.notice.params || {}),
                ),
              ),
            )
          : null,
      );

      const footerStatus = recording
        ? t('recording') + ' · ' + t('lineCount', { n: String(lines.length) })
        : stopping || starting
          ? t(stopping ? 'stopping' : 'starting')
          : isReview
            ? t('saved') + ' · ' + t('lineCount', { n: String(lines.length) })
            : canStart
              ? t('modelReady')
              : t('statusUnprepared');

      const footer = h(
        'footer',
        { className: 'dsh-facechat-footer' },
        h('span', { className: 'dsh-facechat-footer-status' }, footerStatus),
        isReview && audioAvailable ? h('span', { className: 'dsh-facechat-footer-note' }, t('audioInMemory')) : null,
        isReview && !audioAvailable ? h('span', { className: 'dsh-facechat-footer-note' }, t('audioMissing')) : null,
        h(
          'div',
          { className: 'dsh-facechat-footer-actions' },
          canExport
            ? h(
                'button',
                { type: 'button', className: 'dsh-facechat-btn', onClick: copyMarkdown },
                copied ? checkGlyph(14) : copyGlyph(14),
                copied ? t('copied') : t('exportCopy'),
              )
            : null,
          canExport
            ? h('button', { type: 'button', className: 'dsh-facechat-btn', onClick: downloadMarkdown }, downloadGlyph(14), t('exportDownload'))
            : null,
          isReview && audioAvailable
            ? h('button', { type: 'button', className: 'dsh-facechat-btn', onClick: downloadAudio }, downloadGlyph(14), t('exportAudio'))
            : null,
          isReview && snap.review
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-facechat-btn dsh-facechat-btn--ghost dsh-facechat-btn--danger',
                  'data-confirm': pendingDelete === snap.review.id ? 'true' : 'false',
                  onClick: () => requestDelete(snap.review.id),
                },
                trashGlyph(14),
                pendingDelete === snap.review.id ? t('confirmDelete') : t('delete'),
              )
            : null,
        ),
      );

      return h(
        'div',
        { className: 'dsh-facechat-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        header,
        h('div', { className: 'dsh-facechat-body' }, sidebar, h('section', { className: 'dsh-facechat-main' }, banners, transcript, footer)),
        glossaryOpen
          ? h(GlossaryDialog, {
              t,
              glossary,
              onClose: () => setGlossaryOpen(false),
              onSaved: applyGlossary,
            })
          : null,
      );
    }

    /* ------------------------------------------------------------------ *
     * Plugin
     * ------------------------------------------------------------------ */

    const plugin = {
      inject: ['remote', 'slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);

        // Dictionaries for every locale the catalog knows about, plus the tags
        // this bundle ships, so a late-loaded language still resolves.
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
              /* already registered by another copy or duplicate tag */
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
        }, 'facechat-locale');

        // Version log: ask the Notes plugin to keep a release note for this
        // bundle. The descriptor rides the shared sink when Notes is already
        // mounted; otherwise it is queued and Notes drains it on load.
        ctx.effect(() => {
          const descriptor = {
            id: '@local/facechat-recorder',
            title: { zh: '面聊录音', en: 'Face-to-face Recorder' },
            noteTitle: { zh: '面聊录音版本记录', en: 'Face-to-face Recorder version log' },
            version: '1.3.0',
            entries: [
              {
                version: '1.3.0',
                at: '2026-10-27T16:46+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '新增端侧资源 Provider：本插件以 facechat 来源接入统一资源接口 resource.search / resource.read',
                    '检索支持按标题、话者名与逐字稿内容匹配关键词，可按时间范围过滤并分页取回',
                    '读取返回完整逐字稿，每行带时间戳与话者名；未命名的话者显示为「话者 N」/「Speaker N」',
                  ],
                  en: [
                    'Added the device-side resource Provider: this plugin joins the unified resource interface as the "facechat" source',
                    'Search matches a query against the recording title, the speaker names and the transcript text, with time-range filtering and paging',
                    'Read returns the full transcript, one line per utterance with its elapsed timestamp and speaker; an unnamed speaker shows as "话者 N" / "Speaker N"',
                  ],
                },
              },
              {
                version: '1.2.1',
                at: '2026-10-26T14:05+08:00',
                source: 'harness',
                points: {
                  zh: ['优化：侧边栏入口名称由「面聊录音」缩短为「面聊」，页面标题与插件名保持不变'],
                  en: ['Improved: the sidebar entry is now labelled "Facechat" instead of "Face-to-face Recorder"; the page title and plugin name are unchanged'],
                },
              },
              {
                version: '1.2.0',
                at: '2026-10-25T23:10+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '新增「术语表」：内置 GitHub、benchmark、DeepSeek、Deep Research 等常见技术词的易错写法，支持自定义「错误写法=正确写法」，保存后立即重写当前记录并用于后续转写',
                    '新增识别语言建议：中英混说且语言为「自动」时提示改用「中文」，减少专有名词误识别',
                    '新增话者合并：话者被自动拆得过细时，可在侧边栏把该话者一键合并到另一位',
                    '优化断句：静音切分阈值由 480ms 放宽到 640ms，单次识别获得更完整的上下文',
                  ],
                  en: [
                    'Added a transcript glossary with common misrecognitions for GitHub, benchmark, DeepSeek, Deep Research and more, plus custom "wrong spelling=correct term" rules that rewrite the open recording immediately and apply to later transcripts',
                    'Added a recognition-language hint: when speech mixes Chinese and English and the language is Automatic, the panel suggests choosing Chinese to reduce proper-noun errors',
                    'Added speaker merge: over-split speakers can be folded into another speaker from the sidebar',
                    'Improved segmentation: the end-of-speech silence threshold is now 640 ms instead of 480 ms, giving each recognition request more context',
                  ],
                },
              },
              {
                version: '1.1.0',
                at: '2026-10-25T22:48+08:00',
                source: 'external',
                sourceName: 'Codex',
                points: {
                  zh: [
                    '新增「逐字稿 / 总结」双标签：总结保留每条内容的话者身份和时间',
                    '新增按话者的核心发言、发言时长与占比，以及可能的结论与后续提取',
                    '话者改名或片段重新指派后，总结和 Markdown 导出会自动更新',
                    '话者名编辑改为明确的点击编辑态，支持 Enter/失焦保存与 Esc 取消',
                  ],
                  en: [
                    'Added Transcript / Summary tabs with speaker identity and timestamps preserved in every summary item',
                    'Added per-speaker highlights, speaking duration/share, and extraction of possible decisions and next steps',
                    'Speaker renames and line reassignments now refresh the summary and Markdown export automatically',
                    'Speaker names now use an explicit click-to-edit state with Enter/blur save and Escape cancel',
                  ],
                },
              },
              {
                version: '1.0.0',
                at: '2026-10-25T22:06+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '首个版本：侧边栏「面聊录音」入口与主区域录音页',
                    '录音：一键录制麦克风、实时电平与计时，能量 VAD 分段（360ms 预卷、480ms 静音切分、12s 强制切分）',
                    '转写：经 Harness 语音服务近实时转写（约 1.5s 字幕延迟），自动清理 SenseVoice 富文本标记',
                    '话者分离：MFCC/音高/频谱质心嵌入在线聚类，最多 6 位话者，支持改名与逐行重新指派',
                    '历史与草稿：浏览器本地录音历史（重开/重命名/导出/删除），页面重载后可恢复草稿',
                    '模型准备：本地 SenseVoice 模型下载（Hugging Face / HF-Mirror），含磁盘与耗时预估、进度与取消',
                    '导出：Markdown 复制/下载与音频文件下载；中英文双语、明暗主题',
                  ],
                  en: [
                    'First release: Face-to-face Recorder sidebar entry and full-width recorder page',
                    'Capture: one-click microphone recording, live level and timer, energy VAD segmentation (360 ms pre-roll, 480 ms silence cut, 12 s forced cut)',
                    'Transcription: near-real-time ASR through the Harness speech service (~1.5 s caption latency), with SenseVoice rich-text tokens cleaned',
                    'Speaker separation: online clustering of MFCC/pitch/spectral-centroid embeddings, up to six speakers, renaming and per-line reassignment',
                    'History and drafts: browser-local recording history (reopen/rename/export/delete) and crash-safe draft restore',
                    'Model preparation: local SenseVoice model download (Hugging Face / HF-Mirror) with disk/time estimates, progress and cancel',
                    'Export: Markdown copy/download and audio download; English and Chinese UI, light and dark themes',
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
            const queue =
              window.__dshPluginVersionLogQueue ||
              (window.__dshPluginVersionLogQueue = []);
            queue.push(descriptor);
          }
        }, 'facechat-version-log');

        // Device resource Provider: this plugin owns the recordings in
        // `dsh.facechat.v1`, so it registers the Provider the unified
        // device-side resource interface asks for. The registry only ever
        // calls search()/read(); it never reads another plugin's storage.
        ctx.effect(() => {
          const provider = createFacechatProvider(() => {
            try {
              const snapshot =
                ctx.locale && typeof ctx.locale.getSnapshot === 'function' ? ctx.locale.getSnapshot() : null;
              return snapshot && typeof snapshot.active === 'string' ? snapshot.active : '';
            } catch (err) {
              return '';
            }
          });
          return registerResourceProvider(provider);
        }, 'facechat-resource-provider');

        const history = createHistoryStore();
        const glossary = createGlossaryStore();
        const speechBridge = createSpeechBridge(ctx);
        speechBridge.connect(ctx);
        const engine = createEngine({ speech: speechBridge, history, glossary });
        ctx.effect(() => () => engine.dispose(), 'facechat-engine');

        const View = (slotProps) =>
          h(
            FacechatPanel,
            Object.assign({}, slotProps, {
              t,
              locale: ctx.locale,
              engine,
              speech: speechBridge,
              history,
              glossary,
            }),
          );

        const PanelIcon = (slotProps) => h(FacechatIcon, slotProps);

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, View));
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 6,
              label: () => t('navTitle'),
            },
            PanelIcon,
          ),
        );
      },
    };

    // Test-only surface: never present in the running page.
    if (typeof window !== 'undefined' && window.__DSH_FACECHAT_TEST__ === true) {
      plugin.__dsp = {
        fft,
        encodeWave,
        audioBase64,
        extractEmbedding,
        estimatePitch,
        createVadSegmenter,
        createSpeakerClusterer,
        createFrameAnalyzer,
        cleanTranscript,
        createTranscriptRefiner,
        buildGlossaryRules,
        parseGlossaryText,
        applyGlossaryRules,
        DEFAULT_GLOSSARY,
        TARGET_RATE,
        FRAME_SAMPLES,
      };
      plugin.__ui = {
        FacechatPanel,
        buildMarkdown,
        buildIdentitySummary,
        SummaryView,
        GlossaryDialog,
      };
    }

    return plugin;
  },
});
