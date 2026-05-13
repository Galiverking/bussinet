# 🚚 Logis Master

<p align="center">
  <img src="https://img.shields.io/badge/Version-2026.05-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/Supabase-Enabled-green.svg" alt="Supabase">
  <img src="https://img.shields.io/badge/License-Private-red.svg" alt="License">
</p>

> Smart Logistic Planner Pro — เครื่องมือจัดการงานขนส่งและบริการนอกสถานที่ส่วนตัว

## ✨ ฟีเจอร์เด่น

- 📋 **จัดการงาน** — เพิ่ม แก้ไข ลบ และติดตามสถานะงานขนส่ง
- 📊 **Dashboard KPI** — มองเห็นภาพรวมงานที่ค้าง งานเสร็จ ยอดรายจ่าย และจำนวนล้อ
- 💸 **บัญชีรายจ่าย** — บันทึกและติดตามค่าใช้จ่ายประจำวัน
- 📍 **GPS Location** — บันทึกพิกัดหรือลิงก์ Google Maps
- 🤖 **AI Queue Parser** — วิเคราะห์ข้อความจากแชทและจัดคิวอัตโนมัติ
- 🌙 **Dark/Light Mode** — รองรับการเปลี่ยนธีมตามความชอบ
- 📦 **Backup & Restore** — ส่งออก/นำเข้าข้อมูล CSV และ JSON
- 📱 **Mobile Ready** — ออกแบบรองรับมือถือ PWA-ready

## 🛠️ เทคโนโลยี

| Frontend | Backend | Deploy |
|----------|---------|--------|
| HTML5 + CSS3 | Supabase (PostgreSQL) | Vercel |
| Tailwind CSS | Supabase Auth | |
| Vanilla JavaScript | | |

## 🚀 การติดตั้ง

### 1. ตั้งค่า Supabase

1. สร้าง Project ใหม่ที่ [supabase.com](https://supabase.com)
2. เปิด **SQL Editor** และรันโค้ดจาก `supabase-schema.sql.txt`
3. ไปที่ **Project Settings → API**
4. คัดลอก `SUPABASE_URL` และ `SUPABASE_ANON_KEY`

### 2. กำหนดค่าในโค้ด

เปิดไฟล์ `js/app.js` และแก้ไขค่า:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'
```

### 3. Deploy ขึ้น Vercel

```bash
# ติดตั้ง Vercel CLI
npm i -g vercel

# Deploy
vercel
```

หรือเพียงแค่เชื่อมต่อ GitHub repo กับ Vercel

## 📖 การใช้งาน

### เพิ่มงานใหม่
กดปุ่ม **"+ เพิ่มงาน"** และกรอกข้อมูล:
- ชื่อลูกค้า
- เบอร์โทร
- พิกัด/ที่อยู่
- ราคา
- จำนวนล้อ

### วางข้อความจากแชท
กดปุ่ม **"วางข้อความ"** เพื่อวิเคราะห์ข้อความหลายงาน
- คั่นงานด้วย `---` หรือบรรทัดว่าง 2 บรรทัด

### จัดคิวอัตโนมัติ
กดปุ่ม **"🤖 จัดคิวอัตโนมัติ"** เพื่อวิเคราะห์ลำดับสถานที่

### สถานะงาน
| สถานะ | คำอธิบาย |
|-------|----------|
| ⏳ ค้างอยู่ | รอดำเนินการ |
| ✅ เสร็จแล้ว | งานเสร็จสมบูรณ์ |
| ⏰ เลื่อนนัด | เลื่อนไปวันอื่น |

## 📁 โครงสร้างโปรเจค

```
bussinnet/
├── index.html          # หน้าหลัก
├── css/
│   └── style.css       # Styles กำหนดเอง
├── js/
│   └── app.js          # Application logic
├── supabase-schema.sql.txt  # Database schema
├── vercel.json         # Vercel config
├── deploy.sh           # Deploy script (Linux/Mac)
└── deploy.ps1          # Deploy script (Windows)
```

## 📄 License

สำหรับการใช้งานส่วนตัวเท่านั้น — ห้ามนำไปใช้งานหรือแจกจ่ายโดยไม่ได้รับอนุญาต

---

<p align="center">Made with ❤️ for Logistic Professionals</p>