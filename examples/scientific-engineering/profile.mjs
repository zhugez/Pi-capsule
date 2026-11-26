import { Session } from 'node:inspector/promises';
import { missing } from './target.mjs';

const session = new Session(); session.connect();
try {
  await session.post('Profiler.enable'); await session.post('Profiler.start');
  const values = Array.from({ length: 4000 }, (_, i) => i);
  const present = Array.from({ length: 4000 }, (_, i) => i * 2);
  for (let i = 0; i < 20; i++) missing(values, present);
  const { profile } = await session.post('Profiler.stop');
  console.log(JSON.stringify(profile.nodes.filter(n => n.hitCount).sort((a, b) => b.hitCount - a.hitCount).slice(0, 10).map(n => ({ function: n.callFrame.functionName, file: n.callFrame.url, samples: n.hitCount })), null, 2));
} finally { session.disconnect(); }
