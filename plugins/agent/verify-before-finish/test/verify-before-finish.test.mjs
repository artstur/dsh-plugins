import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildVerificationRequest,
  classifyToolCall,
  createTurnState,
  createVerificationMessage,
  DEFAULT_MAX_ROUNDS,
  needsVerification,
  normalizePath,
  resolveOptions,
  samePath,
} from '../index.js';

const options = resolveOptions({});

test('a file write counts as a change', () => {
  const state = createTurnState(1);
  const kind = classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  assert.equal(kind, 'mutation');
  assert.equal(state.lastMutationAt, 0);
  assert.deepEqual(state.changes, [{ path: 'src/a.ts', tool: 'write' }]);
});

test('a check command counts as verification', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  const kind = classifyToolCall(state, { name: 'bash', arguments: { command: 'pnpm test' } }, options);
  assert.equal(kind, 'verification');
  assert.ok(state.lastVerificationAt > state.lastMutationAt);
});

test('a read-only shell command is neither a change nor verification', () => {
  const state = createTurnState(1);
  const kind = classifyToolCall(state, { name: 'bash', arguments: { command: 'ls -la && git status' } }, options);
  assert.equal(kind, 'none');
  assert.equal(state.lastMutationAt, -1);
  assert.equal(state.lastVerificationAt, -1);
});

test('a mutating shell command counts as a change', () => {
  const state = createTurnState(1);
  const kind = classifyToolCall(state, { name: 'bash', arguments: { command: 'rm -rf build' } }, options);
  assert.equal(kind, 'mutation');
});

test('stderr redirection is not mistaken for a change', () => {
  const state = createTurnState(1);
  const kind = classifyToolCall(state, { name: 'bash', arguments: { command: 'pnpm test 2>&1 | tail -20' } }, options);
  assert.equal(kind, 'verification');
});

test('reading a changed file back counts as verification', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  const kind = classifyToolCall(state, { name: 'read', arguments: { file_path: 'src/a.ts' } }, options);
  assert.equal(kind, 'verification');
});

test('reading an untouched file is not verification', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  const kind = classifyToolCall(state, { name: 'read', arguments: { file_path: 'src/b.ts' } }, options);
  assert.equal(kind, 'none');
});

test('a later change invalidates earlier verification', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  classifyToolCall(state, { name: 'bash', arguments: { command: 'npm test' } }, options);
  classifyToolCall(state, { name: 'edit', arguments: { file_path: 'src/a.ts' } }, options);
  assert.ok(needsVerification(state, options));
});

test('a turn without changes never owes verification', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'read', arguments: { file_path: 'README.md' } }, options);
  assert.equal(needsVerification(state, options), false);
});

test('a verified turn may close', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  classifyToolCall(state, { name: 'bash', arguments: { command: 'npm test' } }, options);
  assert.equal(needsVerification(state, options), false);
});

test('the round budget bounds the loop', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  state.rounds = DEFAULT_MAX_ROUNDS;
  assert.equal(needsVerification(state, options), false);
});

test('a model that declines to verify is not asked again', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  state.rounds = 1;
  state.callsSinceSteer = 0;
  assert.equal(needsVerification(state, options), false);
});

test('the disabled option stops the stage', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  assert.equal(needsVerification(state, resolveOptions({ enabled: false })), false);
});

test('paths compare across relative and absolute spellings', () => {
  assert.equal(normalizePath('./src/a.ts'), 'src/a.ts');
  assert.equal(samePath('src/a.ts', '/project/src/a.ts'), true);
  assert.equal(samePath('src/a.ts', 'src/b.ts'), false);
});

test('the request names the files the turn changed', () => {
  const state = createTurnState(1);
  classifyToolCall(state, { name: 'write', arguments: { file_path: 'src/a.ts' } }, options);
  classifyToolCall(state, { name: 'edit', arguments: { file_path: 'src/b.ts' } }, options);
  const text = buildVerificationRequest(state);
  assert.match(text, /src\/a\.ts \(write\)/);
  assert.match(text, /src\/b\.ts \(edit\)/);
});

test('the injected message is an identified user message', () => {
  const message = createVerificationMessage('verify');
  assert.equal(message.role, 'user');
  assert.equal(message.content[0].type, 'text');
  assert.equal(message.content[0].text, 'verify');
  assert.equal(message.source.kind, 'verify-before-finish');
  assert.ok(message.id);
});
