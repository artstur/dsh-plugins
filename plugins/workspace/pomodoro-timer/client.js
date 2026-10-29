/**
 * Pomodoro timer — Client half.
 *
 * Renders an ambient timer bar below the message composer
 * (`conversation.composer.dock`). The countdown is anchored to an end
 * timestamp, so a throttled background tab cannot make it drift. All timer
 * state lives in this module: it is ambient UI state, never session data.
 */
window.__ModuleLoader__.load({
  id: '@local/pomodoro-timer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'pomodoro';
    const MINUTE = 60 * 1000;
    const DURATIONS = { focus: 25 * MINUTE, short: 5 * MINUTE, long: 15 * MINUTE };
    const ROUNDS_PER_LONG_BREAK = 4;

    const DICTS = {
      en: {
        timer: 'Pomodoro timer',
        focus: 'Focus',
        short: 'Short break',
        long: 'Long break',
        start: 'Start',
        pause: 'Pause',
        reset: 'Reset',
        skip: 'Skip',
      },
      zh: {
        timer: '番茄钟',
        focus: '专注',
        short: '短休息',
        long: '长休息',
        start: '开始',
        pause: '暂停',
        reset: '重置',
        skip: '跳过',
      },
    };

    const TOKENS = {
      surface: 'var(--dsw-alias-bg-layer-1)',
      raised: 'var(--dsw-alias-bg-layer-2)',
      line: 'var(--dsw-alias-border-l1)',
      lineStrong: 'var(--dsw-alias-border-l2)',
      label: 'var(--dsw-alias-label-primary)',
      subtle: 'var(--dsw-alias-label-secondary)',
      accent: 'var(--dsw-alias-brand-primary)',
      breakAccent: 'var(--dsw-alias-state-success-primary)',
    };

    /* ------------------------------------------------------------------ *
     * Chime when a phase ends. The AudioContext is created lazily on the
     * first Start click, so the browser's autoplay policy allows it.
     * ------------------------------------------------------------------ */

    let audio = null;

    function ensureAudio() {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        if (!audio) audio = new Ctor();
        if (audio.state === 'suspended') audio.resume().catch(() => {});
      } catch (err) {
        audio = null;
      }
    }

    function chime() {
      if (!audio || audio.state !== 'running') return;
      try {
        const at = audio.currentTime;
        [0, 0.2].forEach((offset, index) => {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = 'sine';
          osc.frequency.value = index === 0 ? 784 : 1046.5;
          gain.gain.setValueAtTime(0.0001, at + offset);
          gain.gain.exponentialRampToValueAtTime(0.18, at + offset + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.18);
          osc.connect(gain);
          gain.connect(audio.destination);
          osc.start(at + offset);
          osc.stop(at + offset + 0.2);
        });
      } catch (err) {
        /* the chime is a nicety, never a failure */
      }
    }

    function disposeAudio() {
      if (!audio) return;
      try {
        audio.close().catch(() => {});
      } catch (err) {
        /* ignore */
      }
      audio = null;
    }

    /* ------------------------------------------------------------------ *
     * Countdown engine. A tiny store: state changes notify subscribers,
     * and the interval that drives it is owned by the plugin effect below.
     * ------------------------------------------------------------------ */

    function createEngine() {
      let phase = 'focus';
      let running = false;
      let endsAt = 0;
      let remaining = DURATIONS.focus;
      let completed = 0; // focus sessions since the last long break
      const listeners = new Set();

      function current() {
        return running ? Math.max(0, endsAt - Date.now()) : remaining;
      }

      function snapshot() {
        return { phase, running, remaining: current(), completed };
      }

      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch (err) {
            /* one faulty view must not stop the others */
          }
        }
      }

      function subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }

      function nextPhase() {
        if (phase !== 'focus') return 'focus';
        return completed > 0 && completed % ROUNDS_PER_LONG_BREAK === 0 ? 'long' : 'short';
      }

      function complete() {
        const finished = phase;
        if (finished === 'focus') completed += 1;
        phase = nextPhase();
        running = false;
        endsAt = 0;
        remaining = DURATIONS[phase];
        if (finished === 'long') completed = 0;
        emit();
        chime();
      }

      function tick() {
        if (!running) return;
        if (endsAt - Date.now() <= 0) {
          complete();
          return;
        }
        emit();
      }

      function toggle() {
        if (running) {
          remaining = current();
          running = false;
          endsAt = 0;
        } else {
          const left = current();
          remaining = left > 0 ? left : DURATIONS[phase];
          running = true;
          endsAt = Date.now() + remaining;
          ensureAudio();
        }
        emit();
      }

      function reset() {
        running = false;
        endsAt = 0;
        remaining = DURATIONS[phase];
        emit();
      }

      function skip() {
        const finished = phase;
        phase = nextPhase();
        running = false;
        endsAt = 0;
        remaining = DURATIONS[phase];
        if (finished === 'long') completed = 0;
        emit();
      }

      return { snapshot, subscribe, tick, toggle, reset, skip };
    }

    const engine = createEngine();

    function formatRemaining(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    /* ------------------------------------------------------------------ *
     * Styles: theme tokens only, so light/dark switching is inherited.
     * ------------------------------------------------------------------ */

    const dockStyle = {
      display: 'flex',
      justifyContent: 'center',
      width: '100%',
      padding: '2px 0',
      fontFamily: 'inherit',
    };

    const barStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
      padding: '3px 8px 3px 10px',
      border: '1px solid ' + TOKENS.line,
      borderRadius: 999,
      background: TOKENS.surface,
      color: TOKENS.subtle,
      fontSize: 12,
      lineHeight: '18px',
      fontVariantNumeric: 'tabular-nums',
    };

    const clockStyle = {
      color: TOKENS.label,
      fontWeight: 600,
      minWidth: 42,
      textAlign: 'center',
      letterSpacing: '0.3px',
    };

    const phaseStyle = {
      color: TOKENS.subtle,
      whiteSpace: 'nowrap',
    };

    const trackStyle = {
      position: 'relative',
      width: 64,
      height: 3,
      borderRadius: 999,
      background: TOKENS.lineStrong,
      overflow: 'hidden',
      flex: '0 0 auto',
    };

    const fillStyle = {
      display: 'block',
      height: '100%',
      borderRadius: 999,
      transition: 'width 0.45s linear',
    };

    const dotsStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
    };

    const ghostButtonStyle = {
      border: '1px solid transparent',
      borderRadius: 999,
      background: 'transparent',
      color: TOKENS.subtle,
      padding: '2px 7px',
      fontFamily: 'inherit',
      fontSize: 12,
      lineHeight: '18px',
      cursor: 'pointer',
    };

    const ghostHoverStyle = {
      background: TOKENS.raised,
      borderColor: TOKENS.line,
      color: TOKENS.label,
    };

    const primaryButtonStyle = {
      border: '1px solid ' + TOKENS.lineStrong,
      borderRadius: 999,
      background: TOKENS.raised,
      color: TOKENS.label,
      padding: '2px 10px',
      fontFamily: 'inherit',
      fontSize: 12,
      lineHeight: '18px',
      fontWeight: 500,
      cursor: 'pointer',
    };

    const primaryHoverStyle = {
      borderColor: TOKENS.accent,
    };

    /* ------------------------------------------------------------------ *
     * View
     * ------------------------------------------------------------------ */

    function ControlButton(props) {
      const [hovered, setHovered] = React.useState(false);
      const base = props.primary ? primaryButtonStyle : ghostButtonStyle;
      const hover = props.primary ? primaryHoverStyle : ghostHoverStyle;
      return h(
        'button',
        {
          type: 'button',
          title: props.label,
          'aria-label': props.label,
          onClick: props.onClick,
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
          onFocus: () => setHovered(true),
          onBlur: () => setHovered(false),
          style: hovered ? Object.assign({}, base, hover) : base,
        },
        props.label,
      );
    }

    function PomodoroBar(props) {
      const t = props.t;
      const [snap, setSnap] = React.useState(() => engine.snapshot());
      const [, setLocaleRevision] = React.useState(0);

      React.useEffect(() => engine.subscribe(() => setSnap(engine.snapshot())), []);
      React.useEffect(
        () => props.locale.subscribe(() => setLocaleRevision((revision) => revision + 1)),
        [props.locale],
      );

      const accent = snap.phase === 'focus' ? TOKENS.accent : TOKENS.breakAccent;
      const duration = DURATIONS[snap.phase];
      const progress = Math.min(1, Math.max(0, 1 - snap.remaining / duration));
      const passed =
        snap.completed === 0
          ? 0
          : snap.completed % ROUNDS_PER_LONG_BREAK || ROUNDS_PER_LONG_BREAK;
      const clock = formatRemaining(snap.remaining);

      return h(
        'div',
        { style: dockStyle },
        h(
          'div',
          {
            role: 'group',
            'aria-label': t('timer') + ' — ' + t(snap.phase) + ' ' + clock,
            style: barStyle,
          },
          h('span', {
            'aria-hidden': true,
            style: {
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent,
              flex: '0 0 auto',
            },
          }),
          h('span', { role: 'timer', style: clockStyle }, clock),
          h('span', { style: phaseStyle }, t(snap.phase)),
          h(
            'span',
            { 'aria-hidden': true, style: trackStyle },
            h('span', {
              style: Object.assign({}, fillStyle, {
                width: (progress * 100).toFixed(1) + '%',
                background: accent,
              }),
            }),
          ),
          h(
            'span',
            { 'aria-hidden': true, style: dotsStyle },
            [0, 1, 2, 3].map((index) =>
              h('span', {
                key: index,
                style: {
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: index < passed ? accent : TOKENS.lineStrong,
                },
              }),
            ),
          ),
          h(ControlButton, {
            label: t(snap.running ? 'pause' : 'start'),
            primary: true,
            onClick: engine.toggle,
          }),
          h(ControlButton, { label: t('reset'), onClick: engine.reset }),
          h(ControlButton, { label: t('skip'), onClick: engine.skip }),
        ),
      );
    }

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
            const dict = id.toLowerCase().indexOf('zh') === 0 ? DICTS.zh : DICTS.en;
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
        }, 'pomodoro-locale');

        // Version log: the Notes plugin keeps a release note for this bundle.
        ctx.effect(() => {
          const descriptor = {
            id: '@local/pomodoro-timer',
            title: { zh: '番茄钟', en: 'Pomodoro Timer' },
            noteTitle: { zh: '番茄钟版本记录', en: 'Pomodoro Timer version log' },
            version: '1.0.0',
            entries: [
              {
                version: '1.0.0',
                at: '2026-10-25T00:19+08:00',
                source: 'harness',
                points: {
                  zh: [
                    '首个版本：输入框下方常驻的番茄钟计时条',
                    '25 分钟专注 / 5 分钟短休息 / 15 分钟长休息循环，每 4 轮进入长休息',
                    '开始 / 暂停 / 重置 / 跳过，进度条与轮次圆点显示当前节奏',
                    '阶段结束时用 Web Audio 播放提示音（首次开始后启用）；跟随主题令牌与中英文界面',
                  ],
                  en: [
                    'First release: an ambient pomodoro bar below the message composer',
                    '25-minute focus / 5-minute short break / 15-minute long break cycle with a long break every 4 rounds',
                    'Start / pause / reset / skip, with a progress bar and round dots',
                    'A Web Audio chime at phase changes (enabled after the first start); theme tokens and English/Chinese UI',
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
            const queue = window.__dshPluginVersionLogQueue || (window.__dshPluginVersionLogQueue = []);
            queue.push(descriptor);
          }
        }, 'pomodoro-version-log');

        // Drives the countdown; the engine itself does nothing while paused.
        ctx.effect(() => {
          const timer = setInterval(() => engine.tick(), 500);
          return () => {
            clearInterval(timer);
            disposeAudio();
          };
        }, 'pomodoro-clock');

        const View = (props) => h(PomodoroBar, Object.assign({}, props, { t, locale: ctx.locale }));

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'pomodoro-timer',
              order: 2,
            },
            View,
          ),
        );
      },
    };
  },
});
