-- 0002_auth.sql
-- Người dùng, phiên đăng nhập và giỏ hàng của người đã đăng nhập.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,            -- chuỗi ngẫu nhiên (nanoid 21 ký tự)
  phone         TEXT NOT NULL UNIQUE,        -- đã chuẩn hóa dạng 0xxxxxxxxx
  email         TEXT UNIQUE,                 -- chữ thường; NULL được phép (nhiều dòng NULL không vi phạm UNIQUE)
  password_hash TEXT NOT NULL,               -- pbkdf2$sha256$<vòng lặp>$<muối b64>$<hash b64>
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  disabled      INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,             -- SHA-256 (hex) của token trong cookie, không lưu token gốc
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT (unixepoch()),
  user_agent   TEXT,
  ip           TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Giỏ hàng của người đã đăng nhập. Khách chưa đăng nhập vẫn dùng KV.
CREATE TABLE cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  line_key   TEXT NOT NULL,                  -- "<productId>~<nhóm>.<lựa chọn>~..." như id dòng giỏ hàng hiện tại
  picks      TEXT NOT NULL,                  -- JSON { groupKey: choiceKey }
  qty        INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
  UNIQUE (user_id, line_key)
);
