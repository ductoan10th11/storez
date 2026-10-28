# 04. Đặc tả API

Tất cả endpoint nằm dưới `/api` (ngoại lệ: ảnh ở `/media/*`). Đã có trong mã hiện tại: mục 5 (giỏ hàng) và `GET /api/products`. Phần còn lại cần xây; mục 11 ghi lại hợp đồng hiện tại để giữ tương thích.

## 1. Quy ước chung

| Chủ đề | Quy ước |
|---|---|
| Định dạng | Yêu cầu và phản hồi là JSON (`Content-Type: application/json; charset=utf-8`). Ngoại lệ: `POST /api/admin/media` dùng `multipart/form-data` |
| Phương thức ghi | `POST/PUT/PATCH/DELETE` bắt buộc `Content-Type: application/json` (trừ upload), sai thì `415 unsupported_media` |
| Xác thực | Cookie `sid` (HttpOnly, SameSite=Lax) đặt khi đăng nhập/đăng ký. Không có header `Authorization` |
| Giỏ khách | Header `x-cart-id`: chuỗi `^[\w-]{8,64}$` do trình duyệt sinh và giữ ở `localStorage`. Thiếu hoặc sai → `400 validation_failed` ở các route giỏ hàng |
| Thời gian | Mọi trường thời gian là **epoch giây** (number): `createdAt`, `pickupAt`, `at`, `holdExpiresAt`... |
| Tiền | Number nguyên VND |
| Phân trang | Query `page` (từ 1, mặc định 1) và `pageSize` (mặc định 20, tối đa 100). Phản hồi: `{ items, total, page, pageSize }` |
| Tên trường | camelCase |
| Phản hồi không cache | Mọi route cá nhân và `/api/track/*`: `Cache-Control: no-store` |
| Đầu vào chuỗi | Cắt khoảng trắng hai đầu trước khi kiểm tra |

Chữ ký ở mỗi endpoint: **Quyền** = `public` (không cần đăng nhập), `user` (đã đăng nhập), `admin`. **Giới hạn** = tên bộ giới hạn tần suất trong [05-security.md](05-security.md) mục 5.

## 2. Mã lỗi

Mọi lỗi: `{ "error": { "code": "...", "message": "tiếng Việt cho người dùng", "fields"?: { "<trường>": "<thông báo>" } } }`.

| HTTP | `code` | Khi nào | Ghi chú |
|---|---|---|---|
| 400 | `validation_failed` | Sai định dạng đầu vào | Kèm `fields` |
| 400 | `cart_empty` | Đặt hàng khi giỏ rỗng | |
| 401 | `unauthorized` | Chưa đăng nhập hoặc phiên hết hạn | |
| 401 | `invalid_credentials` | Sai SĐT/email hoặc mật khẩu | Cùng thông báo cho "không có tài khoản" và "sai mật khẩu" |
| 403 | `forbidden` | Không đủ quyền (không phải admin) | |
| 403 | `account_disabled` | Tài khoản bị khóa | |
| 404 | `not_found` | Không tìm thấy tài nguyên | |
| 404 | `order_not_found` | Mã đơn sai định dạng hoặc không tồn tại (tra cứu) | Cùng một thông báo cho hai trường hợp |
| 409 | `phone_taken`, `email_taken` | Đăng ký trùng | |
| 409 | `product_unavailable` | Sản phẩm không còn bán (`active = 0` hoặc đã xóa) | Kèm `productId` |
| 409 | `option_invalid` | Lựa chọn trong giỏ không còn hợp lệ | Kèm `productId`; frontend yêu cầu làm mới giỏ |
| 409 | `out_of_stock` | Vượt tồn kho | Kèm `productId`, `available` |
| 409 | `slot_unavailable` | Khung giờ nhận không hợp lệ hoặc đã đầy | |
| 409 | `invalid_transition` | Đổi trạng thái không hợp lệ hoặc đơn đã được xử lý bởi người khác | |
| 409 | `payment_incomplete` | Giao xe khi chưa thu đủ tiền | Kèm `remaining` |
| 409 | `overpay` | Thu vượt tổng tiền | Kèm `remaining` |
| 409 | `media_in_use`, `category_in_use` | Xóa thứ đang được dùng | |
| 409 | `self_action` | Admin tự khóa hoặc tự hạ quyền mình | |
| 413 | `payload_too_large` | Ảnh quá 5 MB | |
| 502 | `storage_error` | Cloudinary lỗi khi lưu/xóa ảnh | |
| 503 | `storage_unavailable` | Chưa cấu hình Cloudinary | |
| 415 | `unsupported_media` | Sai `Content-Type` hoặc định dạng ảnh | |
| 429 | `rate_limited` | Quá giới hạn tần suất | Header `Retry-After` (giây) |
| 500 | `internal_error` | Lỗi không lường trước | Thông điệp chung |

## 3. Kiểu dữ liệu dùng chung (TypeScript)

```ts
type Availability = 'in_stock' | 'preorder' | 'out_of_stock'
type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'completed' | 'cancelled' | 'expired'
type PaymentStatus = 'unpaid' | 'partial' | 'paid'

type Choice = {
  id: string            // option_choices.key, ổn định
  name: string
  price: number         // phụ phí (price_delta), >= 0
  hex?: string          // chỉ nhóm màu
  image: string | null  // ảnh riêng của lựa chọn (URL), null thì dùng ảnh chính
}
type OptionGroup = { id: string; name: string; type: 'color' | 'choice'; choices: Choice[] }

type Product = {
  id: number
  slug: string
  category: string               // slug danh mục
  name: string
  description: string
  spec: string                   // "125cc · Tay ga · 2 chỗ"
  badge: string                  // '' nếu không có
  price: number                  // giá cơ bản
  image: string                  // ảnh chính
  images: string[]               // thư viện, ảnh chính đứng đầu
  availability: Availability
  leadTimeDays: number | null
  options: OptionGroup[]
}

type Picks = Record<string, string>   // { [groupId]: choiceId }

type LineOption = { group: string; choice: string; hex?: string; price: number }
type CartItem = {
  id: string                     // id dòng: "<productId>~<nhóm>.<lựa chọn>~..."
  product: Product
  qty: number
  unitPrice: number              // đã cộng phụ phí
  options: LineOption[]
  image: string                  // ảnh theo màu đã chọn
}
type Cart = { items: CartItem[]; total: number; count: number }

type Contact = { name: string; phone: string; email: string; address: string | null }
type OrderItem = {
  name: string; image: string; unitPrice: number; qty: number
  options: LineOption[]
  productId: number | null       // KHÔNG có trong dữ liệu tra cứu công khai
}
type OrderEvent = { status: OrderStatus; note: string | null; at: number }

type Order = {                   // dành cho chủ đơn và người vừa đặt: đầy đủ
  code: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  total: number; paidTotal: number; remaining: number
  pickupAt: number
  createdAt: number
  holdExpiresAt: number | null   // chỉ có ý nghĩa khi status = 'pending', còn lại null
  items: OrderItem[]
  events: OrderEvent[]           // theo thời gian tăng dần
  contact: Contact
  note: string | null
  canCancel: boolean             // status ∈ {pending, confirmed}
}

type TrackedOrder = Omit<Order, 'contact' | 'note' | 'items'> & {
  contact: { name: string; phone: string; email: string }   // ĐÃ CHE, không có address
  items: Omit<OrderItem, 'productId'>[]
}

type SessionUser = { id: string; phone: string; name: string; email: string | null; role: 'customer' | 'admin' }
```

## 4. Công khai: cửa hàng

### `GET /api/settings/public`
Quyền: public. Phản hồi:
```json
{
  "showroom": { "name": "Speed Showroom", "address": "Số nhà 36, đường Z115, phường Phan Đình Phùng, tỉnh Thái Nguyên", "phone": "0336436536" },
  "pickup": { "open": "08:00", "close": "18:00", "days": [0,1,2,3,4,5,6], "slotMinutes": 60 }
}
```
Không trả `capacity`, `minNoticeHours`, `maxAdvanceDays`, `pendingHoldHours` (dùng nội bộ).

### `GET /api/categories`
`[{ "id": 1, "slug": "xe-may", "name": "Xe máy", "count": 3 }]`. `count` là số sản phẩm `active`. Sắp theo `sort`.

### `GET /api/products`
Quyền: public. Query tùy chọn: `category` (slug), `q` (tìm không phân biệt dấu trong tên và thông số), `sort` (`price_asc`, `price_desc`). Mặc định theo id. Trả **mảng** `Product[]`, chỉ sản phẩm `active = 1`. (Frontend hiện lọc phía client trên toàn bộ danh sách; tham số là để mở rộng.)

### `GET /api/products/:slug`
`Product` hoặc `404 not_found` (kể cả sản phẩm `active = 0`).

### `GET /api/pickup-slots`
Quyền: public. Query: `from` (`YYYY-MM-DD`, mặc định hôm nay theo giờ Việt Nam), `days` (1 đến 14, mặc định 7). Phản hồi:
```json
{
  "days": [
    {
      "date": "2026-11-03",
      "slots": [
        { "startsAt": 1793671200, "time": "09:00", "available": true,  "remaining": 5 },
        { "startsAt": 1793674800, "time": "10:00", "available": false, "remaining": 0 }
      ]
    }
  ]
}
```
Quy tắc (BR-ORD-5): ngày không thuộc `days`, khung ngoài giờ mở cửa, khung quá gần hoặc quá xa so với hiện tại thì **không** xuất hiện. Khung đã đầy vẫn xuất hiện với `available: false` để giao diện hiển thị mờ. `startsAt` chính là giá trị gửi lên ở `POST /api/orders`.

## 5. Giỏ hàng

Giữ nguyên hợp đồng hiện tại. Khách dùng `x-cart-id` (lưu KV); người đã đăng nhập thì giỏ lấy theo tài khoản (D1) và **bỏ qua** `x-cart-id`.

| Endpoint | Mô tả |
|---|---|
| `GET /api/cart` | Trả `Cart` |
| `POST /api/cart/items` | Body `{ productId: number, picks?: Picks, qty?: number }` (qty 1 đến 99, mặc định 1). Cộng dồn nếu trùng dòng. Trả `Cart` |
| `PUT /api/cart/items/:id` | Body `{ qty: number }`. `qty <= 0` thì xóa dòng. `:id` là id dòng (mã hóa URL). Trả `Cart` |
| `DELETE /api/cart` | Xóa toàn bộ giỏ. Trả `Cart` rỗng |

Lỗi: `404 not_found` nếu `productId` không tồn tại, `409 product_unavailable` nếu `active = 0`. Lựa chọn không hợp lệ trong `picks` được thay lặng lẽ bằng lựa chọn đầu tiên (hành vi hiện tại; riêng lúc đặt hàng thì báo lỗi, xem BR-PRC-2).

`image` của mỗi dòng: ảnh của lựa chọn màu đã chọn (`option_choices.media_id`), thiếu thì ảnh chính.

## 6. Đặt hàng và tra cứu

### `POST /api/orders`
Quyền: public (đã đăng nhập hay không đều được). Giới hạn: `order-create`. Nguồn giỏ: tài khoản nếu đã đăng nhập, không thì `x-cart-id`.

Yêu cầu:
```json
{
  "contact": { "name": "Nguyễn Văn An", "phone": "0336 436 536", "email": "an@example.com", "address": "" },
  "note": "Tôi đến sau 9 giờ",
  "pickupAt": 1793671200
}
```

| Trường | Quy tắc |
|---|---|
| `contact.name` | 2 đến 80 ký tự |
| `contact.phone` | Chuẩn hóa (bỏ dấu cách, dấu chấm, gạch, `+84` thành `0`), sau đó khớp `^0[35789]\d{8}$` |
| `contact.email` | Định dạng email, tối đa 120 ký tự, lưu chữ thường |
| `contact.address` | Không bắt buộc, tối đa 200 ký tự; chuỗi rỗng coi như không có |
| `note` | Không bắt buộc, tối đa 500 ký tự |
| `pickupAt` | Bắt buộc, phải là `startsAt` của một khung còn trống (xem `GET /api/pickup-slots`) |

Phản hồi `201`: `{ "order": Order }` (đầy đủ, `contact` không che). Thuật toán: [03-data-model.md](03-data-model.md) mục 6.1.

Lỗi: `400 validation_failed`, `400 cart_empty`, `409 out_of_stock`, `409 product_unavailable`, `409 option_invalid`, `409 slot_unavailable`, `429 rate_limited`.

### `GET /api/track/:code`
Quyền: public. Giới hạn: `track`. `Cache-Control: no-store`.

`:code` được chuẩn hóa trước khi tra (chữ hoa, bỏ dấu cách và gạch, `O` thành `0`, `I` và `L` thành `1`; phải còn đúng 10 ký tự trong bảng chữ cho phép). Phản hồi `200`:

```json
{
  "order": {
    "code": "SS-K7M2Q-9XP4D",
    "status": "confirmed",
    "paymentStatus": "partial",
    "total": 428000000, "paidTotal": 50000000, "remaining": 378000000,
    "pickupAt": 1793671200, "createdAt": 1793498400, "holdExpiresAt": null,
    "contact": { "name": "N**** V** A*", "phone": "033****536", "email": "a***@e***.com" },
    "items": [
      {
        "name": "City EV", "image": "/vehicles/o-to-city-ev--trang.svg", "unitPrice": 428000000, "qty": 1,
        "options": [ { "group": "Màu sắc", "choice": "Trắng", "hex": "#f1f1f3", "price": 0 } ]
      }
    ],
    "events": [
      { "status": "pending",   "note": null, "at": 1793498400 },
      { "status": "confirmed", "note": null, "at": 1793502000 }
    ],
    "canCancel": false
  }
}
```

Không trả: địa chỉ, ghi chú khách, ghi chú nội bộ, `productId`, id người dùng. `canCancel` luôn `false` ở tra cứu công khai (hủy chỉ dành cho chủ tài khoản hoặc admin). Lỗi: `404 order_not_found` (cùng một thông báo cho mã sai định dạng và mã không tồn tại), `429 rate_limited`.

## 7. Xác thực

### `GET /api/auth/me`
Quyền: public. Luôn `200`: `{ "user": SessionUser | null }`. Dùng để khởi động frontend không sinh lỗi 401.

### `POST /api/auth/register`
Quyền: public. Giới hạn: `register`.
```json
{ "phone": "0336 436 536", "password": "matkhau-dai-8-ky-tu", "name": "Nguyễn Văn An", "email": "an@example.com" }
```
`email` không bắt buộc. Mật khẩu 8 đến 128 ký tự. Phản hồi `201`:
```json
{ "user": { "id": "V1StGXR8_Z5jdHi6B-myT", "phone": "0336436536", "name": "Nguyễn Văn An", "email": "an@example.com", "role": "customer" }, "linkedOrders": 2, "mergedCartLines": 1 }
```
Đặt cookie `sid`. `linkedOrders` là số đơn cũ được gắn theo SĐT (BR-ACC-1); `mergedCartLines` là số dòng giỏ khách được gộp (nếu có `x-cart-id`). Lỗi: `409 phone_taken`, `409 email_taken`, `400 validation_failed`, `429`.

### `POST /api/auth/login`
Quyền: public. Giới hạn: `login`.
```json
{ "identifier": "0336436536", "password": "matkhau-dai-8-ky-tu" }
```
`identifier` chứa `@` thì là email, ngược lại là SĐT (chuẩn hóa). Phản hồi `200`: `{ "user": SessionUser, "mergedCartLines": 0 }` và đặt cookie `sid`. Lỗi: `401 invalid_credentials`, `403 account_disabled`, `429`.

### `POST /api/auth/logout`
Quyền: user. Xóa phiên hiện tại và cookie. `204`.

## 8. Tài khoản và đơn của tôi

Quyền: `user` cho cả mục này.

| Endpoint | Mô tả |
|---|---|
| `PATCH /api/account` | Body `{ name?: string, email?: string \| null }`. Trả `{ user }`. Lỗi `409 email_taken` |
| `POST /api/account/password` | Body `{ currentPassword, newPassword }`. Hủy **mọi phiên khác** (giữ phiên hiện tại). `204`. Lỗi `401 invalid_credentials` nếu sai mật khẩu hiện tại |
| `GET /api/account/orders` | Phân trang, mới nhất trước. Mỗi dòng: `{ code, status, paymentStatus, total, pickupAt, createdAt, items: [{ name, image, qty }] }` |
| `GET /api/account/orders/:code` | `{ order: Order }` đầy đủ, **không che**. `404 order_not_found` nếu đơn không thuộc người dùng |
| `POST /api/account/orders/:code/cancel` | Body `{ reason?: string }` (tối đa 200 ký tự). Chỉ chủ đơn, chỉ khi `pending` hoặc `confirmed`. Trả `{ order }`. Lỗi `409 invalid_transition` |

## 9. Quản trị

Quyền: `admin` cho mọi route `/api/admin/*`. Chưa đăng nhập `401`, không phải admin `403`. Mọi thao tác ghi tạo một dòng `audit_log`.

### 9.1 Sản phẩm và danh mục

Dạng ghi sản phẩm (dùng cho `POST` và `PUT`):

```ts
type ProductInput = {
  name: string                    // 2..120
  slug?: string                   // bỏ trống thì sinh từ tên; a-z0-9 và dấu gạch; duy nhất
  category: string                // slug danh mục
  description: string             // <= 2000
  spec: string                    // <= 200
  badge: string                   // <= 20, '' nếu không có
  basePrice: number               // nguyên >= 0
  stock: number | null            // null = làm theo đơn
  leadTimeDays: number | null
  active: boolean
  images: number[]                // media.id theo thứ tự; phần tử đầu là ảnh chính; cho phép []
  options: {
    key: string                   // [a-z0-9-]+, duy nhất trong sản phẩm
    name: string
    type: 'color' | 'choice'
    choices: {
      key: string                 // [a-z0-9-]+, duy nhất trong nhóm
      name: string
      priceDelta: number          // nguyên >= 0
      hex?: string                // bắt buộc với type 'color': #rrggbb
      mediaId?: number | null     // ảnh riêng
    }[]                           // tối thiểu 1 lựa chọn
  }[]
}
```

| Endpoint | Mô tả |
|---|---|
| `GET /api/admin/products` | Phân trang. Query `q`, `category`, `active` (`0`/`1`). Mỗi dòng có thêm `stock`, `active` |
| `GET /api/admin/products/:id` | Đầy đủ để sửa: `ProductInput` cộng `id`, `images` kèm `url` và `id`, lựa chọn kèm `mediaId` và `image` |
| `POST /api/admin/products` | Body `ProductInput`. `201 { product }` |
| `PUT /api/admin/products/:id` | Thay toàn bộ (cả `images` và `options`), đối chiếu nhóm và lựa chọn theo `key`: có thì cập nhật, mới thì thêm, thiếu thì xóa. Tất cả trong một `batch`. Trả `{ product }` |
| `PATCH /api/admin/products/:id` | Body `{ active?: boolean, stock?: number \| null }` (đổi nhanh trên bảng) |
| `DELETE /api/admin/products/:id` | Xóa hẳn. Đơn cũ giữ nguyên bản chụp (`product_id` thành NULL). `204` |
| `GET/POST /api/admin/categories` | Danh sách (kèm số sản phẩm) / thêm `{ slug, name, sort? }` |
| `PUT /api/admin/categories/:id` | Sửa `{ name, sort }` (không đổi `slug` đã có sản phẩm) |
| `DELETE /api/admin/categories/:id` | `409 category_in_use` nếu còn sản phẩm |

Lỗi dùng chung: `400 validation_failed` (kèm `fields`, ví dụ `"options.0.choices.1.hex"`), `409 conflict` khi trùng `slug`, `404 not_found`.

### 9.2 Ảnh

| Endpoint | Mô tả |
|---|---|
| `POST /api/admin/media` | `multipart/form-data`, trường `file` (một ảnh). Giới hạn `upload`. Kiểm tra theo [05-security.md](05-security.md) mục 7. `201 { media: { id, url, mime, size, width, height } }` |
| `GET /api/admin/media` | Thư viện ảnh, phân trang, mới nhất trước; mỗi ảnh kèm `inUse: boolean` |
| `DELETE /api/admin/media/:id` | Xóa khỏi R2 và bảng. `409 media_in_use` nếu còn được `product_images` hoặc `option_choices` dùng. `204` |

Ảnh tải lên lưu ở Cloudinary; `media.url` là URL https tuyệt đối (`https://res.cloudinary.com/...`), không còn route `/media/*`. Lỗi: `503 storage_unavailable` khi chưa cấu hình `CLOUD_*`, `502 storage_error` khi Cloudinary từ chối hoặc lỗi.

### 9.3 Đơn hàng

```ts
type AdminOrder = Order & {
  internalNote: string | null
  userId: string | null
  payments: { amount: number; method: 'cash' | 'transfer'; note: string | null; at: number; receivedBy: string | null }[]
  events: (OrderEvent & { actor: string | null })[]       // tên người thực hiện
  overdue: boolean              // confirmed hoặc ready mà pickupAt đã qua hơn 24 giờ
}
type AdminOrderSummary = {
  code: string; status: OrderStatus; paymentStatus: PaymentStatus
  total: number; paidTotal: number
  contactName: string; contactPhone: string      // KHÔNG che trong admin
  pickupAt: number; createdAt: number; holdExpiresAt: number | null; overdue: boolean
  itemCount: number; firstItemName: string
}
```

| Endpoint | Mô tả |
|---|---|
| `GET /api/admin/orders` | Query `status` (một hoặc nhiều, phân cách dấu phẩy), `q` (khớp mã đơn, SĐT, tên), `from`, `to` (epoch giây theo `createdAt`), `page`, `pageSize`. Trả `{ items: AdminOrderSummary[], total, page, pageSize, counts: { pending, confirmed, ready, completed, cancelled, expired } }` (`counts` không phụ thuộc bộ lọc `status`, dùng cho thẻ đếm trên bảng) |
| `GET /api/admin/orders/:code` | `{ order: AdminOrder }` |
| `POST /api/admin/orders/:code/status` | Body `{ status: OrderStatus, note?: string }`. `status` chỉ là `confirmed`, `ready`, `completed`, `cancelled`. Theo bảng BR-ORD-1 và mẫu chống đua ở [03-data-model.md](03-data-model.md) 6.2. Trả `{ order }`. Lỗi `409 invalid_transition`, `409 payment_incomplete` |
| `POST /api/admin/orders/:code/payments` | Body `{ amount: number (>0), method: 'cash' \| 'transfer', note?: string }`. Trả `{ order }`. Lỗi `409 overpay`, `409 invalid_transition` (đơn đã hủy/hết hạn) |
| `PATCH /api/admin/orders/:code` | Body `{ internalNote?: string \| null, pickupAt?: number }`. `pickupAt` phải là khung hợp lệ (cùng kiểm tra như đặt hàng). Trả `{ order }` |
| `GET /api/admin/calendar` | Query `from`, `to` (`YYYY-MM-DD`, tối đa 14 ngày). `{ days: [{ date, slots: [{ startsAt, time, orders: AdminOrderSummary[] }] }] }`; chỉ gồm đơn `pending`, `confirmed`, `ready` |

Phiếu nhận xe là trang in của frontend dựng từ `AdminOrder`, không có endpoint riêng.

### 9.4 Người dùng

| Endpoint | Mô tả |
|---|---|
| `GET /api/admin/users` | Phân trang. Query `q` (SĐT, tên, email), `role`. Mỗi dòng: `{ id, phone, name, email, role, disabled, createdAt, orderCount }` |
| `PATCH /api/admin/users/:id` | Body `{ disabled?: boolean, role?: 'customer' \| 'admin', name?: string }`. Khóa (`disabled: true`) thì **xóa mọi phiên** của người đó. Admin không tự khóa hoặc tự hạ quyền mình: `409 self_action` |
| `POST /api/admin/users/:id/reset-password` | Body `{ newPassword }` (8 đến 128 ký tự, admin tự đặt rồi báo khách). Xóa mọi phiên của người đó. `204` |

### 9.5 Cấu hình và thống kê

| Endpoint | Mô tả |
|---|---|
| `GET /api/admin/settings` | `{ showroom, pickup, orders }` đầy đủ |
| `PUT /api/admin/settings/:key` | `:key` là `showroom`, `pickup`, hoặc `orders`. Body `{ value }` được kiểm tra theo schema từng khóa (ví dụ `pickup.open < pickup.close`, `slotMinutes` chia hết khoảng mở cửa, `days` ⊂ 0..6). Trả giá trị mới |
| `GET /api/admin/stats` | Query `from`, `to` (`YYYY-MM-DD`, mặc định 30 ngày gần nhất). Xem dưới |

`GET /api/admin/stats` phản hồi:
```json
{
  "range": { "from": "2026-10-01", "to": "2026-10-30" },
  "orders": { "total": 40, "byStatus": { "pending": 3, "confirmed": 5, "ready": 2, "completed": 25, "cancelled": 3, "expired": 2 } },
  "collected": 1850000000,
  "cancelRate": 0.125,
  "byDay": [ { "date": "2026-10-01", "orders": 2, "collected": 80000000 } ],
  "byCategory": [ { "category": "xe-may", "orders": 12, "collected": 400000000 } ],
  "topProducts": [ { "name": "SUV Ranger 7 chỗ", "qty": 6, "revenue": 6900000000 } ]
}
```
`collected` tính từ **các khoản đã thu** (`payments.at` trong khoảng), không phải tổng giá trị đơn. `cancelRate = (cancelled + expired) / total`. `topProducts` tính theo `order_items` của đơn không bị hủy/hết hạn, tối đa 5.

## 10. Việc định kỳ (không phải endpoint)

Xem [02-architecture.md](02-architecture.md) mục 7.

## 11. Hợp đồng hiện tại (as-built, cần giữ tương thích ở G0)

Mã hiện ở `apps/api/src/index.ts`. Test của G0 phải khóa các hành vi sau trước khi tái cấu trúc.

- `GET /api/products` trả **mảng** theo thứ tự `id`; mỗi phần tử có `id, name, description, price, image, category, badge, spec, options` (với `options` đã parse, không còn chuỗi JSON). Trường mới ở G1 (`slug`, `images`, `availability`, `leadTimeDays`, `image` của lựa chọn) **chỉ thêm, không đổi tên**, để frontend cũ không hỏng.
- `GET /api/cart` thiếu `x-cart-id` hợp lệ trả `400 {"error":"missing x-cart-id"}` ở định dạng lỗi **cũ** (chuỗi). Ở G0 chuyển sang định dạng lỗi chuẩn mục 2, cập nhật frontend nếu có chỗ đọc `error` dạng chuỗi (hiện frontend chỉ đọc `res.statusText`).
- Id dòng giỏ hàng: `"<productId>~" + các cặp "<nhóm>.<lựa chọn>" sắp theo tên nhóm, nối bằng "~"`. Ví dụ `6~an-toan.nang-cao~mau.cam~noi-that.da-nau`. Sản phẩm không có nhóm tùy chọn thì id là `"<productId>~"`. Dòng cũ không có `id` (giỏ lưu trước khi có tùy chọn) coi như `"<productId>~"`.
- Giỏ cũ lưu KV dạng `[{ id?, productId, qty, picks? }]` với khóa `cart:<cartId>`, TTL 30 ngày.
- `POST /api/cart/items`: lựa chọn không hợp lệ hoặc thiếu được thay bằng lựa chọn đầu tiên của nhóm; `qty` mặc định 1; tối đa 99 mỗi dòng.
- `PUT /api/cart/items/:id`: `qty <= 0` xóa dòng; `qty` bị chặn trên ở 99.
- `unitPrice = price + Σ giá lựa chọn`; `total = Σ unitPrice × qty`; `count = Σ qty`. Mỗi dòng giỏ có `image` đã đổi theo màu (suy ra từ tên file `a--<màu>.svg`; sẽ thay bằng `option_choices.media_id` ở G1).
