# 06. Đặc tả frontend

Gồm: (1) hiện trạng đã làm, (2) hướng chuyển đổi, (3) danh sách trang và thành phần cần xây, (4) quy ước giao diện. Hợp đồng dữ liệu xem [04-api-spec.md](04-api-spec.md).

## 1. Hiện trạng (as-built)

**Công nghệ:** React 19, Vite 6, TypeScript strict, Tailwind CSS 4 (cấu hình trong CSS, không có `tailwind.config`), shadcn/ui (style `new-york`, `components.json` ở `apps/web`), lucide-react, Sonner. Alias `@/` trỏ `apps/web/src`. Font Inter (Google Fonts, nạp trong `index.html`).

```
apps/web/src/
  main.tsx                 # createRoot, import ./index.css
  index.css                # @import tailwindcss + tw-animate-css; biến màu (theme) và @theme inline
  App.tsx                  # TRUNG TÂM: toàn bộ trạng thái và trang chủ + định tuyến hash
  api.ts                   # kiểu dữ liệu, hàm gọi API, vnd(), vndShort(), imageFor()
  lib/catalog.ts           # hằng số (CATEGORIES, SORTS, địa chỉ/SĐT showroom), fold(), priceOf(), defaultPicks(), readRoute()
  lib/utils.ts             # re-export cn từ gói "cn"
  components/
    SiteHeader.tsx  SiteFooter.tsx  Brand.tsx  CartSheet.tsx
    ProductCard.tsx        # card lật 3D: mặt trước giới thiệu, mặt sau thêm nhanh
    DetailPage.tsx         # trang chi tiết sản phẩm
    Swatches.tsx  ProductBadge.tsx
    ui/                    # component shadcn: badge breadcrumb button card input label radio-group select separator sheet skeleton sonner toggle toggle-group
```

**Màu và chủ đề** (biến CSS trong `index.css`, theo tên shadcn): `--primary` gần đen `#0e0e12`, `--brand` đỏ `#e5322d`, `--brand-2` cam `#ff6a3d`, `--success` xanh lá; nền trắng. Nút có biến thể `brand` (đỏ) ngoài các biến thể shadcn. Mọi nút bo tròn hoàn toàn (đã đổi `rounded-md` thành `rounded-full` trong `button.tsx`).

**Hành vi đã có:**
- Tải `GET /api/products` và `GET /api/cart` khi khởi động. Lọc theo loại (ToggleGroup), tìm không phân biệt dấu, sắp xếp theo giá (Select), tất cả **phía client**.
- Card sản phẩm: bấm bất kỳ chỗ nào trên **mặt trước** vào trang chi tiết (liên kết phủ kín ở tên xe, nút "Thêm vào giỏ" nằm trên lớp phủ). Bấm "Thêm vào giỏ" thì card **lật 3D** sang mặt sau: ảnh đổi theo màu, chấm chọn màu, hai ô chọn Select (phiên bản, phụ kiện), giá cập nhật, nút "Thêm vào giỏ" và "Chi tiết".
- Lựa chọn của khách (`picks`) lưu theo sản phẩm trong state của `App`, dùng chung giữa card, trang chi tiết và khối nổi bật.
- Trang chi tiết: ảnh lớn đổi theo màu, RadioGroup cho phiên bản/gói, bảng tính giá, số lượng, "Thêm vào giỏ" và "Mua ngay", bảng thông số (tách `spec` theo ` · `), xe cùng loại.
- Giỏ hàng: Sheet bên phải; mỗi dòng có ảnh theo màu, tùy chọn, tăng giảm, xóa. Nút "Thanh toán" hiện chỉ `alert` (chưa có checkout).
- Thông báo thêm giỏ bằng Sonner kèm nút "Xem giỏ". `Esc` lật card về.
- Định tuyến **hash**: `#/p/:id` là chi tiết, còn lại là trang chủ. Lưu và khôi phục vị trí cuộn khi quay lại.
- `cartId` sinh bằng `crypto.randomUUID()` lưu `localStorage["cart-id"]`, gửi trong header `x-cart-id`.

**Kỹ thuật giữ nguyên khi mở rộng:**
- **Card lật 3D:** `perspective` ở thẻ ngoài, `transform-style: preserve-3d` ở thẻ trong, hai mặt cùng một ô lưới (`col-start-1 row-start-1`) nên card cao bằng mặt cao hơn. Mặt đang ẩn đặt `invisible` **sau khi lật xong** (`transition: visibility 0s linear .35s`) để không bị focus bằng bàn phím hay đọc nhầm. Khi sửa `ProductCard.tsx` phải giữ nguyên các lớp `face`, `shown`, `hidden`.
- **Liên kết phủ kín:** `<a>` ở tên có `after:absolute after:inset-0`, thẻ `Card` mặt trước có `relative`; phần tử bấm riêng (nút) cần `relative z-10`.
- **`Select` của shadcn** mở bằng sự kiện `pointerdown`, nên khi kiểm thử tự động phải dùng sự kiện chuột thật chứ không `element.click()`.

## 2. Hướng chuyển đổi từ hiện trạng

| # | Việc | Lý do |
|---|---|---|
| F1 | Thay định tuyến hash bằng **`react-router`** (BrowserRouter). Worker đã có SPA fallback nên dùng được địa chỉ thường. Trang chi tiết đổi sang `/p/:slug` | Sắp có nhiều trang (đặt hàng, tra cứu, tài khoản, admin) |
| F2 | Tách **`AuthProvider`** (người dùng hiện tại, đăng nhập/xuất) và **`CartProvider`** (giỏ, thêm/xóa) ra khỏi `App.tsx`; `App.tsx` chỉ còn khung và route | `App.tsx` đang giữ mọi thứ |
| F3 | `imageFor()` trong `api.ts` hiện **suy ảnh theo màu từ tên file** (`a--mau.svg`). Thay bằng **`choice.image`** do API trả; nếu null dùng `product.image`. Xóa quy ước tên file | Ảnh do admin tải lên có tên ngẫu nhiên |
| F4 | `api.ts` đọc lỗi theo định dạng chuẩn: ném `ApiError { status, code, message, fields }`; hiện chỉ ném `Error("<status> <statusText>")` | Hiển thị lỗi từng trường và xử lý theo `code` |
| F5 | Cập nhật kiểu `Product` (thêm `slug`, `images`, `availability`, `leadTimeDays`, `Choice.image`) và `CartItem` theo [04-api-spec.md](04-api-spec.md) mục 3 | Khớp API mới |
| F6 | Hiển thị **tình trạng xe** ở card và trang chi tiết; xe `out_of_stock` vô hiệu nút thêm vào giỏ (vẫn xem được) | FR-CAT-2 |
| F7 | Dùng **TanStack Query** cho dữ liệu máy chủ ở các trang mới (admin, tài khoản, tra cứu): cache, làm mới sau khi ghi, trạng thái tải/lỗi | Admin có nhiều danh sách và thao tác ghi |
| F8 | Dùng **react-hook-form + zod** (qua `Form` của shadcn) cho mọi biểu mẫu | Kiểm tra đầu vào thống nhất với server |
| F9 | Giữ danh sách sản phẩm **tải một lần** và lọc phía client cho trang chủ (15 mẫu, đủ nhanh); chỉ chuyển sang lọc phía server khi danh mục lớn | Đơn giản |

## 3. Bản đồ trang

| Đường dẫn | Trang | Quyền | Giai đoạn |
|---|---|---|---|
| `/` | Trang chủ (hero, danh mục, danh sách, nổi bật) | public | có sẵn |
| `/p/:slug` | Chi tiết xe | public | có sẵn (đổi địa chỉ ở G1) |
| `/checkout` | Đặt xe (một trang) | public | G2 |
| `/track` | Nhập mã đơn | public | G2 |
| `/track/:code` | Tiến độ đơn (đã che); `?new=1` hiện banner đặt thành công | public | G2 |
| `/login`, `/register` | Đăng nhập, đăng ký | khách | G3 |
| `/account` | Hồ sơ, đổi mật khẩu | user | G3 |
| `/account/orders` | Đơn của tôi | user | G3 |
| `/account/orders/:code` | Chi tiết đơn (đầy đủ), hủy đơn | user | G3 |
| `/admin` | Tổng quan (thống kê, việc cần làm) | admin | G4 |
| `/admin/orders` | Bảng đơn theo trạng thái | admin | G4 |
| `/admin/orders/:code` | Chi tiết đơn: đổi trạng thái, thu tiền, ghi chú | admin | G4 |
| `/admin/orders/:code/print` | Phiếu nhận xe (giao diện in) | admin | G4 |
| `/admin/calendar` | Lịch nhận xe theo ngày | admin | G4 |
| `/admin/products` | Danh sách sản phẩm | admin | G5 |
| `/admin/products/new`, `/admin/products/:id` | Biểu mẫu sản phẩm (kèm tùy chọn và ảnh) | admin | G5 |
| `/admin/media` | Thư viện ảnh | admin | G5 |
| `/admin/users` | Người dùng | admin | G4 |
| `/admin/settings` | Cấu hình showroom | admin | G5 |

Trang `/admin/*` dùng một khung riêng (thanh bên + nội dung), không dùng header/footer cửa hàng. Chưa đăng nhập vào `/admin/*` hoặc `/account/*` thì chuyển về `/login?returnTo=<đường dẫn>`; đăng nhập xong quay lại `returnTo`. Đã đăng nhập nhưng không phải admin vào `/admin/*` thì hiện trang "Không có quyền" (không chuyển hướng im lặng).

## 4. Đặc tả từng trang mới

### 4.1 Đặt xe `/checkout`

Bố cục: hai cột trên màn hình rộng (biểu mẫu bên trái, **tóm tắt giỏ bên phải, dính khi cuộn**); một cột trên điện thoại (tóm tắt thu gọn ở đầu, mở rộng được).

**Biểu mẫu (từ trên xuống):**
1. **Thông tin liên hệ:** Họ tên, Số điện thoại, Email (cả ba bắt buộc), Địa chỉ (không bắt buộc, nhãn "Địa chỉ (không bắt buộc)"). Nếu đã đăng nhập thì điền sẵn họ tên, SĐT, email.
2. **Chọn ngày và giờ đến nhận xe:** gọi `GET /api/pickup-slots`. Hàng ngày cuộn ngang (ToggleGroup, mỗi ngày hiện thứ + ngày/tháng), bên dưới là lưới giờ (mỗi khung một nút; khung đầy hiển thị mờ, không chọn được, kèm chữ "Hết chỗ"). Chọn sẵn khung trống sớm nhất.
3. **Ghi chú** (không bắt buộc).
4. Khối thông tin nổi bật: "Nhận xe tại showroom · Thanh toán khi nhận xe · Không phí vận chuyển" kèm địa chỉ, giờ mở cửa (lấy từ `/api/settings/public`).
5. Nút **"Đặt xe"** (chiếm hết chiều rộng trên điện thoại) và dòng nhỏ "Nhân viên sẽ gọi xác nhận trong thời gian sớm nhất".

**Tóm tắt giỏ:** ảnh theo màu, tên, tùy chọn, số lượng, đơn giá, **tổng tiền**; không có dòng "phí vận chuyển" (không nhắc đến). Giỏ rỗng thì trang hiển thị trạng thái rỗng kèm nút quay lại cửa hàng.

**Hành vi:** gửi `POST /api/orders`; khi đang gửi vô hiệu nút và hiện trạng thái tải. Thành công thì làm mới giỏ (rỗng) và chuyển tới `/track/:code?new=1`. Xử lý lỗi theo bảng ở mục 5.

### 4.2 Tra cứu và tiến độ

`/track`: một ô nhập mã đơn (tự chuyển chữ hoa, chấp nhận dán `SS-XXXXX-XXXXX`, có hoặc không gạch), nút "Tra cứu". Ô tra cứu cũng đặt ở header (biểu tượng tìm kiếm mở hộp nhập mã).

`/track/:code`:
- Đầu trang: banner xanh **"Đặt xe thành công"** khi có `?new=1`, kèm mã đơn lớn, nút **Sao chép mã** (hiện thông báo "Đã sao chép"), và gợi ý "Lưu lại mã này để theo dõi đơn" cùng nút "Tạo tài khoản để xem lại đơn" (đến `/register`, đặt sẵn SĐT nếu có thể).
- **Dòng thời gian** theo `events`: các bước chuẩn "Đã nhận đơn", "Đã xác nhận", "Xe sẵn sàng", "Đã giao xe"; bước đã qua đánh dấu hoàn thành kèm giờ; bước hiện tại nổi bật; bước chưa tới mờ. Đơn `cancelled`/`expired` hiện bước cuối màu đỏ ("Đã hủy", "Hết hạn giữ xe").
- **Lịch hẹn nhận xe:** ngày giờ lớn, địa chỉ showroom, nút gọi và nút chỉ đường (mở Google Maps).
- **Danh sách xe** (ảnh, tên, tùy chọn, số lượng, tiền) và **Thanh toán:** tổng tiền, đã thu, còn lại, kèm nhãn "Chưa thu / Đã cọc / Đã đủ".
- Thông tin người đặt hiển thị **dạng đã che** đúng như API trả (không tự che thêm).
- Mã sai hoặc không có: trạng thái rỗng "Không tìm thấy đơn hàng. Kiểm tra lại mã đơn." kèm ô nhập lại.
- Với đơn `pending`: dòng thông báo "Nhân viên sẽ gọi xác nhận. Xe được giữ cho bạn đến <giờ hết hạn>" (từ `holdExpiresAt`).

### 4.3 Đăng nhập và đăng ký

- **Đăng nhập:** "Số điện thoại hoặc email", "Mật khẩu"; liên kết sang đăng ký. Lỗi `invalid_credentials` hiển thị chung trên cùng biểu mẫu.
- **Đăng ký:** Họ tên, Số điện thoại, Email (không bắt buộc), Mật khẩu (nhắc tối thiểu 8 ký tự). Thành công thì nếu `linkedOrders > 0` hiện thông báo **"Tìm thấy N đơn đặt bằng số điện thoại này"** và chuyển tới `/account/orders`, ngược lại về `returnTo` hoặc `/`.
- Cả hai trang: sau thành công làm mới giỏ (đã gộp) và trạng thái người dùng.

### 4.4 Tài khoản

- **Header:** khi chưa đăng nhập hiện "Đăng nhập"; khi đã đăng nhập hiện menu (DropdownMenu): tên người dùng, "Đơn hàng của tôi", "Tài khoản", "Quản trị" (chỉ admin), "Đăng xuất".
- **`/account`:** sửa họ tên, email; đổi mật khẩu (mật khẩu hiện tại, mới).
- **`/account/orders`:** danh sách thẻ đơn (mã, trạng thái, tổng, ngày hẹn, ảnh xe đầu tiên); trống thì có nút "Xem phương tiện".
- **`/account/orders/:code`:** như trang tiến độ nhưng thông tin liên hệ **đầy đủ**; nút "Hủy đơn" (hộp xác nhận) chỉ hiện khi `canCancel`.

### 4.5 Quản trị

**Khung:** thanh bên cố định (Tổng quan, Đơn hàng, Lịch nhận xe, Sản phẩm, Thư viện ảnh, Người dùng, Cấu hình); thu thành menu trên điện thoại. Giao diện gọn, bảng dày thông tin, ưu tiên thao tác nhanh bằng bàn phím.

**Tổng quan `/admin`:** các thẻ số: đơn chờ xác nhận, đơn sắp hết hạn giữ xe (trong 6 giờ tới), đơn hẹn hôm nay, đơn quá hẹn, xe sắp hết (kho ≤ 2); biểu đồ doanh thu thu được theo ngày; bảng xe bán chạy. Mỗi thẻ là liên kết tới danh sách đã lọc.

**Bảng đơn `/admin/orders`:**
- Hàng thẻ đếm theo trạng thái (dùng `counts`), bấm để lọc; ô tìm (mã đơn, SĐT, tên); bảng phân trang.
- Cột: mã đơn, khách (tên + SĐT, bấm số để gọi), xe đầu + "+N", tổng, đã thu (nhãn Chưa thu/Đã cọc/Đã đủ), ngày hẹn, trạng thái (Badge màu), hạn giữ xe (với `pending`). Đơn `overdue` và sắp hết hạn nổi bật.

**Chi tiết đơn `/admin/orders/:code`:**
- Thông tin khách đầy đủ + nút gọi; danh sách xe; dòng thời gian có tên người thực hiện.
- **Hành động theo trạng thái** (chỉ hiện nút hợp lệ): Pending: "Xác nhận", "Hủy"; Confirmed: "Xe sẵn sàng", "Hủy"; Ready: "Đã giao xe" (vô hiệu và giải thích "Cần thu đủ tiền" nếu `remaining > 0`), "Hủy". Mọi hành động đổi trạng thái qua hộp xác nhận (có ô ghi chú tùy chọn).
- **Thu tiền:** biểu mẫu số tiền (nút nhanh "Cọc 10%", "Thu hết phần còn lại"), hình thức (tiền mặt/chuyển khoản), ghi chú; bảng các khoản đã thu; hiển thị đã thu và còn lại.
- **Ghi chú nội bộ** (lưu khi rời ô), **Đổi lịch hẹn** (dùng cùng bộ chọn khung giờ), nút **In phiếu nhận xe**.

**Phiếu nhận xe `/admin/orders/:code/print`:** trang chỉ có nội dung phiếu (logo, mã đơn, khách, danh sách xe + tùy chọn, tổng/đã thu/còn lại, ngày hẹn, chỗ ký); dùng lớp `print:` của Tailwind, tự mở hộp thoại in khi tải.

**Lịch nhận xe `/admin/calendar`:** chọn ngày (mặc định hôm nay), hiện từng khung giờ (8:00 đến 17:00) với các đơn trong khung; bấm đơn vào chi tiết.

**Sản phẩm `/admin/products`:** bảng (ảnh, tên, loại, giá, kho, trạng thái hiện/ẩn); công tắc ẩn/hiện và ô sửa nhanh kho ngay trên bảng. Nút "Thêm sản phẩm".

**Biểu mẫu sản phẩm:**
1. **Thông tin chung:** tên, slug (tự sinh, sửa được), loại, mô tả, thông số, nhãn, giá cơ bản, kho (ô số + công tắc "Làm theo đơn"), thời gian chờ, hiện/ẩn.
2. **Ảnh sản phẩm:** vùng kéo thả hoặc chọn nhiều file; lưới ảnh có thể kéo sắp xếp, ảnh đầu là ảnh chính, nút xóa khỏi sản phẩm.
3. **Tùy chọn:** danh sách nhóm; mỗi nhóm có tên, loại (màu/lựa chọn), các lựa chọn. Mỗi lựa chọn: tên, phụ phí, (nhóm màu: ô chọn màu + **ảnh riêng của màu này**, tải lên hoặc chọn từ thư viện, có xem trước). Thêm/xóa/sắp xếp nhóm và lựa chọn. Lựa chọn đầu tiên là mặc định (nhắc phụ phí nên là 0).
4. **Xem trước** theo dạng card sản phẩm trên cửa hàng; nút Lưu (kiểm tra ở client bằng cùng schema zod).

**Bộ tải ảnh (dùng chung):** nhận file, **thu nhỏ ở trình duyệt** (vẽ lên canvas, cạnh dài tối đa 1600 px, xuất WebP chất lượng 0.85; nếu trình duyệt không xuất được WebP thì dùng JPEG 0.85), hiện xem trước và trạng thái đang tải, gửi `POST /api/admin/media`, trả `media.id` và `url` cho biểu mẫu. Kiểm tra trước: chỉ `image/jpeg|png|webp`, nhỏ hơn 5 MB sau khi thu nhỏ; lỗi hiển thị theo `code` (`unsupported_media`, `payload_too_large`).

**Người dùng `/admin/users`:** bảng (tên, SĐT, email, vai trò, số đơn, trạng thái); thao tác Khóa/Mở khóa, Đặt lại mật khẩu (hộp nhập mật khẩu mới, nhắc báo cho khách), đổi vai trò (xác nhận); không cho tự khóa/hạ quyền chính mình.

**Cấu hình `/admin/settings`:** biểu mẫu `showroom` (tên, địa chỉ, SĐT), `pickup` (giờ mở/đóng, các ngày mở, độ dài khung, sức chứa mỗi khung, báo trước tối thiểu, đặt trước tối đa), `orders` (số giờ giữ xe). Kiểm tra hợp lệ như API.

## 5. Xử lý lỗi từ API trên giao diện

| `code` | Hiển thị / hành động |
|---|---|
| `validation_failed` | Gắn thông báo vào từng ô theo `fields`; cuộn tới ô đầu tiên lỗi |
| `cart_empty` | Chuyển về cửa hàng kèm thông báo "Giỏ hàng trống" |
| `out_of_stock` | Thông báo nêu tên xe và số còn lại (`available`); làm mới giỏ |
| `product_unavailable`, `option_invalid` | "Một số xe trong giỏ đã thay đổi. Vui lòng kiểm tra lại giỏ hàng", làm mới giỏ |
| `slot_unavailable` | Tải lại danh sách khung giờ, bỏ chọn khung cũ, báo "Khung giờ này vừa hết chỗ, vui lòng chọn giờ khác" |
| `invalid_credentials` | "Sai số điện thoại/email hoặc mật khẩu" |
| `account_disabled` | "Tài khoản đã bị khóa. Vui lòng liên hệ showroom" kèm số điện thoại |
| `phone_taken`, `email_taken` | Lỗi ở ô tương ứng; với `phone_taken` gợi ý đăng nhập |
| `unauthorized` | Chuyển tới `/login?returnTo=...` |
| `forbidden` | Trang "Không có quyền" |
| `rate_limited` | "Bạn thao tác quá nhanh, vui lòng thử lại sau N giây" (từ `Retry-After`) |
| `invalid_transition`, `payment_incomplete`, `overpay` (admin) | Thông báo lỗi tại chỗ; làm mới đơn để thấy trạng thái mới nhất |
| `media_in_use`, `category_in_use` | Giải thích thứ đang dùng nó |
| Lỗi mạng hoặc `internal_error` | "Có lỗi xảy ra, vui lòng thử lại" kèm nút thử lại |

## 6. Quy ước giao diện

- **Ngôn ngữ:** tiếng Việt, câu ngắn, xưng hô trung tính ("bạn"). Không dùng thuật ngữ kỹ thuật với khách. Nhãn nút là động từ ("Đặt xe", "Tra cứu").
- **Định dạng:** tiền dùng `vnd()` (đầy đủ) ở nơi cần chính xác (chi tiết, thanh toán, tổng) và `vndShort()` ("32,9 triệu ₫", "1,15 tỷ ₫") ở danh sách/thẻ. Ngày giờ theo múi giờ Việt Nam, dạng `T2, 03/11 lúc 09:00`. SĐT hiển thị `0336 436 536`.
- **Trạng thái đơn:** màu nhất quán (Badge): pending vàng, confirmed xanh dương, ready xanh lá, completed xám đậm, cancelled/expired đỏ nhạt.
- **Tải và rỗng:** mọi danh sách có khung chờ (Skeleton) và trạng thái rỗng có hướng đi tiếp. Mọi nút gửi dữ liệu vô hiệu hóa khi đang gửi.
- **Truy cập:** nút chỉ có biểu tượng phải có `aria-label`; thứ tự Tab hợp lý; hộp thoại dùng `Dialog`/`Sheet` của shadcn (đã xử lý focus); không dựa vào màu đơn thuần để truyền đạt trạng thái (kèm chữ).
- **Điện thoại trước:** mọi trang dùng được ở 360 px; nút chính rộng hết hàng; bảng admin cuộn ngang trong khung chứ không làm trang tràn.
- **Icon:** chỉ lucide-react. **Kiểu dáng:** chỉ class Tailwind, không viết CSS riêng trừ `index.css`.
- **Thêm component shadcn khi cần:** `npx shadcn@latest add <tên> -c apps/web`. Dự kiến cần thêm: `form`, `dialog`, `alert-dialog`, `dropdown-menu`, `table`, `tabs`, `textarea`, `checkbox`, `switch`, `avatar`, `popover`, `calendar`, `alert`, `progress`, `sidebar` (hoặc tự dựng thanh bên).
- Không tự viết lại component đã có trong `ui/`; nếu cần biến thể thì thêm vào `cva` của chính component đó (như biến thể `brand` của `Button`).
