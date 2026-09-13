# NK Master Admin Control Center (ศูนย์ควบคุมระบบ NK Helper จากระยะไกล)

เว็บแอปพลิเคชันสำหรับ **ผู้สร้างระบบเท่านั้น** ทำหน้าที่เป็นศูนย์ควบคุมโปรแกรม NK Desktop จากระยะไกล:
- 🔒 **รหัสผ่านส่วนตัวของผู้สร้าง (Independent Master Credentials):** แยกขาดจากระบบ NK BackOffice อย่างสิ้นเชิง (แอดมินหรือคนอื่นในระบบ NK จะไม่สามารถล็อกอินเข้ามาหน้านี้ได้ เฉพาะผู้สร้างที่รู้รหัสเท่านั้น)
- 🔘 **Master Kill Switch:** สั่งเปิด/ปิดการใช้งานโปรแกรม NK Desktop ทั่วประเทศ (ล็อกหน้าจอทุกเครื่องทันที)
- 🚀 **Version & Force Update:** กำหนดเวอร์ชันล่าสุด สั่งบังคับอัปเดต และใส่ลิงก์ดาวน์โหลดตัวติดตั้งใหม่ (`.exe`)
- 📢 **Broadcast Announcement:** ส่งแถบข้อความประกาศด่วนขึ้นหน้าจอทุกเครื่อง
- 💻 **Live Active Clients:** ดูรายชื่อเครื่องที่กำลังออนไลน์, ผู้ใช้งาน, เว็บไซต์, และสถานะการทำงานแบบ Real-time
- 🔑 **ระบบเปลี่ยนรหัสผ่าน:** สามารถเปลี่ยน Username และ Password ของผู้ควบคุมได้ตลอดเวลาผ่านหน้าเว็บ Dashboard

---

## 🔑 บัญชีเข้าสู่ระบบเริ่มต้น (Default Master Login)
- **Username:** `admin`
- **Password:** `admin888`
*(เมื่อล็อกอินเข้าสู่ระบบแล้ว ท่านสามารถเลื่อนลงไปที่หัวข้อ "🔐 ความปลอดภัยและรหัสผ่านผู้ควบคุม" เพื่อตั้งรหัสผ่านใหม่ตามที่ท่านต้องการได้ทันที)*

---

## 🚀 ขั้นตอนการนำขึ้น GitHub และ Deploy บน Railway

### ขั้นตอนที่ 1: Push ขึ้น GitHub Repository ใหม่
1. ไปที่ [GitHub](https://github.com/new) แล้วสร้าง Repository ใหม่ (เช่น `nk-admin-server`)
2. เปิด Terminal ในโฟลเดอร์ `NK-Admin-Server` แล้วรันคำสั่ง:
```bash
cd d:\Project\NK\NK-Admin-Server
git add .
git commit -m "feat: NK master admin control center"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nk-admin-server.git
git push -u origin main
```

---

### ขั้นตอนที่ 2: Deploy ขึ้น Railway ใน 1 คลิก
1. เข้าสู่ระบบ [Railway.app](https://railway.app)
2. กดปุ่ม **+ New Project**
3. เลือก **Deploy from GitHub repo**
4. เลือก Repository `nk-admin-server` ที่เพิ่ง Push ขึ้นไป
5. Railway จะตรวจจับ Node.js และเริ่ม Build & Deploy ให้อัตโนมัติทันที
6. ไปที่แท็บ **Settings** ของโปรเจกต์ใน Railway ➔ เลื่อนลงไปที่ **Networking** ➔ กด **Generate Domain**
7. ท่านจะได้ URL เช่น `https://nk-admin-server-production.up.railway.app`

---

## ⚙️ การตั้งค่า Environment Variables บน Railway (Optional)
ในแท็บ **Variables** บน Railway ท่านสามารถตั้งค่ารหัสผ่านเริ่มต้นได้ตั้งแต่ตอน Deploy:
- `ADMIN_USERNAME`: ชื่อผู้ใช้ผู้ควบคุม (เช่น `myadmin`)
- `ADMIN_PASSWORD`: รหัสผ่านผู้ควบคุมที่ท่านตั้งเอง (เช่น `MySecretKey999!`)
- `SESSION_SECRET`: คีย์สุ่มสำหรับเข้ารหัสเซสชัน

---

## 🔌 API Endpoints
- `GET /api/app-control`: ข้อมูลสถานะระบบและการอัปเดต (สำหรับ NK Desktop ดึงไปประมวลผล)
- `POST /api/app-heartbeat`: ส่ง Heartbeat รายงานตัวจาก NK Desktop
- `POST /api/auth/login`: ล็อกอินด้วยรหัสผ่านผู้ควบคุมส่วนตัว
- `POST /api/admin/change-password`: เปลี่ยนรหัสผ่านผู้ควบคุม
- `GET /api/admin/config`: ดึงการตั้งค่าปัจจุบัน (ต้องล็อกอิน)
- `POST /api/admin/config`: บันทึกการตั้งค่าคำสั่ง (ต้องล็อกอิน)
- `GET /api/admin/clients`: รายชื่อเครื่องที่เชื่อมต่ออยู่ (ต้องล็อกอิน)
