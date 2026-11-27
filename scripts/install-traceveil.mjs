import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const INSTALLER = 'https://raw.githubusercontent.com/zhugez/traceveil/c1a2375d9274af86f582d31e841a1376675169e3/install.sh';
const INSTALLER_SHA256 = '6e828cbfb9b36e1976814248e3190c673cb66bc7e427b5ab4ef1192db0f71290';

export function installTraceveil({
  env = process.env, platform = process.platform, arch = process.arch,
  libc = () => process.report.getReport().header.glibcVersionRuntime, run = spawnSync,
} = {}) {
  if (env.PI_TRACEVEIL_INSTALL === '0') return 'Traceveil: installation disabled by PI_TRACEVEIL_INSTALL=0.';
  if (platform !== 'linux' || arch !== 'x64') return 'Traceveil: automatic installation supports Linux/WSL x86_64 only. Install from source and set TRACEVEIL_BIN on other platforms.';
  const prefix = join(env.HOME || homedir(), '.local');
  const binary = env.TRACEVEIL_BIN ?? join(prefix, 'bin', 'traceveil');
  if (!isAbsolute(binary)) throw new Error('TRACEVEIL_BIN must be an absolute path.');
  const checkBinary = () => {
    if (!lstatSync(binary).isFile()) throw new Error('Traceveil executable must be a regular file.');
    accessSync(binary, constants.X_OK);
  };
  try {
    checkBinary();
    return 'Traceveil: existing executable preserved.';
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (env.TRACEVEIL_BIN) throw new Error('TRACEVEIL_BIN does not exist. Install it or unset the override.');
  }
  const version = libc();
  const parts = typeof version === 'string' && /^\d+\.\d+(?:\.\d+)*$/.test(version) ? version.split('.').map(Number) : [];
  if (!(parts[0] > 2 || (parts[0] === 2 && parts[1] >= 34))) {
    return 'Traceveil: prebuilt installation requires glibc 2.34 or newer. Install from source on this system.';
  }
  const download = run('curl', [
    '--disable', '--fail', '--silent', '--show-error', '--location', '--connect-timeout', '15',
    '--max-time', '30', '--max-filesize', '65536', '--proto', '=https', '--proto-redir', '=https', INSTALLER,
  ], { env, encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 35_000, killSignal: 'SIGKILL' });
  if (download.error || download.status !== 0) throw new Error('Traceveil installer download failed. Retry node scripts/install-traceveil.mjs.');
  if (createHash('sha256').update(download.stdout).digest('hex') !== INSTALLER_SHA256) {
    throw new Error('Traceveil installer checksum mismatch. No installer was executed.');
  }
  const installed = run('sh', [], {
    env: { ...env, TRACEVEIL_HOME: prefix }, input: download.stdout,
    stdio: ['pipe', 'inherit', 'inherit'], timeout: 150_000, killSignal: 'SIGKILL',
  });
  if (installed.error || installed.status !== 0) throw new Error('Traceveil installation failed. Retry node scripts/install-traceveil.mjs.');
  checkBinary();
  return 'Traceveil: installed. Use /traceveil demo in Pi; /traceveil analyzes the current saved branch only when requested.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(installTraceveil()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
