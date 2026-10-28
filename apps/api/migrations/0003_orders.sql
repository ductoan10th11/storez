-- 0003_orders.sql
-- Đơn đặt giữ xe (nhận tại showroom), lịch sử trạng thái, khoản đã thu, nhật ký quản trị.

CREATE TABLE orders (
  id              TEXT PRIMARY KEY,          -- nanoid, chỉ dùng nội bộ
  code            TEXT NOT NULL UNIQUE,      -- mã đơn hiển thị, dạng SS-XXXXX-XXXXX
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL với khách chưa có tài khoản
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'ready', 'completed', 'cancelled', 'expired')),
  contact_name    TEXT NOT NULL,
  contact_phone   TEXT NOT NULL,             -- đã chuẩn hóa 0xxxxxxxxx
  contact_email   TEXT NOT NULL,             -- chữ thường
  contact_address TEXT,                      -- không bắt buộc
  note            TEXT,                      -- ghi chú của khách
  internal_note   TEXT,                      -- ghi chú nội bộ của nhân viên, không bao giờ trả cho khách
  pickup_at       INTEGER NOT NULL,          -- giờ bắt đầu khung hẹn nhận xe (epoch giây)
  subtotal        INTEGER NOT NULL CHECK (subtotal >= 0),
  total           INTEGER NOT NULL CHECK (total >= 0),           -- hiện bằng subtotal (không phí vận chuyển)
  paid_total      INTEGER NOT NULL DEFAULT 0 CHECK (paid_total >= 0),  -- tổng các dòng trong payments
  hold_expires_at INTEGER NOT NULL,          -- hết hạn giữ xe nếu vẫn pending
  last_token      TEXT,                      -- token ngẫu nhiên của lần đổi trạng thái gần nhất; chống đua khi hai bên cùng đổi (xem docs/03-data-model.md mục 6.2)
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (paid_total <= total)                 -- thu thừa tiền sẽ vi phạm ràng buộc và làm hỏng cả batch
);
CREATE INDEX idx_orders_phone  ON orders(contact_phone);
CREATE INDEX idx_orders_user   ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_orders_pickup ON orders(pickup_at);
CREATE INDEX idx_orders_hold   ON orders(status, hold_expires_at);

-- Chụp lại tên, ảnh, giá và tùy chọn tại lúc mua để sửa sản phẩm sau không làm đổi đơn cũ.
CREATE TABLE order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  image      TEXT NOT NULL,                  -- ảnh theo màu đã chọn
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),           -- đã cộng phụ phí tùy chọn
  qty        INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
  options    TEXT NOT NULL DEFAULT '[]'      -- JSON [{group, choice, hex?, price}]
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Dòng thời gian trạng thái. Đây chính là dữ liệu khách xem khi tra cứu đơn.
CREATE TABLE order_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status   TEXT NOT NULL,
  note     TEXT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,         -- NULL = hệ thống hoặc khách
  at       INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (order_id, status)                   -- mỗi trạng thái chỉ xảy ra một lần trong đời một đơn
);
CREATE INDEX idx_order_events_order ON order_events(order_id, at);

-- Từng khoản đã thu (cọc, thanh toán đủ).
CREATE TABLE payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (method IN ('cash', 'transfer')),
  note        TEXT,
  received_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  at          INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action   TEXT NOT NULL,                    -- vd product.update, order.status, user.disable
  target   TEXT,                             -- vd product:12, order:SS-XXXXX-XXXXX
  detail   TEXT,                             -- JSON trước/sau
  at       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_at ON audit_log(at);
