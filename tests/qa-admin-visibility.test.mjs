import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Q&A management is fail-closed for all non-admin roles',()=>{
 assert.ok(html.includes('body:not([data-qa-admin="true"]) #qaPrivateImport'));
 assert.ok(html.includes('body:not([data-qa-admin="true"]) #qaImportPreviewPanel'));
 assert.ok(html.includes("document.body.dataset.qaAdmin = profile.role === 'admin' ? 'true' : 'false'"));
 assert.ok(html.includes("document.getElementById('qaPrivateImport').hidden = profile.role !== 'admin'"));
 assert.ok(html.includes("document.body.removeAttribute('data-qa-admin')"));
});
