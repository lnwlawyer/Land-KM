import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('batch review stays admin-only and private',()=>{
 const code=html.slice(html.indexOf('async function updateQaPrivateBatch('),html.indexOf('async function compareQaDuplicate('));
 for(const s of ["currentUserProfile?.role !== 'admin'","qaReviewSelected","doc(db, 'qaImportItems', id)","review_status:status","window.confirm","ยังไม่เผยแพร่"]) assert.ok(code.includes(s),s);
 for(const s of ["doc(db, 'questions'","doc(db, 'answers'","deleteDoc("]) assert.ok(!code.includes(s),s);
});
test('duplicate compare reads staging without writing',()=>{
 const code=html.slice(html.indexOf('async function compareQaDuplicate('),html.indexOf('let qaReviewLastDoc'));
 assert.ok(code.includes("getDoc(doc(db, 'qaImportItems', firstId))"));
 for(const s of ['setDoc(', 'deleteDoc(', 'writeBatch(']) assert.ok(!code.includes(s),s);
 for(const id of ['qaReviewSelectAll','qaReviewBatchApprove','qaReviewBatchRevision','qaReviewBatchStatus']) assert.ok(html.includes('id="'+id+'"'));
});
