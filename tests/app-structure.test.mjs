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
  const openStart = productionHtml.indexOf('async function openLessonPlayer(contentId, options = {})');
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
  assert.match(breadcrumbSource, /sourceButton\.onclick = \(\) => \{[\s\S]*?showPreviousView\(\)/);
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
  const discoveryStart = productionHtml.indexOf('const RELATED_KNOWLEDGE_LIMIT');
  const discoveryEnd = productionHtml.indexOf('\n  function renderRelatedKnowledge', discoveryStart);
  const discoverySource = productionHtml.slice(discoveryStart, discoveryEnd);
  assert.match(relatedSource, /selectRelatedKnowledge\(item, contentItems\)/);
  assert.match(discoverySource, /candidate\.workflow_status !== 'published'/);
  assert.match(discoverySource, /!\['public', 'internal'\]\.includes\(candidate\.access_level\)/);
  assert.match(discoverySource, /id === currentId/);
  assert.match(discoverySource, /RELATED_KNOWLEDGE_LIMIT = 5/);
  assert.match(discoverySource, /RELATED_KNOWLEDGE_MIN_SCORE = 4/);
  assert.match(discoverySource, /\.sort\(/);
  assert.match(relatedSource, /result\.reasons\.join/);
  assert.match(relatedSource, /openContentFromFirestore\(content, \{ fromRelated: true \}\)/);
  assert.doesNotMatch(relatedSource, /replaceCurrent/);
  assert.match(relatedSource, /section\.append\(heading, list\)/);
  assert.match(relatedSource, /catch \(error\) \{ console\.warn/);
  assert.doesNotMatch(`${relatedSource}${discoverySource}`, /getDocs\(|getDoc\(/);
  assert.match(productionHtml, /#detailView #dynamicDetailBody\{max-width:72ch/);
  assert.match(productionHtml, /@media\(max-width:700px\)\{#detailView/);
});

function createRelatedKnowledgeEngine() {
  const start = productionHtml.indexOf('const RELATED_KNOWLEDGE_LIMIT');
  const end = productionHtml.indexOf('\n  function renderRelatedKnowledge', start);
  const source = productionHtml.slice(start, end);
  const normalize = value => String(value || '').toLocaleLowerCase('th-TH').normalize('NFC').replace(/[\s\-_/.,:;()]+/g, ' ').trim();
  return new Function('normalizeSearchText', `${source}; return { scoreRelatedKnowledge, selectRelatedKnowledge };`)(normalize);
}

test('related knowledge scoring uses explicit, explainable content signals and rejects type-only matches', () => {
  const { scoreRelatedKnowledge, selectRelatedKnowledge } = createRelatedKnowledgeEngine();
  const current = { id: 'inheritance', content_id: 'inheritance', category_id: 'inheritance', title: 'การรับมรดกที่ดิน', content_type: 'knowledge', workflow_status: 'published', access_level: 'internal', keywords: ['มรดก', 'ทายาท'], summary: 'การโอนมรดกแก่ทายาทโดยชอบ' };
  const sameCategory = { id: 'same-category', category_id: 'inheritance', title: 'รายการในหมวดเดียวกัน', content_type: 'knowledge', workflow_status: 'published', access_level: 'internal' };
  const keywordTitle = { id: 'shared-terms', category_id: 'other', title: 'ขั้นตอนรับมรดกที่ดิน', content_type: 'guide', workflow_status: 'published', access_level: 'public', keywords: ['ทายาท'] };
  const law = { id: 'inheritance-law', category_id: 'law', title: 'กฎหมายการรับมรดก', content_type: 'law', workflow_status: 'published', access_level: 'public', summary: 'หลักการรับมรดกและสิทธิทายาท' };
  const qa = { id: 'inheritance-qa', category_id: 'questions', title: 'ถามเรื่องแบ่งมรดกแก่ทายาท', content_type: 'qa', workflow_status: 'published', access_level: 'internal', keywords: ['มรดก'] };
  const unrelated = { id: 'mortgage', category_id: 'mortgage', title: 'การไถ่ถอนจำนองที่ดิน', content_type: 'law', workflow_status: 'published', access_level: 'public' };
  const typeOnly = { id: 'other-law', category_id: 'other', title: 'การรังวัดแปลงที่ดิน', content_type: 'law', workflow_status: 'published', access_level: 'public' };
  assert.ok(scoreRelatedKnowledge(current, sameCategory).score > 0);
  assert.ok(scoreRelatedKnowledge(current, keywordTitle).score > 0);
  assert.ok(scoreRelatedKnowledge(current, law).score >= 4);
  assert.ok(scoreRelatedKnowledge(current, qa).score >= 4);
  assert.equal(scoreRelatedKnowledge(current, unrelated).hasSubstantiveEvidence, false);
  assert.equal(scoreRelatedKnowledge(current, typeOnly).hasSubstantiveEvidence, false);
  const selected = selectRelatedKnowledge(current, [sameCategory, keywordTitle, law, qa, unrelated, typeOnly]);
  assert.ok(selected.some(item => item.item.id === 'inheritance-law'));
  assert.ok(selected.some(item => item.item.id === 'inheritance-qa'));
  assert.ok(!selected.some(item => item.item.id === 'mortgage' || item.item.id === 'other-law'));
  assert.ok(selected.every(item => item.reasons.length > 0 && item.reasons.length <= 2));
  assert.ok(selected.some(item => item.reasons.includes('กฎหมายที่เกี่ยวข้อง')));
});

test('related knowledge removes current/duplicate/restricted records, ranks deterministically, caps and diversifies qualified results', () => {
  const { selectRelatedKnowledge } = createRelatedKnowledgeEngine();
  const current = { id: 'base', content_id: 'base', category_id: 'inheritance', title: 'มรดกและทายาท', content_type: 'knowledge', workflow_status: 'published', access_level: 'internal', keywords: ['มรดก'] };
  const make = (id, type = 'law', overrides = {}) => ({ id, content_id: id, category_id: 'inheritance', title: `กฎหมายมรดก ${id}`, content_type: type, workflow_status: 'published', access_level: 'internal', keywords: ['มรดก'], ...overrides });
  const candidates = [
    current,
    make('duplicate'), make('duplicate', 'guide'), make('unpublished', 'guide', { workflow_status: 'draft' }),
    make('restricted', 'guide', { access_level: 'confidential' }),
    ...Array.from({ length: 7 }, (_, index) => make(`law-${index}`)),
    make('guide', 'guide'), make('qa', 'qa'), make('lesson', 'lesson')
  ];
  const first = selectRelatedKnowledge(current, candidates);
  const second = selectRelatedKnowledge(current, [...candidates].reverse());
  assert.deepEqual(first.map(result => result.item.id), second.map(result => result.item.id));
  assert.ok(first.length <= 5);
  assert.equal(first.filter(result => result.item.content_type === 'law').length, 2);
  assert.ok(first.some(result => result.item.content_type !== 'law'));
  assert.ok(!first.some(result => ['base', 'unpublished', 'restricted'].includes(result.item.id)));
  assert.equal(first.filter(result => result.item.id === 'duplicate').length, 1);
});

test('related knowledge uses shared detail navigation and leaves search, deep links, workspace, analytics and backend boundaries intact', () => {
  const start = productionHtml.indexOf('function renderRelatedKnowledge(container, item)');
  const end = productionHtml.indexOf('\n  async function openContentFromFirestore', start);
  const renderer = productionHtml.slice(start, end);
  assert.match(renderer, /openContentFromFirestore\(content, \{ fromRelated: true \}\)/);
  assert.doesNotMatch(renderer, /replaceCurrent/);
  assert.match(renderer, /type\.textContent = detailTypeLabels\[content\.content_type\]/);
  assert.match(renderer, /link\.append\(type, title, reason\)/);
  assert.match(productionHtml, /heading\.textContent = 'ความรู้ที่เกี่ยวข้อง'/);
  assert.doesNotMatch(renderer, /%|Relevance:/);
  assert.match(renderer, /fromRelated: true/);
  assert.match(productionHtml, /relatedDetailHistory\.push\(activeDetailItem\)/);
  assert.match(productionHtml, /relatedDetailHistory\.pop\(\)/);
  assert.match(productionHtml, /recordOpenUsage: false, restoreRelatedHistory: true/);
  assert.match(productionHtml, /link\.hash = `content=\$\{encodeURIComponent\(currentContentId\)\}`/);
  assert.match(productionHtml, /function resetKnowledgeWorkspace/);
  assert.match(productionHtml, /recordSharedUsage\('open', 'content', currentContentId\)/);
  assert.doesNotMatch(renderer, /recordSharedUsage|searchHistory|workspaceRecentData|workspaceSavedData/);
  assert.doesNotMatch(productionHtml, /collection\(db, '(recommendations|relatedContent|knowledgeGraph|contentRelations|semanticIndex|embeddings|vectors)'\)/);
});

function createCuratedPackagePathEngine(pool, profile = { role: 'viewer' }, email = 'reviewer@landkm.test') {
  const start = productionHtml.indexOf('const packageSectionDefs = [');
  const end = productionHtml.indexOf('\n  function isActiveCollectionPathItem', start);
  const source = productionHtml.slice(start, end);
  return new Function('contentItems', 'currentUserProfile', 'auth', `${source}; return { packageSectionDefs, getCuratedPackageItems, packageMemberIsAccessible };`)(pool, profile, { currentUser: { email } });
}

test('knowledge collections reuse ordered knowledgePackages sections and preserve their stored curated sequence', () => {
  const pool = [
    { id: 'law-b', content_id: 'LAW-B', title: 'กฎหมายลำดับสอง', content_type: 'law', workflow_status: 'published', access_level: 'internal' },
    { id: 'law-a', content_id: 'LAW-A', title: 'กฎหมายลำดับหนึ่ง', content_type: 'law', workflow_status: 'published', access_level: 'internal' },
    { id: 'guide', content_id: 'GUIDE', title: 'คู่มือ', content_type: 'guide', workflow_status: 'published', access_level: 'internal' },
    { id: 'knowledge', content_id: 'KNOWLEDGE', title: 'องค์ความรู้', content_type: 'knowledge', workflow_status: 'published', access_level: 'internal' },
    { id: 'qa', content_id: 'QA', title: 'ถามตอบ', content_type: 'qa', workflow_status: 'published', access_level: 'internal' },
    { id: 'judgment', content_id: 'JUDGMENT', title: 'คำพิพากษา', content_type: 'judgment', workflow_status: 'published', access_level: 'internal' },
    { id: 'lesson', content_id: 'LESSON', title: 'บทเรียน', content_type: 'lesson', workflow_status: 'published', access_level: 'internal' },
    { id: 'draft', content_id: 'DRAFT', title: 'ฉบับร่าง', content_type: 'knowledge', workflow_status: 'draft', access_level: 'internal' },
    { id: 'restricted', content_id: 'PRIVATE', title: 'จำกัดสิทธิ', content_type: 'law', workflow_status: 'published', access_level: 'restricted' }
  ];
  const { getCuratedPackageItems } = createCuratedPackagePathEngine(pool);
  const collection = { sections: {
    laws: ['LAW-B', 'LAW-A', 'LAW-B', 'DRAFT', 'PRIVATE', 'MISSING'],
    guides: ['GUIDE'], checklists: ['KNOWLEDGE'], qa: ['QA'], cases: ['JUDGMENT', 'LESSON']
  } };
  const path = getCuratedPackageItems(collection, pool, { role: 'viewer' }, 'reviewer@landkm.test');
  assert.deepEqual(path.map(entry => entry.item.content_id), ['LAW-B', 'LAW-A', 'GUIDE', 'KNOWLEDGE', 'QA', 'JUDGMENT', 'LESSON']);
  assert.deepEqual(path.map(entry => entry.item.content_type), ['law', 'law', 'guide', 'knowledge', 'qa', 'judgment', 'lesson']);
  assert.equal(path.some(entry => ['DRAFT', 'PRIVATE', 'MISSING'].includes(entry.item.content_id)), false);
});

test('collection members follow existing role access and stale, unpublished, or duplicate references are omitted safely', () => {
  const restricted = { id: 'owned', content_id: 'OWNED', workflow_status: 'published', access_level: 'restricted', created_by: 'editor@landkm.test' };
  const pool = [restricted, { ...restricted, id: 'owned-duplicate' }];
  const { getCuratedPackageItems, packageMemberIsAccessible } = createCuratedPackagePathEngine(pool);
  const collection = { sections: { laws: ['OWNED'], cases: ['OWNED', 'MISSING'] } };
  assert.equal(getCuratedPackageItems(collection, pool, { role: 'viewer' }, 'viewer@landkm.test').length, 0);
  assert.equal(getCuratedPackageItems(collection, pool, { role: 'editor' }, 'editor@landkm.test').length, 1);
  assert.equal(getCuratedPackageItems(collection, pool, { role: 'reviewer' }, 'reviewer@landkm.test').length, 1);
  assert.equal(packageMemberIsAccessible({ ...restricted, workflow_status: 'review' }, { role: 'admin' }, 'admin@landkm.test'), false);
});

test('collection overview and curation controls are accessible and use stored package order without per-item reads', () => {
  assert.match(productionHtml, /<h1 id="packagesHeading">ชุดองค์ความรู้<\/h1>/);
  assert.match(productionHtml, /<h2 id="packagePathHeading" class="section-title">เส้นทางการเรียนรู้<\/h2>/);
  assert.match(productionHtml, /<ol class="package-path" id="packageDetailSections"/);
  assert.match(productionHtml, /function readPackageSections\(\)[\s\S]*packageSectionOrderState\[section\.key\]/);
  assert.match(productionHtml, /function renderPackageSectionOrder[\s\S]*เลื่อนขึ้น[\s\S]*เลื่อนลง/);
  assert.match(productionHtml, /item\.sections\?\.\[section\.key\]/);
  const selectionStart = productionHtml.indexOf('function getCuratedPackageItems');
  const selectionEnd = productionHtml.indexOf('\n  function isActiveCollectionPathItem', selectionStart);
  assert.doesNotMatch(productionHtml.slice(selectionStart, selectionEnd), /getDocs\(|getDoc\(|collection\(db/);
  assert.match(productionHtml, /getDocs\(query\(collection\(db, 'knowledgePackages'\), orderBy\(documentId\(\)\), limit\(APP_LIMITS\.knowledgePackages\)\)\)/);
  assert.doesNotMatch(productionHtml, /collection\(db, '(knowledgeCollections|learningPaths|guidedPaths|collectionItems|packageContents)'\)/);
  assert.doesNotMatch(productionHtml, /feature6-review@landkm\.test|F6-INHERITANCE|feature6-review-google-user/);
});

test('collection Detail navigation follows the curated path, composes with Related history, and preserves shared readers', () => {
  const backStart = productionHtml.indexOf('function installRelatedDetailBackBehavior()');
  const backEnd = productionHtml.indexOf('\n  function safeDocumentUrl', backStart);
  const backSource = productionHtml.slice(backStart, backEnd);
  const pathStart = productionHtml.indexOf('function renderCollectionDetailNavigation');
  const pathEnd = productionHtml.indexOf('\n  function renderPackageCards', pathStart);
  const pathSource = productionHtml.slice(pathStart, pathEnd);
  assert.ok(backSource.indexOf('relatedDetailHistory.length') < backSource.indexOf('collectionDetailHistory.length'));
  assert.match(backSource, /recordOpenUsage: false, restoreCollectionHistory: true/);
  assert.match(backSource, /returnToCollectionOverview\(\)/);
  assert.match(pathSource, /context\.position <= 0/);
  assert.match(pathSource, /context\.position >= context\.items\.length - 1/);
  assert.match(pathSource, /openCollectionPathItem\(context\.packageId, context\.position [+-] 1, \{ navigation: true \}\)/);
  assert.match(productionHtml, /collectionDetailHistory\.push\(\{ item: activeDetailItem, position: activeCollectionPathContext\.position \}\)/);
  assert.match(productionHtml, /void openContentFromFirestore\(next\.item,[\s\S]*?fromCollectionNavigation: options\.navigation === true/);
  assert.match(productionHtml, /function returnToCollectionOverview\(\)[\s\S]*?showPreviousView\?\.\('packagesView'/);
  assert.match(productionHtml, /link\.onclick = event => \{ event\.preventDefault\(\); void openContentFromFirestore\(content, \{ fromRelated: true \}\); \}/);
  assert.match(productionHtml, /recordOpenUsage: false, restoreRelatedHistory: true/);
  assert.match(productionHtml, /openContentFromFirestore\(content, \{ fromRelated: true \}\)/);
  assert.match(productionHtml, /openLessonPlayer\(content\.content_id \|\| content\.id, \{ returnToDetail: true \}\)/);
  assert.match(productionHtml, /lessonPlayerReturnToDetail[\s\S]*?showPreviousView\?\.\('detailView'/);
  assert.match(productionHtml, /link\.hash = `content=\$\{encodeURIComponent\(currentContentId\)\}`/);
  assert.match(productionHtml, /function resetKnowledgeWorkspace/);
  assert.match(productionHtml, /activeCollectionPathContext = null;[\s\S]*collectionDetailHistory\.length = 0;[\s\S]*relatedDetailHistory\.length = 0;[\s\S]*resetKnowledgeWorkspace/);
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
  assert.match(productionHtml, /sourceButton\.onclick = \(\) => \{[\s\S]*?showPreviousView\(\)/);
  assert.match(productionHtml, /previous\?\.id === 'searchView'/);
});

test('personal knowledge workspace reuses the saved-items navigation and presents its three sections', () => {
  const workspaceStart = productionHtml.indexOf('function initializeKnowledgeWorkspace()');
  const workspaceEnd = productionHtml.indexOf('\n  function resetKnowledgeWorkspace', workspaceStart);
  assert.notEqual(workspaceStart, -1);
  assert.notEqual(workspaceEnd, -1);
  const workspace = productionHtml.slice(workspaceStart, workspaceEnd);
  assert.match(productionHtml, /data-view="savedView"/);
  assert.match(workspace, /พื้นที่ความรู้ของฉัน/);
  assert.match(workspace, /บันทึกไว้อ่าน/);
  assert.match(workspace, /อ่านล่าสุด/);
  assert.match(workspace, /เรียนต่อ/);
  assert.match(workspace, /workspaceRecentItems/);
  assert.match(workspace, /workspaceLearningItems/);
  assert.match(workspace, /@media\(max-width:700px\)/);
});

test('saved knowledge stays owner-scoped, bounded, removable, and uses the shared detail flow', () => {
  const savedStart = productionHtml.indexOf('async function loadSavedItems()');
  const savedEnd = productionHtml.indexOf('\n  function renderSavedItems()', savedStart);
  const toggleStart = productionHtml.indexOf('async function toggleSavedContent(');
  const toggleEnd = productionHtml.indexOf('\n  function updateDetailSaveButton()', toggleStart);
  const openStart = productionHtml.indexOf('function openWorkspaceContent(');
  const openEnd = productionHtml.indexOf('\n  function renderWorkspaceSavedState()', openStart);
  const savedLoader = productionHtml.slice(savedStart, savedEnd);
  const saveToggle = productionHtml.slice(toggleStart, toggleEnd);
  const workspaceOpen = productionHtml.slice(openStart, openEnd);
  assert.match(savedLoader, /collection\(db, 'savedItems'\), where\('user_email', '==', user\.email\), limit\(APP_LIMITS\.workspaceSaved\)/);
  assert.match(saveToggle, /doc\(db, 'savedItems', savedId\)/);
  assert.match(saveToggle, /is_saved: !currentlySaved/);
  assert.match(saveToggle, /content_id: contentId/);
  assert.match(workspaceOpen, /openContentFromFirestore\(loaded\)/);
  assert.match(workspaceOpen, /where\('content_id', '==', id\)/);
  assert.match(productionHtml, /button\.setAttribute\('aria-pressed', String\(isSaved\)\)/);
});

test('recent reading uses bounded owner-scoped content opens, deduplicates IDs, and never surfaces search events', () => {
  const recentStart = productionHtml.indexOf('async function loadWorkspaceRecent(');
  const recentEnd = productionHtml.indexOf('\n  function renderWorkspaceLearningState()', recentStart);
  assert.notEqual(recentStart, -1);
  assert.notEqual(recentEnd, -1);
  const recent = productionHtml.slice(recentStart, recentEnd);
  assert.match(recent, /where\('user_id', '==', user\.uid\)/);
  assert.match(recent, /orderBy\('last_used_at', 'desc'\)/);
  assert.match(recent, /limit\(APP_LIMITS\.workspaceRecentScan\)/);
  assert.match(recent, /item\.action === 'open' && item\.target_type === 'content'/);
  const recentRendererStart = productionHtml.indexOf('function renderWorkspaceRecentState()');
  const recentRenderer = productionHtml.slice(recentRendererStart, recentEnd);
  assert.match(recentRenderer, /new Set\(\)/);
  assert.match(recentRenderer, /event\.action !== 'open' \|\| event\.target_type !== 'content'/);
  assert.doesNotMatch(recent, /usageAggregates|queryText|search_term/);
});

test('continue learning reuses bounded learningProgress and the existing lesson player', () => {
  const lessonsStart = productionHtml.indexOf('async function loadLessons()');
  const lessonsEnd = productionHtml.indexOf('\n  function getLessonMedia', lessonsStart);
  const learningStart = productionHtml.indexOf('function renderWorkspaceLearningState()');
  const learningEnd = productionHtml.indexOf('\n  async function loadKnowledgeWorkspace()', learningStart);
  const lessonLoader = productionHtml.slice(lessonsStart, lessonsEnd);
  const workspaceLearning = productionHtml.slice(learningStart, learningEnd);
  assert.match(lessonLoader, /collection\(db, 'learningProgress'\), where\('user_email', '==', progressUser\.email\), limit\(APP_LIMITS\.workspaceLearningProgress\)/);
  assert.match(workspaceLearning, /workspaceLearningProgressData/);
  assert.match(workspaceLearning, /item\.completed > 0 && item\.completed < item\.units\.length/);
  assert.match(workspaceLearning, /openLessonPlayer\(item\.id\)/);
  assert.match(workspaceLearning, /window\.show\('learningView'/);
});

test('workspace account changes clear private state and detail return preserves the prior workspace view', () => {
  const resetStart = productionHtml.indexOf('function resetKnowledgeWorkspace(uid)');
  const resetEnd = productionHtml.indexOf('\n  initializeKnowledgeWorkspace();', resetStart);
  const reset = productionHtml.slice(resetStart, resetEnd);
  const authStart = productionHtml.indexOf('onAuthStateChanged(auth, async user => {', productionHtml.indexOf('document.getElementById(\'committeeDecisionSearch\').oninput'));
  const auth = productionHtml.slice(authStart, authStart + 800);
  assert.match(reset, /savedItemsData = \[\]/);
  assert.match(reset, /workspaceRecentData = \[\]/);
  assert.match(reset, /workspaceLearningProgressData = \[\]/);
  assert.match(auth, /workspaceOwnerUid !== \(user\?\.uid \|\| null\)\) \{[\s\S]*?resetKnowledgeWorkspace\(user\?\.uid \|\| null\)/);
  assert.match(productionHtml, /viewHistory\.push\(\{id:current\.id/);
  assert.match(productionHtml, /function showPreviousView\(/);
  assert.match(productionHtml, /sourceButton\.onclick = \(\) => \{[\s\S]*?showPreviousView\(\)/);
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

test('Feature 7 Dashboard composes existing production views and loaded state', () => {
  const start = productionHtml.indexOf('function dashboardReadablePublishedContents(');
  const end = productionHtml.indexOf('\n  function renderPublishedContents(', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = productionHtml.slice(start, end);
  for (const id of ['dashboardLearningSection', 'dashboardCollectionsSection', 'dashboardLatestSection', 'dashboardCategoriesSection', 'dashboardOverviewSection']) assert.match(productionHtml, new RegExp(`id="${id}"`));
  for (const state of ['contentItems', 'categoriesData', 'knowledgePackagesData', 'lessonsData', 'workspaceLearningProgressData']) assert.match(source, new RegExp(state));
  assert.doesNotMatch(source, /getDoc\(|getDocs\(|collection\(db/);
});

test('Feature 7 search and category controls hand off to existing Search behavior', () => {
  assert.match(productionHtml, /<form class="search" id="heroSearch" role="search">[\s\S]*?<label[^>]+for="heroInput"/);
  assert.match(productionHtml, /searchPublishedContents\(document\.getElementById\('heroInput'\)\.value\)/);
  assert.match(productionHtml, /button\.onclick = \(\) => showCategoryResults\(\{ id, name: button\.textContent \}\)/);
  assert.match(productionHtml, /function searchPublishedContents\(rawQuery\)/);
  assert.match(productionHtml, /function showCategoryResults\(category\)/);
});

test('Feature 7 Continue Learning follows existing completed unit semantics and player', () => {
  const start = productionHtml.indexOf('function renderDashboardLearning()');
  const end = productionHtml.indexOf('\n  function renderDashboardCollections()', start);
  const source = productionHtml.slice(start, end);
  assert.match(source, /progress\.completed === true/);
  assert.match(source, /item\.completed > 0 && item\.completed < item\.units\.length/);
  assert.match(source, /item\.units\.length > 0/);
  assert.match(source, /slice\(0, 3\)/);
  assert.match(source, /openLessonPlayer\(item\.id\)/);
  assert.match(source, /section\.hidden = true/);
});

test('Feature 7 collection, latest, and overview sections use readable published records', () => {
  const readableStart = productionHtml.indexOf('function dashboardReadablePublishedContents(');
  const readableEnd = productionHtml.indexOf('\n  function renderDashboardLearning()', readableStart);
  const collectionsStart = productionHtml.indexOf('function renderDashboardCollections()');
  const latestStart = productionHtml.indexOf('function renderDashboardLatest(');
  const categoriesStart = productionHtml.indexOf('function renderDashboardCategories(');
  const overviewStart = productionHtml.indexOf('function renderDashboardOverview(');
  const dashboardEnd = productionHtml.indexOf('\n  function renderHomeDashboard(', overviewStart);
  const readable = productionHtml.slice(readableStart, readableEnd);
  const collections = productionHtml.slice(collectionsStart, latestStart);
  const latest = productionHtml.slice(latestStart, categoriesStart);
  const overview = productionHtml.slice(overviewStart, dashboardEnd);
  assert.match(readable, /items\.filter\(item => packageMemberIsAccessible\(item\)\)/);
  assert.match(collections, /workflow_status === 'published'/);
  assert.match(collections, /getCuratedPackageItems\(item\)/);
  assert.match(collections, /openKnowledgePackage\(item\.id\)/);
  assert.match(latest, /published_at/);
  assert.doesNotMatch(latest, /updated_at|created_at/);
  assert.match(latest, /openContentFromFirestore\(item\)/);
  assert.match(overview, /readable\.filter\(item => item\.content_type === type\)/);
});

test('Feature 7 integrates view history, local section failures, and existing related/path flows', () => {
  assert.match(productionHtml, /function show\(id,name,options=\{\}\)[\s\S]*?viewHistory\.push\(\{id:current\.id,name:pageName\.textContent\|\|'หน้าแรก',scrollY:window\.scrollY/);
  assert.match(productionHtml, /function showPreviousView\([\s\S]*?restoreScroll:previous\?\.scrollY/);
  assert.ok(productionHtml.includes("document.getElementById('searchBack').onclick = () => window.showPreviousView('home', 'หน้าแรก')"));
  assert.ok(productionHtml.includes("dashboardCollectionsAction').onclick = () => window.show('packagesView'"));
  assert.ok(productionHtml.includes("dashboardLessonsAction').onclick = () => window.show('learningView'"));
  assert.match(productionHtml, /workspaceLearningState = 'error'[\s\S]*?renderHomeDashboard\(contentItems\)/);
  assert.match(productionHtml, /knowledgePackagesData = \[\][\s\S]*?renderHomeDashboard\(contentItems\)/);
  assert.match(productionHtml, /relatedDetailHistory\.length = 0/);
  assert.match(productionHtml, /function returnToCollectionOverview\([\s\S]*?showPreviousView\?\.\('packagesView'/);
});

test('Feature 8 authoring workspace keeps supported content types and existing schema fields', () => {
  const viewStart = productionHtml.indexOf('<section class="view" id="formView">');
  const viewEnd = productionHtml.indexOf('<section class="view legal-reference-view" id="judgmentsView">', viewStart);
  const formView = productionHtml.slice(viewStart, viewEnd);
  const formStart = formView.indexOf('<form id="contentForm"');
  const formEnd = formView.indexOf('</form>', formStart);
  const form = formView.slice(formStart, formEnd);
  assert.match(form, /button type="submit"/);
  for (const type of ['knowledge', 'law', 'guide', 'lesson', 'qa', 'judgment', 'committeeDecision']) {
    assert.match(formView, new RegExp(`data-formtype="${type}"`));
    assert.match(form, new RegExp(`data-fields="${type}"`));
  }
  for (const field of [
    'contentTitle', 'contentCategory', 'contentOwnerUnit', 'contentKeywords', 'knowledgeSummary', 'knowledgeGuidance',
    'lawDocumentNo', 'lawDocumentDate', 'lawOfficialTitle', 'guideObjective', 'guideSteps', 'lessonLearningOutcomes',
    'qaQuestionText', 'qaDetails', 'judgmentReferenceNo', 'judgmentIssue', 'committeeDecisionReferenceNo', 'committeeDecisionIssue',
    'contentSourceUrl', 'contentAccessLevel'
  ]) assert.match(form, new RegExp(`id="${field}"`));
  assert.match(form, /<label[^>]+for="contentTitle"/);
  assert.match(form, /<label[^>]+for="contentCategory"/);
  assert.match(form, /id="contentSourceUrl" type="url"/);
  assert.match(productionHtml, /function setFormType\(type\)[\s\S]*?x\.disabled=!active/);
  assert.match(productionHtml, /content_type: activeType/);
  assert.doesNotMatch(productionHtml.slice(productionHtml.indexOf('function queueContentBundle('), productionHtml.indexOf('\n  function queueKnowledgeGapLink', productionHtml.indexOf('function queueContentBundle('))), /batch\.delete/);
});

test('Feature 8 readiness checks reuse deterministic shared rules and keep optional warnings non-blocking', () => {
  const checksStart = productionHtml.indexOf('function authoringBlockingChecks(');
  const warningsStart = productionHtml.indexOf('function authoringWarnings()', checksStart);
  const renderStart = productionHtml.indexOf('function renderAuthoringReadiness()', warningsStart);
  const workflowStart = productionHtml.indexOf('function renderAuthoringWorkflow(', renderStart);
  const rulesStart = productionHtml.indexOf('const contentReadinessRules =');
  const rulesEnd = productionHtml.indexOf('\n\n  function authoringReadinessModel', rulesStart);
  const modelStart = productionHtml.indexOf('function authoringReadinessModel(', rulesEnd);
  const modelEnd = productionHtml.indexOf('\n  function authoringBlockingChecks(', modelStart);
  const checks = productionHtml.slice(checksStart, warningsStart);
  const warnings = productionHtml.slice(warningsStart, renderStart);
  const render = productionHtml.slice(renderStart, workflowStart);
  const rules = productionHtml.slice(rulesStart, rulesEnd);
  const model = productionHtml.slice(modelStart, modelEnd);
  for (const id of ['contentTitle', 'contentCategory', 'contentOwnerUnit', 'knowledgeSummary', 'knowledgeGuidance', 'lawDocumentNo', 'lawDocumentDate', 'lawOfficialTitle', 'guideObjective', 'guideSteps', 'lessonLearningOutcomes', 'qaQuestionText', 'qaDetails', 'judgmentIssue', 'judgmentPrinciple', 'committeeDecisionIssue', 'committeeDecisionPrinciple']) assert.ok(rules.includes(id) || model.includes(id), id);
  assert.match(checks, /evaluateContentReadiness\(model\.item, model\.detail\)\.blocking/);
  assert.match(rules, /function evaluateContentReadiness[\s\S]*?status: missing\.length \? 'incomplete' : warnings\.length \? 'improve' : 'ready'/);
  assert.match(warnings, /warning\.key/);
  assert.match(render, /missing\.length/);
  assert.match(render, /aria-label/);
  assert.doesNotMatch(checks + warnings + render + rules + model, /getDoc\(|getDocs\(|setDoc\(|recordSharedUsage\(/);
  for (const validator of ['validateKnowledgePayload', 'validateLawPayload', 'validateGuidePayload', 'validateLessonPayload', 'validateQuestionPayload', 'validateLegalReferencePayload']) assert.ok(productionHtml.includes('function ' + validator + '('));
});

test('Feature 8 Preview uses in-memory fields and shared Detail presentation without read side effects', () => {
  const modelStart = productionHtml.indexOf('function buildAuthoringPreviewModel(');
  const savedDetailStart = productionHtml.indexOf('async function loadSavedContentDetail(', modelStart);
  const model = productionHtml.slice(modelStart, savedDetailStart);
  const previewStart = productionHtml.indexOf('function renderAuthoringPreview(');
  const savedPreviewStart = productionHtml.indexOf('async function previewSavedContent(', previewStart);
  const renderer = productionHtml.slice(previewStart, savedPreviewStart);
  const bodyStart = productionHtml.indexOf('function renderPrimaryDetailBody(');
  const bodyEnd = productionHtml.indexOf('\n  function getSharedContentIdFromHash()', bodyStart);
  const sharedBody = productionHtml.slice(bodyStart, bodyEnd);
  assert.match(model, /document\.getElementById\('contentTitle'\)\.value/);
  assert.match(model, /document\.getElementById\('contentSourceUrl'\)\.value/);
  assert.match(model, /content_type: type/);
  assert.match(model, /judgment|committeeDecision/);
  assert.doesNotMatch(model, /getDoc\(|getDocs\(|collection\(db|recordSharedUsage|recordCategoryUsage|setDoc\(/);
  assert.match(renderer, /detailHeaderRenderTarget = root/);
  assert.match(renderer, /renderDetailHeader\(item, detail\)/);
  assert.match(renderer, /renderPrimaryDetailBody\(item, detail/);
  assert.match(renderer, /collectDetailResources\(item, detail, \[\]\)/);
  assert.match(renderer, /renderDetailResources\(resourceHost, resources\)/);
  assert.match(renderer, /window\.show\('authoringPreviewView'/);
  assert.match(sharedBody, /appendDetailSection\(body, 'คำถาม', detail\.question_text\)/);
  assert.match(sharedBody, /appendDetailSection\(body, 'ขั้นตอนปฏิบัติ', detail\.steps\)/);
  assert.match(productionHtml, /ตัวอย่างก่อนเผยแพร่ · ยังไม่บันทึก/);
  assert.match(productionHtml, /authoringPreviewBack'\)\.onclick = \(\) => window\.showPreviousView\(authoringPreviewReturnView/);
});

test('Feature 8 Preview of saved content reads only needed existing type details and creates no open event', () => {
  const loadDetailStart = productionHtml.indexOf('async function loadSavedContentDetail(');
  const loadDetailEnd = productionHtml.indexOf('\n  function savedContentReadinessError', loadDetailStart);
  const loadDetail = productionHtml.slice(loadDetailStart, loadDetailEnd);
  const previewStart = productionHtml.indexOf('async function previewSavedContent(');
  const previewEnd = productionHtml.indexOf('\n  async function approveContent(', previewStart);
  const preview = productionHtml.slice(previewStart, previewEnd);
  assert.match(productionHtml, /const contentDetailCollections = \{ law: 'laws', guide: 'guides', lesson: 'lessons', qa: 'questions' \}/);
  assert.match(loadDetail, /getDoc\(doc\(db, collectionName, item\.id\)\)/);
  assert.doesNotMatch(loadDetail, /getDocs\(|limit\(|recordSharedUsage|recordCategoryUsage|usageStats|comments|savedItems|learningProgress/);
  assert.match(preview, /loadSavedContentDetail\(item\)/);
  assert.match(preview, /renderAuthoringPreview\(buildAuthoringPreviewModel\(item, detail\), item\)/);
  assert.doesNotMatch(preview, /recordSharedUsage|recordCategoryUsage|setDoc\(|writeBatch\(|content-open/);
  assert.match(productionHtml, /function renderDetailHeader\(item, detail\)/);
  assert.match(productionHtml, /detailHeaderRenderTarget \|\| document\.querySelector\('#detailView \.detail'\)/);
  assert.match(productionHtml, /renderPrimaryDetailBody\(item, detail, body\)/);
});

test('Feature 8 dirty state preserves in-memory edits and protects internal and browser navigation', () => {
  const snapshotStart = productionHtml.indexOf('function authoringFormSnapshot()');
  const captureStart = productionHtml.indexOf('function captureAuthoringBaseline()', snapshotStart);
  const dirtyStart = productionHtml.indexOf('function updateAuthoringDirtyState()', captureStart);
  const dirtySource = productionHtml.slice(snapshotStart, dirtyStart);
  const showStart = productionHtml.indexOf('function show(id,name,options={})');
  const previousStart = productionHtml.indexOf('function showPreviousView(', showStart);
  const showSource = productionHtml.slice(showStart, productionHtml.indexOf('\n  navs.forEach', previousStart));
  assert.match(dirtySource, /JSON\.stringify\(\[activeAuthoringType\(\), fields\]\)/);
  assert.match(productionHtml, /authoringForm\.addEventListener\('input', updateAuthoringDirtyState\)/);
  assert.match(productionHtml, /authoringForm\.addEventListener\('change', updateAuthoringDirtyState\)/);
  const dirtyStateStart = productionHtml.indexOf('function updateAuthoringDirtyState()', dirtyStart);
  const readinessStart = productionHtml.indexOf('function authoringBlockingChecks(', dirtyStateStart);
  assert.match(productionHtml.slice(dirtyStateStart, readinessStart), /setAuthoringDirty\(authoringFormSnapshot\(\) !== authoringBaseline\)/);
  assert.match(showSource, /current\?\.id==='formView'&&window\.authoringDirty/);
  assert.match(showSource, /id!=='authoringPreviewView'/);
  assert.match(showSource, /showPreviousView[\s\S]*?window\.confirm\('มีการแก้ไขที่ยังไม่ได้บันทึก/);
  assert.match(productionHtml, /window\.addEventListener\('beforeunload'[\s\S]*?event\.returnValue = ''/);
  assert.match(productionHtml, /if \(authoringDirty && !window\.confirm\([\s\S]*?stopImmediatePropagation\(\)/);
  assert.match(productionHtml, /function finishContentCreation\([\s\S]*?captureAuthoringBaseline\(\)/);
  assert.match(productionHtml, /function startNewContent\([\s\S]*?if \(document\.querySelector\('\.view\.active'\)\?\.id === 'formView' && authoringDirty/);
});

test('Feature 8 role-aware workflow and transition locks match current Firestore Rules', () => {
  const contentsStart = firestoreRules.indexOf('match /contents/{documentId}');
  const detailsStart = firestoreRules.indexOf('match /{collectionName}/{documentId}', contentsStart);
  const contentRules = firestoreRules.slice(contentsStart, detailsStart);
  assert.match(contentRules, /allow create: if isAdmin\(\)[\s\S]*?isEditor\(\)[\s\S]*?created_by[\s\S]*?workflow_status[\s\S]*?\['draft', 'review'\]/);
  assert.match(contentRules, /resource\.data\.created_by[\s\S]*?resource\.data\.workflow_status[\s\s\S]*?\['draft', 'review'\]/);
  assert.match(contentRules, /isReviewer\(\)[\s\S]*?resource\.data\.workflow_status == 'review'[\s\S]*?request\.resource\.data\.workflow_status == 'approved'/);
  assert.match(contentRules, /'workflow_status',[\s\S]*?'approved_by',[\s\S]*?'approved_at',[\s\S]*?'updated_at'/);
  const actionsStart = productionHtml.indexOf('function renderAuthoringWorkflow(');
  const actionsEnd = productionHtml.indexOf('\n  function authoringCanWrite()', actionsStart);
  const actions = productionHtml.slice(actionsStart, actionsEnd);
  assert.match(actions, /role === 'admin' \|\| \(role === 'editor' && ownsItem && \['draft', 'review'\]\.includes\(status\)\)/);
  assert.match(actions, /button\.disabled = !canEdit \|\| Boolean\(item && button\.dataset\.formtype !== item\.content_type\)/);
  assert.match(actions, /submit\.hidden = !canEdit[^;]*status !== 'draft'/);
  assert.match(productionHtml, /if \(!\['admin', 'reviewer'\]\.includes\(currentUserProfile\?\.role\)\) return window\.toast\('บัญชีนี้ไม่มีสิทธิอนุมัติเนื้อหา'\)/);
  assert.match(productionHtml, /if \(currentUserProfile\?\.role !== 'admin'\) return window\.toast\('เฉพาะผู้ดูแลระบบที่เผยแพร่เนื้อหาได้'\)/);
  assert.match(productionHtml, /authoringWriteInFlight = 'approve'/);
  assert.match(productionHtml, /authoringWriteInFlight = 'publish'/);
  assert.match(productionHtml, /เผยแพร่ “\$\{item\.title \|\| item\.content_id \|\| id\}” \?/);
  assert.match(productionHtml, /published_at: serverTimestamp\(\)/);
  assert.match(productionHtml, /savedContentReadinessError\(item, detail\)/);
});

test('Feature 8 Save, submit, approve, and publish reuse existing persistence and version history', () => {
  const bundleStart = productionHtml.indexOf('function queueContentBundle(');
  const bundleEnd = productionHtml.indexOf('\n  function queueKnowledgeGapLink', bundleStart);
  const bundle = productionHtml.slice(bundleStart, bundleEnd);
  const saveStart = productionHtml.indexOf('async function saveDraftToFirestore()');
  const submitStart = productionHtml.indexOf('async function submitForReview(event)', saveStart);
  const save = productionHtml.slice(saveStart, submitStart);
  const submitEnd = productionHtml.indexOf('\n  function completeManagementTabs', submitStart);
  const submit = productionHtml.slice(submitStart, submitEnd);
  assert.match(save, /authoringWriteInFlight = 'save'/);
  assert.match(save, /queueContentBundle\(batch, contentId/);
  assert.match(save, /createContentVersion\(contentId, isEditing \? 'edit_draft' : 'create'/);
  assert.match(save, /captureAuthoringBaseline\(\)/);
  assert.match(save, /บันทึกไม่สำเร็จ ข้อมูลยังอยู่ในแบบฟอร์ม/);
  assert.match(submit, /authoringWriteInFlight = 'submit'/);
  assert.match(submit, /queueContentBundle\(batch, contentId/);
  assert.match(submit, /createContentVersion\(contentId, isNew \? 'create_and_submit' : 'submit_review'/);
  assert.match(submit, /ส่งตรวจไม่สำเร็จ ข้อมูลยังอยู่ในแบบฟอร์ม/);
  assert.match(bundle, /doc\(db, 'contents', contentId\)/);
  assert.match(bundle, /doc\(db, 'questions', contentId\)/);
  const fileReferenceStart = productionHtml.indexOf('function queueFileReference(');
  const fileReferenceEnd = productionHtml.indexOf('\n  function queueContentBundle', fileReferenceStart);
  assert.match(productionHtml.slice(fileReferenceStart, fileReferenceEnd), /doc\(db, 'files', fileId\)/);
  assert.match(productionHtml, /function createContentVersion\(contentId, action, reason\)/);
  assert.match(productionHtml, /transaction\.set\(versionRef/);
  assert.match(productionHtml, /function restoreContentVersion\(version\)/);
  assert.match(productionHtml, /restore\.hidden = currentUserProfile\?\.role !== 'admin'/);
});

test('Feature 8 reviewer/admin management list integrates Preview and existing workflow actions', () => {
  const listStart = productionHtml.indexOf('async function loadContents(reset = true)');
  const listEnd = productionHtml.indexOf('\n  function renderContentReports', listStart);
  const list = productionHtml.slice(listStart, listEnd);
  assert.match(list, /button class="btn preview-content">ดูตัวอย่าง/);
  assert.match(list, /previewButton\.onclick = \(\) => previewSavedContent\(item\)/);
  assert.match(list, /item\.workflow_status === 'review' && \(role === 'admin' \|\| role === 'reviewer'\)/);
  assert.match(list, /item\.workflow_status === 'approved' && role === 'admin'/);
  assert.match(list, /setupManageTabs\(\)/);
  assert.match(list, /applyManageFilter\(\)/);
  assert.match(productionHtml, /async function openVersionHistory\(contentId\)/);
  assert.match(productionHtml, /restore\.hidden = currentUserProfile\?\.role !== 'admin'/);
});

function createGovernanceReadinessEngine() {
  const start = productionHtml.indexOf('const contentReadinessRules =');
  const end = productionHtml.indexOf('\n\n  function authoringReadinessModel', start);
  const source = productionHtml.slice(start, end);
  return new Function('URL', `${source}; return { contentReadinessRules, evaluateContentReadiness };`)(URL);
}

test('Feature 9 adds a staff-only Governance Center outside the learner Dashboard', () => {
  const viewStart = productionHtml.indexOf('<section class="view governance-view" id="governanceView"');
  const viewEnd = productionHtml.indexOf('<section class="view" id="manageView"', viewStart);
  const view = productionHtml.slice(viewStart, viewEnd);
  assert.notEqual(viewStart, -1);
  assert.match(productionHtml, /data-view="governanceView"/);
  assert.match(productionHtml, /governanceNav\.hidden = !canManageContent/);
  assert.match(productionHtml, /canManageContent = isAdmin \|\| role === 'editor' \|\| role === 'reviewer'/);
  assert.doesNotMatch(productionHtml.slice(productionHtml.indexOf('id="home"'), viewStart), /governanceView|ศูนย์ควบคุมคุณภาพองค์ความรู้/);
  for (const id of ['governanceOverview', 'governanceReviewQueue', 'governancePublishQueue', 'governancePublishedHealth', 'governancePackageHealth', 'governanceFilterForm']) assert.match(view, new RegExp(`id="${id}"`));
});

test('Feature 9 governance record visibility keeps editor ownership and staff role boundaries', () => {
  const start = productionHtml.indexOf('function governanceRecordVisibleForRole(');
  const end = productionHtml.indexOf('\n  function governanceRecordMatches(', start);
  const source = productionHtml.slice(start, end);
  const visibleFor = (role, email, item) => new Function('currentUserProfile', 'auth', `${source}; return governanceRecordVisibleForRole;`)({ role }, { currentUser: { email } })(item);
  assert.equal(visibleFor('editor', 'EDITOR@example.test', { created_by: 'editor@example.test' }), true);
  assert.equal(visibleFor('editor', 'editor@example.test', { created_by: 'someone-else@example.test' }), false);
  assert.equal(visibleFor('reviewer', 'reviewer@example.test', { created_by: 'someone-else@example.test' }), true);
  assert.equal(visibleFor('admin', 'admin@example.test', { created_by: 'someone-else@example.test' }), true);
  assert.equal(visibleFor('user', 'user@example.test', { created_by: 'user@example.test' }), false);
  assert.match(productionHtml, /role === 'admin' \|\| \(role === 'editor' && owns && \['draft', 'review'\]\.includes\(item\.workflow_status\)\)/);
});

test('Feature 9 shared evaluator preserves Feature 8 blocking rules and separates warnings', () => {
  const { evaluateContentReadiness, contentReadinessRules } = createGovernanceReadinessEngine();
  const incomplete = evaluateContentReadiness({ content_type: 'knowledge' });
  assert.equal(incomplete.status, 'incomplete');
  assert.deepEqual(incomplete.missing.map(check => check.key), ['title', 'category', 'ownerUnit', 'summary', 'guidance']);
  const item = { title: 'Title', category_id: 'cat', owner_unit: 'unit', content_type: 'knowledge', summary: 'Summary', guidance: 'Guidance', keywords: ['term'], source_url: 'https://example.test/source' };
  const ready = evaluateContentReadiness(item, {}, { categories: [{ category_id: 'cat' }] });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.warnings.length, 0);
  const warningOnly = evaluateContentReadiness({ ...item, keywords: '', source_url: '' }, {}, { categories: [{ category_id: 'cat' }] });
  assert.equal(warningOnly.status, 'improve');
  assert.equal(warningOnly.missing.length, 0);
  assert.deepEqual(warningOnly.warnings.map(warning => warning.key), ['keywords', 'source']);
  const brokenCategory = evaluateContentReadiness(item, {}, { categories: [] });
  assert.ok(brokenCategory.warnings.some(warning => warning.key === 'categoryReference'));
  assert.ok(contentReadinessRules.types.law.some(rule => rule.field === 'document_no'));
  assert.ok(contentReadinessRules.types.qa.some(rule => rule.field === 'question_text'));
  assert.ok(contentReadinessRules.types.lesson.some(rule => rule.field === 'learning_outcomes'));
});

test('Feature 9 review queues use submitted_at and deterministic fallback, never update/create dates', () => {
  const start = productionHtml.indexOf('function governanceTimestampSeconds(');
  const end = productionHtml.indexOf('\n  function governanceDetailFor(', start);
  const source = productionHtml.slice(start, end);
  const engine = new Function(`${source}; return { sortGovernanceQueue };`)();
  const sorted = engine.sortGovernanceQueue([
    { id: 'undated-z', title: 'Zeta', updated_at: { seconds: 99 } },
    { id: 'old', title: 'Older', submitted_at: { seconds: 10 }, updated_at: { seconds: 900 } },
    { id: 'new', title: 'Newer', submitted_at: { seconds: 20 }, created_at: { seconds: 999 } },
    { id: 'undated-a', title: 'Alpha', created_at: { seconds: 999 } }
  ]);
  assert.deepEqual(sorted.map(item => item.id), ['new', 'old', 'undated-a', 'undated-z']);
  assert.match(source, /a\[timestampField\]/);
  assert.doesNotMatch(source, /updated_at|created_at/);
  assert.match(productionHtml, /submitted_at: serverTimestamp\(\)/);
  assert.match(productionHtml, /approved_at: serverTimestamp\(\)/);
  assert.match(productionHtml, /published_at: serverTimestamp\(\)/);
});

test('Feature 9 governance filters reuse search normalization and do not record search analytics', () => {
  const matchStart = productionHtml.indexOf('function governanceRecordMatches(');
  const matchEnd = productionHtml.indexOf('\n  function governanceTypeLabel', matchStart);
  const filterSource = productionHtml.slice(matchStart, matchEnd);
  assert.match(filterSource, /normalizeSearchText\(state\.query\)/);
  for (const field of ['title', 'summary', 'keywords', 'document_no', 'reference_no', 'authority', 'decision_issue', 'legal_principle']) assert.ok(filterSource.includes(field));
  assert.match(filterSource, /item\.workflow_status/);
  assert.match(filterSource, /item\.content_type/);
  assert.match(filterSource, /item\.category_id/);
  assert.match(filterSource, /evaluation\.status/);
  assert.doesNotMatch(filterSource, /recordSearch|recordSharedUsage|usageStats|usageAggregates|getDocs\(|getDoc\(/);
});

test('Feature 9 Governance Center uses loaded pools and has no per-record Firestore reads', () => {
  const start = productionHtml.indexOf('function governanceTimestampSeconds(');
  const end = productionHtml.indexOf('\n  async function previewSavedContent(', start);
  const governanceSource = productionHtml.slice(start, end);
  assert.match(governanceSource, /contentItems\.filter\(governanceRecordVisibleForRole\)/);
  assert.match(governanceSource, /categories: allCategoriesData/);
  assert.match(governanceSource, /knowledgePackagesData\.filter/);
  assert.doesNotMatch(governanceSource, /getDocs\(|getDoc\(|setDoc\(|writeBatch\(|recordSharedUsage\(|recordCategoryUsage\(/);
  assert.match(productionHtml, /โหลดเพิ่มได้จากหน้าจัดการเนื้อหา/);
  assert.match(productionHtml, /previewSavedContent\(item, 'governanceView'\)/);
  assert.match(productionHtml, /editContent\(item\.id\)/);
  assert.match(productionHtml, /approveContent\(workflowItem\.id, approve\)/);
  assert.match(productionHtml, /publishContent\(workflowItem\.id, publish\)/);
});

test('Feature 9 package health reports aggregate loaded-pool conditions without member disclosure or path mutation', () => {
  const start = productionHtml.indexOf('function governancePackageHealth(');
  const end = productionHtml.indexOf('\n  function renderGovernanceCenter(', start);
  const source = productionHtml.slice(start, end);
  assert.match(source, /packageSectionDefs\.forEach/);
  assert.match(source, /contentItems\.forEach/);
  assert.match(source, /workflow_status !== 'published'/);
  assert.match(source, /unresolvedInLoadedPool/);
  assert.doesNotMatch(source, /setDoc\(|writeBatch\(|sections\[[^]]+\]\s*=|window\.show\('detailView'/);
  const cardSource = productionHtml.slice(productionHtml.indexOf('function renderGovernancePackages('), end);
  assert.match(cardSource, /title\.textContent = item\.title/);
  assert.doesNotMatch(cardSource, /reference\)|member\.title|member\.id/);
  assert.match(productionHtml, /ยังสรุปว่าไม่มีในระบบไม่ได้/);
});

test('Feature 9 Preview returns through existing viewHistory and clears governance private state on account change', () => {
  assert.match(productionHtml, /window\.showPreviousView\(authoringPreviewReturnView/);
  assert.match(productionHtml, /authoringPreviewReturnView = returnView/);
  assert.match(productionHtml, /function show\(id,name,options=\{\}\)[\s\S]*?viewHistory\.push\(\{id:current\.id/);
  assert.match(productionHtml, /governanceState = \{ status: 'all', type: 'all', category: 'all', quality: 'all', query: '' \};[\s\S]*?activeCollectionPathContext = null/);
  assert.doesNotMatch(productionHtml.slice(productionHtml.indexOf('function governanceRecordMatches('), productionHtml.indexOf('async function previewSavedContent')), /localStorage|sessionStorage|usageStats|usageAggregates/);
});

test('Feature 9 Governance Center has labeled controls, text quality reasons, and compact mobile cards', () => {
  const start = productionHtml.indexOf('<section class="view governance-view" id="governanceView"');
  const end = productionHtml.indexOf('<section class="view" id="manageView"', start);
  const view = productionHtml.slice(start, end);
  const stylesStart = productionHtml.indexOf('<style id="governanceCenterStyles">');
  const stylesEnd = productionHtml.indexOf('</style>', stylesStart);
  const styles = productionHtml.slice(stylesStart, stylesEnd);
  for (const id of ['governanceQuery', 'governanceStatusFilter', 'governanceTypeFilter', 'governanceCategoryFilter', 'governanceQualityFilter']) {
    assert.match(view, new RegExp(`for="${id}"`));
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(view, /<details class="governance-filter-disclosure"/);
  assert.match(productionHtml, /evaluation\.statusLabel/);
  assert.match(productionHtml, /evaluation\.missing\.map\(check => check\.message\)/);
  assert.match(styles, /@media\(max-width:600px\)/);
  assert.match(styles, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(styles, /overflow-wrap:anywhere/);
});
