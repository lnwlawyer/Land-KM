import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Pages preparation rewrites only generated artifact paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'land-km-pages-'));
  try {
    // The release preparer requires the complete public asset set.\n    cpSync(new URL('../public/', import.meta.url), dir, { recursive: true });
    const source = '<html><head><link href="/manifest.webmanifest"><link href="/icons/icon-192.png"><link href="/icons/apple-touch-icon.png"></head><body></body></html>';
    writeFileSync(join(dir, 'index.html'), source);
    writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ id:'/', start_url:'/', scope:'/', icons:[{src:'/icons/icon-192.png'}] }));
    const result = spawnSync(process.execPath, ['scripts/prepare-github-pages.mjs', dir], { encoding:'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(html, /\/Land-KM\/manifest.webmanifest/);
    assert.match(html, /\/Land-KM\/icons\/icon-192.png/);
    assert.equal(source.includes('/Land-KM/'), false);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.scope, '/Land-KM/');
    assert.equal(manifest.start_url, '/Land-KM/');
    assert.equal(manifest.icons[0].src, '/Land-KM/icons/icon-192.png');
  } finally { rmSync(dir, { recursive:true, force:true }); }
});
