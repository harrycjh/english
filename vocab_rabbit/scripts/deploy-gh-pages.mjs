import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

async function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? projectRoot,
      stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    if (options.captureOutput) {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }

      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      reject(new Error(output || `${command} ${commandArgs.join(' ')} exited with code ${code}`));
    });
  });
}

async function gitOutput(cwd, ...gitArgs) {
  const result = await run('git', gitArgs, { cwd, captureOutput: true });
  return result.stdout;
}

async function readGitConfig(repoRoot, key) {
  try {
    const localValue = await gitOutput(repoRoot, 'config', '--get', key);
    if (localValue) {
      return localValue;
    }
  } catch {
    // Fall through to global config.
  }

  try {
    const globalValue = await gitOutput(repoRoot, 'config', '--global', '--get', key);
    if (globalValue) {
      return globalValue;
    }
  } catch {
    // Ignore and report below.
  }

  throw new Error(`Missing git config value for ${key}. Please set it before deploying.`);
}

async function main() {
  const repoRoot = await gitOutput(projectRoot, 'rev-parse', '--show-toplevel');
  const remoteUrl = await gitOutput(repoRoot, 'remote', 'get-url', 'origin');
  const gitUserName = await readGitConfig(repoRoot, 'user.name');
  const gitUserEmail = await readGitConfig(repoRoot, 'user.email');
  const distDir = path.join(projectRoot, 'dist');

  console.log('Building VocaRabbit for GitHub Pages...');
  await run('npm', ['run', 'build:github'], { cwd: projectRoot });

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'vocab-rabbit-gh-pages-'));
  const siteDir = path.join(tempRoot, 'site');

  try {
    await cp(distDir, siteDir, {
      recursive: true,
      filter: (source) => path.basename(source) !== '.DS_Store',
    });

    await writeFile(path.join(siteDir, '.nojekyll'), '');
    await cp(path.join(siteDir, 'index.html'), path.join(siteDir, '404.html'));

    await run('git', ['init', '-b', 'gh-pages'], { cwd: siteDir });
    await run('git', ['config', 'user.name', gitUserName], { cwd: siteDir });
    await run('git', ['config', 'user.email', gitUserEmail], { cwd: siteDir });
    await run('git', ['add', '.'], { cwd: siteDir });
    await run('git', ['commit', '-m', 'Deploy VocaRabbit site'], { cwd: siteDir });

    if (isDryRun) {
      console.log(`Dry run complete. Prepared gh-pages payload in ${siteDir}`);
      return;
    }

    await run('git', ['remote', 'add', 'origin', remoteUrl], { cwd: siteDir });
    await run('git', ['push', '--force', 'origin', 'gh-pages'], { cwd: siteDir });

    console.log('Deployed to gh-pages. GitHub Pages will publish from https://harrycjh.github.io/english/.');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});