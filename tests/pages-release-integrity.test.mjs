import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
function artifact(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'land-km-release-'));
  try { cpSync(new URL('../public/', import.meta.url), dir, { recursive:true }); return fn(dir); }
  finally { rmSync(dir, { recursive:true, force:true }); }
}
const prepare = dir => spawnSync(process.execPath, ['scripts/prepare-github-pages.mjs',dir], {cwd:new URL('../',import.meta.url),encoding:'utf8'});

test('release preparation refuses missing recovery script',()=>{
  artifact(dir=>{
    unlinkSync(join(dir,'startup-recovery.js'));
    const result=prepare(dir);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Missing Pages release asset: startup-recovery\.js/);
  });
});

test('release preparation refuses missing app icon',()=>{
  artifact(dir=>{
    unlinkSync(join(dir,'icons/icon-192.png'));
    const result=prepare(dir);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Missing Pages release asset: icons\/icon-192\.png/);
  });
});

test('release preparation is idempotent and retains recovery loader',()=>{
  artifact(dir=>{
    assert.equal(prepare(dir).status,0);
    assert.equal(prepare(dir).status,0);
    const html=readFileSync(join(dir,'index.html'),'utf8');
    assert.equal(html.split('src="/Land-KM/startup-recovery.js"').length-1,1);
  });
});

test('release preparation refuses a missing icon referenced by the manifest',()=>{
  artifact(dir=>{
    const path=join(dir,'manifest.webmanifest');
    const manifest=JSON.parse(readFileSync(path,'utf8'));
    manifest.icons.push({src:'/icons/missing-release-icon.png',sizes:'64x64',type:'image/png'});
    writeFileSync(path,JSON.stringify(manifest));
    const result=prepare(dir);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Missing manifest icon/);
  });
});

test('prepared HTML uses scoped PWA assets and no duplicated prefix',()=>{
  artifact(dir=>{
    assert.equal(prepare(dir).status,0);
    assert.equal(prepare(dir).status,0);
    const html=readFileSync(join(dir,'index.html'),'utf8');
    const manifest=JSON.parse(readFileSync(join(dir,'manifest.webmanifest'),'utf8'));
    assert.match(html,/href="\/Land-KM\/manifest\.webmanifest"/);
    assert.match(html,/href="\/Land-KM\/icons\/icon-192\.png"/);
    assert.match(html,/href="\/Land-KM\/icons\/apple-touch-icon\.png"/);
    assert.doesNotMatch(html,/\/Land-KM\/Land-KM\//);
    assert.doesNotMatch(JSON.stringify(manifest),/\/Land-KM\/Land-KM\//);
    for(const icon of manifest.icons) assert.ok(icon.src.startsWith('/Land-KM/'));
  });
});

test('release preparation refuses manifest icon path traversal',()=>{
  artifact(dir=>{
    const path=join(dir,'manifest.webmanifest');
    const manifest=JSON.parse(readFileSync(path,'utf8'));
    manifest.icons.push({src:'/Land-KM/../outside.png',sizes:'64x64',type:'image/png'});
    writeFileSync(path,JSON.stringify(manifest));
    const result=prepare(dir);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Unsafe manifest icon path/);
  });
});

test('Pages release includes homepage shortcuts exactly once',()=>{
  artifact(dir=>{
    assert.equal(prepare(dir).status,0);
    assert.equal(prepare(dir).status,0);
    const html=readFileSync(join(dir,'index.html'),'utf8');
    const js=readFileSync(join(dir,'home-navigation.js'),'utf8');
    assert.equal(html.split('src="/Land-KM/home-navigation.js"').length-1,1);
    assert.equal(html.split('href="/Land-KM/home-navigation.css"').length-1,1);
    assert.match(js,/homeQuickAccess/);
    assert.match(js,/target\.click\(\)/);
  });
});

test('Pages release includes search keyboard shortcut assets once',()=>{
  artifact(dir=>{
    assert.equal(prepare(dir).status,0);
    assert.equal(prepare(dir).status,0);
    const html=readFileSync(join(dir,'index.html'),'utf8');
    const js=readFileSync(join(dir,'search-shortcuts.js'),'utf8');
    assert.equal(html.split('src="/Land-KM/search-shortcuts.js"').length-1,1);
    assert.equal(html.split('href="/Land-KM/search-shortcuts.css"').length-1,1);
    assert.match(js,/event\.key !== '\/'/);
    assert.match(js,/isEditing\(event\.target\)/);
  });
});
