import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8');
const publish = read('.github/workflows/publish-pages.yml');
const safe = read('.github/workflows/safe-tests.yml');

test('Pages publishing runs only for main push or explicit manual dispatch', () => {
  assert.match(publish, /^on:\s*\n\s+workflow_dispatch:\s*$/m);
  assert.doesNotMatch(publish, /\b(?:push|pull_request|schedule|repository_dispatch):/);
  assert.match(publish, /github\.ref == 'refs\/heads\/main'/);
});

test('Pages release has safety gates before deployment', () => {
  const required = [
    'node scripts/check-safe-project.mjs',
    'node --test tests/pages-production-smoke.test.mjs',
    'node --test tests/pages-release-integrity.test.mjs',
    'npm run test:app',
    'npm run test:rules',
    'actions/deploy-pages@'
  ];
  let previous = -1;
  for (const token of required) {
    const index = publish.indexOf(token);
    assert.ok(index > previous, token + ' must exist after preceding safety gate');
    previous = index;
  }
  assert.match(publish, /FIREBASE_PROJECT: demo-land-km/);
});

test('PR validation is read-only and does not deploy', () => {
  assert.match(safe, /pull_request:/);
  assert.match(safe, /contents: read/);
  assert.match(safe, /FIREBASE_PROJECT: demo-land-km/);
  assert.match(safe, /node scripts\/check-safe-project\.mjs/);
  assert.doesNotMatch(safe, /actions\/deploy-pages@|firebase deploy|pages: write|id-token: write/);
});
