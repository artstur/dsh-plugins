import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTACT_CODE_PREFIX,
  PLUGIN_VERSION,
  compareVersions,
  defaultNick,
  isAmbiguousName,
  isManifestSpec,
  MAX_QUOTE_TEXT,
  normalizeImage,
  normalizeQuote,
  isPlaceholderName,
  normalizeUpdateSpec,
  updateSpecName,
  DEFAULT_RELAY,
  ENVELOPE_VERSION,
  MAX_NAME,
  MAX_ENVELOPE_BYTES,
  MAX_TEXT,
  SseParser,
  createEnvelope,
  createRoom,
  decodeContactCode,
  decodeRoomCode,
  encodeContactCode,
  encodeRoomCode,
  isValidRoom,
  normalizeName,
  normalizeRelay,
  parseEnvelope,
  serializeEnvelope,
  shortRoom,
} from '../protocol.js';

test('normalizeRelay accepts http(s) bases and rejects everything else', () => {
  assert.equal(normalizeRelay('https://ntfy.sh/'), 'https://ntfy.sh');
  assert.equal(normalizeRelay('  http://127.0.0.1:8080 '), 'http://127.0.0.1:8080');
  assert.equal(normalizeRelay('https://host.example/base/'), 'https://host.example/base');
  assert.equal(normalizeRelay('ftp://ntfy.sh'), null);
  assert.equal(normalizeRelay('ntfy.sh'), null);
  assert.equal(normalizeRelay('https://ntfy.sh/?x=1'), null);
  assert.equal(normalizeRelay(''), null);
  assert.equal(normalizeRelay(null), null);
});

test('room topics obey relay rules', () => {
  assert.equal(isValidRoom('dshchat-0123456789abcdef'), true);
  assert.equal(isValidRoom('a_b-c'), true);
  assert.equal(isValidRoom('has space'), false);
  assert.equal(isValidRoom('x'.repeat(65)), false);
  assert.equal(isValidRoom(''), false);
  assert.equal(isValidRoom('emoji😀'), false);
});

test('createRoom is legal, random, and prefixed', () => {
  const first = createRoom();
  const second = createRoom();
  assert.match(first, /^dshchat-[0-9a-f]{16}$/);
  assert.equal(isValidRoom(first), true);
  assert.notEqual(first, second);
});

test('room code round-trips relay and topic', () => {
  const code = encodeRoomCode({ relay: 'https://ntfy.sh/', room: 'dshchat-abcdef0123456789' });
  assert.match(code, /^DSHCHAT1:[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeRoomCode(code), {
    relay: 'https://ntfy.sh',
    room: 'dshchat-abcdef0123456789',
  });
});

test('room code tolerates surrounding prose and rejects broken input', () => {
  const code = encodeRoomCode({ relay: 'https://relay.example', room: 'room-1' });
  assert.deepEqual(decodeRoomCode('房间码：' + code), {
    relay: 'https://relay.example',
    room: 'room-1',
  });
  assert.equal(decodeRoomCode('DSHCHAT1:not-base64-json'), null);
  assert.equal(decodeRoomCode(''), null);
  assert.equal(decodeRoomCode(null), null);
  assert.equal(decodeRoomCode(42), null);
});

test('default relay is an http(s) base', () => {
  assert.equal(normalizeRelay(DEFAULT_RELAY), DEFAULT_RELAY);
});

test('envelopes round-trip and clamp user text', () => {
  const envelope = createEnvelope({
    id: 'm1',
    from: '小明',
    fromId: 'peer-1',
    text: 'hello',
    at: 1730000000000,
  });
  assert.equal(envelope.v, ENVELOPE_VERSION);
  const parsed = parseEnvelope(serializeEnvelope(envelope));
  const { v, ...rest } = envelope;
  assert.equal(v, ENVELOPE_VERSION);
  assert.deepEqual(parsed, rest);

  const long = createEnvelope({ id: 'm2', from: '', fromId: '', text: 'x'.repeat(MAX_TEXT + 50), at: 1 });
  assert.equal(long.text.length, MAX_TEXT);
});

test('parseEnvelope ignores foreign relay traffic', () => {
  assert.equal(parseEnvelope('not json'), null);
  assert.equal(parseEnvelope(JSON.stringify({ v: 2, id: 'x', text: 'hi' })), null);
  assert.equal(parseEnvelope(JSON.stringify({ v: 1, id: '', text: 'hi' })), null);
  assert.equal(parseEnvelope(JSON.stringify({ v: 1, id: 'a' })), null);
  assert.equal(parseEnvelope(JSON.stringify([1, 2, 3])), null);
});

test('serializeEnvelope refuses bodies above the relay cap', () => {
  const body = serializeEnvelope(
    createEnvelope({ id: 'big', from: 'n', fromId: 'i', text: 'y'.repeat(MAX_TEXT), at: 1 }),
  );
  assert.equal(typeof body, 'string');
  assert.ok(Buffer.byteLength(body) < MAX_ENVELOPE_BYTES);

  const hostile = serializeEnvelope(
    createEnvelope({ id: 'big', from: 'n', fromId: 'i', text: '😀'.repeat(MAX_TEXT), at: 1 }),
  );
  // Four-byte characters can exceed the relay body cap and are refused instead
  // of being truncated into invalid JSON.
  assert.equal(hostile, null);
});

test('SseParser emits complete events across chunk boundaries', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push('event: open\ndata: {}\n'), []);
  assert.deepEqual(parser.push('\n'), [{ event: 'open', data: '{}' }]);

  const events = parser.push(
    ': keepalive\r\n\r\nevent: message\r\ndata: {"a":1}\r\n\r\nevent: message\ndata: line1\ndata: line2\n\n',
  );
  assert.deepEqual(events, [
    { event: 'message', data: '{"a":1}' },
    { event: 'message', data: 'line1\nline2' },
  ]);
});

test('SseParser survives a torn frame without losing the next one', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push('data: {"partial":'), []);
  assert.deepEqual(parser.push(' true}\n\n'), [{ event: 'message', data: '{"partial": true}' }]);
});

test('shortRoom renders the tail for the header chip', () => {
  assert.equal(shortRoom('dshchat-0123456789abcdef'), 'CDEF');
  assert.equal(shortRoom('nope'), 'NOPE');
  assert.equal(shortRoom('bad room'), '');
});

test('contact card round-trips relay, topic and display name', () => {
  const card = encodeContactCode({
    relay: 'https://ntfy.sh/',
    room: 'dshchat-0123456789abcdef',
    name: '小明',
  });
  assert.match(card, new RegExp('^' + CONTACT_CODE_PREFIX + '[A-Za-z0-9_-]+$'));
  assert.deepEqual(decodeContactCode(card), {
    relay: 'https://ntfy.sh',
    room: 'dshchat-0123456789abcdef',
    name: '小明',
    update: '',
  });
});

test('contact card tolerates a blank name and surrounding prose', () => {
  const card = encodeContactCode({ relay: 'https://relay.example', room: 'room-1', name: '' });
  assert.deepEqual(decodeContactCode('我的名片：' + card), {
    relay: 'https://relay.example',
    room: 'room-1',
    name: '',
    update: '',
  });
});

test('an older room-only code still adds a contact (no name)', () => {
  const legacy = encodeRoomCode({ relay: 'https://ntfy.sh', room: 'dshchat-legacy' });
  assert.deepEqual(decodeContactCode(legacy), {
    relay: 'https://ntfy.sh',
    room: 'dshchat-legacy',
    name: '',
    update: '',
  });
});

test('contact card rejects broken or foreign input', () => {
  assert.equal(decodeContactCode('DSHCHAT2:not-base64-json'), null);
  assert.equal(decodeContactCode('hello'), null);
  assert.equal(decodeContactCode(''), null);
  assert.equal(decodeContactCode(null), null);
  assert.equal(decodeContactCode(42), null);
});

test('display names are trimmed, collapsed and length-capped', () => {
  assert.equal(normalizeName('  小  明  '), '小 明');
  assert.equal(normalizeName('x'.repeat(MAX_NAME + 20)).length, MAX_NAME);
  assert.equal(normalizeName('   '), '');
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(7), '');
});

test('envelopes carry the sender inbox so a stranger can be answered', () => {
  const envelope = createEnvelope({
    id: 'm9',
    from: '小红',
    fromId: 'peer-9',
    fromInbox: 'dshchat-0123456789abcdef',
    text: 'first contact',
    at: 1730000000000,
  });
  assert.equal(envelope.fromInbox, 'dshchat-0123456789abcdef');
  const parsed = parseEnvelope(serializeEnvelope(envelope));
  assert.equal(parsed.fromInbox, 'dshchat-0123456789abcdef');
});

test('an invalid sender inbox is dropped instead of trusted', () => {
  const envelope = createEnvelope({
    id: 'm10',
    from: 'x',
    fromId: 'y',
    fromInbox: 'not a topic',
    text: 'hi',
    at: 1,
  });
  assert.equal(envelope.fromInbox, '');
  assert.equal(parseEnvelope(JSON.stringify({ v: 1, id: 'a', text: 'b', fromInbox: 'bad topic' })).fromInbox, '');
});

test('every install gets its own default display name', () => {
  const first = defaultNick('6dbbdf8f-aaaa-bbbb-cccc-ddddeeeeffff');
  const second = defaultNick('2a42aab6-aaaa-bbbb-cccc-ddddeeeeffff');
  assert.match(first, /^用户-[0-9a-f]{4}$/);
  assert.notEqual(first, second);
  assert.equal(defaultNick(''), '用户-0000');
});

test('the old shared default is ambiguous, the generated one is only generic', () => {
  assert.equal(isAmbiguousName('我'), true);
  assert.equal(isAmbiguousName('小明'), false);
  assert.equal(isAmbiguousName('用户-6dbb'), false);

  assert.equal(isPlaceholderName(''), true);
  assert.equal(isPlaceholderName('我'), true);
  assert.equal(isPlaceholderName('用户-6dbb'), true);
  assert.equal(isPlaceholderName('小明'), false);
});

test('a ping envelope announces a contact without carrying a message', () => {
  const ping = createEnvelope({
    id: 'p1',
    from: '小红',
    fromId: 'peer-2',
    fromInbox: 'dshchat-0123456789abcdef',
    text: '',
    at: 1730000000000,
    kind: 'ping',
  });
  assert.equal(ping.kind, 'ping');
  assert.equal(ping.text, '');
  const parsed = parseEnvelope(serializeEnvelope(ping));
  assert.equal(parsed.kind, 'ping');
  assert.equal(parsed.fromInbox, 'dshchat-0123456789abcdef');

  const text = createEnvelope({ id: 'p2', from: 'x', fromId: 'y', text: 'hi', at: 1 });
  assert.equal(text.kind, 'text');
  assert.equal(parseEnvelope(serializeEnvelope(text)).kind, 'text');
});

test('a contact code can carry where new versions are published', () => {
  const card = encodeContactCode({
    relay: 'https://ntfy.sh',
    room: 'dshchat-0123456789abcdef',
    name: '小明',
    update: 'dsh-chat-room',
  });
  const decoded = decodeContactCode(card);
  assert.equal(decoded.update, 'dsh-chat-room');
  // A code without an update source still decodes, with nothing to update from.
  const plain = decodeContactCode(
    encodeContactCode({ relay: 'https://ntfy.sh', room: 'room-2', name: '' }),
  );
  assert.equal(plain.update, '');
});

test('only registry specs and manifest addresses are accepted as an update source', () => {
  assert.equal(normalizeUpdateSpec('dsh-chat-room'), 'dsh-chat-room');
  assert.equal(normalizeUpdateSpec('@scope/dsh-chat-room'), '@scope/dsh-chat-room');
  assert.equal(normalizeUpdateSpec('dsh-chat-room@1.2.3'), 'dsh-chat-room@1.2.3');
  // Untrusted input: paths and git addresses are refused.
  assert.equal(normalizeUpdateSpec('/tmp/evil'), '');
  assert.equal(normalizeUpdateSpec('git+ssh://git@evil.example/repo'), '');
  assert.equal(normalizeUpdateSpec('-rf'), '');
  assert.equal(normalizeUpdateSpec('  '), '');
  assert.equal(updateSpecName('dsh-chat-room@1.2.3'), 'dsh-chat-room');
  assert.equal(updateSpecName('@scope/pkg@2.0.0'), '@scope/pkg');
  // A release manifest may be addressed directly, but only over https.
  assert.equal(
    normalizeUpdateSpec('https://example.test/release.json'),
    'https://example.test/release.json',
  );
  assert.equal(normalizeUpdateSpec('http://example.test/release.json'), '');
  assert.equal(isManifestSpec('https://example.test/release.json'), true);
  assert.equal(isManifestSpec('dsh-chat-room'), false);
  // A manifest has no package name to compare against.
  assert.equal(updateSpecName('https://example.test/release.json'), '');
});

test('versions compare the way a registry would order them', () => {
  assert.equal(compareVersions('1.4.0', '1.3.9'), 1);
  assert.equal(compareVersions('1.4.0', '1.4.0'), 0);
  assert.equal(compareVersions('1.3.0', '1.4.0'), -1);
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
});

test('PLUGIN_VERSION matches the package version', async () => {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  assert.equal(PLUGIN_VERSION, JSON.parse(raw).version);
});

test('a quote travels with the message and is capped', () => {
  const envelope = createEnvelope({
    id: 'm1',
    from: '用户-6dbb',
    text: '收到',
    quote: { id: 'q1', name: '🐷', text: 'x'.repeat(500) },
  });
  assert.equal(envelope.quote.id, 'q1');
  assert.equal(envelope.quote.name, '🐷');
  assert.equal(envelope.quote.text.length, MAX_QUOTE_TEXT);
  const back = parseEnvelope(JSON.stringify(envelope));
  assert.equal(back.quote.id, 'q1');
  assert.equal(back.quote.text.length, MAX_QUOTE_TEXT);
  // A quote without an id points at nothing.
  assert.equal(normalizeQuote({ name: 'a', text: 'b' }), null);
  assert.equal(normalizeQuote(null), null);
  assert.equal(createEnvelope({ id: 'm2', from: 'x', text: 'y', quote: {} }).quote, undefined);
});

test('a picture may travel without a caption', () => {
  const envelope = createEnvelope({
    id: 'm3',
    from: '用户-6dbb',
    text: '',
    image: { name: 'p.png', type: 'image/png', size: 1234 },
  });
  assert.equal(envelope.image.type, 'image/png');
  const back = parseEnvelope(JSON.stringify(envelope));
  assert.deepEqual(back.image, { name: 'p.png', type: 'image/png', size: 1234 });
  // Only real picture types are allowed through.
  assert.equal(normalizeImage({ type: 'text/html' }), null);
  assert.equal(normalizeImage({ type: 'image/png', size: -5 }).size, 0);
  assert.equal(parseEnvelope(JSON.stringify({ v: 1, id: 'x', text: '' })), null);
});
