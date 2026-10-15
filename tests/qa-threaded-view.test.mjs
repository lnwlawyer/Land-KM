import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('No standalone My Followups panel remains',()=>{assert.ok(!html.includes('id="qaMyFollowups"'));assert.ok(!html.includes('id="qaMyFollowupItems"'));});
test('Followups are threaded under original published Q&A, not standalone cards',()=>{for(const x of ['renderQaFollowupThread(card,row.id)',"qaPublishedRows.filter(row=>!row.parent_id)","row.parent_id===parentId",'การสนทนาในกระทู้นี้'])assert.ok(html.includes(x),x);});
test('Private replies are owner-only, public replies are deduplicated',()=>{for(const x of ["where('created_by','==',auth.currentUser.uid)",'!publicIds.has(row.id)',"data.status==='needs_info'",'ส่งข้อมูลเพิ่มเติม'])assert.ok(html.includes(x),x);});
