import assert from 'node:assert/strict';
import { missing } from './target.mjs';

const reference = (values, present) => values.filter(value => !present.includes(value));
const cases = [[], [1], [1, 1, 2], [NaN, -0, 0, 1], ['a', 'b', 'a']];
for (const values of cases) for (const present of cases) assert.deepEqual(missing(values, present), reference(values, present));
let seed = 12345;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % 100;
for (let trial = 0; trial < 100; trial++) {
  const values = Array.from({ length: 100 }, random);
  const present = Array.from({ length: 100 }, random);
  assert.deepEqual(missing(values, present), reference(values, present));
}
console.log('Fixed correctness cases and seeded cases passed.');
