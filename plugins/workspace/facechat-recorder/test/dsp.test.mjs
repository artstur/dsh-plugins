/**
 * Headless checks for the face-to-face recorder's capture-independent half.
 *
 * The browser module is loaded through a tiny shim that captures the factory,
 * then the exported `__dsp` helpers are exercised directly. This verifies the
 * exact shipped client.js — no duplicated DSP implementation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

let loaded = null;
const windowShim = {
  __DSH_FACECHAT_TEST__: true,
  __ModuleLoader__: {
    load(options) {
      loaded = options;
    },
  },
};

const ReactStub = {
  createElement: () => null,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  Fragment: 'Fragment',
};

const requireStub = (name) => {
  if (name === 'react') return ReactStub;
  throw new Error('unexpected require: ' + name);
};

new Function('window', source)(windowShim);
assert.ok(loaded && typeof loaded.factory === 'function', 'module loader registration exists');
assert.equal(loaded.id, '@local/facechat-recorder', 'module id matches the package name');

const plugin = loaded.factory(requireStub);
assert.ok(plugin && typeof plugin.apply === 'function', 'plugin exports apply');
assert.ok(Array.isArray(plugin.inject), 'plugin declares injected services');
assert.ok(plugin.__dsp, 'test surface exposed');

const dsp = plugin.__dsp;
const SR = dsp.TARGET_RATE;
let checks = 0;
function ok(name) {
  checks += 1;
  console.log('ok ' + checks + ' - ' + name);
}

/* ------------------------------------------------------------------ *
 * WAV / base64
 * ------------------------------------------------------------------ */

function sine(freq, seconds, amplitude = 0.4) {
  const length = Math.floor(SR * seconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR);
  return samples;
}

const waveSamples = sine(440, 0.25, 0.5);
const wave = dsp.encodeWave(waveSamples);
assert.equal(wave.length, 44 + waveSamples.length * 2, 'WAV length');
assert.equal(String.fromCharCode(...wave.subarray(0, 4)), 'RIFF');
assert.equal(String.fromCharCode(...wave.subarray(8, 12)), 'WAVE');
assert.equal(String.fromCharCode(...wave.subarray(12, 16)), 'fmt ');
const view = new DataView(wave.buffer);
assert.equal(view.getUint32(24, true), SR, 'WAV sample rate');
assert.equal(view.getUint16(22, true), 1, 'WAV mono');
assert.equal(view.getUint16(34, true), 16, 'WAV 16-bit');
assert.equal(view.getUint32(40, true), waveSamples.length * 2, 'WAV data length');
const firstSample = view.getInt16(44, true);
assert.equal(firstSample, Math.round(waveSamples[0] * (waveSamples[0] < 0 ? 32768 : 32767)));
ok('canonical 16 kHz mono PCM16 WAV');

const b64 = dsp.audioBase64(wave);
assert.ok(/^[A-Za-z0-9+/]+=*$/.test(b64), 'base64 alphabet');
assert.equal(Buffer.from(b64, 'base64').length, wave.length, 'base64 round trip length');
ok('canonical base64 encoding');

/* ------------------------------------------------------------------ *
 * FFT
 * ------------------------------------------------------------------ */

const fftSize = 1024;
const bin = 64;
const re = new Float64Array(fftSize);
const im = new Float64Array(fftSize);
for (let i = 0; i < fftSize; i++) re[i] = Math.cos((2 * Math.PI * bin * i) / fftSize);
dsp.fft(re, im);
let peakBin = 1;
let peak = 0;
for (let i = 1; i < fftSize / 2; i++) {
  const power = re[i] * re[i] + im[i] * im[i];
  if (power > peak) {
    peak = power;
    peakBin = i;
  }
}
assert.equal(peakBin, bin, 'FFT peak lands on the input bin');
ok('radix-2 FFT (peak at expected bin)');

/* ------------------------------------------------------------------ *
 * Pitch
 * ------------------------------------------------------------------ */

for (const freq of [110, 165, 245]) {
  const f0 = dsp.estimatePitch(sine(freq, 0.06, 0.4), 0);
  assert.ok(Math.abs(f0 - freq) / freq < 0.04, `pitch ${freq} got ${f0.toFixed(1)}`);
}
ok('autocorrelation pitch tracking (110/165/245 Hz)');

/* ------------------------------------------------------------------ *
 * Speaker embeddings and clustering
 * ------------------------------------------------------------------ */

function synthesiseVoice({ f0, formants, seconds = 1.6, seed = 1 }) {
  const length = Math.floor(SR * seconds);
  const out = new Float32Array(length);
  let state = seed * 7919;
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const phases = Array.from({ length: 40 }, () => random() * Math.PI * 2);
  for (let i = 0; i < length; i++) {
    const time = i / SR;
    let sample = 0;
    for (let k = 1; k <= 40; k++) {
      const frequency = k * f0;
      if (frequency > SR / 2 - 200) break;
      let amplitude = 0.06 / Math.sqrt(k);
      for (const [center, bandwidth] of formants) {
        const distance = (frequency - center) / bandwidth;
        amplitude += (0.5 / k) * Math.exp(-distance * distance);
      }
      sample += amplitude * Math.sin(2 * Math.PI * frequency * time + phases[k - 1]);
    }
    const envelope = 0.35 + 0.65 * Math.min(1, Math.min(time / 0.15, (seconds - time) / 0.2));
    out[i] = sample * envelope + (random() - 0.5) * 0.002;
  }
  return out;
}

const voiceA = synthesiseVoice({ f0: 112, formants: [[650, 140], [1150, 180], [2450, 260]], seed: 3 });
const voiceB = synthesiseVoice({ f0: 205, formants: [[420, 150], [2050, 220], [2950, 300]], seed: 9 });

const embeddingA1 = dsp.extractEmbedding(voiceA.subarray(0, Math.floor(SR * 1.2)));
const embeddingA2 = dsp.extractEmbedding(voiceA.subarray(Math.floor(SR * 0.2), Math.floor(SR * 1.5)));
const embeddingB1 = dsp.extractEmbedding(voiceB.subarray(0, Math.floor(SR * 1.2)));
assert.ok(embeddingA1 && embeddingB1, 'embeddings produced');

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb + 1e-12);
}
const sameSpeaker = cosine(embeddingA1.vector, embeddingA2.vector);
const differentSpeaker = cosine(embeddingA1.vector, embeddingB1.vector);
console.log('   same-speaker cosine=' + sameSpeaker.toFixed(3) + ', cross-speaker cosine=' + differentSpeaker.toFixed(3));
assert.ok(sameSpeaker > differentSpeaker + 0.08, 'same speaker is closer than different speakers');
assert.ok(Math.abs(embeddingA1.f0 - 112) < 8, 'mean f0 of voice A');
assert.ok(Math.abs(embeddingB1.f0 - 205) < 10, 'mean f0 of voice B');
ok('MFCC + pitch embedding separates two synthetic voices');

const clusterer = dsp.createSpeakerClusterer({});
const labels = [
  clusterer.assign(embeddingA1, 1500),
  clusterer.assign(embeddingB1, 1500),
  clusterer.assign(embeddingA2, 1500),
  clusterer.assign(embeddingB1, 1500),
  clusterer.assign(embeddingA1, 1500),
];
assert.equal(labels[0], labels[2], 'A utterances share a speaker');
assert.equal(labels[0], labels[4], 'later A utterance stays with A');
assert.equal(labels[1], labels[3], 'B utterances share a speaker');
assert.notEqual(labels[0], labels[1], 'A and B are different speakers');
ok('online speaker clustering labels A/B/A/B/A correctly');

const shortA = dsp.extractEmbedding(voiceA.subarray(0, Math.floor(SR * 0.35)));
assert.ok(shortA, 'short embedding produced');
const shortLabel = clusterer.assign(shortA, 300);
assert.equal(shortLabel, labels[0], 'a short utterance prefers the previous speaker');
ok('short-utterance continuity avoids speaker flapping');

/* ------------------------------------------------------------------ *
 * VAD
 * ------------------------------------------------------------------ */

function noise(seconds, amplitude, seed = 1) {
  const length = Math.floor(SR * seconds);
  const out = new Float32Array(length);
  let state = seed * 104729;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = ((state / 0x7fffffff) * 2 - 1) * amplitude;
  }
  return out;
}

const speech = synthesiseVoice({ f0: 180, formants: [[700, 160], [1300, 200]], seconds: 1.4, seed: 5 });
const stream = new Float32Array(SR * 3.6);
stream.set(noise(1.0, 0.002, 2), 0);
stream.set(speech, SR * 1.0);
stream.set(noise(1.2, 0.002, 4), SR * (1.0 + 1.4));

const events = [];
const vad = dsp.createVadSegmenter((event) => events.push(event));
// Feed in 128 ms capture-sized blocks, like the ScriptProcessor callback.
for (let offset = 0; offset < stream.length; offset += 2048) {
  vad.push(stream.slice(offset, offset + 2048));
}
const starts = events.filter((event) => event.type === 'start');
const ends = events.filter((event) => event.type === 'end');
assert.equal(starts.length, 1, 'one speech start');
assert.equal(ends.length, 1, 'one speech end');
assert.ok(ends[0].durationMs >= 1200 && ends[0].durationMs <= 2200, 'utterance duration ' + ends[0].durationMs);
assert.ok(ends[0].startMs >= 400 && ends[0].startMs <= 900, 'pre-roll start ' + ends[0].startMs);
const vadEmbedding = dsp.extractEmbedding(ends[0].samples);
assert.ok(vadEmbedding, 'embedding from the VAD utterance');
ok('energy VAD cuts one utterance with pre-roll and keeps silence out');

/* Long speech must be force-split so ASR requests stay bounded. */
const longSpeech = synthesiseVoice({ f0: 150, formants: [[650, 150], [1200, 200]], seconds: 13, seed: 7 });
const longStream = new Float32Array(longSpeech.length + SR);
longStream.set(longSpeech, 0);
longStream.set(noise(1.0, 0.002, 11), longSpeech.length);
const longEvents = [];
const longVad = dsp.createVadSegmenter((event) => longEvents.push(event));
for (let offset = 0; offset < longStream.length; offset += 2048) {
  longVad.push(longStream.slice(offset, offset + 2048));
}
const longEnds = longEvents.filter((event) => event.type === 'end');
assert.ok(longEnds.length >= 2, '13 s of speech is split into multiple bounded chunks');
assert.ok(longEnds[0].durationMs <= 12200, 'first chunk is bounded');
assert.ok(longEnds[longEnds.length - 1].samples.length > 0, 'tail chunk carries audio');
ok('VAD bounds long monologues (' + longEnds.length + ' chunks)');

/* ------------------------------------------------------------------ *
 * Transcript cleanup
 * ------------------------------------------------------------------ */

assert.equal(
  dsp.cleanTranscript('<|zh|><|NEUTRAL|><|Speech|><|woitn|>  你好， 世界 <|endoftext|>'),
  '你好， 世界',
);
ok('SenseVoice rich-text tokens are stripped from transcripts');

/* ------------------------------------------------------------------ *
 * Glossary-based term correction
 * ------------------------------------------------------------------ */

const refine = dsp.createTranscriptRefiner('', true);
assert.equal(
  refine('我在 githh 上看到 bench mark 和 ventnch mark'),
  '我在 GitHub 上看到 benchmark 和 benchmark',
);
assert.equal(refine('用github做'), '用GitHub做');
assert.equal(refine('deep seek r1 和 deepre'), 'DeepSeek-R1 和 DeepSeek');
assert.equal(refine('bench mark'), 'benchmark');
assert.equal(refine('会被 get up 屏蔽，winnch mark 和 deepre'), '会被 GitHub 屏蔽，benchmark 和 DeepSeek');
assert.equal(refine('<|zh|>api 的 token'), 'API 的 token');
ok('built-in glossary fixes GitHub / benchmark / DeepSeek next to Chinese text');

const userRefine = dsp.createTranscriptRefiner('gethub=GitHub\n内部平台=内部平台', true);
assert.equal(userRefine('gethub 和 内部平台'), 'GitHub 和 内部平台');
assert.equal(dsp.createTranscriptRefiner('gethub=GitHub', false)('gethub'), 'gethub');
ok('user glossary rules apply and can be disabled');

/* ------------------------------------------------------------------ *
 * Speaker merge correction
 * ------------------------------------------------------------------ */

const mergeClusterer = dsp.createSpeakerClusterer({ threshold: 0.5 });
const firstSpeaker = mergeClusterer.assign(embeddingA1, 1500);
const secondSpeaker = mergeClusterer.assign(embeddingB1, 1500);
assert.notEqual(firstSpeaker, secondSpeaker, 'two speakers discovered before merge');
mergeClusterer.merge(secondSpeaker, firstSpeaker);
assert.equal(mergeClusterer.speakerCount(), 1, 'merge removes one centroid');
assert.equal(firstSpeaker, 0, 'first speaker is the merge target');
assert.equal(mergeClusterer.assign(embeddingA1, 1500), firstSpeaker, 'after merge, utterances stay on the target index');
ok('speaker merge folds one centroid into another');

assert.equal(dsp.extractEmbedding(new Float32Array(SR)), null);
ok('silent audio yields no embedding');

console.log('\nAll ' + checks + ' checks passed.');
