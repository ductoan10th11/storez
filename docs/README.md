# Speed Showroom: bộ tài liệu thiết kế backend

| | |
|---|---|
| Trạng thái | Đã duyệt thiết kế. **Backend đã triển khai xong G0 đến G5** (kèm 187 test tự động); chưa làm G6 (staging, CSP, vận hành). Frontend đã làm xong các trang cho G2 đến G5 (đặt xe, tra cứu, tài khoản, quản trị); chưa có test tự động cho giao diện |
| Đối tượng đọc | Lập trình viên (hoặc phiên làm việc AI) sẽ triển khai. Tài liệu viết để đọc độc lập, không cần ngữ cảnh nào khác |
| Ngôn ngữ giao diện | Tiếng Việt |

## 1. Dự án là gì

Cửa hàng trực tuyến của một showroom bán **phương tiện**: xe máy, ô tô, máy bay, trực thăng, xe tăng. Khách chọn xe, chọn màu và phiên bản, **đặt giữ xe và hẹn ngày đến showroom nhận xe**. Không có giao hàng, không có phí vận chuyển, thanh toán trực tiếp tại showroom.

Bán xe là bán hàng giá trị cao: khách cần được tư vấn và cần biết đơn của mình đang ở đâu. Vì vậy đặt hàng **không bắt buộc tài khoản**, có mã đơn để tra cứu, và showroom có công cụ quản lý đơn theo lịch nhận xe.

## 2. Đọc theo thứ tự

| # | Tài liệu | Nội dung | Đọc khi |
|---|---|---|---|
| 1 | [01-requirements.md](01-requirements.md) | Yêu cầu nghiệp vụ, vai trò, quy tắc, vòng đời đơn, phạm vi | Bắt đầu, để hiểu **vì sao** |
| 2 | [02-architecture.md](02-architecture.md) | Kiến trúc, cấu trúc thư mục, cấu hình Cloudflare, quy ước code | Trước khi viết code |
| 3 | [03-data-model.md](03-data-model.md) | Mô hình dữ liệu, ERD, quy tắc toàn vẹn, thuật toán tạo đơn | Khi làm migration và service |
| 4 | [04-api-spec.md](04-api-spec.md) | Đặc tả toàn bộ API: yêu cầu, phản hồi, mã lỗi | Khi làm route và frontend gọi API |
| 5 | [05-security.md](05-security.md) | Phiên đăng nhập, mật khẩu, giới hạn tần suất, che dữ liệu, tải ảnh | Khi làm auth, tra cứu, tải ảnh |
| 6 | [06-frontend-spec.md](06-frontend-spec.md) | Hiện trạng frontend, danh sách trang, thành phần, hướng chuyển đổi | Khi làm giao diện |
| 7 | [07-implementation-plan.md](07-implementation-plan.md) | Các giai đoạn G0 đến G6, danh sách việc, tiêu chí hoàn thành, kiểm thử | **Dùng làm checklist khi làm** |
| 8 | [08-assistant.md](08-assistant.md) | Trợ lý AI Speedy: tool calling thay vì RAG, công cụ, cấu hình, giới hạn, đánh giá | Khi sửa trợ lý tư vấn |

Mã SQL tham chiếu đã chạy thử trên SQLite nằm trong [sql/](sql/):

| File | Nội dung |
|---|---|
| `sql/0001_catalog.sql` | Cấu hình, danh mục, ảnh, sản phẩm, nhóm và lựa chọn tùy chọn |
| `sql/0002_auth.sql` | Người dùng, phiên, giỏ hàng của người đăng nhập |
| `sql/0003_orders.sql` | Đơn hàng, chi tiết đơn, lịch sử trạng thái, thanh toán, nhật ký |
| `sql/seed-catalog.sql` | Dữ liệu ban đầu: 5 danh mục, 15 phương tiện, 112 lựa chọn, 67 ảnh, cấu hình |
| `sql/convert-legacy-seed.sql` | Cách đã chuyển seed cũ (cột JSON) sang lược đồ mới, để sinh lại seed khi cần |

Hàm tham chiếu chạy được (đặc tả hành vi, kèm 23 vector kiểm thử) nằm ở [reference/](reference/):

| File | Nội dung |
|---|---|
| `reference/lib.mjs` | Chuẩn hóa SĐT, sinh và chuẩn hóa mã đơn, che tên/SĐT/email |
| `reference/lib.test.mjs` | Test vector. Chạy: `node docs/reference/lib.test.mjs` |
## 3. Các quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Đặt hàng | **Không bắt buộc tài khoản.** Nhập họ tên, SĐT, email (bắt buộc), địa chỉ (không bắt buộc), ghi chú |
| D2 | Mã đơn | Mỗi đơn có mã khó đoán dạng `SS-XXXXX-XXXXX`. Khách tra cứu tiến độ bằng mã; thông tin nhạy cảm bị che |
| D3 | Tài khoản | Đăng ký bằng **SĐT** (email tùy chọn). Khi đăng ký, mọi đơn đã đặt bằng SĐT đó **tự động hiện** trong tài khoản. **Không có bước xác minh SĐT** (đã chấp nhận, xem [05-security.md](05-security.md) mục 10) |
| D4 | Nhận hàng | **Đến showroom nhận xe.** Không có vận chuyển, không có phí vận chuyển |
| D5 | Thanh toán | Tại showroom. Nhân viên ghi từng khoản đã thu (cọc, thanh toán đủ). Chưa có cổng thanh toán trực tuyến |
| D6 | Giờ mở cửa | **8:00 đến 18:00.** Khung hẹn mỗi 60 phút. Có thể sửa trong admin |
| D7 | Ảnh | **Admin tải lên** (lưu R2). Có ảnh sản phẩm và **ảnh riêng cho từng tùy chọn** (từng màu) |
| D8 | Quên mật khẩu | Chưa có gửi email. Giai đoạn đầu admin đặt lại mật khẩu cho người dùng |
| D9 | Quản trị | Một vai trò `admin`, chưa chia nhỏ quyền |
| D10 | Tồn kho | Mỗi xe: có số lượng (xe có sẵn) hoặc để trống (làm theo đơn, hiển thị thời gian chờ) |

### Giả định cần biết (chưa được xác nhận, đã chọn mặc định hợp lý)

| # | Giả định | Chỉnh ở đâu |
|---|---|---|
| A1 | Showroom mở cả 7 ngày trong tuần | `settings.pickup.days` |
| A2 | Mỗi khung 60 phút nhận tối đa 5 đơn | `settings.pickup.capacity` |
| A3 | Đơn chưa xác nhận được giữ xe 48 giờ rồi tự hết hạn | `settings.orders.pendingHoldHours` |
| A4 | Khách phải đặt trước ít nhất 2 giờ và tối đa 30 ngày | `settings.pickup.minNoticeHours`, `maxAdvanceDays` |
| A5 | Địa chỉ khách là không bắt buộc vì nhận xe tại showroom | `POST /api/orders` (schema) |
| A6 | Không có phí cọc bắt buộc; cọc do nhân viên ghi nhận thủ công | Không cần cấu hình |
| A7 | Chỉ chuyển đơn sang "đã giao" khi **đã thu đủ tiền** | BR-ORD-1 ([01-requirements.md](01-requirements.md)); bỏ điều kiện `paid_total = total` trong mẫu 6.2 nếu không muốn |

## 4. Hiện trạng mã nguồn (as-built)

Monorepo npm workspaces: `apps/web` (frontend) và `apps/api` (Worker).

| Phần | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | React 19, Vite 6, TypeScript, **Tailwind CSS 4**, **shadcn/ui** (style new-york), **lucide-react**, Sonner | Alias `@/` trỏ `apps/web/src`. Định tuyến hiện bằng hash (`#/p/:id`). `api.ts` đã đọc lỗi chuẩn (`ApiError`) |
| API | Cloudflare Worker, **Hono 4**, **zod 4**, TypeScript | Cấu trúc `routes/`, `services/`, `middleware/`, `lib/` đúng [02-architecture.md](02-architecture.md) |
| CSDL | Cloudflare **D1** (`store-db`) | Migration ở `apps/api/migrations/`, seed ở `apps/api/seed/seed-catalog.sql` |
| Giỏ hàng khách | Cloudflare **KV** (`CART`) | Khóa theo header `x-cart-id`; KV còn chứa bộ đếm giới hạn tần suất (`rl:*`) |
| Ảnh tải lên | **Cloudinary** (upload có ký SHA-1 từ Worker) | Biến `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET`; `media.url` là URL https của Cloudinary, `media.storage_key` là `public_id` |
| Cron | `[triggers] crons = ["0 * * * *"]` | Hết hạn đơn, dọn phiên, dọn ảnh mồ côi |
| Phục vụ frontend | Worker `[assets]` từ `apps/web/dist`, `run_worker_first = ["/api/*"]` | Cùng origin nên không cần CORS |

**Backend đã có:** toàn bộ API ở [04-api-spec.md](04-api-spec.md) (cửa hàng, giỏ, đặt xe không cần tài khoản, tra cứu đã che, tài khoản, đơn của tôi, quản trị đơn/thu tiền/lịch/người dùng/sản phẩm/ảnh/cấu hình/thống kê), giới hạn tần suất, audit log, cron.

**Frontend đã có:** `react-router` (địa chỉ thường, `/p/:slug`), `AuthProvider`/`CartProvider`/`CatalogProvider` (`src/providers.tsx`), trang đặt xe, tra cứu, đăng nhập/đăng ký, tài khoản và đơn của tôi, khu `/admin/*` (tổng quan, đơn, chi tiết đơn + thu tiền, phiếu in, lịch, sản phẩm + ảnh + tùy chọn, thư viện ảnh, người dùng, cấu hình). Lệch so với F7/F8: không dùng TanStack Query và react-hook-form, thay bằng hook `useAsync` và trạng thái biểu mẫu thuần (ít phụ thuộc hơn).

**Trợ lý Speedy:** nút chat nổi ở trang cửa hàng, `POST /api/assistant/chat` (SSE), tool calling đọc thẳng D1 + reranker; xem [08-assistant.md](08-assistant.md). Cần `AI_BASE_URL`, `AI_API_KEY`, `AI_LLM_MODEL`, `AI_RERANKER_MODEL` (`AI_EMBEDDING_MODEL` chưa dùng).

**Chưa có:** test tự động cho giao diện; G6 (staging, CSP, sao lưu, tài liệu vận hành).

### Ghi chú lệch so với thiết kế (đã chủ động chọn)

| # | Thiết kế | Thực tế | Lý do |
|---|---|---|---|
| 1 | `@cloudflare/vitest-pool-workers` | `@cloudflare/vitest-plugin` (cấu hình ở `apps/api/vitest.config.ts`) | Gói cũ đã bị Cloudflare đánh dấu deprecated, đổi tên sang gói mới |
| 2 | Thư viện `nanoid` | `nanoid()` tự viết ở `lib/ids.ts` (`getRandomValues`, bảng 64 ký tự) | Tránh phụ thuộc vào bản build trình duyệt của nanoid khi chạy trên Workers |
| 3 | Xóa `schema.sql`, `seed.sql` cũ | `schema.sql` đã xóa; `seed.sql` chuyển thành `scripts/legacy-seed.sql` (vẫn là đầu vào của `make art`) | Giữ nguyên dữ liệu gốc để sinh lại ảnh minh họa |
| 4 | Giỏ: xe `active = 0` | Xe bị ẩn **vẫn hiện trong giỏ** nhưng `availability = out_of_stock`; xe đã xóa thì bị loại khỏi giỏ. Đặt hàng báo `product_unavailable` | Để khách thấy và tự bỏ xe ra |
| 5 | Ảnh đang dùng | `media_in_use` và cron dọn ảnh còn tính **ảnh chụp trong `order_items`** | Đổi ảnh sản phẩm không làm mất ảnh trong đơn cũ |
| 6 | Hạ quyền admin | Hạ quyền cũng hủy mọi phiên của người đó | Quyền cũ không còn hiệu lực qua phiên đã mở |
| 7 | Ảnh lưu ở R2, phục vụ qua `/media/*` | Lưu ở **Cloudinary**; không còn R2, không còn route `/media/*`; migration `0004` đổi `media.r2_key` thành `storage_key` | R2 chưa bật được trên tài khoản; Cloudinary có CDN và biến đổi ảnh sẵn |
| 8 | Số vòng PBKDF2 | 100.000 (`lib/password.ts`) | **Chưa xác nhận được giới hạn trên Cloudflare thật**: workerd local không chặn trên 100.000. Kiểm tra tài liệu/thử trên staging trước khi nâng |

## 5. Chạy dự án

Yêu cầu: Node 24, npm 11 (đã dùng khi viết tài liệu).

```bash
npm install
make db-init     # XÓA DB local, áp migration + nạp seed (npm run db:reset -w apps/api)
make run         # api http://localhost:8787, web http://localhost:5173 (chạy nền, log trong .run/)
make status      # xem đang chạy hay dừng
make stop
make test        # 226 test của API (vitest, D1/KV giả lập, Cloudinary và AI giả, không cần mạng)
make build       # build web + kiểm tra kiểu và đóng gói thử Worker
npm run typecheck
make art         # sinh lại ảnh minh họa SVG từ scripts/legacy-seed.sql
```

Lệnh DB (chạy trong `apps/api`): `npm run db:migrate` (áp migration local), `db:seed`, `db:reset` (xóa trạng thái D1 local rồi migrate + seed), `db:migrate:remote`, `db:seed:remote`.

**Tạo tài khoản admin đầu tiên:** đăng ký bình thường qua `POST /api/auth/register` (hoặc giao diện), rồi nâng quyền:

```bash
cd apps/api
npx wrangler d1 execute store-db --local  --command "UPDATE users SET role='admin' WHERE phone='0xxxxxxxxx'"
npx wrangler d1 execute store-db --remote --command "UPDATE users SET role='admin' WHERE phone='0xxxxxxxxx'"   # production
```

**Cloudinary (ảnh tải lên):** sao chép `apps/api/.dev.vars.example` thành `apps/api/.dev.vars` (đã gitignore) và điền `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET` (Cloudinary Console → Settings → API Keys). `wrangler dev` tự đọc file này. Chưa điền thì chỉ tính năng tải ảnh trả `503 storage_unavailable`, phần còn lại chạy bình thường. Tương tự các biến `AI_*` cho trợ lý Speedy (thiếu thì `/api/assistant/chat` trả `503 assistant_unavailable`).

Triển khai lần đầu cần tạo tài nguyên: `wrangler d1 create store-db`, `wrangler kv namespace create CART`, điền id vào `apps/api/wrangler.toml`, rồi `npm run db:migrate:remote && npm run db:seed:remote`. Đẩy khóa Cloudinary và `AI_*` lên Cloudflare bằng `cd apps/api && npx wrangler secret bulk .dev.vars` (không đưa khóa vào `wrangler.toml` hay git), rồi `npm run deploy` ở thư mục gốc.

Thêm component shadcn: `npx shadcn@latest add <tên> -c apps/web`.

## 6. Những điều dễ vấp (đã gặp khi làm frontend)

1. **`@types/react` phải có ở `package.json` gốc.** Gói Radix nằm ở `node_modules` gốc; thiếu kiểu React ở đó thì mọi kiểu suy ra từ Radix thành `any` và `tsc` báo lỗi "implicitly any".
2. **React 19.** Component shadcn bản mới viết cho React 19 (không `forwardRef`). Đừng hạ về 18.
3. **`cn` import từ gói `cn`** (gói chính thức của đội shadcn, thay clsx + tailwind-merge), không phải `@/lib/utils` gốc. `src/lib/utils.ts` chỉ re-export.
4. **`db-init` là lệnh phá hủy** với DB local (xóa thư mục D1 local rồi áp lại migration và seed). Trên remote chỉ dùng `db:migrate:remote`; không bao giờ sửa migration đã áp dụng, thêm migration mới.
5. **Scroll mượt toàn trang** (`scroll-behavior: smooth`) làm `scrollIntoView` không xong ngay; khi viết test tự động bằng trình duyệt dùng `behavior: 'instant'`.
6. Tailwind 4 mặc định bỏ con trỏ tay ở nút; đã thêm lại trong `src/index.css`.
7. **`make stop` có thể không tắt được tiến trình `workerd` mồ côi** (con của `wrangler dev` đã bị kill). Nếu `make status` vẫn báo cổng 8787 đang chạy sau khi dừng, tìm pid bằng `lsof -ti tcp:8787` và tắt thủ công, nếu không `wrangler dev` mới sẽ lấy cổng 8788 và Vite proxy (8787) vẫn trỏ vào tiến trình cũ.
8. **`vi.mock` không tác động tới module trong `src/` khi chạy trong pool Workers.** Cần thay hành vi thì tiêm qua tham số (xem `newCode` của `createOrder`).

## 7. Quy ước chung

- **Tiền:** số nguyên VND, luôn tính ở server, không bao giờ tin giá từ client.
- **Thời gian:** lưu epoch giây UTC; showroom tính theo múi giờ `Asia/Ho_Chi_Minh` (UTC+7, không có giờ mùa hè).
- **SĐT:** luôn chuẩn hóa về dạng `0xxxxxxxxx` trước khi lưu và so sánh. **Email:** chữ thường.
- **Mã định danh công khai:** `slug` cho sản phẩm, `code` cho đơn. Khóa số tự tăng chỉ dùng nội bộ (ngoại lệ: `products.id` được giữ nguyên làm khóa vì giỏ hàng hiện tại tham chiếu theo id).
- **Lỗi API:** `{ "error": { "code", "message", "fields?" } }`, `code` ổn định (xem [04-api-spec.md](04-api-spec.md) mục 2).
- **Văn bản giao diện:** tiếng Việt, ngắn gọn, không dùng thuật ngữ kỹ thuật với khách.

## 8. Thuật ngữ

| Từ | Nghĩa |
|---|---|
| Đặt giữ xe | Đơn hàng: khách chọn xe và hẹn ngày nhận, showroom giữ xe cho khách |
| Showroom | Điểm bán và nhận xe, cũng là nơi thanh toán |
| Mã đơn | `SS-XXXXX-XXXXX`, khóa tra cứu công khai của một đơn |
| Tùy chọn | Màu, phiên bản, gói phụ kiện... của một xe; mỗi lựa chọn có thể cộng phụ phí và có ảnh riêng |
| `picks` | Lựa chọn khách đã chọn, dạng `{ nhóm: lựa chọn }`, ví dụ `{ "mau": "cam", "ban": "cao-cap" }` |
| Dòng giỏ hàng (line) | Cùng một xe và cùng `picks` thì chung một dòng; id dòng dạng `6~an-toan.nang-cao~mau.cam~noi-that.da-nau` |
| Giữ xe (hold) | Khoảng thời gian đơn `pending` được giữ kho trước khi tự hết hạn |
