import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Shared modern UI foundation supports responsive, focus and reduced motion',()=>{
 for(const token of ['Modern Knowledge Platform foundation','focus-visible','prefers-reduced-motion:reduce','max-width:900px','max-width:640px','--km-radius'])assert.ok(html.includes(token),token);
});
test('Core public and admin views remain present',()=>{
 for(const id of ['home','searchView','knowledgeView','packagesView','lawsView','judgmentsView','committeeDecisionsView','guidesView','learningView','qaView','savedView','manageView','categoryManageView','usersView','reportsView','governanceView','sourcesView'])assert.ok(html.includes('id="'+id+'"'),id);
});
