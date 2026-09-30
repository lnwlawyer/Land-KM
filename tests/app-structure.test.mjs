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

test('production analytics routes sensitive search terms to owner-scoped stats only', () => {
  const pairs = [
    { action: 'select', targetType: 'category', emit: /recordCategoryUsage\(categoryId, sharedAction = 'select'\)/, shared: true },
    { action: 'search', targetType: 'search', emit: /recordSharedUsage\('search', 'search'/, shared: false },
    { action: 'no_result', targetType: 'search', emit: /recordSharedUsage\('no_result', 'search'/, shared: false },
    { action: 'open', targetType: 'category', emit: /recordCategoryUsage\(item\.category_id, 'open'\)/, shared: true },
    { action: 'open', targetType: 'content', emit: /recordSharedUsage\('open', 'content'/, shared: true }
  ];
  const aggregateRules = firestoreRules.slice(firestoreRules.indexOf('match /usageAggregates/{aggregateId}'));
  const sharedRules = firestoreRules.slice(firestoreRules.indexOf('function isSharedUsageAggregate('), firestoreRules.indexOf('function hasCanonicalUsageAggregateId('));
  const writerStart = productionHtml.indexOf('async function recordSharedUsage(');
  const writerEnd = productionHtml.indexOf('\n  async function loadUsageStats()', writerStart);
  const writer = productionHtml.slice(writerStart, writerEnd);

  for (const { action, targetType, emit, shared } of pairs) {
    assert.match(productionHtml, emit, `production must emit ${action}/${targetType}`);
    assert.equal(sharedRules.includes(`data.action == '${action}'`), shared,
      `aggregate Rules routing for ${action}/${targetType}`);
    if (shared) assert.match(writer, /transaction\.set\(aggregateRef/);
    else assert.match(writer, /const isSharedAggregateEvent/);
  }
  assert.match(writer, /transaction\.set\(userRef/);
  assert.match(writer, /if \(aggregateRef\)/);
  assert.match(aggregateRules, /hasCanonicalUsageAggregateId\(aggregateId, request\.resource\.data\)/);
  assert.doesNotMatch(aggregateRules, /request\.resource\.data\.action in \['search', 'no_result'\]/);
});

test('production usage aggregates query only safe pairs and reporters read missing-search terms from usageStats', () => {
  const loadStart = productionHtml.indexOf('async function loadUsageStats()');
  const loadEnd = productionHtml.indexOf('\n  function contentViewCount', loadStart);
  const loadSource = productionHtml.slice(loadStart, loadEnd);
  assert.match(loadSource, /\['select', 'category'\]/);
  assert.match(loadSource, /\['open', 'category'\]/);
  assert.match(loadSource, /\['open', 'content'\]/);
  assert.match(loadSource, /where\('action', '==', action\)/);
  assert.match(loadSource, /where\('target_type', '==', targetType\)/);
  assert.match(loadSource, /data\.action === 'no_result' && data\.target_type === 'search'/);
  assert.match(loadSource, /isReportingRole/);
});

test('production aggregate IDs are canonical and unsafe target IDs skip shared writes', () => {
  assert.match(productionHtml, /function usageAggregateDocumentId\(action, targetType, targetId\)/);
  assert.match(productionHtml, /if \(!\/\^\[\^\/\]\{1,120\}\$\/\.test\(safeTarget\)\) return null/);
  assert.match(productionHtml, /aggregateId !== null/);
  assert.match(firestoreRules, /aggregateId == data\.action \+ '_' \+ data\.target_type \+ '_' \+ data\.target_id/);
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

test('production lesson catalogue shows completion status and an accessible progress indicator', () => {
  const loadLessonsStart = productionHtml.indexOf('async function loadLessons()');
  const loadLessonsEnd = productionHtml.indexOf('\n  function getLessonMedia(', loadLessonsStart);
  assert.notEqual(loadLessonsStart, -1);
  assert.notEqual(loadLessonsEnd, -1);
  const loadLessonsSource = productionHtml.slice(loadLessonsStart, loadLessonsEnd);

  assert.match(loadLessonsSource, /class="course-progress-state"/);
  assert.match(loadLessonsSource, /role="progressbar"/);
  assert.match(loadLessonsSource, /aria-valuenow/);
  assert.match(loadLessonsSource, /เรียนครบแล้ว/);
  assert.match(loadLessonsSource, /กำลังเรียน/);
  assert.match(loadLessonsSource, /startButton\.textContent = .*เริ่มเรียน.*ทบทวนบทเรียน.*เรียนต่อ/);
});

test('production lesson player supports unit navigation, completion, and continue from the next unfinished unit', () => {
  const playerStart = productionHtml.indexOf('function renderLessonPlayerUnit()');
  const playerEnd = productionHtml.indexOf('\n  async function markCurrentLessonUnitComplete()', playerStart);
  const openStart = productionHtml.indexOf('async function openLessonPlayer(contentId)');
  const openEnd = productionHtml.indexOf('\n  async function markCurrentLessonUnitComplete()', openStart);
  assert.notEqual(playerStart, -1);
  assert.notEqual(playerEnd, -1);
  assert.notEqual(openStart, -1);
  assert.notEqual(openEnd, -1);
  const playerSource = productionHtml.slice(playerStart, playerEnd);
  const openSource = productionHtml.slice(openStart, openEnd);

  assert.match(productionHtml, /id="previousLessonUnit"/);
  assert.match(productionHtml, /id="nextLessonUnit"/);
  assert.match(playerSource, /previousLessonUnit'\)\.disabled = activeLessonUnitIndex === 0/);
  assert.match(playerSource, /lessonCompletionState/);
  assert.match(playerSource, /contentBox\.textContent = textContent/);
  assert.match(openSource, /findIndex\(unit => !completedLessonUnitIds\.has/);
  assert.match(openSource, /lessonPlayerEmpty/);
  assert.match(productionHtml, /lessonCompletionReview/);
});

test('production lesson player handles optional video and resource URLs safely', () => {
  const mediaStart = productionHtml.indexOf('function getLessonMedia(');
  const mediaEnd = productionHtml.indexOf('\n  async function renderPdfViewer(', mediaStart);
  assert.notEqual(mediaStart, -1);
  assert.notEqual(mediaEnd, -1);
  const mediaSource = productionHtml.slice(mediaStart, mediaEnd);
  const playerStart = productionHtml.indexOf('function renderLessonPlayerUnit()');
  const playerEnd = productionHtml.indexOf('\n  async function markCurrentLessonUnitComplete()', playerStart);
  const playerSource = productionHtml.slice(playerStart, playerEnd);

  for (const field of ['video_url', 'file_url', 'drive_url', 'resource_url']) assert.ok(playerSource.includes(field));
  assert.match(mediaSource, /youtube-nocookie\.com\/embed/);
  assert.match(mediaSource, /player\.vimeo\.com\/video/);
  assert.match(mediaSource, /kind: 'external'/);
  assert.match(playerSource, /parsedResourceUrl\.protocol === 'https:'/);
  assert.doesNotMatch(playerSource, /innerHTML\s*=\s*textContent/);
});

test('localhost review connects Firebase clients to emulators', () => {
  assert.match(productionHtml, /connectAuthEmulator\(auth, 'http:\/\/127\.0\.0\.1:9099'/);
  assert.match(productionHtml, /connectFirestoreEmulator\(db, '127\.0\.0\.1', 8080\)/);
  assert.match(productionHtml, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/);
});
