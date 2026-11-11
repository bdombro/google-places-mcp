#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const [, , executable, expectedArg = ''] = process.argv;
if (!binaryArgCheck(executable)) {
  console.error('Usage: node scripts/test-mcp.mjs <binary> [tool1,tool2,...]');
  process.exit(1);
}

function binaryArgCheck(val) {
  return typeof val === 'string' && val.length > 0;
}

const binary = path.resolve(executable);
const JULY_VERSION = '2026-07-28';
const expectedTools = expectedArg
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const tempHome = mkdtempSync(path.join(tmpdir(), 'mcp-july-test-'));
const childEnv = {
  HOME: tempHome,
  PATH: '/usr/bin:/bin',
  XDG_CONFIG_HOME: path.join(tempHome, 'config'),
  XDG_DATA_HOME: path.join(tempHome, 'data'),
  XDG_STATE_HOME: path.join(tempHome, 'state'),
  BUGSINK_DSN: '',
  SHOP_ASSISTANT_DIALOGS: 'off',
};

function assertCondition(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function rpcRequest(id, method, params = {}, includeMeta = true) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: includeMeta
      ? {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': JULY_VERSION,
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        }
      : params,
  };
}

function assertTools(tools) {
  assertCondition(Array.isArray(tools) && tools.length > 0, 'tools/list returned empty tools array');
  const actualNames = new Set(tools.map((t) => t?.name).filter(Boolean));
  for (const name of expectedTools) {
    assertCondition(actualNames.has(name), `missing expected tool: ${name}`);
  }
  if (expectedTools.length > 0) {
    assertCondition(
      actualNames.size === expectedTools.length,
      `unexpected tool set: expected [${expectedTools.join(', ')}], got [${[...actualNames].join(', ')}]`,
    );
  }
}

async function testStdio() {
  const child = spawn(binary, ['mcp'], {
    cwd: tempHome,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const rl = readline.createInterface({ input: child.stdout });
  const responses = new Map();
  let waiters = [];

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const msg = JSON.parse(trimmed);
    if (msg.id !== undefined) {
      responses.set(msg.id, msg);
      const remaining = [];
      for (const w of waiters) {
        if (responses.has(w.id)) w.resolve(responses.get(w.id));
        else remaining.push(w);
      }
      waiters = remaining;
    }
  });

  const waitForId = (id, timeoutMs = 8000) => {
    if (responses.has(id)) return Promise.resolve(responses.get(id));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`stdio timeout waiting for id=${id}; stderr=${stderr}`));
      }, timeoutMs);
      waiters.push({
        id,
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
      });
    });
  };

  const send = (payload) => {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  try {
    send(rpcRequest(1, 'server/discover'));
    const disc = await waitForId(1);
    assertCondition(
      Array.isArray(disc?.result?.supportedVersions) &&
        disc.result.supportedVersions.includes(JULY_VERSION),
      `stdio server/discover bad supportedVersions: ${JSON.stringify(disc)}`,
    );
    assertCondition(
      Boolean(disc?.result?._meta?.['io.modelcontextprotocol/serverInfo']?.name),
      `stdio server/discover missing serverInfo.name: ${JSON.stringify(disc)}`,
    );

    send(rpcRequest(2, 'tools/list'));
    const list = await waitForId(2);
    assertTools(list?.result?.tools);

    send(rpcRequest(3, 'initialize', {}, false));
    const init = await waitForId(3);
    assertCondition(
      init?.error?.code === -32601,
      `stdio initialize should fail with -32601, got: ${JSON.stringify(init)}`,
    );

    child.stdin.end();
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('stdio exit timeout')), 5000);
      child.on('exit', (c, sig) => {
        clearTimeout(timer);
        if (sig) reject(new Error(`stdio killed by signal ${sig}`));
        else resolve(c);
      });
    });
    assertCondition(code === 0, `stdio process exited with ${code}; stderr=${stderr}`);
  } finally {
    rl.close();
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
}

async function postHttp(endpoint, id, method, includeMeta = true, expectedStatus = 200) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': JULY_VERSION,
      'Mcp-Method': method,
    },
    body: JSON.stringify(rpcRequest(id, method, {}, includeMeta)),
  });
  assertCondition(res.status === expectedStatus, `HTTP ${method} expected ${expectedStatus}, got ${res.status}`);
  return res.json();
}

async function testHttp() {
  const child = spawn(binary, ['http', '--host', '127.0.0.1', '--port', '0', '--allow-ephemeral-port'], {
    cwd: tempHome,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  const endpoint = await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`HTTP startup timeout; output=${logs}`));
      }
    }, 8000);

    const onData = (chunk) => {
      logs += chunk.toString();
      const match = logs.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[0]);
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code, sig) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`HTTP server exited prematurely (code=${code}, sig=${sig}); output=${logs}`));
      }
    });
  });

  try {
    const disc = await postHttp(endpoint, 1, 'server/discover');
    assertCondition(
      Array.isArray(disc?.result?.supportedVersions) &&
        disc.result.supportedVersions.includes(JULY_VERSION),
      `HTTP server/discover bad supportedVersions: ${JSON.stringify(disc)}`,
    );
    assertCondition(
      Boolean(disc?.result?._meta?.['io.modelcontextprotocol/serverInfo']?.name),
      `HTTP server/discover missing serverInfo.name: ${JSON.stringify(disc)}`,
    );

    const list = await postHttp(endpoint, 2, 'tools/list');
    assertTools(list?.result?.tools);

    const init = await postHttp(endpoint, 3, 'initialize', false, 404);
    assertCondition(
      init?.error?.code === -32601,
      `HTTP initialize should fail with -32601, got: ${JSON.stringify(init)}`,
    );

    const exitPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('HTTP SIGTERM shutdown timeout')), 5000);
      child.once('exit', (code, sig) => {
        clearTimeout(timer);
        if (sig && sig !== 'SIGTERM') reject(new Error(`HTTP exited with unexpected signal ${sig}`));
        else resolve(code ?? 0);
      });
    });
    child.kill('SIGTERM');
    const code = await exitPromise;
    assertCondition(code === 0, `HTTP server exited with ${code}; logs=${logs}`);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
}

try {
  await testStdio();
  await testHttp();
  console.log(`PASS mcp stdio + http (${JULY_VERSION}) for ${binary} (${expectedTools.length} tools)`);
} finally {
  rmSync(tempHome, { recursive: true, force: true });
}
