import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=html.indexOf('async function loadLessons()');
const end=html.indexOf('function getLessonMedia(',start);
const body=html.slice(start,end);
test('Lesson catalogue loads independently of private progress',()=>{
 assert.ok(start>0&&end>start);
 assert.ok(body.includes('const [lessonDocuments, unitDocuments] = await Promise.all(['));
 assert.ok(body.includes('if (progressUser?.email)'));
 assert.ok(body.includes('catch (progressError)'));
 assert.ok(body.includes('progressDocuments = progressSnapshot.docs'));
 assert.ok(!body.includes('progressUser.email), limit(APP_LIMITS.workspaceLearningProgress)))'));
});
