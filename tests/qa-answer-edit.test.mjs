import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('Q&A editing preserves existing question and answer workflow', () => {
  for (const fragment of ['async function editQuestionAnswer(answer)', "edit.textContent = 'แก้ไขคำตอบ'", "batch.update(answerRef, updates)", 'async function postAnswerToFirestore()', 'function acceptAnswer(id, questionId)']) assert.ok(html.includes(fragment), fragment);
});
test('Q&A edits enforce author/admin gate and prevent unreviewed approval', () => {
  assert.match(html, /!isAdmin && \(!isAuthor \|\| answer\.is_accepted === true\)/);
  assert.match(html, /updates\.is_accepted = false/);
  assert.match(html, /window\.confirm\('คำตอบนี้ได้รับการรับรองแล้ว/);
});
