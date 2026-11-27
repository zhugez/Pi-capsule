#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start, operate, readConfig } from '../agent/extensions/scientific-engineering/engine.ts';
import { locations } from './scientific-engineering.mjs';

const source = fileURLToPath(new URL('../examples/scientific-engineering/', import.meta.url));
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-scientific-example-'));
fs.cpSync(source, repo, { recursive: true });
for (const args of [['init', '-q', '-b', 'main'], ['config', 'user.name', 'Scientific Example'], ['config', 'user.email', 'example@example.invalid'], ['config', 'commit.gpgsign', 'false'], ['add', '.'], ['commit', '-qm', 'Example baseline']]) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
const loc = locations();
const plan = JSON.parse(fs.readFileSync(path.join(repo, 'plan.json'), 'utf8'));
const state = start(loc.root, repo, plan, loc.upstream, readConfig(loc.config));
const act = (action, data) => operate(loc.root, state.id, action, data);
await act('baseline'); await act('profile');
await act('propose', { hypothesis: 'Use a Set for membership tests to remove the repeated linear scan.', prediction: 'The fixed membership workload will run at least 10% faster while preserving all fixed outputs.', expectedImprovement: 0.1, evidence: 'The CPU profile identifies the membership-filter callback in target.mjs. The baseline performs a linear membership search for each value.' });
fs.writeFileSync(path.join(state.candidate, 'target.mjs'), "export function missing(values, present) {\n  const membership = new Set(present);\n  return values.filter(value => !membership.has(value));\n}\n");
const evaluated = await act('evaluate');
await act('reflect', { reflection: evaluated.latest.status === 'keep' ? 'The fixed correctness checks passed, and the paired measurements support the predicted reduction on this workload. Set construction and allocation can cost more for smaller inputs. Measure other workloads in a new frozen plan before generalizing.' : 'This run does not establish the predicted gain. Keep the evidence and investigate the measurements before another hypothesis.' });
const report = await act('report');
const finished = await act('finish');
console.log(JSON.stringify({ ...finished, exampleRepository: repo, report: report.report, pdf: report.pdf, originalTarget: fs.readFileSync(path.join(repo, 'target.mjs'), 'utf8') }, null, 2));
