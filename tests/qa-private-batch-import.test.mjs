import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('private import UI is admin-only and writes only private staging',()=>{
  for(const term of ["currentUserProfile?.role !== 'admin'", "doc(db, 'qaImportItems', id)", "review_status: 'pending_private_review'", "visibility: 'admin_only'", 'batch.commit()', 'qaPrivateImportCancelled', 'skipped++']) assert.ok(html.includes(term),term);
  assert.match(rules,/match \/qaImportItems\/\{itemId\} \{\s*allow read, create, update, delete: if isAdmin\(\);/);
});
test('import does not publish data or embed source JSON in public files',()=>{
  assert.ok(!html.includes('land_registry_kb.json'));
  assert.ok(!html.includes('attachment_only_questions.json'));
});
