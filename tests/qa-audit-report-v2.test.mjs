import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('audit reports distinguish unanswered questions from anomalies',()=>{
 const audit=html.slice(html.indexOf('async function auditQaPrivateStaging()'),html.indexOf('async function editQaPrivateItem('));
 for(const token of ['unanswered++','affected_document_count','issue_types','completed:true','orderBy(documentId())','startAfter(cursor)','qaAuditResult = null']) assert.ok(audit.includes(token),token);
 assert.ok(!audit.includes("addIssue(item.id, 'missing_answer_text')"));
 for(const forbidden of ['setDoc(', 'writeBatch(', 'deleteDoc(', 'runTransaction(']) assert.ok(!audit.includes(forbidden),forbidden);
});
test('export and filtering require admin and a complete report',()=>{
 const exportSection=html.slice(html.indexOf('function downloadQaAudit('),html.indexOf('async function auditQaPrivateStaging()'));
 assert.ok(exportSection.includes("currentUserProfile?.role !== 'admin'"));
 assert.ok(exportSection.includes('!qaAuditResult'));
 for(const id of ['qaAuditJson','qaAuditCsv','qaAuditFilter','qaAuditBreakdown']) assert.ok(html.includes('id="'+id+'"'),id);
});
