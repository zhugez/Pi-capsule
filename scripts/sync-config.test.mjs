import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-sync-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const target = path.join(root, 'home', '.pi', 'agent');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'agent'), { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(new URL('./sync-config.mjs', import.meta.url), path.join(repo, 'scripts/sync-config.mjs'));
  const put = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  put(path.join(repo, 'agent'), 'settings.json', { defaultModel: 'repo', retry: { maxRetries: 3 } });
  put(path.join(repo, 'agent'), 'mcp.json', { mcpServers: { shared: { command: 'repo' } } });
  put(path.join(repo, 'agent'), 'models.json', { providers: { shared: { apiKey: '$KEY', baseUrl: 'https://example.invalid' } } });
  put(target, 'settings.json', { defaultModel: 'local', localOnly: true });
  put(target, 'mcp.json', { mcpServers: { shared: { command: 'local', env: { TOKEN: 'synthetic-secret' } } } });
  put(target, 'models.json', { providers: { shared: { apiKey: 'synthetic-secret' }, localOnly: { apiKey: 'local-secret' } } });
  put(target, 'auth.json', { token: 'untouched-secret' });
  const run = (...args) => spawnSync(process.execPath, [path.join(repo, 'scripts/sync-config.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: path.join(root, 'home'), USERPROFILE: path.join(root, 'home'), PI_AGENT_DIR: target, npm_lifecycle_event: '', PI_CAPSULE_DELAYED_SYNC: '1' },
  });
  const snapshot = () => Object.fromEntries(fs.readdirSync(target).sort().map(name => [name, fs.readFileSync(path.join(target, name), 'utf8')]));
  const read = name => JSON.parse(fs.readFileSync(path.join(target, name), 'utf8'));
  return { repo, target, run, snapshot, read };
}

test('preserves supported local preferences and credentials; repeat sync is a no-op', t => {
  const f = fixture(t);
  const auth = f.snapshot()['auth.json'];
  const first = f.run('--models');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(f.read('settings.json').defaultModel, 'local');
  assert.equal(f.read('settings.json').localOnly, true);
  assert.equal(f.read('settings.json').retry.maxRetries, 3);
  assert.equal(f.read('models.json').providers.shared.apiKey, 'synthetic-secret');
  assert.equal(f.read('models.json').providers.localOnly.apiKey, 'local-secret');
  assert.equal(f.read('mcp.json').mcpServers.shared.env.TOKEN, 'synthetic-secret');
  assert.equal(f.snapshot()['auth.json'], auth);
  const before = f.snapshot();
  assert.equal(f.run('--models').status, 0);
  assert.deepEqual(f.snapshot(), before);
});

test('dry-run does not change files', t => {
  const f = fixture(t);
  const before = f.snapshot();
  assert.equal(f.run('--dry-run', '--models').status, 0);
  assert.deepEqual(f.snapshot(), before);
});

for (const side of ['local', 'repo']) {
  for (const name of ['settings.json', 'mcp.json', 'models.json']) {
    for (const invalid of ['{"secret":"do-not-log",', 'null', '[]']) {
      test(`rejects invalid ${side} ${name}: ${invalid} before any writes`, t => {
        const f = fixture(t);
        fs.writeFileSync(path.join(side === 'local' ? f.target : path.join(f.repo, 'agent'), name), invalid);
        const before = f.snapshot();
        const result = f.run('--models');
        assert.notEqual(result.status, 0);
        assert.ok(result.stderr.includes(name));
        assert.ok(!result.stderr.includes('do-not-log'));
        assert.deepEqual(f.snapshot(), before);
      });
    }
  }
}
