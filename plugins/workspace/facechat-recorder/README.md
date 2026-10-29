# 面聊录音 / Face-to-face Recorder

A Harness Web UI plugin for recording a face-to-face conversation and turning it
into a **near-real-time transcript that separates speakers by voice**.

It adds a **面聊 / Facechat** icon to the sidebar panel list; the page itself is
titled **面聊录音 / Face-to-face Recorder**. Selecting the icon opens a
full-width recorder page in the main column.

## What it does

- **One-click conversation recording** from the browser microphone. A live
  level meter and timer show the capture state.
- **Near-real-time transcription**: an energy VAD cuts speech into utterances;
  while someone is talking, a partial caption is refreshed about every 1.5 s,
  and the final sentence is transcribed as soon as the speaker pauses. Long
  monologues are force-split at 12 s so every recognition request stays inside
  the speech service limits.
- **Automatic speaker separation (话者分离)**: each utterance gets an acoustic
  embedding (mean MFCCs plus a weighted pitch and spectral-centroid term) and is
  clustered online into up to six speakers. The transcript shows a colored
  speaker chip per line.
- **Speaker names and corrections**: rename speakers in the left panel; click a
  line's speaker chip to move that line to another speaker or add a new one.
  When the automatic split is too fine, each speaker row can be merged into
  another speaker without losing the transcript.
- **Technical-term glossary (术语表)**: built-in corrections for common
  misrecognitions of GitHub, benchmark, DeepSeek, Deep Research, API, LLM and
  similar terms, plus per-browser custom rules written as
  `wrong spelling=correct term`. Corrections apply to every later transcript and
  rewrite the open recording when saved.
- **Recognition-language guidance**: when speech mixes Chinese and English and
  the language is Automatic, the page offers a one-click switch to Chinese,
  which reduces proper-noun errors.
- **Identity-aware summary**: switch between the full transcript and a summary
  that preserves who contributed each key point, groups highlights by speaker,
  shows speaking share, and extracts possible decisions or next steps. Renaming
  a speaker or reassigning a line refreshes the summary immediately.
- **Recording history** in this browser: finished recordings keep their lines,
  speaker names, duration and title. Old recordings can be reopened, renamed,
  exported or deleted.
- **Device resource Provider**: the plugin registers itself with the unified
  device-side resource interface (`resource-api`) as the source `facechat`, so
  other plugins can search and read the stored transcripts through one API.
- **Model preparation** directly in the page: when the local SenseVoice model
  has not been downloaded yet, the panel shows disk/memory/time estimates, a
  download-source choice (Hugging Face / HF-Mirror), progress and cancellation.
- **Export**: copy or download the transcript as Markdown, and download the
  meeting audio (WebM/M4A/OGG as captured) while the page still holds it.
- **Crash-safe draft**: final transcript lines are written to a local draft as
  they arrive; if the page is reloaded mid-recording the panel offers to restore
  the unfinished transcript.
- English and Chinese UI following the Harness locale; light and dark themes via
  `--dsw-alias-*` tokens only.

## Dependency: the Harness speech service

The plugin does not bundle its own ASR model. It calls the `speech` Remote that
the shipped **voice-input bundle** (`@deepseek-ai/dsh-experimental-voice-input-bundle`)
mounts, and uses whichever provider that service selects — by default the local
SenseVoiceSmall ONNX model, running on the machine that runs Harness.

Consequences:

- First use requires downloading the local model (about 239 MB INT8). The panel
  drives that download itself; settings are shared with the voice-input plugin.
- Audio never leaves the Harness machine for a `host-local` provider and is
  never written into the conversation log or attachments. Only the transcript
  the user keeps is stored, in this browser's `localStorage`.
- Only complete-recording transcription is exposed by that service, so the
  “real time” here is chunked near-real-time (partial captions during speech and
  a final line at each pause), not a streaming token feed.

## Install

```text
plugin_manager({ action: "install_bundle", target: "<absolute path to this directory>" })
```

The bundle inserts one Host row (`facechat-recorder`, host half empty) and serves
`client.js` as the Client artifact. Removing the bundle removes the page, its
sidebar entry, the history view and the engine.

## Version log

The **Notes** plugin keeps a **面聊录音版本记录 / Face-to-face Recorder version
log** note for this bundle. This plugin registers its release list from
`client.js` on every load; the Notes panel creates the note the first time and
appends any release that is missing, so a normal version bump needs no manual
note editing.

To log a release, prepend its entry to the registration descriptor in
`client.js` (`entries[]`, with `version`, minute-precise `at`, and `source`),
then bump the descriptor's `version` and `package.json`. The note itself lives in
the browser's `dsh.notes.v1` storage, owned by the Notes plugin; this plugin
keeps no separate copy.

Attribution is declared here, so it must match whoever made the edit:
`source: 'harness'` means DeepSeek Harness itself; an external agent sets
`source: 'external'` **and** `sourceName` (for example `'Codex'`) — the heading
always shows that name in parentheses, `外部 Agent（Codex）` /
`External agent (Codex)`. Using the agent's own label as `source` (for example
`'codex'`) is also accepted as that name. Without a name the heading says
`外部 Agent（未署名）`, and a name added by hand to a heading is kept by later
re-syncs. Never use the harness value for an external edit.

## Files

| File | Purpose |
| --- | --- |
| `package.json` | Bundle manifest: patch pointer, Client artifact, locale/icon exports |
| `cordis.patch.yml` | Loader patch inserting the `facechat-recorder` row |
| `index.js` | Host half — empty `apply()`; the UI lives in the Client half |
| `client.js` | VAD, MFCC/pitch embedding, online speaker clustering, glossary correction, capture engine, transcription queue, history/draft storage, version-log registration and views |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.svg` | Original microphone artwork |
| `test/dsp.test.mjs` | Headless WAV/FFT/pitch/VAD/embedding/clustering and glossary-rule checks against the shipped module |
| `test/plugin.test.mjs` | Headless apply/slot-registration/locale/bridge lifecycle check |
| `test/render.test.mjs` | Headless page, glossary-dialog and summary render smoke test |
| `test/resource.test.mjs` | Headless check of the `facechat` resource Provider (registration, search, read, labels) |

Run the checks with:

```text
node test/dsp.test.mjs
node test/plugin.test.mjs
node test/render.test.mjs
node test/resource.test.mjs
```

## Device resource Provider

The plugin owns the recordings in `dsh.facechat.v1`, so it registers a
Provider with the unified device-side resource interface (`@local/resource-api`)
under the source id `facechat`. The registry only calls the Provider; it never
reads this plugin's storage, and the Provider reads the recordings through the
same `loadHistoryState()` reader the page uses.

- `search({ query, timeRange, offset, limit })` matches the query
  case-insensitively against the recording title, the speaker names and the
  transcript lines, filters by `createdAt` and returns the matches newest
  first, each as `{ id, title, snippet, updatedAt, createdAt, meta }` with
  `meta = { durationMs, language, speakers }`. A recording without a title
  falls back to its date.
- `read({ ids })` accepts a session id or the aggregate selector `all` and
  returns `{ id, title, text, updatedAt, createdAt, itemType: 'facechat',
  attributes: { created_at }, meta: { durationMs, speakers } }`. The text is the
  transcript as plain text, one line per utterance, prefixed with the elapsed
  timestamp and the speaker: `[00:12] 张三: 我们开始吧`. A speaker without a
  name is rendered as 话者 1 / Speaker 1.
- `labels` and `describe(locale)` describe the source to a consumer without
  knowing what a recording is.

## How it works

1. `createCapture` acquires the selected microphone, runs an `AudioContext` at
   16 kHz (falling back to a linear resampler when the platform insists on its
   own rate), and feeds 128 ms blocks from a `ScriptProcessorNode`. A parallel
   `MediaRecorder` keeps the audio file for download.
2. `createVadSegmenter` tracks a rolling noise floor, detects speech onsets with
   hysteresis, keeps a 360 ms pre-roll, and closes an utterance after 640 ms of
   silence (or at 12 s). It emits start/progress/end events with timestamps.
3. On the end event, `extractEmbedding` computes 12 mean MFCCs, a log-pitch term
   and a spectral-centroid term; `createSpeakerClusterer` assigns the utterance
   to an existing centroid or opens a new speaker. The utterance is appended to
   the transcript as a pending line.
4. `createTranscriptionQueue` encodes canonical 16 kHz mono PCM16 WAV, base64
   encodes it and calls `speech.transcribe`. Finals are FIFO and never dropped;
   interim captions are best-effort and skipped while a final is pending.
5. Results are cleaned of SenseVoice rich-text tokens, run through the glossary
   (built-in terms plus the user's `wrong=correct` rules), and rendered; speaker
   names and line reassignments update the live draft and, after stopping, the
   browser history. The summary is derived from the corrected transcript, so
   identity, attribution and speaking-share statistics stay in sync.

## Improving recognition accuracy

The shipped recognizer is the compact SenseVoiceSmall model. It is fast and
offline, but it mangles technical proper nouns in Chinese/English code-switching
speech. Practical improvements, in order of effect:

1. **Set the recognition language explicitly.** Leave Automatic only for unknown
   languages; for Chinese/English meetings choose 中文. Automatic language
   detection is the main source of errors in mixed-language sentences.
2. **Add the terms you actually say** to 术语表, for example
   `gethub=GitHub`, `bench mark=benchmark`, `deepreek=DeepSeek`, `内部平台=内部平台`.
   The built-in list already covers GitHub, benchmark, DeepSeek, DeepSeek-R1/V3,
   Deep Research, API, LLM, RAG, prompt, fine-tune, inference and friends.
3. **Use the bigger SenseVoice weights.** The provider supports them, but it is
   a Host-side setting: in the profile patch, set `precision: fp32` on the
   `speech-to-text-sensevoice` row (about 938 MB instead of 239 MB, slower on
   CPU), then restart. This is a general accuracy/speed trade-off, not a fix for
   domain vocabulary.
4. **Keep the microphone between the speakers** and avoid strong noise
   suppression or far-field pickup; the panel already keeps a 360 ms pre-roll and
   a 640 ms pause before it closes a sentence.

There is no cloud fallback in the shipped voice-input bundle: audio stays local.
If a higher-accuracy cloud recognizer is added to the speech provider list later,
this plugin will use it through the same service without UI changes.

## Known limitations

- Diarization is a lightweight acoustic heuristic, not a DNN speaker-embedding
  model. Two similar voices — especially same-gender speakers with overlapping
  pitch and formants — can occasionally be split or merged; use the per-line
  speaker menu, the rename fields and the per-speaker merge control to correct a
  transcript.
- The glossary is deterministic: it can fix known variants and anything you add
  as a rule, but it cannot invent the right spelling for an unknown term. Add the
  mistakes you actually see to 术语表; use the built-in list as a starting point.
- The transcript is near-real-time with roughly 1.5 s caption latency plus the
  time the local model needs to recognize a chunk.
- Only the browser holding the Harness page records; closing the page or
  disabling the plugin stops capture. Finished audio is not persisted and is
  lost on refresh (the transcript is kept).
- The page needs a working microphone permission and a loopback/HTTPS origin
  (the Harness Web UI already is one).
- If the voice-input bundle is disabled, the page stays visible but records
  nothing and explains that the speech service is unavailable.
