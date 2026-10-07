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
  collection,
  deleteDoc,
  getDocs,
  getDoc,
  increment,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  writeBatch
} from 'firebase/firestore';

const projectId = 'demo-land-km';
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
let env;

const accounts = {
  admin: { uid: 'admin-1', email: 'admin@landkm.test', role: 'admin', is_active: true },
  editor: { uid: 'editor-1', email: 'editor@landkm.test', role: 'editor', is_active: true },
  reviewer: { uid: 'reviewer-1', email: 'reviewer@landkm.test', role: 'reviewer', is_active: true },
  user: { uid: 'user-1', email: 'user@landkm.test', role: 'viewer', is_active: true },
  other: { uid: 'user-2', email: 'other@landkm.test', role: 'viewer', is_active: true },
  inactive: { uid: 'inactive-1', email: 'inactive@landkm.test', role: 'viewer', is_active: false },
  inactiveReviewer: { uid: 'inactive-reviewer-1', email: 'inactive-reviewer@landkm.test', role: 'reviewer', is_active: false },
  inactiveAdmin: { uid: 'inactive-admin-1', email: 'inactive-admin@landkm.test', role: 'admin', is_active: false }
};

function dbAs(name) {
  const account = accounts[name];
  return env.authenticatedContext(account.uid, {
    email: account.email,
    email_verified: true
  }).firestore();
}

async function commitLifecycleBatch(role, contentId, { nextStatus, action, reason, contentPatch = {}, relatedWrites = null, eventOverrides = {} }) {
  const db = dbAs(role);
  const contentRef = doc(db, 'contents', contentId);
  const counterRef = doc(db, 'versionCounters', contentId);
  const [contentSnapshot, counterSnapshot] = await Promise.all([getDoc(contentRef), getDoc(counterRef)]);
  const before = contentSnapshot.data();
  const actor = accounts[role].email;
  const versionNumber = Number(counterSnapshot.data()?.next_version || 0) + 1;
  const versionId = `${contentId}_V${String(versionNumber).padStart(6, '0')}`;
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(contentRef, {
    ...contentPatch,
    workflow_status: nextStatus,
    updated_at: timestamp,
    last_lifecycle_version_id: versionId
  });
  batch.set(counterRef, {
    content_id: contentId, next_version: versionNumber,
    updated_by: actor, updated_at: timestamp
  }, { merge: true });
  batch.set(doc(db, 'contentVersions', versionId), {
    version_id: versionId, version_number: versionNumber, content_id: contentId,
    content_type: before.content_type, title: contentPatch.title || before.title,
    created_by: before.created_by, editor_email: actor, action, change_reason: reason,
    schema_version: 2, snapshot_status: 'lifecycle',
    lifecycle_from: before.workflow_status, lifecycle_to: nextStatus, created_at: timestamp,
    ...eventOverrides
  });
  if (relatedWrites) relatedWrites(batch, { before, timestamp, versionId, db });
  await batch.commit();
  return { db, versionId, versionNumber };
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

function source(sourceId, createdBy, overrides = {}) {
  return {
    source_id: sourceId,
    source_type: 'law',
    title: 'กฎหมายทดสอบ',
    reference_no: 'ทดสอบ 1/2569',
    document_date: '2026-09-01',
    issuing_authority: 'หน่วยงานทดสอบ',
    official_url: 'https://example.test/source',
    description: '',
    access_level: 'restricted',
    created_by: createdBy,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    ...overrides
  };
}

function sourceRelationships(references) {
  const orderedReferences = [...references].sort((a, b) => a.source_id.localeCompare(b.source_id));
  return {
    source_references: orderedReferences,
    source_ids: orderedReferences.map(reference => reference.source_id)
  };
}

test('ผู้ดูแลกำหนดได้เฉพาะ canonical roles', async () => {
  const adminDb = dbAs('admin');
  for (const role of ['admin', 'editor', 'reviewer', 'viewer']) {
    await assertSucceeds(updateDoc(doc(adminDb, 'users', accounts.user.uid), { role }));
    await assertSucceeds(setDoc(doc(adminDb, 'users', `new-${role}`), {
      role,
      is_active: true
    }));
  }
  await assertFails(updateDoc(doc(adminDb, 'users', accounts.user.uid), { role: 'user' }));
  await assertFails(updateDoc(doc(adminDb, 'users', accounts.user.uid), { role: 'unknown' }));
  await assertFails(setDoc(doc(adminDb, 'users', 'new-invalid'), {
    role: 'unknown',
    is_active: true
  }));
});

test('ผู้ใช้ทั่วไปเปลี่ยน role หรือสถานะของตนเองไม่ได้', async () => {
  const viewerDb = dbAs('user');
  for (const role of ['admin', 'editor', 'reviewer']) {
    await assertFails(updateDoc(doc(viewerDb, 'users', accounts.user.uid), { role }));
  }
  await assertFails(updateDoc(doc(viewerDb, 'users', accounts.user.uid), { is_active: false }));
});

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
    await setDoc(doc(db, 'issueReports', 'ISS-USER'), {
      report_id: 'ISS-USER',
      reported_by: accounts.user.email,
      status: 'open'
    });
    await setDoc(doc(db, 'issueReports', 'ISS-OTHER'), {
      report_id: 'ISS-OTHER',
      reported_by: accounts.other.email,
      status: 'open'
    });
    for (const accountName of ['inactive', 'inactiveReviewer', 'inactiveAdmin', 'editor', 'reviewer', 'admin']) {
      const account = accounts[accountName];
      const reportId = `ISS-${accountName}`;
      await setDoc(doc(db, 'issueReports', reportId), {
        report_id: reportId,
        reported_by: account.email,
        status: 'open'
      });
    }
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

test('ผู้ตรวจสอบเปลี่ยนสถานะ review โดยไม่มีรายการประวัติแบบ atomic ไม่ได้', async () => {
  await assertFails(updateDoc(doc(dbAs('reviewer'), 'contents', 'CNT-REVIEW'), {
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

test('Admin lifecycle status changes require matching atomic history', async () => {
  await assertFails(updateDoc(doc(dbAs('admin'), 'contents', 'CNT-REVIEW'), {
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

test('issueReports: inactive accounts cannot read reports, including their own', async () => {
  await assertFails(getDoc(doc(dbAs('inactive'), 'issueReports', 'ISS-inactive')));
  await assertFails(getDoc(doc(dbAs('inactiveReviewer'), 'issueReports', 'ISS-inactiveReviewer')));
  await assertFails(getDoc(doc(dbAs('inactiveAdmin'), 'issueReports', 'ISS-inactiveAdmin')));
  await assertFails(getDoc(doc(dbAs('inactive'), 'issueReports', 'ISS-OTHER')));
  await assertFails(getDoc(doc(dbAs('inactiveReviewer'), 'issueReports', 'ISS-USER')));
  await assertFails(getDoc(doc(dbAs('inactiveAdmin'), 'issueReports', 'ISS-USER')));
});

test('issueReports: active reporters read only their own reports', async () => {
  await assertSucceeds(getDoc(doc(dbAs('user'), 'issueReports', 'ISS-USER')));
  await assertFails(getDoc(doc(dbAs('user'), 'issueReports', 'ISS-OTHER')));
  await assertSucceeds(getDoc(doc(dbAs('editor'), 'issueReports', 'ISS-editor')));
  await assertFails(getDoc(doc(dbAs('editor'), 'issueReports', 'ISS-OTHER')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'issueReports', 'ISS-USER')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'issueReports', 'ISS-OTHER')));
});

test('issueReports: active reviewers and admins retain reporting reads', async () => {
  await assertSucceeds(getDoc(doc(dbAs('reviewer'), 'issueReports', 'ISS-reviewer')));
  await assertSucceeds(getDoc(doc(dbAs('reviewer'), 'issueReports', 'ISS-OTHER')));
  await assertSucceeds(getDoc(doc(dbAs('admin'), 'issueReports', 'ISS-admin')));
  await assertSucceeds(getDoc(doc(dbAs('admin'), 'issueReports', 'ISS-OTHER')));
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

test('usageStats raw reads are limited to the owner, with admin reporting access', async () => {
  const ownerRef = doc(dbAs('user'), 'usageStats', `${accounts.user.uid}_open_CNT-PUBLISHED`);
  await assertSucceeds(setDoc(ownerRef, {
    user_id: accounts.user.uid,
    action: 'open',
    target_type: 'content',
    target_id: 'CNT-PUBLISHED',
    count: 1,
    last_used_at: serverTimestamp()
  }));
  await assertSucceeds(getDoc(ownerRef));
  await assertFails(getDoc(doc(dbAs('other'), 'usageStats', `${accounts.user.uid}_open_CNT-PUBLISHED`)));
  await assertSucceeds(getDoc(doc(dbAs('admin'), 'usageStats', `${accounts.user.uid}_open_CNT-PUBLISHED`)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'usageStats', `${accounts.user.uid}_open_CNT-PUBLISHED`)));
});

test('usageStats owner query is compatible with owner-only list rules', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'usageStats', `${accounts.user.uid}_open_CNT-PUBLISHED`), {
      user_id: accounts.user.uid, action: 'open', target_type: 'content', target_id: 'CNT-PUBLISHED', count: 1, last_used_at: new Date()
    });
    await setDoc(doc(context.firestore(), 'usageStats', `${accounts.other.uid}_open_CNT-PUBLISHED`), {
      user_id: accounts.other.uid, action: 'open', target_type: 'content', target_id: 'CNT-PUBLISHED', count: 1, last_used_at: new Date()
    });
  });
  const ownStats = await getDocs(query(
    collection(dbAs('user'), 'usageStats'),
    where('user_id', '==', accounts.user.uid)
  ));
  assert.equal(ownStats.size, 1);
  const adminStats = await getDocs(collection(dbAs('admin'), 'usageStats'));
  assert.equal(adminStats.size, 2);
  const reviewerStats = await getDocs(collection(dbAs('reviewer'), 'usageStats'));
  assert.equal(reviewerStats.size, 2);
});

test('usageStats writes cannot create or reassign another user’s record', async () => {
  const userDb = dbAs('user');
  await assertFails(setDoc(doc(userDb, 'usageStats', `${accounts.other.uid}_open_CNT-PUBLISHED`), {
    user_id: accounts.other.uid,
    action: 'open',
    target_type: 'content',
    target_id: 'CNT-PUBLISHED',
    count: 1,
    last_used_at: serverTimestamp()
  }));
  const ownRef = doc(userDb, 'usageStats', `${accounts.user.uid}_open_CNT-PUBLISHED`);
  await assertSucceeds(setDoc(ownRef, {
    user_id: accounts.user.uid,
    action: 'open',
    target_type: 'content',
    target_id: 'CNT-PUBLISHED',
    count: 1,
    last_used_at: serverTimestamp()
  }));
  await assertFails(updateDoc(ownRef, { user_id: accounts.other.uid }));
});

test('usageAggregates support active-client reads and valid increments only', async () => {
  const aggregate = {
    action: 'open',
    target_type: 'content',
    target_id: 'CNT-PUBLISHED',
    count: 1,
    last_used_at: serverTimestamp()
  };
  const aggregateRef = doc(dbAs('user'), 'usageAggregates', 'open_content_CNT-PUBLISHED');
  await assertSucceeds(setDoc(aggregateRef, aggregate));
  await assertSucceeds(getDoc(aggregateRef));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'usageAggregates', 'open_content_CNT-PUBLISHED')));
  await assertSucceeds(updateDoc(aggregateRef, { count: increment(1), last_used_at: serverTimestamp() }));
  await assertFails(setDoc(doc(dbAs('user'), 'usageAggregates', 'admin_override_content_CNT-PUBLISHED'), {
    ...aggregate,
    action: 'admin_override'
  }));
  await assertFails(setDoc(doc(dbAs('user'), 'usageAggregates', 'open_private_CNT-PUBLISHED'), {
    ...aggregate,
    target_type: 'private'
  }));
  await assertFails(setDoc(doc(dbAs('user'), 'usageAggregates', 'open_content_OTHER-CONTENT'), {
    ...aggregate,
    target_id: 'OTHER-CONTENT',
    user_id: accounts.other.uid
  }));
});

test('usageAggregates allow production open/category create and increment pairs only', async () => {
  const userDb = dbAs('user');
  const categoryAggregate = doc(userDb, 'usageAggregates', 'open_category_CAT-TEST');
  const categoryStat = doc(userDb, 'usageStats', `${accounts.user.uid}_open_category_CAT-TEST`);
  const recordCategoryOpen = () => runTransaction(userDb, async transaction => {
    const [aggregateSnapshot, statSnapshot] = await Promise.all([
      transaction.get(categoryAggregate),
      transaction.get(categoryStat)
    ]);
    transaction.set(categoryAggregate, {
      action: 'open',
      target_type: 'category',
      target_id: 'CAT-TEST',
      count: Number(aggregateSnapshot.data()?.count || 0) + 1,
      last_used_at: serverTimestamp()
    });
    transaction.set(categoryStat, {
      user_id: accounts.user.uid,
      action: 'open',
      target_type: 'category',
      target_id: 'CAT-TEST',
      count: Number(statSnapshot.data()?.count || 0) + 1,
      last_used_at: serverTimestamp()
    });
  });
  await assertSucceeds(recordCategoryOpen());
  await assertSucceeds(recordCategoryOpen());
  await assertFails(setDoc(doc(dbAs('user'), 'usageAggregates', 'search_category_CAT-TEST'), {
    action: 'search', target_type: 'category', target_id: 'CAT-TEST', count: 1, last_used_at: serverTimestamp()
  }));
  await assertFails(setDoc(doc(dbAs('user'), 'usageAggregates', 'open_search_CAT-TEST'), {
    action: 'open', target_type: 'search', target_id: 'CAT-TEST', count: 1, last_used_at: serverTimestamp()
  }));
});

test('usageAggregates expose only safe pairs to active users and sensitive pairs to reporters', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, action, targetType, targetId] of [
      ['select_category_CAT-TEST', 'select', 'category', 'CAT-TEST'],
      ['open_category_CAT-TEST', 'open', 'category', 'CAT-TEST'],
      ['open_content_CNT-TEST', 'open', 'content', 'CNT-TEST'],
      ['search_search_personal-term', 'search', 'search', 'personal-term'],
      ['no_result_search_secret-term', 'no_result', 'search', 'secret-term'],
      ['open_content_legacy-mismatch', 'search', 'search', 'legacy-private-term']
    ]) {
      await setDoc(doc(db, 'usageAggregates', id), {
        action, target_type: targetType, target_id: targetId, count: 1,
        last_used_at: new Date()
      });
    }
  });

  const anonymousDb = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymousDb, 'usageAggregates', 'open_content_CNT-TEST')));
  await assertFails(setDoc(doc(anonymousDb, 'usageAggregates', 'open_content_ANON'), {
    action: 'open', target_type: 'content', target_id: 'ANON', count: 1,
    last_used_at: serverTimestamp()
  }));
  for (const role of ['user', 'editor']) {
    const db = dbAs(role);
    await assertSucceeds(getDoc(doc(db, 'usageAggregates', 'open_content_CNT-TEST')));
    await assertFails(getDoc(doc(db, 'usageAggregates', 'search_search_personal-term')));
    await assertFails(getDoc(doc(db, 'usageAggregates', 'no_result_search_secret-term')));
    await assertFails(getDoc(doc(db, 'usageAggregates', 'open_content_legacy-mismatch')));
    for (const [action, targetType] of [['select', 'category'], ['open', 'category'], ['open', 'content']]) {
      await assertSucceeds(getDocs(query(collection(db, 'usageAggregates'),
        where('action', '==', action), where('target_type', '==', targetType), limit(20))));
    }
    await assertFails(getDocs(query(collection(db, 'usageAggregates'),
      where('action', '==', 'search'), where('target_type', '==', 'search'), limit(20))));
    await assertFails(getDocs(collection(db, 'usageAggregates')));
  }
  for (const role of ['reviewer', 'admin']) {
    const db = dbAs(role);
    await assertSucceeds(getDoc(doc(db, 'usageAggregates', 'search_search_personal-term')));
    await assertSucceeds(getDoc(doc(db, 'usageAggregates', 'no_result_search_secret-term')));
  }
});

test('usageAggregates accept canonical safe pairs, reject sensitive pairs and bind IDs', async () => {
  const db = dbAs('user');
  const safePairs = [
    ['select', 'category'],
    ['open', 'category'],
    ['open', 'content']
  ];
  for (const [action, targetType] of safePairs) {
    const id = `${action}_${targetType}_PAIR-TEST`;
    const aggregate = doc(db, 'usageAggregates', id);
    await assertSucceeds(setDoc(aggregate, {
      action, target_type: targetType, target_id: 'PAIR-TEST', count: 1,
      last_used_at: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(aggregate, { count: increment(1), last_used_at: serverTimestamp() }));
    await assertFails(updateDoc(aggregate, { count: increment(2), last_used_at: serverTimestamp() }));
  }
  await assertSucceeds(setDoc(doc(db, 'usageAggregates', 'open_content_CNT: TEST'), {
    action: 'open', target_type: 'content', target_id: 'CNT: TEST', count: 1,
    last_used_at: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, 'usageAggregates', 'open_content_CNT__TEST'), {
    action: 'open', target_type: 'content', target_id: 'CNT: TEST', count: 1,
    last_used_at: serverTimestamp()
  }));
  for (const [action, targetType] of [['search', 'search'], ['no_result', 'search']]) {
    await assertFails(setDoc(doc(db, 'usageAggregates', `${action}_${targetType}_PAIR-TEST`), {
      action, target_type: targetType, target_id: 'PAIR-TEST', count: 1,
      last_used_at: serverTimestamp()
    }));
  }
  await assertFails(setDoc(doc(db, 'usageAggregates', 'alternate_id'), {
    action: 'open', target_type: 'content', target_id: 'PAIR-TEST', count: 1,
    last_used_at: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, 'usageAggregates', 'open_content_OTHER'), {
    action: 'open', target_type: 'content', target_id: 'PAIR-TEST', count: 1,
    last_used_at: serverTimestamp(), user_id: accounts.user.uid
  }));
  await assertFails(setDoc(doc(db, 'usageAggregates', 'open_content_EXTRA'), {
    action: 'open', target_type: 'content', target_id: 'EXTRA', count: 1,
    last_used_at: serverTimestamp(), actor_uid: accounts.user.uid
  }));
});

test('search events remain owner-scoped in usageStats for reviewer reporting', async () => {
  const ownerDb = dbAs('user');
  const ownStat = doc(ownerDb, 'usageStats', `${accounts.user.uid}_no_result_search_SECRET`);
  await assertSucceeds(setDoc(ownStat, {
    user_id: accounts.user.uid, action: 'no_result', target_type: 'search',
    target_id: 'SECRET', count: 1, last_used_at: serverTimestamp()
  }));
  await assertSucceeds(getDoc(ownStat));
  await assertFails(getDoc(doc(dbAs('other'), 'usageStats', ownStat.id)));
  await assertSucceeds(getDoc(doc(dbAs('reviewer'), 'usageStats', ownStat.id)));
});

test('sources restrict reads by access level and writes by staff role', async () => {
  const ids = ['SRC-public01', 'SRC-internal01', 'SRC-restricted01'];
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, accessLevel] of ids.map((id, index) => [id, ['public', 'internal', 'restricted'][index]])) {
      await setDoc(doc(db, 'sources', id), source(id, accounts.admin.email, { access_level: accessLevel }));
    }
  });
  const userDb = dbAs('user');
  await assertSucceeds(getDoc(doc(userDb, 'sources', ids[0])));
  await assertSucceeds(getDoc(doc(userDb, 'sources', ids[1])));
  await assertFails(getDoc(doc(userDb, 'sources', ids[2])));
  await assertSucceeds(getDocs(query(collection(userDb, 'sources'), where('access_level', 'in', ['public', 'internal']))));
  await assertFails(getDocs(collection(userDb, 'sources')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sources', ids[0])));
  await assertFails(getDoc(doc(dbAs('inactive'), 'sources', ids[0])));

  const editorDb = dbAs('editor');
  const editorSource = doc(editorDb, 'sources', 'SRC-editor01');
  await assertSucceeds(setDoc(editorSource, source(editorSource.id, accounts.editor.email)));
  await assertSucceeds(getDoc(editorSource));
  await assertFails(updateDoc(editorSource, { title: 'แก้ไขเอง' }));
  await assertFails(getDoc(doc(editorDb, 'sources', ids[2])));
  await assertSucceeds(getDocs(query(collection(editorDb, 'sources'), where('access_level', 'in', ['public', 'internal']), limit(10))));
  await assertSucceeds(getDocs(query(collection(editorDb, 'sources'), where('created_by', '==', accounts.editor.email), limit(10))));
  await assertFails(getDocs(collection(editorDb, 'sources')));
  await assertFails(setDoc(doc(editorDb, 'sources', 'SRC-editor-public'), source('SRC-editor-public', accounts.editor.email, { access_level: 'public' })));
  await assertFails(setDoc(doc(dbAs('reviewer'), 'sources', 'SRC-reviewer01'), source('SRC-reviewer01', accounts.reviewer.email)));
  await assertSucceeds(getDoc(doc(dbAs('reviewer'), 'sources', ids[2])));
  const adminDb = dbAs('admin');
  const adminSource = doc(adminDb, 'sources', 'SRC-admin00001');
  await assertSucceeds(setDoc(adminSource, source(adminSource.id, accounts.admin.email, { access_level: 'public' })));
  await assertSucceeds(updateDoc(adminSource, { title: 'ปรับข้อมูลโดยผู้ดูแล', updated_at: serverTimestamp() }));
  await assertFails(deleteDoc(adminSource));
});

test('source schema rejects unsupported types, missing identity/title, malformed URLs and unexpected fields', async () => {
  const db = dbAs('admin');
  const invalidType = source('SRC-invalidType', accounts.admin.email, { source_type: 'constitution' });
  await assertFails(setDoc(doc(db, 'sources', 'SRC-invalidType'), invalidType));
  await assertFails(setDoc(doc(db, 'sources', 'SRC-short'), source('SRC-short', accounts.admin.email)));
  const missingTitle = source('SRC-missingTitle', accounts.admin.email);
  delete missingTitle.title;
  await assertFails(setDoc(doc(db, 'sources', 'SRC-missingTitle'), missingTitle));
  await assertFails(setDoc(doc(db, 'sources', 'SRC-badUrl'), source('SRC-badUrl', accounts.admin.email, { official_url: 'javascript:alert(1)' })));
  await assertFails(setDoc(doc(db, 'sources', 'SRC-extra'), source('SRC-extra', accounts.admin.email, { ai_summary: 'not supported' })));
  await assertFails(setDoc(doc(db, 'sources', 'wrong-path-id'), source('SRC-other', accounts.admin.email)));
});

test('content source relationship Rules enforce exact shapes, bounded unique IDs, and correspondence', async () => {
  const db = dbAs('editor');
  const one = { source_id: 'SRC-one00001', relation_type: 'primary' };
  const two = { source_id: 'SRC-two00002', relation_type: 'supporting' };
  const valid = doc(db, 'contents', 'CNT-SOURCE-VALID');
  await assertSucceeds(setDoc(valid, content({
    content_id: valid.id,
    workflow_status: 'draft',
    created_by: accounts.editor.email,
    ...sourceRelationships([one, two])
  })));
  const five = Array.from({ length: 5 }, (_, index) => ({ source_id: `SRC-bound000${index}`, relation_type: index ? 'supporting' : 'primary' }));
  await assertSucceeds(setDoc(doc(db, 'contents', 'CNT-SOURCE-AT-BOUND'), content({
    content_id: 'CNT-SOURCE-AT-BOUND', workflow_status: 'draft', created_by: accounts.editor.email,
    ...sourceRelationships(five)
  })));
  await assertSucceeds(setDoc(doc(db, 'contents', 'CNT-LEGACY-NO-SOURCES'), content({
    content_id: 'CNT-LEGACY-NO-SOURCES', workflow_status: 'draft', created_by: accounts.editor.email
  })));

  const mismatch = doc(db, 'contents', 'CNT-SOURCE-MISMATCH');
  await assertFails(setDoc(mismatch, content({
    content_id: mismatch.id, workflow_status: 'draft', created_by: accounts.editor.email,
    source_references: [one], source_ids: ['SRC-another01']
  })));
  const invalidRelation = doc(db, 'contents', 'CNT-SOURCE-RELATION');
  await assertFails(setDoc(invalidRelation, content({
    content_id: invalidRelation.id, workflow_status: 'draft', created_by: accounts.editor.email,
    ...sourceRelationships([{ ...one, relation_type: 'supersedes' }])
  })));
  const duplicate = doc(db, 'contents', 'CNT-SOURCE-DUPLICATE');
  await assertFails(setDoc(duplicate, content({
    content_id: duplicate.id, workflow_status: 'draft', created_by: accounts.editor.email,
    ...sourceRelationships([one, { ...one, relation_type: 'supporting' }])
  })));
  const unexpectedMapKey = doc(db, 'contents', 'CNT-SOURCE-EXTRA');
  await assertFails(setDoc(unexpectedMapKey, content({
    content_id: unexpectedMapKey.id, workflow_status: 'draft', created_by: accounts.editor.email,
    ...sourceRelationships([{ ...one, title: 'duplicated metadata' }])
  })));
  const tooMany = Array.from({ length: 6 }, (_, index) => ({
    source_id: `SRC-${String(index).padStart(8, '0')}`,
    relation_type: index === 0 ? 'primary' : 'supporting'
  }));
  const tooManyRef = doc(db, 'contents', 'CNT-SOURCE-TOO-MANY');
  await assertFails(setDoc(tooManyRef, content({
    content_id: tooManyRef.id, workflow_status: 'draft', created_by: accounts.editor.email,
    ...sourceRelationships(tooMany)
  })));
});

test('source_ids array-contains supports reverse traceability within content read Rules', async () => {
  const sourceId = 'SRC-reverse00001';
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'contents', 'CNT-REVERSE-PUBLISHED'), content({
      content_id: 'CNT-REVERSE-PUBLISHED', source_references: [{ source_id: sourceId, relation_type: 'primary' }], source_ids: [sourceId]
    }));
    await setDoc(doc(db, 'contents', 'CNT-REVERSE-PRIVATE'), content({
      content_id: 'CNT-REVERSE-PRIVATE', workflow_status: 'draft', created_by: accounts.other.email,
      source_references: [{ source_id: sourceId, relation_type: 'primary' }], source_ids: [sourceId]
    }));
  });
  const adminResults = await assertSucceeds(getDocs(query(collection(dbAs('admin'), 'contents'), where('source_ids', 'array-contains', sourceId))));
  assert.equal(adminResults.size, 2);
  await assertFails(getDocs(query(collection(dbAs('user'), 'contents'), where('source_ids', 'array-contains', sourceId))));
  await assertFails(getDocs(query(collection(dbAs('editor'), 'contents'), where('source_ids', 'array-contains', sourceId))));
});

test('source relationships preserve Editor ownership and Reviewer workflow-only boundaries', async () => {
  const editorDb = dbAs('editor');
  const own = doc(editorDb, 'contents', 'CNT-DRAFT');
  await assertSucceeds(updateDoc(own, sourceRelationships([{ source_id: 'SRC-own00001', relation_type: 'primary' }])));
  await assertFails(updateDoc(doc(editorDb, 'contents', 'CNT-OTHER-DRAFT'), sourceRelationships([{ source_id: 'SRC-other00001', relation_type: 'primary' }])));
  await assertFails(setDoc(doc(editorDb, 'contents', 'CNT-EDITOR-PUBLISHED-SOURCE'), content({
    content_id: 'CNT-EDITOR-PUBLISHED-SOURCE', created_by: accounts.editor.email,
    ...sourceRelationships([{ source_id: 'SRC-own00001', relation_type: 'primary' }])
  })));
  const reviewerDb = dbAs('reviewer');
  await assertFails(updateDoc(doc(reviewerDb, 'contents', 'CNT-REVIEW'), sourceRelationships([{ source_id: 'SRC-review00001', relation_type: 'primary' }])));
  await commitLifecycleBatch('reviewer', 'CNT-REVIEW', {
    nextStatus: 'approved', action: 'approve', reason: 'อนุมัติหลังตรวจสอบ',
    contentPatch: { approved_by: accounts.reviewer.email, approved_at: serverTimestamp() }
  });
  await assertSucceeds(updateDoc(doc(dbAs('admin'), 'contents', 'CNT-OTHER-DRAFT'), sourceRelationships([{ source_id: 'SRC-admin00001', relation_type: 'primary' }])));
});

function ingestionPayload(sourceId, ingestionId, overrides = {}) {
  return {
    ingestion_id: ingestionId, source_id: sourceId, ingestion_method: 'text', document_label: 'ฉบับทดสอบ',
    content_hash: 'a'.repeat(64), normalizer_version: 'text-normalizer-v1', segmenter_version: 'paragraph-segmenter-v1',
    extraction_status: 'completed', source_snapshot: { source_type: 'law', title: 'กฎหมายทดสอบ' },
    created_by: accounts.editor.email, created_at: serverTimestamp(), updated_at: serverTimestamp(), ...overrides
  };
}

function evidencePayload(sourceId, ingestionId, evidenceId, overrides = {}) {
  return {
    evidence_id: evidenceId, source_id: sourceId, ingestion_id: ingestionId, sequence: 0,
    text: 'ข้อความต้นฉบับ มาตรา 74', text_hash: 'b'.repeat(64), review_status: 'extracted',
    created_at: serverTimestamp(), ...overrides
  };
}

async function seedIngestionTree(sourceId, createdBy = accounts.editor.email) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'sources', sourceId), source(sourceId, createdBy));
    await setDoc(doc(db, 'sources', sourceId, 'ingestions', 'INGESTION-001'), ingestionPayload(sourceId, 'INGESTION-001'));
    await setDoc(doc(db, 'sources', sourceId, 'ingestions', 'INGESTION-001', 'evidence', 'EVIDENCE-001'), evidencePayload(sourceId, 'INGESTION-001', 'EVIDENCE-001'));
  });
}

function commitIngestionBatch(db, sourceId, ingestionId, evidenceId, {
  ingestionOverrides = {},
  evidenceOverrides = {}
} = {}) {
  const ingestionRef = doc(db, 'sources', sourceId, 'ingestions', ingestionId);
  const evidenceRef = doc(ingestionRef, 'evidence', evidenceId);
  const batch = writeBatch(db);
  batch.set(ingestionRef, ingestionPayload(sourceId, ingestionId, ingestionOverrides));
  batch.set(evidenceRef, evidencePayload(sourceId, ingestionId, evidenceId, evidenceOverrides));
  return batch.commit();
}

test('Feature 12C allows a valid Editor ingestion and evidence atomic batch', async () => {
  const sourceId = 'SRC-F12C-ATOMIC-OK';
  await seedIngestionTree(sourceId, accounts.editor.email);
  await assertSucceeds(commitIngestionBatch(
    dbAs('editor'), sourceId, 'ING-F12C-ATOMIC-OK', 'EVID-F12C-ATOMIC-OK'
  ));
});

test('Feature 12C denies evidence without its matching staged or existing ingestion', async () => {
  const sourceId = 'SRC-F12C-NO-PARENT';
  await seedIngestionTree(sourceId, accounts.editor.email);
  await assertFails(setDoc(
    doc(dbAs('editor'), 'sources', sourceId, 'ingestions', 'ING-F12C-MISSING', 'evidence', 'EVID-F12C-MISSING'),
    evidencePayload(sourceId, 'ING-F12C-MISSING', 'EVID-F12C-MISSING')
  ));
});

test('Feature 12C denies evidence when the staged ingestion is invalid or not completed', async () => {
  const sourceId = 'SRC-F12C-FAILED-PARENT';
  await seedIngestionTree(sourceId, accounts.editor.email);
  await assertFails(commitIngestionBatch(
    dbAs('editor'), sourceId, 'ING-F12C-INVALID-PARENT', 'EVID-F12C-INVALID-PARENT',
    { ingestionOverrides: { source_snapshot: { source_type: 'law', title: 'Wrong canonical title' } } }
  ));
  await assertFails(commitIngestionBatch(
    dbAs('editor'), sourceId, 'ING-F12C-FAILED-PARENT', 'EVID-F12C-FAILED-PARENT',
    { ingestionOverrides: { extraction_status: 'failed' } }
  ));
});

test('Feature 12C denies evidence with mismatched source or ingestion identity', async () => {
  const sourceId = 'SRC-F12C-MISMATCH';
  await seedIngestionTree(sourceId, accounts.editor.email);
  const db = dbAs('editor');
  await assertFails(commitIngestionBatch(
    db, sourceId, 'ING-F12C-WRONG-SOURCE', 'EVID-F12C-WRONG-SOURCE',
    { evidenceOverrides: { source_id: 'SRC-F12C-OTHER-SOURCE' } }
  ));
  await assertFails(commitIngestionBatch(
    db, sourceId, 'ING-F12C-WRONG-INGESTION', 'EVID-F12C-WRONG-INGESTION',
    { evidenceOverrides: { ingestion_id: 'ING-F12C-OTHER-PARENT' } }
  ));
});

test('Feature 12C denies unauthorized or inactive atomic ingestion batches', async () => {
  const sourceId = 'SRC-F12C-ROLE-GUARD';
  await seedIngestionTree(sourceId, accounts.editor.email);
  await assertFails(commitIngestionBatch(
    dbAs('reviewer'), sourceId, 'ING-F12C-REVIEWER', 'EVID-F12C-REVIEWER'
  ));
  await assertFails(commitIngestionBatch(
    dbAs('inactiveAdmin'), sourceId, 'ING-F12C-INACTIVE', 'EVID-F12C-INACTIVE',
    { ingestionOverrides: { created_by: accounts.inactiveAdmin.email } }
  ));
});

test('Feature 12C denies malformed evidence and invalid initial review status in atomic batches', async () => {
  const sourceId = 'SRC-F12C-EVIDENCE-SHAPE';
  await seedIngestionTree(sourceId, accounts.editor.email);
  const db = dbAs('editor');
  await assertFails(commitIngestionBatch(
    db, sourceId, 'ING-F12C-LONG-EVIDENCE', 'EVID-F12C-LONG-EVIDENCE',
    { evidenceOverrides: { text: 'x'.repeat(8001) } }
  ));
  await assertFails(commitIngestionBatch(
    db, sourceId, 'ING-F12C-REVIEW-STATUS', 'EVID-F12C-REVIEW-STATUS',
    { evidenceOverrides: { review_status: 'reviewed', reviewed_by: accounts.editor.email, reviewed_at: serverTimestamp() } }
  ));
});

test('Feature 11 nested evidence inherits source visibility and protects restricted records', async () => {
  const sourceId = 'SRC-EVIDENCE-001';
  await seedIngestionTree(sourceId);
  const evidencePath = ['sources', sourceId, 'ingestions', 'INGESTION-001', 'evidence', 'EVIDENCE-001'];
  await assertSucceeds(getDoc(doc(dbAs('editor'), ...evidencePath)));
  await assertSucceeds(getDoc(doc(dbAs('reviewer'), ...evidencePath)));
  await assertSucceeds(getDoc(doc(dbAs('admin'), ...evidencePath)));
  await assertFails(getDoc(doc(dbAs('user'), ...evidencePath)));
  await assertFails(getDoc(doc(dbAs('inactive'), ...evidencePath)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), ...evidencePath)));
  await assertFails(getDoc(doc(dbAs('other'), 'sources', 'SRC-MISSING-001', 'ingestions', 'INGESTION-001')));
});

test('Feature 11 evidence stays staff-only even when the canonical source is public', async () => {
  const sourceId = 'SRC-EVIDENCE-PUBLIC';
  await seedIngestionTree(sourceId);
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'sources', sourceId), { access_level: 'public' });
  });
  await assertSucceeds(getDoc(doc(dbAs('user'), 'sources', sourceId)));
  await assertFails(getDoc(doc(dbAs('user'), 'sources', sourceId, 'ingestions', 'INGESTION-001')));
  await assertFails(getDoc(doc(dbAs('user'), 'sources', sourceId, 'ingestions', 'INGESTION-001', 'evidence', 'EVIDENCE-001')));
  await assertSucceeds(getDoc(doc(dbAs('editor'), 'sources', sourceId, 'ingestions', 'INGESTION-001', 'evidence', 'EVIDENCE-001')));
});

test('Feature 11 permits append-only Editor ingestion only on owned or permitted sources', async () => {
  const ownSource = 'SRC-EVIDENCE-OWN';
  await seedIngestionTree(ownSource);
  const editorDb = dbAs('editor');
  const parent = doc(editorDb, 'sources', ownSource, 'ingestions', 'INGESTION-002');
  await assertSucceeds(setDoc(parent, ingestionPayload(ownSource, 'INGESTION-002')));
  await assertSucceeds(setDoc(doc(parent, 'evidence', 'EVIDENCE-002'), evidencePayload(ownSource, 'INGESTION-002', 'EVIDENCE-002')));
  await assertFails(updateDoc(parent, { document_label: 'mutated' }));
  await assertFails(deleteDoc(parent));
  await assertFails(deleteDoc(doc(parent, 'evidence', 'EVIDENCE-002')));
  await seedIngestionTree('SRC-EVIDENCE-OTHER', 'another-editor@landkm.test');
  await assertFails(setDoc(doc(editorDb, 'sources', 'SRC-EVIDENCE-OTHER', 'ingestions', 'INGESTION-003'), ingestionPayload('SRC-EVIDENCE-OTHER', 'INGESTION-003')));
  await assertFails(setDoc(doc(dbAs('reviewer'), 'sources', ownSource, 'ingestions', 'INGESTION-004'), ingestionPayload(ownSource, 'INGESTION-004')));
});

test('Feature 11 Reviewer can only transition extracted evidence to reviewed once', async () => {
  const sourceId = 'SRC-EVIDENCE-REVIEW';
  await seedIngestionTree(sourceId);
  const evidenceRef = doc(dbAs('reviewer'), 'sources', sourceId, 'ingestions', 'INGESTION-001', 'evidence', 'EVIDENCE-001');
  await assertSucceeds(updateDoc(evidenceRef, { review_status: 'reviewed', reviewed_by: accounts.reviewer.email, reviewed_at: serverTimestamp() }));
  await assertFails(updateDoc(evidenceRef, { text: 'rewritten evidence' }));
  await assertFails(updateDoc(evidenceRef, { review_status: 'extracted' }));
  await assertFails(updateDoc(evidenceRef, { review_status: 'reviewed', reviewed_by: accounts.admin.email, reviewed_at: serverTimestamp() }));
  await assertFails(updateDoc(doc(dbAs('editor'), 'sources', sourceId, 'ingestions', 'INGESTION-001', 'evidence', 'EVIDENCE-001'), { review_status: 'reviewed', reviewed_by: accounts.editor.email, reviewed_at: serverTimestamp() }));
});

test('Feature 11 Rules reject malformed provenance, path linkage, and oversized evidence', async () => {
  const sourceId = 'SRC-EVIDENCE-SHAPE';
  await seedIngestionTree(sourceId);
  const editorDb = dbAs('editor');
  const ingestionRef = doc(editorDb, 'sources', sourceId, 'ingestions', 'INGESTION-002');
  await assertFails(setDoc(ingestionRef, ingestionPayload(sourceId, 'WRONG-INGESTION')));
  await assertFails(setDoc(ingestionRef, ingestionPayload(sourceId, 'INGESTION-002', { original_url: 'javascript:alert(1)' })));
  await assertFails(setDoc(ingestionRef, ingestionPayload(sourceId, 'INGESTION-002', { source_snapshot: { source_type: 'law', title: 'Fabricated title' } })));
  await assertSucceeds(setDoc(ingestionRef, ingestionPayload(sourceId, 'INGESTION-002')));
  await assertFails(setDoc(doc(ingestionRef, 'evidence', 'EVIDENCE-BAD'), evidencePayload(sourceId, 'WRONG-INGESTION', 'EVIDENCE-BAD')));
  await assertFails(setDoc(doc(ingestionRef, 'evidence', 'EVIDENCE-LONG'), evidencePayload(sourceId, 'INGESTION-002', 'EVIDENCE-LONG', { text: 'x'.repeat(8001) })));
  await assertFails(setDoc(doc(ingestionRef, 'evidence', 'EVIDENCE-EXTRA'), evidencePayload(sourceId, 'INGESTION-002', 'EVIDENCE-EXTRA', { access_level: 'public' })));
  await assertSucceeds(setDoc(doc(editorDb, 'sources', sourceId, 'ingestions', 'INGESTION-FAILED'), ingestionPayload(sourceId, 'INGESTION-FAILED', { extraction_status: 'failed' })));
  await assertFails(setDoc(doc(editorDb, 'sources', sourceId, 'ingestions', 'INGESTION-FAILED', 'evidence', 'EVIDENCE-FAILED'), evidencePayload(sourceId, 'INGESTION-FAILED', 'EVIDENCE-FAILED')));
});

test('Feature 12A keeps legacy text ingestion valid and permits bounded local-file provenance', async () => {
  const sourceId = 'SRC-F12A-SCHEMA';
  await seedIngestionTree(sourceId);
  const editorDb = dbAs('editor');
  const root = ['sources', sourceId, 'ingestions'];
  await assertSucceeds(setDoc(doc(editorDb, ...root, 'ING-F12A-LEGACY'), ingestionPayload(sourceId, 'ING-F12A-LEGACY')));
  await assertSucceeds(setDoc(doc(editorDb, ...root, 'ING-F12A-TXT'), ingestionPayload(sourceId, 'ING-F12A-TXT', {
    ingestion_method: 'local_file', original_filename: 'land-law.txt', media_type: 'text/plain', extractor: 'browser-text', extractor_version: 'text-decoder-v1'
  })));
  await assertSucceeds(setDoc(doc(editorDb, ...root, 'ING-F12A-PDF'), ingestionPayload(sourceId, 'ING-F12A-PDF', {
    ingestion_method: 'local_file', original_filename: 'law.pdf', media_type: 'application/pdf', extractor: 'pdfjs', extractor_version: '4.10.38'
  })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-NOPROV'), ingestionPayload(sourceId, 'ING-F12A-NOPROV', { ingestion_method: 'local_file' })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-BADMETHOD'), ingestionPayload(sourceId, 'ING-F12A-BADMETHOD', { ingestion_method: 'upload' })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-EXTRA'), ingestionPayload(sourceId, 'ING-F12A-EXTRA', { storage_path: 'source-ingestions/file.pdf' })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-BADMIME'), ingestionPayload(sourceId, 'ING-F12A-BADMIME', {
    ingestion_method: 'local_file', original_filename: 'law.pdf', media_type: 'application/octet-stream', extractor: 'pdfjs', extractor_version: '4.10.38'
  })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-BADPAIR'), ingestionPayload(sourceId, 'ING-F12A-BADPAIR', {
    ingestion_method: 'local_file', original_filename: 'law.pdf', media_type: 'application/pdf', extractor: 'mammoth', extractor_version: '1.9.1'
  })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-LONGNAME'), ingestionPayload(sourceId, 'ING-F12A-LONGNAME', {
    ingestion_method: 'local_file', original_filename: 'x'.repeat(256), media_type: 'text/plain', extractor: 'browser-text', extractor_version: 'text-decoder-v1'
  })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-LONGVERSION'), ingestionPayload(sourceId, 'ING-F12A-LONGVERSION', {
    ingestion_method: 'local_file', original_filename: 'law.txt', media_type: 'text/plain', extractor: 'browser-text', extractor_version: 'x'.repeat(41)
  })));
});

test('Feature 12A remote URL provenance is HTTP(S)-only and cannot carry local-file identity', async () => {
  const sourceId = 'SRC-F12A-URL';
  await seedIngestionTree(sourceId);
  const root = ['sources', sourceId, 'ingestions'];
  const editorDb = dbAs('editor');
  const provenance = { ingestion_method: 'remote_url', original_url: 'https://example.test/land-law.txt', media_type: 'text/plain', extractor: 'browser-text', extractor_version: 'text-decoder-v1' };
  await assertSucceeds(setDoc(doc(editorDb, ...root, 'ING-F12A-URL'), ingestionPayload(sourceId, 'ING-F12A-URL', provenance)));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-BADURL'), ingestionPayload(sourceId, 'ING-F12A-BADURL', { ...provenance, original_url: 'file:///private/law.txt' })));
  await assertFails(setDoc(doc(editorDb, ...root, 'ING-F12A-CONFLICT'), ingestionPayload(sourceId, 'ING-F12A-CONFLICT', { ...provenance, original_filename: 'law.txt' })));
});

test('Feature 12A ingestion provenance is immutable and role boundaries remain unchanged', async () => {
  const sourceId = 'SRC-F12A-IMMUTABLE';
  await seedIngestionTree(sourceId);
  const root = ['sources', sourceId, 'ingestions', 'ING-F12A-IMMUTABLE'];
  const editorDb = dbAs('editor');
  await assertSucceeds(setDoc(doc(editorDb, ...root), ingestionPayload(sourceId, 'ING-F12A-IMMUTABLE', {
    ingestion_method: 'local_file', original_filename: 'law.pdf', media_type: 'application/pdf', extractor: 'pdfjs', extractor_version: '4.10.38'
  })));
  await assertFails(updateDoc(doc(editorDb, ...root), { original_filename: 'changed.pdf' }));
  await assertFails(setDoc(doc(dbAs('reviewer'), 'sources', sourceId, 'ingestions', 'ING-F12A-REVIEWER'), ingestionPayload(sourceId, 'ING-F12A-REVIEWER')));
  await assertFails(setDoc(doc(dbAs('user'), 'sources', sourceId, 'ingestions', 'ING-F12A-USER'), ingestionPayload(sourceId, 'ING-F12A-USER')));
  await assertFails(setDoc(doc(dbAs('inactive'), 'sources', sourceId, 'ingestions', 'ING-F12A-INACTIVE'), ingestionPayload(sourceId, 'ING-F12A-INACTIVE')));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'sources', sourceId, 'ingestions', 'ING-F12A-ANON'), ingestionPayload(sourceId, 'ING-F12A-ANON')));
  await assertSucceeds(setDoc(doc(dbAs('admin'), 'sources', sourceId, 'ingestions', 'ING-F12A-ADMIN'), ingestionPayload(sourceId, 'ING-F12A-ADMIN', {
    created_by: accounts.admin.email, ingestion_method: 'local_file', original_filename: 'law.docx', media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extractor: 'mammoth', extractor_version: '1.9.1'
  })));
});

function publishedEvidenceProjection(sourceId, sourceName, ingestionId, evidenceId, contentUpdatedAt, overrides = {}) {
  return {
    source_id: sourceId, source_name: sourceName, ingestion_id: ingestionId,
    evidence_id: evidenceId, excerpt: 'ข้อความหลักฐานที่ผ่านการตรวจสอบ',
    content_updated_at: contentUpdatedAt, ...overrides
  };
}

async function seedPublishedEvidenceScenario({
  contentId = 'CNT-PROJECTION', sourceId = 'SRC-PROJECTION', accessLevel = 'public',
  contentAccess = 'internal', workflowStatus = 'published', reviewStatus = 'reviewed',
  sourceReferenceId = sourceId, withProjection = true, stale = false
} = {}) {
  const updatedAt = new Date('2026-10-01T00:00:00Z');
  const ingestionId = 'ING-PROJECTION';
  const evidenceId = 'EVID-PROJECTION';
  const canonicalSource = source(sourceId, accounts.editor.email, { access_level: accessLevel });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'sources', sourceId), canonicalSource);
    await setDoc(doc(db, 'sources', sourceId, 'ingestions', ingestionId), ingestionPayload(sourceId, ingestionId));
    await setDoc(doc(db, 'sources', sourceId, 'ingestions', ingestionId, 'evidence', evidenceId), evidencePayload(sourceId, ingestionId, evidenceId, { review_status: reviewStatus }));
    await setDoc(doc(db, 'contents', contentId), content({
      content_id: contentId, workflow_status: workflowStatus, access_level: contentAccess,
      source_ids: [sourceReferenceId], source_references: [{ source_id: sourceReferenceId, relation_type: 'primary' }], updated_at: updatedAt
    }));
    if (withProjection) await setDoc(doc(db, 'contents', contentId, 'publishedEvidence', sourceId), publishedEvidenceProjection(
      sourceId, canonicalSource.title, ingestionId, evidenceId,
      stale ? new Date('2026-09-30T00:00:00Z') : updatedAt
    ));
  });
  return { contentId, sourceId, ingestionId, evidenceId, sourceName: canonicalSource.title, updatedAt };
}

test('Feature 13A atomically publishes content with reviewed published evidence and keeps raw evidence staff-only', async () => {
  const seeded = await seedPublishedEvidenceScenario({
    contentId: 'CNT-PROJECTION-ATOMIC', sourceId: 'SRC-PROJECTION-ATOMIC',
    workflowStatus: 'approved', withProjection: false
  });
  await commitLifecycleBatch('admin', seeded.contentId, {
    nextStatus: 'published', action: 'publish', reason: 'เผยแพร่หลังตรวจสอบ',
    contentPatch: { published_by: accounts.admin.email, published_at: serverTimestamp() },
    relatedWrites: (batch, { timestamp, db }) => batch.set(
      doc(db, 'contents', seeded.contentId, 'publishedEvidence', seeded.sourceId),
      publishedEvidenceProjection(seeded.sourceId, seeded.sourceName, seeded.ingestionId, seeded.evidenceId, timestamp, { locator: 'มาตรา 74' })
    )
  });
  const userDb = dbAs('user');
  await assertSucceeds(getDoc(doc(userDb, 'contents', seeded.contentId, 'publishedEvidence', seeded.sourceId)));
  const publishedContent = await getDoc(doc(userDb, 'contents', seeded.contentId));
  await assertFails(getDocs(query(
    collection(userDb, 'contents', seeded.contentId, 'publishedEvidence'),
    where('content_updated_at', '==', publishedContent.data().updated_at)
  )));
  await assertFails(getDoc(doc(dbAs('user'), 'sources', seeded.sourceId, 'ingestions', seeded.ingestionId, 'evidence', seeded.evidenceId)));
});

test('Feature 13A denies unauthorized, malformed, unreviewed, and unrelated projections', async () => {
  const seeded = await seedPublishedEvidenceScenario({
    contentId: 'CNT-PROJECTION-DENY', sourceId: 'SRC-PROJECTION-DENY', withProjection: false
  });
  const projectionRef = (db, contentId = seeded.contentId) => doc(db, 'contents', contentId, 'publishedEvidence', seeded.sourceId);
  const valid = publishedEvidenceProjection(seeded.sourceId, seeded.sourceName, seeded.ingestionId, seeded.evidenceId, serverTimestamp());
  await assertFails(setDoc(projectionRef(dbAs('user')), valid));
  await assertFails(setDoc(projectionRef(dbAs('admin')), valid));

  const adminDb = dbAs('admin');
  const malformedBatch = writeBatch(adminDb);
  const malformedTime = serverTimestamp();
  malformedBatch.update(doc(adminDb, 'contents', seeded.contentId), { updated_at: malformedTime });
  malformedBatch.set(projectionRef(adminDb), { ...publishedEvidenceProjection(seeded.sourceId, seeded.sourceName, seeded.ingestionId, seeded.evidenceId, malformedTime), secret: 'extra' });
  await assertFails(malformedBatch.commit());

  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(doc(db, 'sources', seeded.sourceId, 'ingestions', seeded.ingestionId, 'evidence', seeded.evidenceId), { review_status: 'extracted' });
  });
  const unreviewedBatch = writeBatch(adminDb);
  const unreviewedTime = serverTimestamp();
  unreviewedBatch.update(doc(adminDb, 'contents', seeded.contentId), { updated_at: unreviewedTime });
  unreviewedBatch.set(projectionRef(adminDb), publishedEvidenceProjection(seeded.sourceId, seeded.sourceName, seeded.ingestionId, seeded.evidenceId, unreviewedTime));
  await assertFails(unreviewedBatch.commit());

  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(doc(db, 'sources', seeded.sourceId, 'ingestions', seeded.ingestionId, 'evidence', seeded.evidenceId), { review_status: 'reviewed' });
  });
  const unrelatedBatch = writeBatch(adminDb);
  const unrelatedTime = serverTimestamp();
  unrelatedBatch.update(doc(adminDb, 'contents', seeded.contentId), {
    updated_at: unrelatedTime,
    source_ids: ['SRC-UNRELATED'],
    source_references: [{ source_id: 'SRC-UNRELATED', relation_type: 'primary' }]
  });
  unrelatedBatch.set(projectionRef(adminDb), publishedEvidenceProjection(seeded.sourceId, seeded.sourceName, seeded.ingestionId, seeded.evidenceId, unrelatedTime));
  await assertFails(unrelatedBatch.commit());
});

test('Feature 13A projections follow published parent and source access, and stale projections fail closed', async () => {
  const publicRecord = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-PUBLIC', sourceId: 'SRC-PROJECTION-PUBLIC', accessLevel: 'public', contentAccess: 'public' });
  const internalRecord = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-INTERNAL', sourceId: 'SRC-PROJECTION-INTERNAL', accessLevel: 'internal', contentAccess: 'internal' });
  const draftRecord = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-DRAFT', sourceId: 'SRC-PROJECTION-DRAFT', workflowStatus: 'draft' });
  const privateRecord = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-RESTRICTED', sourceId: 'SRC-PROJECTION-RESTRICTED', contentAccess: 'restricted' });
  const privateSourceRecord = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-SOURCE-RESTRICTED', sourceId: 'SRC-PROJECTION-SOURCE-RESTRICTED', accessLevel: 'restricted' });
  const staleRecord = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-STALE', sourceId: 'SRC-PROJECTION-STALE', stale: true });
  const userDb = dbAs('user');
  const projectionRef = record => doc(userDb, 'contents', record.contentId, 'publishedEvidence', record.sourceId);
  await assertSucceeds(getDoc(projectionRef(publicRecord)));
  await assertSucceeds(getDoc(projectionRef(internalRecord)));
  await assertFails(getDoc(projectionRef(draftRecord)));
  await assertFails(getDoc(projectionRef(privateRecord)));
  await assertFails(getDoc(projectionRef(privateSourceRecord)));
  await assertFails(getDoc(projectionRef(staleRecord)));

  const changedParent = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-CHANGED', sourceId: 'SRC-PROJECTION-CHANGED' });
  await assertSucceeds(updateDoc(doc(dbAs('admin'), 'contents', changedParent.contentId), { updated_at: serverTimestamp() }));
  await assertFails(getDoc(projectionRef(changedParent)));

  const unpublished = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-UNPUBLISHED', sourceId: 'SRC-PROJECTION-UNPUBLISHED' });
  await commitLifecycleBatch('admin', unpublished.contentId, {
    nextStatus: 'draft', action: 'withdraw', reason: 'ทดสอบถอนเผยแพร่'
  });
  await assertFails(getDoc(projectionRef(unpublished)));

  const sourceAccessChanged = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-ACCESS', sourceId: 'SRC-PROJECTION-ACCESS', accessLevel: 'public' });
  await assertSucceeds(getDoc(projectionRef(sourceAccessChanged)));
  await assertSucceeds(updateDoc(doc(dbAs('admin'), 'sources', sourceAccessChanged.sourceId), { access_level: 'restricted', updated_at: serverTimestamp() }));
  await assertFails(getDoc(projectionRef(sourceAccessChanged)));

  const contentAccessChanged = await seedPublishedEvidenceScenario({ contentId: 'CNT-PROJECTION-CONTENT-ACCESS', sourceId: 'SRC-PROJECTION-CONTENT-ACCESS', contentAccess: 'public' });
  await assertSucceeds(getDoc(projectionRef(contentAccessChanged)));
  await assertSucceeds(updateDoc(doc(dbAs('admin'), 'contents', contentAccessChanged.contentId), {
    access_level: 'restricted', updated_at: serverTimestamp()
  }));
  await assertFails(getDoc(projectionRef(contentAccessChanged)));
});

test('Feature 14A Admin withdrawal atomically records lifecycle history and hides content and its evidence projection', async () => {
  const seeded = await seedPublishedEvidenceScenario({
    contentId: 'CNT-F14A-WITHDRAW', sourceId: 'SRC-F14A-WITHDRAW'
  });
  const { db: adminDb, versionId } = await commitLifecycleBatch('admin', seeded.contentId, {
    nextStatus: 'draft', action: 'withdraw', reason: 'แก้ไขเนื้อหาที่ล้าสมัย'
  });
  const event = await getDoc(doc(adminDb, 'contentVersions', versionId));
  assert.equal(event.data().action, 'withdraw');
  assert.equal(event.data().lifecycle_from, 'published');
  assert.equal(event.data().lifecycle_to, 'draft');
  await assertFails(getDoc(doc(dbAs('user'), 'contents', seeded.contentId)));
  await assertFails(getDoc(doc(dbAs('user'), 'contents', seeded.contentId, 'publishedEvidence', seeded.sourceId)));
  await assertFails(getDoc(doc(dbAs('user'), 'sources', seeded.sourceId, 'ingestions', seeded.ingestionId, 'evidence', seeded.evidenceId)));
});

test('Feature 15 Admin archive and restore use atomic lifecycle history and keep archived content unreadable to viewers', async () => {
  await assertFails(commitLifecycleBatch('editor', 'CNT-DRAFT', {
    nextStatus: 'archived', action: 'archive', reason: 'editor cannot archive'
  }));
  await assertFails(commitLifecycleBatch('reviewer', 'CNT-DRAFT', {
    nextStatus: 'archived', action: 'archive', reason: 'reviewer cannot archive'
  }));
  await assertFails(commitLifecycleBatch('user', 'CNT-DRAFT', {
    nextStatus: 'archived', action: 'archive', reason: 'viewer cannot archive'
  }));
  await assertFails(commitLifecycleBatch('inactiveAdmin', 'CNT-DRAFT', {
    nextStatus: 'archived', action: 'archive', reason: 'inactive admin cannot archive'
  }));
  await assertFails(commitLifecycleBatch('admin', 'CNT-PUBLISHED', {
    nextStatus: 'archived', action: 'archive', reason: 'must withdraw first'
  }));
  assert.equal((await getDoc(doc(dbAs('admin'), 'contents', 'CNT-PUBLISHED'))).data().workflow_status, 'published');
  await assertSucceeds(getDoc(doc(dbAs('user'), 'contents', 'CNT-PUBLISHED')));

  const { db: adminDb, versionId } = await commitLifecycleBatch('admin', 'CNT-DRAFT', {
    nextStatus: 'archived', action: 'archive', reason: 'ไม่ใช้เนื้อหาฉบับนี้แล้ว'
  });
  assert.equal((await getDoc(doc(adminDb, 'contents', 'CNT-DRAFT'))).data().workflow_status, 'archived');
  await assertFails(getDoc(doc(dbAs('user'), 'contents', 'CNT-DRAFT')));
  await assertFails(getDocs(query(collection(dbAs('user'), 'contents'), where('workflow_status', '==', 'archived'))));
  await assertSucceeds(getDoc(doc(dbAs('admin'), 'contentVersions', versionId)));
  const archiveEvent = (await getDoc(doc(adminDb, 'contentVersions', versionId))).data();
  assert.equal(archiveEvent.action, 'archive');
  assert.equal(archiveEvent.lifecycle_from, 'draft');
  assert.equal(archiveEvent.lifecycle_to, 'archived');
  assert.equal(archiveEvent.change_reason, 'ไม่ใช้เนื้อหาฉบับนี้แล้ว');
  assert.equal(archiveEvent.editor_email, accounts.admin.email);

  for (const role of ['editor', 'reviewer', 'user', 'inactiveAdmin']) {
    await assertFails(commitLifecycleBatch(role, 'CNT-DRAFT', {
      nextStatus: 'draft', action: 'restore', reason: `${role} cannot restore archived content`
    }));
  }
  await assertFails(commitLifecycleBatch('admin', 'CNT-DRAFT', {
    nextStatus: 'approved', action: 'restore', reason: 'archived restore must return to draft'
  }));
  assert.equal((await getDoc(doc(adminDb, 'contents', 'CNT-DRAFT'))).data().workflow_status, 'archived');
  const restored = await commitLifecycleBatch('admin', 'CNT-DRAFT', {
    nextStatus: 'draft', action: 'restore', reason: 'นำกลับมาใช้เพื่อปรับปรุง'
  });
  assert.equal((await getDoc(doc(adminDb, 'contents', 'CNT-DRAFT'))).data().workflow_status, 'draft');
  await assertFails(getDoc(doc(dbAs('user'), 'contents', 'CNT-DRAFT')));
  assert.equal((await getDoc(doc(adminDb, 'contentVersions', restored.versionId))).data().lifecycle_to, 'draft');
  assert.equal((await getDoc(doc(adminDb, 'contentVersions', versionId))).data().action, 'archive');

  const withProjection = await seedPublishedEvidenceScenario({
    contentId: 'CNT-ARCHIVE-PROJECTION', sourceId: 'SRC-ARCHIVE-PROJECTION'
  });
  await commitLifecycleBatch('admin', withProjection.contentId, {
    nextStatus: 'draft', action: 'withdraw', reason: 'ถอนก่อนเก็บเข้าคลัง'
  });
  await commitLifecycleBatch('admin', withProjection.contentId, {
    nextStatus: 'archived', action: 'archive', reason: 'ไม่ใช้ฉบับนี้แล้ว'
  });
  await assertFails(getDoc(doc(dbAs('user'), 'contents', withProjection.contentId)));
  await assertFails(getDoc(doc(dbAs('user'), 'contents', withProjection.contentId, 'publishedEvidence', withProjection.sourceId)));
});

test('Feature 14A non-Admin withdrawal and invalid history fail without changing published state', async () => {
  const seeded = await seedPublishedEvidenceScenario({
    contentId: 'CNT-F14A-DENY', sourceId: 'SRC-F14A-DENY'
  });
  await assertFails(updateDoc(doc(dbAs('editor'), 'contents', seeded.contentId), {
    workflow_status: 'draft', updated_at: serverTimestamp()
  }));
  await assertFails(commitLifecycleBatch('admin', seeded.contentId, {
    nextStatus: 'draft', action: 'withdraw', reason: 'withdraw for test',
    eventOverrides: { change_reason: 'x' }
  }));
  await assertFails(commitLifecycleBatch('admin', seeded.contentId, {
    nextStatus: 'published', action: 'restore', reason: 'bypass publication safeguards'
  }));
  const contentSnapshot = await getDoc(doc(dbAs('admin'), 'contents', seeded.contentId));
  assert.equal(contentSnapshot.data().workflow_status, 'published');
  await assertSucceeds(getDoc(doc(dbAs('user'), 'contents', seeded.contentId, 'publishedEvidence', seeded.sourceId)));
});

test('Feature 14A supports revision through review, approval, and atomic republication with current evidence', async () => {
  const seeded = await seedPublishedEvidenceScenario({
    contentId: 'CNT-F14A-REPUBLISH', sourceId: 'SRC-F14A-REPUBLISH'
  });
  await commitLifecycleBatch('admin', seeded.contentId, {
    nextStatus: 'draft', action: 'withdraw', reason: 'ถอนเพื่อแก้ไข'
  });
  await assertFails(getDoc(doc(dbAs('user'), 'contents', seeded.contentId)));
  await commitLifecycleBatch('editor', seeded.contentId, {
    nextStatus: 'review', action: 'revision_submit', reason: 'ปรับปรุงแนวทางล่าสุด',
    contentPatch: { title: 'ฉบับแก้ไขเพื่อทดสอบ' }
  });
  await commitLifecycleBatch('reviewer', seeded.contentId, {
    nextStatus: 'approved', action: 'approve', reason: 'ตรวจสอบและอนุมัติ',
    contentPatch: { approved_by: accounts.reviewer.email, approved_at: serverTimestamp() }
  });
  const { versionId } = await commitLifecycleBatch('admin', seeded.contentId, {
    nextStatus: 'published', action: 'republish', reason: 'เผยแพร่ฉบับแก้ไข',
    contentPatch: { published_by: accounts.admin.email, published_at: serverTimestamp() },
    relatedWrites: (batch, { timestamp, db }) => batch.set(
      doc(db, 'contents', seeded.contentId, 'publishedEvidence', seeded.sourceId),
      publishedEvidenceProjection(seeded.sourceId, seeded.sourceName, seeded.ingestionId, seeded.evidenceId, timestamp, { excerpt: 'หลักฐานฉบับปัจจุบัน' })
    )
  });
  const adminDb = dbAs('admin');
  const currentContent = await getDoc(doc(adminDb, 'contents', seeded.contentId));
  const currentProjection = await getDoc(doc(adminDb, 'contents', seeded.contentId, 'publishedEvidence', seeded.sourceId));
  assert.equal(currentContent.data().workflow_status, 'published');
  assert.deepEqual(currentProjection.data().content_updated_at, currentContent.data().updated_at);
  assert.equal(currentProjection.data().excerpt, 'หลักฐานฉบับปัจจุบัน');
  const userProjection = await getDoc(doc(dbAs('user'), 'contents', seeded.contentId, 'publishedEvidence', seeded.sourceId));
  assert.equal(userProjection.data().excerpt, 'หลักฐานฉบับปัจจุบัน');
  const event = await getDoc(doc(adminDb, 'contentVersions', versionId));
  assert.equal(event.data().action, 'republish');
  assert.equal(event.data().lifecycle_from, 'approved');
  assert.equal(event.data().lifecycle_to, 'published');
  assert.equal(event.data().change_reason, 'เผยแพร่ฉบับแก้ไข');
  await commitLifecycleBatch('admin', seeded.contentId, {
    nextStatus: 'draft', action: 'restore', reason: 'คืนข้อมูลเพื่อแก้ไขต่อ'
  });
  await assertFails(getDoc(doc(dbAs('user'), 'contents', seeded.contentId)));
});
