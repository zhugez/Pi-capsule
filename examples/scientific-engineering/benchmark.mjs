import { performance } from 'node:perf_hooks';
import { missing } from './target.mjs';

const values = Array.from({ length: 4000 }, (_, i) => i);
const present = Array.from({ length: 4000 }, (_, i) => i * 2);
let checksum = 0;
for (let i = 0; i < 3; i++) checksum += missing(values, present).length;
const started = performance.now();
for (let i = 0; i < 8; i++) checksum += missing(values, present).length;
const elapsed = performance.now() - started;
if (checksum !== 22000) throw new Error('Benchmark output changed.');
console.log(JSON.stringify({ metric: elapsed, unit: 'ms' }));
