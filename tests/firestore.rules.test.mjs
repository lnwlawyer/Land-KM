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
  getDocs,
  getDoc,
  increment,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction
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
