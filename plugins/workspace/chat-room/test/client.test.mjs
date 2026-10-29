/**
 * Tests for the parts of the client half that are pure logic.
 *
 * The client is a browser module, so it is evaluated with the loader stub and
 * the symbols it asks for; only the pieces that need no DOM are exercised.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function loadClient() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const registrations = [];
  const style = { textContent: '', dataset: {}, id: '' };
  const window = {
    __ModuleLoader__: { load: (registration) => registrations.push(registration) },
    EventSource: function EventSourceStub() {},
    setTimeout,
    clearTimeout,
    location: { reload() {} },
  };
  const document = {
    getElementById: () => null,
    createElement: () => style,
    head: { appendChild() {} },
    querySelector: () => null,
  };
  new Function('window', 'document', source)(window, document);
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    Fragment: 'fragment',
  };
  return registrations[0].factory((specifier) => {
    if (specifier === 'react') return React;
    throw new Error('unexpected require: ' + specifier);
  });
}

test('the client half loads and exposes a plugin', () => {
  const plugin = loadClient();
  assert.deepEqual(plugin.inject, ['slots', 'locale']);
  assert.equal(typeof plugin.apply, 'function');
});

test('a pasted picture is picked out of the clipboard', () => {
  const { pickPastedImage } = loadClient().__test;
  const file = { type: 'image/png', size: 120, name: 'shot.png' };
  const image = pickPastedImage([
    { kind: 'string', type: 'text/plain', getAsFile: () => null },
    { kind: 'file', type: 'image/png', getAsFile: () => file },
  ]);
  assert.equal(image, file);
});

test('a text paste is left to the editor', () => {
  const { pickPastedImage } = loadClient().__test;
  assert.equal(pickPastedImage([{ kind: 'string', type: 'text/plain' }]), null);
  assert.equal(pickPastedImage([]), null);
  assert.equal(pickPastedImage(null), null);
  // A dropped list works the same way, and a non-picture file is refused.
  assert.equal(pickPastedImage([{ type: 'application/pdf', name: 'a.pdf' }]), null);
  const photo = { type: 'image/jpeg', size: 5, name: 'a.jpg' };
  assert.equal(pickPastedImage([photo]), photo);
});

test('unread labels use locale string templates and never take down the sidebar', () => {
  const { formatUnreadTitle, localeWords } = loadClient().__test;
  assert.equal(typeof localeWords.zh.unreadTitle, 'string');
  assert.equal(typeof localeWords.en.unreadTitle, 'string');

  const translate = (key, params) => {
    assert.equal(key, 'unreadTitle');
    assert.deepEqual(params, { count: '3' });
    return localeWords.zh.unreadTitle.replace('{count}', params.count);
  };
  assert.equal(formatUnreadTitle(translate, 3), '3 条新消息');
  assert.equal(
    formatUnreadTitle(() => {
      throw new TypeError('template.replace is not a function');
    }, 2),
    '2 unread',
  );
});

test('pinned conversations sort first and notes to myself stay on top', () => {
  const { sortContacts } = loadClient().__test;
  const contacts = [
    { id: 'recent', lastMessage: { at: 400 }, createdAt: 1 },
    { id: 'older', lastMessage: { at: 100 }, createdAt: 2 },
    { id: 'pinned-old', pinned: true, lastMessage: { at: 200 }, createdAt: 3 },
    { id: 'pinned-new', pinned: true, lastMessage: { at: 300 }, createdAt: 4 },
    { id: 'me', self: true, lastMessage: { at: 50 }, createdAt: 5 },
  ];
  assert.deepEqual(
    sortContacts(contacts).map((contact) => contact.id),
    ['me', 'pinned-new', 'pinned-old', 'recent', 'older'],
  );
  // Sorting never reorders the input in place.
  assert.deepEqual(
    contacts.map((contact) => contact.id),
    ['recent', 'older', 'pinned-old', 'pinned-new', 'me'],
  );
});
