import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const sdkRoot = new URL('../node_modules/@earendil-works/pi-coding-agent/dist/', import.meta.url);
const sdk = await import(new URL('index.js', sdkRoot));
const { loadExtensions } = await import(new URL('core/extensions/loader.js', sdkRoot));

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-compact-'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  const bus = sdk.createEventBus();
  t.after(() => {
    bus.clear();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let reserve = 700_000;
  const retry = { enabled: false, maxRetries: 0, baseDelayMs: 1 };
  t.mock.method(sdk.SettingsManager, 'create', () => ({ getCompactionReserveTokens: () => reserve, getRetrySettings: () => retry }));
  const source = fileURLToPath(new URL('../agent/extensions/compact-checkpoints.ts', import.meta.url));
  const loaded = await loadExtensions([source], root, bus);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.equal(loaded.extensions[0].path, source);
  const handlers = loaded.extensions[0].handlers;
  for (const event of ['session_start', 'turn_end', 'session_before_compact', 'session_compact']) assert.equal(handlers.get(event).length, 1);
  const statuses = new Map();
  const styles = [];
  const notices = [];
  let tokens = 146_076;
  const ctx = {
    mode: 'tui', hasUI: true, cwd: root, thinkingLevel: 'medium', isProjectTrusted: () => false,
    model: { provider: 'xingchiapi', id: 'gpt-6.1-sol', api: 'openai-responses', reasoning: true, contextWindow: 1_000_000 },
    getContextUsage: () => ({ contextWindow: 1_000_000, tokens }),
    sessionManager: { getSessionId: () => 'test-session', getSessionFile: () => path.join(dir, 'session.jsonl'), getBranch: () => [] },
    ui: {
      theme: { fg: (color, text) => { styles.push([color, text]); return text; } },
      setStatus: (key, text) => statuses.set(key, text),
      notify: (message) => notices.push(message),
    },
  };
  const event = (name, value = {}, context = ctx) => handlers.get(name)[0](value, context);
  return { dir, bus, ctx, notices, styles, event, status: () => statuses.get('compact-checkpoints'),
    setTokens: (next) => { tokens = next; }, setReserve: (next) => { reserve = next; } };
}

test('packaged compact footer preserves threshold, unknown usage and non-TUI behavior', async (t) => {
  const h = await fixture(t);
  h.event('turn_end');
  assert.equal(h.status(), 'Compact 30% · ~153.9k left');
  assert.deepEqual(h.styles.at(-1), ['muted', '~153.9k left']);
  for (const [tokens, expected] of [[299_999, '~2 left'], [300_000, '~1 left'], [300_001, 'over threshold'], [null, 'usage unknown']]) {
    h.setTokens(tokens); h.event('turn_end');
    assert.equal(h.status(), `Compact 30% · ${expected}`);
  }
  const before = h.status();
  h.event('turn_end', {}, { ...h.ctx, mode: 'rpc' });
  assert.equal(h.status(), before);
  h.setReserve(699_999); h.event('turn_end');
  assert.equal(h.status(), undefined);
  h.setReserve(700_000);
  h.event('model_select', {}, { ...h.ctx, model: { ...h.ctx.model, provider: 'other' } });
  assert.equal(h.status(), undefined);
});

test('compact publishes a scoped snapshot and restores fallback when dock releases ownership', async (t) => {
  const h = await fixture(t);
  const snapshots = [];
  h.bus.on('pi-pulse:telemetry:v1', (value) => snapshots.push(value));
  h.event('session_start');
  assert.equal(h.status(), 'Compact 30% · ~153.9k left');
  assert.deepEqual(snapshots.at(-1), { kind: 'compact', scope: 'test-session:xingchiapi/gpt-6.1-sol', data: { tokens: 146_076, limit: 300_000, contextWindow: 1_000_000 } });
  h.bus.emit('pi-pulse:telemetry-dock:v1', { available: true });
  assert.equal(h.status(), undefined);
  h.bus.emit('pi-pulse:telemetry-request:v1', {});
  assert.equal(snapshots.at(-1).data.tokens, 146_076);
  h.bus.emit('pi-pulse:telemetry-dock:v1', { available: false });
  assert.equal(h.status(), 'Compact 30% · ~153.9k left');
  h.event('session_shutdown');
  const count = snapshots.length;
  h.bus.emit('pi-pulse:telemetry-request:v1', {});
  h.bus.emit('pi-pulse:telemetry-dock:v1', { available: true });
  assert.equal(snapshots.length, count);
  assert.equal(h.status(), undefined);
});

test('packaged handoff uses one summary request and preserves checkpoint location, permissions and idempotence', async (t) => {
  const h = await fixture(t);
  const skill = path.join(h.dir, 'skills', 'handoff', 'SKILL.md');
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, 'Preserve the unfinished task and next steps.');
  const calls = [];
  h.ctx.modelRegistry = { streamSimple: (model, context, options) => {
    calls.push({ model, context, options });
    return { result: async () => ({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '# Saved handoff\nContinue the pending task.' }], usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }) };
  } };
  const preparation = {
    settings: { reserveTokens: 700_000 }, firstKeptEntryId: 'kept-entry', tokensBefore: 300_001, isSplitTurn: true,
    messagesToSummarize: [{ role: 'user', content: 'Original pending task', timestamp: 1 }],
    turnPrefixMessages: [{ role: 'user', content: 'Latest task constraint', timestamp: 2 }],
    fileOps: { read: new Set(['/private/not-for-handoff']), written: new Set(), edited: new Set() },
  };
  const signal = new AbortController().signal;
  const result = await h.event('session_before_compact', { preparation, signal, customInstructions: 'Keep the current branch.' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.reasoning, 'medium');
  assert.equal(calls[0].options.signal, signal);
  const prompt = JSON.stringify(calls[0].context);
  assert.ok(prompt.includes('Original pending task') && prompt.includes('Latest task constraint') && prompt.includes('Keep the current branch.'));
  assert.deepEqual(result.compaction.details, { handoff: true });
  assert.equal(result.compaction.firstKeptEntryId, 'kept-entry');
  assert.ok(!result.compaction.summary.includes('/private/not-for-handoff'));
  const entry = { ...result.compaction, type: 'compaction', id: 'compact-entry', timestamp: '2026-11-26T00:00:00Z' };
  h.ctx.sessionManager.getBranch = () => [entry];
  await h.event('session_compact', { fromExtension: true, compactionEntry: entry, reason: 'threshold' });
  const checkpoint = path.join(h.dir, 'compact-checkpoints', 'test-session', 'compact-entry.md');
  const saved = fs.readFileSync(checkpoint, 'utf8');
  assert.ok(saved.includes('# Saved handoff') && saved.includes('300001 tokens before compact'));
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(checkpoint).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(checkpoint)).mode & 0o777, 0o700);
  }
  entry.summary = 'Do not overwrite the checkpoint';
  await h.event('session_compact', { fromExtension: true, compactionEntry: entry, reason: 'threshold' });
  assert.equal(fs.readFileSync(checkpoint, 'utf8'), saved);
  const skipped = await h.event('session_before_compact', { preparation: { ...preparation, settings: { reserveTokens: 600_000 } }, signal });
  assert.equal(skipped, undefined);
  assert.equal(calls.length, 1);
  fs.unlinkSync(skill);
  assert.equal(await h.event('session_before_compact', { preparation, signal }), undefined);
  assert.equal(calls.length, 1);
  assert.match(h.notices.at(-1), /Handoff unavailable/);
});
