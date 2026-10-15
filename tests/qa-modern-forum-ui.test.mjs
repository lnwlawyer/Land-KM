import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Forum supports compact and expanded reading modes',()=>{
  for(const x of ['qa-forum-expanded','qa-forum-topline','qa-forum-open','@media(max-width:640px)','qa-public-card:focus-within'])assert.ok(html.includes(x),x);
  assert.ok(html.includes("selected?' qa-forum-expanded':''"));
  assert.ok(html.includes('renderQaFollowupThread(card,row.id)'));
  assert.ok(html.includes('qaForumSelectedId=null'));
});
