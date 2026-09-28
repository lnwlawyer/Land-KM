# คู่มือทดสอบอัตโนมัติ Land KM — ขั้นที่ 11

ชุดทดสอบนี้ใช้ **Firebase Local Emulator Suite** ฐานข้อมูลทดสอบมี Project ID `demo-land-km` จึงไม่เขียนหรือแก้ข้อมูลในระบบจริง

## ไฟล์ที่ต้องอยู่ใน `C:\Land-KM`

- `public/index.html` (production application source สำหรับ App Structure Tests)
- `firestore.rules`
- `firebase.json`
- `.firebaserc`
- `package.json`
- โฟลเดอร์ `tests`

## เตรียมเครื่องครั้งแรก

1. ติดตั้ง Node.js รุ่น LTS และ Java JDK 21 หรือใหม่กว่า
2. เปิด PowerShell ที่โฟลเดอร์โครงการ

```powershell
cd C:\Land-KM
npm install
```

## รันทดสอบทั้งหมด

```powershell
npm test
```

ระบบจะเปิด Firestore Emulator ชั่วคราว รันทดสอบ แล้วปิด Emulator ให้อัตโนมัติ หากทุกข้อผ่านจะเห็นจำนวน `pass` และไม่มี `fail`

## คำสั่งแยกส่วน

ตรวจโครงสร้างหน้าเว็บโดยไม่เปิด Emulator:

```powershell
npm run test:app
```

ตรวจเฉพาะ Firestore Security Rules:

```powershell
npm run test:rules
```

## สิ่งที่ทดสอบ

- ผู้ไม่เข้าสู่ระบบและบัญชีที่ปิดใช้งานถูกปฏิเสธ
- ผู้ใช้งานอ่านเฉพาะเนื้อหาที่เผยแพร่
- ผู้เขียนเห็นและแก้เฉพาะงานของตนตาม Workflow
- ผู้ตรวจสอบอนุมัติได้โดยแก้เฉพาะฟิลด์ที่กำหนด
- ผู้ดูแลมีสิทธิบริหารระบบ
- Saved Items และ Learning Progress แยกตามบัญชี
- ความคิดเห็นต้องเข้าคิว `pending`
- Knowledge Gap จำกัดเฉพาะบทบาทที่กำหนด
- Usage Stats เพิ่มค่าครั้งละ 1 และผูกกับ UID
- Collection ที่ไม่ได้ประกาศใน Rules ถูกปฏิเสธ
- production source ไม่มีหมวดค้นหาที่เลือกไว้เป็นค่าเริ่มต้นหรือข้อความ event ตัวอย่างที่เลิกใช้แล้ว
- production source มี query limits, pagination และ references ของ core feature collections
- App Structure Tests อ่าน `public/index.html` โดยตรง ไม่ใช้ prototype/reference HTML แทน production

## ก่อน Deploy ทุกครั้ง

ให้รัน `npm test` ก่อน หากมี `fail` ห้าม Deploy จนกว่าจะแก้ไขและทดสอบผ่านทั้งหมด การรันทดสอบไม่ใช่คำสั่ง Deploy และไม่เปลี่ยนข้อมูล Production
