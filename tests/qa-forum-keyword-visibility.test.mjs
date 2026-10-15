import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Question keywords accept arrays and delimited string metadata',()=>{
  for(const fragment of ['parse(row.keywords)','parse(row.keyword)','parse(row.tags)','parse(row.keywords_text)','parse(row.legal_refs)']) assert.ok(html.includes(fragment),fragment);
  assert.ok(html.includes('คำสำคัญของคำถาม'));
  assert.ok(html.includes('qa-keyword-chip'));
});
