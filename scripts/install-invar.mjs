import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const INSTALLER = 'https://raw.githubusercontent.com/zhugez/invar/8b065e44707329b506ab5692234ab2c6fd9a0337/install.sh';
const INSTALLER_SHA256 = '8426ffc6771b0e268e2051fdff056ea8610818903271d7a1fe6b012216b722ad';

export function installInvar({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  run = spawnSync,
} = {}) {
  if (env.PI_INVAR_INSTALL === '0') return 'Invar: automatic installation disabled by PI_INVAR_INSTALL=0.';
  if (platform !== 'linux' || arch !== 'x64') return 'Invar: automatic installation supports Linux/WSL x86_64 only.';
  const binary = env.INVAR_BIN ?? join(env.HOME || homedir(), '.local', 'bin', 'invar');
  if (!isAbsolute(binary)) throw new Error('INVAR_BIN must be an absolute path.');
  const checkBinary = () => {
    accessSync(binary, constants.X_OK);
    if (!statSync(binary).isFile()) throw new Error(`Invar executable is not a regular file: ${binary}`);
  };
  if (existsSync(binary)) {
    checkBinary();
    return `Invar: already installed at ${binary}.`;
  }
  if (env.INVAR_BIN) throw new Error(`INVAR_BIN does not exist: ${binary}. Install it or unset the override.`);
  const download = run(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--connect-timeout',
      '15',
      '--max-time',
      '30',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      INSTALLER,
    ],
    { env, encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 35_000 },
  );
  if (download.error || download.status !== 0)
    throw new Error('Invar installer download failed. Retry the Capsule setup.');
  if (createHash('sha256').update(download.stdout).digest('hex') !== INSTALLER_SHA256) {
    throw new Error('Invar installer checksum mismatch. No installer was executed.');
  }
  const installed = run('sh', [], {
    env,
    input: download.stdout,
    stdio: ['pipe', 'inherit', 'inherit'],
    timeout: 150_000,
  });
  if (installed.error || installed.status !== 0) throw new Error('Invar installation failed. Retry the Capsule setup.');
  checkBinary();
  return `Invar: installed at ${binary}. Pi will offer project setup on first launch.`;
}
