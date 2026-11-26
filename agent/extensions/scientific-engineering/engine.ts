import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

export const UPSTREAM = {
  url: 'https://github.com/CHSZLab/AgenticAlgorithmEngineering.git',
  revision: '70b047997040d2f3a1dac1a10c391ac853593444',
};
export const DEFAULTS = {
  upstreamRevision: UPSTREAM.revision,
  maxExperiments: 10, tokenBudget: 200000, runtimeMs: 1800000,
  commandTimeoutMs: 60000, minImprovement: 0.02, repetitions: 9,
  warmups: 1, confidence: 0.95, diminishingReturns: 3,
  commitAccepted: false, negativeMemory: true,
  models: { architecture: 'GPT-6.2 Sol', routine: 'DeepSeek V4.1 Flash', review: 'GPT-6.2 Astra' },
  adapters: { verification: [] as string[], memory: [] as string[], telemetry: false },
};
export type Config = typeof DEFAULTS;
type Command = string[];
export interface Plan {
  objective: string;
  kind: 'optimization' | 'algorithm' | 'performance' | 'quality' | 'experiment';
  constraints: string[];
  scope: string[];
  protectedFiles: string[];
  correctness: Command[];
  benchmark: Command;
  profile: Command;
  metric: { name: string; direction: 'lower' | 'higher'; target?: number };
  config?: Partial<Omit<Config, 'models' | 'adapters'>> & { models?: Partial<Config['models']>; adapters?: Partial<Config['adapters']> };
  environment?: Record<string, string>;
}
interface Hypothesis { hypothesis: string; prediction: string; expectedImprovement: number; evidence: string }
interface Result extends Partial<Hypothesis> {
  exp: number; status: 'baseline' | 'keep' | 'discard' | 'inconclusive';
  reason: string; metric?: number; control?: number[]; candidate?: number[];
  improvement?: number; pValue?: number; commit?: string; tree?: string; patch?: string;
  reflection: string;
}
export interface State {
  version: 1; id: string; repo: string; sourceHead: string; sourceDirty: boolean;
  dir: string; candidate: string; control: string; upstream: { path: string; revision: string };
  plan: Plan; config: Config; environment: Record<string, string>; protectedDigest: string; bestTree: string; bestCommit: string;
  phase: 'created' | 'baselining' | 'baselined' | 'profiling' | 'ready' | 'review' | 'proposed' | 'evaluating' | 'needs_recovery' | 'finished';
  startedAt: number; tokensUsed: number; usageKnown: boolean; completedUsage: string[];
  baseline?: number; bestMetric?: number; hypothesis?: Hypothesis; results: Result[];
  stopReason?: string; profileLog?: string; lastError?: string; pending?: Result;
  gitDirs?: { candidate: string; control: string }; evaluationTree?: string;
}

function fail(message: string): never { throw new Error(message); }
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function command(v: unknown): asserts v is Command {
  if (!Array.isArray(v) || !v.length || !v.every(nonempty)) fail('Commands must be nonempty argv arrays.');
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('Unknown ' + label + ' field: ' + key);
}
export function configure(input: unknown = {}): Config {
  if (!plain(input)) fail('Configuration must be an object.');
  const { $schema, ...options } = input;
  if ($schema !== undefined && typeof $schema !== 'string') fail('$schema must be a string.');
  keys(options, Object.keys(DEFAULTS), 'configuration');
  if (options.upstreamRevision !== undefined && (typeof options.upstreamRevision !== 'string' || !/^[a-f0-9]{40}$/.test(options.upstreamRevision))) fail('upstreamRevision must be a full Git commit id.');
  for (const field of ['models', 'adapters']) if (options[field] !== undefined && !plain(options[field])) fail(field + ' must be an object.');
  const config = { ...DEFAULTS, ...options, models: { ...DEFAULTS.models, ...(options.models as object) }, adapters: { ...DEFAULTS.adapters, ...(options.adapters as object) } } as Config;
  for (const key of ['maxExperiments', 'tokenBudget', 'runtimeMs', 'commandTimeoutMs', 'repetitions', 'diminishingReturns'] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) fail(key + ' must be a positive safe integer.');
  }
  if (config.commandTimeoutMs > 2147483647) fail('commandTimeoutMs exceeds the platform timer limit.');
  if (config.maxExperiments > 1000 || config.repetitions > 1000) fail('Experiment and repetition limits cannot exceed 1000.');
  if (!Number.isSafeInteger(config.warmups) || config.warmups < 0 || config.warmups > 1000) fail('warmups must be an integer from 0 to 1000.');
  if (!Number.isFinite(config.minImprovement) || config.minImprovement < 0 || config.minImprovement >= 1) fail('minImprovement must be in [0, 1).');
  if (!Number.isFinite(config.confidence) || config.confidence <= 0.5 || config.confidence >= 1) fail('confidence must be in (0.5, 1).');
  if (2 ** -config.repetitions > (1 - config.confidence) / config.maxExperiments) fail('Too few repetitions for confidence and experiment limit (Bonferroni correction).');
  for (const key of ['commitAccepted', 'negativeMemory'] as const) if (typeof config[key] !== 'boolean') fail(key + ' must be boolean.');
  keys(config.models, Object.keys(DEFAULTS.models), 'model');
  for (const value of Object.values(config.models)) if (!nonempty(value) || !/[a-z0-9]/i.test(value)) fail('Model preferences must contain a catalog name or reference.');
  keys(config.adapters, Object.keys(DEFAULTS.adapters), 'adapter');
  for (const key of ['verification', 'memory'] as const) if (!Array.isArray(config.adapters[key]) || !config.adapters[key].every(nonempty)) fail('adapters.' + key + ' must be an argv array or [].');
  if (typeof config.adapters.telemetry !== 'boolean') fail('adapters.telemetry must be boolean.');
  return config;
}
function relativeFile(p: unknown): asserts p is string {
  if (!nonempty(p) || path.isAbsolute(p) || p.includes('\\') || p.split('/').some(x => !x || ['.', '..', '.git'].includes(x)) || /[\x00-\x1f]/.test(p)) fail('Use repository-relative file paths without traversal or .git.');
}
export function validatePlan(value: unknown): Plan {
  if (!plain(value)) fail('Plan must be an object.');
  keys(value, ['objective', 'kind', 'constraints', 'scope', 'protectedFiles', 'correctness', 'benchmark', 'profile', 'metric', 'config', 'environment', '$schema'], 'plan');
  if (!nonempty(value.objective) || !['optimization', 'algorithm', 'performance', 'quality', 'experiment'].includes(String(value.kind))) fail('Define an objective and an eligible scientific task kind.');
  for (const field of ['constraints', 'scope', 'protectedFiles']) if (!Array.isArray(value[field]) || !(value[field] as unknown[]).length || !(value[field] as unknown[]).every(nonempty)) fail(field + ' must be a nonempty string array.');
  for (const p of [...value.scope as string[], ...value.protectedFiles as string[]]) relativeFile(p);
  if (new Set(value.scope as string[]).size !== (value.scope as string[]).length) fail('Scope paths must be unique.');
  if ((value.scope as string[]).some(p => (value.protectedFiles as string[]).includes(p))) fail('Scope cannot include a protected evaluator file.');
  if (!Array.isArray(value.correctness) || !value.correctness.length) fail('At least one correctness command is required.');
  value.correctness.forEach(command); command(value.benchmark); command(value.profile);
  if (!plain(value.metric)) fail('Define the metric.');
  keys(value.metric, ['name', 'direction', 'target'], 'metric');
  if (!nonempty(value.metric.name) || !['lower', 'higher'].includes(String(value.metric.direction))) fail('Define the metric name and direction.');
  if (value.metric.target !== undefined && (typeof value.metric.target !== 'number' || !Number.isFinite(value.metric.target) || value.metric.target <= 0)) fail('Metric target must be positive and finite.');
  if (value.config !== undefined && !plain(value.config)) fail('Plan configuration must be an object.');
  if (value.environment !== undefined && (!plain(value.environment) || !Object.entries(value.environment).every(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === 'string'))) fail('Environment must map variable names to string values.');
  return value as unknown as Plan;
}
function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.error || r.status !== 0) fail('Git ' + args[0] + ' failed: ' + (r.error?.message ?? r.stderr.trim()));
  return r.stdout.replace(/\n$/, '');
}
function privateDir(dir: string) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700); }
function atomic(file: string, text: string) {
  const tmp = file + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function json(file: string): unknown { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function readConfig(file: string): Config { return configure(fs.existsSync(file) ? json(file) : {}); }
function safeFile(root: string, file: string, missing = false) {
  relativeFile(file);
  let current = root;
  for (const segment of file.split('/')) {
    current = path.join(current, segment);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (missing && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      fail('Missing or inaccessible file: ' + file);
    }
    if (stat.isSymbolicLink()) fail('Symlink in evaluator or scope path: ' + file);
  }
  if (fs.existsSync(current) && !fs.statSync(current).isFile()) fail('Expected a file: ' + file);
  return current;
}
function tracked(cwd: string): string[] { return git(cwd, ['ls-files', '-z']).split('\0').filter(Boolean); }
function digest(state: State, cwd: string): string {
  const hash = crypto.createHash('sha256');
  const paths = new Set([...tracked(cwd).filter(p => !state.plan.scope.includes(p)), ...state.plan.protectedFiles]);
  for (const p of [...paths].sort()) {
    const full = path.join(cwd, p);
    const stat = fs.lstatSync(full);
    hash.update(JSON.stringify([p, stat.mode & 0o111, stat.isSymbolicLink() ? 'link' : 'file']));
    hash.update(stat.isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full));
  }
  return hash.digest('hex');
}
function ownership(state: State) {
  if (!state.gitDirs) fail('Missing worktree ownership record.');
  for (const arm of ['candidate', 'control'] as const) {
    if (fs.realpathSync(state[arm]) !== state[arm] || git(state[arm], ['rev-parse', '--absolute-git-dir']) !== state.gitDirs[arm]) fail('Experiment worktree identity changed. Refusing Git mutations.');
  }
}
function integrity(state: State) {
  ownership(state);
  if (state.evaluationTree && (git(state.candidate, ['diff', state.evaluationTree, '--']).length || git(state.candidate, ['write-tree']) !== state.evaluationTree)) fail('Candidate changed during evaluation. Measurements are invalid.');
  for (const cwd of [state.candidate, state.control]) {
    if (digest(state, cwd) !== state.protectedDigest) fail('Protected evaluator or other out-of-scope input changed. Measurements are invalid.');
    for (const p of state.plan.scope) safeFile(cwd, p, true);
    const extras = git(cwd, ['ls-files', '--others', '-z']).split('\0').filter(Boolean);
    if (extras.some(p => !state.plan.scope.includes(p))) fail('Untracked out-of-scope files in ' + cwd + '. Preserve and inspect them before recovery.');
    if (extras.length && (cwd === state.control || state.evaluationTree)) fail((cwd === state.control ? 'Control implementation changed' : 'Candidate changed during evaluation') + '. Untracked files invalidate measurements.');
    const staged = git(cwd, ['diff', '--cached', '--name-only', '-z', state.bestTree, '--']).split('\0').filter(Boolean);
    if (staged.some(p => !state.plan.scope.includes(p))) fail('Protected index entries changed.');
  }
  if (git(state.control, ['diff', state.bestTree, '--']).length || git(state.control, ['write-tree']) !== state.bestTree) fail('Control implementation changed. Measurements are invalid.');
}
function candidateChanged(state: State): boolean {
  return !!git(state.candidate, ['diff', state.bestTree, '--']).length || !!git(state.candidate, ['ls-files', '--others', '--exclude-standard', '-z']).length;
}
function persist(state: State) {
  atomic(path.join(state.dir, 'state.json'), JSON.stringify(state, null, 2) + '\n');
  // These are projections. state.json is the recovery authority.
  const clean = (s: unknown) => String(s ?? '').replace(/[\t\r\n]/g, ' ');
  atomic(path.join(state.dir, 'results.tsv'), 'commit\tmetric_value\tresource_usage\tstatus\thypothesis\n' + state.results.map(r => [r.commit ?? r.tree ?? state.sourceHead, r.metric ?? 0, 0, r.status === 'baseline' ? 'keep' : r.status, r.hypothesis ?? 'baseline'].map(clean).join('\t')).join('\n') + '\n');
  atomic(path.join(state.dir, 'findings.jsonl'), state.results.map(r => JSON.stringify(r)).join('\n') + '\n');
  privateDir(path.join(state.dir, 'report'));
  atomic(path.join(state.dir, 'report', 'session.json'), JSON.stringify({ title: state.plan.objective, target: state.plan.scope.join(', '), metric: state.plan.metric.name, direction: state.plan.metric.direction, branch: 'detached:' + state.bestCommit, date: new Date(state.startedAt).toISOString().slice(0, 10), baseline_commit: state.sourceHead, best_commit: state.bestCommit, best_tree: state.bestTree, remaining_tokens: Math.max(0, state.config.tokenBudget - state.tokensUsed), benchmark: state.plan.benchmark, assertions: state.plan.constraints, kb_contributions: false, summary: state.stopReason ?? state.phase }, null, 2));
  for (const result of state.results) {
    const dir = path.join(state.dir, 'report', 'experiments', String(result.exp).padStart(3, '0'));
    privateDir(dir);
    atomic(path.join(dir, 'meta.json'), JSON.stringify({ ...result, title: result.hypothesis ?? 'Unmodified baseline', intuition: result.evidence ?? '', prediction: result.prediction ?? '', verdict: result.reason, measurements: result.candidate?.map((value, i) => ({ input: 'pair-' + (i + 1), value })) ?? [], status: result.status === 'inconclusive' ? 'discard' : result.status, scientific_status: result.status }, null, 2));
  }
}
export function loadState(root: string, id: string): State {
  if (!/^\d{13}-[a-f0-9-]{36}$/.test(id)) fail('Invalid scientific run id.');
  const dir = path.join(path.resolve(root), id);
  const state = json(path.join(dir, 'state.json')) as State;
  if (state.version !== 1 || state.id !== id || state.dir !== dir || state.candidate !== path.join(dir, 'candidate') || state.control !== path.join(dir, 'control')) fail('Invalid scientific state paths or version.');
  validatePlan(state.plan); configure(state.config);
  return state;
}
function stopReason(state: State): string | undefined {
  if (!state.usageKnown) return 'Token usage is unavailable. Preserve results and obtain a separately authorized budget before starting another run.';
  if (state.tokensUsed >= state.config.tokenBudget) return 'Token budget reached.';
  if (Date.now() - state.startedAt >= state.config.runtimeMs) return 'Runtime budget reached.';
  const results = state.results.filter(r => r.status !== 'baseline');
  if (results.length >= state.config.maxExperiments) return 'Experiment limit reached.';
  if (results.length >= state.config.diminishingReturns && results.slice(-state.config.diminishingReturns).every(r => r.status !== 'keep')) return 'Diminishing returns: consecutive experiments did not produce an accepted gain.';
  const target = state.plan.metric.target;
  if (target !== undefined && state.bestMetric !== undefined && (state.plan.metric.direction === 'lower' ? state.bestMetric <= target : state.bestMetric >= target)) return 'Objective reached.';
}
export function summary(state: State) {
  return { id: state.id, objective: state.plan.objective, phase: state.phase, candidate: state.candidate, control: state.control, artifacts: state.dir, baseline: state.baseline, bestMetric: state.bestMetric, bestTree: state.bestTree, bestCommit: state.bestCommit, experiments: state.results.length - (state.baseline === undefined ? 0 : 1), tokensUsed: state.tokensUsed, usageKnown: state.usageKnown, tokenBudget: state.config.tokenBudget, stopReason: state.stopReason ?? stopReason(state), lastError: state.lastError, latest: state.results.at(-1), upstream: state.upstream };
}
export function assertBudget(state: State) { const reason = stopReason(state); if (reason) fail(reason); }
export function negativeFindings(root: string, repo: string): unknown[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).sort().reverse().slice(0, 100).flatMap(id => {
    try { const s = loadState(root, id); return s.repo === repo && s.config.negativeMemory ? s.results.filter(r => r.status === 'discard' || r.status === 'inconclusive').map(r => ({ runId: s.id, hypothesis: r.hypothesis?.slice(0, 400), reason: r.reason.slice(0, 400), reflection: r.reflection.slice(0, 400) })) : []; } catch { return []; }
  }).slice(0, 10);
}
const environmentKeys = ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ', 'NODE_OPTIONS', 'PYTHONPATH', 'PYTHONHASHSEED', 'LD_LIBRARY_PATH', 'CC', 'CXX', 'CFLAGS', 'CXXFLAGS', 'LDFLAGS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'EXOMIND_NOTES_ROOT'];
export function start(root: string, cwd: string, value: unknown, upstreamPath: string, config: Config = configure(), commitAuthorized = false): State {
  const plan = validatePlan(value);
  config = configure({ ...config, ...plan.config, models: { ...config.models, ...plan.config?.models }, adapters: { ...config.adapters, ...plan.config?.adapters } });
  if (config.commitAccepted && !commitAuthorized) fail('Explicit commit authorization is required in addition to commitAccepted configuration.');
  const upstream = fs.realpathSync(upstreamPath);
  if (git(upstream, ['rev-parse', 'HEAD']) !== config.upstreamRevision || git(upstream, ['status', '--porcelain']).length) fail('AAE resources must be clean at audited revision ' + config.upstreamRevision + '.');
  for (const file of ['skills/aae/SKILL.md', 'skills/aae/templates/report/build_report.py']) if (!fs.existsSync(path.join(upstream, file))) fail('Missing upstream AAE resource: ' + file);
  const repo = fs.realpathSync(git(cwd, ['rev-parse', '--show-toplevel']));
  root = path.resolve(root);
  if (root === repo || !path.relative(repo, root).startsWith('..')) fail('Scientific state must be outside the target checkout.');
  const head = git(repo, ['rev-parse', 'HEAD']);
  const files = tracked(repo);
  for (const p of plan.scope) { safeFile(repo, p, true); if (plan.protectedFiles.includes(p)) fail('Evaluator cannot be in scope.'); }
  for (const p of plan.protectedFiles) { safeFile(repo, p); if (!files.includes(p)) fail('Evaluator must be committed: ' + p); }
  const dirty = git(repo, ['status', '--porcelain']).length > 0;
  privateDir(root); root = fs.realpathSync(root);
  if (root === repo || !path.relative(repo, root).startsWith('..')) fail('Scientific state must resolve outside the target checkout.');
  const id = String(Date.now()) + '-' + crypto.randomUUID();
  const dir = path.join(root, id); privateDir(dir);
  const state: State = { version: 1, id, dir, repo, sourceHead: head, sourceDirty: dirty, candidate: path.join(dir, 'candidate'), control: path.join(dir, 'control'), upstream: { path: upstream, revision: config.upstreamRevision }, plan, config, environment: { ...Object.fromEntries(environmentKeys.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]!])), ...plan.environment }, protectedDigest: '', bestTree: git(repo, ['rev-parse', 'HEAD^{tree}']), bestCommit: head, phase: 'created', startedAt: Date.now(), tokensUsed: 0, usageKnown: true, completedUsage: [], results: [] };
  atomic(path.join(dir, 'plan.json'), JSON.stringify({ plan, config, sourceHead: head, sourceDirty: dirty, upstream: state.upstream, machine: { platform: os.platform(), arch: os.arch(), cpus: os.cpus().map(c => c.model), node: process.version }, environment: state.environment }, null, 2));
  // Worktrees share Git metadata. They isolate checkouts, not hostile code.
  try {
    git(repo, ['worktree', 'add', '--detach', state.control, head]);
    git(repo, ['worktree', 'add', '--detach', state.candidate, head]);
    state.gitDirs = { candidate: git(state.candidate, ['rev-parse', '--absolute-git-dir']), control: git(state.control, ['rev-parse', '--absolute-git-dir']) };
    for (const p of plan.protectedFiles) safeFile(state.control, p);
    for (const p of plan.scope) safeFile(state.candidate, p, true);
    state.protectedDigest = digest(state, state.control);
    integrity(state); persist(state);
  } catch (error) {
    atomic(path.join(dir, 'setup-error.txt'), String(error));
    // Keep partial worktrees and diagnostics for inspection; never force-remove them.
    throw error;
  }
  return state;
}

function binomialTail(successes: number, count: number): number {
  let p = 2 ** -count, sum = successes === 0 ? p : 0;
  for (let k = 1; k <= count; k++) { p *= (count - k + 1) / k; if (k >= successes) sum += p; }
  return Math.min(1, sum);
}
export function geometric(values: number[]): number { return Math.exp(values.reduce((a, n) => a + Math.log(n), 0) / values.length); }
export function compare(control: number[], candidate: number[], config: Config, direction: 'lower' | 'higher') {
  if (control.length !== config.repetitions || candidate.length !== config.repetitions || [...control, ...candidate].some(n => !Number.isFinite(n) || n <= 0)) fail('Benchmark must return the complete, finite, positive sample set.');
  const ratios = control.map((n, i) => direction === 'lower' ? n / candidate[i] : candidate[i] / n);
  const improvements = control.map((n, i) => direction === 'lower' ? 1 - candidate[i] / n : candidate[i] / n - 1);
  if (ratios.some(n => !Number.isFinite(n) || n <= 0) || improvements.some(n => !Number.isFinite(n))) fail('Metric ratios exceed finite numeric range. Normalize the metric in a new plan.');
  const wins = improvements.filter(n => n > config.minImprovement).length;
  const pValue = binomialTail(wins, control.length);
  const alpha = (1 - config.confidence) / config.maxExperiments;
  const ratio = geometric(ratios);
  const improvement = direction === 'lower' ? 1 - 1 / ratio : ratio - 1;
  const status = pValue <= alpha && improvement >= config.minImprovement ? 'keep' : binomialTail(control.length - wins, control.length) <= alpha ? 'discard' : 'inconclusive';
  return { status, improvement, pValue, alpha, metric: geometric(candidate) } as const;
}
function processIdentity(pid: number): string | undefined {
  try { return fs.readFileSync('/proc/' + pid + '/stat', 'utf8').split(') ').at(-1)!.split(' ')[19]; } catch { return undefined; }
}
function recoverChild(state: State) {
  const file = path.join(state.dir, 'child.json');
  if (!fs.existsSync(file)) return;
  const saved = json(file) as { pid: number; identity?: string };
  let alive = true; try { process.kill(saved.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
  if (alive) {
    if (!saved.identity || processIdentity(saved.pid) !== saved.identity) fail('Cannot verify an orphan process identity. Terminate the recorded process tree before recovery.');
    process.kill(-saved.pid, 'SIGKILL');
  } else if (process.platform !== 'win32') {
    let groupAlive = true; try { process.kill(-saved.pid, 0); } catch { groupAlive = false; }
    if (groupAlive) fail('Orphan descendants remain. Terminate the recorded process group before recovery.');
  }
  fs.unlinkSync(file);
}
async function run(state: State, cwd: string, argv: Command, label: string, signal?: AbortSignal, input?: string): Promise<string> {
  signal?.throwIfAborted();
  const remaining = state.config.runtimeMs - (Date.now() - state.startedAt);
  if (remaining <= 0) fail('Runtime budget reached.');
  const logs = path.join(state.dir, 'logs'); privateDir(logs);
  const log = fs.openSync(path.join(logs, label + '.log'), 'w', 0o600);
  const timeout = Math.min(state.config.commandTimeoutMs, remaining);
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env: state.environment, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    if (child.pid) atomic(path.join(state.dir, 'child.json'), JSON.stringify({ pid: child.pid, identity: processIdentity(child.pid) }));
    let output = '', bytes = 0, failure: Error | undefined;
    const kill = (reason: string) => {
      failure ??= new Error(reason);
      if (child.pid) {
        try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']); else process.kill(-child.pid, 'SIGKILL'); } catch { /* Process already exited. */ }
      }
    };
    const abort = () => kill('Experiment cancelled.');
    const timer = setTimeout(() => kill('Command timeout or runtime budget reached.'), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= 16 * 1024 * 1024) fs.writeSync(log, chunk);
      if (Buffer.byteLength(output) + chunk.length <= 1024 * 1024) output += chunk.toString(); else kill('Command stdout exceeds 1 MiB.');
      if (bytes > 16 * 1024 * 1024) kill('Command log exceeds 16 MiB.');
    });
    child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes <= 16 * 1024 * 1024) fs.writeSync(log, chunk); else kill('Command log exceeds 16 MiB.'); });
    child.on('error', error => { failure = error; });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); fs.closeSync(log);
      if (fs.existsSync(path.join(state.dir, 'child.json'))) fs.unlinkSync(path.join(state.dir, 'child.json'));
      // A successful launcher must not leave benchmark workers running.
      if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Group ended. */ } }
      if (failure || code !== 0) reject(failure ?? new Error(label + ' exited ' + code + '. See logs/' + label + '.log.')); else resolve(output);
    });
  });
}
function metric(output: string): number {
  const last = output.trim().split('\n').at(-1) ?? '';
  const value = JSON.parse(last) as { metric?: unknown };
  if (typeof value.metric !== 'number' || !Number.isFinite(value.metric) || value.metric <= 0) fail('Benchmark final stdout line must be JSON with a positive finite metric.');
  return value.metric;
}
async function checks(state: State, cwd: string, label: string, signal?: AbortSignal) {
  const commands = [...state.plan.correctness, ...(state.config.adapters.verification.length ? [state.config.adapters.verification] : [])];
  for (const [i, argv] of commands.entries()) { integrity(state); await run(state, cwd, argv, label + '-correctness-' + i, signal); integrity(state); }
}
function patch(state: State, file: string) {
  // Include untracked in-scope additions without staging unrelated paths.
  const additions = state.plan.scope.filter(p => fs.existsSync(path.join(state.candidate, p)) && !tracked(state.candidate).includes(p));
  if (additions.length) git(state.candidate, ['add', '--intent-to-add', '--', ...additions]);
  const diff = git(state.candidate, ['diff', '--binary', state.bestTree, '--']);
  atomic(file, diff + (diff ? '\n' : ''));
  return diff;
}
function restore(state: State) {
  ownership(state);
  delete state.evaluationTree;
  for (const cwd of [state.candidate, state.control]) {
    git(cwd, ['restore', '--source', state.bestTree, '--staged', '--worktree', '--', '.']);
    for (const p of state.plan.scope) if (!tracked(cwd).includes(p) && fs.existsSync(path.join(cwd, p))) fs.unlinkSync(safeFile(cwd, p));
  }
  if (state.config.commitAccepted) git(state.candidate, ['switch', '--detach', state.bestCommit]);
  git(state.repo, ['update-ref', 'refs/pi-capsule/scientific/' + state.id, state.bestTree]);
  integrity(state);
}
async function findingsAdapter(state: State, result: Result, signal?: AbortSignal) {
  if (!state.config.adapters.memory.length) return;
  integrity(state);
  try { await run(state, state.control, state.config.adapters.memory, 'memory-' + result.exp, signal, JSON.stringify({ objective: state.plan.objective, ...result })); }
  catch (error) { atomic(path.join(state.dir, 'memory-' + result.exp + '-error.txt'), String(error)); }
  integrity(state);
}

export async function operate(root: string, id: string, action: string, data: Record<string, unknown> = {}, signal?: AbortSignal) {
  const initial = loadState(root, id);
  const lock = path.join(initial.dir, 'operation.lock');
  if (fs.existsSync(lock)) {
    const owner = json(lock) as { pid: number };
    let alive = true; try { process.kill(owner.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
    if (alive || action !== 'recover') fail('Run is locked. A dead owner requires explicit recover.');
    fs.unlinkSync(lock);
  }
  const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.closeSync(fd);
  const state = loadState(root, id);
  try {
    ownership(state);
    if (action === 'status') return summary(state);
    if (action === 'usage') {
      const key = String(data.key ?? '');
      if (!key || state.completedUsage.includes(key)) return summary(state);
      state.completedUsage.push(key);
      if (typeof data.tokens !== 'number' || !Number.isFinite(data.tokens) || data.tokens < 0) state.usageKnown = false;
      else state.tokensUsed += data.tokens;
      state.stopReason = stopReason(state); persist(state); return summary(state);
    }
    if (action === 'report') {
      const upstream = state.upstream.path;
      if (git(upstream, ['rev-parse', 'HEAD']) !== state.upstream.revision || git(upstream, ['status', '--porcelain']).length) fail('Upstream report resources changed since setup.');
      const reportDir = path.join(state.dir, 'report');
      persist(state);
      const output = await run(state, reportDir, ['python3', path.join(upstream, 'skills/aae/templates/report/build_report.py'), reportDir], 'report', signal);
      return { ...summary(state), report: output.trim(), pdf: fs.existsSync(path.join(reportDir, 'report.pdf')) ? path.join(reportDir, 'report.pdf') : null };
    }
    if (action === 'finish') {
      if (['evaluating', 'baselining', 'profiling', 'needs_recovery', 'proposed', 'review'].includes(state.phase)) fail('Recover or evaluate the pending change before finishing.');
      integrity(state); state.phase = 'finished'; state.stopReason ??= 'Stopped by operator.'; persist(state); return summary(state);
    }
    if (action === 'reflect') {
      if (state.phase !== 'review' || !nonempty(data.reflection)) fail('Reflect on the completed experiment before continuing.');
      const result = state.results.at(-1)!;
      result.reflection = data.reflection; state.phase = 'ready';
      state.stopReason = stopReason(state); persist(state);
      await findingsAdapter(state, result, signal);
      return summary(state);
    }
    if (action === 'recover') {
      recoverChild(state);
      // A crash after tree/commit creation but before state publication can leave an
      // orphan object. Never infer acceptance from HEAD or rerun a commit.
      privateDir(path.join(state.dir, 'recovery'));
      patch(state, path.join(state.dir, 'recovery', 'candidate-' + Date.now() + '.patch'));
      restore(state);
      if (state.hypothesis) state.results.push({ exp: state.results.length + 1, ...state.hypothesis, status: 'inconclusive', reason: 'Interrupted experiment recovered without acceptance.', reflection: 'Inspect recovery patch and logs before retrying.' });
      delete state.pending; delete state.hypothesis;
      state.phase = state.profileLog ? 'ready' : state.baseline !== undefined ? 'baselined' : 'created';
      state.lastError = undefined; state.stopReason = stopReason(state); persist(state); return summary(state);
    }
    if (state.phase === 'finished') fail('This run is finished. Start a new run.');
    assertBudget(state); integrity(state);
    if (action === 'baseline') {
      if (state.phase !== 'created') fail('Baseline can only run once on the unmodified source.');
      if (candidateChanged(state)) fail('Candidate changed before the baseline.');
      state.phase = 'baselining'; persist(state);
      await checks(state, state.control, 'baseline', signal);
      for (let i = 0; i < state.config.warmups; i++) await run(state, state.control, state.plan.benchmark, 'baseline-warmup-' + i, signal);
      const values: number[] = [];
      for (let i = 0; i < state.config.repetitions; i++) { integrity(state); values.push(metric(await run(state, state.control, state.plan.benchmark, 'baseline-' + i, signal))); integrity(state); }
      state.baseline = state.bestMetric = geometric(values);
      state.results.push({ exp: 1, status: 'baseline', reason: 'Correctness verified before optimization.', metric: state.baseline, candidate: values, reflection: 'Use the profile to propose the first hypothesis.' });
      state.phase = 'baselined';
    } else if (action === 'profile') {
      if (state.phase !== 'baselined' && state.phase !== 'ready') fail('Establish the baseline before profiling.');
      state.phase = 'profiling'; persist(state);
      await run(state, state.control, state.plan.profile, 'profile', signal); integrity(state);
      state.profileLog = path.join(state.dir, 'logs', 'profile.log'); state.phase = 'ready';
    } else if (action === 'propose') {
      if (state.phase !== 'ready') fail('Baseline and profile are required before proposing a hypothesis.');
      for (const key of ['hypothesis', 'prediction', 'evidence']) if (!nonempty(data[key])) fail('Define ' + key + ' before implementation.');
      if (typeof data.expectedImprovement !== 'number' || !Number.isFinite(data.expectedImprovement) || data.expectedImprovement <= 0) fail('Predict a positive fractional improvement before implementation.');
      if (candidateChanged(state)) fail('Record the hypothesis before changing the implementation.');
      state.hypothesis = { hypothesis: String(data.hypothesis), prediction: String(data.prediction), evidence: String(data.evidence), expectedImprovement: data.expectedImprovement };
      state.phase = 'proposed';
    } else if (action === 'evaluate') {
      if (state.phase !== 'proposed' || !state.hypothesis) fail('Propose a falsifiable hypothesis before evaluation.');
      state.phase = 'evaluating'; persist(state);
      const exp = state.results.length + 1;
      const dir = path.join(state.dir, 'report', 'experiments', String(exp).padStart(3, '0')); privateDir(dir);
      const diff = patch(state, path.join(dir, 'change.patch'));
      if (!diff) fail('The candidate has no change to evaluate.');
      const files = tracked(state.candidate);
      const paths = state.plan.scope.filter(p => files.includes(p) || fs.existsSync(path.join(state.candidate, p)));
      if (paths.length) git(state.candidate, ['add', '--', ...paths]);
      state.evaluationTree = git(state.candidate, ['write-tree']); persist(state);
      atomic(path.join(dir, 'meta.json'), JSON.stringify({ exp, ...state.hypothesis, status: 'running', tree: state.evaluationTree }));
      const result: Result = { exp, ...state.hypothesis, status: 'inconclusive', reason: '', reflection: '' };
      let correctness = false;
      try {
        await checks(state, state.candidate, 'exp-' + exp, signal); correctness = true;
        for (let i = 0; i < state.config.warmups; i++) for (const [label, cwd] of [['control', state.control], ['candidate', state.candidate]]) { integrity(state); await run(state, cwd, state.plan.benchmark, 'exp-' + exp + '-warmup-' + label + '-' + i, signal); integrity(state); }
        const control: number[] = [], candidate: number[] = [];
        for (let i = 0; i < state.config.repetitions; i++) {
          const arms = i % 2 ? [['candidate', state.candidate], ['control', state.control]] : [['control', state.control], ['candidate', state.candidate]];
          for (const [label, cwd] of arms) { integrity(state); const value = metric(await run(state, cwd, state.plan.benchmark, 'exp-' + exp + '-' + i + '-' + label, signal)); integrity(state); (label === 'control' ? control : candidate).push(value); }
          atomic(path.join(dir, 'samples.json'), JSON.stringify({ control, candidate }));
        }
        Object.assign(result, compare(control, candidate, state.config, state.plan.metric.direction), { control, candidate });
        result.reason = result.status === 'keep' ? 'Correctness passed. Minimum gain and family-adjusted paired sign test passed.' : result.status === 'discard' ? 'Paired test rejects a median gain above the minimum threshold.' : 'Evidence does not distinguish the candidate at the configured confidence.';
      } catch (error) {
        const interrupted = signal?.aborted || /cancelled|timeout|budget reached|exceeds/.test(String(error));
        result.status = correctness || interrupted ? 'inconclusive' : 'discard'; result.reason = String(error);
      }
      integrity(state);
      if (result.status === 'keep') {
        result.tree = state.evaluationTree;
        state.pending = result; persist(state);
        if (state.config.commitAccepted) {
          // Explicit plan opt-in only. Normal hooks and signing remain active.
          git(state.candidate, ['commit', '-m', 'AAE: ' + state.hypothesis.hypothesis]);
          result.commit = git(state.candidate, ['rev-parse', 'HEAD']);
          if (git(state.candidate, ['rev-parse', 'HEAD^{tree}']) !== result.tree || git(state.candidate, ['diff', result.tree, '--']).length) fail('Commit hooks changed the evaluated patch. Recover before continuing.');
          integrity(state);
        }
        privateDir(path.join(state.dir, 'patches'));
        const accepted = state.results.filter(r => r.status === 'keep').length + 1;
        result.patch = 'patches/' + String(accepted).padStart(4, '0') + '.patch';
        atomic(path.join(state.dir, result.patch), diff + '\n');
        // Anchor the checkpoint without inventing a commit or moving a user branch.
        git(state.repo, ['update-ref', 'refs/pi-capsule/scientific/' + state.id, result.tree!]);
        git(state.control, ['restore', '--source', result.tree!, '--staged', '--worktree', '--', '.']);
        if (result.commit) git(state.control, ['switch', '--detach', result.commit]);
        state.bestTree = result.tree!; state.bestMetric = result.metric;
        if (result.commit) state.bestCommit = result.commit;
        delete state.evaluationTree;
      } else restore(state);
      result.reflection = result.reason;
      state.results.push(result); delete state.hypothesis; delete state.pending; state.phase = 'review';
      persist(state);
    } else fail('Unknown scientific action: ' + action);
    state.stopReason = stopReason(state); state.lastError = undefined; persist(state); return summary(state);
  } catch (error) {
    if (['baselining', 'profiling', 'evaluating'].includes(state.phase)) state.phase = 'needs_recovery';
    state.lastError = String(error); persist(state); throw error;
  } finally { fs.unlinkSync(lock); }
}

export interface CatalogModel { provider: string; id: string; name: string }
export function selectModel<T extends CatalogModel>(models: T[], preference: string): T | undefined {
  const exact = models.find(m => m.provider + '/' + m.id === preference);
  if (exact) return exact;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace('deepseekv', 'deepseek');
  const name = normalize(preference);
  if (!name) return undefined;
  const named = models.filter(m => normalize(m.name) === name || normalize(m.id) === name);
  return named.length === 1 ? named[0] : undefined;
}
