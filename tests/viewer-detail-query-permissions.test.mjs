import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=html.indexOf('async function loadAccessibleDetailDocuments(');
const end=html.indexOf('\n  async function loadContents(',start);
const code=html.slice(start,end);
test('viewer detail queries are scoped to one parent and bounded',()=>{
 assert.ok(start>0&&end>start);
 assert.match(code,/role === 'admin' \|\| role === 'reviewer'/);
 assert.match(code,/where\('content_id', '==', id\)/);
 assert.match(code,/index \+= 5/);
 assert.match(code,/where\('content_id', 'in', contentIds\.slice/);
});
