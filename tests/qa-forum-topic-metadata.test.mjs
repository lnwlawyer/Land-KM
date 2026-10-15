import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Forum summary displays real Bangkok-local date/time and excerpts',()=>{for(const s of ["function qaForumDate(row)","timeZone:'Asia/Bangkok'","dateStyle:'medium'","timeStyle:'short'",'qaForumExcerpt(row.question_text,230)','qaForumExcerpt(row.answer_text,170)'])assert.ok(html.includes(s),s);});
test('Forum keeps categories, keywords and full text in expanded topic',()=>{for(const s of ['หมวดหมู่: ',"qaKeywords(row)","selected?(row.question_text||'')","selected?(row.answer_text||'')"])assert.ok(html.includes(s),s);});
