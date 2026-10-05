import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  AUTH_BASE,
  FIRESTORE_BASE,
  LOCAL_PROJECT_ID,
  ROLES,
  assertLocalTarget,
  assertNoConflictingFirebaseEnvironment,
  makeMockGoogleIdToken,
  provisionRole
} from '../scripts/local-review-launcher.mjs';

const root = new URL('../', import.meta.url);
const configFiles = ['firebase.json', '.firebaserc', 'firestore.rules'];
const configBefore = new Map(await Promise.all(configFiles.map(async path => [path, await readFile(new URL(path, root))])));
const createdAccounts = new Map();
const seededProfiles = new Map();
const requests = [];
const requestedUrls = [];
let testServer;
let testBase;

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.stringValue ?? value.booleanValue]));
}

before(async () => {
  testServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    requests.push({ method: req.method, url: req.url, body, authorization: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url.includes('accounts:signInWithIdp')) {
      const idp = new URLSearchParams(body.postBody);
      const claims = JSON.parse(Buffer.from(idp.get('id_token').split('.')[1], 'base64url').toString('utf8'));
      const role = claims.sub.replace('land-km-local-review-', '');
      const localId = `test-auth-uid-${role}`;
      const user = { localId, email: claims.email, displayName: claims.name, emailVerified: true, providerUserInfo: [{ providerId: 'google.com', email: claims.email, rawId: claims.sub }] };
      createdAccounts.set(localId, user);
      res.end(JSON.stringify({ localId, email: user.email, idToken: `emulator-id-token-${role}` }));
      return;
    }
    if (req.method === 'GET' && req.url.includes('accounts:batchGet')) {
      assert.equal(req.headers.authorization, 'Bearer owner');
      const users = [...createdAccounts.values()];
      res.end(JSON.stringify({ kind: 'identitytoolkit#GetAccountInfoResponse', users }));
      return;
    }
    const match = req.url.match(/\/v1\/projects\/demo-land-km\/databases\/\(default\)\/documents\/users\/([^/?]+)/);
    if (match) {
      const uid = decodeURIComponent(match[1]);
      if (req.method === 'PATCH') {
        assert.equal(req.headers.authorization, 'Bearer owner');
        seededProfiles.set(uid, { name: `projects/demo-land-km/databases/(default)/documents/users/${uid}`, fields: body.fields });
      }
      const doc = seededProfiles.get(uid);
      if (!doc) { res.statusCode = 404; res.end(JSON.stringify({ error: { code: 404 } })); return; }
      res.end(JSON.stringify(doc));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { code: 404 } }));
  });
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  testBase = `http://127.0.0.1:${testServer.address().port}`;
});

async function emulatorMockFetch(rawUrl, options) {
  const url = new URL(rawUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(['9099', '8080'].includes(url.port));
  requestedUrls.push(url.href);
  return fetch(`${testBase}${url.pathname}${url.search}`, { ...options, signal: AbortSignal.timeout(3000) });
}

after(async () => {
  testServer.closeAllConnections();
  await new Promise(resolve => testServer.close(resolve));
  for (const [path, original] of configBefore) assert.deepEqual(await readFile(new URL(path, root)), original, `${path} changed during launcher tests`);
});

test('launcher rejects any project other than demo-land-km', () => {
  assert.equal(assertLocalTarget({ projectId: LOCAL_PROJECT_ID }), true);
  assert.throws(() => assertLocalTarget({ projectId: 'land-km-gpt' }), /only permits project demo-land-km/);
});

test('launcher rejects non-loopback or wrong-port emulator endpoints', () => {
  assert.throws(() => assertLocalTarget({ authBase: 'https://auth.example.test:9099' }), /Auth endpoint must be the local emulator/);
  assert.throws(() => assertLocalTarget({ firestoreBase: 'http://127.0.0.1:8081' }), /Firestore endpoint must be the local emulator/);
  assert.equal(assertLocalTarget({ authBase: AUTH_BASE, firestoreBase: FIRESTORE_BASE }), true);
});

test('launcher rejects conflicting project environment configuration', () => {
  assert.throws(() => assertNoConflictingFirebaseEnvironment({ GCLOUD_PROJECT: 'not-demo' }), /must be demo-land-km/);
  assert.throws(() => assertNoConflictingFirebaseEnvironment({ FIREBASE_CONFIG: JSON.stringify({ projectId: 'not-demo' }) }), /targets a different Firebase project/);
  assert.equal(assertNoConflictingFirebaseEnvironment({}), true);
});

test('launcher source has no production project identifier and config files are unchanged', async () => {
  const source = await readFile(new URL('../scripts/local-review-launcher.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /land-km-gpt/i);
  for (const [path, original] of configBefore) assert.deepEqual(await readFile(new URL(path, root)), original);
});

test('mock Google identities and matching profiles are local and available for every role', async () => {
  assert.deepEqual(Object.keys(ROLES), ['admin', 'editor', 'reviewer', 'viewer']);
  for (const role of Object.keys(ROLES)) {
    const token = makeMockGoogleIdToken(role, 1_800_000_000);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(claims.aud, 'demo-land-km');
    assert.equal(claims.email, ROLES[role].email);
    assert.equal(claims.email_verified, true);

    const result = await provisionRole(role, {
      projectId: LOCAL_PROJECT_ID,
      fetchImpl: emulatorMockFetch
    });
    assert.equal(result.uid, `test-auth-uid-${role}`);
    assert.equal(result.email, ROLES[role].email);
    const identity = createdAccounts.get(result.uid);
    assert.equal(identity.providerUserInfo[0].providerId, 'google.com');
    const saved = seededProfiles.get(result.uid);
    assert.ok(saved, `missing profile for ${role}`);
    assert.deepEqual(fromFirestoreFields(saved.fields), {
      email: ROLES[role].email,
      role,
      is_active: true,
      display_name: ROLES[role].displayName
    });
  }
  assert.ok(requestedUrls.every(rawUrl => {
    const url = new URL(rawUrl);
    return url.hostname === '127.0.0.1' && ['9099', '8080'].includes(url.port) && !/land-km-gpt/i.test(url.href);
  }));
  assert.ok(requestedUrls.filter(url => url.includes(':8080/')).every(url => url.includes('/projects/demo-land-km/')));
});

test('launcher refuses an unsupported role without making emulator requests', async () => {
  const beforeCount = requests.length;
  await assert.rejects(provisionRole('owner', { fetchImpl: emulatorMockFetch }), /supported local review roles/);
  assert.equal(requests.length, beforeCount);
});
