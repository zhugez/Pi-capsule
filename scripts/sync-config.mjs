#!/usr/bin/env node
/**
 * Safe config sync for Pi Coding Agent.
 * Syncs repo agent/ configuration to target PI_AGENT_DIR (~/.pi/agent).
 *
 * Usage:
 *   node scripts/sync-config.mjs [--dry-run] [--models]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const REPO_AGENT_DIR = path.join(REPO_ROOT, 'agent');

const envAgentDir = process.env.PI_AGENT_DIR || process.env.PI_CODING_AGENT_DIR;
const TARGET_AGENT_DIR = envAgentDir
  ? path.resolve(envAgentDir)
  : path.join(os.homedir(), '.pi', 'agent');

const NEVER_TOUCH = new Set([
  'auth.json',
  'antigravity-accounts.json',
  'codex-accounts.json',
  'mcp-auth.json',
  'models-store.json',
  'sessions',
  'git',
  'npm',
]);

function assertSafePath(filePath) {
  const rel = path.relative(TARGET_AGENT_DIR, filePath);
  if (rel.startsWith('..') && !path.isAbsolute(rel)) return;
  const segments = rel.split(/[\\/]/).filter(Boolean);
  if (segments.length > 0) {
    const first = segments[0].toLowerCase();
    for (const forbidden of NEVER_TOUCH) {
      if (first === forbidden.toLowerCase()) {
        throw new Error(`SECURITY: Attempted access to protected path: ${filePath}`);
      }
    }
  }
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const includeModels = args.includes('--models');

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObject(source[key]) && isPlainObject(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function normalizePackageSource(pkg) {
  const src = typeof pkg === 'string' ? pkg : (pkg?.source || '');
  return src.replace(/\.git$/, '');
}

function getOverlappingSkills() {
  const sharedSkillsDir = path.join(os.homedir(), '.agents', 'skills');
  const repoSkillsDir = path.join(REPO_AGENT_DIR, 'skills');

  if (!fs.existsSync(sharedSkillsDir) || !fs.existsSync(repoSkillsDir)) {
    return [];
  }

  let sharedEntries = [];
  try {
    sharedEntries = fs.readdirSync(sharedSkillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isSymbolicLink())
      .map((d) => d.name);
  } catch {
    return [];
  }

  let repoEntries = [];
  try {
    repoEntries = fs.readdirSync(repoSkillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  const sharedSet = new Set(sharedEntries);
  return repoEntries.filter((name) => sharedSet.has(name)).sort();
}

function buildCapsulePackageEntry() {
  const capsuleSource = 'git:github.com/zhugez/pi-capsule';
  const overlaps = getOverlappingSkills();

  if (overlaps.length === 0) {
    return capsuleSource;
  }

  return {
    source: capsuleSource,
    skills: overlaps.map((name) => `!agent/skills/${name}`),
  };
}

function mergePackages(localPackages = [], repoPackages = []) {
  const result = [];
  const seenSources = new Set();
  const capsuleNormalized = normalizePackageSource('git:github.com/zhugez/pi-capsule');
  const configuredCapsuleEntry = buildCapsulePackageEntry();

  // 1. Process local packages first to preserve order and local-only packages
  for (const pkg of localPackages) {
    const norm = normalizePackageSource(pkg);
    if (!norm) continue;

    if (norm === capsuleNormalized) {
      result.push(configuredCapsuleEntry);
      seenSources.add(norm);
    } else {
      // Keep local package as-is (including object form)
      result.push(pkg);
      seenSources.add(norm);
    }
  }

  // 2. Add repo packages that are not present locally
  for (const pkg of repoPackages) {
    const norm = normalizePackageSource(pkg);
    if (!norm || seenSources.has(norm)) continue;

    if (norm === capsuleNormalized) {
      result.push(configuredCapsuleEntry);
      seenSources.add(norm);
    } else {
      result.push(pkg);
      seenSources.add(norm);
    }
  }

  // 3. Ensure capsule package is always present
  if (!seenSources.has(capsuleNormalized)) {
    result.push(configuredCapsuleEntry);
    seenSources.add(capsuleNormalized);
  }

  return result;
}

// Per-machine preferences: keep the local value when present so a package
// update (postinstall) never reverts a machine's own choice.
const LOCAL_PREFERENCE_KEYS = [
  'lastChangelogVersion',
  'defaultProvider',
  'defaultModel',
  'defaultThinkingLevel',
  'theme',
];

function mergeSettings(local = {}, repo = {}) {
  const merged = deepMerge(local, repo);

  // Packages exception: union by source identity with local priority
  const localPackages = Array.isArray(local.packages) ? local.packages : [];
  const repoPackages = Array.isArray(repo.packages) ? repo.packages : [];
  merged.packages = mergePackages(localPackages, repoPackages);

  for (const key of LOCAL_PREFERENCE_KEYS) {
    if (local[key] !== undefined) merged[key] = local[key];
  }

  // Replace stale WorkBuddy fallback aliases with the repo's callable default.
  // Pi can persist `default-model` when its dynamic catalog was unavailable;
  // preserving that alias makes every later startup fail before refresh.
  const staleWorkBuddyModel = merged.defaultProvider === 'workbuddy';
  if (staleWorkBuddyModel) {
    for (const key of ['defaultModel', 'defaultThinkingLevel']) {
      if (repo[key] !== undefined) merged[key] = repo[key];
    }
  }

  return merged;
}

function mergeMcp(local = {}, repo = {}) {
  const localServers = local.mcpServers && typeof local.mcpServers === 'object' ? local.mcpServers : {};
  const repoServers = repo.mcpServers && typeof repo.mcpServers === 'object' ? repo.mcpServers : {};

  // Local wins on conflict
  const mergedServers = { ...repoServers, ...localServers };

  const merged = { ...repo, ...local };
  merged.mcpServers = mergedServers;
  return merged;
}

function mergeModels(local = {}, repo = {}) {
  const localProviders = local.providers && typeof local.providers === 'object' ? local.providers : {};
  const repoProviders = repo.providers && typeof repo.providers === 'object' ? repo.providers : {};

  const mergedProviders = {};

  // For providers in repo: repo values win for non-apiKey fields, keep local apiKey if non-empty
  for (const [key, repoProv] of Object.entries(repoProviders)) {
    const localProv = localProviders[key];
    if (localProv && typeof localProv === 'object') {
      const mergedProv = { ...repoProv };
      if (typeof localProv.apiKey === 'string' && localProv.apiKey.trim().length > 0) {
        mergedProv.apiKey = localProv.apiKey;
      }
      mergedProviders[key] = mergedProv;
    } else {
      mergedProviders[key] = { ...repoProv };
    }
  }

  // Keep local-only providers
  for (const [key, localProv] of Object.entries(localProviders)) {
    if (!mergedProviders[key]) {
      mergedProviders[key] = { ...localProv };
    }
  }

  const merged = { ...local, ...repo };
  merged.providers = mergedProviders;
  return merged;
}

function generateLineDiff(oldStr, newStr) {
  const a = oldStr ? oldStr.split('\n') : [];
  const b = newStr ? newStr.split('\n') : [];
  const N = a.length;
  const M = b.length;

  const dp = Array.from({ length: N + 1 }, () => new Int32Array(M + 1));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = N;
  let j = M;
  const edits = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.push({ type: ' ', line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push({ type: '+', line: b[j - 1] });
      j--;
    } else {
      edits.push({ type: '-', line: a[i - 1] });
      i--;
    }
  }
  edits.reverse();

  const CONTEXT = 3;
  const hunks = [];
  let currentHunk = null;

  for (let idx = 0; idx < edits.length; idx++) {
    if (edits[idx].type !== ' ') {
      const start = Math.max(0, idx - CONTEXT);
      const end = Math.min(edits.length, idx + CONTEXT + 1);
      if (!currentHunk) {
        currentHunk = { start, end };
      } else if (idx - currentHunk.end <= CONTEXT) {
        currentHunk.end = end;
      } else {
        hunks.push(currentHunk);
        currentHunk = { start, end };
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  if (hunks.length === 0) return '';

  const lines = [];
  for (const h of hunks) {
    lines.push('@@ ... @@');
    for (let k = h.start; k < h.end; k++) {
      lines.push(`${edits[k].type} ${edits[k].line}`);
    }
  }
  return lines.join('\n');
}

function writeAtomicWithBackup(targetPath, newContent, mode = null) {
  assertSafePath(targetPath);
  const exists = fs.existsSync(targetPath);

  if (exists) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bakPath = `${targetPath}.bak-${timestamp}`;
    assertSafePath(bakPath);
    fs.copyFileSync(targetPath, bakPath);
  }

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = path.join(
    dir,
    `.${path.basename(targetPath)}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const writeOptions = mode ? { encoding: 'utf8', mode } : 'utf8';
  fs.writeFileSync(tmpPath, newContent, writeOptions);
  fs.renameSync(tmpPath, targetPath);

  if (mode && process.platform !== 'win32') {
    try {
      fs.chmodSync(targetPath, mode);
    } catch {
      // ignore on systems not supporting chmod
    }
  }
}

function migrateDuplicateResources(summary) {
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const migratedRoot = path.join(TARGET_AGENT_DIR, `migrated-${dateStamp}`);
  const movedItems = [];

  // 1. Duplicate extensions in ~/.pi/agent/extensions/<file>.ts
  const repoExtDir = path.join(REPO_AGENT_DIR, 'extensions');
  const localExtDir = path.join(TARGET_AGENT_DIR, 'extensions');
  if (fs.existsSync(repoExtDir) && fs.existsSync(localExtDir)) {
    const repoExts = new Set(
      fs.readdirSync(repoExtDir, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.ts'))
        .map((d) => d.name)
    );
    for (const entry of fs.readdirSync(localExtDir, { withFileTypes: true })) {
      if ((entry.isFile() || entry.isSymbolicLink()) && repoExts.has(entry.name)) {
        const srcPath = path.join(localExtDir, entry.name);
        const destDir = path.join(migratedRoot, 'extensions');
        const destPath = path.join(destDir, entry.name);
        if (!isDryRun) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.renameSync(srcPath, destPath);
        }
        movedItems.push(`extensions/${entry.name}`);
      }
    }
  }

  // 2. Duplicate prompts in ~/.pi/agent/prompts/<file>.md
  const repoPromptsDir = path.join(REPO_AGENT_DIR, 'prompts');
  const localPromptsDir = path.join(TARGET_AGENT_DIR, 'prompts');
  if (fs.existsSync(repoPromptsDir) && fs.existsSync(localPromptsDir)) {
    const repoPrompts = new Set(
      fs.readdirSync(repoPromptsDir, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.md'))
        .map((d) => d.name)
    );
    for (const entry of fs.readdirSync(localPromptsDir, { withFileTypes: true })) {
      if ((entry.isFile() || entry.isSymbolicLink()) && repoPrompts.has(entry.name)) {
        const srcPath = path.join(localPromptsDir, entry.name);
        const destDir = path.join(migratedRoot, 'prompts');
        const destPath = path.join(destDir, entry.name);
        if (!isDryRun) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.renameSync(srcPath, destPath);
        }
        movedItems.push(`prompts/${entry.name}`);
      }
    }
  }

  // 3. Duplicate non-symlink skill directories in ~/.pi/agent/skills/<name>
  const repoSkillsDir = path.join(REPO_AGENT_DIR, 'skills');
  const localSkillsDir = path.join(TARGET_AGENT_DIR, 'skills');
  if (fs.existsSync(repoSkillsDir) && fs.existsSync(localSkillsDir)) {
    const repoSkills = new Set(
      fs.readdirSync(repoSkillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    );
    for (const entry of fs.readdirSync(localSkillsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && repoSkills.has(entry.name)) {
        const srcPath = path.join(localSkillsDir, entry.name);
        const destDir = path.join(migratedRoot, 'skills');
        const destPath = path.join(destDir, entry.name);
        if (!isDryRun) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.renameSync(srcPath, destPath);
        }
        movedItems.push(`skills/${entry.name}`);
      }
    }
  }

  if (movedItems.length > 0) {
    summary.changed.push(`migrated duplicates (${movedItems.length}) -> migrated-${dateStamp}/`);
  }
}

function main() {
  const summary = {
    changed: [],
    unchanged: [],
    skipped: [],
  };

  // Validate every selected input before writes or resource migrations. Do not
  // include parser errors: they can echo credentials from malformed JSON.
  for (const filename of ['settings.json', 'mcp.json', ...(includeModels ? ['models.json'] : [])]) {
    for (const dir of [REPO_AGENT_DIR, TARGET_AGENT_DIR]) {
      const filePath = path.join(dir, filename);
      if (!fs.existsSync(filePath)) continue;
      try {
        if (!isPlainObject(JSON.parse(fs.readFileSync(filePath, 'utf8')))) throw new Error();
      } catch {
        console.error(`Invalid JSON object: ${filePath}. Sync aborted; no files changed.`);
        process.exitCode = 1;
        return;
      }
    }
  }

  if (!fs.existsSync(TARGET_AGENT_DIR) && !isDryRun) {
    fs.mkdirSync(TARGET_AGENT_DIR, { recursive: true });
  }

  console.log(`Sync config: repo agent/ -> ${TARGET_AGENT_DIR}`);
  if (isDryRun) console.log('[dry-run mode enabled - no files will be written]');

  // 1. settings.json
  const settingsTargetPath = path.join(TARGET_AGENT_DIR, 'settings.json');
  const settingsRepoPath = path.join(REPO_AGENT_DIR, 'settings.json');
  assertSafePath(settingsTargetPath);

  let hadCapsuleBefore = true;
  if (fs.existsSync(settingsRepoPath)) {
    let localSettings = {};
    let localExists = false;
    let localRaw = '';

    if (fs.existsSync(settingsTargetPath)) {
      localExists = true;
      localRaw = fs.readFileSync(settingsTargetPath, 'utf8');
      try {
        localSettings = JSON.parse(localRaw);
      } catch (err) {
        throw new Error(`Cannot parse ${settingsTargetPath}; sync aborted.`);
      }
    }

    const capsuleNormalized = normalizePackageSource('git:github.com/zhugez/pi-capsule');
    const localPkgs = Array.isArray(localSettings.packages) ? localSettings.packages : [];
    hadCapsuleBefore = localPkgs.some((p) => normalizePackageSource(p) === capsuleNormalized);

    const repoSettings = JSON.parse(fs.readFileSync(settingsRepoPath, 'utf8'));
    const mergedSettings = mergeSettings(localSettings, repoSettings);
    const newSettingsRaw = JSON.stringify(mergedSettings, null, 2) + '\n';

    if (localExists && localRaw === newSettingsRaw) {
      summary.unchanged.push('settings.json');
    } else {
      if (isDryRun) {
        console.log('\n--- settings.json (diff) ---');
        console.log(generateLineDiff(localRaw, newSettingsRaw));
        summary.changed.push('settings.json');
      } else {
        writeAtomicWithBackup(settingsTargetPath, newSettingsRaw, 0o600);
        summary.changed.push('settings.json');
      }
    }
  }

  // Migrate any duplicate top-level extensions/prompts/non-symlink skills
  migrateDuplicateResources(summary);

  // If invoked via `pi install git:github.com/zhugez/pi-capsule` for the first time,
  // `pi install` flushes its in-memory settings right after `npm install` finishes.
  // Re-run the (idempotent) sync a few times so a slow machine still ends up merged.
  if (
    !isDryRun &&
    !hadCapsuleBefore &&
    process.env.npm_lifecycle_event === 'postinstall' &&
    !process.env.PI_CAPSULE_DELAYED_SYNC
  ) {
    const delays = [1500, 4000, 10000, 20000];
    const child = spawn(
      process.execPath,
      [
        '-e',
        `const { spawnSync } = require('node:child_process');
for (const d of ${JSON.stringify(delays)}) {
  setTimeout(() => {
    spawnSync(${JSON.stringify(process.execPath)}, [${JSON.stringify(__filename)}, '--models'], {
      stdio: 'ignore',
      env: { ...process.env, PI_CAPSULE_DELAYED_SYNC: '1' },
    });
  }, d);
}`,
      ],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
  }

  // 2. mcp.json
  const mcpTargetPath = path.join(TARGET_AGENT_DIR, 'mcp.json');
  const mcpRepoPath = path.join(REPO_AGENT_DIR, 'mcp.json');
  assertSafePath(mcpTargetPath);

  if (fs.existsSync(mcpRepoPath)) {
    let localMcp = {};
    let localExists = false;
    let localRaw = '';

    if (fs.existsSync(mcpTargetPath)) {
      localExists = true;
      localRaw = fs.readFileSync(mcpTargetPath, 'utf8');
      try {
        localMcp = JSON.parse(localRaw);
      } catch (err) {
        throw new Error(`Cannot parse ${mcpTargetPath}; sync aborted.`);
      }
    }

    const repoMcp = JSON.parse(fs.readFileSync(mcpRepoPath, 'utf8'));
    const mergedMcp = mergeMcp(localMcp, repoMcp);
    const newMcpRaw = JSON.stringify(mergedMcp, null, 2) + '\n';

    if (localExists && localRaw === newMcpRaw) {
      summary.unchanged.push('mcp.json');
    } else {
      if (isDryRun) {
        console.log('\n--- mcp.json (diff) ---');
        console.log(generateLineDiff(localRaw, newMcpRaw));
        summary.changed.push('mcp.json');
      } else {
        writeAtomicWithBackup(mcpTargetPath, newMcpRaw);
        summary.changed.push('mcp.json');
      }
    }
  }

  // 3. pi-fff.json, subscription-usage-prefs.json, AGENTS.md (copy only if missing locally)
  const copyIfMissing = ['pi-fff.json', 'subscription-usage-prefs.json', 'AGENTS.md'];
  for (const filename of copyIfMissing) {
    const targetPath = path.join(TARGET_AGENT_DIR, filename);
    const repoPath = path.join(REPO_AGENT_DIR, filename);
    assertSafePath(targetPath);

    if (!fs.existsSync(repoPath)) continue;

    if (fs.existsSync(targetPath)) {
      summary.unchanged.push(filename);
    } else {
      const content = fs.readFileSync(repoPath, 'utf8');
      if (isDryRun) {
        console.log(`\n+ [create] ${filename}`);
        summary.changed.push(filename);
      } else {
        writeAtomicWithBackup(targetPath, content);
        summary.changed.push(filename);
      }
    }
  }

  // 4. models.json (only with --models)
  const modelsTargetPath = path.join(TARGET_AGENT_DIR, 'models.json');
  const modelsRepoPath = path.join(REPO_AGENT_DIR, 'models.json');
  assertSafePath(modelsTargetPath);

  if (fs.existsSync(modelsRepoPath)) {
    if (!includeModels) {
      summary.skipped.push('models.json (requires --models)');
    } else {
      let localModels = {};
      let localExists = false;
      let localRaw = '';

      if (fs.existsSync(modelsTargetPath)) {
        localExists = true;
        localRaw = fs.readFileSync(modelsTargetPath, 'utf8');
        try {
          localModels = JSON.parse(localRaw);
        } catch (err) {
          throw new Error(`Cannot parse ${modelsTargetPath}; sync aborted.`);
        }
      }

      const repoModels = JSON.parse(fs.readFileSync(modelsRepoPath, 'utf8'));
      const mergedModels = mergeModels(localModels, repoModels);
      const newModelsRaw = JSON.stringify(mergedModels, null, 2) + '\n';

      if (localExists && localRaw === newModelsRaw) {
        summary.unchanged.push('models.json');
      } else {
        if (isDryRun) {
          console.log('\n--- models.json (diff) ---');
          console.log(generateLineDiff(localRaw, newModelsRaw));
          summary.changed.push('models.json');
        } else {
          writeAtomicWithBackup(modelsTargetPath, newModelsRaw, 0o600);
          summary.changed.push('models.json');
        }
      }
    }
  }

  // Print Summary
  console.log('\nSummary:');
  const prefix = isDryRun ? 'would change' : 'changed';
  console.log(`  ${prefix}: ${summary.changed.length > 0 ? summary.changed.join(', ') : 'none'}`);
  console.log(`  unchanged: ${summary.unchanged.length > 0 ? summary.unchanged.join(', ') : 'none'}`);
  console.log(`  skipped: ${summary.skipped.length > 0 ? summary.skipped.join(', ') : 'none'}`);
}

main();
