import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('private review console is admin-gated and paginated',()=>{
 for(const marker of ['id="qaReviewLoad"','id="qaReviewNext"','id="qaReviewResults"',"currentUserProfile?.role !== 'admin'", "collection(db, 'qaImportItems')", "orderBy('import_id')",'startAfter(qaReviewLastDoc)', 'qaReviewPageSize = 25']) assert.ok(html.includes(marker),marker);
});
test('private review uses safe text and never publishes',()=>{
 for(const marker of ["heading.textContent =", "question.textContent =", "answer.textContent =", "reviewed_private", "needs_revision", "doc(db, 'qaImportItems', row.id)"]) assert.ok(html.includes(marker),marker);
 const section=html.slice(html.indexOf('function renderQaReviewRows()'),html.indexOf('function initQaPrivateImport()'));
 assert.ok(!section.includes('innerHTML'));
 assert.ok(!section.includes("doc(db, 'questions'"));
 assert.ok(!section.includes("doc(db, 'answers'"));
});
