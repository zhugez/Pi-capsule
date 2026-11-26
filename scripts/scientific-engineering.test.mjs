import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { UPSTREAM, configure, compare, loadState, negativeFindings, operate, selectModel, start, validatePlan } from '../agent/extensions/scientific-engineering/engine.ts';

function git(cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function fixture(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-science-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repo'), upstream = path.join(dir, 'upstream'), root = path.join(dir, 'runs');
  for (const p of [repo, upstream]) {
    fs.mkdirSync(p); git(p, 'init', '-q', '-b', 'main');
    git(p, 'config', 'user.name', 'Scientific Tests'); git(p, 'config', 'user.email', 'tests@example.invalid');
    git(p, 'config', 'commit.gpgsign', 'false');
  }
  const put = (cwd, file, text) => { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), text); };
  put(upstream, 'skills/aae/SKILL.md', 'Fixture resource. Not the upstream methodology.\n');
  put(upstream, 'skills/aae/templates/report/build_report.py', 'print("fixture")\n');
  git(upstream, 'add', '.'); git(upstream, 'commit', '-qm', 'fixture resource');
  const revision = git(upstream, 'rev-parse', 'HEAD');
  put(repo, 'target.json', JSON.stringify({ metric: 100, correct: true }));
  put(repo, 'user.txt', 'committed\n');
  put(repo, 'check.mjs', "import fs from 'node:fs';import assert from 'node:assert/strict';const x=JSON.parse(fs.readFileSync('target.json'));assert.equal(x.correct,true);if(x.tamper)fs.appendFileSync('bench.mjs','\\n// tampered');if(x.mutate)fs.writeFileSync('target.json',JSON.stringify({...x,metric:1}));\n");
  put(repo, 'bench.mjs', "import fs from 'node:fs';const x=JSON.parse(fs.readFileSync('target.json'));console.log(JSON.stringify({metric:x.invalid?-1:x.metric}));\n");
  put(repo, 'profile.mjs', "console.log('Synthetic profile: target.json controls work units.');\n");
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'baseline');
  const plan = {
    objective: 'Reduce synthetic work units while preserving correctness', kind: 'experiment',
    constraints: ['correct must remain true'], scope: ['target.json'], protectedFiles: ['check.mjs', 'bench.mjs', 'profile.mjs'],
    correctness: [[process.execPath, 'check.mjs']], benchmark: [process.execPath, 'bench.mjs'], profile: [process.execPath, 'profile.mjs'],
    metric: { name: 'work_units', direction: 'lower' },
    config: { upstreamRevision: revision, maxExperiments: 4, confidence: 0.8, repetitions: 5, warmups: 0, diminishingReturns: 3, runtimeMs: 60000, commandTimeoutMs: 2000, ...overrides },
  };
  let state;
  const init = () => (state = start(root, repo, plan, upstream, configure(), overrides.commitAccepted === true));
  const act = (action, data = {}, signal) => operate(root, state.id, action, data, signal);
  const ready = async () => { init(); await act('baseline'); await act('profile'); return state; };
  const propose = () => act('propose', { hypothesis: 'Reducing work reduces the primary metric without changing output.', prediction: 'At least 10% lower work units.', expectedImprovement: 0.1, evidence: 'The synthetic profile identifies the work counter.' });
  const change = value => put(state.candidate, 'target.json', JSON.stringify({ metric: value, correct: true }));
  const read = () => loadState(root, state.id);
  const reflect = () => act('reflect', { reflection: 'The measured result updates the next hypothesis. See the recorded samples and verdict.' });
  return { dir, repo, root, upstream, revision, plan, put, init, ready, act, propose, change, read, reflect };
}

test('configuration, task scope and exact paired acceptance have explicit boundaries', () => {
  const cfg = configure({ maxExperiments: 4, repetitions: 5, confidence: 0.8 });
  const base = [100, 100, 100, 100, 100];
  assert.equal(compare(base, [80, 80, 80, 80, 80], cfg, 'lower').status, 'keep');
  assert.equal(compare(base, [120, 120, 120, 120, 120], cfg, 'higher').status, 'keep');
  assert.equal(compare(base, base, cfg, 'lower').status, 'discard');
  assert.equal(compare(base, [80, 120, 80, 120, 100], cfg, 'lower').status, 'inconclusive');
  assert.throws(() => compare(base, [80, 80], cfg, 'lower'), /complete/);
  assert.throws(() => compare(base, [0, 80, 80, 80, 80], cfg, 'lower'), /positive/);
  assert.throws(() => compare(Array(5).fill(1e308), Array(5).fill(1e-308), cfg, 'lower'), /numeric range/);
  for (const invalid of [{ repetitions: 1 }, { runtimeMs: -1 }, { tokenBudget: NaN }, { confidence: 1 }, { warmups: -1 }, { unknown: true }, { adapters: { memory: 'exom' } }, { models: { routine: '' } }]) assert.throws(() => configure(invalid));
  assert.equal(configure().commitAccepted, false);
  assert.equal(configure().upstreamRevision, UPSTREAM.revision);
});

test('catalog routing validates exact refs, names and decorated DeepSeek names without invented fallback', () => {
  const models = [{ provider: 'local', id: 'a', name: 'GPT-6.2 Sol' }, { provider: 'other', id: 'b', name: 'HMS · DeepSeek V4.1 Flash Free' }, { provider: 'local', id: 'c', name: 'GPT-6.2 Astra' }];
  assert.equal(selectModel(models, 'local/c'), models[2]);
  assert.equal(selectModel(models, 'GPT-6.2 Sol'), models[0]);
  assert.equal(selectModel(models, 'DeepSeek 4.1 Flash'), models[1]);
  assert.equal(selectModel(models, 'not-installed'), undefined);
  assert.equal(selectModel(models, '---'), undefined);
  assert.equal(selectModel([...models, { provider: 'second', id: 'a', name: 'GPT-6.2 Sol' }], 'GPT-6.2 Sol'), undefined);
  assert.equal(selectModel(models, 'GPT'), undefined);
  assert.throws(() => configure({ models: { routine: '---' } }), /catalog name/);
});

test('one accepted experiment preserves dirty source, index, refs and config; checkpoints without a commit', async t => {
  const f = fixture(t);
  f.put(f.repo, 'user.txt', 'staged user work\n'); git(f.repo, 'add', 'user.txt');
  f.put(f.repo, 'user.txt', 'unstaged user work\n'); f.put(f.repo, 'private.txt', 'untracked user work\n');
  const before = { diff: git(f.repo, 'diff', '--binary'), staged: git(f.repo, 'diff', '--cached', '--binary'), head: git(f.repo, 'rev-parse', 'HEAD'), branch: git(f.repo, 'symbolic-ref', 'HEAD'), config: fs.readFileSync(path.join(f.repo, '.git/config'), 'utf8'), refs: git(f.repo, 'show-ref') };
  await f.ready();
  assert.equal(f.read().sourceDirty, true);
  assert.equal(fs.readFileSync(path.join(f.read().candidate, 'user.txt'), 'utf8'), 'committed\n');
  await f.propose(); f.change(80);
  const result = await f.act('evaluate');
  assert.equal(result.latest.status, 'keep'); assert.equal(result.phase, 'review');
  assert.ok(Math.abs(result.bestMetric - 80) < 1e-8);
  assert.equal(result.bestCommit, before.head);
  git(f.repo, 'apply', '--check', path.join(f.read().dir, 'patches/0001.patch'));
  git(f.repo, 'gc', '--prune=now');
  assert.equal(git(f.repo, 'cat-file', '-t', f.read().bestTree), 'tree');
  assert.equal(git(f.read().candidate, 'rev-parse', 'HEAD'), before.head);
  assert.ok(fs.readFileSync(path.join(f.read().dir, 'patches/0001.patch'), 'utf8').includes('metric'));
  assert.equal(fs.statSync(path.join(f.read().dir, 'state.json')).mode & 0o777, 0o600);
  await assert.rejects(f.propose(), /profile|required|before|hypothesis/i);
  await f.reflect();
  assert.equal(git(f.repo, 'diff', '--binary'), before.diff);
  assert.equal(git(f.repo, 'diff', '--cached', '--binary'), before.staged);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before.head);
  assert.equal(git(f.repo, 'symbolic-ref', 'HEAD'), before.branch);
  assert.equal(fs.readFileSync(path.join(f.repo, '.git/config'), 'utf8'), before.config);
  assert.equal(git(f.repo, 'show-ref').split('\n').filter(line => !line.includes('refs/pi-capsule/scientific/')).join('\n'), before.refs);
  assert.equal(fs.readFileSync(path.join(f.repo, 'private.txt'), 'utf8'), 'untracked user work\n');
  await f.propose(); f.change(90);
  assert.equal((await f.act('evaluate')).latest.status, 'discard');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.read().candidate, 'target.json'))).metric, 80);
  await f.reflect(); await f.act('finish');
  assert.equal(f.read().phase, 'finished');
  assert.equal(negativeFindings(f.root, f.repo).length, 1);
});

test('explicit commit opt-in commits the accepted patch only inside the owned worktree', async t => {
  const f = fixture(t, { commitAccepted: true }); await f.ready(); const head = f.read().sourceHead;
  await f.propose(); f.change(70); const result = await f.act('evaluate');
  assert.equal(result.latest.status, 'keep'); assert.notEqual(result.latest.commit, head);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.read().candidate, 'rev-parse', 'HEAD'), result.latest.commit);
  assert.equal(git(f.read().control, 'rev-parse', 'HEAD'), result.latest.commit);
});

test('correctness failure is discarded and invalid benchmark measurements remain inconclusive', async t => {
  const f = fixture(t); await f.ready(); await f.propose();
  f.put(f.read().candidate, 'target.json', JSON.stringify({ metric: 1, correct: false }));
  assert.equal((await f.act('evaluate')).latest.status, 'discard');
  await f.reflect(); await f.propose();
  f.put(f.read().candidate, 'target.json', JSON.stringify({ metric: 1, correct: true, invalid: true }));
  assert.equal((await f.act('evaluate')).latest.status, 'inconclusive');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.read().candidate, 'target.json'))).metric, 100);
  assert.ok(fs.readFileSync(path.join(f.read().dir, 'findings.jsonl'), 'utf8').includes('inconclusive'));
});

test('evaluator tampering blocks measurement and recovery preserves the rejected evidence', async t => {
  const f = fixture(t); await f.ready(); await f.propose(); f.change(50);
  fs.appendFileSync(path.join(f.read().candidate, 'bench.mjs'), '\nprocess.exit(0);');
  await assert.rejects(f.act('evaluate'), /Protected evaluator/);
  const result = await f.act('recover');
  assert.equal(result.latest.status, 'inconclusive');
  assert.equal(fs.readFileSync(path.join(f.read().candidate, 'bench.mjs'), 'utf8'), fs.readFileSync(path.join(f.repo, 'bench.mjs'), 'utf8'));
  const patches = fs.readdirSync(path.join(f.read().dir, 'recovery'));
  assert.ok(fs.readFileSync(path.join(f.read().dir, 'recovery', patches[0]), 'utf8').includes('process.exit'));
});

test('commands cannot change the evaluated candidate and then receive acceptance', async t => {
  const f = fixture(t); await f.ready(); await f.propose();
  f.put(f.read().candidate, 'target.json', JSON.stringify({ metric: 50, correct: true, mutate: true }));
  await assert.rejects(f.act('evaluate'), /Candidate changed during evaluation/);
  assert.equal(f.read().phase, 'needs_recovery');
  await f.act('recover'); assert.equal(f.read().results.at(-1).status, 'inconclusive');
});

test('evaluation rejects regenerated deleted scope files across command paths', async t => {
  for (const mode of ['correctness', 'failed correctness', 'verification', 'benchmark']) {
    const f = fixture(t);
    f.put(f.repo, 'generated.txt', 'original generated output');
    const regenerate = "if(JSON.parse(fs.readFileSync('target.json')).metric<100)fs.writeFileSync('generated.txt','regenerated output');";
    if (mode === 'verification') f.plan.config.adapters = { verification: [process.execPath, '-e', "const fs=require('fs');" + regenerate], memory: [], telemetry: false };
    else fs.appendFileSync(path.join(f.repo, mode === 'benchmark' ? 'bench.mjs' : 'check.mjs'), regenerate + (mode === 'failed correctness' ? "if(x.metric<100)process.exit(1);" : ''));
    if (mode === 'benchmark') f.plan.config.warmups = 1;
    git(f.repo, 'add', '.'); git(f.repo, 'commit', '-qm', 'generated workload');
    f.plan.scope.push('generated.txt');
    await f.ready(); await f.propose(); f.change(80);
    const before = f.read(); fs.unlinkSync(path.join(before.candidate, 'generated.txt'));
    await assert.rejects(f.act('evaluate'), /Candidate changed during evaluation/, mode);
    assert.equal(f.read().phase, 'needs_recovery');
    assert.equal(f.read().bestTree, before.bestTree);
    assert.equal(f.read().results.length, before.results.length);
    assert.equal(fs.readFileSync(path.join(before.candidate, 'generated.txt'), 'utf8'), 'regenerated output');
    await f.act('recover');
    assert.equal(fs.readFileSync(path.join(before.candidate, 'generated.txt'), 'utf8'), 'original generated output');
    assert.equal(f.read().evaluationTree, undefined);
  }
});

test('integrity rejects untracked control scope files and ignored evaluation additions', async t => {
  for (const mode of ['baseline', 'profile', 'benchmark', 'memory', 'candidate ignored', 'control ignored']) {
    const f = fixture(t);
    f.plan.scope.push('optional.txt');
    if (mode.endsWith('ignored')) f.put(f.repo, '.gitignore', 'optional.txt\n');
    const write = "require('fs').writeFileSync('optional.txt','unexpected input')";
    if (mode === 'baseline') f.plan.correctness.push([process.execPath, '-e', write]);
    if (mode === 'profile') f.plan.profile = [process.execPath, '-e', write];
    if (mode === 'benchmark' || mode === 'control ignored') fs.appendFileSync(path.join(f.repo, 'bench.mjs'), "if(x.metric===100&&process.cwd().endsWith('control')&&fs.existsSync('../trigger'))fs.writeFileSync('optional.txt','unexpected input');");
    if (mode === 'candidate ignored') fs.appendFileSync(path.join(f.repo, 'check.mjs'), "if(x.metric<100)fs.writeFileSync('optional.txt','unexpected input');");
    if (mode === 'memory') f.plan.config.adapters = { verification: [], memory: [process.execPath, '-e', write], telemetry: false };
    git(f.repo, 'add', '.'); git(f.repo, 'commit', '--allow-empty', '-qm', 'generated input workload');
    f.init();
    if (mode !== 'baseline') await f.act('baseline');
    if (!['baseline', 'profile'].includes(mode)) {
      await f.act('profile'); await f.propose(); f.change(80);
      f.put(f.read().dir, 'trigger', 'evaluate');
      if (mode === 'memory') await f.act('evaluate');
    }
    const action = mode === 'baseline' || mode === 'profile' ? mode : mode === 'memory' ? 'reflect' : 'evaluate';
    const error = mode === 'candidate ignored' ? /Candidate changed during evaluation/ : /Control implementation changed/;
    await assert.rejects(action === 'reflect' ? f.reflect() : f.act(action), error, mode);
    if (mode !== 'memory') assert.equal(f.read().results.some(r => r.status === 'keep'), false);
  }
});

test('accepted deletions tolerate unused scope paths and publish the frozen tree', async t => {
  const f = fixture(t);
  f.put(f.repo, 'obsolete.txt', 'remove this scoped file');
  fs.appendFileSync(path.join(f.repo, 'check.mjs'), "if(x.metric<100)fs.writeFileSync('../evaluated-tree.txt',JSON.parse(fs.readFileSync('../state.json')).evaluationTree);");
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-qm', 'optional scope');
  f.plan.scope.push('obsolete.txt', 'unused.txt');
  await f.ready(); await f.propose(); f.change(80);
  fs.unlinkSync(path.join(f.read().candidate, 'obsolete.txt'));
  const result = await f.act('evaluate'), state = f.read();
  assert.equal(result.latest.status, 'keep');
  assert.equal(state.bestTree, fs.readFileSync(path.join(state.dir, 'evaluated-tree.txt'), 'utf8'));
  for (const arm of ['candidate', 'control']) {
    assert.equal(fs.existsSync(path.join(state[arm], 'obsolete.txt')), false);
    assert.equal(fs.existsSync(path.join(state[arm], 'unused.txt')), false);
    assert.equal(git(state[arm], 'write-tree'), state.bestTree);
  }
  const replay = path.join(f.dir, 'replay');
  git(f.repo, 'worktree', 'add', '--detach', replay, state.sourceHead);
  git(replay, 'apply', '--index', path.join(state.dir, result.latest.patch));
  assert.equal(git(replay, 'write-tree'), state.bestTree);
  await f.reflect(); await f.propose(); f.change(60);
  assert.equal((await f.act('evaluate')).latest.status, 'keep');
});

test('failed recovery retries preserve pending bookkeeping until restoration succeeds', async t => {
  const f = fixture(t); await f.ready(); await f.propose(); f.change(80);
  f.put(f.read().candidate, 'build-artifact.txt', 'preserve for inspection');
  const before = f.read();
  for (let retry = 0; retry < 2; retry++) {
    await assert.rejects(f.act('recover'), /Untracked out-of-scope/);
    const state = f.read();
    assert.deepEqual(state.results, before.results);
    assert.deepEqual(state.hypothesis, before.hypothesis);
    assert.equal(state.stopReason, before.stopReason);
    assert.equal(fs.readFileSync(path.join(state.candidate, 'build-artifact.txt'), 'utf8'), 'preserve for inspection');
  }
  fs.unlinkSync(path.join(before.candidate, 'build-artifact.txt'));
  await f.act('recover');
  assert.equal(f.read().results.length, before.results.length + 1);
  assert.equal(f.read().results.at(-1).status, 'inconclusive');
  assert.equal(f.read().hypothesis, undefined);
  assert.equal(f.read().phase, 'ready');
  await f.act('recover');
  assert.equal(f.read().results.length, before.results.length + 1);
  await f.propose(); f.change(70);
  assert.equal((await f.act('evaluate')).latest.status, 'keep');
});

test('lifecycle, limits, idempotent token accounting and missing usage fail closed', async t => {
  const f = fixture(t, { maxExperiments: 1, tokenBudget: 100 }); f.init();
  await assert.rejects(f.propose(), /Baseline and profile/);
  await f.act('usage', { key: 'turn-1', tokens: 60 }); await f.act('usage', { key: 'turn-1', tokens: 60 });
  assert.equal(f.read().tokensUsed, 60);
  await f.act('usage', { key: 'turn-2', tokens: 40 });
  await assert.rejects(f.act('baseline'), /Token budget/);
  const g = fixture(t); g.init(); await g.act('usage', { key: 'unknown' });
  assert.equal(g.read().usageKnown, false); await assert.rejects(g.act('baseline'), /usage is unavailable/);
  const h = fixture(t, { maxExperiments: 1 }); await h.ready(); await h.propose(); h.change(70);
  await h.act('evaluate'); await h.reflect(); await assert.rejects(h.propose(), /Experiment limit/);
  const k = fixture(t, { diminishingReturns: 1 }); await k.ready(); await k.propose(); k.change(101);
  await k.act('evaluate'); await k.reflect(); await assert.rejects(k.propose(), /Diminishing returns/);
});

test('cancelled commands release locks; recovery reconciles a dead owner and an unacknowledged commit', async t => {
  const f = fixture(t, { commitAccepted: true });
  f.plan.profile = [process.execPath, '-e', 'setInterval(()=>{},1000)']; f.init(); await f.act('baseline');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 50);
  await assert.rejects(f.act('profile', {}, controller.signal), /cancelled/); clearTimeout(timer);
  assert.equal(fs.existsSync(path.join(f.read().dir, 'operation.lock')), false);
  await f.act('recover');
  const state = f.read();
  state.phase = 'evaluating'; state.hypothesis = { hypothesis: 'Interrupted', prediction: 'Unknown', evidence: 'crash test', expectedImprovement: 0.1 };
  f.change(40); git(state.candidate, 'add', 'target.json'); git(state.candidate, 'commit', '-qm', 'unacknowledged candidate');
  fs.writeFileSync(path.join(state.dir, 'state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(state.dir, 'operation.lock'), JSON.stringify({ pid: 2147483647 }));
  await assert.rejects(f.act('status'), /locked/);
  await f.act('recover');
  assert.equal(git(state.candidate, 'rev-parse', 'HEAD'), state.bestCommit);
  assert.equal(f.read().results.at(-1).status, 'inconclusive');
  const count = f.read().results.length; await f.act('recover'); assert.equal(f.read().results.length, count);
});

test('concurrent execution is refused and worktree identity checks protect the source Git directory', async t => {
  const f = fixture(t); f.init();
  fs.writeFileSync(path.join(f.read().dir, 'operation.lock'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(f.act('baseline'), /locked/); fs.unlinkSync(path.join(f.read().dir, 'operation.lock'));
  const state = f.read(), original = fs.readFileSync(path.join(state.candidate, '.git'), 'utf8');
  fs.writeFileSync(path.join(state.candidate, '.git'), 'gitdir: ' + path.join(f.repo, '.git'));
  await assert.rejects(f.act('recover'), /identity changed/);
  fs.writeFileSync(path.join(state.candidate, '.git'), original);
  assert.equal(fs.readFileSync(path.join(f.repo, 'target.json'), 'utf8'), JSON.stringify({ metric: 100, correct: true }));
});

test('plan rejects evaluator scope, traversal, missing commands and dirty or unpinned upstream resources', t => {
  const f = fixture(t);
  for (const override of [{ scope: ['bench.mjs'] }, { scope: ['../target.json'] }, { scope: ['.git/config'] }, { correctness: [] }, { kind: 'bugfix' }, { benchmark: 'node bench.mjs' }]) assert.throws(() => validatePlan({ ...f.plan, ...override }));
  f.plan.config.upstreamRevision = UPSTREAM.revision;
  assert.throws(f.init, /audited revision/); f.plan.config.upstreamRevision = f.revision;
  fs.appendFileSync(path.join(f.upstream, 'skills/aae/SKILL.md'), 'dirty');
  assert.throws(f.init, /clean/);
});

test('actual Pi loader registers an inert-by-default extension and supports explicit mode lifecycle', async t => {
  const f = fixture(t);
  const agent = path.join(f.dir, 'agent'); fs.mkdirSync(agent);
  fs.writeFileSync(path.join(agent, 'scientific-engineering.json'), JSON.stringify(f.plan.config));
  const priorAgent = process.env.PI_CODING_AGENT_DIR, priorUpstream = process.env.PI_AAE_UPSTREAM;
  process.env.PI_CODING_AGENT_DIR = agent; process.env.PI_AAE_UPSTREAM = f.upstream;
  t.after(() => { if (priorAgent === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = priorAgent; if (priorUpstream === undefined) delete process.env.PI_AAE_UPSTREAM; else process.env.PI_AAE_UPSTREAM = priorUpstream; });
  const sdkRoot = new URL('../node_modules/@earendil-works/pi-coding-agent/dist/', import.meta.url);
  const sdk = await import(new URL('index.js', sdkRoot));
  const { discoverAndLoadExtensions } = await import(new URL('core/extensions/loader.js', sdkRoot));
  const bus = sdk.createEventBus(); t.after(() => bus.clear());
  const source = fileURLToPath(new URL('../agent/extensions/scientific-engineering/index.ts', import.meta.url));
  fs.mkdirSync(path.join(agent, 'extensions'));
  fs.symlinkSync(path.dirname(source), path.join(agent, 'extensions', 'scientific-engineering'), 'dir');
  const loaded = await discoverAndLoadExtensions([], f.repo, agent, bus);
  assert.deepEqual(loaded.errors, []); assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0], entries = [], statuses = new Map(), messages = [];
  loaded.runtime.appendEntry = (customType, data) => entries.push({ type: 'custom', customType, data });
  loaded.runtime.sendMessage = message => messages.push(message);
  const routed = [], available = [{ provider: 'test', id: 'routine', name: 'DeepSeek V4.1 Flash' }];
  let modelFailure = false;
  const ctx = { cwd: f.repo, hasUI: true, mode: 'tui', isProjectTrusted: () => true, scopedModels: [], modelRegistry: { getAvailable: () => available, streamSimple: (model, context, options) => { routed.push({ model, context, options }); return { result: async () => ({ role: 'assistant', stopReason: modelFailure ? 'error' : 'stop', errorMessage: modelFailure ? 'provider unavailable' : undefined, usage: { totalTokens: modelFailure ? 0 : 7 }, content: [{ type: 'text', text: 'Use the measured profile.' }] }) }; } }, sessionManager: { getBranch: () => entries, getSessionId: () => 'test-science' }, ui: { setStatus: (k, v) => statuses.set(k, v), notify() {} } };
  const event = (name, value = {}) => extension.handlers.get(name)[0](value, ctx);
  await event('session_start');
  const before = { systemPromptOptions: { sections: {} } }; await event('before_agent_start', before);
  assert.deepEqual(before.systemPromptOptions.sections, {}); assert.equal(fs.existsSync(path.join(agent, 'scientific-runs')), false);
  assert.ok(extension.commands.has('scientific'));
  const tool = extension.tools.get('scientific_engineering').definition;
  await assert.rejects(tool.execute('test', { action: 'start' }, undefined, undefined, ctx), /mode is off/);
  await extension.commands.get('scientific').handler('on', ctx);
  const planPath = path.join(f.dir, 'plan.json'); fs.writeFileSync(planPath, JSON.stringify({ ...f.plan, config: undefined }));
  const result = await tool.execute('start', { action: 'start', planPath }, undefined, undefined, ctx);
  assert.equal(result.details.phase, 'created');
  await tool.execute('baseline', { action: 'baseline' }, undefined, undefined, ctx);
  await tool.execute('profile', { action: 'profile' }, undefined, undefined, ctx);
  await event('message_end', { message: { role: 'assistant', timestamp: 100, usage: { totalTokens: 10 } } });
  const status = await tool.execute('status', { action: 'status' }, undefined, undefined, ctx);
  assert.equal(status.details.tokensUsed, 10);
  const reasoning = extension.tools.get('scientific_reason').definition;
  await assert.rejects(reasoning.execute('missing', { role: 'architecture', prompt: 'Analyze' }, undefined, undefined, ctx), /No available model/);
  const advice = await reasoning.execute('routine', { role: 'routine', prompt: 'Analyze the profile' }, undefined, undefined, ctx);
  assert.equal(advice.details.model, 'test/routine'); assert.equal(routed.length, 1);
  assert.ok(routed[0].options.maxTokens <= 4096);
  modelFailure = true;
  await assert.rejects(reasoning.execute('failed', { role: 'routine', prompt: 'Analyze' }, undefined, undefined, ctx), /provider unavailable/);
  const unknown = await tool.execute('status', { action: 'status' }, undefined, undefined, ctx); assert.equal(unknown.details.usageKnown, false);
  const enabledPrompt = { systemPromptOptions: { sections: {} } }; await event('before_agent_start', enabledPrompt);
  assert.ok(enabledPrompt.systemPromptOptions.sections.scientific_engineering.length < 1800);
  await event('session_start');
  assert.ok(statuses.get('scientific-engineering'));
  const guard = await event('tool_call', { toolName: 'write', input: { path: path.join(f.repo, 'target.json') } }); assert.equal(guard.block, true);
  await extension.commands.get('scientific').handler('off', ctx);
  assert.equal(statuses.get('scientific-engineering'), undefined);
  await event('session_shutdown');
});


test('schemas match runtime defaults and reject structurally invalid configuration', async () => {
  const { Check } = await import('typebox/value');
  const schema = JSON.parse(fs.readFileSync(new URL('../schemas/scientific-engineering.schema.json', import.meta.url)));
  const defaults = configure();
  assert.equal(Check(schema, defaults), true);
  assert.deepEqual(Object.keys(schema.properties).filter(k => k !== '$schema').sort(), Object.keys(defaults).sort());
  for (const key of Object.keys(defaults).filter(k => !['models', 'adapters'].includes(k))) assert.deepEqual(schema.properties[key].default, defaults[key]);
  assert.equal(Check(schema, { unknown: true }), false);
  assert.equal(Check(schema, { commandTimeoutMs: -1 }), false);
});

test('plan schema consumer and runtime agree on scope and protected file paths', async t => {
  const { Check } = await import('typebox/value');
  const schema = JSON.parse(fs.readFileSync(new URL('../schemas/scientific-plan.schema.json', import.meta.url)));
  const base = {
    objective: 'Validate plan paths', kind: 'experiment', constraints: ['Preserve correctness'],
    scope: ['target.ts'], protectedFiles: ['check.ts'], correctness: [['node', 'check.ts']],
    benchmark: ['node', 'bench.ts'], profile: ['node', 'profile.ts'], metric: { name: 'time', direction: 'lower' },
  };
  for (const field of ['scope', 'protectedFiles']) {
    for (const file of ['io/target.ts', 'agit/main.ts', 'a/b.ts', '.github/check.ts', 'src/v1.2.ts', 'git/file.ts', '\u2028io/target.ts', '.git\u2028', 'src\u2028/target.ts']) {
      const plan = { ...base, [field]: [file] };
      assert.equal(Check(schema, plan), true, field + ': ' + file);
      assert.doesNotThrow(() => validatePlan(plan));
    }
    const invalid = ['/target.ts', '.', '..', './target.ts', '../target.ts', 'src/../target.ts', '.git', '.git/config', 'src/.git/config', 'src/.', 'src/..', 'src//target.ts', 'src/', 'src\\target.ts', 'src\u2028/.git/config', '', '   '];
    for (let code = 0; code < 32; code++) {
      const control = String.fromCharCode(code);
      invalid.push(control + 'target.ts', 'src/' + control + 'target.ts', 'target.ts' + control);
    }
    for (const file of invalid) {
      const plan = { ...base, [field]: [file] };
      assert.equal(Check(schema, plan), false, field + ': ' + JSON.stringify(file));
      assert.throws(() => validatePlan(plan));
    }
  }
});

test('configuration alone cannot authorize experiment commits', t => {
  const f = fixture(t, { commitAccepted: true });
  assert.throws(() => start(f.root, f.repo, f.plan, f.upstream), /Explicit commit authorization/);
  assert.equal(fs.existsSync(f.root), false);
});

test('configured verification fails closed and memory delivery failures preserve findings', async t => {
  const f = fixture(t, { adapters: { verification: ['capsule-nonexistent-verifier'], memory: [], telemetry: false } }); f.init();
  await assert.rejects(f.act('baseline'), /ENOENT/); assert.equal(f.read().baseline, undefined);
  const g = fixture(t, { adapters: { verification: [], memory: [process.execPath, '-e', 'process.exit(7)'], telemetry: false } });
  await g.ready(); await g.propose(); g.change(70); await g.act('evaluate'); await g.reflect();
  assert.equal(g.read().results.at(-1).status, 'keep');
  assert.ok(fs.existsSync(path.join(g.read().dir, 'memory-2-error.txt')));
  assert.ok(fs.readFileSync(path.join(g.read().dir, 'findings.jsonl'), 'utf8').includes('keep'));
});

test('memory adapter receives reflected JSON and mutations block further execution', async t => {
  const f = fixture(t);
  const capture = path.join(f.dir, 'finding.json');
  f.plan.config.adapters = { verification: [], memory: [process.execPath, '-e', "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>require('fs').writeFileSync(process.argv[1],s));", capture], telemetry: false };
  await f.ready(); await f.propose(); f.change(80); await f.act('evaluate'); await f.reflect();
  assert.equal(JSON.parse(fs.readFileSync(capture)).status, 'keep');
  const g = fixture(t, { adapters: { verification: [], memory: [process.execPath, '-e', "require('fs').writeFileSync('target.json','{}')"], telemetry: false } });
  await g.ready(); await g.propose(); g.change(80); await g.act('evaluate');
  await assert.rejects(g.reflect(), /Control implementation changed/);
  await g.act('recover'); assert.equal(JSON.parse(fs.readFileSync(path.join(g.read().control, 'target.json'))).metric, 80);
});

test('runtime exhaustion during evaluation cannot keep a partial sample set', async t => {
  const f = fixture(t); await f.ready(); await f.propose(); f.change(80);
  const s = f.read(); s.startedAt = Date.now() - s.config.runtimeMs + 1800;
  fs.writeFileSync(path.join(s.dir, 'state.json'), JSON.stringify(s));
  const result = await f.act('evaluate');
  assert.equal(result.latest.status, 'inconclusive'); assert.match(result.stopReason, /Runtime/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.candidate, 'target.json'))).metric, 100);
});

test('orphan recovery refuses a reused process identity and cancellation kills descendants', async t => {
  const f = fixture(t); f.init();
  const marker = path.join(f.read().dir, 'child.json');
  fs.writeFileSync(marker, JSON.stringify({ pid: process.pid, identity: 'unrelated-process' }));
  await assert.rejects(f.act('recover'), /Cannot verify/); fs.unlinkSync(marker);
  const g = fixture(t), pidFile = path.join(g.dir, 'descendant.pid');
  g.plan.environment = { PID_FILE: pidFile };
  g.plan.profile = [process.execPath, '-e', "const fs=require('fs');const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.env.PID_FILE,String(c.pid));setInterval(()=>{},1000)"];
  g.init(); await g.act('baseline');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 700);
  await assert.rejects(g.act('profile', {}, controller.signal), /cancelled/); clearTimeout(timer);
  assert.equal(fs.existsSync(pidFile), true);
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  if (process.platform === 'linux' && fs.existsSync('/proc/' + pid + '/stat')) assert.equal(fs.readFileSync('/proc/' + pid + '/stat', 'utf8').split(') ').at(-1).split(' ')[0], 'Z');
  else assert.throws(() => process.kill(pid, 0));
});

test('a commit hook cannot replace the measured patch', async t => {
  const f = fixture(t, { commitAccepted: true }); await f.ready();
  const hooks = path.join(f.dir, 'hooks'); fs.mkdirSync(hooks);
  fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nprintf \'{"metric":1,"correct":true}\' > target.json\ngit add target.json\n');
  fs.chmodSync(path.join(hooks, 'pre-commit'), 0o755); git(f.repo, 'config', 'core.hooksPath', hooks);
  await f.propose(); f.change(80);
  await assert.rejects(f.act('evaluate'), /Commit hooks changed/);
  await f.act('recover'); assert.equal(f.read().results.at(-1).status, 'inconclusive');
  assert.equal(git(f.read().candidate, 'rev-parse', 'HEAD'), f.read().sourceHead);
});

test('hard interruption before acceptance publication recovers once without duplicate commits', async t => {
  for (const boundary of ['patch', 'state']) {
    const f = fixture(t, { commitAccepted: true }); await f.ready(); await f.propose(); f.change(80);
    const modulePath = fileURLToPath(new URL('../agent/extensions/scientific-engineering/engine.ts', import.meta.url));
    const code = "import fs from 'node:fs';import {operate} from " + JSON.stringify(new URL('file://' + modulePath).href) + ";const rename=fs.renameSync;fs.renameSync=(a,b)=>{if(" + (boundary === 'patch' ? "b.endsWith('/patches/0001.patch')" : "b.endsWith('/state.json')&&JSON.parse(fs.readFileSync(a)).phase==='review'") + "){process.kill(process.pid,'SIGKILL')}return rename(a,b)};await operate(" + JSON.stringify(f.root) + ',' + JSON.stringify(f.read().id) + ",'evaluate');";
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 30000 });
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    await f.act('recover'); const s = f.read();
    assert.equal(s.results.at(-1).status, 'inconclusive');
    assert.equal(git(s.candidate, 'rev-parse', 'HEAD'), s.sourceHead);
    assert.equal(JSON.parse(fs.readFileSync(path.join(s.control, 'target.json'))).metric, 100);
    const count = s.results.length; await f.act('recover'); assert.equal(f.read().results.length, count);
    assert.equal(git(f.repo, 'rev-parse', 'HEAD'), s.sourceHead);
  }
});


test('new scope files require a recorded hypothesis and survive accepted checkpoints', async t => {
  const invalid = fixture(t);
  fs.symlinkSync(path.join(invalid.dir, 'missing'), path.join(invalid.repo, 'dangling'));
  invalid.plan.scope.push('dangling'); assert.throws(invalid.init, /Symlink/);
  const f = fixture(t); f.plan.scope.push('added.txt'); f.init();
  f.put(f.read().candidate, 'added.txt', 'premature implementation');
  await assert.rejects(f.act('baseline'), /before the baseline/);
  fs.unlinkSync(path.join(f.read().candidate, 'added.txt'));
  await f.act('baseline'); await f.act('profile');
  f.put(f.read().candidate, 'added.txt', 'premature implementation');
  await assert.rejects(f.propose(), /before changing/);
  fs.unlinkSync(path.join(f.read().candidate, 'added.txt'));
  await f.propose(); f.change(70); f.put(f.read().candidate, 'added.txt', 'accepted addition');
  const result = await f.act('evaluate'); assert.equal(result.latest.status, 'keep');
  assert.equal(fs.readFileSync(path.join(f.read().control, 'added.txt'), 'utf8'), 'accepted addition');
  git(f.repo, 'apply', '--check', path.join(f.read().dir, 'patches/0001.patch'));
});
