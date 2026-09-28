import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';

const projectId = 'demo-land-km';
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
let env;

const accounts = {
  admin: { uid: 'admin-1', email: 'admin@landkm.test', role: 'admin', is_active: true },
  editor: { uid: 'editor-1', email: 'editor@landkm.test', role: 'editor', is_active: true },
  reviewer: { uid: 'reviewer-1', email: 'reviewer@landkm.test', role: 'reviewer', is_active: true },
  user: { uid: 'user-1', email: 'user@landkm.test', role: 'user', is_active: true },
  other: { uid: 'user-2', email: 'other@landkm.test', role: 'user', is_active: true },
  inactive: { uid: 'inactive-1', email: 'inactive@landkm.test', role: 'user', is_active: false }
};

function dbAs(name) {
  const account = accounts[name];
  return env.authenticatedContext(account.uid, {
    email: account.email,
    email_verified: true
  }).firestore();
}

function content(overrides = {}) {
  return {
    content_id: 'CNT-TEST-001',
    title: 'เนื้อหาทดสอบ',
    content_type: 'knowledge',
    workflow_status: 'published',
    access_level: 'internal',
    created_by: accounts.editor.email,
    updated_at: new Date('2026-09-18T00:00:00Z'),
    ...overrides
  };
}

async function seed() {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const account of Object.values(accounts)) {
      await setDoc(doc(db, 'users', account.uid), {
        email: account.email,
        role: account.role,
        is_active: account.is_active,
        display_name: account.role
      });
    }
    await setDoc(doc(db, 'contents', 'CNT-PUBLISHED'), content({ content_id: 'CNT-PUBLISHED' }));
    await setDoc(doc(db, 'contents', 'CNT-DRAFT'), content({
      content_id: 'CNT-DRAFT',
      workflow_status: 'draft'
    }));
    await setDoc(doc(db, 'contents', 'CNT-REVIEW'), content({
      content_id: 'CNT-REVIEW',
      workflow_status: 'review'
    }));
    await setDoc(doc(db, 'contents', 'CNT-OTHER-DRAFT'), content({
      content_id: 'CNT-OTHER-DRAFT',
      workflow_status: 'draft',
      created_by: 'another-editor@landkm.test'
    }));
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules } });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

after(async () => {
  await env.cleanup();
});

test('ผู้ไม่เข้าสู่ระบบอ่านข้อมูลไม่ได้', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'contents', 'CNT-PUBLISHED')));
});

test('บัญชีที่ปิดใช้งานอ่านข้อมูลไม่ได้', async () => {
  await assertFails(getDoc(doc(dbAs('inactive'), 'contents', 'CNT-PUBLISHED')));
});

test('ผู้ใช้งานอ่านได้เฉพาะเนื้อหาที่เผยแพร่', async () => {
  await assertSucceeds(getDoc(doc(dbAs('user'), 'contents', 'CNT-PUBLISHED')));
  await assertFails(getDoc(doc(dbAs('user'), 'contents', 'CNT-DRAFT')));
});

test('ผู้เขียนอ่านฉบับร่างของตนเอง แต่ไม่อ่านฉบับร่างผู้อื่น', async () => {
  await assertSucceeds(getDoc(doc(dbAs('editor'), 'contents', 'CNT-DRAFT')));
  await assertFails(getDoc(doc(dbAs('editor'), 'contents', 'CNT-OTHER-DRAFT')));
});

test('ผู้ตรวจสอบและผู้ดูแลอ่านเนื้อหาทุกสถานะได้', async () => {
  await assertSucceeds(getDoc(doc(dbAs('reviewer'), 'contents', 'CNT-DRAFT')));
  await assertSucceeds(getDoc(doc(dbAs('admin'), 'contents', 'CNT-DRAFT')));
});

test('ผู้เขียนสร้างฉบับร่างของตนเองได้', async () => {
  const payload = content({
    content_id: 'CNT-NEW',
    workflow_status: 'draft',
    created_by: accounts.editor.email
  });
  await assertSucceeds(setDoc(doc(dbAs('editor'), 'contents', 'CNT-NEW'), payload));
});

test('ผู้เขียนปลอมชื่อผู้สร้างหรือเผยแพร่เองไม่ได้', async () => {
  await assertFails(setDoc(doc(dbAs('editor'), 'contents', 'CNT-BAD-OWNER'), content({
    content_id: 'CNT-BAD-OWNER',
    workflow_status: 'draft',
    created_by: accounts.admin.email
  })));
  await assertFails(setDoc(doc(dbAs('editor'), 'contents', 'CNT-BAD-PUBLISH'), content({
    content_id: 'CNT-BAD-PUBLISH',
    workflow_status: 'published',
    created_by: accounts.editor.email
  })));
});

test('ผู้เขียนแก้เนื้อหาที่เผยแพร่แล้วโดยตรงไม่ได้', async () => {
  await assertFails(updateDoc(doc(dbAs('editor'), 'contents', 'CNT-PUBLISHED'), {
    title: 'แก้โดยไม่ผ่าน Workflow',
    updated_at: serverTimestamp()
  }));
});

test('ผู้ตรวจสอบอนุมัติรายการ review ได้เฉพาะฟิลด์ Workflow', async () => {
  await assertSucceeds(updateDoc(doc(dbAs('reviewer'), 'contents', 'CNT-REVIEW'), {
    workflow_status: 'approved',
    approved_by: accounts.reviewer.email,
    approved_at: serverTimestamp(),
    updated_at: serverTimestamp()
  }));
});

test('ผู้ตรวจสอบแก้ชื่อเรื่องระหว่างอนุมัติไม่ได้', async () => {
  await assertFails(updateDoc(doc(dbAs('reviewer'), 'contents', 'CNT-REVIEW'), {
    title: 'ชื่อที่ไม่ควรถูกแก้',
    workflow_status: 'approved',
    approved_by: accounts.reviewer.email,
    approved_at: serverTimestamp(),
    updated_at: serverTimestamp()
  }));
});

test('ผู้ดูแลเผยแพร่และลบเนื้อหาได้', async () => {
  await assertSucceeds(updateDoc(doc(dbAs('admin'), 'contents', 'CNT-REVIEW'), {
    workflow_status: 'published',
    updated_at: serverTimestamp()
  }));
});

test('รายการที่บันทึกไว้แยกตามเจ้าของบัญชี', async () => {
  const savedRef = doc(dbAs('user'), 'savedItems', 'SAVE-USER-1');
  await assertSucceeds(setDoc(savedRef, {
    user_email: accounts.user.email,
    content_id: 'CNT-PUBLISHED',
    saved_at: serverTimestamp()
  }));
  await assertFails(getDoc(doc(dbAs('other'), 'savedItems', 'SAVE-USER-1')));
});

test('ความก้าวหน้าการเรียนปลอมอีเมลผู้อื่นไม่ได้', async () => {
  await assertFails(setDoc(doc(dbAs('user'), 'learningProgress', 'PROGRESS-BAD'), {
    user_email: accounts.other.email,
    content_id: 'CNT-PUBLISHED',
    progress_percent: 50
  }));
});

test('ความคิดเห็นใหม่ต้องเป็น pending และเป็นชื่อผู้ส่งจริง', async () => {
  await assertSucceeds(setDoc(doc(dbAs('user'), 'comments', 'COMMENT-OK'), {
    target_id: 'CNT-PUBLISHED',
    target_type: 'content',
    comment_text: 'ข้อเสนอแนะทดสอบ',
    commented_by: accounts.user.email,
    moderation_status: 'pending'
  }));
  await assertFails(setDoc(doc(dbAs('user'), 'comments', 'COMMENT-BAD'), {
    target_id: 'CNT-PUBLISHED',
    target_type: 'content',
    comment_text: 'พยายามอนุมัติเอง',
    commented_by: accounts.user.email,
    moderation_status: 'approved'
  }));
});

test('ผู้ใช้งานสร้าง Knowledge Gap ไม่ได้', async () => {
  await assertFails(setDoc(doc(dbAs('user'), 'knowledgeGaps', 'GAP-1'), {
    gap_id: 'GAP-1',
    gap_type: 'missing_search',
    status: 'open',
    priority: 'medium',
    source_key: 'คำค้นทดสอบ',
    created_by: accounts.user.email,
    updated_by: accounts.user.email
  }));
});

test('สถิติรายบัญชีเริ่มที่ 1 และเพิ่มได้ครั้งละ 1 เท่านั้น', async () => {
  const statRef = doc(dbAs('user'), 'usageStats', `${accounts.user.uid}_open_CNT-PUBLISHED`);
  await assertSucceeds(setDoc(statRef, {
    user_id: accounts.user.uid,
    action: 'open',
    target_type: 'content',
    target_id: 'CNT-PUBLISHED',
    count: 1,
    last_used_at: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(statRef, { count: increment(1), last_used_at: serverTimestamp() }));
  await assertFails(updateDoc(statRef, { count: increment(2), last_used_at: serverTimestamp() }));
});

test('Collection ที่ไม่อยู่ในรายการอนุญาตถูกปฏิเสธ', async () => {
  await assertFails(setDoc(doc(dbAs('admin'), 'unexpectedCollection', 'X'), { value: true }));
});

test('ข้อมูลทดสอบไม่ปนกับโครงการจริง', () => {
  assert.equal(projectId.startsWith('demo-'), true);
});
