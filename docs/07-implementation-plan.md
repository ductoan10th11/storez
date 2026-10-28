# 07. Kế hoạch triển khai

> **Tiến độ (2026-10-28):** phần **backend** của G0 đến G5 đã làm xong và có test (182 test trong `apps/api/test/`, chạy `make test`). Các mục "Frontend" của G2 đến G5 và toàn bộ G6 **chưa làm**; checkbox bên dưới chưa được tick từng mục. Đối chiếu bằng test: mỗi mục "Test bắt buộc" của backend đều có test tương ứng.

Dùng như checklist. Mỗi giai đoạn tự chạy được, kết thúc bằng một bản demo được. **Làm theo thứ tự**; không bắt đầu giai đoạn sau khi tiêu chí hoàn thành của giai đoạn trước chưa đạt.

Cỡ: **S** nhỏ, **M** vừa, **L** lớn (so sánh tương đối, không phải thời gian).

| Giai đoạn | Nội dung | Cỡ | Kết quả demo |
|---|---|---|---|
| G0 | Nền móng: cấu trúc, lỗi chuẩn, kiểm thử | S | Hành vi cũ giữ nguyên, có lưới test |
| G1 | CSDL sản phẩm thật, cấu hình showroom | M | Cửa hàng chạy trên dữ liệu mới, ảnh theo tùy chọn |
| G2 | Đặt xe không cần tài khoản, tra cứu, hết hạn giữ xe | L | Khách đặt xe, nhận mã, tra cứu tiến độ |
| G3 | Tài khoản, tự hiện đơn theo SĐT, đơn của tôi | M | Đăng ký là thấy các đơn đã đặt |
| G4 | Quản trị: đơn, thu tiền, lịch nhận xe, người dùng, thống kê | L | Showroom xử lý đơn từ đầu đến cuối |
| G5 | Quản trị: sản phẩm, tải ảnh (kể cả ảnh riêng từng tùy chọn), cấu hình | L | Admin tự thêm xe và ảnh |
| G6 | Hoàn thiện và triển khai | M | Có staging, production an toàn |

Thứ tự phụ thuộc: G0 → G1 → G2 → G3 → G4 → G5 → G6. Nếu cần nhập sản phẩm sớm, có thể làm phần admin sản phẩm của G5 ngay sau G3 (cần đăng nhập admin).

## 0. Cách làm việc

1. Đọc theo thứ tự các tài liệu trong [README](README.md). Mã SQL, hàm tham chiếu và seed đã chạy thử nằm ở `docs/sql/` và `docs/reference/`; **chép dùng, đừng viết lại từ đầu**.
2. Mỗi giai đoạn một nhánh (`g0-foundation`, `g1-catalog`...). Mỗi việc trong danh sách nên là một commit.
3. Trước mỗi commit: `npm run typecheck && npm test && make build` đều xanh.
4. Test là một phần của việc, không phải bước phụ: mỗi mục "Test bắt buộc" bên dưới phải có test tự động trước khi coi là xong.
5. Hành vi mới phải khớp [04-api-spec.md](04-api-spec.md). Nếu thấy cần đổi hợp đồng, **cập nhật tài liệu trước**, rồi mới sửa mã.
6. Văn bản giao diện bằng tiếng Việt. Không thêm thư viện ngoài danh sách khi chưa cần.

## G0. Nền móng (S)

**Mục tiêu:** tái cấu trúc mà không đổi hành vi, và có bộ kiểm thử làm lưới an toàn.

Việc cần làm:
- [ ] Cài `zod`, `@hono/zod-validator`, `nanoid` (api); `vitest`, `@cloudflare/vitest-pool-workers` (devDependencies).
- [ ] Tách `apps/api/src/index.ts` theo cấu trúc ở [02-architecture.md](02-architecture.md) mục 2 (`routes/`, `services/`, `middleware/`, `lib/`, `env.ts`). Giữ nguyên route và hành vi hiện tại.
- [ ] `AppError` + `onError` + định dạng lỗi chuẩn ([04-api-spec.md](04-api-spec.md) mục 2). Chuyển lỗi `{"error":"missing x-cart-id"}` sang định dạng chuẩn `validation_failed`.
- [ ] Cấu hình vitest với pool Workers: D1, KV, R2 giả lập; bộ hỗ trợ nạp DB sạch cho mỗi test file (ở G0 nạp `schema.sql` + `seed.sql` cũ).
- [ ] Thêm `npm test` ở gốc và `make test`.
- [ ] Cập nhật `api.ts` của frontend để đọc lỗi chuẩn (F4 trong [06-frontend-spec.md](06-frontend-spec.md)).

**Test bắt buộc** (khóa hợp đồng hiện tại, [04-api-spec.md](04-api-spec.md) mục 11):
- [ ] `GET /api/products`: mảng 15 phần tử, đúng trường, `options` là mảng đã parse.
- [ ] Giỏ: thêm mặc định thì lấy lựa chọn đầu; thêm cùng xe cùng lựa chọn thì cộng dồn; khác lựa chọn thì dòng khác; id dòng đúng định dạng; `unitPrice`, `total`, `count` đúng; `qty` chặn ở 99; `PUT` với `qty = 0` xóa dòng; `DELETE` xóa hết.
- [ ] Thiếu `x-cart-id` trả `400` định dạng lỗi chuẩn.
- [ ] Dòng giỏ cũ không có `id` trong KV vẫn đọc được.

**Hoàn thành khi:** `npm run typecheck`, `npm test`, `make build` xanh; mở cửa hàng trên trình duyệt thấy mọi thứ như trước (thêm giỏ, đổi màu, chi tiết).

## G1. CSDL sản phẩm (M)

**Mục tiêu:** sản phẩm, tùy chọn, ảnh nằm trong bảng thật; thay quy ước đặt tên file ảnh.

Việc cần làm:
- [ ] Chép `docs/sql/0001_catalog.sql` thành `apps/api/migrations/0001_catalog.sql`. Thêm `migrations_dir` vào `wrangler.toml`.
- [ ] Chép `docs/sql/seed-catalog.sql` thành `apps/api/seed/seed-catalog.sql`. **Xóa** `schema.sql`, `seed.sql` cũ.
- [ ] Thay lệnh khởi tạo: `npm run db:migrate` (`wrangler d1 migrations apply store-db --local`), `db:seed` (nạp seed), `db:reset` (xóa trạng thái local rồi migrate + seed); sửa `make db-init` gọi chúng. Cập nhật mục "Chạy dự án" ở README.
- [ ] `services/catalog.ts`: đọc sản phẩm cùng nhóm, lựa chọn, ảnh; tính `availability` theo BR-STK-2; chỉ `active = 1`.
- [ ] Route công khai: `GET /api/products`, `GET /api/products/:slug`, `GET /api/categories`, `GET /api/settings/public`. Trường mới chỉ **thêm**.
- [ ] Dịch vụ giỏ đọc từ bảng mới; ảnh dòng giỏ lấy từ `option_choices.media_id` (màu đã chọn), thiếu thì ảnh chính; bỏ suy ảnh theo tên file ở server.
- [ ] Giỏ từ chối xe `active = 0` (`product_unavailable`).
- [ ] Frontend: cập nhật kiểu (F5), `imageFor` dùng `choice.image` (F3), hiển thị tình trạng xe và vô hiệu nút khi hết hàng (F6).

**Test bắt buộc:**
- [ ] Danh sách trả đúng 15 xe, đủ `slug`, `images`, `availability`, `options[].choices[].image` (52 lựa chọn màu có ảnh).
- [ ] `availability`: kho số > 0 là `in_stock`; 0 là `out_of_stock`; NULL là `preorder` (đổi dữ liệu trong test rồi kiểm tra).
- [ ] Xe `active = 0` không có trong danh sách và `GET /api/products/:slug` trả 404; thêm vào giỏ trả `product_unavailable`.
- [ ] Toàn bộ test giỏ của G0 vẫn xanh trên dữ liệu mới (giá và id dòng không đổi).
- [ ] Xóa một sản phẩm thì nhóm, lựa chọn, `product_images` bị xóa theo (cascade); `media` không bị xóa.

**Hoàn thành khi:** cửa hàng chạy y như trước trên dữ liệu mới, không còn cột JSON, mọi test xanh.

## G2. Đặt xe không cần tài khoản và tra cứu (L)

**Mục tiêu:** khách đặt xe, có mã đơn, tra cứu tiến độ. Đây là giá trị bán hàng lớn nhất.

Ghi chú: áp **cả ba** migration (`0001`, `0002`, `0003`) ở giai đoạn này vì `orders.user_id` tham chiếu `users`. Các bảng `users`, `sessions`, `cart_items` chưa dùng đến G3.

Backend:
- [ ] Chép `docs/sql/0002_auth.sql`, `0003_orders.sql` vào `migrations/`.
- [ ] `lib/ids.ts`, `lib/phone.ts` từ `docs/reference/lib.mjs` (chuyển sang TypeScript, giữ nguyên hành vi), `lib/time.ts` (giờ Việt Nam ↔ epoch).
- [ ] `middleware/rate-limit.ts` (KV, [05-security.md](05-security.md) mục 5) với các bộ `track`, `order-create`, `order-phone`.
- [ ] `services/slots.ts` và `GET /api/pickup-slots` ([03-data-model.md](03-data-model.md) 6.5).
- [ ] `services/orders.createOrder` đúng thuật toán 6.1 và `POST /api/orders`; giỏ khách lấy từ KV theo `x-cart-id`.
- [ ] `services/masking.ts` (từ `docs/reference/lib.mjs`) và `GET /api/track/:code`.
- [ ] Cron hết hạn: `scheduled` + `[triggers] crons` trong `wrangler.toml` + dùng mẫu đổi trạng thái 6.2 ([03-data-model.md](03-data-model.md)).

Frontend:
- [ ] `react-router` (F1): trang chủ, `/p/:slug`, `/checkout`, `/track`, `/track/:code`. Cập nhật liên kết hiện có (card, giỏ hàng, khối nổi bật, breadcrumb) và giữ khôi phục vị trí cuộn.
- [ ] `CartProvider` (F2). Nút "Thanh toán" trong giỏ dẫn tới `/checkout` (bỏ `alert`).
- [ ] Trang đặt xe ([06-frontend-spec.md](06-frontend-spec.md) 4.1) và trang tiến độ 4.2 (có banner thành công, sao chép mã, dòng thời gian).
- [ ] Ô "Tra cứu đơn" ở header.

**Test bắt buộc** (tích hợp, trên D1/KV giả lập):
- [ ] Đặt hàng thành công: tạo `orders`, `order_items` (bản chụp đúng tên/ảnh/giá/tùy chọn), `order_events` (`pending`); `total = subtotal`; kho trừ đúng; giỏ rỗng; mã đúng định dạng.
- [ ] **Đơn không nhận giá từ client:** thêm trường `price`/`total` vào body bị bỏ qua, tổng tính từ DB.
- [ ] **Hết kho làm hỏng cả batch (chứng minh rollback của D1):** đặt vượt kho trả `out_of_stock`, và **không** có dòng `orders`/`order_items`/`order_events` nào được tạo, kho không đổi.
- [ ] **Đồng thời:** hai yêu cầu đặt chiếc xe cuối cùng cùng lúc (`Promise.all`) thì đúng một thành công, một `out_of_stock`, kho bằng 0, không âm.
- [ ] Xe `stock = NULL` (làm theo đơn): không trừ kho, đặt được số lượng lớn.
- [ ] `option_invalid`, `product_unavailable`, `cart_empty`.
- [ ] Khung giờ: từ chối ngày không thuộc `days`, khung ngoài giờ mở cửa, quá gần (< `minNoticeHours`), quá xa, đã đầy `capacity`; chấp nhận khung hợp lệ; `GET /api/pickup-slots` khớp (số khung/ngày với cấu hình mặc định là 10, khung cuối 17:00).
- [ ] Bản chụp đơn bất biến: đổi giá và tên sản phẩm sau khi đặt, đơn cũ không đổi.
- [ ] Đơn đặt bằng SĐT đã có tài khoản thì `user_id` được gắn (thêm sẵn một `users` trong test).
- [ ] Tra cứu: đúng dạng đã che (khớp test vector ở [05-security.md](05-security.md) mục 6); phản hồi **không chứa** họ tên, SĐT, email đầy đủ, địa chỉ, ghi chú, `productId` (tìm chuỗi gốc trong JSON phản hồi); chấp nhận mã nhập thường/có dấu cách/nhầm `O`; mã sai và mã không tồn tại cùng thông báo; có `Cache-Control: no-store`.
- [ ] Giới hạn tần suất: vượt `track` và `order-create` trả `429` kèm `Retry-After`.
- [ ] Cron hết hạn: đơn `pending` quá hạn thành `expired`, có sự kiện, kho được trả; chạy lần hai không đổi gì (idempotent); đơn `confirmed` không bị hết hạn.
- [ ] Sinh mã: 5000 mã không trùng và hợp lệ; trùng mã thì thử lại (mô phỏng bằng cách chèn trước một mã).

**Hoàn thành khi:** trên trình duyệt thật, khách (không đăng nhập) chọn xe, điền biểu mẫu, chọn giờ, đặt thành công, thấy mã, sao chép mã, mở `/track/<mã>` thấy dòng thời gian và thông tin đã che.

## G3. Tài khoản (M)

**Mục tiêu:** đăng ký bằng SĐT là thấy ngay các đơn đã đặt bằng số đó.

Backend:
- [ ] `lib/password.ts` (PBKDF2, định dạng và so sánh theo [05-security.md](05-security.md) mục 3; **kiểm tra số vòng tối đa Cloudflare cho phép**), token và `sessions` (mục 2).
- [ ] `middleware/session.ts`, `auth.ts` (`requireAuth`); cookie đúng cờ.
- [ ] `routes/auth.ts`: `register`, `login`, `logout`, `me`; rate limit `login`, `login-ip`, `register`; chống dò bằng thời gian (hash giả).
- [ ] `services/claim.ts` (6.6) gọi trong đăng ký; trả `linkedOrders`.
- [ ] Giỏ hai nguồn: người đã đăng nhập dùng `cart_items`; **gộp giỏ KV** khi đăng nhập/đăng ký (6.7) và trả `mergedCartLines`.
- [ ] `routes/account.ts`: hồ sơ, đổi mật khẩu (hủy phiên khác), danh sách đơn, chi tiết đơn (đầy đủ), hủy đơn (dùng mẫu 6.2, trả kho).
- [ ] Đơn tạo khi đã đăng nhập gắn `user_id` (đã có ở G2, kiểm tra lại).

Frontend:
- [ ] `AuthProvider`; trang `/login`, `/register` ([06-frontend-spec.md](06-frontend-spec.md) 4.3) với `returnTo`; menu tài khoản ở header; `/account`, `/account/orders`, `/account/orders/:code` (4.4).
- [ ] Thông báo "Tìm thấy N đơn" sau đăng ký.

**Test bắt buộc:**
- [ ] Đăng ký thành công: `201`, cookie `sid` có `HttpOnly`, `SameSite=Lax`; mật khẩu **không** lưu dạng rõ (định dạng `pbkdf2$...`); trùng SĐT/email trả `phone_taken`/`email_taken`; SĐT/mật khẩu sai định dạng trả `validation_failed` có `fields`.
- [ ] Đăng nhập bằng SĐT và bằng email; sai mật khẩu và không có tài khoản cho **cùng** lỗi `invalid_credentials`; tài khoản bị khóa trả `account_disabled`.
- [ ] `me` trả `{ user: null }` khi chưa đăng nhập, trả người dùng khi đã đăng nhập; phiên hết hạn coi như chưa đăng nhập; gia hạn trượt khi quá 1 ngày.
- [ ] Đăng xuất xóa phiên (token cũ không dùng lại được). Token lưu dạng hash (không tìm thấy token gốc trong `sessions`).
- [ ] **Gắn đơn theo SĐT:** tạo vài đơn khách với SĐT A và vài đơn với SĐT B; đăng ký bằng SĐT A thì chỉ đơn của A được gắn (`linkedOrders` đúng), đơn của B không; tài khoản thấy đơn của A (đầy đủ, không che).
- [ ] Đơn tạo sau khi đã có tài khoản SĐT A (dù khách chưa đăng nhập) được gắn vào tài khoản A.
- [ ] Người dùng không xem được đơn của người khác: `404 order_not_found`; hủy đơn người khác bị từ chối.
- [ ] Hủy đơn: chủ đơn hủy được khi `pending`/`confirmed` và kho được trả; không hủy được khi `ready`/`completed`; hủy hai lần đồng thời chỉ trả kho một lần.
- [ ] Đổi mật khẩu: sai mật khẩu hiện tại bị từ chối; thành công thì phiên khác bị hủy, phiên hiện tại giữ.
- [ ] Gộp giỏ: giỏ khách có 2 dòng; đăng nhập thì giỏ tài khoản có 2 dòng (cộng dồn nếu trùng, tối đa 99), KV bị xóa.
- [ ] Giới hạn tần suất `login`: lần thứ 11 trong 15 phút bị `429`.

**Hoàn thành khi:** khách đặt xe (không đăng nhập), sau đó đăng ký bằng đúng SĐT đó và thấy đơn trong "Đơn hàng của tôi", hủy được đơn `pending`.

## G4. Quản trị: vận hành đơn (L)

**Mục tiêu:** showroom xử lý một đơn từ lúc đặt tới lúc giao xe, thu tiền từng khoản.

Backend:
- [ ] `requireAdmin`; lệnh tạo admin đầu tiên được ghi vào README ([02-architecture.md](02-architecture.md) mục 8).
- [ ] `routes/admin/orders.ts`: danh sách (có `counts`), chi tiết, đổi trạng thái (mẫu 6.2/6.3), ghi thu (6.4), `PATCH` (ghi chú nội bộ, đổi lịch hẹn), `calendar`.
- [ ] `routes/admin/users.ts`: danh sách, khóa/mở, đổi vai trò, đặt lại mật khẩu (hủy mọi phiên).
- [ ] `routes/admin/stats.ts`.
- [ ] Ghi `audit_log` cho mọi thao tác ghi của admin.

Frontend:
- [ ] Khung admin + bảo vệ route ([06-frontend-spec.md](06-frontend-spec.md) mục 3, 4.5).
- [ ] Tổng quan, bảng đơn, chi tiết đơn (hành động theo trạng thái, thu tiền), phiếu nhận xe (in), lịch nhận xe, người dùng.

**Test bắt buộc:**
- [ ] **Quét route admin:** test tự duyệt toàn bộ route `/api/admin/*` đã đăng ký, khẳng định `401` khi chưa đăng nhập và `403` khi là khách thường (route mới thêm tự bị kiểm tra).
- [ ] Ma trận chuyển trạng thái: mọi chuyển hợp lệ ở BR-ORD-1 thành công; mọi chuyển còn lại trả `invalid_transition`.
- [ ] `ready → completed` bị từ chối (`payment_incomplete`, kèm `remaining`) khi chưa thu đủ; thành công khi `paid_total = total`.
- [ ] Ghi thu: cộng dồn đúng `paid_total`; **thu vượt tổng bị từ chối và không ghi dòng `payments`** (rollback); không thu được với đơn đã hủy/hết hạn; trạng thái thanh toán suy ra đúng (chưa thu/đã cọc/đã đủ).
- [ ] **Chống đua:** hai yêu cầu hủy cùng một đơn đồng thời thì kho chỉ được cộng một lần và chỉ có một sự kiện; hủy rồi hết hạn không cộng lại.
- [ ] Mỗi đổi trạng thái có `order_events` với `actor`; tra cứu công khai và trang của khách thấy dòng thời gian cập nhật.
- [ ] Đặt lại mật khẩu và khóa tài khoản hủy mọi phiên của người đó; admin không tự khóa/hạ quyền mình (`self_action`).
- [ ] Thống kê: số liệu khớp với dữ liệu mẫu dựng trong test (`collected` tính từ `payments`).
- [ ] `audit_log` có dòng cho mỗi thao tác ghi, không chứa mật khẩu.
- [ ] Danh sách đơn: lọc theo trạng thái, tìm theo mã/SĐT/tên; `counts` không đổi theo bộ lọc `status`.

**Hoàn thành khi:** một admin đăng nhập, thấy đơn mới ở "Chờ xác nhận", xác nhận, thu cọc, đánh dấu sẵn sàng, thu phần còn lại, giao xe; khách tra cứu mã đơn thấy từng bước và số tiền đã thu; in được phiếu nhận xe.

## G5. Quản trị: sản phẩm và tải ảnh (L)

**Mục tiêu:** admin tự thêm xe, màu, phiên bản và ảnh (kể cả ảnh riêng từng màu) mà không cần sửa mã.

Backend:
- [ ] Thêm R2 binding `MEDIA`, `run_worker_first` có `/media/*` ([02-architecture.md](02-architecture.md) mục 3).
- [ ] `POST /api/admin/media` đúng từng bước ở [05-security.md](05-security.md) mục 7; `GET /media/*`; `GET`, `DELETE /api/admin/media`.
- [ ] CRUD sản phẩm theo `ProductInput` ([04-api-spec.md](04-api-spec.md) 9.1): tạo và `PUT` đối chiếu nhóm/lựa chọn theo `key` trong **một `batch`**; kiểm tra zod (kèm đường dẫn trường lỗi); CRUD danh mục; sửa nhanh `active`/`stock`.
- [ ] `settings` có schema kiểm tra từng khóa; cấu hình `pickup` mới có hiệu lực ngay ở `GET /api/pickup-slots`.
- [ ] Cron dọn ảnh mồ côi.

Frontend:
- [ ] Bộ tải ảnh (thu nhỏ ở trình duyệt, [06-frontend-spec.md](06-frontend-spec.md) 4.5); thư viện ảnh; danh sách và biểu mẫu sản phẩm (trình sửa tùy chọn, ảnh sản phẩm, **ảnh riêng từng lựa chọn màu**); trang cấu hình.

**Test bắt buộc:**
- [ ] Tải lên: chấp nhận JPEG, PNG, WebP hợp lệ; **từ chối** file giả (đổi đuôi `.jpg` cho file văn bản/SVG/HTML), SVG thật, `Content-Type` sai nhưng nội dung đúng thì vẫn lưu `Content-Type` đúng theo nội dung; quá 5 MB trả `payload_too_large`; chưa đăng nhập admin bị từ chối; khách thường bị `403`.
- [ ] `GET /media/*` trả đúng `Content-Type`, `Cache-Control` bất biến, `nosniff`; khóa không đoán được (không chứa tên file gốc).
- [ ] Tạo sản phẩm có đủ nhóm và ảnh; `GET /api/products/:slug` trả đúng; trường lỗi có đường dẫn (ví dụ `options.0.choices.1.hex`).
- [ ] `PUT` đối chiếu theo `key`: sửa tên giữ nguyên `key`, thêm lựa chọn mới, xóa lựa chọn thiếu, sắp xếp lại; giỏ chứa lựa chọn đã xóa vẫn tính giá hợp lệ (rơi về mặc định).
- [ ] Xóa sản phẩm: đơn cũ giữ nguyên bản chụp, `order_items.product_id` thành NULL; không lỗi khóa ngoại.
- [ ] Xóa ảnh đang dùng bị từ chối `media_in_use`; ảnh không dùng thì xóa được khỏi R2 và bảng.
- [ ] Danh mục còn sản phẩm không xóa được (`category_in_use`).
- [ ] Đổi giờ mở cửa/độ dài khung trong cấu hình thì danh sách khung giờ đổi theo.
- [ ] Cron dọn ảnh mồ côi chỉ xóa ảnh không được tham chiếu và quá 24 giờ.

**Hoàn thành khi:** admin tạo một xe mới có 3 màu, mỗi màu một ảnh tải lên, đặt giá và kho; xe hiện ngay ở trang chủ; khách đổi màu thì ảnh đổi đúng; đặt xe đó thành công và kho giảm.

## G6. Hoàn thiện và triển khai (M)

- [ ] Môi trường **staging** (`[env.staging]` với D1/KV/R2 riêng) và production; lệnh triển khai trong README.
- [ ] Tiêu đề bảo mật và CSP ([05-security.md](05-security.md) mục 12), thử kỹ rồi mới bật.
- [ ] Ghi log và theo dõi lỗi (Workers Logs/Observability), không log dữ liệu cá nhân.
- [ ] Sao lưu D1 (Time Travel, xuất định kỳ) và quy trình khôi phục viết trong README.
- [ ] Tài liệu vận hành: tạo admin, đặt lại mật khẩu, đổi cấu hình, xử lý đơn kẹt.
- [ ] Chạy hết "Danh sách kiểm tra trước khi phát hành" ở [05-security.md](05-security.md) mục 13.
- [ ] Tùy chọn (chưa bắt buộc): Turnstile ở trang đặt xe; yêu cầu tư vấn/đặt lịch lái thử (`leads`); gửi email xác nhận đơn và OTP xác minh SĐT khi có nhà cung cấp; xuất CSV đơn hàng.

## Kiểm thử nghiệm thu end-to-end

Chạy trên trình duyệt thật (staging) sau G5. Mỗi kịch bản phải đạt.

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| E1 | Khách (không đăng nhập) chọn xe có tùy chọn, thêm giỏ, đặt xe, chọn giờ nhận | Nhận mã đơn; `/track/<mã>` hiện dòng thời gian, thông tin **đã che**, tổng tiền khớp |
| E2 | Admin xác nhận đơn E1, thu cọc, đánh dấu sẵn sàng, thu phần còn lại, giao xe | Khách tra cứu thấy từng bước và số tiền đã thu; in được phiếu nhận xe |
| E3 | Khách đăng ký bằng đúng SĐT của đơn E1 | Thấy "Tìm thấy N đơn"; đơn hiện **đầy đủ** trong tài khoản |
| E4 | Khách đặt xe cuối cùng trong kho, người thứ hai đặt cùng lúc | Chỉ một đơn thành công; người kia thấy thông báo hết hàng; kho không âm |
| E5 | Khách hủy đơn `pending` ở tài khoản | Đơn `cancelled`; kho được trả; tra cứu hiện "Đã hủy" |
| E6 | Đơn `pending` quá 48 giờ giữ xe (chỉnh `hold_expires_at` trong DB để thử) | Cron chuyển `expired`, trả kho |
| E7 | Admin tạo xe mới, 3 màu, mỗi màu một ảnh tải lên | Xe hiện ở cửa hàng; đổi màu đổi ảnh; đặt xe được |
| E8 | Admin đổi giờ mở cửa sang 9:00 đến 17:00 | Trang đặt xe chỉ còn khung 9:00 đến 16:00 |
| E9 | Người dùng thường truy cập `/admin` và gọi `/api/admin/*` | Giao diện "Không có quyền"; API trả `403` |
| E10 | Tra cứu với mã sai, mã sai định dạng, 31 lần trong 1 phút | Cùng thông báo không tìm thấy; sau 30 lần bị chặn `429` |

## Điều cần xác nhận hoặc kiểm tra khi triển khai

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Số vòng PBKDF2 tối đa của Cloudflare Workers | Kiểm tra tài liệu Cloudflare lúc làm G3; dùng mức tối đa |
| 2 | `wrangler d1 migrations apply` chạy được `unixepoch()` và các ràng buộc `CHECK` | SQL đã chạy trên SQLite 3.54; D1 dùng SQLite gần đây nhưng cần thử trên D1 local và remote |
| 3 | Rollback `db.batch()` khi một câu lỗi | **Phải có test tích hợp** (G2); các mẫu ở [03-data-model.md](03-data-model.md) 6.1, 6.2, 6.4 dựa vào hành vi này |
| 4 | Giả định A1 đến A7 (README) | Xác nhận với chủ cửa hàng, đặc biệt: showroom mở cả tuần, sức chứa 5 đơn mỗi khung, giữ xe 48 giờ, chỉ giao xe khi đã thu đủ tiền |
| 5 | Địa chỉ khách có bắt buộc không | Hiện không bắt buộc (nhận xe tại showroom); đổi ở schema `POST /api/orders` nếu cần |
| 6 | Rủi ro tự gắn đơn theo SĐT không xác minh | Đã chấp nhận (D3); mô tả đường nâng cấp ở [05-security.md](05-security.md) mục 10 |
| 7 | Nhà cung cấp email/SMS | Chưa chọn; chỉ cần khi làm các mục tùy chọn ở G6 |
