# 05. Bảo mật

Phạm vi: bảo vệ dữ liệu khách (họ tên, SĐT, email, đơn hàng), tài khoản và quyền quản trị. Mục tiêu là đủ chắc cho một cửa hàng nhỏ, không thêm phức tạp không cần thiết.

## 1. Tài sản và mối đe dọa chính

| Tài sản | Mối đe dọa | Biện pháp (mục) |
|---|---|---|
| Thông tin liên hệ trong đơn | Tra cứu công khai làm lộ dữ liệu | Che dữ liệu, mã đơn khó đoán, giới hạn tần suất (5, 6, 8) |
| Mật khẩu | Lộ CSDL, dò mật khẩu | PBKDF2 + muối, giới hạn đăng nhập (3, 5) |
| Phiên đăng nhập | Đánh cắp, dùng lại token | Chỉ lưu hash, cookie HttpOnly, thu hồi được (2) |
| Quyền admin | Leo thang đặc quyền | Kiểm tra vai trò ở server mọi route admin (9) |
| Kho và giá | Thao túng giá/số lượng từ client | Server tự tính, ràng buộc ở CSDL |
| Ảnh tải lên | Mã độc, file giả mạo, tốn dung lượng | Kiểm tra nội dung thật, chỉ ảnh raster, giới hạn cỡ (7) |
| Hệ thống | Đặt đơn rác để chiếm khung giờ và kho | Giới hạn tần suất, hạn giữ xe tự hết (5) |

## 2. Phiên đăng nhập

- **Token:** 32 byte ngẫu nhiên từ `crypto.getRandomValues`, mã hóa base64url (43 ký tự). Gửi cho trình duyệt trong cookie.
- **Lưu trữ:** bảng `sessions`, khóa chính `id = hex(SHA-256(token))`. **Token gốc không bao giờ lưu.** Lộ CSDL không cho phép dùng lại phiên.
- **Cookie:** `sid=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` (30 ngày). Thêm `Secure` khi yêu cầu là `https` (kiểm tra `new URL(c.req.url).protocol`), **không** thêm khi chạy `http://localhost` vì Safari từ chối cookie `Secure` trên http. Production luôn là https nên luôn có `Secure`.
- **Gia hạn trượt:** mỗi yêu cầu có phiên hợp lệ, nếu `now - last_used_at > 86400` thì cập nhật `last_used_at`, `expires_at = now + 30 ngày` và đặt lại cookie. Không ghi D1 ở mọi yêu cầu (giảm tải).
- **Hết hạn:** `expires_at < now` coi như không có phiên. Cron dọn dòng hết hạn.
- **Thu hồi:** đăng xuất xóa dòng của phiên hiện tại; đổi mật khẩu xóa mọi phiên **khác**; admin khóa hoặc đặt lại mật khẩu xóa **mọi** phiên của người đó.
- **Kiểm tra mỗi yêu cầu:** nạp phiên + người dùng bằng một truy vấn JOIN; `users.disabled = 1` thì coi như chưa đăng nhập.

## 3. Mật khẩu

- **Thuật toán:** PBKDF2-HMAC-SHA256 qua WebCrypto (`crypto.subtle.deriveBits`). Worker không có bcrypt/argon2 gốc.
- **Số vòng:** Cloudflare giới hạn số vòng PBKDF2 tối đa (khoảng 100.000; **xác nhận lại trên tài liệu Cloudflare khi làm**). Dùng giá trị tối đa cho phép.
- **Định dạng lưu:** `pbkdf2$sha256$<số vòng>$<muối base64>$<hash base64>`. Muối 16 byte ngẫu nhiên mỗi mật khẩu, hash 32 byte. Ghi số vòng vào chuỗi để sau này nâng cấp: khi đăng nhập thành công mà số vòng cũ nhỏ hơn mức hiện hành thì băm lại và cập nhật.
- **So sánh:** so sánh thời gian cố định (`crypto.subtle.timingSafeEqual` của Workers, hoặc vòng XOR).
- **Chống dò tài khoản bằng thời gian:** khi không tìm thấy người dùng, vẫn chạy một lần PBKDF2 với hash giả để thời gian phản hồi không lộ SĐT/email có tồn tại hay không. Thông báo lỗi luôn chung: "Sai số điện thoại/email hoặc mật khẩu".
- **Chính sách:** độ dài 8 đến 128 ký tự. Không bắt buộc ký tự đặc biệt (độ dài quan trọng hơn). Không giới hạn ký tự.
- **Bù cho số vòng thấp hơn bcrypt:** giới hạn tần suất đăng nhập chặt (mục 5).

## 4. Chống CSRF

Cùng origin và cookie `SameSite=Lax`: trình duyệt không gửi cookie trong yêu cầu ghi xuyên site. Lớp phụ: mọi route ghi (`POST/PUT/PATCH/DELETE`) yêu cầu `Content-Type: application/json`, mà form HTML thường không thể gửi loại này xuyên site. Route upload ảnh (`multipart/form-data`) bắt buộc đăng nhập admin bằng cookie `SameSite=Lax` nên yêu cầu xuyên site cũng không mang cookie.

Không mở CORS (không có `Access-Control-Allow-Origin`). Nếu sau này có client khác origin thì phải thiết kế lại phần này.

## 5. Giới hạn tần suất

Đếm bằng KV theo cửa sổ cố định: khóa `rl:<tên>:<chủ thể>:<floor(now/cửa sổ)>`, giá trị là số lần; mỗi yêu cầu đọc rồi ghi `count + 1` với `expirationTtl = max(60, cửa sổ)`. Vượt giới hạn thì `429 rate_limited` kèm `Retry-After`.

> KV nhất quán cuối cùng nên bộ đếm **xấp xỉ**, đủ để chặn lạm dụng nhưng không chính xác tuyệt đối. Nếu có thể, ưu tiên **Workers Rate Limiting binding** (chính xác hơn); giữ nguyên tên và giới hạn dưới đây.

| Tên | Chủ thể | Giới hạn | Cửa sổ | Áp dụng cho |
|---|---|---|---|---|
| `login` | IP + `identifier` đã chuẩn hóa | 10 | 15 phút | `POST /api/auth/login` |
| `login-ip` | IP | 30 | 15 phút | `POST /api/auth/login` (chặn dò nhiều tài khoản) |
| `register` | IP | 5 | 1 giờ | `POST /api/auth/register` |
| `track` | IP | 30 | 1 phút | `GET /api/track/:code` |
| `order-create` | IP | 5 | 1 giờ | `POST /api/orders` |
| `order-phone` | SĐT đã chuẩn hóa | 5 | 24 giờ | `POST /api/orders` (chống đặt rác nhiều lần cùng một số) |
| `upload` | `user.id` | 30 | 10 phút | `POST /api/admin/media` |

IP lấy từ header `CF-Connecting-IP` (luôn có khi chạy trên Cloudflare; khi chạy local có thể thiếu, dùng `"local"`). **Không** tin `X-Forwarded-For` do client gửi.

Với đặt hàng, có thể thêm **Cloudflare Turnstile** (CAPTCHA không cản trở) ở trang thanh toán nếu bị đặt đơn rác; chưa bắt buộc.

## 6. Che dữ liệu khi tra cứu công khai

Tra cứu (`GET /api/track/:code`) chỉ trả dữ liệu đã che. Cài đặt tham chiếu và test vector chạy được nằm ở [reference/lib.mjs](reference/lib.mjs) và [reference/lib.test.mjs](reference/lib.test.mjs) (`node docs/reference/lib.test.mjs`).

| Dữ liệu | Quy tắc che | Ví dụ |
|---|---|---|
| Họ tên | Mỗi từ giữ **ký tự đầu**, phần còn lại thay bằng `*`, tối đa 4 dấu `*` mỗi từ (che luôn độ dài thật). Chuẩn hóa NFC trước, đếm theo ký tự Unicode | `Nguyễn Văn An` thành `N**** V** A*`; `Trần Thị Bích Ngọc` thành `T*** T** B*** N***` |
| SĐT (10 số chuẩn hóa) | Giữ **3 số đầu và 3 số cuối** | `0336436536` thành `033****536` |
| Email | Phần trước `@`: ký tự đầu + `***`. Tên miền: ký tự đầu của nhãn đầu tiên + `***`, giữ phần sau dấu chấm đầu tiên | `hdtoan.dev@gmail.com` thành `h***@g***.com`; `an@example.co.uk` thành `a***@e***.co.uk` |
| Email không hợp lệ | `***` | |
| Địa chỉ khách, ghi chú khách, ghi chú nội bộ | **Không trả** | |
| `productId`, id người dùng, `userId` | **Không trả** | |

Hiển thị đầy đủ (không che) ở: phản hồi `POST /api/orders` (người vừa nhập), `GET /api/account/orders/*` (chủ đơn đã đăng nhập), và mọi route admin.

Mọi bài kiểm thử của tra cứu phải khẳng định rằng chuỗi JSON phản hồi **không chứa** họ tên, SĐT, email đầy đủ của đơn (kiểm tra bằng cách tìm chuỗi gốc trong phản hồi).

## 7. Tải ảnh lên

Chỉ admin. Kiểm tra theo thứ tự, thất bại ở bước nào thì dừng và trả lỗi:

1. **Xác thực + quyền admin** trước khi đọc nội dung. Giới hạn `upload`.
2. **Kích thước:** từ header `Content-Length` (từ chối sớm nếu > 6 MB); sau khi đọc, `file.size ≤ 5 MB` nếu không thì `413 payload_too_large`.
3. **Định dạng bằng nội dung, không tin tên file hay `Content-Type` của client.** Đọc các byte đầu:
   | Định dạng | Chữ ký |
   |---|---|
   | JPEG | `FF D8 FF` |
   | PNG | `89 50 4E 47 0D 0A 1A 0A` |
   | WebP | `52 49 46 46` (`RIFF`) + 4 byte kích thước + `57 45 42 50` (`WEBP`) |
   Không khớp thì `415 unsupported_media`. **Không nhận SVG** (SVG chạy được mã script nên là rủi ro XSS khi phục vụ lại; ảnh SVG minh họa hiện có là tài sản tĩnh do nhà phát triển kiểm soát, không đi qua đường tải lên).
4. **`Content-Type` lưu và phục vụ** lấy từ định dạng đã nhận diện (`image/jpeg`, `image/png`, `image/webp`), không lấy từ client.
5. **`public_id` trên Cloudinary** do server sinh: `products/<yyyymm>/<nanoid(21)>`. Không dùng tên file của người dùng. Worker kiểm tra nội dung (bước 3) **trước** khi gửi lên Cloudinary, rồi gửi bằng upload có chữ ký (api_secret chỉ nằm ở secret của Worker, không bao giờ trả cho trình duyệt).
6. **Kích thước ảnh (width, height):** nhận từ client (trường form) làm gợi ý hiển thị, **kiểm tra là số nguyên trong khoảng 1 đến 4000**; không giải mã ảnh ở server. Ảnh thật được thu nhỏ ở trình duyệt (cạnh dài tối đa 1600 px, WebP) trước khi gửi.
7. Ảnh được phục vụ trực tiếp từ CDN Cloudinary (URL https, bất biến theo `public_id`). Nếu bật CSP ở G6 thì thêm `https://res.cloudinary.com` vào `img-src`.
8. Xóa ảnh chỉ khi không còn được dùng (`media_in_use`).

## 8. Mã đơn

- **Cấu tạo:** `SS-` + 10 ký tự lấy từ bảng chữ Crockford base32 không gây nhầm lẫn `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (bỏ `I`, `L`, `O`, `U`), chia hai nhóm 5: `SS-K7M2Q-9XP4D`.
- **Độ ngẫu nhiên:** 10 ký tự × 5 bit = **50 bit**, sinh bằng `crypto.getRandomValues` (256 chia hết cho 32 nên `byte & 31` không bị lệch). Không dùng `Math.random`, không dùng số tăng dần hay dấu thời gian.
- **Duy nhất:** `UNIQUE(code)`; nếu trùng (xác suất cực nhỏ) thì sinh lại, tối đa 5 lần.
- **Chuẩn hóa khi nhập:** chữ hoa; bỏ mọi ký tự không phải chữ-số; bỏ tiền tố `SS`; `O` thành `0`; `I` và `L` thành `1`; phải còn đúng 10 ký tự thuộc bảng chữ cái, nếu không thì `order_not_found`. Cài đặt chuẩn trong [reference/lib.mjs](reference/lib.mjs).
- **Chống dò:** giới hạn `track` theo IP; thông báo "không tìm thấy" giống nhau cho mã sai định dạng và mã không tồn tại. Với 50 bit và 30 lần thử mỗi phút mỗi IP, việc dò mã hợp lệ không khả thi.
- Mã đơn **chính là bằng chứng** quyền xem phiên bản đã che; vì vậy khuyên khách không đăng công khai.

## 9. Phân quyền

| Tài nguyên | public | user (chủ) | user (người khác) | admin |
|---|---|---|---|---|
| Xem sản phẩm, khung giờ, cấu hình công khai | có | có | có | có |
| Giỏ hàng khách (theo `x-cart-id`) | có | không dùng (dùng giỏ tài khoản) | | |
| Đặt hàng | có | có | | có |
| Tra cứu đơn đã che | có (có mã) | có | có | có |
| Xem đơn đầy đủ, hủy đơn | không | có (đơn của mình) | **không** (`404 order_not_found`) | có |
| Hồ sơ, đổi mật khẩu | không | có (của mình) | không | có (của mình) |
| Quản trị (sản phẩm, ảnh, đơn, thu tiền, người dùng, cấu hình, thống kê) | không | không | không | có |

Quy tắc cài đặt:
- Mọi truy vấn đơn của người dùng đều có điều kiện `user_id = :me`. Khi đơn không thuộc người dùng trả `404` (không phải `403`) để không xác nhận đơn tồn tại.
- Phân quyền **chỉ ở server**. Việc ẩn menu ở giao diện chỉ để tiện dùng.
- Mọi route `/api/admin/*` đi qua `requireAdmin`; nên có test duyệt qua **toàn bộ** route admin khẳng định `401` khi chưa đăng nhập và `403` khi là khách (đặt test tự quét bảng route để route mới không bị bỏ sót).

## 10. Rủi ro đã chấp nhận

**Tự gắn đơn theo SĐT không xác minh (D3, BR-ACC-1).** Bất kỳ ai đăng ký bằng một SĐT đã từng đặt hàng sẽ thấy các đơn của SĐT đó (đầy đủ, không che): họ tên, email, địa chỉ, xe đã đặt. Người lạ biết SĐT của khách có thể lợi dụng.

- **Quyết định:** chủ cửa hàng chấp nhận để giữ trải nghiệm đơn giản, vì quy mô sử dụng nhỏ và khả năng bị lợi dụng thấp.
- **Hậu quả cần nắm:** khách phải biết rằng ai có SĐT của họ cũng có thể xem đơn khi tạo tài khoản; không nên ghi dữ liệu nhạy cảm vào ô ghi chú.
- **Giảm nhẹ không tốn công (không bắt buộc):** hiển thị thông báo "Tìm thấy N đơn đặt bằng số này" ngay khi đăng ký để chủ thật nhận ra nếu có người khác đăng ký số của mình (xem `linkedOrders` ở [04-api-spec.md](04-api-spec.md) mục 7); admin xem được `createdAt` của tài khoản.
- **Khi muốn chặt hơn sau này:** thêm OTP SMS xác minh SĐT và chỉ gắn đơn sau khi `phone_verified_at` có giá trị (cần thêm cột và nhà cung cấp SMS). Thiết kế hiện tại không ngăn việc nâng cấp này.

## 11. Dữ liệu cá nhân và nhật ký

- **Không ghi vào log ứng dụng** họ tên, SĐT, email, địa chỉ, mật khẩu, token. Nếu cần gỡ lỗi dùng `order.code` hoặc `user.id`.
- `audit_log` chỉ lưu id, mã đơn, và JSON thay đổi của dữ liệu quản trị (không lưu mật khẩu; với `user.reset-password` chỉ ghi sự kiện, không ghi giá trị).
- Mật khẩu không bao giờ nằm trong phản hồi API hay log.
- Lưu trữ đơn: giữ vô thời hạn (cần cho bảo hành, đối soát); nếu có yêu cầu xóa dữ liệu cá nhân thì ẩn danh hóa `contact_*` thay vì xóa dòng.

## 12. Tiêu đề HTTP

- Bật `secureHeaders` của Hono: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
- Production: thêm `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- **CSP** (đề xuất, thử kỹ trước khi bật chính thức vì Radix và Sonner chèn style inline):
  `default-src 'self'; img-src 'self' data:; font-src https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- Trang tra cứu và mọi phản hồi cá nhân: `Cache-Control: no-store`.

## 13. Danh sách kiểm tra trước khi phát hành

- [ ] Không còn route admin nào thiếu `requireAdmin` (test quét route).
- [ ] Tra cứu công khai không chứa họ tên/SĐT/email đầy đủ (test tìm chuỗi gốc).
- [ ] Đặt hàng không nhận giá từ client; đổi giá sản phẩm sau khi đặt không đổi đơn.
- [ ] Hết kho thì cả đơn bị từ chối và kho không đổi (test trên D1 giả lập).
- [ ] Hủy hai lần đồng thời chỉ trả kho một lần.
- [ ] Cookie phiên có `HttpOnly`, `SameSite=Lax`, `Secure` trên https.
- [ ] Giới hạn tần suất hoạt động cho `login`, `register`, `track`, `order-create`, `upload`.
- [ ] Tải lên từ chối file không phải ảnh dù đổi đuôi và `Content-Type`; từ chối SVG; từ chối > 5 MB.
- [ ] Không có dữ liệu cá nhân trong log.
- [ ] Số vòng PBKDF2 đúng mức tối đa cho phép của Cloudflare tại thời điểm triển khai.
