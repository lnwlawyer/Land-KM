import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Q&A search uses submitted text and searches question and answers',()=>{
  for(const fragment of ['id="qaSearchForm"','id="qaSearchInput"',"search.addEventListener('submit'",'event.preventDefault()','relatedAnswers.map(answer => answer.answer_text)','searchable.includes(qaSearchText)']) assert.ok(html.includes(fragment),fragment);
});
test('JSON preview is role gated, browser-only, and has size and array checks',()=>{
  for(const fragment of ['id="qaImportPreviewToggle"','id="qaImportFile"',"currentUserProfile?.role === 'admin'",'file.size > 15 * 1024 * 1024','JSON.parse(await file.text())','Array.isArray(rows)','ยังไม่มีการนำเข้าหรือเผยแพร่']) assert.ok(html.includes(fragment),fragment);
  assert.match(html,/if \(!canReview\) \{ panel.hidden = true; return; \}/);
});
