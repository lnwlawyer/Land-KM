import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Admin dashboard has a visible Q&A followup inbox and reload action',()=>{for(const marker of ['id="qaFollowupAdminInbox"','id="qaFollowupAdminRefresh"','loadQaFollowupAdminInbox()','qaFollowupAdminRefresh\').onclick=loadQaFollowupAdminInbox'])assert.ok(html.includes(marker),marker);});
test('Followup inbox is role-gated and lists pending items',()=>{for(const marker of ["currentUserProfile?.role !== 'admin'","where('status','==','pending')","inbox.hidden=profile.role!=='admin'",'qaFollowupAdminStatus'])assert.ok(html.includes(marker),marker);});
