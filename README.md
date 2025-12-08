# 🤖 ระบบกายภาพบำบัดแขน - WebSocket Version

ระบบควบคุมหุ่นยนต์กายภาพบำบัดแขนผ่าน WebSocket - ใช้งานได้จากทุกที่ รองรับ iOS/Android/Desktop

**URL:** https://armmusclerehabilitation.onrender.com/

---

## 📋 ภาพรวม

ระบบนี้ใช้ **WebSocket Server** บน Render เป็นตัวกลางในการสื่อสารระหว่าง:
- **เว็บบราวเซอร์** (iOS/Android/Desktop)
- **บอร์ด ESP32** (ที่บ้าน)

### ข้อดี:
- ✅ ไม่ต้องค้นหา IP ของ ESP32
- ✅ ไม่ต้องตั้งค่า Static IP
- ✅ ใช้งานได้จากทุกที่ (มีแค่อินเทอร์เน็ต)
- ✅ รองรับ iOS/Android/Desktop
- ✅ Real-time communication
- ✅ ปลอดภัย (HTTPS/WSS)

---

## 🚀 วิธีใช้งาน (3 ขั้นตอน)

### ขั้นตอนที่ 1: ติดตั้ง Library ใน Arduino IDE

1. เปิด Arduino IDE
2. ไปที่ **Sketch → Include Library → Manage Libraries**
3. ค้นหา **"WebSockets"**
4. ติดตั้ง **"WebSockets by Markus Sattler"**

### ขั้นตอนที่ 2: อัปโหลดโค้ดไปยัง ESP32

1. เปิดไฟล์ **`wee_websocket_ssl/wee_websocket_ssl.ino`**
2. แก้ไข WiFi (ถ้าต้องการ):
   ```cpp
   const char* ssid = "ชื่อ-WiFi-ของคุณ";
   const char* password = "รหัสผ่าน-WiFi";
   ```
3. **URL ตั้งค่าไว้แล้ว** (ไม่ต้องแก้):
   ```cpp
   const char* websocket_server = "armmusclerehabilitation.onrender.com";
   const uint16_t websocket_port = 443;
   ```
4. อัปโหลดไปยัง ESP32

### ขั้นตอนที่ 3: เปิดเว็บและใช้งาน

เปิดเว็บบราวเซอร์ (iOS/Android/Desktop):
```
https://armmusclerehabilitation.onrender.com/
```

---

## 🎯 วิธีใช้งาน

1. **รอให้ ESP32 เชื่อมต่อ** (จะแสดงข้อความ "ESP32 เชื่อมต่อแล้ว")
2. **เลือกแขน** (ขวา/ซ้าย)
3. **เลือกโหมด** (1-5)
4. **ระบบจะทำงาน** และแสดง Progress แบบ Real-time

---

## 📊 โหมดทั้งหมด

| โหมด | คำอธิบาย |
|------|----------|
| **1** | หมุนเดินหน้าไปกลับ 20 รอบ |
| **2** | เลี้ยวซ้ายขวา 20 รอบ |
| **3** | ทุกอันหมุนเพิ่ม 20 รอบ |
| **4** | ทุกอันหมุนลด 20 รอบ |
| **5** | หยุดการทำงาน |

---

## 🎨 ฟีเจอร์

- ✅ **ควบคุมด้วยปุ่ม** - เลือกแขนและโหมด
- ✅ **ควบคุมด้วยเสียง** - สั่งงานด้วยคำพูด
- ✅ **ควบคุมด้วยกล้อง** - ตรวจจับนิ้วมือด้วย AI (MediaPipe)
- ✅ **สลับภาษา** - ไทย/อังกฤษ
- ✅ **แสดง Progress** - Real-time
- ✅ **รองรับ iOS** - ใช้งานได้เหมือน Android/Desktop

---

## 📁 โครงสร้างไฟล์

```
.
├── server.js                          # WebSocket Server (Node.js)
├── package.json                       # Dependencies
├── render.yaml                        # Render config
├── wee_websocket_ssl/
│   └── wee_websocket_ssl.ino         # โค้ด ESP32
└── armmusclerehabilitation/
    ├── index.html                     # หน้าเว็บหลัก
    ├── app.js                         # JavaScript หลัก (WebSocket)
    ├── handgesture.js                 # ตรวจจับนิ้วมือ
    ├── language.js                    # ระบบภาษา
    ├── style.css                      # CSS
    ├── manifest.json                  # PWA config
    └── *.wav                          # ไฟล์เสียง
```

---

## 🔧 การตรวจสอบ

### ตรวจสอบ ESP32:
1. เปิด **Serial Monitor** (115200 baud)
2. ดูข้อความ:
   ```
   ✅ เชื่อมต่อ WiFi สำเร็จ!
   🔌 กำลังเชื่อมต่อ WebSocket Server: armmusclerehabilitation.onrender.com:443
   ✅ WebSocket Connected
   ✅ ลงทะเบียนสำเร็จ
   ```

### ตรวจสอบเว็บ:
1. เปิด **Developer Console** (F12)
2. ดูข้อความ:
   ```
   🔌 กำลังเชื่อมต่อ WebSocket: wss://armmusclerehabilitation.onrender.com
   ✅ WebSocket เชื่อมต่อสำเร็จ
   ✅ ESP32 เชื่อมต่อแล้ว - พร้อมใช้งาน!
   ```

---

## ⚠️ หมายเหตุ

### Free Plan ของ Render:
- ✅ ใช้งานได้ฟรี
- ⚠️ Server จะ **Sleep หลัง 15 นาที** ที่ไม่มีการใช้งาน
- ⏱️ ครั้งแรกที่เปิดจะใช้เวลา **~30 วินาที** ในการ Wake up
- 💡 ถ้าต้องการให้ทำงานตลอด → อัปเกรดเป็น Paid Plan ($7/เดือน)

---

## 🐛 แก้ไขปัญหา

### ปัญหา: ESP32 เชื่อมต่อไม่ได้
**วิธีแก้:**
1. ตรวจสอบ WiFi (ต้องเชื่อมต่ออินเทอร์เน็ตได้)
2. ตรวจสอบ URL: `armmusclerehabilitation.onrender.com`
3. ตรวจสอบ Port: `443`
4. ตรวจสอบว่าติดตั้ง Library **WebSockets** แล้ว

### ปัญหา: เว็บเชื่อมต่อไม่ได้
**วิธีแก้:**
1. รอ ~30 วินาที (ถ้า Server กำลัง Wake up)
2. เปิด Console (F12) เพื่อดู Error
3. ลองรีเฟรชหน้าเว็บ

### ปัญหา: ส่งโหมดไม่ได้
**วิธีแก้:**
1. ตรวจสอบว่า ESP32 เชื่อมต่ออยู่ (ดูที่ Serial Monitor)
2. ตรวจสอบว่าเลือกแขนแล้ว
3. ตรวจสอบว่าเว็บแสดง "ESP32 เชื่อมต่อแล้ว"

---

## 📱 เพิ่มไปหน้าจอหลัก (iOS)

1. เปิดเว็บใน Safari
2. แตะปุ่ม **Share** (ไอคอนแชร์)
3. เลือก **"Add to Home Screen"**
4. ตั้งชื่อ: "กายภาพบำบัดแขน"
5. แตะ **"Add"**

✨ ตอนนี้สามารถเปิดจากหน้าจอหลักได้เหมือนแอป!

---

## 🔄 การ Deploy (สำหรับ Developer)

### Deploy บน Render:

1. Push โค้ดไป GitHub:
   ```bash
   git add .
   git commit -m "Update"
   git push
   ```

2. Render จะ Deploy อัตโนมัติ

### ตั้งค่า Render:
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment:** Node

---

## 📊 สถาปัตยกรรม

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│             │         │                  │         │             │
│  iOS/       │◄───────►│  Render          │◄───────►│  ESP32      │
│  Android/   │  WSS    │  WebSocket       │  WSS    │  Board      │
│  Desktop    │         │  Server          │         │             │
│             │         │  (24/7)          │         │             │
└─────────────┘         └──────────────────┘         └─────────────┘
     ทุกที่                   Cloud                    ที่บ้าน
```

---

## 📞 ติดต่อ

หากมีปัญหาหรือข้อสงสัย:
- ดู Serial Monitor ของ ESP32
- ดู Console ของ Browser (F12)
- ตรวจสอบว่า Server ทำงานอยู่: https://armmusclerehabilitation.onrender.com/

---

## 📄 License

MIT License - ใช้งานได้ฟรี

---

## 🎉 เสร็จแล้ว!

ตอนนี้คุณมีระบบที่:
- ✅ รันบน Cloud (Render) ตลอด 24/7
- ✅ ใช้งานได้จากทุกที่
- ✅ รองรับ iOS/Android/Desktop
- ✅ ไม่ต้องกังวลเรื่อง IP
- ✅ ปลอดภัย (HTTPS/WSS)
