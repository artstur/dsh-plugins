/**
 * The notification helpers of the Host half.
 *
 * They build one short AppleScript and hand it to `osascript`; the escaping
 * and preview logic is pure, so it is tested here without showing a banner.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appleScriptText,
  buildNotificationScript,
  notificationPreview,
  shouldNotifyMessage,
} from '../index.js';

test('appleScriptText flattens control characters and escapes the literal', () => {
  assert.equal(appleScriptText('  hi\nthere\r\n  '), 'hi there');
  assert.equal(appleScriptText('say "hi"'), 'say \\"hi\\"');
  assert.equal(appleScriptText('C:\\path'), 'C:\\\\path');
  assert.equal(appleScriptText(null), '');
  assert.equal(appleScriptText(undefined), '');
});

test('notificationPreview collapses whitespace and clips long text', () => {
  assert.equal(notificationPreview({ text: '  hello\n\n  world  ' }), 'hello world');
  assert.equal(notificationPreview({ text: '', image: { type: 'image/png' } }), '📷');
  assert.equal(notificationPreview({ text: '' }), '');
  assert.equal(notificationPreview(null), '');
  const long = notificationPreview({ text: 'x'.repeat(500) });
  assert.equal(long.length, 180);
  assert.ok(long.endsWith('…'));
});

test('buildNotificationScript keeps a message inside one string literal', () => {
  const script = buildNotificationScript({
    title: '小明',
    subtitle: '消息',
    body: '他说："有空吗？"',
  });
  assert.equal(
    script,
    'display notification "他说：\\"有空吗？\\"" with title "小明" subtitle "消息"',
  );
  assert.equal(buildNotificationScript({ title: 'x', body: '' }), '');
});

test('shouldNotifyMessage only banners real incoming messages on macOS', () => {
  const peer = { name: '小明', self: false };
  const message = { text: 'hi', mine: false };
  assert.equal(shouldNotifyMessage({ platform: 'darwin', contact: peer, message }), true);
  // Off the macOS desktop, and with the setting off, nothing is pushed.
  assert.equal(shouldNotifyMessage({ platform: 'linux', contact: peer, message }), false);
  assert.equal(
    shouldNotifyMessage({ platform: 'darwin', notify: false, contact: peer, message }),
    false,
  );
  // My own sends and the conversation with myself are not news.
  assert.equal(
    shouldNotifyMessage({ platform: 'darwin', contact: peer, message: { text: 'hi', mine: true } }),
    false,
  );
  assert.equal(
    shouldNotifyMessage({
      platform: 'darwin',
      contact: { name: '我聊', self: true },
      message,
    }),
    false,
  );
  // A message with nothing to preview is skipped instead of showing an empty banner.
  assert.equal(
    shouldNotifyMessage({ platform: 'darwin', contact: peer, message: { text: '' } }),
    false,
  );
  // A picture without a caption still gets a banner.
  assert.equal(
    shouldNotifyMessage({
      platform: 'darwin',
      contact: peer,
      message: { text: '', image: { type: 'image/png' } },
    }),
    true,
  );
});
