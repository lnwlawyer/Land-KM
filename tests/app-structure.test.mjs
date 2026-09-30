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

test('production unified search has a labeled submit/reset UI and distinct initial, loading, error, and empty states', () => {
  const searchViewStart = productionHtml.indexOf('<section class="view" id="searchView">');
  const searchViewEnd = productionHtml.indexOf('</section>', searchViewStart);
  assert.notEqual(searchViewStart, -1);
  assert.notEqual(searchViewEnd, -1);
  const searchView = productionHtml.slice(searchViewStart, searchViewEnd);
  assert.match(searchView, /<h1>ค้นหาความรู้<\/h1>/);
  assert.match(searchView, /<form[^>]+id="resultSearch"/);
  assert.match(searchView, /<label class="sr-only" for="resultInput">/);
  assert.match(searchView, /id="clearSearch"[^>]+hidden/);
  assert.match(searchView, /id="resultsSummary"[^>]+aria-live="polite"/);
  assert.match(searchView, /id="searchResultList"/);
  const stateStart = productionHtml.indexOf('function renderSearchState()');
  const stateEnd = productionHtml.indexOf('\n  function appendSearchHighlights', stateStart);
  const stateSource = productionHtml.slice(stateStart, stateEnd);
  for (const state of ['กำลังโหลดเนื้อหาที่ค้นหาได้', 'โหลดข้อมูลค้นหาไม่สำเร็จ', 'ค้นหาความรู้ในที่เดียว']) assert.ok(stateSource.includes(state));
  assert.match(productionHtml, /ไม่พบรายการที่ตรงกับการค้นหา/);
});

test('unified search filters loaded published content by supported type and category without additional reads', () => {
  const filterStart = productionHtml.indexOf('function realFilteredContents(');
  const filterEnd = productionHtml.indexOf('\n  function renderSelectedRealFilters()', filterStart);
  const filterSource = productionHtml.slice(filterStart, filterEnd);
  const applyStart = productionHtml.indexOf('function applyRealFilters(showSearch = true)');
  const applyEnd = productionHtml.indexOf('\n  function setupRealFilters()', applyStart);
  const applySource = productionHtml.slice(applyStart, applyEnd);
  assert.match(filterSource, /searchablePublishedContents\(\)/);
  assert.match(filterSource, /realFilters\.categories\.has\(item\.category_id\)/);
  assert.match(filterSource, /realFilters\.types\.has\(item\.content_type\)/);
  assert.match(productionHtml, /function renderSearchTypeFilters\(searchable\)/);
  assert.match(productionHtml, /document\.createTextNode\(` ทั้งหมด \(\$\{searchable\.length\}\)`\)/);
  for (const type of ['knowledge', 'law', 'guide', 'judgment', 'committeeDecision', 'lesson', 'qa']) assert.match(productionHtml, new RegExp(`${type}:`));
  assert.match(applySource, /renderPublishedContents\(results\)/);
  assert.match(applySource, /พบ \$\{results\.length\} รายการ/);
});

test('mobile search filters collapse accessibly without clearing state or triggering search analytics', () => {
  const setupStart = productionHtml.indexOf('function setupRealFilters()');
  const setupEnd = productionHtml.indexOf('\n  function accessibleContentQuerySpecs()', setupStart);
  const setupSource = productionHtml.slice(setupStart, setupEnd);
  const toggleStart = setupSource.indexOf('const setMobileFiltersExpanded =');
  const toggleEnd = setupSource.indexOf("sections[1].innerHTML", toggleStart);
  const toggleSource = setupSource.slice(toggleStart, toggleEnd);
  const selectedStart = productionHtml.indexOf('function renderSelectedRealFilters()');
  const selectedEnd = productionHtml.indexOf('\n  function makeFilterOptions', selectedStart);
  const selectedSource = productionHtml.slice(selectedStart, selectedEnd);
  assert.match(setupSource, /toggleSearchFilters/);
  assert.match(setupSource, /setAttribute\('aria-controls', filterContent\.id\)/);
  assert.match(setupSource, /setAttribute\('aria-expanded', String\(expanded\)\)/);
  assert.match(setupSource, /filterContent\.hidden = !expanded/);
  assert.match(setupSource, /mobileFiltersExpanded = !window\.matchMedia\('\(max-width: 700px\)'\)\.matches/);
  assert.match(setupSource, /realTypeFilters/);
  assert.match(setupSource, /categorySearch/);
  assert.match(setupSource, /mobileFilterActive/);
  assert.match(toggleSource, /toggle\.onclick = \(\) => setMobileFiltersExpanded\(!mobileFiltersExpanded\)/);
  assert.doesNotMatch(toggleSource, /searchPublishedContents|applyRealFilters|recordSharedUsage|recordCategoryUsage/);
  assert.doesNotMatch(toggleSource, /realFilters\.[\s\S]{0,80}\.clear\(/);
  assert.match(selectedSource, /mobileFilterCount/);
  assert.match(selectedSource, /กำลังใช้ตัวกรอง/);
  assert.match(productionHtml, /@media\(max-width:700px\)[\s\S]*?\.search-filter-toggle\{display:flex/);
});

test('unified search cards expose safe highlighting, accessible full-card opening, and public metadata only', () => {
  const renderStart = productionHtml.indexOf('function renderPublishedContents(items)');
  const renderEnd = productionHtml.indexOf('\n  function renderSearchState()', renderStart);
  const renderSource = productionHtml.slice(renderStart, renderEnd);
  const highlightStart = productionHtml.indexOf('function appendSearchHighlights(');
  const highlightEnd = productionHtml.indexOf('\n  function normalizeSearchText', highlightStart);
  const highlightSource = productionHtml.slice(highlightStart, highlightEnd);
  assert.match(renderSource, /row\.className = 'doc search-result-row'/);
  assert.match(renderSource, /href="#" class="search-result-link"/);
  assert.match(renderSource, /link\.onclick = event => \{ event\.preventDefault\(\); openContentFromFirestore\(item\); \}/);
  assert.match(renderSource, /item\.document_no \|\| item\.document_number \|\| item\.reference_no/);
  assert.doesNotMatch(renderSource, /item\.created_by|item\.owner_unit/);
  assert.match(highlightSource, /document\.createElement\('mark'\)/);
  assert.match(highlightSource, /mark\.textContent = part/);
  assert.doesNotMatch(highlightSource, /innerHTML/);
});

test('unified search preserves private search analytics and local emulator isolation', () => {
  const searchStart = productionHtml.indexOf('function searchPublishedContents(rawQuery)');
  const searchEnd = productionHtml.indexOf('\n  document.getElementById(\'heroSearch\')', searchStart);
  const searchSource = productionHtml.slice(searchStart, searchEnd);
  const noResultStart = productionHtml.indexOf('function recordCompletedNoResultSearch(');
  const noResultEnd = productionHtml.indexOf('\n  function realFilteredContents', noResultStart);
  const noResultSource = productionHtml.slice(noResultStart, noResultEnd);
  const writerStart = productionHtml.indexOf('async function recordSharedUsage(');
  const writerEnd = productionHtml.indexOf('\n  async function loadUsageStats()', writerStart);
  const writerSource = productionHtml.slice(writerStart, writerEnd);
  assert.match(searchSource, /recordSharedUsage\('search', 'search'/);
  assert.match(searchSource, /recordCompletedNoResultSearch\(matches\)/);
  assert.match(noResultSource, /!activeSearchQuery \|\| matches\.length \|\| hasMoreAccessibleContents\(\) \|\| activeSearchNoResultRecorded/);
  assert.match(noResultSource, /recordSharedUsage\('no_result', 'search'/);
  assert.match(writerSource, /const isSharedAggregateEvent[\s\S]*action === 'select' && targetType === 'category'[\s\S]*action === 'open'/);
  assert.doesNotMatch(writerSource, /action === '(?:search|no_result)'[\s\S]{0,100}aggregateRef/);
  assert.match(productionHtml, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/);
  assert.match(productionHtml, /if \(isLocalReview\) \{\s*connectAuthEmulator\(auth, 'http:\/\/127\.0\.0\.1:9099'/);
  assert.match(productionHtml, /connectFirestoreEmulator\(db, '127\.0\.0\.1', 8080\)/);
});

test('knowledge catalogues reuse the shared detail reader while Q&A and lessons retain specialized readers', () => {
  const readerStart = productionHtml.indexOf('async function openContentFromFirestore(item, options = {})');
  const readerEnd = productionHtml.indexOf('\n  function getSharedContentIdFromHash()', readerStart);
  const readerSource = productionHtml.slice(readerStart, readerEnd);
  assert.ok(readerStart >= 0 && readerEnd > readerStart);
  assert.match(readerSource, /renderDetailHeader\(item, detail\)/);
  assert.match(readerSource, /renderDetailResources\(body, resources\)/);
  assert.match(readerSource, /renderRelatedKnowledge\(body, item\)/);
  for (const path of ['renderPublishedContents', 'renderKnowledgeContents', 'renderLegalReferenceList', 'renderLawRows', 'loadGuides']) {
    const start = productionHtml.indexOf(`function ${path}(`);
    const asyncStart = productionHtml.indexOf(`async function ${path}(`);
    const functionStart = start >= 0 ? start : asyncStart;
    assert.ok(functionStart >= 0, `${path} exists`);
    assert.match(productionHtml.slice(functionStart, functionStart + 12000), /openContentFromFirestore\(/, `${path} opens the shared reader`);
  }
  assert.match(productionHtml, /function openQuestionFromFirestore\(/);
  assert.match(productionHtml, /async function openLessonPlayer\(/);
});

test('shared detail header uses available public metadata and omits internal fields and placeholders', () => {
  const headerStart = productionHtml.indexOf('function renderDetailHeader(item, detail)');
  const headerEnd = productionHtml.indexOf('\n  function addDetailMetadata', headerStart);
  const headerSource = productionHtml.slice(headerStart, headerEnd);
  const valueStart = productionHtml.indexOf('function readableDetailValue(value)');
  const valueEnd = productionHtml.indexOf('\n  function formatDetailDate', valueStart);
  const valueSource = productionHtml.slice(valueStart, valueEnd);
  assert.match(headerSource, /detailTypeLabels\[item\.content_type\]/);
  assert.match(headerSource, /getCategoryDisplay\(categoryId\)/);
  assert.match(headerSource, /document_no \|\| item\.document_no \|\| item\.document_number \|\| item\.reference_no/);
  assert.match(headerSource, /item\.decision_date \|\| detail\.decision_date/);
  assert.match(headerSource, /status\.hidden = item\.workflow_status !== 'published'/);
  assert.doesNotMatch(headerSource, /created_by|owner_unit|workflow_status.*textContent/);
  assert.match(valueSource, /'null', 'undefined'/);
  assert.match(productionHtml, /function addDetailMetadata\(container, label, value\)/);
});

test('detail breadcrumbs and return controls preserve the in-memory source view and scroll position', () => {
  const showStart = productionHtml.indexOf('function show(id,name,options={})');
  const showEnd = productionHtml.indexOf('\n  function showPreviousView', showStart);
  const showSource = productionHtml.slice(showStart, showEnd);
  const breadcrumbStart = productionHtml.indexOf('function renderDetailBreadcrumb(item)');
  const breadcrumbEnd = productionHtml.indexOf('\n  function renderDetailHeader', breadcrumbStart);
  const breadcrumbSource = productionHtml.slice(breadcrumbStart, breadcrumbEnd);
  assert.match(showSource, /viewHistory\.push\(\{id:current\.id,name:pageName\.textContent[\s\S]*scrollY:window\.scrollY/);
  assert.match(showSource, /options\.restoreScroll\?scrollTo\(0,options\.restoreScroll\):scrollTo\(0,0\)/);
  assert.match(showSource, /options\.replaceCurrent/);
  assert.match(showSource, /window\.updateDetailReturnControl\?\.\(\)/);
  assert.match(productionHtml, /window\.updateDetailReturnControl = updateDetailReturnControl/);
  assert.match(breadcrumbSource, /setAttribute\('aria-label', 'เส้นทางนำทาง'\)/);
  assert.match(breadcrumbSource, /previous\?\.id === 'searchView' \? 'ค้นหาความรู้'/);
  assert.match(breadcrumbSource, /setAttribute\('aria-current', 'page'\)/);
  assert.match(breadcrumbSource, /sourceButton\.onclick = \(\) => showPreviousView\(\)/);
  assert.match(productionHtml, /button\.setAttribute\('aria-label', label\)/);
  assert.match(productionHtml, /#detailView \.detail-breadcrumb/);
});

test('detail reading body, resource links, and related knowledge use safe bounded existing data', () => {
  const appendStart = productionHtml.indexOf('function appendDetailSection(container, title, value)');
  const appendEnd = productionHtml.indexOf('\n  const detailTypeLabels', appendStart);
  const appendSource = productionHtml.slice(appendStart, appendEnd);
  const resourceStart = productionHtml.indexOf('function collectDetailResources(item, detail, files)');
  const resourceEnd = productionHtml.indexOf('\n  function renderRelatedKnowledge', resourceStart);
  const resourceSource = productionHtml.slice(resourceStart, resourceEnd);
  const relatedStart = productionHtml.indexOf('function renderRelatedKnowledge(container, item)');
  const relatedEnd = productionHtml.indexOf('\n  async function openContentFromFirestore', relatedStart);
  const relatedSource = productionHtml.slice(relatedStart, relatedEnd);
  const openStart = productionHtml.indexOf('async function openContentFromFirestore(item, options = {})');
  const openEnd = productionHtml.indexOf('\n  function getSharedContentIdFromHash()', openStart);
  const openSource = productionHtml.slice(openStart, openEnd);
  assert.match(appendSource, /paragraph\.textContent/);
  assert.match(appendSource, /document\.createElement\('ul'\)/);
  assert.doesNotMatch(appendSource, /innerHTML/);
  assert.match(resourceSource, /safeDocumentUrl\(entry\.url\)/);
  assert.match(resourceSource, /link\.target = '_blank'/);
  assert.match(resourceSource, /link\.rel = 'noopener noreferrer'/);
  assert.match(openSource, /where\('content_id', '==', currentContentId\), limit\(APP_LIMITS\.detailFiles\)/);
  assert.match(relatedSource, /candidate\.workflow_status === 'published'/);
  assert.match(relatedSource, /\(candidate\.content_id \|\| candidate\.id\) !== currentId/);
  assert.match(relatedSource, /contentItems\.filter/);
  assert.match(relatedSource, /\.slice\(0, 4\)/);
  assert.match(relatedSource, /section\.append\(heading, list\)/);
  assert.doesNotMatch(relatedSource, /getDocs\(|getDoc\(/);
  assert.match(productionHtml, /#detailView #dynamicDetailBody\{max-width:72ch/);
  assert.match(productionHtml, /@media\(max-width:700px\)\{#detailView/);
});

test('detail deep links and reading controls remain compatible with analytics and existing features', () => {
  assert.match(productionHtml, /link\.hash = `content=\$\{encodeURIComponent\(currentContentId\)\}`/);
  assert.match(productionHtml, /window\.addEventListener\('hashchange'/);
  assert.match(productionHtml, /document\.getElementById\('copyLink'\)\.onclick = copyCurrentContentLink/);
  const readerStart = productionHtml.indexOf('async function openContentFromFirestore(item, options = {})');
  const readerEnd = productionHtml.indexOf('\n  function getSharedContentIdFromHash()', readerStart);
  const readerSource = productionHtml.slice(readerStart, readerEnd);
  assert.match(readerSource, /recordCategoryUsage\(item\.category_id, 'open'\)/);
  assert.match(readerSource, /recordSharedUsage\('open', 'content', currentContentId\)/);
  assert.doesNotMatch(readerSource, /recordSharedUsage\('(?:search|no_result)'/);
  assert.match(productionHtml, /function searchPublishedContents\(rawQuery\)/);
  assert.match(productionHtml, /function setupRealFilters\(\)/);
  assert.match(productionHtml, /function openLessonPlayer\(/);
  assert.match(productionHtml, /learningProgress/);
  assert.match(productionHtml, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/);
});

test('stable content links resolve document IDs and content_id fallback before reporting errors', () => {
  const copyStart = productionHtml.indexOf('async function copyCurrentContentLink()');
  const copyEnd = productionHtml.indexOf('\n  async function loadCommentsForContent()', copyStart);
  const copySource = productionHtml.slice(copyStart, copyEnd);
  const readerStart = productionHtml.indexOf('async function openContentFromFirestore(item, options = {})');
  const readerEnd = productionHtml.indexOf('\n  function getSharedContentIdFromHash()', readerStart);
  const readerSource = productionHtml.slice(readerStart, readerEnd);
  const resolverStart = productionHtml.indexOf('function openSharedContentFromHash(options = {})');
  const resolverEnd = productionHtml.indexOf('\n  async function copyTextToClipboard', resolverStart);
  const resolverSource = productionHtml.slice(resolverStart, resolverEnd);
  const workerStart = resolverSource.indexOf('async function resolveSharedContentFromId(requestedId, attempt)');
  const workerSource = resolverSource.slice(workerStart);

  assert.match(readerSource, /currentContentId = item\.content_id \|\| item\.id/);
  assert.match(copySource, /link\.hash = `content=\$\{encodeURIComponent\(currentContentId\)\}`/);
  assert.doesNotMatch(copySource, /activeSearchQuery|realFilters|categorySearch|searchTypeFilter/);
  assert.match(resolverSource, /contentItems\.find\(content => \(content\.content_id \|\| content\.id\) === requestedId\)/);
  assert.match(workerSource, /getDoc\(doc\(db, 'contents', requestedId\)\)/);
  assert.match(workerSource, /where\('content_id', '==', requestedId\),\s*\.\.\.spec\.constraints,\s*limit\(1\)/);
  assert.ok(workerSource.indexOf('if (!item) {\n      const fallbackErrors') < workerSource.indexOf('if (!item && resolutionError)'));
  assert.ok(workerSource.indexOf('if (!item && resolutionError)') < workerSource.indexOf('showSystemBanner(', workerSource.indexOf('if (!item && resolutionError)')));
  assert.match(workerSource, /fallbackErrors\[0\] \|\| directReadError/);
  assert.match(workerSource, /openSharedContentFromHash\(\{ retry: true \}\)/);
  assert.match(readerSource, /catch \(error\) \{\s*console\.error\('Load content detail failed:'/);
  assert.match(readerSource, /catch \(error\) \{\s*console\.warn\('Load related documents failed:'/);
  assert.match(resolverSource, /currentAttempt\?\.id === requestedId && options\.retry !== true/);
  assert.match(resolverSource, /currentAttempt\.status === 'pending'\) return currentAttempt\.promise/);
  assert.match(resolverSource, /const attempt = \{[\s\S]*?id: requestedId,[\s\S]*?status: 'pending',[\s\S]*?openUsageRecorded: options\.retry === true && currentAttempt\?\.id === requestedId/);
  assert.match(resolverSource, /sharedContentResolutionAttempt === attempt\) attempt\.promise = null/);
  assert.match(resolverSource, /function isCurrentSharedContentAttempt\(attempt\)/);
  assert.match(resolverSource, /sharedContentResolutionAttempt === attempt\s+&& getSharedContentIdFromHash\(\) === attempt\.id/);
  assert.match(resolverSource, /options\.retry !== true/);
  assert.match(resolverSource, /attempt\.status = 'failed'/);
  assert.match(resolverSource, /attempt\.status = 'success'/);
  assert.match(resolverSource, /if \(attempt\.status === 'success'[\s\S]*?currentContentId === requestedId[\s\S]*?detailView[\s\S]*?classList\.contains\('active'\)\) return/);
  assert.match(readerSource, /options\.isCurrentRequest && !options\.isCurrentRequest\(\)\) return/);
  assert.match(readerSource, /options\.onActivated\?\.\(\)/);
  assert.match(productionHtml, /await openSharedContentFromHash\(\)/);
  assert.match(productionHtml, /window\.addEventListener\('hashchange', \(\) => \{\s*void openSharedContentFromHash\(\)/);
  assert.match(productionHtml, /sourceButton\.onclick = \(\) => showPreviousView\(\)/);
  assert.match(productionHtml, /previous\?\.id === 'searchView'/);
});

test('shared-link outcomes belong only to the current request and retry gets a fresh owner', () => {
  const start = productionHtml.indexOf('function openSharedContentFromHash(options = {})');
  const end = productionHtml.indexOf('\n  async function copyTextToClipboard', start);
  const source = productionHtml.slice(start, end);
  const openStart = productionHtml.indexOf('async function openContentFromFirestore(item, options = {})');
  const openEnd = productionHtml.indexOf('\n  function getSharedContentIdFromHash()', openStart);
  const openSource = productionHtml.slice(openStart, openEnd);
  const retryGuard = source.indexOf('currentAttempt?.id === requestedId && options.retry !== true');
  const freshAttempt = source.indexOf('const attempt = {');
  const differentIdGuard = source.indexOf('if (!isCurrentSharedContentAttempt(attempt)) return;', source.indexOf('if (!item && resolutionError)'));
  const retryAction = source.indexOf('openSharedContentFromHash({ retry: true })');

  assert.ok(retryGuard >= 0 && freshAttempt > retryGuard, 'retry bypasses reuse and creates a new attempt object');
  assert.ok(differentIdGuard >= 0 && differentIdGuard < retryAction, 'stale/different-hash failures return before publishing an error');
  assert.match(source, /sharedContentResolutionAttempt === attempt\s+&& getSharedContentIdFromHash\(\) === attempt\.id/);
  assert.match(source, /attempt\.status === 'success'[\s\S]*?currentContentId === requestedId[\s\S]*?detailView[\s\S]*?classList\.contains\('active'\)/);
  assert.match(source, /attempt\.status = 'failed'[\s\S]*?showSystemBanner\([\s\S]*?openSharedContentFromHash\(\{ retry: true \}\)/);
  assert.match(openSource, /if \(options\.isCurrentRequest && !options\.isCurrentRequest\(\)\) return/);
  assert.match(openSource, /if \(options\.recordOpenUsage !== false\)\s*\{\s*recordCategoryUsage\(item\.category_id, 'open'\);\s*void recordSharedUsage\('open', 'content', currentContentId\);/);
  assert.match(source, /recordOpenUsage: !attempt\.openUsageRecorded/);
  assert.match(source, /attempt\.openUsageRecorded = true/);
  assert.match(openSource, /window\.show\('detailView'[\s\S]*?options\.onActivated\?\.\(\)/);
});
