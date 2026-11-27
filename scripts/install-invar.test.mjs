import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { installInvar } from './install-invar.mjs';

test('Invar installation preserves executables and never executes an unverified download', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'capsule-invar-install-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = { HOME: home };
  let downloads = 0;
  const options = {
    env,
    platform: 'linux',
    arch: 'x64',
    run: (command) => {
      downloads++;
      assert.equal(command, 'curl', 'an unverified installer must never reach sh');
      return { status: 0, stdout: '#!/bin/sh\necho untrusted\n' };
    },
  };
  assert.match(installInvar({ ...options, env: { ...env, PI_INVAR_INSTALL: '0' } }), /disabled/);
  for (const platform of ['darwin', 'win32']) {
    assert.match(installInvar({ ...options, platform }), /Linux\/WSL x86_64 only/);
  }
  assert.match(installInvar({ ...options, arch: 'arm64' }), /Linux\/WSL x86_64 only/);
  assert.equal(downloads, 0);
  assert.throws(() => installInvar({ ...options, env: { ...env, INVAR_BIN: 'relative/invar' } }), /absolute path/);
  assert.throws(
    () => installInvar({ ...options, env: { ...env, INVAR_BIN: join(home, 'missing') } }),
    /does not exist/,
  );
  assert.equal(downloads, 0);

  const binary = join(home, '.local', 'bin', 'invar');
  mkdirSync(join(home, '.local', 'bin'), { recursive: true });
  writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const original = readFileSync(binary);
  assert.match(installInvar(options), /already installed/);
  assert.deepEqual(readFileSync(binary), original);
  assert.equal(downloads, 0);
  if (process.platform !== 'win32') {
    chmodSync(binary, 0o600);
    assert.throws(() => installInvar(options), /EACCES/);
  }
  rmSync(binary);
  assert.throws(() => installInvar(options), /checksum mismatch/);
  assert.equal(downloads, 1);
  assert.throws(() => installInvar({ ...options, run: () => ({ status: 1 }) }), /download failed/);
});
