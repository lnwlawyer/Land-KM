import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlUrl = new URL('../Land-KM-UX-Prototype.html', import.meta.url);
const html = await readFile(htmlUrl, 'utf8');

test('หน้าเว็บไม่มีหมวดค้นหาที่ถูกเลือกเป็นค่าเริ่มต้น', () => {
  assert.doesNotMatch(html, /new Set\(\['มรดก'\]\)/);
  assert.match(html, /const selected=new Set\(\)/);
});

test('หน้าเว็บล้างข้อมูลจำลองก่อนโหลด Firestore', () => {
  assert.match(html, /function resetLegacyPresentation\(\)/);
  assert.match(html, /resetLegacyPresentation\(\);/);
});

test('ไม่มีข้อความจาก event จำลองหลงเหลือ', () => {
  for (const phrase of [
    'จำลองการบันทึก',
    'แสดงผลการค้นหาตัวอย่าง',
    'เปิดหน้าบทเรียนตัวอย่างแล้ว'
  ]) {
    assert.equal(html.includes(phrase), false, `พบข้อความจำลอง: ${phrase}`);
  }
});

test('มีค่าจำกัด Query ส่วนกลางและ Pagination', () => {
  assert.match(html, /const APP_LIMITS = Object\.freeze\(/);
  assert.match(html, /contentPageSize:\s*50/);
  assert.match(html, /startAfter/);
});

test('มีระบบหลักจากขั้นก่อนหน้าครบ', () => {
  for (const collectionName of [
    'knowledgePackages',
    'knowledgeGaps',
    'contentVersions',
    'versionCounters',
    'usageAggregates'
  ]) {
    assert.match(html, new RegExp(collectionName));
  }
});
