import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const LOCAL_PROJECT_ID = 'demo-land-km';
export const AUTH_BASE = 'http://127.0.0.1:9099';
export const FIRESTORE_BASE = 'http://127.0.0.1:8080';
export const REVIEW_HOST = '127.0.0.1';
export const REVIEW_PORT = 5500;
export const ROLES = Object.freeze({
  admin: Object.freeze({ email: 'admin@local.review', displayName: 'Local Admin', label: 'Admin' }),
  editor: Object.freeze({ email: 'editor@local.review', displayName: 'Local Editor', label: 'Editor' }),
  reviewer: Object.freeze({ email: 'reviewer@local.review', displayName: 'Local Reviewer', label: 'Reviewer' }),
  viewer: Object.freeze({ email: 'viewer@local.review', displayName: 'Local Viewer', label: 'Viewer' })
});

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const APP_PATH = join(ROOT, 'public', 'index.html');
const FIREBASE_JSON_PATH = join(ROOT, 'firebase.json');
const LOCAL_GOOGLE_SUBJECT_PREFIX = 'land-km-local-review-';
const MAX_REQUEST_BYTES = 2048;

function fail(message) {
  throw new Error(message);
}

export function assertLocalTarget({ projectId = LOCAL_PROJECT_ID, authBase = AUTH_BASE, firestoreBase = FIRESTORE_BASE } = {}) {
  if (projectId !== LOCAL_PROJECT_ID) fail('Local review launcher only permits project demo-land-km.');
  for (const [label, raw, expectedPort] of [['Auth', authBase, '9099'], ['Firestore', firestoreBase, '8080']]) {
    let endpoint;
    try { endpoint = new URL(raw); } catch { fail(`${label} endpoint is invalid.`); }
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== REVIEW_HOST || endpoint.port !== expectedPort || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
      fail(`${label} endpoint must be the local emulator at 127.0.0.1:${expectedPort}.`);
    }
  }
  return true;
}

export function assertNoConflictingFirebaseEnvironment(env = process.env) {
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT']) {
    if (env[key] && env[key] !== LOCAL_PROJECT_ID) fail(`Environment variable ${key} must be demo-land-km for local review.`);
  }
  if (env.FIREBASE_CONFIG) {
    let config;
    try { config = JSON.parse(env.FIREBASE_CONFIG); } catch { fail('FIREBASE_CONFIG is present but is not valid JSON; refusing local review startup.'); }
    if (config.projectId && config.projectId !== LOCAL_PROJECT_ID) fail('FIREBASE_CONFIG targets a different Firebase project; refusing local review startup.');
  }
  return true;
}

export function makeMockGoogleIdToken(role, nowSeconds = Math.floor(Date.now() / 1000)) {
  const identity = ROLES[role];
  if (!identity) fail('Choose one of the supported local review roles.');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'none', typ: 'JWT' });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: LOCAL_PROJECT_ID,
    sub: `${LOCAL_GOOGLE_SUBJECT_PREFIX}${role}`,
    email: identity.email,
    email_verified: true,
    name: identity.displayName,
    iat: nowSeconds,
    exp: nowSeconds + 3600
  });
  return `${header}.${payload}.`;
}

function firestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  fail('Unsupported Firestore profile value.');
}

function firestoreFields(profile) {
  return Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, firestoreValue(value)]));
}

function decodeFirestoreValue(value) {
  if (Object.hasOwn(value, 'stringValue')) return value.stringValue;
  if (Object.hasOwn(value, 'booleanValue')) return value.booleanValue;
  return undefined;
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function sameRecord(left, right) {
  const normalize = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function readJson(response) {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { error: { message: 'Emulator returned invalid JSON.' } }; }
}

export async function provisionRole(role, {
  projectId = LOCAL_PROJECT_ID,
  authBase = AUTH_BASE,
  firestoreBase = FIRESTORE_BASE,
  fetchImpl = fetch
} = {}) {
  assertLocalTarget({ projectId, authBase, firestoreBase });
  const identity = ROLES[role];
  if (!identity) fail('Choose one of the supported local review roles.');

  const googleIdToken = makeMockGoogleIdToken(role);
  const authBody = {
    postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
    requestUri: `http://${REVIEW_HOST}:${REVIEW_PORT}/`,
    returnIdpCredential: true,
    returnSecureToken: true,
    providerId: 'google.com'
  };
  const authResponse = await fetchImpl(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(authBody)
  });
  const authResult = await readJson(authResponse);
  if (!authResponse.ok || !authResult.localId || authResult.email !== identity.email) {
    fail(`Auth Emulator did not create the expected local Google identity: ${authResult.error?.message || authResponse.status}.`);
  }

  const lookupResponse = await fetchImpl(`${authBase}/identitytoolkit.googleapis.com/v1/projects/${LOCAL_PROJECT_ID}/accounts:batchGet?maxResults=1000`, {
    method: 'GET',
    redirect: 'error',
    headers: { authorization: 'Bearer owner' }
  });
  const lookup = await readJson(lookupResponse);
  const user = lookup.users?.find(candidate => candidate.localId === authResult.localId);
  if (!lookupResponse.ok || user?.email !== identity.email || !user.providerUserInfo?.some(provider => provider.providerId === 'google.com')) {
    fail('Could not verify the selected Google identity in the local Auth Emulator.');
  }

  const profile = {
    email: identity.email,
    role,
    is_active: true,
    display_name: identity.displayName
  };
  const documentPath = `users/${encodeURIComponent(authResult.localId)}`;
  const documentUrl = `${firestoreBase}/v1/projects/${LOCAL_PROJECT_ID}/databases/(default)/documents/${documentPath}`;
  const writeResponse = await fetchImpl(documentUrl, {
    method: 'PATCH',
    redirect: 'error',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `projects/${LOCAL_PROJECT_ID}/databases/(default)/documents/${documentPath}`,
      fields: firestoreFields(profile)
    })
  });
  const writeResult = await readJson(writeResponse);
  if (!writeResponse.ok) fail(`Firestore Emulator profile write failed: ${writeResult.error?.message || writeResponse.status}.`);

  const verifyResponse = await fetchImpl(documentUrl, {
    method: 'GET',
    redirect: 'error',
    headers: { authorization: 'Bearer owner' }
  });
  const verifyResult = await readJson(verifyResponse);
  const verifiedProfile = decodeFirestoreFields(verifyResult.fields);
  if (!verifyResponse.ok || verifyResult.name !== `projects/${LOCAL_PROJECT_ID}/databases/(default)/documents/${documentPath}` || !sameRecord(verifiedProfile, profile)) {
    fail('Firestore Emulator profile read-back did not match the selected Auth identity.');
  }

  return { uid: authResult.localId, email: identity.email, role, displayName: identity.displayName, googleIdToken, profile };
}

async function loadBrowserAuthConfig() {
  const html = await readFile(APP_PATH, 'utf8');
  if (!/const\s+isLocalReview\s*=\s*\[['"]localhost['"],\s*['"]127\.0\.0\.1['"]\]\.includes\(window\.location\.hostname\)/.test(html)) {
    fail('The app does not have its expected localhost-only emulator routing.');
  }
  const localProjectMatch = html.match(/projectId\s*:\s*isLocalReview\s*\?\s*['"]([^'"]+)['"]/);
  if (localProjectMatch?.[1] !== LOCAL_PROJECT_ID) fail('The app local hostname does not resolve to demo-land-km.');
  if (!/connectAuthEmulator\(auth,\s*['"]http:\/\/127\.0\.0\.1:9099['"]/.test(html) || !/connectFirestoreEmulator\(db,\s*['"]127\.0\.0\.1['"],\s*8080\)/.test(html)) {
    fail('The app local hostname is not connected to both expected Firebase emulators.');
  }
  const apiKey = html.match(/\bapiKey\s*:\s*['"]([^'"]+)['"]/);
  if (!apiKey?.[1] || apiKey[1].includes(':')) fail('Could not establish the app local Auth persistence namespace safely.');
  return { apiKey: apiKey[1], projectId: LOCAL_PROJECT_ID };
}

async function probeAuth() {
  try {
    const response = await fetch(`${AUTH_BASE}/emulator/v1/projects/${LOCAL_PROJECT_ID}/config`, { redirect: 'error', signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch { return false; }
}

async function probeFirestore() {
  try {
    const response = await fetch(`${FIRESTORE_BASE}/v1/projects/${LOCAL_PROJECT_ID}/databases/(default)/documents/users/local-review-launcher-health-probe`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(1500), headers: { authorization: 'Bearer owner' }
    });
    const payload = await readJson(response);
    return response.status === 200 || (response.status === 404 && payload.error?.code === 404);
  } catch { return false; }
}

function startFirebaseEmulators() {
  const cliPath = join(ROOT, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliPath, 'emulators:start', '--project', LOCAL_PROJECT_ID, '--only', 'auth,firestore'], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, GCLOUD_PROJECT: LOCAL_PROJECT_ID, GOOGLE_CLOUD_PROJECT: LOCAL_PROJECT_ID }
    });
    child.once('error', rejectPromise);
    child.once('spawn', () => { child.unref(); resolvePromise(child.pid); });
  });
}

async function waitForEmulators(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [auth, firestore] = await Promise.all([probeAuth(), probeFirestore()]);
    if (auth && firestore) return;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
  }
  fail('Local emulators did not become ready on ports 9099 and 8080. Check the emulator terminal/logs.');
}

export async function ensureEmulators() {
  assertLocalTarget();
  assertNoConflictingFirebaseEnvironment();
  const [auth, firestore] = await Promise.all([probeAuth(), probeFirestore()]);
  if (auth && firestore) return { started: false };
  if (auth || firestore) fail('Only one required emulator is responding. Refusing to start a duplicate; resolve the partial emulator state first.');
  const pid = await startFirebaseEmulators();
  await waitForEmulators();
  return { started: true, pid };
}

function pageHtml() {
  const roleCards = Object.entries(ROLES).map(([role, identity]) => `<button class="role" type="button" data-role="${role}"><strong>${identity.label}</strong><span>${identity.email}</span></button>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Land KM Local Review</title>
<style>body{font:16px system-ui,sans-serif;color:#183047;background:#f3f6f8;margin:0;min-height:100vh;display:grid;place-items:center}.card{width:min(640px,calc(100% - 32px));background:#fff;border:1px solid #dce4ea;border-radius:16px;padding:26px;box-shadow:0 12px 36px #17324a12}h1{margin:0 0 8px;font-size:25px}.hint{color:#5d6b78;line-height:1.6}.roles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:22px 0}.role{display:grid;gap:6px;text-align:left;padding:16px;border:1px solid #cbd7df;border-radius:10px;background:#fff;color:inherit;cursor:pointer;font:inherit}.role:hover,.role:focus-visible{border-color:#147767;outline:2px solid #147767}.role span{font-size:13px;color:#667581}.role:disabled{opacity:.55;cursor:wait}#status{min-height:24px;color:#155e52}@media(max-width:520px){.roles{grid-template-columns:1fr}.card{padding:20px}}</style></head>
<body><main class="card"><h1>Land KM · Local Browser Review</h1><p class="hint">เลือกบทบาทจำลองเพื่อสร้าง/คืนค่าเฉพาะบัญชีและโปรไฟล์ใน Firebase Emulator ของเครื่องนี้</p><div class="roles">${roleCards}</div><p id="status" role="status" aria-live="polite">กำลังตรวจสอบ Auth และ Firestore Emulator…</p></main>
<script type="module">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithCredential } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
const status = document.getElementById('status');
let auth;
try {
  const health = await fetch('/api/health', { cache: 'no-store' }).then(response => response.json());
  if (!health.ok || health.projectId !== 'demo-land-km') throw new Error(health.error || 'Local emulators are unavailable.');
  const config = await fetch('/api/browser-auth-config', { cache: 'no-store' }).then(response => response.json());
  const app = initializeApp({ apiKey: config.apiKey, projectId: config.projectId, authDomain: 'demo-land-km.firebaseapp.com' });
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  status.textContent = 'พร้อม · project demo-land-km · เลือกบทบาทเพื่อเข้าใช้งาน';
} catch (error) {
  status.textContent = error.message;
  document.querySelectorAll('.role').forEach(button => button.disabled = true);
}
document.querySelectorAll('.role').forEach(button => button.addEventListener('click', async () => {
  if (!auth) return;
  document.querySelectorAll('.role').forEach(item => item.disabled = true);
  status.textContent = 'กำลังเตรียมบัญชีจำลองและโปรไฟล์ใน Emulator…';
  try {
    const response = await fetch('/api/start-review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: button.dataset.role }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'เตรียมบัญชีไม่สำเร็จ');
    const credential = GoogleAuthProvider.credential(result.googleIdToken);
    const signedIn = await signInWithCredential(auth, credential);
    if (signedIn.user.uid !== result.uid || signedIn.user.email !== result.email) throw new Error('Auth session did not match the emulator identity.');
    status.textContent = 'เข้าสู่ Land KM…';
    window.location.assign('/app');
  } catch (error) {
    status.textContent = error.message;
    document.querySelectorAll('.role').forEach(item => item.disabled = false);
  }
}));
</script></body></html>`;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) fail('Request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function safeRequestHost(req) {
  return req.headers.host === `${REVIEW_HOST}:${REVIEW_PORT}`;
}

export function createReviewServer() {
  return createServer(async (req, res) => {
    if (!safeRequestHost(req)) { res.writeHead(400).end('Local review host only.'); return; }
    const url = new URL(req.url || '/', `http://${REVIEW_HOST}:${REVIEW_PORT}`);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(pageHtml());
      return;
    }
    if (req.method === 'GET' && ['/app', '/index.html'].includes(url.pathname)) {
      try {
        const html = await readFile(APP_PATH);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(html);
      } catch { res.writeHead(500).end('Could not read local app source.'); }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/browser-auth-config') {
      try { sendJson(res, 200, await loadBrowserAuthConfig()); }
      catch (error) { sendJson(res, 503, { error: error.message }); }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      try {
        assertNoConflictingFirebaseEnvironment();
        const [authReady, firestoreReady] = await Promise.all([probeAuth(), probeFirestore()]);
        const sourceConfig = await loadBrowserAuthConfig();
        const ready = authReady && firestoreReady;
        sendJson(res, ready ? 200 : 503, { ok: ready, projectId: sourceConfig.projectId, auth: authReady, firestore: firestoreReady, error: ready ? undefined : 'Auth or Firestore Emulator is unavailable.' });
      } catch (error) { sendJson(res, 503, { ok: false, projectId: LOCAL_PROJECT_ID, error: error.message }); }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/start-review') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${REVIEW_HOST}:${REVIEW_PORT}`) { sendJson(res, 403, { error: 'Local origin only.' }); return; }
      try {
        assertNoConflictingFirebaseEnvironment();
        const body = JSON.parse(await readBody(req));
        const result = await provisionRole(body.role);
        sendJson(res, 200, result);
      } catch (error) { sendJson(res, 400, { error: error.message }); }
      return;
    }
    res.writeHead(404).end('Not found.');
  });
}

export async function startLauncher() {
  assertLocalTarget();
  assertNoConflictingFirebaseEnvironment();
  const [authReady, firestoreReady] = await Promise.all([probeAuth(), probeFirestore()]);
  if (!(authReady && firestoreReady)) {
    if (authReady || firestoreReady) fail('Only one required emulator is responding. Refusing to start a duplicate; resolve the partial emulator state first.');
    const { pid } = await startFirebaseEmulators();
    console.log(`Starting demo-land-km Auth and Firestore Emulators (pid ${pid})…`);
    await waitForEmulators();
  }
  await loadBrowserAuthConfig();
  const server = createReviewServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(REVIEW_PORT, REVIEW_HOST, resolvePromise);
  });
  console.log(`Local review launcher ready: http://${REVIEW_HOST}:${REVIEW_PORT}`);
  console.log('Select Admin, Editor, Reviewer, or Viewer in the browser to enter the app.');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startLauncher().catch(error => {
    console.error(`Local review launcher stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
