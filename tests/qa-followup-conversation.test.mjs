import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('Admin can draft, reply, request information, publish or close followups',()=>{for(const s of ['บันทึกฉบับร่าง','ตอบกลับผู้ถาม','ขอข้อมูลเพิ่มเติม','เผยแพร่ Q&A','ปิดโดยไม่เผยแพร่',"currentUserProfile?.role!=='admin'"])assert.ok(html.includes(s),s);});
test('User can see own followups and answer requests for information',()=>{for(const s of ['renderQaFollowupThread(card,row.id)','loadMyQaFollowups','ส่งข้อมูลเพิ่มเติม',"where('created_by','==',auth.currentUser.uid)"])assert.ok(html.includes(s),s);});
test('Rules isolate conversations and permit only restricted owner changes',()=>{const section=rules.slice(rules.indexOf('match /qaFollowups/'),rules.indexOf('match /qaPublished/'));for(const s of ['resource.data.created_by == request.auth.uid',"resource.data.status == 'needs_info'",'affectedKeys().hasOnly',"request.resource.data.status == 'pending'",'allow delete: if false'])assert.ok(section.includes(s),s);});
