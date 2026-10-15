import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Public knowledge screens share search and reading refinements',()=>{
 for(const token of ['Public knowledge experience','resultSearch:focus-within','#searchView .filters','#lawsView table','#judgmentsView table','#committeeDecisionsView table','#detailView p','#savedView .doc'])assert.ok(html.includes(token),token);
});
