import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('reconciliation uses existing deterministic import keys and Firestore reads only',()=>{
 const body=html.slice(html.indexOf('async function reconcileQaPrivateImport()'),html.indexOf('let qaAuditResult = null;'));
 for(const s of ["currentUserProfile?.role !== 'admin'","qaPrivateImportKey(source, row, i)","getDoc(doc(db, 'qaImportItems', id))","duplicateSourceIds","missing_count","invalid_count","completed:true"]) assert.ok(body.includes(s),s);
 for(const s of ['setDoc(', 'writeBatch(', 'runTransaction(', 'deleteDoc(']) assert.ok(!body.includes(s),s);
 for(const id of ['qaReconcileFiles','qaReconcileRun','qaReconcileStatus','qaReconcileExport','qaReconcileReport']) assert.ok(html.includes('id="'+id+'"'),id);
});
