#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 65536) throw new Error('Memory finding exceeds 64 KiB.');
}
const finding = JSON.parse(input);
const text = JSON.stringify({ source: 'pi-capsule/scientific-engineering', objective: finding.objective, hypothesis: finding.hypothesis, status: finding.status, improvement: finding.improvement, reason: finding.reason, reflection: finding.reflection });
const notes = process.env.EXOMIND_NOTES_ROOT ?? path.join(os.homedir(), 'Yasna-Memory');
const result = spawnSync('exom', ['capture', '--input', text, '--notes-root', notes], { encoding: 'utf8', timeout: 15000 });
if (result.error || result.status !== 0) { console.error(result.error?.message ?? result.stderr); process.exitCode = 1; }
else console.log(result.stdout.trim());
