import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('Pages workflow publishes on main push or manual dispatch with no Firebase deploy', () => {
  const workflow = read('.github/workflows/publish-pages.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /^  push:\\s*\\n    branches:\\s*\\n      - main\\s*$/m);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /actions\/deploy-pages@/);
  assert.match(workflow, /npm run test:app/);
  assert.match(workflow, /npm run test:rules/);
  assert.doesNotMatch(workflow, /firebase deploy|FIREBASE_TOKEN|GOOGLE_APPLICATION_CREDENTIALS/);
});

test('production Firebase config is retained and localhost uses only emulator project', () => {
  const html = read('public/index.html');
  assert.match(html, /projectId: isLocalReview \? 'demo-land-km' : 'land-km-gpt'/);
  assert.match(html, /connectAuthEmulator\(auth/);
  assert.match(html, /connectFirestoreEmulator\(db/);
  assert.match(html, /authDomain: 'land-km-gpt\.firebaseapp\.com'/);
});

test('generated Pages artifact has valid project-scoped manifest, icons and HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'land-km-pages-smoke-'));
  try {
    cpSync(new URL('../public/', import.meta.url), dir, { recursive:true });
    const run = spawnSync(process.execPath, ['scripts/prepare-github-pages.mjs', dir], { encoding:'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
    assert.match(html, /href="\/Land-KM\/manifest\.webmanifest"/);
    assert.match(html, /href="\/Land-KM\/icons\/icon-192\.png"/);
    assert.equal(manifest.id, '/Land-KM/');
    assert.equal(manifest.start_url, '/Land-KM/');
    assert.equal(manifest.scope, '/Land-KM/');
    for (const icon of manifest.icons) {
      assert.ok(icon.src.startsWith('/Land-KM/icons/'));
      assert.ok(existsSync(join(dir, icon.src.slice('/Land-KM/'.length))), icon.src);
    }
    assert.ok(existsSync(join(dir, 'index.html')));
    assert.ok(existsSync(join(dir, 'sw.js')));
    assert.ok(existsSync(join(dir, 'startup-recovery.js')));
    assert.ok(html.includes('src="/Land-KM/startup-recovery.js"'));
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

// Pages releases must validate local emulator configuration before artifact publication.
import { readFileSync as readSafetyWorkflow } from 'node:fs';
import { join as joinSafetyPath } from 'node:path';
const pagesWorkflowSafety = readSafetyWorkflow(joinSafetyPath(process.cwd(), '.github/workflows/publish-pages.yml'), 'utf8');
assert.match(pagesWorkflowSafety, /node scripts\/check-safe-project\.mjs/);
assert.match(pagesWorkflowSafety, /FIREBASE_PROJECT: demo-land-km/);
