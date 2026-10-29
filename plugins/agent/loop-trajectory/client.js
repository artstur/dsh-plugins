/**
 * Compact Loop trajectory — Client half.
 *
 * The official ui-trajectory package owns the event definitions and the
 * Session projection. This plugin consumes its standard `useTrajectory` hook
 * and contributes another `conversation.view`; it never scans Chat DOM or
 * opens a second Session history stream.
 */
window.__ModuleLoader__.load({
  id: '@local/loop-trajectory',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const VIEW_ID = 'loop-trajectory';
    const VERSION = '1.0.1';

    const CSS = `
      .dsh-loop-trajectory {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: auto;
        color: var(--foreground, #171717);
        background: var(--background, #fff);
      }
      .dsh-loop-trajectory__canvas {
        box-sizing: border-box;
        min-width: max-content;
        min-height: 100%;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: clamp(64px, 12vh, 132px) 56px 180px;
      }
      .dsh-loop-trajectory__line {
        display: flex;
        align-items: flex-start;
      }
      .dsh-loop-trajectory__stage {
        width: max-content;
        min-width: 92px;
        display: grid;
        grid-template-rows: 26px 22px;
        justify-items: center;
        gap: 7px;
      }
      .dsh-loop-trajectory__label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 26px;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 560;
        letter-spacing: .01em;
      }
      .dsh-loop-trajectory__marker {
        width: 10px;
        height: 10px;
        flex: 0 0 auto;
        border-radius: 999px;
        box-sizing: border-box;
        background: #111;
      }
      .dsh-loop-trajectory__stage[data-state='current'] .dsh-loop-trajectory__marker {
        background: #3678f6;
        box-shadow: 0 0 0 5px rgba(54, 120, 246, .13);
      }
      .dsh-loop-trajectory__stage[data-state='pending'] {
        color: #9ca3af;
      }
      .dsh-loop-trajectory__stage[data-state='pending'] .dsh-loop-trajectory__marker {
        background: transparent;
        border: 1.5px solid #b9bec7;
      }
      .dsh-loop-trajectory__stage[data-kind='complete'] .dsh-loop-trajectory__marker {
        width: 18px;
        height: 18px;
        border: 0;
        background: transparent;
        color: #169b55;
        font-size: 18px;
        line-height: 18px;
        font-weight: 700;
      }
      .dsh-loop-trajectory__stage[data-kind='complete'][data-state='pending'] .dsh-loop-trajectory__marker {
        color: #b9bec7;
      }
      .dsh-loop-trajectory__time {
        height: 22px;
        color: #8b929d;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .dsh-loop-trajectory__arrow {
        width: 38px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #a2a8b1;
        font-size: 17px;
      }
      .dsh-loop-trajectory__empty {
        color: #8b929d;
        font-size: 14px;
      }
      @media (max-width: 760px) {
        .dsh-loop-trajectory__canvas {
          justify-content: flex-start;
          padding-left: 28px;
          padding-right: 28px;
        }
        .dsh-loop-trajectory__stage { min-width: 84px; }
        .dsh-loop-trajectory__arrow { width: 28px; }
      }
      @media (prefers-color-scheme: dark) {
        .dsh-loop-trajectory { color: var(--foreground, #f5f5f5); }
        .dsh-loop-trajectory__marker { background: #f1f3f5; }
      }
    `;

    function turnNumber(location) {
      if (!location || (location.kind !== 'turn' && location.kind !== 'step')) return null;
      return location.turn && Number.isFinite(location.turn.turn) ? location.turn.turn : null;
    }

    function turnLocation(snapshot, turn) {
      for (const node of snapshot.eventNodes || []) {
        const location = snapshot.eventLocations && snapshot.eventLocations.get(node.seq);
        if (turnNumber(location) === turn) return location.turn;
      }
      return null;
    }

    function blockText(content) {
      if (!Array.isArray(content)) return '';
      return content.map((block) => {
        if (typeof block === 'string') return block;
        if (!block || typeof block !== 'object') return '';
        if (typeof block.text === 'string') return block.text;
        if (typeof block.content === 'string') return block.content;
        return '';
      }).filter(Boolean).join('\n');
    }

    function countFromValue(value, depth) {
      if (depth > 5 || value === null || value === undefined) return null;
      if (Array.isArray(value)) return value.length;
      if (typeof value !== 'object') return null;
      const preferred = ['items', 'results', 'matches', 'records', 'resources', 'entries', 'documents', 'refs'];
      for (const key of preferred) {
        if (Array.isArray(value[key])) return value[key].length;
      }
      if (Number.isFinite(value.count) && value.count >= 0) return Math.floor(value.count);
      if (Number.isFinite(value.total) && value.total >= 0) return Math.floor(value.total);
      for (const key of ['data', 'result', 'output', 'payload']) {
        const nested = countFromValue(value[key], depth + 1);
        if (nested !== null) return nested;
      }
      return null;
    }

    function resultCount(content) {
      const text = blockText(content).trim();
      if (!text) return null;
      try {
        return countFromValue(JSON.parse(text), 0);
      } catch (_err) {
        const arrayMatch = text.match(/"(?:items|results|matches|records|resources|entries|documents|refs)"\s*:\s*\[([^\]]*)\]/u);
        if (arrayMatch) {
          const body = arrayMatch[1].trim();
          if (!body) return 0;
          return (body.match(/(?:^|,)\s*(?:\{|\[|"|-?\d|true|false|null)/gu) || []).length;
        }
        const scalarMatch = text.match(/"(?:count|total)"\s*:\s*(\d+)/u);
        return scalarMatch ? Number(scalarMatch[1]) : null;
      }
    }

    function toolKind(name) {
      const normalized = String(name || '').toLowerCase();
      if (/(?:^|[._:/-])(search|query|find|locate|list)(?:$|[._:/-])|搜索|检索/u.test(normalized)) return 'search';
      if (/(?:^|[._:/-])(read|get|open|fetch|load)(?:$|[._:/-])|读取|获取/u.test(normalized)) return 'read';
      return 'tool';
    }

    function toolLabel(kind, count, fallbackName) {
      if (kind === 'search') return count > 0 ? `搜索 ${count} 条` : '搜索';
      if (kind === 'read') return count > 0 ? `读取 ${count} 条` : '读取';
      const tail = String(fallbackName || '工具').split(/[.:/]/u).filter(Boolean).at(-1) || '工具';
      const clean = tail.replace(/[-_]+/gu, ' ').trim();
      return count > 1 ? `${clean} ×${count}` : clean;
    }

    function flattenTool(call, output) {
      if (!call || typeof call !== 'object' || !call.callId) return;
      output.push(call);
      for (const child of call.subCalls || []) flattenTool(child, output);
    }

    function deriveStages(snapshot) {
      const nodes = Array.isArray(snapshot.eventNodes) ? snapshot.eventNodes : [];
      const assistantTurns = nodes.filter((node) => node.kind === 'assistant').map((node) => node.turn);
      const requestTurns = (snapshot.requests || [])
        .filter((request) => request.purpose === 'assistant')
        .map((request) => request.turn);
      const runningTurns = (snapshot.runningCalls || []).map((call) => call.turn);
      const partialTurns = snapshot.partial ? [snapshot.partial.turn] : [];
      const turns = [...assistantTurns, ...requestTurns, ...runningTurns, ...partialTurns]
        .filter(Number.isFinite);

      if (turns.length === 0) {
        for (const node of nodes) {
          const located = turnNumber(snapshot.eventLocations && snapshot.eventLocations.get(node.seq));
          if (located !== null) turns.push(located);
        }
      }
      if (turns.length === 0) return [];

      const turn = Math.max(...turns);
      const locatedNodes = nodes.filter((node) =>
        node.kind === 'assistant'
          ? node.turn === turn
          : turnNumber(snapshot.eventLocations && snapshot.eventLocations.get(node.seq)) === turn,
      );
      const user = locatedNodes.find((node) => node.kind === 'user' || node.kind === 'steering');
      const requests = (snapshot.requests || [])
        .filter((request) => request.purpose === 'assistant' && request.turn === turn)
        .slice()
        .sort((left, right) => left.startedAt - right.startedAt || left.startSeq - right.startSeq);
      const assistants = locatedNodes.filter((node) => node.kind === 'assistant');
      const baseline = Number.isFinite(user && user.time)
        ? user.time
        : requests[0] && Number.isFinite(requests[0].startedAt)
          ? requests[0].startedAt
          : assistants[0] && Number.isFinite(assistants[0].time)
            ? assistants[0].time
            : Date.now();

      const events = [];

      const requestSteps = new Set();
      for (const request of requests) {
        requestSteps.add(request.step);
        events.push({
          id: `model:${request.startSeq}`,
          kind: 'model',
          label: '模型',
          time: request.startedAt,
        });
      }
      for (const assistant of assistants) {
        if (requestSteps.has(assistant.step)) continue;
        const start = assistant.timing && Number.isFinite(assistant.timing.stepStartTime)
          ? assistant.timing.stepStartTime
          : assistant.time;
        events.push({ id: `model:assistant:${assistant.seq}`, kind: 'model', label: '模型', time: start });
      }
      if (snapshot.partial && snapshot.partial.turn === turn && !requestSteps.has(snapshot.partial.step)) {
        const start = snapshot.partial.timing && Number.isFinite(snapshot.partial.timing.stepStartTime)
          ? snapshot.partial.timing.stepStartTime
          : baseline;
        events.push({ id: `model:partial:${turn}:${snapshot.partial.step}`, kind: 'model', label: '模型', time: start });
      }

      const assistantCallIds = new Set();
      for (const assistant of assistants) {
        for (const block of assistant.blocks || []) {
          if (block.kind === 'tool-call') assistantCallIds.add(block.callId);
        }
      }
      if (snapshot.partial && snapshot.partial.turn === turn) {
        for (const block of snapshot.partial.blocks || []) {
          if (block.kind === 'tool-call') assistantCallIds.add(block.callId);
        }
      }

      const toolById = new Map();
      for (const node of locatedNodes) {
        if (node.kind !== 'tool-result') continue;
        const flattened = [];
        flattenTool(node, flattened);
        for (const call of flattened) toolById.set(call.callId, call);
      }
      for (const root of snapshot.runningCalls || []) {
        if (root.turn !== turn && !assistantCallIds.has(root.callId)) continue;
        const flattened = [];
        flattenTool(root, flattened);
        for (const call of flattened) {
          if (!toolById.has(call.callId)) toolById.set(call.callId, call);
        }
      }

      const tools = [...toolById.values()].map((call) => ({
        id: `tool:${call.callId}`,
        kind: toolKind(call.name || (call.call && call.call.name)),
        name: call.name || (call.call && call.call.name) || '工具',
        count: resultCount(call.content),
        time: Number.isFinite(call.callTime) ? call.callTime : call.time,
      })).filter((tool) => Number.isFinite(tool.time));
      for (const tool of tools) events.push(tool);

      const eventRank = { receive: 0, model: 1, search: 2, read: 3, tool: 4 };
      events.sort((left, right) => left.time - right.time
        || (eventRank[left.kind] ?? 9) - (eventRank[right.kind] ?? 9)
        || left.id.localeCompare(right.id));
      // Receipt is the semantic start of the loop even when durable event
      // timestamps in the same opening batch arrive a few milliseconds out of
      // order. Keep it fixed at the head instead of sorting it with work.
      const stages = [{
        id: `user:${user ? user.seq : turn}`,
        kind: 'receive',
        label: '接收问题',
        time: baseline,
        count: 0,
        calls: 0,
      }];
      for (const event of events) {
        const previous = stages.at(-1);
        if (event.kind === 'model' && previous && previous.kind === 'model') continue;
        if ((event.kind === 'search' || event.kind === 'read' || event.kind === 'tool')
          && previous && previous.kind === event.kind) {
          previous.calls += 1;
          previous.count += event.count === null ? 1 : event.count;
          previous.label = toolLabel(previous.kind, previous.count, previous.name);
          continue;
        }
        const count = event.count === undefined || event.count === null ? 1 : event.count;
        stages.push({
          id: event.id,
          kind: event.kind,
          name: event.name,
          label: event.kind === 'search' || event.kind === 'read' || event.kind === 'tool'
            ? toolLabel(event.kind, count, event.name)
            : event.label,
          time: event.time,
          count,
          calls: 1,
        });
      }

      const location = turnLocation(snapshot, turn);
      const complete = !!location && location.status === 'closed';
      const completedAt = complete && location.end && Number.isFinite(location.end.time)
        ? location.end.time
        : null;
      stages.push({
        id: `complete:${turn}`,
        kind: 'complete',
        label: '完成',
        time: completedAt,
        count: 0,
        calls: 0,
      });

      const currentIndex = complete ? -1 : Math.max(0, stages.length - 2);
      return stages.map((stage, index) => ({
        ...stage,
        elapsed: Number.isFinite(stage.time) ? Math.max(0, stage.time - baseline) : null,
        state: complete || index < currentIndex
          ? 'done'
          : index === currentIndex ? 'current' : 'pending',
      }));
    }

    function formatElapsed(milliseconds) {
      if (!Number.isFinite(milliseconds)) return '';
      return `${Math.round(milliseconds / 1000)}s`;
    }

    function Stage({ stage }) {
      return h(
        'div',
        {
          className: 'dsh-loop-trajectory__stage',
          'data-kind': stage.kind,
          'data-state': stage.state,
          title: stage.label,
        },
        h(
          'div',
          { className: 'dsh-loop-trajectory__label' },
          h('span', { className: 'dsh-loop-trajectory__marker', 'aria-hidden': 'true' }, stage.kind === 'complete' ? '✓' : null),
          h('span', null, stage.label),
        ),
        h('div', { className: 'dsh-loop-trajectory__time' }, formatElapsed(stage.elapsed)),
      );
    }

    function LoopTrajectoryView({ useTrajectory }) {
      const snapshot = useTrajectory((value) => value);
      const stages = React.useMemo(() => deriveStages(snapshot), [snapshot]);
      const children = [];
      for (const [index, stage] of stages.entries()) {
        if (index > 0) {
          children.push(h('div', { className: 'dsh-loop-trajectory__arrow', key: `arrow:${stage.id}`, 'aria-hidden': 'true' }, '→'));
        }
        children.push(h(Stage, { stage, key: stage.id }));
      }
      return h(
        'div',
        { className: 'dsh-loop-trajectory' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'div',
          { className: 'dsh-loop-trajectory__canvas' },
          stages.length > 0
            ? h('div', { className: 'dsh-loop-trajectory__line', role: 'list', 'aria-label': 'Agent Loop 轨迹' }, children)
            : h('div', { className: 'dsh-loop-trajectory__empty' }, '发送一个问题后，这里会显示默认 Loop。'),
        ),
      );
    }

    function registerVersionLog(ctx) {
      ctx.effect(() => {
        const descriptor = {
          id: '@local/loop-trajectory',
          title: { zh: 'Loop 轨迹', en: 'Loop trajectory' },
          noteTitle: { zh: 'Loop 轨迹版本记录', en: 'Loop trajectory version log' },
          version: VERSION,
          entries: [
            {
              version: '1.0.1',
              at: '2026-10-27T20:07+08:00',
              source: 'external',
              sourceName: 'Codex',
              points: {
                zh: ['修复：同一启动批次的事件时间略有交错时，「接收问题」仍固定显示为 Loop 的第一步'],
                en: ['Fixed: question receipt remains the first Loop stage when timestamps in the opening event batch overlap slightly'],
              },
            },
            {
              version: '1.0.0',
              at: '2026-10-27T20:05+08:00',
              source: 'external',
              sourceName: 'Codex',
              points: {
                zh: [
                  '新增：基于官方 ui-trajectory 的 useTrajectory Session 投影，显示最新一轮默认 Agent Loop',
                  '新增：用一条横向轨迹呈现接收问题、模型请求、搜索/读取工具与完成时间，不修改 Loop 本身',
                  '新增：搜索与读取结果按官方工具记录聚合数量，运行中的节点与完成节点有独立状态',
                ],
                en: [
                  'New: uses the official ui-trajectory useTrajectory Session projection to show the latest default Agent Loop turn',
                  'New: renders question receipt, model requests, search/read tools and completion timing in one horizontal path without changing the Loop',
                  'New: aggregates search/read result counts from official tool records and distinguishes running from completed stages',
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
        if (!handled && typeof window.__dshPluginVersionLogSink === 'function') {
          window.__dshPluginVersionLogSink(descriptor);
          handled = true;
        }
        if (!handled) {
          const queue = window.__dshPluginVersionLogQueue || (window.__dshPluginVersionLogQueue = []);
          queue.push(descriptor);
        }
      }, 'loop-trajectory-version-log');
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        registerVersionLog(ctx);
        ctx.slots.inject('conversation.view', () =>
          ctx.slots.register(
            {
              name: 'conversation.view',
              id: VIEW_ID,
              order: 9,
              label: () => 'Loop 轨迹',
            },
            LoopTrajectoryView,
          ),
        );
      },
    };
  },
});
