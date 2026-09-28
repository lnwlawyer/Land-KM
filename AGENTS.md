# AGENTS.md — Land-KM Development Guide

เอกสารนี้เป็นกติกาประจำโปรเจกต์ Land-KM สำหรับ AI coding agents รวมถึง Codex

ข้อมูลในเอกสารนี้อ้างอิงจาก source code, configuration, Firestore Rules และ tests
ที่ตรวจพบใน workspace ปัจจุบัน

เป้าหมายสำคัญคือให้การพัฒนาต่อยอดระบบเดิมเป็นไปอย่างปลอดภัย
รักษา compatibility กับระบบที่ใช้งานอยู่ และหลีกเลี่ยงการเปลี่ยนแปลง
architecture, schema, permissions หรือ production environment โดยไม่ตั้งใจ

---

# 1. Project Overview

Land-KM เป็นเว็บแอปสำหรับจัดการ ค้นหา และเผยแพร่องค์ความรู้
ด้านงานทะเบียนที่ดิน รวมถึง:

- เนื้อหาความรู้
- กฎหมาย
- คู่มือและแนวทางปฏิบัติ
- บทเรียน
- หน่วยการเรียน
- ชุดความรู้
- ระบบถาม–ตอบ
- ความคิดเห็น
- ไฟล์/ลิงก์เอกสาร
- ความก้าวหน้าการเรียนรู้
- การบันทึกรายการที่สนใจ
- Knowledge Gaps
- Version History
- Issue Reports
- Usage Statistics

ระบบปัจจุบันเป็น static single-page web application

Firebase Hosting ให้บริการเว็บจาก:

    public/index.html

ให้ถือ public/index.html เป็น production application source และ
application source of truth เพียงไฟล์เดียวสำหรับ UI, CSS, JavaScript
และ Firebase client logic

หน้าเว็บเชื่อม Firebase Authentication และ Cloud Firestore
โดยตรงผ่าน Firebase Web SDK

จาก source ที่ตรวจพบ ยังไม่มี backend API หรือ Cloud Functions
ที่เป็นส่วนหนึ่งของ production architecture หลัก

## Technology Stack

Technology ที่ตรวจพบจริง:

- HTML
- CSS
- JavaScript ES Modules
- Firebase Web SDK 12.2.1 จาก gstatic
- Firebase Authentication
- Google Sign-In
- Cloud Firestore
- Firebase Hosting
- Firebase Emulator Suite
- Node.js
- Node.js Test Runner
- Firestore Security Rules

ห้ามเพิ่ม framework, backend service หรือ dependency ขนาดใหญ่
โดยไม่ได้รับคำสั่งจากผู้ใช้

---

# 2. Project Structure

ไฟล์และองค์ประกอบสำคัญที่ตรวจพบ:

## Production Application Source

    public/index.html

เป็น application source of truth เพียงไฟล์เดียว และเป็นหน้าเว็บที่
Firebase Hosting ให้บริการตาม firebase.json ปัจจุบัน

## Other Application / Reference Files

ไฟล์อื่นที่ตรวจพบ:

    Land-KM-UX-Prototype.html
    index-Lesson-Complete.html
    index-Learning-Progress-Complete.html

ไฟล์เหล่านี้เป็น prototype / version / reference ที่พบใน workspace

ห้ามใช้แทน production source โดยอัตโนมัติ

## Firebase Configuration

    firebase.json
    .firebaserc
    firestore.rules

## Tests

    tests/firestore.rules.test.mjs
    tests/app-structure.test.mjs

## Documentation

    TESTING-GUIDE-TH.md

## Package Configuration

    package.json
    package-lock.json

## Archives

ตัวอย่าง archive ที่ตรวจพบ:

    Land-KM-System-Complete.zip
    Land-KM-Production-Complete-20260917-1602.zip

Archive เป็นข้อมูลอ้างอิง/backup

ห้ามแก้ไข archive เดิม
และห้ามใช้ archive แทน source ปัจจุบันโดยไม่ได้รับคำสั่ง

---

# 3. Production Source Rule

กฎนี้มีความสำคัญสูง

จาก firebase.json ปัจจุบัน Firebase Hosting ใช้:

    public

เป็น Hosting directory

ดังนั้น public directory เป็น Hosting directory และ:

    public/index.html

เป็น production source และ application source of truth เพียงไฟล์เดียว
สำหรับ UI, CSS, JavaScript และ Firebase client logic

ไฟล์ต่อไปนี้ห้ามใช้แทน production source โดยอัตโนมัติ:

    Land-KM-UX-Prototype.html
    index-Lesson-Complete.html
    index-Learning-Progress-Complete.html
    *Complete*.html
    *.zip

ก่อนแก้หน้าเว็บ production ต้องตรวจ firebase.json เพื่อยืนยัน Hosting directory

เมื่อผู้ใช้สั่งแก้หน้าเว็บโดยไม่ได้ระบุไฟล์
ให้ใช้ public/index.html เป็นเป้าหมายตาม Hosting configuration ปัจจุบัน

---

# 4. Firebase Architecture

## 4.1 Authentication

ระบบใช้ Google Sign-In ผ่าน Firebase Authentication

ตรวจ authentication state ด้วย:

    onAuthStateChanged

หลัง sign-in ระบบอ่าน profile จาก:

    users/{uid}

ผู้ใช้ต้องมี profile และมีสถานะ:

    is_active: true

จึงจะสามารถใช้งานตามสิทธิที่กำหนด

Firestore Rules ใช้ข้อมูล profile ใน users
สำหรับตรวจ active status และ role

ห้ามเปลี่ยน authentication flow โดยไม่ได้ตรวจผลกระทบต่อ:

- users collection
- Firestore Rules
- UI permissions
- role handling
- existing user accounts

---

# 5. Firestore Collections

Collections ที่ตรวจพบจาก source code หรือ Firestore Rules ได้แก่:

    users
    categories
    contents
    laws
    guides
    lessons
    lessonUnits
    files
    questions
    answers
    comments
    learningProgress
    savedItems
    knowledgePackages
    knowledgeGaps
    contentVersions
    versionCounters
    issueReports
    usageStats
    usageAggregates

contentVersions/{versionId} มี subcollections ที่ตรวจพบ ได้แก่:

    lessonUnits
    answers
    files

ห้าม:

- rename collection
- merge collection
- delete collection
- เปลี่ยน schema
- เปลี่ยน field name

โดยไม่ได้รับคำสั่งและวิเคราะห์ migration impact ก่อน

---

# 6. Important Data Relationships

ความสัมพันธ์ที่ตรวจพบจาก source ได้แก่:

## Contents

contents เป็นข้อมูลหลักของเนื้อหา

collections เช่น:

    laws
    guides
    lessons

ใช้เก็บรายละเอียดตามชนิดของเนื้อหา

## Lessons

lessonUnits เชื่อมกับบทเรียนผ่าน:

    content_id

## Q&A

answers เชื่อมกับ questions ผ่าน:

    question_id

questions สามารถเก็บ:

    accepted_answer_id

## Comments

comments อ้างถึงเป้าหมายผ่าน:

    target_id
    target_type

## Files

files เชื่อมกับเนื้อหาผ่าน:

    content_id

จาก production source ที่ตรวจพบ ระบบหลักเก็บ URL อ้างอิงไฟล์

ยังไม่พบหลักฐานเพียงพอว่าหน้า production หลักอัปโหลดไฟล์
ผ่าน Firebase Storage โดยตรง

ห้ามสรุปว่า Firebase Storage ไม่ได้ถูกใช้ในส่วนอื่นของระบบ
โดยไม่ตรวจ source เพิ่มเติม

## Learning Progress

learningProgress เชื่อมข้อมูลกับผู้ใช้

source ที่ตรวจพบมีการใช้:

    user_email

## Saved Items

savedItems เชื่อมข้อมูลกับผู้ใช้

source ที่ตรวจพบมีการใช้:

    user_email

## Knowledge Packages

knowledgePackages เก็บชุดความรู้และ sections
ที่สามารถอ้างถึงเนื้อหาที่เผยแพร่แล้ว

## Content Versions

contentVersions เก็บ snapshot/version ของเนื้อหา

versionCounters ใช้สำหรับจัดการเลขเวอร์ชัน

## Knowledge Gaps

knowledgeGaps ใช้เก็บช่องว่างขององค์ความรู้
และสามารถเชื่อมโยงกับเนื้อหาที่สร้างขึ้นภายหลัง

## Usage Statistics

usageStats เก็บข้อมูลสถิติระดับผู้ใช้

usageAggregates เก็บข้อมูล aggregate

---

# 7. Roles & Permissions

Role vocabulary ที่พบจาก source/rules/tests ต้องรักษาไว้

Role หลักที่ตรวจพบ:

    admin
    editor
    reviewer
    user

อย่างไรก็ตาม พบความไม่สอดคล้องบางส่วนใน source
เนื่องจาก UI บางส่วนใช้คำว่า:

    viewer

ขณะที่ Firestore Rules และ tests มี:

    user

ดังนั้น viewer/user ให้ถือเป็น Known Issue

ห้าม:

- เปลี่ยน viewer เป็น user อัตโนมัติ
- เปลี่ยน user เป็น viewer อัตโนมัติ
- merge role
- rename role
- migrate role

จนกว่าจะตรวจ:

- UI
- users data
- Firestore Rules
- tests
- queries
- permission checks

และได้รับการยืนยันจากผู้ใช้

## admin

สิทธิที่ตรวจพบรวมถึง:

- จัดการ users
- จัดการ categories
- จัดการเนื้อหา
- เผยแพร่เนื้อหาที่อนุมัติแล้ว
- งานระบบและ moderation บางประเภท

## editor

สามารถสร้างและแก้เนื้อหาของตนตามเงื่อนไขของ Rules

โดยทั่วไปเกี่ยวข้องกับสถานะ:

    draft
    review

และ ownership เช่น:

    created_by

## reviewer

เกี่ยวข้องกับ:

- review
- approval
- moderation
- Knowledge Gaps บางส่วน

ตามเงื่อนไขของ Rules

## user

ผู้ใช้ active ที่มีสิทธิพื้นฐาน เช่น:

- อ่านเนื้อหาที่ได้รับอนุญาต
- แสดงความคิดเห็น
- ใช้งาน Q&A
- learning progress
- saved items
- ข้อมูลส่วนบุคคลบางประเภท

สิทธิจริงต้องยึด Firestore Rules
ไม่ใช่เพียงการซ่อน/แสดงเมนูใน UI

---

# 8. Authorization Rule

การซ่อนปุ่ม เมนู หรือ component ใน UI
ไม่ถือเป็น security boundary

Firestore Security Rules เป็น authorization boundary หลักของข้อมูล

เมื่อแก้ระบบ permission ต้องตรวจอย่างน้อย:

1. UI visibility
2. event handler
3. Firestore read/write
4. firestore.rules
5. tests
6. role/profile data assumptions

ห้ามแก้เฉพาะ UI แล้วสรุปว่าระบบปลอดภัย

---

# 9. Content Workflow

สถานะที่ตรวจพบ:

    draft
    review
    approved
    published
    archived

Workflow หลักที่ตรวจพบ:

    draft
      ↓
    review
      ↓
    approved
      ↓
    published

archived เป็นสถานะเพิ่มเติมที่พบในระบบ

## Editor

editor สามารถสร้างเนื้อหาโดยใช้ ownership ตาม source/rules
เช่น created_by

editor สามารถแก้เนื้อหาของตนในสถานะที่ Rules อนุญาต
โดยเฉพาะ draft/review

ต้องรักษา identifiers สำคัญ เช่น:

    content_id
    content_type

ตามเงื่อนไข Rules

## Reviewer

reviewer สามารถดำเนินการ approval
จาก review ไป approved ตามเงื่อนไข Rules

Rules อาจจำกัด fields ที่สามารถเปลี่ยนได้

## Admin

admin มีสิทธิกว้างกว่าในการจัดการเนื้อหา
รวมถึง publication workflow

## Knowledge Packages

knowledgePackages ใช้ workflow ที่ตรวจพบ เช่น:

    draft
    review
    approved
    published

ห้ามเพิ่ม ลบ หรือเปลี่ยน workflow status
โดยไม่ได้ตรวจ:

- UI
- event handlers
- Firestore writes
- queries
- Firestore Rules
- tests

---

# 10. Coding Rules

รักษา architecture ปัจจุบัน
เว้นแต่ผู้ใช้สั่งให้เปลี่ยน

หลักการแก้ code:

1. แก้เฉพาะส่วนที่จำเป็น
2. หลีกเลี่ยง large refactor หากไม่ได้รับคำสั่ง
3. ห้าม rename collections โดยพลการ
4. ห้าม rename fields โดยพลการ
5. ห้ามเปลี่ยน roles โดยพลการ
6. ห้ามเปลี่ยน workflow status โดยพลการ
7. ห้ามเปลี่ยน Firebase project โดยพลการ
8. ห้ามเพิ่ม dependency โดยไม่อธิบายเหตุผล
9. ห้ามเปลี่ยน architecture เพื่อความสะดวกของ agent เอง

ก่อนแก้ public/index.html:

- ระบุ feature/function ที่เกี่ยวข้อง
- ตรวจ event handlers
- ตรวจ Firestore queries
- ตรวจ role checks
- ตรวจ Rules ที่เกี่ยวข้อง
- ตรวจ duplicate handlers
- ตรวจผลกระทบต่อ feature อื่น

เนื่องจาก public/index.html เป็นไฟล์ขนาดใหญ่
ให้แก้แบบ targeted modification

หลีกเลี่ยงการ rewrite ทั้งไฟล์
หากสามารถแก้เฉพาะ block/function ที่เกี่ยวข้องได้

---

# 11. Minimal Change Principle

เมื่อผู้ใช้ขอแก้ feature หนึ่ง
ให้เปลี่ยนเฉพาะ code ที่จำเป็นต่อ feature นั้น

ตัวอย่าง:

หากผู้ใช้ขอแก้การคลิกรายการในหน้า "กฎหมาย"

ให้ตรวจเฉพาะ:

- rendering ของรายการกฎหมาย
- click handler
- event delegation
- cursor/hover behavior
- open/read function ที่เกี่ยวข้อง

อย่า refactor ระบบ Authentication, Firestore architecture
หรือ navigation ทั้งระบบโดยไม่มีความจำเป็น

หากพบปัญหาอื่นระหว่างทำงาน
ให้รายงานแยกเป็น recommendation
ไม่แก้อัตโนมัติ

---

# 12. Firebase Project Safety

พบ project identifiers ที่ไม่ตรงกัน:

.firebaserc:

    demo-land-km

Firebase client configuration ใน public/index.html:

    land-km-gpt

ห้ามสรุปเองว่า project ใดผิด

อาจมีความเป็นไปได้ว่า project หนึ่งใช้สำหรับ emulator/test
และอีก project เป็น application/production project

ดังนั้น:

- ห้ามแก้ .firebaserc อัตโนมัติ
- ห้ามแก้ firebaseConfig อัตโนมัติ
- ห้ามเปลี่ยน project alias อัตโนมัติ
- ห้าม deploy เพื่อทดลองว่า project ใดถูก
- ห้าม copy configuration จาก project หนึ่งไปอีก project

ก่อน deploy ทุกครั้งต้องยืนยัน:

1. Firebase CLI current project
2. .firebaserc alias
3. firebase.json
4. client projectId
5. deployment target

หากยังมีความไม่ตรงกัน
ให้แจ้งผู้ใช้ก่อน deploy

---

# 13. Firebase Safety Rules

ห้าม deploy โดยไม่ได้รับคำสั่งจากผู้ใช้

ห้ามเรียก:

    firebase deploy

โดยอัตโนมัติ

ห้ามลบ production data

ห้ามแก้ firestore.rules โดยไม่อธิบายผลกระทบ

ก่อนแก้ Rules ให้ระบุ:

- collection ที่ได้รับผลกระทบ
- role ที่ได้รับผลกระทบ
- read permissions
- create permissions
- update permissions
- delete permissions
- query implications

หาก Rules เปลี่ยน
ควรรัน Rules tests ที่เกี่ยวข้องก่อนเสนอ deploy

---

# 14. Production Data Safety

ถือว่าข้อมูล Firebase จริงอาจเป็น production data
จนกว่าจะยืนยันเป็นอย่างอื่น

ห้าม:

- bulk delete
- bulk update
- schema migration
- collection rename
- destructive cleanup
- overwrite documents จำนวนมาก

โดยไม่ได้รับอนุญาตชัดเจน

หากจำเป็นต้องทำ data migration:

1. วิเคราะห์จำนวนและประเภทข้อมูล
2. เสนอ migration plan
3. เสนอ rollback plan
4. สำรองข้อมูลหากทำได้
5. ขออนุญาตผู้ใช้
6. จึงดำเนินการ

---

# 15. Testing

คำสั่งทดสอบที่พบใน package.json:

    npm test

ใช้ Firestore Emulator และ tests ใน tests

    npm run test:rules

ใช้ทดสอบ Firestore Security Rules

    npm run test:app

ใช้ app structure tests

หลังแก้ code:

- ระบุ tests ที่เกี่ยวข้อง
- รัน tests ที่เกี่ยวข้องหาก environment รองรับ
- รายงานผล tests
- หากไม่ได้รัน test ต้องแจ้งอย่างชัดเจน

การรัน tests ไม่ถือเป็นการ deploy

## Known Test Limitation

tests/app-structure.test.mjs ตรวจ:

    Land-KM-UX-Prototype.html

ไม่ใช่:

    public/index.html

ดังนั้นห้ามสรุปว่า app structure test
ยืนยัน production Hosting page โดยตรง

หาก feature ที่แก้อยู่ใน public/index.html
ควรตรวจ production source เพิ่มเติมโดยตรง

---

# 16. Change Protocol

## Git Development Workflow

ก่อนเริ่มแก้ไข feature, bug fix หรือ refactor ทุกครั้ง
ให้ตรวจสอบสถานะ Git working tree ด้วย:

    git status

งานพัฒนาใหม่ควรเริ่มจาก working tree ที่ clean

หาก working tree ไม่ clean:

- ห้าม discard, reset, overwrite หรือ stash การเปลี่ยนแปลงที่มีอยู่
- ห้าม commit การเปลี่ยนแปลงเดิมโดยอัตโนมัติ
- ตรวจสอบและรายงานผู้ใช้ว่าไฟล์ใดเปลี่ยนแปลงอยู่
- ให้ถือว่าการเปลี่ยนแปลงเหล่านั้นอาจเป็นงานที่ยังไม่เสร็จ

ให้ดำเนินงานต่อเมื่อผู้ใช้ยืนยันแนวทางจัดการการเปลี่ยนแปลงเดิมแล้ว

ก่อนแก้ไข ให้ระบุไฟล์ที่คาดว่าจะได้รับผลกระทบ

ระหว่างทำงาน ให้ใช้ Git ตรวจสอบขอบเขตการเปลี่ยนแปลง
แต่ห้าม commit โดยอัตโนมัติ

หลังแก้ไขและทดสอบเสร็จ ให้ตรวจสอบ:

    git status --short
    git diff --stat
    git diff

ก่อนเสนอให้ commit ให้สรุป:

- ไฟล์ที่เพิ่ม
- ไฟล์ที่แก้
- ไฟล์ที่ลบ
- จุดสำคัญที่เปลี่ยน
- tests ที่รันและผลของ tests
- known limitations หรือสิ่งที่ยังไม่ได้ตรวจ

ต้องแสดงหรือสรุป Git diff ให้ผู้ใช้ตรวจสอบก่อน commit

ห้ามรัน `git commit` หรือ `git push` โดยไม่ได้รับคำสั่งหรืออนุญาตจากผู้ใช้

ห้ามใช้คำสั่ง destructive ต่อไปนี้โดยไม่ได้รับคำสั่งที่ชัดเจนจากผู้ใช้:

    git reset --hard
    git clean -fd
    git checkout -- .
    git restore .
    git restore --source
    git rebase
    git push --force

หากต้องย้อนการเปลี่ยนแปลง ให้อธิบายก่อนว่าจะย้อน:

- ไฟล์ใด
- commit ใด
- การเปลี่ยนแปลงใดจะสูญหาย

หนึ่ง commit ควรแทนหนึ่ง logical change เช่น feature, bug fix
หรือ housekeeping ที่มีขอบเขตชัดเจน และห้ามรวม unrelated changes
เข้า commit เดียวกันหากสามารถแยกได้อย่างสมเหตุสมผล

Baseline ก่อนเริ่ม Codex development คือ:

    commit 3fc6ce0
    Initial baseline before Codex development

ให้ใช้ commit นี้เป็นจุดอ้างอิงประวัติเริ่มต้นของโปรเจกต์
แต่ห้าม reset กลับไปยัง baseline โดยอัตโนมัติ

Git เป็น version-control safety mechanism
ไม่ใช่สิทธิในการแก้ ลบ หรือย้อนข้อมูลของผู้ใช้โดยอัตโนมัติ

ก่อนแก้ไขแต่ละงาน ให้ดำเนินการตามลำดับ:

## Step 1 — Understand

อ่านคำขอของผู้ใช้และระบุ expected behavior

## Step 2 — Inspect

ตรวจ source/config/rules/tests ที่เกี่ยวข้อง

## Step 3 — Identify Impact

ระบุ:

- files ที่เกี่ยวข้อง
- functions ที่เกี่ยวข้อง
- collections ที่เกี่ยวข้อง
- roles ที่เกี่ยวข้อง
- Rules ที่เกี่ยวข้อง

## Step 4 — Plan

เสนอหรือกำหนด minimal change ที่แก้ปัญหาได้

## Step 5 — Modify

แก้เฉพาะส่วนที่จำเป็น

## Step 6 — Verify

ตรวจ:

- syntax
- duplicate handlers
- regressions
- permissions
- Firestore query behavior
- tests ที่เกี่ยวข้อง

## Step 7 — Report

สรุป:

- ไฟล์ที่แก้
- ส่วนที่แก้
- เหตุผล
- ผลการทดสอบ
- known limitations
- สิ่งที่ยังไม่ได้ทำ

---

# 17. Deployment Protocol

การแก้ code และการ deploy เป็นคนละขั้นตอน

หลังแก้ code เสร็จ:

1. ตรวจ changes
2. รัน tests ที่เกี่ยวข้อง
3. รายงานผลแก่ผู้ใช้
4. รอคำสั่ง deploy

ห้าม deploy อัตโนมัติ

ก่อน deploy ต้อง:

1. ยืนยัน Firebase project ID
2. ยืนยัน Hosting source
3. ยืนยัน files/rules ที่จะ deploy
4. แจ้งผู้ใช้ว่าจะ deploy อะไร
5. ได้รับอนุญาตจากผู้ใช้

จากนั้นจึง deploy

ห้ามใช้ deploy เป็นวิธีทดสอบ code

---

# 18. Known Risks / Technical Debt

ข้อสังเกตจาก source ปัจจุบัน:

## 18.1 Large Single-File Application

production application รวม HTML, CSS และ JavaScript
ไว้ใน public/index.html ขนาดใหญ่

ทำให้การแก้ไขต้องระวัง regression

อย่า refactor เป็นหลายไฟล์โดยอัตโนมัติ

## 18.2 Test Target Mismatch

app structure test ตรวจ UX prototype
แทน production Hosting page

## 18.3 Role Vocabulary Mismatch

พบ:

    viewer

ใน UI บางส่วน

แต่:

    user

ปรากฏใน Rules/tests

ต้องตรวจเพิ่มเติมก่อนแก้

## 18.4 Firebase Project Mismatch

พบ:

    demo-land-km

ใน .firebaserc

และ:

    land-km-gpt

ใน client configuration

ต้องยืนยันก่อน deploy

## 18.5 Usage Aggregate Permissions

usageAggregates มี permission behavior
ที่ควรตรวจเพิ่มเติมก่อนใช้งานสถิติใน production เป็นข้อมูลสำคัญ

ห้ามเปลี่ยน Rules อัตโนมัติ

## 18.6 Comments / Answers Permissions

update permissions บางกรณีสำหรับ admin
อาจกว้างกว่ากิ่ง reviewer/owner

ให้ถือเป็น observation
ไม่ใช่คำสั่งให้แก้

## 18.7 Version History Atomicity

บาง workflow อาจเขียนเนื้อหาและ version history
แยกหลาย operation

อาจมีความเสี่ยงเกิด partial update
หาก operation หนึ่งสำเร็จและอีก operation ล้มเหลว

ห้ามเปลี่ยนเป็น transaction/batch โดยอัตโนมัติ
จนกว่าจะวิเคราะห์ behavior ปัจจุบัน

## 18.8 Firestore Scale

ข้อมูลหลายส่วนอ่านจาก client โดยตรง

พบ pagination ชัดเจนสำหรับ contents
แต่ collections อื่นควรประเมิน:

- pagination
- query cost
- Firestore indexes
- document reads

เมื่อข้อมูลจริงเพิ่มขึ้น

## 18.9 Dependency Versioning

package.json บาง dependency ใช้:

    latest

package-lock.json เป็นตัวระบุ dependency versions
ที่ติดตั้งจริงใน environment ปัจจุบัน

ห้าม upgrade dependencies อัตโนมัติ

---

# 19. Conflict Handling

หากพบความขัดแย้งระหว่าง:

- AGENTS.md
- public/index.html
- firestore.rules
- firebase.json
- .firebaserc
- tests
- runtime behavior

ห้ามเดา

ให้:

1. ระบุข้อมูลที่ขัดแย้ง
2. ระบุไฟล์/ส่วนที่เกี่ยวข้อง
3. อธิบายผลกระทบ
4. ระงับเฉพาะการเปลี่ยนแปลงที่ต้องอาศัยข้อสรุปนั้น
5. ขอคำยืนยันจากผู้ใช้หากจำเป็น

อย่าหยุดงานส่วนอื่นที่สามารถดำเนินการได้อย่างปลอดภัย

---

# 20. Source of Truth

สำหรับ behavior ของ application ปัจจุบัน
ให้ตรวจ source/configuration จริงก่อนเสมอ

ลำดับหลักฐานขึ้นอยู่กับประเภทของคำถาม

สำหรับ Hosting source:

    firebase.json
    → public/index.html

สำหรับ authorization:

    firestore.rules
    → authentication/profile data assumptions
    → UI

สำหรับ Firebase project/deployment:

    Firebase CLI state
    → .firebaserc
    → firebase.json
    → client firebaseConfig

สำหรับ application behavior:

    public/index.html
    → related configuration
    → relevant tests

Tests ใช้ยืนยัน behavior ที่ tests ครอบคลุมเท่านั้น

ห้ามถือว่า test ครอบคลุม production behavior
หาก test ใช้ source คนละไฟล์

---

# 21. Agent Operating Rules

เมื่อ Codex หรือ AI agent ทำงานในโปรเจกต์นี้:

- อ่าน AGENTS.md ก่อนเริ่มงาน
- ตรวจไฟล์จริงก่อนเสนอการแก้ไข
- อย่าเดา architecture
- อย่าเปลี่ยน architecture เพื่อความสะดวก
- อย่าแก้ technical debt ที่ไม่เกี่ยวข้องกับงาน
- อย่า deploy โดยไม่ได้รับอนุญาต
- อย่าเปลี่ยน Firebase project
- อย่าลบ production data
- อย่า rename schema
- อย่าเปลี่ยน roles/status โดยพลการ
- ใช้ minimal change
- รักษา backward compatibility เท่าที่ทำได้
- รัน tests ที่เกี่ยวข้องเมื่อทำได้
- รายงานสิ่งที่เปลี่ยนทุกครั้ง

หากคำสั่งของผู้ใช้ขัดกับ AGENTS.md
ให้ปฏิบัติตามคำสั่งล่าสุดที่ชัดเจนของผู้ใช้
แต่ต้องแจ้งความเสี่ยงก่อนดำเนินการ
หากการเปลี่ยนแปลงนั้นอาจกระทบ production,
security, data integrity หรือ deployment

---

# 22. Current Baseline

AGENTS.md ฉบับนี้อธิบาย baseline
จาก source/configuration ที่ตรวจพบ ณ เวลาที่สร้างเอกสาร

เอกสารนี้ไม่ใช่หลักฐานว่าสถานะ Firebase production
ตรงกับ source ในเครื่องทุกประการ

หากมีการเปลี่ยน architecture, schema, role,
workflow หรือ deployment configuration อย่างมีนัยสำคัญ
ควรปรับ AGENTS.md ให้ตรงกับระบบใหม่

ห้ามอัปเดต AGENTS.md เพื่อให้ตรงกับการเปลี่ยนแปลง
ที่ agent สร้างขึ้นเองโดยไม่ได้รับอนุญาต
