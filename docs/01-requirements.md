# 01. Yêu cầu nghiệp vụ

Mỗi yêu cầu có mã (FR = chức năng, BR = quy tắc nghiệp vụ, NFR = phi chức năng) để [07-implementation-plan.md](07-implementation-plan.md) tham chiếu.

## 1. Bối cảnh và nguyên tắc thiết kế

Xe là hàng giá trị cao, mua ít lần, khách thường cần tư vấn và phải đến tận nơi nhận. "Đặt hàng" ở đây là **đặt giữ xe và hẹn ngày nhận tại showroom**.

Thiết kế đi từ phễu bán hàng, mỗi tính năng phục vụ một bước:

| Bước | Khách cần làm | Hệ thống phải có |
|---|---|---|
| 1. Khám phá | Tìm, lọc xe | Danh mục, tìm kiếm, tình trạng xe (có sẵn / đặt trước / hết) |
| 2. Cân nhắc | Chọn màu, phiên bản, xem giá thật | Tùy chọn có ảnh riêng, giá tính theo tùy chọn, **không phí ẩn** |
| 3. Quyết định | Đặt xe nhanh, ít ma sát | Đặt hàng **không cần tài khoản**, form ngắn, chọn ngày nhận |
| 4. Xác nhận | Biết đơn đã được nhận | Mã đơn, trang thành công, tra cứu bằng mã, nhân viên gọi xác nhận |
| 5. Nhận xe | Đến showroom đúng hẹn | Lịch hẹn, trạng thái "xe sẵn sàng", phiếu nhận xe in được |
| 6. Sau bán | Xem lại đơn | Tài khoản tự thấy các đơn đã đặt bằng SĐT |

Nguyên tắc: **bớt bước ở bước 3**, và **cho khách luôn thấy mình đang ở đâu** ở bước 4 đến 5. Nhân viên phải thấy ngay việc cần làm hôm nay.

## 2. Vai trò

| Vai trò | Định nghĩa | Làm được |
|---|---|---|
| Khách vãng lai | Không đăng nhập | Xem xe, giỏ hàng (lưu theo trình duyệt), đặt xe, tra cứu đơn bằng mã |
| Khách có tài khoản | `users.role = customer` | Mọi thứ của khách vãng lai + xem đầy đủ các đơn của mình, hủy đơn, sửa hồ sơ, giỏ hàng lưu theo tài khoản |
| Quản trị | `users.role = admin` | Toàn bộ trang quản trị: sản phẩm, ảnh, đơn, thu tiền, người dùng, cấu hình |

## 3. Yêu cầu chức năng

### 3.1 Danh mục và sản phẩm

| Mã | Yêu cầu |
|---|---|
| FR-CAT-1 | Khách xem danh sách xe, lọc theo loại, tìm theo tên/thông số (không phân biệt dấu), sắp xếp theo giá |
| FR-CAT-2 | Mỗi xe hiển thị **tình trạng**: `in_stock` (có sẵn tại showroom), `preorder` (đặt trước, nhận sau khoảng N ngày), `out_of_stock` (hết hàng) |
| FR-CAT-3 | Mỗi xe có nhóm tùy chọn (màu, phiên bản, gói...). Mỗi lựa chọn có phụ phí (≥ 0) và có thể có ảnh riêng. Chọn lựa chọn khác thì giá và ảnh đổi theo |
| FR-CAT-4 | Xe `active = 0` không xuất hiện ở cửa hàng và không đặt được, nhưng đơn cũ vẫn xem được |
| FR-CAT-5 | Trang chi tiết xe có địa chỉ cố định theo `slug`, chia sẻ được |

### 3.2 Giỏ hàng

| Mã | Yêu cầu |
|---|---|
| FR-CART-1 | Khách vãng lai thêm xe kèm tùy chọn vào giỏ, giỏ lưu theo trình duyệt (KV, như hiện tại) |
| FR-CART-2 | Cùng xe và cùng tùy chọn thì gộp một dòng; tùy chọn khác thì dòng khác. Số lượng 1 đến 99 |
| FR-CART-3 | Người đã đăng nhập có giỏ lưu theo tài khoản (D1) |
| FR-CART-4 | Khi đăng nhập hoặc đăng ký, giỏ của khách được **gộp** vào giỏ tài khoản (cộng số lượng nếu trùng dòng, tối đa 99), rồi xóa giỏ KV |

### 3.3 Đặt xe (checkout)

| Mã | Yêu cầu |
|---|---|
| FR-ORD-1 | Đặt xe **không cần đăng nhập**. Một trang duy nhất gồm: họ tên (bắt buộc), SĐT (bắt buộc), email (bắt buộc), địa chỉ (không bắt buộc), ghi chú (không bắt buộc), **ngày và khung giờ đến nhận xe** (bắt buộc) |
| FR-ORD-2 | Trang hiển thị rõ: nhận xe tại showroom, thanh toán khi nhận xe, **không có phí vận chuyển**, kèm địa chỉ và giờ mở cửa showroom |
| FR-ORD-3 | Khách chọn khung giờ nhận từ danh sách khung còn trống (giờ mở cửa, độ dài khung, số đơn tối đa mỗi khung theo cấu hình) |
| FR-ORD-4 | Server tính lại toàn bộ giá từ CSDL, kiểm tra tùy chọn còn hợp lệ và kho, rồi tạo đơn. **Không nhận giá từ client** |
| FR-ORD-5 | Sau khi đặt: hiển thị mã đơn lớn và nút sao chép, trạng thái, lịch hẹn, địa chỉ showroom, nút "Theo dõi đơn". Gợi ý tạo tài khoản để xem lại đơn |
| FR-ORD-6 | Xe có số lượng kho: đặt hàng **giữ kho** ngay (trừ số lượng). Hủy hoặc hết hạn thì trả lại kho |
| FR-ORD-7 | Đơn lưu **bản chụp** tên xe, ảnh, giá và tùy chọn lúc mua. Sửa hoặc xóa sản phẩm sau đó không làm đổi đơn cũ |
| FR-ORD-8 | Nếu khách đang đăng nhập, đơn gắn vào tài khoản. Nếu không, và đã có tài khoản dùng SĐT đó, đơn cũng gắn vào tài khoản đó (xem BR-ACC-1) |

### 3.4 Tra cứu đơn

| Mã | Yêu cầu |
|---|---|
| FR-TRK-1 | Trang tra cứu công khai: nhập mã đơn, xem tiến độ. Không cần đăng nhập |
| FR-TRK-2 | Hiển thị dòng thời gian các bước ("Đã nhận đơn", "Đã xác nhận", "Xe sẵn sàng", "Đã giao", hoặc "Đã hủy"/"Hết hạn") kèm thời điểm, ngày hẹn nhận, danh sách xe và tùy chọn, tổng tiền, **đã thu và còn lại** |
| FR-TRK-3 | **Che thông tin nhạy cảm:** họ tên, SĐT, email bị che một phần; địa chỉ và ghi chú của khách không hiển thị. Quy tắc che xem [05-security.md](05-security.md) mục 6 |
| FR-TRK-4 | Mã nhập vào được chuẩn hóa (chữ hoa, bỏ dấu cách và gạch, nhầm lẫn `O/I/L`) trước khi tra. Mã sai và mã không tồn tại cho cùng một thông báo |

### 3.5 Tài khoản

| Mã | Yêu cầu |
|---|---|
| FR-ACC-1 | Đăng ký bằng SĐT, mật khẩu, họ tên; email tùy chọn. Đăng nhập bằng SĐT hoặc email + mật khẩu |
| FR-ACC-2 | Ngay sau khi đăng ký, mọi đơn đã đặt bằng SĐT đó tự động hiện trong tài khoản (BR-ACC-1) |
| FR-ACC-3 | Người dùng xem danh sách đơn, chi tiết đầy đủ (không che) của đơn mình, hủy đơn khi còn cho phép |
| FR-ACC-4 | Sửa họ tên, email; đổi mật khẩu (đăng xuất mọi thiết bị khác) |
| FR-ACC-5 | Đăng xuất; hủy phiên hiện tại |
| FR-ACC-6 | Quên mật khẩu: **chưa làm** (D8). Admin đặt lại mật khẩu cho người dùng |

### 3.6 Quản trị

| Mã | Yêu cầu |
|---|---|
| FR-ADM-1 | Chỉ `role = admin` vào được. Admin đầu tiên tạo bằng lệnh CLI, không có đường tự đăng ký thành admin |
| FR-ADM-2 | **Sản phẩm:** thêm, sửa, ẩn/hiện, xóa; sửa nhóm và lựa chọn tùy chọn (tên, phụ phí, màu, ảnh); đặt tồn kho và thời gian chờ |
| FR-ADM-3 | **Ảnh:** tải ảnh lên cho sản phẩm (nhiều ảnh, sắp xếp, ảnh chính) và **ảnh riêng cho từng lựa chọn**. Xóa ảnh không còn dùng |
| FR-ADM-4 | **Đơn hàng:** bảng đơn theo trạng thái, tìm theo mã/SĐT/tên, xem chi tiết, đổi trạng thái hợp lệ, ghi ghi chú nội bộ |
| FR-ADM-5 | **Thu tiền:** ghi từng khoản đã thu (tiền mặt hoặc chuyển khoản) cho một đơn; thấy đã thu và còn lại; không thu quá tổng tiền |
| FR-ADM-6 | **Lịch nhận xe:** xem các đơn theo ngày và khung giờ hẹn |
| FR-ADM-7 | **Phiếu nhận xe** in được (mã đơn, khách, xe và tùy chọn, tổng, đã thu, còn lại, ngày hẹn) |
| FR-ADM-8 | **Người dùng:** danh sách, tìm theo SĐT, khóa/mở khóa, đặt lại mật khẩu, đổi vai trò |
| FR-ADM-9 | **Cấu hình showroom:** địa chỉ, SĐT, giờ mở cửa, các ngày mở, độ dài và sức chứa khung hẹn, số giờ giữ xe |
| FR-ADM-10 | **Thống kê:** số đơn và doanh thu thu được theo ngày, theo dòng xe, xe bán chạy, tỉ lệ hủy/hết hạn |
| FR-ADM-11 | Mọi thao tác ghi của admin được ghi vào `audit_log` |

### 3.7 Tự động hóa

| Mã | Yêu cầu |
|---|---|
| FR-AUTO-1 | Mỗi giờ, đơn `pending` quá `hold_expires_at` chuyển `expired` và trả lại kho |
| FR-AUTO-2 | Dọn phiên đăng nhập hết hạn và ảnh mồ côi (không còn được tham chiếu) định kỳ |

## 4. Quy tắc nghiệp vụ

### BR-ORD: đơn hàng

**BR-ORD-1. Vòng đời đơn**

```
pending ─xác nhận→ confirmed ─xe sẵn sàng→ ready ─giao xe→ completed
   │                   │                      │
   └──────── cancelled ┴──────── cancelled ───┘
pending ─quá hạn giữ xe→ expired   (tự động)
```

| Từ | Sang | Ai làm | Điều kiện |
|---|---|---|---|
| (tạo) | `pending` | Khách | Đặt thành công |
| `pending` | `confirmed` | Admin | Nhân viên đã gọi xác nhận |
| `confirmed` | `ready` | Admin | Xe đã sẵn sàng để nhận |
| `ready` | `completed` | Admin | Đã giao xe. **Chỉ cho phép khi `paid_total = total`** |
| `pending`, `confirmed` | `cancelled` | Khách (chủ đơn đã đăng nhập) hoặc Admin | Trả lại kho |
| `ready` | `cancelled` | Admin | Trả lại kho |
| `pending` | `expired` | Hệ thống | `hold_expires_at` đã qua, trả lại kho |
| `completed`, `cancelled`, `expired` | (không đi tiếp) | | Trạng thái cuối |

Mỗi lần đổi trạng thái ghi một dòng `order_events` (kèm ai làm và ghi chú).

**BR-ORD-2. Thanh toán.** Không có thanh toán trực tuyến. Trạng thái thanh toán là **suy ra** từ `paid_total` và `total`: `0` là chưa thu; `0 < paid_total < total` là đã cọc; `paid_total = total` là đã đủ. Không thu quá `total`.

**BR-ORD-3. Tổng tiền.** `total = subtotal = Σ (đơn giá đã cộng phụ phí × số lượng)`. Không có phí vận chuyển, không thuế riêng.

**BR-ORD-4. Hết hạn giữ xe.** `hold_expires_at = created_at + pendingHoldHours × 3600`. Chỉ đơn `pending` bị hết hạn. Đơn đã `confirmed` không tự hết hạn; nếu quá ngày hẹn mà chưa nhận, admin thấy cảnh báo "quá hẹn" và tự quyết định.

**BR-ORD-5. Khung giờ nhận.** Một khung hợp lệ khi: ngày nằm trong `days`; giờ bắt đầu ≥ `open` và giờ kết thúc ≤ `close`; bắt đầu cách hiện tại ≥ `minNoticeHours` và ≤ `maxAdvanceDays`; số đơn đang hoạt động (`pending`, `confirmed`, `ready`) cùng khung chưa đạt `capacity`.

### BR-STK: tồn kho

**BR-STK-1.** `stock` là số nguyên ≥ 0: xe có sẵn, đặt hàng trừ kho. `stock = NULL`: làm theo đơn, không trừ kho, hiển thị thời gian chờ `lead_time_days` nếu có.

**BR-STK-2.** Tình trạng hiển thị: `stock` là số > 0 thì `in_stock`; `stock = 0` thì `out_of_stock`; `stock = NULL` thì `preorder`.

**BR-STK-3.** Số lượng khách đặt không được vượt `stock`. Vượt thì từ chối cả đơn với `out_of_stock`, không tạo đơn một phần.

### BR-PRC: giá

**BR-PRC-1.** Đơn giá một dòng = `base_price` + Σ `price_delta` của các lựa chọn đã chọn. Mỗi nhóm tùy chọn luôn có đúng một lựa chọn được chọn (mặc định là lựa chọn đầu tiên khi khách chưa chọn).

**BR-PRC-2.** Lựa chọn không hợp lệ (không thuộc xe, đã bị xóa) khi đặt hàng: từ chối với `option_invalid`, yêu cầu khách làm mới giỏ.

### BR-ACC: tài khoản

**BR-ACC-1. Tự gắn đơn theo SĐT, không xác minh.** Khi một tài khoản được tạo với SĐT X, mọi đơn có `contact_phone = X` và `user_id IS NULL` được gắn vào tài khoản đó. Đơn tạo sau này với SĐT X cũng được gắn (FR-ORD-8). Rủi ro đã được chấp nhận, xem [05-security.md](05-security.md) mục 10.

**BR-ACC-2.** SĐT và email là duy nhất. SĐT không đổi được trong phiên bản này (đổi SĐT làm thay đổi tập đơn được gắn).

**BR-ACC-3.** Tài khoản bị khóa không đăng nhập được; mọi phiên của tài khoản bị hủy ngay.

### BR-TRK: tra cứu

**BR-TRK-1.** Tra cứu chỉ trả dữ liệu **đã che**, không trả `internal_note`, địa chỉ khách, ghi chú khách, id người dùng. Phản hồi không được cache.

**BR-TRK-2.** Có giới hạn tần suất theo IP (xem [05-security.md](05-security.md) mục 5).

## 5. Yêu cầu phi chức năng

| Mã | Yêu cầu |
|---|---|
| NFR-1 | Tính toán giá và tạo đơn ở server; mọi thao tác ghi nhiều bảng dùng `db.batch()` để nguyên tử |
| NFR-2 | Mọi đầu vào được kiểm tra bằng schema (zod) ở tầng route; lỗi trả về dạng chuẩn |
| NFR-3 | Dữ liệu cá nhân (họ tên, SĐT, email) không ghi vào log ứng dụng |
| NFR-4 | Trang cửa hàng tải nhanh: danh sách sản phẩm là một request, ảnh tải lười; ảnh tải lên có `Cache-Control` bất biến |
| NFR-5 | Giao diện dùng được trên điện thoại (mọi trang), thao tác chính đạt chuẩn truy cập cơ bản (bàn phím, nhãn cho nút biểu tượng) |
| NFR-6 | Có kiểm thử tự động cho giá, đơn hàng, tra cứu (che dữ liệu), xác thực, phân quyền (xem [07-implementation-plan.md](07-implementation-plan.md)) |
| NFR-7 | Có migration có thứ tự và có thể chạy lại trên DB mới; có tách môi trường staging và production |

## 6. Ngoài phạm vi (phiên bản này)

- Cổng thanh toán trực tuyến (VNPay, MoMo, thẻ).
- Giao hàng, tính phí vận chuyển, nhiều địa chỉ giao.
- Gửi email hoặc SMS (xác nhận đơn, quên mật khẩu, OTP). Chỗ tích hợp để dành cho giai đoạn sau (G6).
- Xác minh số điện thoại.
- Mã giảm giá, khuyến mãi, so sánh xe, đánh giá sản phẩm.
- Nhiều chi nhánh showroom, nhiều ngôn ngữ, nhiều loại tiền.
- Chia nhỏ quyền quản trị.
- Yêu cầu tư vấn và đặt lịch lái thử (ý tưởng đã nêu trong G6, chưa chi tiết).
