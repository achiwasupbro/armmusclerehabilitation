# 🔥 Firebase Setup สำหรับ iOS - คำแนะนำด่วน

## ขั้นตอนที่ 1: สร้าง Firebase Project
1. ไปที่ https://console.firebase.google.com/
2. คลิก **"Create a project"**
3. ตั้งชื่อ: `arm-rehabilitation` (หรือชื่อที่ต้องการ)
4. คลิก **Continue** → **Continue** → **Create project**

## ขั้นตอนที่ 2: ตั้งค่า Realtime Database
1. ในเมนูซ้าย คลิก **"Build"** → **"Realtime Database"**
2. คลิก **"Create Database"**
3. เลือก **Location**: `asia-southeast1 (Singapore)`
4. เลือก **"Start in test mode"**
5. คลิก **"Enable"**

## ขั้นตอนที่ 3: ตั้งค่า Security Rules (ทดสอบ)
1. ใน Realtime Database หน้า **"Rules"**
2. แทนที่ code ด้วย:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
3. คลิก **"Publish"**

## ขั้นตอนที่ 4: เพิ่ม Web App
1. ไปที่ **Project Settings** (เฟือง ⚙️ ด้านบน)
2. เลื่อนลงหา **"Your apps"**
3. คลิก **Web icon** `</>`
4. ตั้งชื่อ: `arm-rehab-web`
5. **ไม่ต้องเช็ค** "Also set up Firebase Hosting"
6. คลิก **"Register app"**

## ขั้นตอนที่ 5: คัดลอก Config
หลังจากสร้าง Web App จะได้ config แบบนี้:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "arm-rehabilitation-xxxxx.firebaseapp.com",
  databaseURL: "https://arm-rehabilitation-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "arm-rehabilitation-xxxxx",
  storageBucket: "arm-rehabilitation-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxxxx"
};
```

## ขั้นตอนที่ 6: อัปเดตไฟล์ในโปรเจค

### 6.1 แก้ไข `firebase-config.js`
เปิดไฟล์ `armmusclerehabilitation/firebase-config.js` และแทนที่:

```javascript
const firebaseConfig = {
    // วาง config ที่คัดลอกมาจากขั้นตอนที่ 5 ตรงนี้
    apiKey: "your-api-key-here",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
};
```

### 6.2 แก้ไข `wee.ino` (ESP32)
เปิดไฟล์ `wee.ino` และแก้บรรทัดนี้:

```cpp
// เปลี่ยนจาก
const char* firebaseHost = "https://your-project-default-rtdb.firebaseio.com";

// เป็น (ใช้ URL จาก databaseURL ในขั้นตอนที่ 5)
const char* firebaseHost = "https://arm-rehabilitation-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app";
```

และ:
```cpp
// เปลี่ยน Device ID เป็นค่าที่ไม่ซ้ำ
const char* deviceId = "esp32_001"; // หรือใช้ MAC address
```

## ขั้นตอนที่ 7: ทดสอบ
1. **Upload** `wee.ino` ไปที่ ESP32
2. เปิด **Serial Monitor** ดูว่า ESP32 เชื่อมต่อ WiFi และ Firebase ได้หรือไม่
3. เปิดเว็บใน **iOS Safari**
4. คลิก **"เลือกวิธีการเชื่อมต่อ"** → เลือก **"Firebase Mode"**
5. คลิก **"เชื่อมต่อ Firebase"**
6. ทดสอบส่งโหมดต่างๆ

## ขั้นตอนที่ 8: ตรวจสอบข้อมูล
ใน Firebase Console → Realtime Database → Data จะเห็นข้อมูล:

```
arm-rehabilitation-xxxxx-default-rtdb
├── commands/
│   └── esp32_001/
│       └── currentMode/
│           ├── mode: 1
│           ├── arm: "right"
│           ├── timestamp: 1234567890
│           └status: "completed"
└── devices/
    └── esp32_001/
        └── progress/
            ├── mode: 1
            ├── round: 5
            ├── totalRounds: 20
            └── isRunning: true
```

## 🚨 การแก้ปัญหา

### ถ้า Firebase เชื่อมต่อไม่ได้:
1. ตรวจสอบ `databaseURL` ใน config ให้ถูกต้อง
2. ตรวจสอบ Security Rules ว่าเป็น `".read": true, ".write": true`
3. ดู Console ใน browser (F12) หาข้อผิดพลาด

### ถ้า ESP32 เชื่อมต่อไม่ได้:
1. ตรวจสอบ WiFi ของ ESP32
2. ตรวจสอบ `firebaseHost` ใน `wee.ino`
3. ดู Serial Monitor หาข้อผิดพลาด

### ถ้า iOS ไม่ทำงาน:
1. ใช้ **Safari** (ไม่ใช่ Chrome)
2. อนุญาต microphone ใน Settings → Safari
3. ลองรีเฟรชหน้าเว็บ

## ✅ เสร็จแล้ว!
หลังจากทำตามขั้นตอนนี้ iOS จะสามารถควบคุม ESP32 ผ่าน Firebase ได้แล้ว! 🎉