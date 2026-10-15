import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('Published Q&A uses structured question and answer cards',()=>{for(const token of ['qa-public-question','qa-public-answer','qaKeywordFilters','qaPublishedPager','QA_PUBLIC_PAGE_SIZE'])assert.ok(html.includes(token),token);});
test('Fuzzy search and tags are supported',()=>{for(const token of ['qaNormalize','qaMatchText','qaKeywords','qa-keyword-chip'])assert.ok(html.includes(token),token);});
test('Followups are private and require moderation',()=>{assert.ok(html.includes("collection(db,'qaFollowups')"));assert.ok(html.includes("status:'pending'"));assert.ok(rules.includes('match /qaFollowups/{followupId}'));assert.ok(rules.includes('allow read: if isAdmin()'));assert.ok(rules.includes("request.resource.data.status == 'pending'"));});
