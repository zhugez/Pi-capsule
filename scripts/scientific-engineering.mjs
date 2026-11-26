#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UPSTREAM, loadState, negativeFindings, operate, readConfig, start, summary } from '../agent/extensions/scientific-engineering/engine.ts';

export function locations() {
  const agent = process.env.PI_CODING_AGENT_DIR ?? process.env.PI_AGENT_DIR ?? path.join(os.homedir(), '.pi', 'agent');
  return { root: path.join(agent, 'scientific-runs'), upstream: process.env.PI_AAE_UPSTREAM ?? path.join(agent, 'aae-upstream'), config: path.join(agent, 'scientific-engineering.json') };
}
export async function main(args) {
  const [action, argument, dataPath] = args;
  const loc = locations();
  if (action === 'install-upstream') {
    if (fs.existsSync(loc.upstream)) {
      const head = spawnSync('git', ['-C', loc.upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
      const dirty = spawnSync('git', ['-C', loc.upstream, 'status', '--porcelain'], { encoding: 'utf8' });
      if (head.status !== 0 || dirty.status !== 0 || dirty.stdout.trim() || head.stdout.trim() !== UPSTREAM.revision) throw new Error('Existing upstream directory differs. Preserve it and choose another PI_AAE_UPSTREAM path.');
      return { upstream: loc.upstream, revision: UPSTREAM.revision, changed: false };
    }
    fs.mkdirSync(path.dirname(loc.upstream), { recursive: true, mode: 0o700 });
    for (const argv of [['clone', '--no-checkout', UPSTREAM.url, loc.upstream], ['-C', loc.upstream, 'checkout', '--detach', UPSTREAM.revision]]) {
      const r = spawnSync('git', argv, { encoding: 'utf8', timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      if (r.error || r.status !== 0) throw new Error('AAE installation failed. Partial clone preserved: ' + (r.error?.message ?? r.stderr));
    }
    return { upstream: loc.upstream, revision: UPSTREAM.revision, changed: true };
  }
  if (action === 'start') {
    if (!argument) throw new Error('Usage: scientific-engineering.mjs start <plan.json>');
    const state = start(loc.root, process.cwd(), JSON.parse(fs.readFileSync(argument, 'utf8')), loc.upstream, readConfig(loc.config), dataPath === '--allow-commits');
    return { ...summary(state), sourceDirty: state.sourceDirty, negativeFindings: state.config.negativeMemory ? negativeFindings(loc.root, state.repo) : [] };
  }
  if (!['status', 'baseline', 'profile', 'propose', 'evaluate', 'reflect', 'recover', 'finish', 'report', 'usage'].includes(action) || !argument) throw new Error('Usage: scientific-engineering.mjs install-upstream | start <plan.json> | <status|baseline|profile|propose|evaluate|reflect|recover|finish|report|usage> <run-id> [data.json]');
  if (action === 'status') return summary(loadState(loc.root, argument));
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try { return await operate(loc.root, argument, action, dataPath ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : {}, controller.signal); }
  finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
