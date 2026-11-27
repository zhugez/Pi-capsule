import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installTraceveil } from './install-traceveil.mjs';

test('Traceveil setup preserves executables, validates platform/libc and rejects unverified downloads', t => {
  const home = mkdtempSync(join(tmpdir(), 'capsule-traceveil-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  let calls = 0;
  const options = {
    env: { HOME: home }, platform: 'linux', arch: 'x64', libc: () => '2.34',
    run: command => { calls++; assert.equal(command, 'curl'); return { status: 0, stdout: 'untrusted installer' }; },
  };
  assert.match(installTraceveil({ ...options, env: { ...options.env, PI_TRACEVEIL_INSTALL: '0' } }), /disabled/);
  for (const platform of ['darwin', 'win32']) assert.match(installTraceveil({ ...options, platform }), /Linux\/WSL/);
  assert.match(installTraceveil({ ...options, arch: 'arm64' }), /Linux\/WSL/);
  for (const version of [undefined, '', 'musl', '2.9', '2.33', '2.34;invalid']) {
    assert.match(installTraceveil({ ...options, libc: () => version }), /requires glibc/);
  }
  assert.equal(calls, 0);
  assert.throws(() => installTraceveil({ ...options, env: { HOME: home, TRACEVEIL_BIN: 'relative' } }), /absolute/);
  assert.throws(() => installTraceveil({ ...options, env: { HOME: home, TRACEVEIL_BIN: join(home, 'absent') } }), /does not exist/);
  assert.equal(calls, 0);
  const binary = join(home, '.local/bin/traceveil');
  mkdirSync(join(home, '.local/bin'), { recursive: true });
  writeFileSync(binary, 'preserve existing executable\n', { mode: 0o700 });
  const original = readFileSync(binary);
  assert.match(installTraceveil(options), /preserved/);
  assert.deepEqual(readFileSync(binary), original);
  assert.equal(calls, 0);
  if (process.platform !== 'win32') {
    chmodSync(binary, 0o600);
    assert.throws(() => installTraceveil(options), /EACCES/);
    rmSync(binary);
    symlinkSync(join(home, 'missing-target'), binary);
    assert.throws(() => installTraceveil(options), /regular file/);
  }
  rmSync(binary);
  for (const version of ['2.34', '2.35', '2.100', '3.0']) {
    assert.throws(() => installTraceveil({ ...options, libc: () => version }), /checksum mismatch/);
  }
  assert.equal(calls, 4);
  assert.throws(() => installTraceveil({ ...options, run: () => ({ status: 22 }) }), /download failed/);
  assert.throws(() => installTraceveil({ ...options, run: () => ({ error: new Error('timeout') }) }), /download failed/);
});
