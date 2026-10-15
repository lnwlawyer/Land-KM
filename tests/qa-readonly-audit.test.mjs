import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('Admin audit scans all Firestore staging documents read-only', () => {
  const start = html.indexOf('async function auditQaPrivateStaging()');
  const end = html.indexOf('async function editQaPrivateItem(', start);
  assert.ok(start > -1 && end > start);
  const body = html.slice(start, end);
  for (const needle of ["currentUserProfile?.role !== 'admin'", "orderBy(documentId())", "startAfter(cursor)", "getDocs(query(collection(db, 'qaImportItems')", "duplicate_question", "unknown_review_status", "unexpected_visibility", "missing_question_text", "missing_answer_text"]) assert.ok(body.includes(needle), needle);
  for (const forbidden of ['setDoc(', 'writeBatch(', 'runTransaction(', 'deleteDoc(', "collection(db, 'questions')"]) assert.ok(!body.includes(forbidden), forbidden);
  assert.ok(html.includes('id="qaAuditRun"'));
  assert.ok(html.includes("document.getElementById('qaAuditRun').onclick = auditQaPrivateStaging"));
});
