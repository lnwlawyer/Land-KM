import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Legal and lesson views clear loading state on failures',()=>{
 assert.match(html,/await Promise\.allSettled\(\[loadLaws\(\), loadLessons\(\)/);
 assert.match(html,/await loadGuides\(\)/);
 assert.match(html,/lawsBody\.innerHTML = '<tr><td colspan="6" class="doc-meta">โหลดข้อมูลกฎหมายไม่สำเร็จ/);
 assert.match(html,/courseGrid\.innerHTML = '<div class="empty-note">โหลดบทเรียนไม่สำเร็จ/);
 assert.match(html,/lessonCount\.textContent = 'โหลดข้อมูลไม่สำเร็จ'/);
});
