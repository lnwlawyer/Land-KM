import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('all inline startup scripts parse as JavaScript', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]));
  assert.ok(scripts.length >= 2, 'expected UI and Firebase application scripts');
  const dir = mkdtempSync(join(tmpdir(), 'land-km-js-check-'));
  try {
    for (let i = 0; i < scripts.length; i++) {
      const path = join(dir, `inline-${i}.mjs`);
      writeFileSync(path, scripts[i][2]);
      const check = spawnSync(process.execPath, ['--check', path], { encoding:'utf8' });
      assert.equal(check.status, 0, `inline script ${i} syntax error: ${check.stderr}`);
    }
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('login gate and application shell are both present', () => {
  assert.match(html, /id="authGate"/);
  assert.match(html, /id="appShell"/);
  assert.match(html, /id="authError"/);
  assert.match(html, /onAuthStateChanged\(auth,/);
  assert.match(html, /signInWithPopup/);
});

test('GitHub Pages production origin never triggers local emulator mode', () => {
  assert.match(html, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/);
  assert.match(html, /projectId: isLocalReview \? 'demo-land-km' : 'land-km-gpt'/);
});
