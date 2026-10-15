// Read-only pre-import audit. Never prints or writes personal or case-level content.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function auditQaFiles(knowledge, unresolved) {
  if (!Array.isArray(knowledge) || !Array.isArray(unresolved)) throw new Error('Both JSON files must contain arrays');
  const issues = [];
  const ids = new Set();
  const questions = new Set();
  let duplicates = 0;
  let missingAnswers = 0;
  let missingReferences = 0;
  let attachments = 0;
  for (const [kind, rows] of [['knowledge', knowledge], ['unresolved', unresolved]]) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object' || typeof row.question !== 'string' || !row.question.trim()) {
        issues.push({ source: kind, row: i + 1, code: 'INVALID_QUESTION' });
        continue;
      }
      if (kind === 'knowledge' && (typeof row.id !== 'string' || ids.has(row.id))) issues.push({ source: kind, row: i + 1, code: 'INVALID_OR_DUPLICATE_ID' });
      if (kind === 'knowledge') ids.add(row.id);
      const normalized = row.question.normalize('NFKC').trim().replace(/\\s+/g, ' ');
      if (questions.has(normalized)) duplicates++;
      questions.add(normalized);
      if (!row.answer?.trim() && !row.expert_reply?.trim()) missingAnswers++;
      if (kind === 'knowledge' && (!Array.isArray(row.legal_refs) || !row.legal_refs.length)) missingReferences++;
      if (row.question_has_attachment || row.answer_has_attachment) attachments++;
    }
  }
  return { knowledge: knowledge.length, unresolved: unresolved.length, total: knowledge.length + unresolved.length, duplicateQuestionTexts: duplicates, missingAnswerTexts: missingAnswers, knowledgeWithoutLegalRefs: missingReferences, attachmentFlags: attachments, invalidRows: issues.length, issues: issues.slice(0, 30), productionWrites: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scripts/audit-qa-json.mjs <land_registry_kb.json> <attachment_only_questions.json>');
    process.exitCode = 2;
  } else {
    try {
      const [knowledge, unresolved] = process.argv.slice(2).map(file => JSON.parse(readFileSync(file, 'utf8')));
      const report = auditQaFiles(knowledge, unresolved);
      console.log(JSON.stringify(report, null, 2));
      if (report.invalidRows) process.exitCode = 1;
    } catch (error) {
      console.error('QA audit failed:', error.message);
      process.exitCode = 1;
    }
  }
}
