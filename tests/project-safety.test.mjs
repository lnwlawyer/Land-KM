import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'scripts/check-safe-project.mjs');

function check(env = {}) {
  const base = { ...process.env };
  for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT', 'FIREBASE_PROJECT_ID']) delete base[name];
  return spawnSync(process.execPath, [script], { cwd: root, env: { ...base, ...env }, encoding: 'utf8' });
}

test('accepts emulator project configuration', () => {
  const result = check({ FIREBASE_PROJECT: 'demo-land-km' });
  assert.equal(result.status, 0, result.stderr);
});
for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT', 'FIREBASE_PROJECT_ID']) {
  test(`rejects production project via ${key}`, () => {
    const result = check({ [key]: 'land-km-gpt' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BLOCKED/);
  });
}
test('rejects conflicting project variables', () => {
  const result = check({ FIREBASE_PROJECT: 'demo-land-km', GCLOUD_PROJECT: 'land-km-gpt' });
  assert.notEqual(result.status, 0);
});
