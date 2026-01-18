# 🍗 WDP301 - Backend API Service

Đây là Backend Service cho hệ thống WDP301 (KFC Management System), được xây dựng bằng **NestJS**.

## 🛠 Tech Stack

- **Framework:** NestJS
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Authentication:** JWT (Access Token + Refresh Token Rotation)
- **Mail Service:** Resend API
- **Package Manager:** pnpm

---

## 🚀 Yêu cầu hệ thống (Prerequisites)

Trước khi bắt đầu, đảm bảo máy bạn đã cài đặt:

- [Node.js](https://nodejs.org/) (Phiên bản v18 trở lên)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) (Hoặc Docker container)

---

## 📦 Cài đặt & Setup (Installation)

### 1. Clone dự án

```bash
git clone https://github.com/jonny-tran/wdp301-api.git
cd wdp301-backend

```

### 2. Cài đặt dependencies

```bash
pnpm install

```

### 3. Cấu hình biến môi trường

Tạo file `.env` tại thư mục gốc và copy nội dung trong file env.example (sau đó sửa lại nội các key và nội dung cần thiết)

### 4. Setup Database (Drizzle ORM)

Đồng bộ Schema từ code xuống Database:

```bash
# Đẩy schema lên DB (Dev mode)
npx drizzle-kit push

# (Tùy chọn) Xem DB bằng giao diện UI
npx drizzle-kit studio

```

---

## ▶️ Chạy ứng dụng

```bash
# Chạy môi trường Development (Watch mode)
pnpm start:dev

# Chạy môi trường Production
pnpm build
pnpm start

```

Sau khi chạy thành công, truy cập Swagger Documentation tại:
👉 **http://localhost:8080/wdp301-api/docs**

---

## 🔐 Auth Flow (Lưu ý cho Frontend Dev)

Hệ thống sử dụng cơ chế **Refresh Token Rotation** để bảo mật cao nhất:

1. **Login:** Nhận về `accessToken` (15p) và `refreshToken` (7d).
2. **Request:** Dùng `accessToken` ở Header `Authorization: Bearer ...`.
3. **Token Expired:** Khi `accessToken` hết hạn (401), gọi API `/auth/refresh` với `refreshToken` hiện tại.
4. **Rotation:** API Refresh sẽ trả về cặp token MỚI. **Lưu ý:** `refreshToken` cũ sẽ bị hủy ngay lập tức. Nếu dùng lại cái cũ sẽ bị lỗi và logout.
5. **Logout:** Gọi API `/auth/logout` để hủy token trên Server.

---

## 📂 Cấu trúc thư mục (Project Structure)

```
src/
├── common/             # Các module dùng chung (Mail, Utils, Filters...)
├── database/           # Cấu hình DB, Schema, Migrations
├── modules/            # Các feature modules chính
│   ├── auth/           # Login, Register, Refresh Token...
│   ├── users/          # User management
│   └── ...
├── main.ts             # Entry point
└── app.module.ts       # Root module

```

---

## ⚠️ Common Errors (Lỗi thường gặp)

**1. Lỗi kết nối DB (`ECONNREFUSED`)**

> Kiểm tra xem PostgreSQL đã chạy chưa? Chuỗi `DATABASE_URL` trong `.env` đã đúng user/pass chưa?

**2. Lỗi gửi mail Resend (`403 Forbidden`)**

> Nếu dùng gói Free và chưa verify domain, bạn chỉ gửi được email đến **chính địa chỉ email đăng ký tài khoản Resend**. Gửi cho email khác sẽ bị chặn.

**3. Lỗi Auth (`401 Unauthorized` liên tục)**

> Kiểm tra lại `JWT_SECRET` trong `.env`. Nếu thay đổi secret, toàn bộ token cũ sẽ không dùng được nữa.

---

**Happy Coding! 🚀**
