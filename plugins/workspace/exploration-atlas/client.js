/**
 * Exploration Atlas — Client half.
 *
 * The atlas explains the system being explored rather than scoring plugins.
 * Its default view is a causal loop:
 * capture -> memory -> protocol -> invoke -> loop -> evolve -> capture.
 *
 * Seven capability frontiers sit under that loop. Curated explorations and
 * locally recorded experiments are evidence attached to a stage and one
 * frontier. The plugin remains a device-side resource Provider.
 */
window.__ModuleLoader__.load({
  id: '@local/exploration-atlas',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'explorationAtlas';
    const PANEL_ID = 'exploration';
    const VERSION = '1.1.2';
    const STORAGE_KEY = 'dsh.exploration-atlas.v1';
    const RESOURCE_SOURCE = 'exploration';
    const MAX_NAME = 60;
    const MAX_ABSTRACTION = 240;
    const BASE_UPDATED_AT = Date.parse('2026-10-29T12:00:00+08:00');

    const STATUSES = [
      { id: 'landed', name: { zh: '已落地', en: 'Landed' } },
      { id: 'experiment', name: { zh: '实验中', en: 'Experiment' } },
      { id: 'idea', name: { zh: '设想', en: 'Idea' } },
    ];

    const GROUPS = [
      {
        id: 'substrate',
        index: '01',
        title: { zh: '产品由什么构成', en: 'What is the product made of?' },
        description: {
          zh: '从固定功能，走向可生成的表现层、可追溯的数据对象和可加入的公共协议。',
          en: 'From fixed features to generative surfaces, traceable data objects and joinable protocols.',
        },
      },
      {
        id: 'behavior',
        index: '02',
        title: { zh: 'Agent 如何使用这些构成', en: 'How does the agent use them?' },
        description: {
          zh: '上下文如何进入、能力如何被调用，以及一轮 Agent 行为由什么规则约束。',
          en: 'How context enters, capabilities are invoked and one agent turn is governed.',
        },
      },
      {
        id: 'growth',
        index: '03',
        title: { zh: '产品如何持续生长', en: 'How does the product keep growing?' },
        description: {
          zh: '从个人工具跨到协作网络，再把反馈变成可验证、可回滚的下一次变化。',
          en: 'From a personal tool to a collaboration network, then from feedback to a verifiable, reversible change.',
        },
      },
    ];

    const FRONTIERS = [
      {
        id: 'surface',
        group: 'substrate',
        title: { zh: '表现层可塑性', en: 'Surface plasticity' },
        question: { zh: '界面是否能按场景生成和退场？', en: 'Can the interface appear and recede with the situation?' },
        takeaway: {
          zh: '侧边栏、主面板、输入框与全局浮层都能被插件重组；下一步不是更多常驻入口，而是情境界面。',
          en: 'Plugins can reshape the sidebar, panel, composer and global overlay; the next step is contextual UI, not more permanent entries.',
        },
        next: { zh: '让能力在需要时出现、使用后退场。', en: 'Let capabilities appear when needed and recede after use.' },
      },
      {
        id: 'memory',
        group: 'substrate',
        title: { zh: '数据生命周期', en: 'Data lifecycle' },
        question: { zh: '信息能否长期存在、追溯和演进？', en: 'Can information persist, be traced and evolve?' },
        takeaway: {
          zh: '笔记、逐字稿、消息和版本记录已经成为带来源与时间的长期对象，而不只是一次聊天上下文。',
          en: 'Notes, transcripts, messages and release logs are persistent objects with provenance and time, not just chat context.',
        },
        next: { zh: '补齐来源链、身份、版本冲突与自动保存边界。', en: 'Add provenance chains, identity, conflict handling and clear auto-save boundaries.' },
      },
      {
        id: 'protocol',
        group: 'substrate',
        title: { zh: '协议组合', en: 'Protocol composition' },
        question: { zh: '新能力能否不经两两适配就加入系统？', en: 'Can a new capability join without pairwise integration?' },
        takeaway: {
          zh: 'resource.search/read 把跨插件引用从私有约定变成公共能力：拥有数据的一方只注册一次。',
          en: 'resource.search/read turns cross-plugin reference from private glue into a shared capability: the owner registers once.',
        },
        next: { zh: '定义权限、来源、游标、订阅、写入与协议版本。', en: 'Define permission, provenance, cursors, subscriptions, writes and protocol versions.' },
      },
      {
        id: 'context',
        group: 'behavior',
        title: { zh: '上下文组织', en: 'Context orchestration' },
        question: { zh: '谁决定 Agent 此刻看什么？', en: 'Who decides what the agent sees now?' },
        takeaway: {
          zh: '# 负责显式范围，资源检索负责模糊意图，随手问负责把当前场景带进来；三者不是替代关系。',
          en: '# owns explicit scope, resource retrieval handles fuzzy intent, and Quick Ask carries the current scene; they are complementary.',
        },
        next: { zh: '形成统一 Context Router：决定来源、范围、预算和引用。', en: 'Build one Context Router for source, scope, budget and citation decisions.' },
      },
      {
        id: 'loop',
        group: 'behavior',
        title: { zh: 'Agent 行为规则', en: 'Agent behavior rules' },
        question: { zh: 'Agent 何时搜索、验证、行动和结束？', en: 'When does the agent search, verify, act and stop?' },
        takeaway: {
          zh: '轨迹让默认 Loop 可观察，完成前验证证明插件可以修改终止规则；行为质量来自 Policy，不只是工具数量。',
          en: 'Trajectory exposes the loop and Verify-before-Finish changes stopping rules; behavior quality comes from policy, not tool count.',
        },
        next: { zh: '沉淀可组合 Policy，并用同任务对照实验验证收益。', en: 'Create composable policies and validate them with same-task controls.' },
      },
      {
        id: 'collaboration',
        group: 'growth',
        title: { zh: '协作边界', en: 'Collaboration boundary' },
        question: { zh: '数据如何从“我的”变成“我们的”？', en: 'How does my data become our shared state?' },
        takeaway: {
          zh: '分享码、导入与消息已让数据跨人，但主要仍是传递副本，还不是多人共同维护同一对象。',
          en: 'Share codes, imports and messages move data across people, but mostly as copies rather than shared state.',
        },
        next: { zh: '探索共享对象、身份权限、同步、冲突与审计。', en: 'Explore shared objects, identity, permission, sync, conflicts and audit.' },
      },
      {
        id: 'evolution',
        group: 'growth',
        title: { zh: '自进化治理', en: 'Self-evolution governance' },
        question: { zh: '产品如何发现并安全完成自己的下一次变化？', en: 'How does the product discover and safely deliver its next change?' },
        takeaway: {
          zh: '反馈已能进入创造模式并产出真实版本；尚未解决的是目标发现、优先级、验证、批准和回滚。',
          en: 'Feedback can already launch creation mode and ship a real version; goal discovery, priority, verification, approval and rollback remain.',
        },
        next: { zh: '把反馈收件箱接到沙箱、Diff、验证、批准与回滚。', en: 'Connect the feedback inbox to sandboxing, diff, verification, approval and rollback.' },
      },
    ];

    const STAGES = [
      {
        id: 'capture',
        index: '01',
        title: { zh: '捕获', en: 'Capture' },
        verb: { zh: '把现场变成数据', en: 'Turn the moment into data' },
        claim: {
          zh: '声音、对话与反馈不再只是即时事件，而能成为后续可处理的资源。',
          en: 'Speech, conversations and feedback become resources that can be processed later.',
        },
        next: { zh: '让当前屏幕与实时对话也成为可控的数据来源。', en: 'Make the current screen and live conversation controlled data sources.' },
      },
      {
        id: 'memory',
        index: '02',
        title: { zh: '记忆', en: 'Memory' },
        verb: { zh: '让信息持续存在', en: 'Let information persist' },
        claim: {
          zh: '保存不只是写入正文，还包括来源、时间、版本和后续修改。',
          en: 'Saving includes provenance, time, versions and later changes, not just body text.',
        },
        next: { zh: '把记忆从本地条目推进到有来源链的长期对象。', en: 'Move from local entries to durable objects with provenance.' },
      },
      {
        id: 'protocol',
        index: '03',
        title: { zh: '协议', en: 'Protocol' },
        verb: { zh: '让资源彼此可用', en: 'Make resources interoperable' },
        claim: {
          zh: 'Provider 与 Consumer 解耦以后，新数据源不必和每个入口逐一适配。',
          en: 'Once Providers and Consumers are decoupled, a new source needs no per-entry integration.',
        },
        next: { zh: '把读取接口升级成带权限、来源与事件的稳定协议。', en: 'Evolve reads into a stable protocol with permission, provenance and events.' },
      },
      {
        id: 'invoke',
        index: '04',
        title: { zh: '调用', en: 'Invoke' },
        verb: { zh: '在正确场景出现', en: 'Appear in the right situation' },
        claim: {
          zh: '用户可以显式指定范围，也可以让 Agent 检索，或直接带入当前场景。',
          en: 'People can scope explicitly, let the agent retrieve, or carry in the current scene.',
        },
        next: { zh: '统一显式引用、自动检索与环境上下文的路由。', en: 'Unify explicit reference, retrieval and ambient context routing.' },
      },
      {
        id: 'loop',
        index: '05',
        title: { zh: '行为', en: 'Behavior' },
        verb: { zh: '修改 Agent 的规则', en: 'Edit the agent rules' },
        claim: {
          zh: '插件不仅提供能力，还能改变一轮对话如何验证和结束。',
          en: 'Plugins can change how a turn verifies and stops, not just add capabilities.',
        },
        next: { zh: '从单个关卡走向可组合、可测量的 Policy。', en: 'Move from one gate to composable, measurable policies.' },
      },
      {
        id: 'evolve',
        index: '06',
        title: { zh: '进化', en: 'Evolve' },
        verb: { zh: '把反馈变成变化', en: 'Turn feedback into change' },
        claim: {
          zh: '产品已经能从消息反馈生成需求、修改自身并记录新版本。',
          en: 'The product can turn message feedback into a requirement, modify itself and record a release.',
        },
        next: { zh: '让下一次变化可选择、可验证、可批准、可回滚。', en: 'Make the next change selectable, verifiable, approvable and reversible.' },
      },
    ];

    const CURATED_ENTRIES = [
      {
        id: 'workbench',
        name: { zh: '个人工作台', en: 'Personal workbench' },
        status: 'landed',
        stage: 'invoke',
        frontiers: ['surface'],
        abstraction: {
          zh: '插件把侧边栏、主面板和输入框变成可以重新拼装的产品表面。',
          en: 'Plugins turn the sidebar, main panel and composer into a reconfigurable product surface.',
        },
        takeaway: {
          zh: '“可生成界面”已经成立；真正的下一步是减少常驻入口，让界面由情境触发。',
          en: 'Generative UI is proven; the next step is fewer permanent entries and more contextual surfaces.',
        },
        evidence: [
          { zh: '笔记、面聊、消息进入侧边栏；番茄钟进入输入框；轨迹进入会话视图。', en: 'Notes, Facechat and Messages enter the sidebar; Pomodoro enters the composer; Trajectory enters a conversation view.' },
        ],
        next: { zh: '让同一能力按场景以页面、浮层或内联控件出现。', en: 'Let one capability appear as a page, overlay or inline control depending on context.' },
      },
      {
        id: 'notes',
        name: { zh: '笔记', en: 'Notes' },
        status: 'landed',
        stage: 'memory',
        frontiers: ['memory', 'collaboration'],
        abstraction: {
          zh: '笔记从编辑器变成长期记忆、版本审计和分享载体。',
          en: 'Notes evolve from an editor into durable memory, release audit and sharing substrate.',
        },
        takeaway: {
          zh: 'AI 工作空间的资产不是聊天，而是有来源、时间和版本的数据对象。',
          en: 'The asset of an AI workspace is not chat but data objects with provenance, time and versions.',
        },
        evidence: [
          { zh: 'Markdown 编辑、图片、分享导入、插件版本记录、自驱动变更记录落到同一数据层。', en: 'Markdown, images, sharing/import, plugin release logs and self-driven changes share one data layer.' },
        ],
        next: { zh: '补齐共享对象、来源链和版本冲突。', en: 'Add shared objects, provenance chains and conflict handling.' },
      },
      {
        id: 'messages',
        name: { zh: '消息', en: 'Messages' },
        status: 'landed',
        stage: 'capture',
        frontiers: ['collaboration', 'memory'],
        abstraction: {
          zh: '插件从个人工具变成跨人的通道，也成为产品反馈的入口。',
          en: 'A plugin becomes a person-to-person channel and a source of product feedback.',
        },
        takeaway: {
          zh: '数据跨人以后，重点从传递消息转向身份、共享状态与反馈闭环。',
          en: 'Once data crosses people, identity, shared state and feedback loops matter more than transport.',
        },
        evidence: [
          { zh: '添加码建立联系人，公共中继完成跨网络通信；反馈可被自驱动迭代读取。', en: 'Add codes establish contacts, a public relay crosses networks, and self-iteration can read feedback.' },
        ],
        next: { zh: '把传递副本升级成多人共同维护的资源。', en: 'Evolve copied messages into resources maintained together.' },
      },
      {
        id: 'facechat',
        name: { zh: '面聊', en: 'Facechat' },
        status: 'landed',
        stage: 'capture',
        frontiers: ['memory', 'context'],
        abstraction: {
          zh: '把现场声音转成带话者身份、摘要和术语的可检索资源。',
          en: 'Turn live speech into searchable resources with speaker identity, summaries and vocabulary.',
        },
        takeaway: {
          zh: '只要现场信息被结构化，它就能进入和笔记、消息相同的长期上下文体系。',
          en: 'Once live information is structured, it can join the same durable context system as notes and messages.',
        },
        evidence: [
          { zh: '本地 ASR、话者分离、身份改名、术语表、身份感知摘要和 Markdown 导出。', en: 'Local ASR, diarization, speaker renaming, glossary, identity-aware summary and Markdown export.' },
        ],
        next: { zh: '从录后引用推进到实时、可授权的上下文流。', en: 'Move from post-recording reference to a live, permissioned context stream.' },
      },
      {
        id: 'cross-reference',
        name: { zh: '统一资源接口', en: 'Unified resource API' },
        status: 'landed',
        stage: 'protocol',
        frontiers: ['protocol', 'context'],
        abstraction: {
          zh: '数据拥有者注册 Provider，消费方只依赖统一 search/read。',
          en: 'Data owners register Providers while consumers depend only on shared search/read.',
        },
        takeaway: {
          zh: '这一步把插件集合变成平台：新的内容源可以自动进入引用与问答。',
          en: 'This turns a plugin collection into a platform: new content sources can join reference and Q&A automatically.',
        },
        evidence: [
          { zh: '笔记、面聊、消息、探索地图注册 Provider；# 菜单通过统一接口发现并读取。', en: 'Notes, Facechat, Messages and Atlas register Providers; the # menu discovers and reads them through one interface.' },
        ],
        next: { zh: '把读取约定扩展成有权限、来源、订阅和写入的协议 v1。', en: 'Extend reads into protocol v1 with permission, provenance, subscriptions and writes.' },
      },
      {
        id: 'quick-ask',
        name: { zh: '随手问', en: 'Quick Ask' },
        status: 'landed',
        stage: 'invoke',
        frontiers: ['surface', 'context', 'protocol'],
        abstraction: {
          zh: '在任意应用唤起同一个 Agent，并把当前场景作为可预览的上下文。',
          en: 'Invoke the same agent from any app with the current scene as previewable context.',
        },
        takeaway: {
          zh: 'AI 不一定是需要进入的应用，也可以成为覆盖既有工作环境的认知入口。',
          en: 'AI need not be an app people enter; it can be a cognitive entry over the existing environment.',
        },
        evidence: [
          { zh: '⌥7 原生热键、跨应用浮层、前台辅助功能上下文、真实 prompt 通道。', en: 'Option+7 hotkey, cross-app overlay, foreground accessibility context and the real prompt channel.' },
        ],
        next: { zh: '回答后直接作用于当前应用，并明确上下文预览与权限边界。', en: 'Act back on the current app with explicit context preview and permission boundaries.' },
      },
      {
        id: 'loop',
        name: { zh: 'Agent Loop 改造', en: 'Agent loop' },
        status: 'experiment',
        stage: 'loop',
        frontiers: ['loop'],
        abstraction: {
          zh: '把探索从工具层推进到行为规则：可观察并修改一轮对话如何结束。',
          en: 'Move exploration from tools to behavior rules: observe and change how a turn ends.',
        },
        takeaway: {
          zh: 'Host 工具定义能做什么，Loop Policy 定义以什么质量、证据和风险边界完成。',
          en: 'Host tools define what can be done; loop policy defines quality, evidence and risk boundaries.',
        },
        evidence: [
          { zh: '轨迹组件暴露模型与工具调用；完成前验证拦截缺少验证证据的收尾，并做了前后对照。', en: 'Trajectory exposes model/tool calls; Verify-before-Finish intercepts closure without evidence and was compared against a control.' },
        ],
        next: { zh: '做通用 Policy 组合与任务基准，而不是继续写特定 workflow。', en: 'Build composable policies and task benchmarks instead of more one-off workflows.' },
      },
      {
        id: 'self-driving',
        name: { zh: '自驱动迭代', en: 'Self-driven iteration' },
        status: 'experiment',
        stage: 'evolve',
        frontiers: ['evolution', 'loop', 'collaboration'],
        abstraction: {
          zh: '把真实用户反馈转成需求、代码修改、验证和版本记录。',
          en: 'Turn real user feedback into a requirement, code change, verification and release record.',
        },
        takeaway: {
          zh: '自进化不是“会写代码”，而是观察、判断、修改、验证和发布形成闭环。',
          en: 'Self-evolution is not code generation; it is a loop of observe, judge, change, verify and release.',
        },
        evidence: [
          { zh: '“点击图片无法放大”触发创造模式，把消息插件升级到 1.10.0，并写回自驱动版本记录。', en: '"Clicking a picture does not zoom" launched creation mode, shipped Messages 1.10.0 and wrote a self-driven release record.' },
        ],
        next: { zh: '补齐目标发现、优先级、沙箱、批准和回滚。', en: 'Add goal discovery, priority, sandboxing, approval and rollback.' },
      },
    ];

    const DICTS = {
      zh: {
        title: '探索地图',
        subtitle: '不是插件清单，而是一张从信息进入到产品自我进化的系统地图。',
        headline: '你探索的不是更多功能，而是一个 AI 产品如何构成、行动与生长。',
        tabLoop: '阶段',
        tabDimensions: '维度',
        tabEvidence: '探索',
        tabRecord: '灵感',
        explorationCount: '{count} 条真实探索',
        frontierCount: '{count} 个能力维度',
        stageCount: '{count} 个系统阶段',
        loopHint: '点击一个阶段，查看它解决的问题、已有证据和下一步。箭头表示能力的因果关系，不表示成熟度。',
        stageExplorations: '这个阶段的探索',
        stageTakeaway: '目前成立的判断',
        stageNext: '下一步实验',
        dimensionHint: '七个能力维度，归到三个根问题；不做数值排名。',
        dimensionQuestion: '它问',
        dimensionTakeaway: '已经学到',
        dimensionEvidence: '证据',
        dimensionNext: '下一条边界',
        evidenceHint: '每条探索都用同一结构记录：抽象、takeaway、证据、下一实验。状态代表证据强度，不代表价值高低。',
        evidenceAbstract: '抽象',
        evidenceTakeaway: 'Takeaway',
        evidenceProof: '证据',
        evidenceNext: '下一实验',
        recordTitle: '补录一次探索',
        recordHint: '记录一项真实实验，并把它放到系统阶段和能力维度中。它保存在当前浏览器，并进入资源接口。',
        recordName: '名称',
        recordNamePlaceholder: '例如：跨设备工作台',
        recordAbstraction: '它验证了什么',
        recordAbstractionPlaceholder: '不要描述功能，写清楚它推进了哪条边界。',
        recordStage: '系统阶段',
        recordDimension: '能力维度',
        recordStatus: '证据状态',
        recordAdd: '记录探索',
        recordAdded: '已记录，并进入闭环、证据与资源接口。',
        recordErrorName: '先给这次探索起一个名字。',
        recordErrorAbstraction: '写清楚它验证了什么。',
        recordErrorStorage: '浏览器拒绝保存，这条探索没有写入。',
        recordEmpty: '还没有补录的探索。',
        recordRemove: '删除',
        customBadge: '补录',
        footer: '探索条目是证据，系统闭环是抽象；两者分开维护。',
        statusLanded: '已落地',
        statusExperiment: '实验中',
        statusIdea: '设想',
      },
      en: {
        title: 'Exploration Atlas',
        subtitle: 'Not a plugin list, but a system map from incoming information to product self-evolution.',
        headline: 'You are not exploring more features, but how an AI product is made, behaves and grows.',
        tabLoop: 'Stages',
        tabDimensions: 'Dimensions',
        tabEvidence: 'Explorations',
        tabRecord: 'Ideas',
        explorationCount: '{count} real explorations',
        frontierCount: '{count} capability dimensions',
        stageCount: '{count} system stages',
        loopHint: 'Select a stage to see its problem, evidence and next experiment. Arrows are causal, not maturity scores.',
        stageExplorations: 'Explorations in this stage',
        stageTakeaway: 'What currently holds',
        stageNext: 'Next experiment',
        dimensionHint: 'Seven capability dimensions under three root questions, without numeric rankings.',
        dimensionQuestion: 'Question',
        dimensionTakeaway: 'Learned',
        dimensionEvidence: 'Evidence',
        dimensionNext: 'Next frontier',
        evidenceHint: 'Every exploration uses one structure: abstraction, takeaway, evidence and next experiment. Status means evidence strength, not value.',
        evidenceAbstract: 'Abstraction',
        evidenceTakeaway: 'Takeaway',
        evidenceProof: 'Evidence',
        evidenceNext: 'Next experiment',
        recordTitle: 'Record an exploration',
        recordHint: 'Record a real experiment and place it in a system stage and capability dimension. It stays in this browser and joins the resource API.',
        recordName: 'Name',
        recordNamePlaceholder: 'e.g. cross-device workbench',
        recordAbstraction: 'What did it validate?',
        recordAbstractionPlaceholder: 'Describe the boundary it moved, not the feature.',
        recordStage: 'System stage',
        recordDimension: 'Capability dimension',
        recordStatus: 'Evidence status',
        recordAdd: 'Record exploration',
        recordAdded: 'Recorded and added to the loop, evidence and resource API.',
        recordErrorName: 'Give the exploration a name first.',
        recordErrorAbstraction: 'State what it validated.',
        recordErrorStorage: 'The browser refused to save this exploration.',
        recordEmpty: 'No explorations recorded yet.',
        recordRemove: 'Delete',
        customBadge: 'Recorded',
        footer: 'Explorations are evidence; the system loop is the abstraction. Maintain them separately.',
        statusLanded: 'Landed',
        statusExperiment: 'Experiment',
        statusIdea: 'Idea',
      },
    };

    let currentLang = 'zh';

    function languageOf(locale) {
      return String(locale || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
    }

    function activeLocale(localeFace) {
      try {
        const snapshot = localeFace.getSnapshot();
        if (snapshot && snapshot.active) return snapshot.active;
      } catch (_err) {
        /* use default */
      }
      return 'zh';
    }

    function pick(value, lang) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      const chosen = value[lang] !== undefined ? value[lang] : value.zh !== undefined ? value.zh : value.en;
      return chosen === undefined || chosen === null ? '' : String(chosen);
    }

    function pickList(value, lang) {
      if (!value) return [];
      const list = Array.isArray(value) ? value : [value];
      return list.map((item) => pick(item, lang)).filter(Boolean);
    }

    function cleanText(value, limit) {
      return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
    }

    function byId(list, id) {
      return list.find((item) => item.id === id) || list[0];
    }

    function statusName(id, lang) {
      return pick(byId(STATUSES, id).name, lang);
    }

    function legacyFrontier(axis) {
      const map = { data: 'memory', agency: 'evolution', time: 'memory', seat: 'surface', compose: 'protocol' };
      return map[axis] || 'surface';
    }

    function stageForFrontier(frontier) {
      const map = {
        surface: 'invoke',
        memory: 'memory',
        protocol: 'protocol',
        context: 'invoke',
        loop: 'loop',
        collaboration: 'capture',
        evolution: 'evolve',
      };
      return map[frontier] || 'capture';
    }

    function sanitizeCustom(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const name = cleanText(raw.name, MAX_NAME);
      const abstraction = cleanText(raw.abstraction, MAX_ABSTRACTION);
      if (!name || !abstraction) return null;
      const frontierCandidate = Array.isArray(raw.frontiers) ? raw.frontiers[0] : raw.frontier || legacyFrontier(raw.axis);
      const frontier = FRONTIERS.some((item) => item.id === frontierCandidate) ? frontierCandidate : FRONTIERS[0].id;
      const stageCandidate = raw.stage || stageForFrontier(frontier);
      const stage = STAGES.some((item) => item.id === stageCandidate) ? stageCandidate : stageForFrontier(frontier);
      const status = STATUSES.some((item) => item.id === raw.status) ? raw.status : 'landed';
      const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : 'custom-' + createdAt,
        name: { zh: name, en: name },
        abstraction: { zh: abstraction, en: abstraction },
        takeaway: { zh: '', en: '' },
        evidence: [],
        next: { zh: '', en: '' },
        stage,
        frontiers: [frontier],
        status,
        createdAt,
        updatedAt: createdAt,
        custom: true,
      };
    }

    function readCustomEntries() {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        const list = Array.isArray(parsed.entries) ? parsed.entries : [];
        return list.map(sanitizeCustom).filter(Boolean);
      } catch (_err) {
        return [];
      }
    }

    function writeCustomEntries(entries) {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, entries }));
        return true;
      } catch (_err) {
        return false;
      }
    }

    function loadAtlas() {
      const entries = CURATED_ENTRIES.map((entry, index) =>
        Object.assign({}, entry, {
          custom: false,
          createdAt: BASE_UPDATED_AT - (CURATED_ENTRIES.length - 1 - index) * 86400000,
          updatedAt: BASE_UPDATED_AT - (CURATED_ENTRIES.length - 1 - index) * 86400000,
        }),
      ).concat(readCustomEntries());
      return { entries, stages: STAGES, frontiers: FRONTIERS, groups: GROUPS };
    }

    function matchesQuery(entry, lang, query) {
      const needle = String(query || '').trim().toLowerCase();
      if (!needle) return true;
      const stage = byId(STAGES, entry.stage);
      const frontiers = entry.frontiers.map((id) => byId(FRONTIERS, id));
      const haystack = [
        pick(entry.name, lang),
        pick(entry.name, 'zh'),
        pick(entry.name, 'en'),
        pick(entry.abstraction, lang),
        pick(entry.takeaway, lang),
        pick(entry.next, lang),
        pickList(entry.evidence, lang).join(' '),
        pick(stage.title, lang),
      ].concat(frontiers.map((frontier) => pick(frontier.title, lang))).join(' ').toLowerCase();
      return needle.split(/\s+/).every((term) => haystack.indexOf(term) >= 0);
    }

    function inTimeRange(timestamp, range) {
      if (!range || typeof range !== 'object') return true;
      if (Number.isFinite(range.from) && timestamp < range.from) return false;
      if (Number.isFinite(range.to) && timestamp > range.to) return false;
      return true;
    }

    function entryText(entry, lang) {
      const t = DICTS[lang];
      const lines = [
        '# ' + pick(entry.name, lang),
        '',
        t.recordStage + ': ' + pick(byId(STAGES, entry.stage).title, lang),
        t.recordDimension + ': ' + entry.frontiers.map((id) => pick(byId(FRONTIERS, id).title, lang)).join(' / '),
        t.recordStatus + ': ' + statusName(entry.status, lang),
        '',
        '## ' + t.evidenceAbstract,
        pick(entry.abstraction, lang),
      ];
      if (pick(entry.takeaway, lang)) lines.push('', '## ' + t.evidenceTakeaway, pick(entry.takeaway, lang));
      const evidence = pickList(entry.evidence, lang);
      if (evidence.length) lines.push('', '## ' + t.evidenceProof, ...evidence.map((item) => '- ' + item));
      if (pick(entry.next, lang)) lines.push('', '## ' + t.evidenceNext, pick(entry.next, lang));
      return lines.join('\n');
    }

    const CSS = [
      '.dsh-atlas-root{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.55}',
      '.dsh-atlas-header{display:flex;align-items:flex-start;gap:16px;padding:18px 24px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-atlas-heading{display:flex;gap:10px;min-width:0;flex:1}.dsh-atlas-mark{color:var(--dsw-alias-brand-primary);padding-top:2px}.dsh-atlas-title{margin:0;font-size:17px;line-height:24px}.dsh-atlas-subtitle{margin:3px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-atlas-counts{display:flex;flex-wrap:wrap;gap:6px}.dsh-atlas-count{padding:2px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;white-space:nowrap}',
      '.dsh-atlas-tabs{display:flex;gap:4px;padding:0 24px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-atlas-tab{appearance:none;border:0;background:transparent;padding:9px 12px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;position:relative}.dsh-atlas-tab[data-active=true]{color:var(--dsw-alias-label-primary);font-weight:600}.dsh-atlas-tab[data-active=true]:after{content:\"\";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;background:var(--dsw-alias-brand-primary);border-radius:2px}',
      '.dsh-atlas-body{flex:1;min-height:0;overflow:auto}.dsh-atlas-page{max-width:1120px;margin:0 auto;padding:20px 24px 44px;box-sizing:border-box}.dsh-atlas-hint{margin:0 0 16px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-atlas-loop{display:flex;align-items:stretch;gap:8px;overflow-x:auto;padding:4px 2px 12px}.dsh-atlas-stage{appearance:none;flex:1 0 140px;min-height:118px;text-align:left;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:13px;cursor:pointer;color:inherit;font:inherit}.dsh-atlas-stage:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}.dsh-atlas-stage[data-active=true]{border-color:var(--dsw-alias-brand-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}',
      '.dsh-atlas-stage__top{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary);font-size:10.5px}.dsh-atlas-stage__title{font-size:15px;font-weight:650;margin-top:7px}.dsh-atlas-stage__verb{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px}.dsh-atlas-stage__count{margin-top:10px;font-size:11px;color:var(--dsw-alias-brand-primary)}.dsh-atlas-arrow{display:flex;align-items:center;color:var(--dsw-alias-label-tertiary);font-size:18px}',
      '.dsh-atlas-loopback{display:flex;align-items:center;gap:10px;margin:0 4px 14px;color:var(--dsw-alias-label-secondary);font-size:11.5px}.dsh-atlas-loopback:before,.dsh-atlas-loopback:after{content:\"\";height:1px;background:var(--dsw-alias-border-l1);flex:1}',
      '.dsh-atlas-detail{border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1);padding:18px}.dsh-atlas-detail__head{display:flex;align-items:flex-start;gap:12px}.dsh-atlas-detail__index{font-size:11px;color:var(--dsw-alias-brand-primary);font-weight:700}.dsh-atlas-detail h2{font-size:16px;margin:0}.dsh-atlas-detail__claim{margin:4px 0 0;color:var(--dsw-alias-label-secondary)}.dsh-atlas-label{margin:18px 0 7px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--dsw-alias-label-secondary);font-weight:650}',
      '.dsh-atlas-entry-chips{display:flex;flex-wrap:wrap;gap:7px}.dsh-atlas-entry-chip{padding:5px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);font-size:12px}.dsh-atlas-entry-chip small{color:var(--dsw-alias-label-secondary);margin-left:6px}',
      '.dsh-atlas-next{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border-left:3px solid var(--dsw-alias-state-warn-primary)}',
      '.dsh-atlas-group{margin-bottom:24px}.dsh-atlas-group__head{display:grid;grid-template-columns:36px 1fr;gap:10px;margin-bottom:10px}.dsh-atlas-group__index{color:var(--dsw-alias-brand-primary);font-weight:700}.dsh-atlas-group h2{font-size:15px;margin:0}.dsh-atlas-group__description{margin:3px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-atlas-frontiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-left:46px}.dsh-atlas-frontier{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px;background:var(--dsw-alias-bg-layer-1)}.dsh-atlas-frontier h3{margin:0 0 8px;font-size:13.5px}.dsh-atlas-frontier dl{margin:0}.dsh-atlas-frontier dt{margin-top:9px;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:650}.dsh-atlas-frontier dd{margin:2px 0 0;font-size:12px}.dsh-atlas-frontier__evidence{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}.dsh-atlas-mini{padding:2px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-atlas-evidence{display:grid;gap:10px}.dsh-atlas-card{display:grid;grid-template-columns:42px 1fr;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:14px}.dsh-atlas-card__index{color:var(--dsw-alias-brand-primary);font-size:11px;font-weight:700}.dsh-atlas-card__lead{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.dsh-atlas-card h3{margin:0;font-size:14px}.dsh-atlas-status{font-size:10.5px;color:var(--dsw-alias-label-secondary)}.dsh-atlas-status[data-status=landed]{color:var(--dsw-alias-state-success-primary)}.dsh-atlas-status[data-status=experiment]{color:var(--dsw-alias-state-warn-primary)}.dsh-atlas-badge{font-size:10px;padding:1px 5px;border:1px dashed var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary)}.dsh-atlas-card__tags{display:flex;gap:5px;flex-wrap:wrap;margin-left:auto}.dsh-atlas-card__row{margin-top:9px}.dsh-atlas-card__row strong{display:block;font-size:10.5px;color:var(--dsw-alias-label-secondary);margin-bottom:2px}.dsh-atlas-card__row p,.dsh-atlas-card__row ul{margin:0;font-size:12.5px}.dsh-atlas-card__row ul{padding-left:18px}',
      '.dsh-atlas-form{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:16px}.dsh-atlas-field{display:flex;flex-direction:column;gap:4px}.dsh-atlas-field--wide{grid-column:1/-1}.dsh-atlas-field label{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:600}.dsh-atlas-field input,.dsh-atlas-field textarea,.dsh-atlas-field select{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:inherit;padding:8px 10px;font:inherit;outline:none}.dsh-atlas-field textarea{min-height:68px;resize:vertical}.dsh-atlas-actions{grid-column:1/-1;display:flex;align-items:center;gap:10px}.dsh-atlas-button{border:0;border-radius:8px;background:var(--dsw-alias-brand-primary);color:white;padding:8px 14px;font:inherit;cursor:pointer}.dsh-atlas-notice{font-size:12px}.dsh-atlas-notice[data-kind=saved]{color:var(--dsw-alias-state-success-primary)}.dsh-atlas-notice[data-kind=error]{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-atlas-customs{display:grid;gap:8px;margin-top:18px}.dsh-atlas-custom{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px}.dsh-atlas-custom__body{flex:1}.dsh-atlas-custom__name{font-weight:600}.dsh-atlas-custom__text{margin:2px 0;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-atlas-custom__remove{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:4px 8px;cursor:pointer}.dsh-atlas-empty{margin-top:18px;padding:18px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-atlas-footer{padding:8px 24px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}',
      '@media(max-width:760px){.dsh-atlas-counts{display:none}.dsh-atlas-frontiers{margin-left:0}.dsh-atlas-form{grid-template-columns:1fr}.dsh-atlas-card{grid-template-columns:30px 1fr}}',
    ].join('\n');

    function atlasGlyph(size) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 12, cy: 12, r: 8.6, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M12 3.4v17.2M3.4 12h17.2', stroke: 'currentColor', strokeWidth: 1.1, opacity: 0.5 }),
        h('path', { d: 'M15.9 8.1l-2.2 5.6-5.6 2.2 2.2-5.6z', fill: 'currentColor' }));
    }

    function AtlasIcon(props) {
      const size = props && props.size > 0 ? props.size : 20;
      return h('span', { style: { display: 'inline-flex', color: props && props.active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)' } }, atlasGlyph(size));
    }

    function StatusChip(props) {
      return h('span', { className: 'dsh-atlas-status', 'data-status': props.status }, statusName(props.status, props.lang));
    }

    function LoopView(props) {
      const atlas = props.atlas;
      const lang = props.lang;
      const t = props.t;
      const activeStage = byId(STAGES, props.activeStage);
      const stageEntries = atlas.entries.filter((entry) => entry.stage === activeStage.id);
      const nodes = [];
      STAGES.forEach((stage, index) => {
        const count = atlas.entries.filter((entry) => entry.stage === stage.id).length;
        nodes.push(h('button', {
          type: 'button',
          className: 'dsh-atlas-stage',
          'data-stage': stage.id,
          'data-active': String(stage.id === activeStage.id),
          onClick: () => props.onStage(stage.id),
          key: stage.id,
        },
        h('div', { className: 'dsh-atlas-stage__top' }, h('span', null, stage.index)),
        h('div', { className: 'dsh-atlas-stage__title' }, pick(stage.title, lang)),
        h('div', { className: 'dsh-atlas-stage__verb' }, pick(stage.verb, lang)),
        h('div', { className: 'dsh-atlas-stage__count' }, t('explorationCount', { count }))));
        if (index < STAGES.length - 1) nodes.push(h('span', { className: 'dsh-atlas-arrow', key: 'arrow-' + index, 'aria-hidden': 'true' }, '→'));
      });
      return h('div', { className: 'dsh-atlas-page' },
        h('p', { className: 'dsh-atlas-hint' }, t('loopHint')),
        h('div', { className: 'dsh-atlas-loop' }, nodes),
        h('div', { className: 'dsh-atlas-loopback' }, lang === 'zh' ? '反馈回到下一次捕获' : 'Feedback returns to the next capture'),
        h('section', { className: 'dsh-atlas-detail' },
          h('div', { className: 'dsh-atlas-detail__head' },
            h('span', { className: 'dsh-atlas-detail__index' }, activeStage.index),
            h('div', null,
              h('h2', null, pick(activeStage.title, lang) + ' · ' + pick(activeStage.verb, lang)),
              h('p', { className: 'dsh-atlas-detail__claim' }, pick(activeStage.claim, lang)))),
          h('div', { className: 'dsh-atlas-label' }, t('stageExplorations')),
          h('div', { className: 'dsh-atlas-entry-chips' },
            stageEntries.map((entry) => h('span', { className: 'dsh-atlas-entry-chip', key: entry.id },
              pick(entry.name, lang), h('small', null, statusName(entry.status, lang))))),
          h('div', { className: 'dsh-atlas-label' }, t('stageNext')),
          h('div', { className: 'dsh-atlas-next' }, pick(activeStage.next, lang))));
    }

    function DimensionsView(props) {
      const lang = props.lang;
      const t = props.t;
      const atlas = props.atlas;
      return h('div', { className: 'dsh-atlas-page' },
        h('p', { className: 'dsh-atlas-hint' }, t('dimensionHint')),
        GROUPS.map((group) => {
          const frontiers = FRONTIERS.filter((item) => item.group === group.id);
          return h('section', { className: 'dsh-atlas-group', key: group.id },
            h('div', { className: 'dsh-atlas-group__head' },
              h('span', { className: 'dsh-atlas-group__index' }, group.index),
              h('div', null, h('h2', null, pick(group.title, lang)), h('p', { className: 'dsh-atlas-group__description' }, pick(group.description, lang)))),
            h('div', { className: 'dsh-atlas-frontiers' },
              frontiers.map((frontier) => {
                return h('article', { className: 'dsh-atlas-frontier', key: frontier.id },
                  h('h3', null, pick(frontier.title, lang)),
                  h('dl', null,
                    h('dt', null, t('dimensionQuestion')), h('dd', null, pick(frontier.question, lang)),
                    h('dt', null, t('dimensionTakeaway')), h('dd', null, pick(frontier.takeaway, lang)),
                    h('dt', null, t('dimensionNext')), h('dd', null, pick(frontier.next, lang))));
              })));
        }));
    }

    function EvidenceView(props) {
      const lang = props.lang;
      const t = props.t;
      return h('div', { className: 'dsh-atlas-page' },
        h('p', { className: 'dsh-atlas-hint' }, t('evidenceHint')),
        h('div', { className: 'dsh-atlas-evidence' },
          props.atlas.entries.map((entry, index) =>
            h('article', { className: 'dsh-atlas-card', key: entry.id },
              h('span', { className: 'dsh-atlas-card__index' }, String(index + 1).padStart(2, '0')),
              h('div', null,
                h('div', { className: 'dsh-atlas-card__lead' },
                  h('h3', null, pick(entry.name, lang)),
                  h(StatusChip, { status: entry.status, lang }),
                  entry.custom ? h('span', { className: 'dsh-atlas-badge' }, t('customBadge')) : null,
                  h('div', { className: 'dsh-atlas-card__tags' },
                    h('span', { className: 'dsh-atlas-mini' }, pick(byId(STAGES, entry.stage).title, lang)),
                    entry.frontiers.map((id) => h('span', { className: 'dsh-atlas-mini', key: id }, pick(byId(FRONTIERS, id).title, lang))))),
                h('div', { className: 'dsh-atlas-card__row' }, h('strong', null, t('evidenceAbstract')), h('p', null, pick(entry.abstraction, lang))),
                pick(entry.takeaway, lang) ? h('div', { className: 'dsh-atlas-card__row' }, h('strong', null, t('evidenceTakeaway')), h('p', null, pick(entry.takeaway, lang))) : null,
                pickList(entry.evidence, lang).length ? h('div', { className: 'dsh-atlas-card__row' }, h('strong', null, t('evidenceProof')), h('ul', null, pickList(entry.evidence, lang).map((line, i) => h('li', { key: i }, line)))) : null,
                pick(entry.next, lang) ? h('div', { className: 'dsh-atlas-card__row' }, h('strong', null, t('evidenceNext')), h('p', null, pick(entry.next, lang))) : null)))));
    }

    function RecordView(props) {
      const custom = props.atlas.entries.filter((entry) => entry.custom);
      const field = (id, label, child, wide) => h('div', { className: 'dsh-atlas-field' + (wide ? ' dsh-atlas-field--wide' : '') }, h('label', { htmlFor: id }, label), child);
      return h('div', { className: 'dsh-atlas-page' },
        h('p', { className: 'dsh-atlas-hint' }, props.t('recordHint')),
        h('div', { className: 'dsh-atlas-form' },
          field('dsh-atlas-name', props.t('recordName'), h('input', { id: 'dsh-atlas-name', value: props.draft.name, maxLength: MAX_NAME, placeholder: props.t('recordNamePlaceholder'), onChange: (event) => props.onChange('name', event.target.value) })),
          field('dsh-atlas-stage', props.t('recordStage'), h('select', { id: 'dsh-atlas-stage', value: props.draft.stage, onChange: (event) => props.onChange('stage', event.target.value) }, STAGES.map((item) => h('option', { value: item.id, key: item.id }, pick(item.title, props.lang))))),
          field('dsh-atlas-status', props.t('recordStatus'), h('select', { id: 'dsh-atlas-status', value: props.draft.status, onChange: (event) => props.onChange('status', event.target.value) }, STATUSES.map((item) => h('option', { value: item.id, key: item.id }, pick(item.name, props.lang))))),
          field('dsh-atlas-abstraction', props.t('recordAbstraction'), h('textarea', { id: 'dsh-atlas-abstraction', value: props.draft.abstraction, maxLength: MAX_ABSTRACTION, placeholder: props.t('recordAbstractionPlaceholder'), onChange: (event) => props.onChange('abstraction', event.target.value) }), true),
          field('dsh-atlas-frontier', props.t('recordDimension'), h('select', { id: 'dsh-atlas-frontier', value: props.draft.frontier, onChange: (event) => props.onChange('frontier', event.target.value) }, FRONTIERS.map((item) => h('option', { value: item.id, key: item.id }, pick(item.title, props.lang))))),
          h('div', { className: 'dsh-atlas-actions' },
            h('button', { type: 'button', className: 'dsh-atlas-button', onClick: props.onAdd }, props.t('recordAdd')),
            props.notice ? h('span', { className: 'dsh-atlas-notice', 'data-kind': props.notice.kind }, props.notice.text) : null)),
        custom.length ? h('div', { className: 'dsh-atlas-customs' }, custom.map((entry) =>
          h('div', { className: 'dsh-atlas-custom', key: entry.id },
            h('div', { className: 'dsh-atlas-custom__body' }, h('div', { className: 'dsh-atlas-custom__name' }, pick(entry.name, props.lang)), h('p', { className: 'dsh-atlas-custom__text' }, pick(entry.abstraction, props.lang))),
            h('button', { type: 'button', className: 'dsh-atlas-custom__remove', onClick: () => props.onRemove(entry.id) }, props.t('recordRemove'))))) : h('div', { className: 'dsh-atlas-empty' }, props.t('recordEmpty')));
    }

    function AtlasPanel(props) {
      const t = props.t;
      const localeFace = props.locale;
      const [lang, setLang] = React.useState(() => languageOf(activeLocale(localeFace)));
      const [atlas, setAtlas] = React.useState(loadAtlas);
      const [tab, setTab] = React.useState('loop');
      const [activeStage, setActiveStage] = React.useState('capture');
      const [draft, setDraft] = React.useState({ name: '', abstraction: '', stage: 'capture', frontier: 'surface', status: 'landed' });
      const [notice, setNotice] = React.useState(null);

      React.useEffect(() => {
        if (!localeFace || typeof localeFace.subscribe !== 'function') return undefined;
        return localeFace.subscribe(() => setLang(languageOf(activeLocale(localeFace))));
      }, [localeFace]);

      function changeDraft(field, value) {
        setNotice(null);
        setDraft((previous) => Object.assign({}, previous, { [field]: value }));
      }

      function serialize(entry) {
        return {
          id: entry.id,
          name: entry.name.zh,
          abstraction: entry.abstraction.zh,
          stage: entry.stage,
          frontiers: entry.frontiers,
          status: entry.status,
          createdAt: entry.createdAt,
        };
      }

      function addEntry() {
        const name = cleanText(draft.name, MAX_NAME);
        const abstraction = cleanText(draft.abstraction, MAX_ABSTRACTION);
        if (!name) return setNotice({ kind: 'error', text: t('recordErrorName') });
        if (!abstraction) return setNotice({ kind: 'error', text: t('recordErrorAbstraction') });
        const createdAt = Date.now();
        const entries = readCustomEntries().map(serialize);
        entries.push({ id: 'custom-' + createdAt, name, abstraction, stage: draft.stage, frontiers: [draft.frontier], status: draft.status, createdAt });
        if (!writeCustomEntries(entries)) return setNotice({ kind: 'error', text: t('recordErrorStorage') });
        setAtlas(loadAtlas());
        setDraft(Object.assign({}, draft, { name: '', abstraction: '' }));
        setNotice({ kind: 'saved', text: t('recordAdded') });
      }

      function removeEntry(id) {
        if (!writeCustomEntries(readCustomEntries().filter((entry) => entry.id !== id).map(serialize))) return setNotice({ kind: 'error', text: t('recordErrorStorage') });
        setAtlas(loadAtlas());
        setNotice(null);
      }

      const tabs = [
        { id: 'loop', label: t('tabLoop') },
        { id: 'dimensions', label: t('tabDimensions') },
        { id: 'evidence', label: t('tabEvidence') },
        { id: 'record', label: t('tabRecord') },
      ];
      let body;
      if (tab === 'dimensions') body = h(DimensionsView, { atlas, lang, t });
      else if (tab === 'evidence') body = h(EvidenceView, { atlas, lang, t });
      else if (tab === 'record') body = h(RecordView, { atlas, draft, notice, lang, t, onChange: changeDraft, onAdd: addEntry, onRemove: removeEntry });
      else body = h(LoopView, { atlas, lang, t, activeStage, onStage: setActiveStage });

      return h('div', { className: 'dsh-atlas-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('header', { className: 'dsh-atlas-header' },
          h('div', { className: 'dsh-atlas-heading' }, h('span', { className: 'dsh-atlas-mark' }, atlasGlyph(22)), h('div', null, h('h1', { className: 'dsh-atlas-title' }, t('title')), h('p', { className: 'dsh-atlas-subtitle' }, t('subtitle')))),
          h('div', { className: 'dsh-atlas-counts' },
            h('span', { className: 'dsh-atlas-count' }, t('explorationCount', { count: atlas.entries.length })),
            h('span', { className: 'dsh-atlas-count' }, t('frontierCount', { count: FRONTIERS.length })),
            h('span', { className: 'dsh-atlas-count' }, t('stageCount', { count: STAGES.length })))),
        h('div', { className: 'dsh-atlas-tabs', role: 'tablist' }, tabs.map((item) => h('button', { type: 'button', role: 'tab', className: 'dsh-atlas-tab', 'data-tab': item.id, 'data-active': String(tab === item.id), 'aria-selected': String(tab === item.id), onClick: () => setTab(item.id), key: item.id }, item.label))),
        h('div', { className: 'dsh-atlas-body', role: 'tabpanel' }, body),
        h('div', { className: 'dsh-atlas-footer' }, t('title') + ' ' + VERSION + ' · ' + t('footer')));
    }

    function registerResourceProvider(provider) {
      if (!provider || !provider.source) return () => undefined;
      const sink = typeof window !== 'undefined' ? window.__dshResourceSink : null;
      if (typeof sink === 'function') {
        try { return sink(provider); } catch (_err) { /* queue below */ }
      }
      if (typeof window === 'undefined') return () => undefined;
      const queue = window.__dshResourceQueue || (window.__dshResourceQueue = []);
      queue.push(provider);
      return () => {
        const index = queue.indexOf(provider);
        if (index >= 0) queue.splice(index, 1);
      };
    }

    function createResourceProvider() {
      return {
        source: RESOURCE_SOURCE,
        title: { zh: '探索地图', en: 'Exploration Atlas' },
        kind: 'document',
        icon: 'file',
        aliases: ['探索', '维度', '闭环', '证据', 'exploration', 'atlas', 'loop'],
        labels: {
          all: { zh: '全部探索', en: 'All explorations' },
          unit: { zh: '条探索', en: 'explorations' },
          item: { zh: '探索', en: 'Explorations' },
          empty: { zh: '暂无探索', en: 'No explorations yet' },
        },
        async describe(locale) {
          const count = loadAtlas().entries.length;
          return languageOf(locale) === 'zh' ? count + ' 条探索 · 6 个系统阶段 · 7 个能力维度' : count + ' explorations · 6 stages · 7 dimensions';
        },
        async search(params) {
          const input = params && typeof params === 'object' ? params : {};
          const offset = Number.isInteger(input.offset) && input.offset > 0 ? input.offset : 0;
          const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : 20;
          const matched = loadAtlas().entries.filter((entry) => matchesQuery(entry, currentLang, input.query) && inTimeRange(entry.updatedAt, input.timeRange)).sort((a, b) => b.updatedAt - a.updatedAt);
          return {
            items: matched.slice(offset, offset + limit).map((entry) => ({
              id: entry.id,
              title: pick(entry.name, currentLang),
              snippet: pick(entry.abstraction, currentLang),
              updatedAt: entry.updatedAt,
              createdAt: entry.createdAt,
              meta: { stage: entry.stage, frontiers: entry.frontiers, status: entry.status, custom: !!entry.custom },
            })),
            total: matched.length,
          };
        },
        async read(params) {
          const ids = params && Array.isArray(params.ids) ? params.ids : [];
          const entries = loadAtlas().entries;
          const wanted = ids.indexOf('all') >= 0 ? entries.map((entry) => entry.id) : ids;
          return {
            items: wanted.map((id) => entries.find((entry) => entry.id === id)).filter(Boolean).map((entry) => ({
              id: entry.id,
              title: pick(entry.name, currentLang),
              text: entryText(entry, currentLang),
              updatedAt: entry.updatedAt,
              createdAt: entry.createdAt,
              itemType: 'exploration',
              attributes: { stage: entry.stage, frontiers: entry.frontiers, status: entry.status, custom: !!entry.custom },
              meta: { name: entry.name, abstraction: entry.abstraction },
            })),
          };
        },
      };
    }

    function versionLogDescriptor() {
      return {
        id: '@local/exploration-atlas',
        title: { zh: '探索地图', en: 'Exploration Atlas' },
        noteTitle: { zh: '探索地图版本记录', en: 'Exploration Atlas version log' },
        version: VERSION,
        entries: [
          {
            version: '1.1.2',
            at: '2026-10-29T23:54+08:00',
            source: 'external',
            sourceName: 'Codex',
            points: {
              zh: ['优化页签文案：「闭环」改为「阶段」，直接表达页面展示的是六个系统阶段。', '仅调整用户可见文案，阶段之间的闭环关系和数据结构不变。'],
              en: ['Renamed the Loop tab to Stages so the label directly describes the six system stages.', 'Only user-facing copy changed; the causal loop and data structure remain intact.'],
            },
          },
          {
            version: '1.1.1',
            at: '2026-10-29T23:50+08:00',
            source: 'external',
            sourceName: 'Codex',
            points: {
              zh: ['优化页签文案：「证据」改为「探索」，更贴近内容本身。', '「补录」改为「灵感」，降低记录新想法的操作感。'],
              en: ['Renamed the Evidence tab to Explorations to match its content.', 'Renamed Record to Ideas to make capturing a new thought feel lighter.'],
            },
          },
          {
            version: '1.1.0',
            at: '2026-10-29T23:35+08:00',
            source: 'external',
            sourceName: 'Codex',
            points: {
              zh: [
                '重构信息架构：默认视图从五维打分矩阵改为“捕获 → 记忆 → 协议 → 调用 → 行为 → 进化”的系统闭环，点击阶段可查看真实探索与下一实验',
                '重构探索维度：按“产品由什么构成 / Agent 如何使用 / 产品如何生长”三个根问题组织七个能力维度，移除平均分与薄弱维度推断',
                '证据化记录：每条探索统一展示抽象、takeaway、真实证据与下一实验；补录数据兼容旧版并进入闭环、证据页和资源接口',
              ],
              en: [
                'Rebuilt the information architecture: the default view is now a system loop from Capture to Memory, Protocol, Invoke, Behavior and Evolve, with evidence and next experiments per selectable stage',
                'Reframed dimensions under three root questions — what the product is made of, how the agent uses it, and how the product grows — with seven capability frontiers and no average-score or weakest-axis inference',
                'Made exploration evidence-based: every entry now shows abstraction, takeaway, real evidence and next experiment; recorded data migrates from v1 and joins the loop, evidence view and resource API',
              ],
            },
          },
          {
            version: '1.0.2',
            at: '2026-10-29T22:07+08:00',
            source: 'harness',
            points: {
              zh: ['修复真实页面因本地化字典函数值导致的空白面板。', '补齐字符串字典与计数插值回归测试。'],
              en: ['Fixed the blank real panel caused by function values in locale dictionaries.', 'Added regression coverage for string dictionaries and count interpolation.'],
            },
          },
          {
            version: '1.0.1',
            at: '2026-10-29T21:59+08:00',
            source: 'harness',
            points: {
              zh: ['把真实自驱动迭代闭环加入探索证据。', '将自驱动状态从设想推进为实验中。'],
              en: ['Added evidence from the real self-driven iteration loop.', 'Moved self-driving from idea to experiment.'],
            },
          },
          {
            version: '1.0.0',
            at: '2026-10-29T21:25+08:00',
            source: 'harness',
            points: {
              zh: ['首个探索地图版本：五维矩阵、路径、总结与补录。', '注册 exploration 端侧资源 Provider。'],
              en: ['First Atlas release with five-axis matrix, path, summary and recording.', 'Registered the exploration device-side resource Provider.'],
            },
          },
        ],
      };
    }

    function registerLocale(ctx) {
      ctx.effect(() => {
        const disposers = [];
        const ids = new Set(['en', 'zh', 'zh-Hans', 'zh-CN', 'zh-TW']);
        try { for (const locale of ctx.locale.getSnapshot().locales) ids.add(locale.id); } catch (_err) { /* shipped ids */ }
        for (const id of ids) {
          try { disposers.push(ctx.locale.register(NS, id, String(id).toLowerCase().indexOf('zh') === 0 ? DICTS.zh : DICTS.en)); } catch (_err) { /* already registered */ }
        }
        return () => disposers.reverse().forEach((dispose) => { try { dispose(); } catch (_err) { /* ignore */ } });
      }, 'exploration-atlas-locale');
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        registerLocale(ctx);
        currentLang = languageOf(activeLocale(ctx.locale));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.subscribe(() => { currentLang = languageOf(activeLocale(ctx.locale)); }), 'exploration-atlas-language');
        ctx.effect(() => registerResourceProvider(createResourceProvider()), 'exploration-atlas-resource-provider');
        ctx.effect(() => {
          const descriptor = versionLogDescriptor();
          let handled = false;
          try {
            const service = ctx.get('pluginVersionLog');
            if (service && typeof service.register === 'function') { service.register(descriptor); handled = true; }
          } catch (_err) { handled = false; }
          if (!handled && typeof window.__dshPluginVersionLogSink === 'function') { window.__dshPluginVersionLogSink(descriptor); handled = true; }
          if (!handled) (window.__dshPluginVersionLogQueue || (window.__dshPluginVersionLogQueue = [])).push(descriptor);
        }, 'exploration-atlas-version-log');
        const View = (slotProps) => h(AtlasPanel, Object.assign({}, slotProps, { t, locale: ctx.locale }));
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, View));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 8, label: () => t('title') }, (slotProps) => h(AtlasIcon, slotProps)));
      },
    };
  },
});
