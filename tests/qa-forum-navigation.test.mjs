import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Forum offers categories, searchable topic list and detail navigation',()=>{for(const s of ['id="qaForumCategory"','id="qaForumBack"','qaForumRefreshCategories','qaForumSelectedId','อ่านกระทู้และความคิดเห็น','qaMatchText'])assert.ok(html.includes(s),s);});
test('Thread stays under original topic and preserves moderation',()=>{for(const s of ['renderQaFollowupThread(card,row.id)','การสนทนาในกระทู้นี้','ความคิดเห็นที่ ',"where('created_by','==',auth.currentUser.uid)","status:'pending'"])assert.ok(html.includes(s),s);});
