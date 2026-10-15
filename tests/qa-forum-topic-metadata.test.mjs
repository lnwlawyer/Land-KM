import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Forum displays actual date, excerpts and published comment counts',()=>{for(const s of ['function qaForumDate(row)','Asia/Bangkok','qaForumExcerpt(row.question_text,240)','qaForumExcerpt(row.answer_text,200)','ความคิดเห็นที่เผยแพร่','ไม่ระบุวันที่'])assert.ok(html.includes(s),s);});
test('No invented timestamp and keywords remain clickable',()=>{assert.ok(html.includes("if(!raw)return ''"));assert.ok(html.includes("const tags=qaKeywords(row)"));assert.ok(html.includes('qa-keyword-chip'));});
