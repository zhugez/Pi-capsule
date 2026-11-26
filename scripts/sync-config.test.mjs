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

test('excludes the two skills Capsule already provides from Pulse', t => {
  const f = fixture(t);
  const source = 'git:github.com/zhugez/pi-pulse';
  const exclusions = ['!skills/chrome-extensions', '!skills/modern-web-guidance'];
  fs.writeFileSync(path.join(f.repo, 'agent', 'settings.json'), JSON.stringify({ packages: [source] }));
  for (const [local, expected] of [
    [undefined, { source, skills: exclusions }],
    [{ source, skills: ['!ponytail-help'], extensions: [] }, { source, skills: ['!ponytail-help', ...exclusions], extensions: [] }],
    [{ source, skills: [] }, { source, skills: [] }],
  ]) {
    fs.writeFileSync(path.join(f.target, 'settings.json'), JSON.stringify({ packages: local ? [local] : [] }));
    assert.equal(f.run().status, 0);
    assert.deepEqual(f.read('settings.json').packages[0], expected);
    const before = f.snapshot();
    assert.equal(f.run().status, 0);
    assert.deepEqual(f.snapshot(), before);
  }
});

test('converges on the configured ShotCraft pin and preserves local filters', t => {
  const f = fixture(t);
  const { packages, skills } = JSON.parse(fs.readFileSync(new URL('../agent/settings.json', import.meta.url), 'utf8'));
  const source = 'git:github.com/Vincentwei1021/video-shotcraft';
  const skill = 'git/github.com/Vincentwei1021/video-shotcraft/SKILL.md';
  const shotcraft = packages.find(entry => entry.source?.split('@')[0] === source);
  assert.equal(shotcraft?.autoload, false);
  assert.match(shotcraft.source.slice(source.length), /^@[a-f0-9]{40}$/);
  assert.ok(skills.includes(skill));
  const https = 'https://github.com/Vincentwei1021/video-shotcraft.git';
  fs.writeFileSync(path.join(f.repo, 'agent', 'settings.json'), JSON.stringify({ packages: [https, shotcraft], skills: [skill] }));

  const pulse = { source: 'git:github.com/zhugez/pi-pulse', skills: ['!some-skill'] };
  const others = [
    { source: 'git:github.com/example/video-shotcraft@local', skills: [] },
    'https://github.com.evil/Vincentwei1021/video-shotcraft.git',
    'https://github.com/Vincentwei1021/video-shotcraft-extra.git',
  ];
  const localFilters = { skills: ['!shotcraft-local'], extensions: [] };
  for (const [local, expected] of [
    [[], shotcraft],
    [[{ source, autoload: true, ...localFilters }, `${source}.git@old-ref`, shotcraft.source], { ...shotcraft, ...localFilters }],
    [[`${source}@old-ref`], shotcraft],
    [[shotcraft.source], shotcraft],
    [[https], shotcraft],
    [[{ source: `git:${https}@old-ref`, ...localFilters }, `${https}#old-ref`, source], { ...shotcraft, ...localFilters }],
    [['git:github:Vincentwei1021/video-shotcraft', 'ssh://git@github.com/Vincentwei1021/video-shotcraft.git'], shotcraft],
  ]) {
    fs.writeFileSync(path.join(f.target, 'settings.json'), JSON.stringify({ packages: [pulse, ...others, ...local], skills: ['!local-skill'] }));

    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.read('settings.json'), {
      skills: ['!local-skill', skill],
      packages: [
        { ...pulse, skills: [...pulse.skills, '!skills/chrome-extensions', '!skills/modern-web-guidance'] },
        ...others,
        expected,
        'git:github.com/zhugez/pi-capsule',
      ],
    });
    const before = f.snapshot();
    assert.equal(f.run().status, 0);
    assert.deepEqual(f.snapshot(), before);
  }
});

test('preserves runtime preferences, model choices and deliberate provider removals', t => {
  const f = fixture(t);
  const repo = {
    retry: { enabled: true, maxRetries: 8, baseDelayMs: 5000, provider: { timeoutMs: 120000 } },
    compaction: { keepRecentTokens: 20000, modelOverrides: { 'current/model': { reserveTokens: 1000 }, 'removed/model': { reserveTokens: 500 } } },
    cacheWarming: 'idle',
    defaultTools: ['read'],
    extensionChangelogVersions: { pulse: '1.0.0' },
  };
  const local = {
    retry: { maxRetries: 3, baseDelayMs: 2000 },
    compaction: { keepRecentTokens: 12000, modelOverrides: { 'current/model': { reserveTokens: 700000 } } },
    cacheWarming: 'off',
    defaultTools: ['+codemode'],
    extensions: ['-extensions/numes-pool.ts'],
    extensionChangelogVersions: { pulse: '1.1.0' },
  };
  fs.writeFileSync(path.join(f.repo, 'agent', 'settings.json'), JSON.stringify(repo));
  fs.writeFileSync(path.join(f.target, 'settings.json'), JSON.stringify(local));
  fs.writeFileSync(path.join(f.repo, 'agent', 'models.json'), JSON.stringify({ providers: {
    shared: { apiKey: '$KEY', baseUrl: 'https://repo.invalid', models: [{ id: 'repo' }] },
    removed: { apiKey: '$REMOVED', models: [{ id: 'removed' }] },
  } }));
  const localModels = { providers: { shared: { apiKey: 'synthetic-secret', baseUrl: 'https://local.invalid', models: [{ id: 'local' }] } } };
  fs.writeFileSync(path.join(f.target, 'models.json'), JSON.stringify(localModels));
  const result = f.run('--models');
  assert.equal(result.status, 0, result.stderr);
  const actual = f.read('settings.json');
  for (const [key, value] of Object.entries(local)) assert.deepEqual(actual[key], value);
  assert.deepEqual(f.read('models.json'), localModels);
  const before = f.snapshot();
  assert.equal(f.run('--models').status, 0);
  assert.deepEqual(f.snapshot(), before);
});

test('preserves Capsule resource switches and an explicitly empty model catalog', t => {
  const f = fixture(t);
  const capsule = { source: 'git:github.com/zhugez/pi-capsule', skills: [], extensions: ['-agent/extensions/auto-warmup.ts', '-agent/extensions/auto-update-check.ts'] };
  fs.writeFileSync(path.join(f.target, 'settings.json'), JSON.stringify({ packages: [capsule] }));
  fs.writeFileSync(path.join(f.target, 'models.json'), JSON.stringify({ providers: {} }));
  assert.equal(f.run('--models').status, 0);
  assert.deepEqual(f.read('settings.json').packages[0], capsule);
  assert.deepEqual(f.read('models.json').providers, {});
  const extensionOnly = { source: capsule.source, extensions: capsule.extensions };
  fs.writeFileSync(path.join(f.target, 'settings.json'), JSON.stringify({ packages: [extensionOnly] }));
  assert.equal(f.run('--models').status, 0);
  assert.deepEqual(f.read('settings.json').packages[0], extensionOnly);
  const before = f.snapshot();
  assert.equal(f.run('--models').status, 0);
  assert.deepEqual(f.snapshot(), before);
});

test('seeds model providers on a fresh install and keeps callable WorkBuddy choices', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.target, 'models.json'));
  fs.writeFileSync(path.join(f.target, 'settings.json'), JSON.stringify({ defaultProvider: 'workbuddy', defaultModel: 'callable-model' }));
  assert.equal(f.run('--models').status, 0);
  assert.equal(f.read('models.json').providers.shared.baseUrl, 'https://example.invalid');
  assert.equal(f.read('settings.json').defaultModel, 'callable-model');
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

test('advisor repair is explicit, backed up and repeatable', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const defaults = f.read('advisor.json');
  assert.equal(defaults.executor, 'codex-pool/gpt-6.2-sol');
  assert.equal(defaults.advisor, 'codex-pool/gpt-6.2-astra');
  assert.equal(defaults.advisorToolsEnabled, false);
  for (const raw of ['{"executor":"old","contextMaxChars":123,"advisorFallbackModel":"old"}', '{invalid', '[]']) {
    fs.writeFileSync(path.join(f.target, 'advisor.json'), raw);
    const before = f.snapshot();
    assert.equal(f.run().status, 0);
    assert.equal(f.run('--dry-run', '--repair-advisor').status, 0);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.run('--repair-advisor').status, 0);
    const repaired = f.snapshot();
    assert.ok(Object.entries(repaired).some(([k,v]) => k.startsWith('advisor.json.bak-') && v === raw));
    assert.deepEqual(f.read('advisor.json'), raw.includes('contextMaxChars') ? { ...defaults, contextMaxChars: 123 } : defaults);
    assert.equal(f.run('--repair-advisor').status, 0);
    assert.deepEqual(f.snapshot(), repaired);
  }
});
