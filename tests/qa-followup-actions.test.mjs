import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Draft and close do not require an answer; reply, request-info and publish do',()=>{assert.match(html,/\['answered','needs_info','published'\]\.includes\(statusValue\)&&answer\.length<3/);assert.match(html,/กรุณาระบุคำตอบอย่างน้อย 3 ตัวอักษร/);});
test('Legacy Admin inbox no longer offers a duplicate close-only button',()=>{assert.ok(!html.includes("button.textContent='รับทราบและปิดรายการ (ไม่เผยแพร่)'"));assert.ok(html.includes("show('manageView','จัดการเนื้อหา')"));});
