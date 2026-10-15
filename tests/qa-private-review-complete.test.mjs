import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Firestore count reads full private collection and statuses',()=>{
 for(const text of ['getCountFromServer','id="qaReviewCount"',"collection(db, 'qaImportItems')", "where('review_status', '==', status)", 'countQaPrivateStaging']) assert.ok(html.includes(text),text);
});
test('private editor stays in staging and requires admin',()=>{
 const section=html.slice(html.indexOf('async function editQaPrivateItem('),html.indexOf('let qaReviewLastDoc'));
 for(const text of ["currentUserProfile?.role !== 'admin'", "doc(db, 'qaImportItems', row.id)", "visibility: 'admin_only'", "review_status: 'pending_private_review'",'window.confirm']) assert.ok(section.includes(text),text);
 assert.ok(!section.includes("doc(db, 'questions'"));
 assert.ok(!section.includes("doc(db, 'answers'"));
});
