import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Search is above category filter and published Q&A list',()=>{const a=html.indexOf('id="qaSearchForm"'),b=html.indexOf('id="qaForumCategory"'),c=html.indexOf('id="qaPublishedList"');assert.ok(a>0&&a<b&&b<c);});
test('Forum thread has a visible bottom collapse control and top back action',()=>{assert.ok(html.includes('↑ ย่อกระทู้ / กลับไปรายการ'));assert.ok(html.includes("qaForumSelectedId=null;qaPublicPage=0;renderQaPublished()"));assert.ok(html.includes("id=\"qaForumBack\""));});
