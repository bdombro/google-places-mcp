#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const FORMULA_NAME = 'google-places-mcp';
const TAP_NAME = 'bdombro/google-places-mcp';
const TAP_SHORT_DIR = 'homebrew-google-places-mcp';
const FORMULA_PATH = path.join(REPO_ROOT, 'Formula', `${FORMULA_NAME}.rb`);
const STAGING_DIR = path.join(REPO_ROOT, 'Formula', '.staging');
const BINARY_PATH = path.join(REPO_ROOT, 'build', 'bin', FORMULA_NAME);
const ENDPOINT_URL = 'http://127.0.0.1:8084/mcp';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    ...opts,
  });
}

function brewPrefix() {
  return run('brew', ['--prefix'], { capture: true }).trim();
}

function tapDir() {
  return path.join(brewPrefix(), 'Library', 'Taps', 'bdombro', TAP_SHORT_DIR);
}

function ensureTapLinked() {
  const dir = tapDir();
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() && fs.readlinkSync(dir) === REPO_ROOT) {
      return;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Not linked yet
  }
  fs.symlinkSync(REPO_ROOT, dir);
}

function refuseNonTapConflict() {
  try {
    const out = run('brew', ['info', '--json=v2', FORMULA_NAME], { capture: true });
    const info = JSON.parse(out);
    const f = info?.formulae?.[0];
    if (f && f.installed?.length > 0 && f.tap && f.tap !== TAP_NAME) {
      throw new Error(
        `Refusing to proceed: ${FORMULA_NAME} is already installed from ${f.tap}. Uninstall it before using ${TAP_NAME}.`,
      );
    }
  } catch (err) {
    if (err.message?.includes('Refusing to proceed')) throw err;
  }
}

function createLocalTarball() {
  if (!fs.existsSync(BINARY_PATH)) {
    throw new Error(`Missing Release binary at ${BINARY_PATH}. Run 'just build' first.`);
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  const stageContentDir = path.join(STAGING_DIR, 'pkg');
  fs.rmSync(stageContentDir, { recursive: true, force: true });
  fs.mkdirSync(stageContentDir, { recursive: true });
  fs.copyFileSync(BINARY_PATH, path.join(stageContentDir, FORMULA_NAME));
  fs.chmodSync(path.join(stageContentDir, FORMULA_NAME), 0o755);

  const tarball = path.join(STAGING_DIR, `${FORMULA_NAME}-local.tar.gz`);
  run('tar', ['-czf', tarball, '-C', stageContentDir, '.']);
  const sha256 = createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
  return { tarball, sha256 };
}

function rewriteFormulaForLocal(original, tarball, sha256) {
  let updated = original.replace(/^(\s*url\s+)"[^"]+"/m, `$1"file://${tarball}"`);
  updated = updated.replace(/^(\s*sha256\s+)"[^"]+"/m, `$1"${sha256}"`);
  if (updated === original) {
    throw new Error(`Failed to stage url/sha256 in ${FORMULA_PATH}`);
  }
  return updated;
}

function installLocal(reinstall) {
  refuseNonTapConflict();
  ensureTapLinked();
  run('just', ['build']);
  const { tarball, sha256 } = createLocalTarball();
  const originalFormula = fs.readFileSync(FORMULA_PATH, 'utf8');
  try {
    fs.writeFileSync(FORMULA_PATH, rewriteFormulaForLocal(originalFormula, tarball, sha256));
    const verb = reinstall ? 'reinstall' : 'install';
    run('brew', [verb, `${TAP_NAME}/${FORMULA_NAME}`]);
  } finally {
    fs.writeFileSync(FORMULA_PATH, originalFormula);
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
}

async function waitForEndpoint(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(ENDPOINT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'server/discover',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'server/discover',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      });
      if (res.ok) {
        const body = await res.json();
        const versions = body?.result?.supportedVersions;
        if (Array.isArray(versions) && versions.includes('2026-07-28')) {
          return body.result;
        }
      }
    } catch {
      // Retry until deadline
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${ENDPOINT_URL} to answer server/discover`);
}

const [, , action] = process.argv;
switch (action) {
  case 'install':
    refuseNonTapConflict();
    ensureTapLinked();
    run('brew', ['install', `${TAP_NAME}/${FORMULA_NAME}`]);
    break;
  case 'install-local':
    installLocal(false);
    break;
  case 'reinstall-local':
    installLocal(true);
    break;
  case 'start':
    run('brew', ['services', 'start', `${TAP_NAME}/${FORMULA_NAME}`]);
    await waitForEndpoint();
    console.log(`Started and verified ${ENDPOINT_URL}`);
    break;
  case 'restart':
    run('brew', ['services', 'restart', `${TAP_NAME}/${FORMULA_NAME}`]);
    await waitForEndpoint();
    console.log(`Restarted and verified ${ENDPOINT_URL}`);
    break;
  case 'stop':
    run('brew', ['services', 'stop', `${TAP_NAME}/${FORMULA_NAME}`]);
    break;
  case 'status': {
    run('brew', ['services', 'info', `${TAP_NAME}/${FORMULA_NAME}`]);
    try {
      const disc = await waitForEndpoint(1500);
      const name = disc._meta?.['io.modelcontextprotocol/serverInfo']?.name ?? FORMULA_NAME;
      const vers = Array.isArray(disc.supportedVersions) ? disc.supportedVersions.join(', ') : '';
      console.log(`HTTP ready: ${ENDPOINT_URL} (${name} ${vers})`);
    } catch (err) {
      console.log(`HTTP not reachable at ${ENDPOINT_URL}: ${err.message}`);
    }
    break;
  }
  case 'uninstall':
    try {
      run('brew', ['services', 'stop', `${TAP_NAME}/${FORMULA_NAME}`]);
    } catch {
      // Service may already be stopped
    }
    run('brew', ['uninstall', FORMULA_NAME]);
    run('brew', ['untap', TAP_NAME]);
    break;
  default:
    console.error(
      'Usage: node scripts/homebrew.mjs <install|install-local|reinstall-local|start|stop|restart|status|uninstall>',
    );
    process.exit(1);
}
