import { spawn, spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MULTIPLAYER_CLIENT_PROTOCOL_VERSION } from '../src/domain/multiplayer/contracts.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startupTimeoutMs = 60_000;
const requestTimeoutMs = 15_000;
const edgeRuntimeContainer = `supabase_edge_runtime_${basename(projectRoot)}`;

function removeLocalEdgeRuntime() {
  const result = spawnSync('docker', ['rm', '-f', edgeRuntimeContainer], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !result.stderr.includes('No such container')) {
    throw new Error('Could not reset the local Edge runtime container.');
  }
}

function parseEnvOutput(output) {
  return Object.fromEntries(output
    .split(/\r?\n/u)
    .flatMap((line) => {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line.trim());
      if (!match) return [];
      const [, name, rawValue] = match;
      if (!name || rawValue === undefined) return [];
      try {
        return [[name, JSON.parse(rawValue)]];
      } catch {
        return [[name, rawValue]];
      }
    }));
}

function localSupabaseEnvironment() {
  const result = spawnSync('supabase', ['status', '-o', 'env'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('The local Supabase stack is not ready. Run `supabase start` first.');
  }
  const values = parseEnvOutput(result.stdout);
  const required = ['API_URL', 'SERVICE_ROLE_KEY'];
  const clientKey = values.PUBLISHABLE_KEY || values.ANON_KEY;
  if (!clientKey || required.some((name) => !values[name])) {
    throw new Error('The local Supabase status output is missing an API URL or test key.');
  }
  return {
    apiUrl: values.API_URL,
    clientKey,
    functionsUrl: values.FUNCTIONS_URL || `${values.API_URL}/functions/v1`,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
  };
}

function waitForServeReady(child, output) {
  return new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectReady(new Error(`Timed out starting the local Edge runtime.\n${output()}`));
    }, startupTimeoutMs);

    const onData = () => {
      if (!output().includes('Serving functions on')) return;
      clearTimeout(timeout);
      cleanup();
      resolveReady();
    };
    const onExit = (code, signal) => {
      clearTimeout(timeout);
      cleanup();
      rejectReady(new Error(
        `The local Edge runtime exited before it was ready (${code ?? signal ?? 'unknown'}).\n${output()}`,
      ));
    };
    const onError = (error) => {
      clearTimeout(timeout);
      cleanup();
      rejectReady(error);
    };
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', onError);
    child.on('exit', onExit);
    onData();
  });
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function createAnonymousUser(environment) {
  const response = await fetchWithTimeout(`${environment.apiUrl}/auth/v1/signup`, {
    body: '{}',
    headers: {
      apikey: environment.clientKey,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json().catch(() => null);
  const accessToken = payload?.access_token;
  const userId = payload?.user?.id;
  if (!response.ok || typeof accessToken !== 'string' || typeof userId !== 'string') {
    throw new Error(`Could not create a temporary local anonymous user (HTTP ${response.status}).`);
  }
  return { accessToken, userId };
}

async function deleteAnonymousUser(environment, userId) {
  const response = await fetchWithTimeout(`${environment.apiUrl}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: environment.serviceRoleKey,
      authorization: `Bearer ${environment.serviceRoleKey}`,
    },
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not remove the temporary local anonymous user (HTTP ${response.status}).`);
  }
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit();
      return;
    }
    child.once('exit', resolveExit);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.pid) return;
  const stopped = waitForExit(child);
  child.kill('SIGINT');
  const forced = setTimeout(() => child.kill('SIGKILL'), 5_000);
  await stopped;
  clearTimeout(forced);
}

const environment = localSupabaseEnvironment();
removeLocalEdgeRuntime();
let serveOutput = '';
const serve = spawn('supabase', ['functions', 'serve'], {
  cwd: projectRoot,
  env: { ...process.env, CI: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const capture = (chunk) => {
  serveOutput = `${serveOutput}${String(chunk)}`.slice(-8_000);
};
serve.stdout.on('data', capture);
serve.stderr.on('data', capture);

let temporaryUser = null;
let primaryError = null;
try {
  await waitForServeReady(serve, () => serveOutput);
  temporaryUser = await createAnonymousUser(environment);
  const response = await fetchWithTimeout(`${environment.functionsUrl}/multiplayer-room`, {
    body: '{',
    headers: {
      apikey: environment.clientKey,
      authorization: `Bearer ${temporaryUser.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json().catch(() => null);
  if (response.status !== 400 || payload?.error?.code !== 'request_invalid') {
    throw new Error(
      `The exact multiplayer-room worker did not boot to its contract boundary `
      + `(HTTP ${response.status}, code ${payload?.error?.code ?? 'unknown'}).\n${serveOutput}`,
    );
  }
  // The moment operation must route through the authenticated worker: a
  // well-formed moment request from a user with no room reaches the room
  // gate, and a malformed one is refused at the contract boundary.
  const momentResponse = await fetchWithTimeout(`${environment.functionsUrl}/multiplayer-room`, {
    body: JSON.stringify({
      handNumber: 0,
      id: 'moment:smoke:0:cheer',
      operation: 'moment',
      protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
      protocolVersion: 1,
      reactionId: 'cheer',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }),
    headers: {
      apikey: environment.clientKey,
      authorization: `Bearer ${temporaryUser.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const momentPayload = await momentResponse.json().catch(() => null);
  if (momentResponse.status !== 404 || momentPayload?.error?.code !== 'room_not_found') {
    throw new Error(
      `The table-moment operation did not route through the room gate `
      + `(HTTP ${momentResponse.status}, code ${momentPayload?.error?.code ?? 'unknown'}).\n${serveOutput}`,
    );
  }
  const spoofedMomentResponse = await fetchWithTimeout(`${environment.functionsUrl}/multiplayer-room`, {
    body: JSON.stringify({
      handNumber: 0,
      id: 'moment:smoke',
      operation: 'moment',
      protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
      protocolVersion: 1,
      reactionId: 'banana',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }),
    headers: {
      apikey: environment.clientKey,
      authorization: `Bearer ${temporaryUser.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const spoofedPayload = await spoofedMomentResponse.json().catch(() => null);
  if (spoofedMomentResponse.status !== 400 || spoofedPayload?.error?.code !== 'request_invalid') {
    throw new Error(
      `A spoofed table moment was not refused at the contract boundary `
      + `(HTTP ${spoofedMomentResponse.status}).\n${serveOutput}`,
    );
  }
  const deletionResponse = await fetchWithTimeout(`${environment.functionsUrl}/delete-account`, {
    body: JSON.stringify({ confirmation: 'delete-account' }),
    headers: {
      apikey: environment.clientKey,
      authorization: `Bearer ${temporaryUser.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const deletionPayload = await deletionResponse.json().catch(() => null);
  if (deletionResponse.status !== 200 || deletionPayload?.deleted !== true) {
    throw new Error(
      `The exact delete-account worker did not complete authenticated deletion `
      + `(HTTP ${deletionResponse.status}).\n${serveOutput}`,
    );
  }
  console.log('The exact multiplayer and account-deletion workers bundled and passed their authenticated boundaries.');
} catch (error) {
  primaryError = error;
} finally {
  let cleanupError = null;
  if (temporaryUser) {
    try {
      await deleteAnonymousUser(environment, temporaryUser.userId);
    } catch (error) {
      cleanupError = error;
    }
  }
  await stopChild(serve);
  removeLocalEdgeRuntime();
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
}
