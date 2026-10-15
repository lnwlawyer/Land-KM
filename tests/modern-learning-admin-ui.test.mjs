import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Learning, community and admin views use shared layout treatments',()=>{
 for(const token of ['Learning, community and administrative workspaces','#learningView .panel','#qaView .qa-public-heading','#lessonPlayerView .panel','#manageView table','#usersView table','#governanceView .tabs','#formView textarea','#reportsView .panel'])assert.ok(html.includes(token),token);
});
