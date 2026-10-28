# 02. Kiến trúc

## 1. Tổng quan

```
Trình duyệt ──► Cloudflare Worker (một origin)
                 ├─ /api/*     → Hono app (apps/api)   ──► D1 (SQL)   ──► KV (giỏ khách, đếm tần suất)
                 ├─ ảnh tải lên → Worker ký và gửi lên Cloudinary (trình duyệt tải thẳng từ CDN)
                 └─ còn lại    → [assets] apps/web/dist (SPA, fallback về index.html)
Cron Trigger (hằng giờ) ──► scheduled handler (hết hạn đơn, dọn dẹp)
```

Một Worker phục vụ cả frontend lẫn API nên **cùng origin**: không cần CORS, cookie `SameSite=Lax` dùng được.

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Web | React 19, Vite 6, Tailwind 4, shadcn/ui | Giao diện |
| API | Hono 4 trên Cloudflare Workers | Toàn bộ logic nghiệp vụ |
| D1 | SQLite của Cloudflare | Dữ liệu chính |
| KV (`CART`) | Cloudflare KV | Giỏ hàng khách vãng lai; bộ đếm giới hạn tần suất. **Không** dùng cho phiên đăng nhập hay kho (KV chỉ nhất quán cuối cùng) |
| Cloudinary | Dịch vụ ảnh ngoài (HTTP API) | Ảnh admin tải lên; thay cho R2 (xem README mục 4) |
| Cron | Workers Cron Trigger | Việc định kỳ |

Thư viện thêm cho API: `zod` (kiểm tra đầu vào), `@hono/zod-validator`, `nanoid` (id ngẫu nhiên). Kiểm thử: `vitest` + `@cloudflare/vitest-pool-workers`.

## 2. Cấu trúc thư mục đích

```
apps/api/
  migrations/                 # 0001_catalog.sql, 0002_auth.sql, 0003_orders.sql (chép từ docs/sql/)
  seed/seed-catalog.sql       # chép từ docs/sql/seed-catalog.sql
  src/
    index.ts                  # tạo app, gắn middleware chung, mount route; export { fetch, scheduled }
    env.ts                    # kiểu Bindings, Variables của Hono
    middleware/
      session.ts              # đọc cookie, nạp user vào context (không bắt buộc)
      auth.ts                 # requireAuth, requireAdmin
      rate-limit.ts           # giới hạn tần suất theo khóa
      errors.ts               # onError, AppError, định dạng lỗi chuẩn
    routes/
      catalog.ts              # /api/categories, /api/products, /api/settings/public, /api/pickup-slots
      cart.ts                 # /api/cart/*
      auth.ts                 # /api/auth/*
      orders.ts               # POST /api/orders (công khai)
      track.ts                # GET /api/track/:code
      account.ts              # /api/account/* (hồ sơ, mật khẩu, đơn của tôi: /api/account/orders/*)
      media.ts                # GET /media/*
      admin/
        index.ts              # gắn requireAdmin, mount các route con
        products.ts  media.ts  orders.ts  users.ts  settings.ts  stats.ts
    services/                 # logic nghiệp vụ, không phụ thuộc Hono; dễ test
      catalog.ts              # đọc sản phẩm + tùy chọn, tình trạng xe
      pricing.ts              # normalizePicks, lineId, tính đơn giá và tổng
      cart.ts                 # đọc/ghi giỏ (KV hoặc D1), gộp giỏ
      slots.ts                # tính khung giờ nhận còn trống
      orders.ts               # tạo đơn, đổi trạng thái, hủy, hết hạn, thu tiền
      claim.ts                # gắn đơn theo SĐT khi đăng ký
      masking.ts              # che tên/SĐT/email
      auth.ts                 # đăng ký, đăng nhập, phiên
    lib/
      password.ts             # PBKDF2
      ids.ts                  # nanoid, mã đơn, chuẩn hóa mã đơn
      phone.ts                # chuẩn hóa SĐT, email
      time.ts                 # đổi giờ Asia/Ho_Chi_Minh <-> epoch
      validate.ts             # các schema zod dùng chung
  test/                       # vitest
  wrangler.toml
```

Quy tắc phân lớp:
- **Route** chỉ: kiểm tra đầu vào (zod) → gọi service → trả JSON. Không có SQL tính toán nghiệp vụ trong route.
- **Service** nhận `db`/`env` và tham số thuần, trả dữ liệu hoặc ném `AppError`. Không import `hono`.
- **lib** là hàm thuần, không đụng I/O.

## 3. Cấu hình Cloudflare

`apps/api/wrangler.toml` cần có (phần đang có giữ nguyên, thêm phần mới):

```toml
name = "store"
main = "src/index.ts"
compatibility_date = "2025-01-01"
# Bật khi cần API Node (nếu dùng nanoid thì không cần)
# compatibility_flags = ["nodejs_compat"]

[assets]
directory = "../web/dist"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "store-db"
database_id = "<id thật>"
migrations_dir = "migrations"          # THÊM: để dùng wrangler d1 migrations

[[kv_namespaces]]
binding = "CART"
id = "<id thật>"

[triggers]                              # THÊM
crons = ["0 * * * *"]                   # hằng giờ, phút 0
```

Ảnh tải lên lưu ở Cloudinary (đã thay R2): đặt `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET` bằng `wrangler secret bulk` (xem README mục 5).

Kiểu Bindings (`src/env.ts`):

```ts
export type Bindings = { DB: D1Database; CART: KVNamespace; CLOUD_NAME: string; CLOUD_API_KEY: string; CLOUD_API_SECRET: string }
export type Variables = { user: SessionUser | null }   // do middleware session nạp
export type AppEnv = { Bindings: Bindings; Variables: Variables }
// SessionUser = { id: string; phone: string; name: string; email: string | null; role: 'customer' | 'admin' }
```

Biến bí mật: hiện **không cần** bí mật nào (phiên là token ngẫu nhiên lưu D1). Nếu sau này thêm email/SMS thì dùng `wrangler secret put`.

## 4. Xử lý lỗi và định dạng phản hồi

Mọi lỗi trả cùng một dạng, kèm mã HTTP đúng:

```json
{ "error": { "code": "validation_failed", "message": "Dữ liệu không hợp lệ", "fields": { "phone": "Số điện thoại không hợp lệ" } } }
```

- `AppError(status, code, message, fields?)` là lớp lỗi duy nhất ném ra từ service.
- `app.onError` chuyển `AppError` thành phản hồi trên; lỗi lạ (không phải `AppError`) trả `500` với `code = internal_error` và thông điệp chung, **chi tiết chỉ ghi log** (không có dữ liệu cá nhân).
- Danh sách mã lỗi: [04-api-spec.md](04-api-spec.md) mục 2.
- Kiểm tra đầu vào dùng `@hono/zod-validator`; lỗi zod được chuyển thành `validation_failed` với `fields`.

## 5. Quy ước dữ liệu và code

| Chủ đề | Quy ước |
|---|---|
| Tiền | `INTEGER` VND. Trong JSON là number (tối đa vài trăm tỷ, an toàn trong số nguyên 53 bit) |
| Thời gian | CSDL: epoch **giây**. JSON: epoch **giây** (`createdAt`, `pickupAt`...), không dùng chuỗi ISO, để tránh nhầm múi giờ. Frontend định dạng sang giờ Việt Nam |
| Múi giờ showroom | `Asia/Ho_Chi_Minh` = UTC+7 cố định. `lib/time.ts` đổi `"2026-11-03" + "09:00"` sang epoch bằng cách trừ 7 giờ |
| Id | Bảng lộ ra ngoài (`users`, `orders`): `nanoid(21)`. Bảng nội bộ: số tự tăng. `products.id` giữ số để tương thích giỏ hàng |
| JSON trong cột | `picks`, `options` của `order_items`, `settings.value`, `audit_log.detail`. Luôn parse bằng hàm có try/catch và schema |
| SQL | Luôn dùng tham số `?`, không nối chuỗi. Truy vấn nhiều dòng liên quan dùng `db.batch()` |
| Đặt tên | JSON dùng camelCase; cột SQL dùng snake_case; service chịu trách nhiệm chuyển đổi |
| Ghi nhiều bảng | Luôn `db.batch([...])`. D1 không có giao dịch qua nhiều request |

### Nguyên tắc `db.batch()` trong D1

- Cả lô là **một giao dịch**: nếu một câu lệnh lỗi thì **toàn bộ lô bị hoàn tác**.
- Vì vậy các bất biến quan trọng được đặt bằng `CHECK`/`UNIQUE` trong CSDL (`stock >= 0`, `paid_total <= total`, `code UNIQUE`), và để vi phạm làm hỏng cả lô, thay vì kiểm tra ở mã rồi mới ghi.
- Service bắt lỗi từ `batch` và đổi thành `AppError` tương ứng (ví dụ lỗi `CHECK constraint failed: stock` thành `out_of_stock`).
- **Việc này phải được chứng minh bằng test tích hợp chạy trên D1 giả lập** (xem G2 trong [07-implementation-plan.md](07-implementation-plan.md)), không dựa vào phỏng đoán.

## 6. Middleware

Thứ tự gắn trong `index.ts`:

1. `errors` (`onError`), `secureHeaders` của Hono (`X-Content-Type-Options`, `Referrer-Policy`...).
2. `session`: nếu có cookie `sid` hợp lệ thì nạp `c.var.user`, không thì `null`. Gia hạn phiên theo [05-security.md](05-security.md) mục 2. Chạy cho mọi `/api/*`.
3. Với từng route cần thiết: `rateLimit(name, limit, windowSec)`, `requireAuth`, `requireAdmin`.
4. Với mọi route **ghi** (`POST/PUT/PATCH/DELETE`) trừ upload: bắt buộc `Content-Type: application/json` (một lớp phòng CSRF, xem [05-security.md](05-security.md) mục 4).

`requireAdmin` kiểm tra `user.role === 'admin'`; trả `401` nếu chưa đăng nhập, `403` nếu không phải admin.

## 7. Việc định kỳ (Cron)

`export default { fetch: app.fetch, scheduled }`. Mỗi giờ `scheduled` chạy:

| Việc | Cách làm |
|---|---|
| Hết hạn đơn | Với mỗi đơn `status='pending' AND hold_expires_at < now`: một `batch` gồm `UPDATE orders SET status='expired'`, thêm `order_events`, trả lại kho cho từng dòng có `product_id` và kho không NULL |
| Dọn phiên | `DELETE FROM sessions WHERE expires_at < now` |
| Dọn ảnh mồ côi | Ảnh trong `media` có `storage_key` không còn nằm trong `product_images` và `option_choices.media_id` quá 24 giờ thì xóa trên Cloudinary rồi xóa dòng |

Mỗi việc idempotent (chạy lại không gây hại) và có giới hạn số dòng mỗi lần (ví dụ 200).

## 8. Migration và môi trường

| Việc | Lệnh |
|---|---|
| Tạo migration | `npx wrangler d1 migrations create store-db <tên>` (hoặc chép từ `docs/sql/`) |
| Áp dụng local | `npx wrangler d1 migrations apply store-db --local` |
| Áp dụng remote | `npx wrangler d1 migrations apply store-db --remote` |
| Nạp seed | `npx wrangler d1 execute store-db --local --file=./seed/seed-catalog.sql` |
| Tạo admin đầu tiên | Đăng ký bình thường qua giao diện, rồi `npx wrangler d1 execute store-db --remote --command "UPDATE users SET role='admin' WHERE phone='0xxxxxxxxx'"` |

- Có hai môi trường: **local/dev** và **production**; nên thêm **staging** (một Worker + D1 + KV + R2 riêng, khai báo trong `wrangler.toml` bằng `[env.staging]`).
- **Chưa có dữ liệu thật** nên cho phép làm lại CSDL từ đầu: bỏ `schema.sql` và `seed.sql` cũ, thay bằng migration và seed mới. Lệnh `make db-init` được thay bằng `wrangler d1 migrations apply` + nạp seed.
- Không bao giờ sửa file migration đã áp dụng ở production; thêm migration mới.

## 9. Kiểm thử

- **Chạy:** `vitest` với `@cloudflare/vitest-pool-workers`, dùng D1/KV/R2 giả lập có hành vi giống thật (cần cho kiểm thử rollback của `batch`).
- **Cách tổ chức:** test service trực tiếp với DB giả lập, không cần dựng HTTP; test route chính qua `app.request(...)`.
- **Dữ liệu:** mỗi test file áp migration + seed vào DB giả lập sạch.
- **Bắt buộc có test:** giá, tạo đơn (nguyên tử, hết kho), tra cứu che dữ liệu, xác thực/phân quyền, gắn đơn theo SĐT, khung giờ nhận, chuyển trạng thái. Danh sách chi tiết ở từng giai đoạn trong [07-implementation-plan.md](07-implementation-plan.md).
- **Kiểm thử giao diện:** thao tác thật trên trình duyệt (Chrome headless qua DevTools Protocol hoặc Playwright) cho luồng đặt xe, tra cứu, admin. Lưu ý mục 6 của [README](README.md) về cuộn mượt.

## 10. Những quyết định kiến trúc đã chọn (và lý do)

| Quyết định | Lý do | Phương án đã bỏ |
|---|---|---|
| Phiên là **token ngẫu nhiên lưu D1** (hash SHA-256), không phải JWT | Thu hồi tức thì khi khóa tài khoản hoặc đổi mật khẩu, có thể liệt kê phiên | JWT: khó thu hồi |
| Giỏ khách ở **KV**, giỏ tài khoản ở **D1** | Giữ hợp đồng hiện tại không đổi; KV rẻ cho dữ liệu tạm | Mọi giỏ vào D1: bắt buộc cấp danh tính cho khách |
| Tùy chọn là **bảng thật**, không còn cột JSON | Admin sửa được, ảnh riêng từng lựa chọn, ràng buộc toàn vẹn | Giữ JSON: không gắn được ảnh, khó validate |
| Ràng buộc tồn kho/thanh toán đặt ở **`CHECK` của CSDL** | Vi phạm làm hỏng cả `batch`, không thể quên kiểm tra ở mã | Kiểm tra bằng `if` trước khi ghi: có khe hở khi hai người đặt cùng lúc |
| Một Worker phục vụ cả web và API | Cùng origin, không CORS, cookie đơn giản | Tách hai dịch vụ |
| Ảnh lưu ở Cloudinary (thay R2) | Có CDN và biến đổi ảnh sẵn; R2 phải bật riêng trên tài khoản | R2 + route `/media/*` (đã làm rồi bỏ) |
