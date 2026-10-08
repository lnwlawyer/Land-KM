import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSite, verify, SITE } from '../scripts/verify-github-pages-live.mjs';

const response = (path, valid = true) => ({ ok: true, status: 200, json: async () => ({ id: valid ? '/Land-KM/' : '/wrong/', start_url: '/Land-KM/', scope: '/Land-KM/' }) });
test('read-only live verification uses only fixed GitHub Pages URLs', async () => {
  const urls=[];
  const result = await checkSite(async url => { urls.push(url); return response(url); });
  assert.equal(result.ok, true);
  assert.deepEqual(urls, [SITE, SITE + 'manifest.webmanifest', SITE + 'sw.js']);
});
test('invalid manifest fails, and transient HTTP errors can recover', async () => {
  const invalid = await checkSite(async () => response('', false));
  assert.equal(invalid.ok, false);
  let requests=0;
  const result=await verify(async url => { requests++; return requests <= 3 ? {ok:false,status:503} : response(url); }, { attempts:2, delayMs:0, sleep:async()=>{} });
  assert.equal(result.ok,true);
  assert.equal(result.attempts,2);
});
