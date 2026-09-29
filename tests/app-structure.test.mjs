import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productionHtmlUrl = new URL('../public/index.html', import.meta.url);
const productionHtml = await readFile(productionHtmlUrl, 'utf8');
const firestoreRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const firebaseConfig = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));

test('usageStats fallback query has a declared Firestore composite index', async () => {
  const loadUsageStatsStart = productionHtml.indexOf('async function loadUsageStats()');
  const loadUsageStatsEnd = productionHtml.indexOf('\n  function contentViewCount', loadUsageStatsStart);
  assert.notEqual(loadUsageStatsStart, -1);
  assert.notEqual(loadUsageStatsEnd, -1);
  const loadUsageStatsSource = productionHtml.slice(loadUsageStatsStart, loadUsageStatsEnd);

  assert.match(loadUsageStatsSource, /collection\(db, 'usageStats'\)/);
  assert.match(loadUsageStatsSource, /where\('user_id',\s*'==',\s*auth\.currentUser\.uid\)/);
  assert.match(loadUsageStatsSource, /orderBy\('last_used_at',\s*'desc'\)/);

  const indexesPath = new URL('../firestore.indexes.json', import.meta.url);
  const indexConfig = JSON.parse(await readFile(indexesPath, 'utf8'));
  assert.equal(firebaseConfig.firestore?.indexes, 'firestore.indexes.json');
  assert.deepEqual(indexConfig.indexes, [{
    collectionGroup: 'usageStats',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'user_id', order: 'ASCENDING' },
      { fieldPath: 'last_used_at', order: 'DESCENDING' }
    ]
  }]);
  assert.deepEqual(indexConfig.fieldOverrides, []);
});

test('production usageStats fallback query is scoped for non-reporting users', () => {
  const loadUsageStatsStart = productionHtml.indexOf('async function loadUsageStats()');
  const loadUsageStatsEnd = productionHtml.indexOf('\n  function contentViewCount', loadUsageStatsStart);
  assert.notEqual(loadUsageStatsStart, -1);
  assert.notEqual(loadUsageStatsEnd, -1);
  const loadUsageStatsSource = productionHtml.slice(loadUsageStatsStart, loadUsageStatsEnd);
  assert.match(loadUsageStatsSource, /where\('user_id',\s*'==',\s*auth\.currentUser\.uid\)/);
  assert.match(loadUsageStatsSource, /\['admin',\s*'reviewer'\]\.includes\(currentUserProfile\?\.role\)/);
});

test('production analytics action/type pairs match the explicit Rules allowlist', () => {
  const pairs = [
    { action: 'select', targetType: 'category', production: /recordCategoryUsage\(categoryId, sharedAction = 'select'\)/, rules: /request\.resource\.data\.action == 'select'\s*&& request\.resource\.data\.target_type == 'category'/g },
    { action: 'search', targetType: 'search', production: /recordSharedUsage\('search', 'search'/, rules: /request\.resource\.data\.action in \['search', 'no_result'\]\s*&& request\.resource\.data\.target_type == 'search'/g },
    { action: 'no_result', targetType: 'search', production: /recordSharedUsage\('no_result', 'search'/, rules: /request\.resource\.data\.action in \['search', 'no_result'\]\s*&& request\.resource\.data\.target_type == 'search'/g },
    { action: 'open', targetType: 'category', production: /recordCategoryUsage\(item\.category_id, 'open'\)/, rules: /request\.resource\.data\.action == 'open'\s*&& request\.resource\.data\.target_type == 'category'/g },
    { action: 'open', targetType: 'content', production: /recordSharedUsage\('open', 'content'/, rules: /request\.resource\.data\.action == 'open'\s*&& request\.resource\.data\.target_type == 'content'/g }
  ];
  const aggregateRules = firestoreRules.slice(firestoreRules.indexOf('match /usageAggregates/{aggregateId}'));
  for (const { action, targetType, production } of pairs) {
    assert.match(productionHtml, production, `production must emit ${action}/${targetType}`);
    assert.equal([...aggregateRules.matchAll(pairs.find(pair => pair.action === action && pair.targetType === targetType).rules)].length >= 2, true, `Rules create and update must allow ${action}/${targetType}`);
  }
});

test('production source เริ่มต้นโดยไม่มีหมวดค้นหาที่ถูกเลือก', () => {
  assert.doesNotMatch(productionHtml, /new Set\(\['มรดก'\]\)/);
  assert.match(productionHtml, /const selected=new Set\(\)/);
});

test('production source มีและเรียกใช้การล้าง legacy presentation', () => {
  assert.match(productionHtml, /function resetLegacyPresentation\(\)/);
  assert.match(productionHtml, /resetLegacyPresentation\(\);/);
});

test('production source ไม่มีข้อความจาก event ตัวอย่างที่เลิกใช้แล้ว', () => {
  for (const phrase of [
    'จำลองการบันทึก',
    'แสดงผลการค้นหาตัวอย่าง',
    'เปิดหน้าบทเรียนตัวอย่างแล้ว'
  ]) {
    assert.equal(productionHtml.includes(phrase), false, `พบข้อความตัวอย่าง: ${phrase}`);
  }
});

test('production source กำหนด query limit และใช้ pagination cursor', () => {
  assert.match(productionHtml, /const APP_LIMITS = Object\.freeze\(/);
  assert.match(productionHtml, /contentPageSize:\s*50/);
  assert.match(productionHtml, /startAfter/);
});

test('production source มี references ของ core feature collections', () => {
  for (const collectionName of [
    'knowledgePackages',
    'knowledgeGaps',
    'contentVersions',
    'versionCounters',
    'usageAggregates'
  ]) {
    assert.match(productionHtml, new RegExp(collectionName));
  }
});

test('ป้ายกำกับผู้ใช้ใน production source ใช้ข้อมูลของ profile ที่กำลังแสดง', () => {
  const loadUsersStart = productionHtml.indexOf('async function loadUsers()');
  const loadUsersEnd = productionHtml.indexOf('\n  function openUserProfileForm()', loadUsersStart);
  assert.notEqual(loadUsersStart, -1, 'ไม่พบ loadUsers() ใน production source');
  assert.notEqual(loadUsersEnd, -1, 'ไม่พบจุดสิ้นสุดของ loadUsers() ใน production source');

  const loadUsersSource = productionHtml.slice(loadUsersStart, loadUsersEnd);
  assert.match(
    loadUsersSource,
    /row\.setAttribute\('aria-label',\s*'เปิดข้อมูลผู้ใช้ '\s*\+\s*\(profile\.display_name\s*\|\|\s*profile\.email\s*\|\|\s*profile\.id\)\)/
  );
  assert.doesNotMatch(loadUsersSource, /\blaw\./, 'loadUsers() ต้องไม่อ้างข้อมูล law');
});

test('User Management ใน production source จำกัด role ที่ assign ได้และตรวจค่าก่อนเขียน', () => {
  const roleOptions = [...productionHtml.matchAll(/<option value="(admin|editor|reviewer|viewer|user)">/g)]
    .map(([, role]) => role);
  assert.deepEqual(roleOptions, ['viewer', 'editor', 'reviewer', 'admin']);

  const saveUserProfileStart = productionHtml.indexOf('async function saveUserProfile(event)');
  const saveUserProfileEnd = productionHtml.indexOf('\n  document.getElementById(\'openUserForm\')', saveUserProfileStart);
  assert.notEqual(saveUserProfileStart, -1, 'ไม่พบ saveUserProfile() ใน production source');
  assert.notEqual(saveUserProfileEnd, -1, 'ไม่พบจุดสิ้นสุดของ saveUserProfile() ใน production source');

  const saveUserProfileSource = productionHtml.slice(saveUserProfileStart, saveUserProfileEnd);
  const validationIndex = saveUserProfileSource.indexOf("if (!['admin', 'editor', 'reviewer', 'viewer'].includes(role))");
  const writeIndex = saveUserProfileSource.indexOf("await setDoc(doc(db, 'users', userId), payload");
  assert.notEqual(validationIndex, -1, 'saveUserProfile() ต้องตรวจ canonical role');
  assert.ok(writeIndex > validationIndex, 'role validation ต้องเกิดก่อน Firestore write');
});
