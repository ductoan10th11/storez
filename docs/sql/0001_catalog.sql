-- 0001_catalog.sql
-- Danh mục sản phẩm, ảnh, tùy chọn và cấu hình showroom.
-- Quy ước: tiền là INTEGER (VND); thời gian là INTEGER (epoch giây, UTC).

-- Cấu hình showroom, sửa được trong trang admin. value là JSON.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Mỗi ảnh. r2_key NULL nghĩa là ảnh tĩnh đi kèm bản build (ảnh minh họa ban đầu).
CREATE TABLE media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT NOT NULL UNIQUE,          -- đường dẫn công khai, vd /media/products/1/abc.webp
  r2_key     TEXT UNIQUE,                   -- khóa trong R2, NULL với ảnh tĩnh
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  width      INTEGER,
  height     INTEGER,
  created_by TEXT,                          -- users.id của admin tải lên
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  category_id    INTEGER NOT NULL REFERENCES categories(id),
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  spec           TEXT NOT NULL DEFAULT '',  -- thông số ngắn, ngăn cách bằng " · "
  badge          TEXT NOT NULL DEFAULT '',  -- nhãn trên ảnh: Bán chạy, Mới, ...
  base_price     INTEGER NOT NULL CHECK (base_price >= 0),
  stock          INTEGER CHECK (stock IS NULL OR stock >= 0),            -- NULL = làm theo đơn
  lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),    -- 0 = ẩn khỏi cửa hàng
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_products_category ON products(category_id, active);

-- Thư viện ảnh của sản phẩm. Ảnh chính là ảnh có sort nhỏ nhất.
CREATE TABLE product_images (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id   INTEGER NOT NULL REFERENCES media(id),
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, media_id)
);
CREATE INDEX idx_product_images_sort ON product_images(product_id, sort);

CREATE TABLE option_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,                  -- id ổn định dùng trong giỏ hàng, vd "mau", "noi-that"
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('color', 'choice')),
  sort       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, key)
);

-- Lựa chọn trong nhóm. Mỗi lựa chọn có thể có ảnh riêng (đặc biệt là màu).
CREATE TABLE option_choices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    INTEGER NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  name        TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  hex         TEXT,                          -- mã màu, chỉ dùng với nhóm type = 'color'
  media_id    INTEGER REFERENCES media(id) ON DELETE SET NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (group_id, key)
);
