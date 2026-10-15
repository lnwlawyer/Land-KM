import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditQaFiles } from '../scripts/audit-qa-json.mjs';

test('audit detects duplicates and missing answers without exposing source text', () => {
  const result = auditQaFiles([{id:'QA0001',question:'คำถาม  หนึ่ง',answer:'คำตอบ',legal_refs:[]}], [{question:'คำถาม หนึ่ง',expert_reply:'โทรมา'}]);
  assert.equal(result.total, 2);
  assert.equal(result.duplicateQuestionTexts, 1);
  assert.equal(result.knowledgeWithoutLegalRefs, 1);
  assert.equal(result.productionWrites, 0);
  assert.ok(!JSON.stringify(result).includes('คำถาม หนึ่ง'));
});
test('audit reports invalid rows without copying source content', () => {
  const result = auditQaFiles([{id:'QA0001',question:'',answer:'abc'}], []);
  assert.equal(result.invalidRows,1);
  assert.equal(result.issues[0].code,'INVALID_QUESTION');
});
test('answer form saves legal references and preserves moderation', () => {
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/id="answerLegalReferences"/);
  assert.match(html,/legal_references: legalReferences/);
  assert.match(html,/is_accepted: false/);
});
