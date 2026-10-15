import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('publish action is admin-only and requires reviewed answers',()=>{
 const body=html.slice(html.indexOf('async function changeQaPublication('),html.indexOf('let qaPublishedRows ='));
 for(const marker of ["currentUserProfile?.role !== 'admin'", "review_status === 'reviewed_private'", "doc(db, 'qaPublished', id)", 'window.confirm', 'is_published:true', 'is_published:false']) assert.ok(body.includes(marker),marker);
 assert.ok(!body.includes('deleteDoc('));
});
test('public listing queries only published projections and uses textContent',()=>{
 const body=html.slice(html.indexOf('async function loadQaPublished()'),html.indexOf('const qaReviewSelected ='));
 for(const marker of ["collection(db,'qaPublished')", "where('is_published','==',true)", 'qtext.textContent', 'atext.textContent', 'renderQaPublished()']) assert.ok(body.includes(marker),marker);
 assert.ok(!body.includes('innerHTML'));
});
test('rules isolate private staging and public projection',()=>{
 const section=rules.slice(rules.indexOf('match /qaPublished/'),rules.indexOf('match /qaImportItems/'));
 for(const marker of ['resource.data.is_published == true','allow create, update: if isAdmin()', 'allow delete: if false']) assert.ok(section.includes(marker),marker);
 assert.ok(rules.includes('allow read, create, update, delete: if isAdmin();'));
});
