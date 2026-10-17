import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('expanded QA question collapses on click and keyboard',()=>{
 const begin=html.indexOf('function renderQaPublished()');
 const end=html.indexOf('const qaReviewSelected',begin);
 const code=html.slice(begin,end);
 assert.match(code,/if\(selected\)\{\s*const collapseThread=/);
 assert.match(code,/question\.onclick=collapseThread/);
 assert.match(code,/question\.onkeydown=event=>/);
 assert.match(code,/event\.key==='Enter'\|\|event\.key===' '/);
 assert.match(code,/question\.setAttribute\('role','button'\)/);
 assert.match(code,/qaForumSelectedId=null/);
 assert.match(code,/question\.setAttribute\('aria-label','ย่อกระทู้และกลับไปรายการคำถาม'\)/);
});
