-- convert-legacy-seed.sql
-- Chuyển dữ liệu từ lược đồ CŨ (bảng products có cột options JSON, apps/api/schema.sql + seed.sql)
-- sang lược đồ MỚI (0001_catalog.sql). Đây là cách docs/sql/seed-catalog.sql đã được sinh ra.
--
-- Cách chạy (đã chạy thử):
--   sqlite3 legacy.db < apps/api/schema.sql && sqlite3 legacy.db < apps/api/seed.sql
--   cat docs/sql/0001_catalog.sql | sqlite3 new.db
--   sqlite3 new.db < docs/sql/convert-legacy-seed.sql      # (chạy trong thư mục có legacy.db)
-- Kết quả mong đợi: 5 danh mục, 15 sản phẩm, 67 ảnh, 45 nhóm tùy chọn, 112 lựa chọn, 52 lựa chọn màu có ảnh.
-- Chỉ cần khi phải sinh lại seed từ dữ liệu cũ; DB mới nên nạp seed-catalog.sql trực tiếp.

ATTACH 'legacy.db' AS legacy;

INSERT INTO categories (slug, name, sort) VALUES
  ('xe-may','Xe máy',1), ('o-to','Ô tô',2), ('may-bay','Máy bay',3), ('truc-thang','Trực thăng',4), ('xe-tang','Xe tăng',5);

-- Ảnh chính: ảnh tĩnh đi kèm bản build (r2_key NULL)
INSERT INTO media (url, r2_key, mime, size) SELECT image, NULL, 'image/svg+xml', 0 FROM legacy.products ORDER BY id;

INSERT INTO products (id, slug, category_id, name, description, spec, badge, base_price)
SELECT l.id,
       replace(replace(l.image, '/vehicles/', ''), '.svg', ''),
       (SELECT c.id FROM categories c WHERE c.slug = l.category),
       l.name, l.description, l.spec, l.badge, l.price
FROM legacy.products l ORDER BY l.id;

INSERT INTO product_images (product_id, media_id, sort)
SELECT l.id, m.id, 0 FROM legacy.products l JOIN media m ON m.url = l.image;

INSERT INTO option_groups (product_id, key, name, type, sort)
SELECT l.id, json_extract(g.value, '$.id'), json_extract(g.value, '$.name'), json_extract(g.value, '$.type'), CAST(g.key AS INTEGER)
FROM legacy.products l, json_each(l.options) g
ORDER BY l.id, g.key;

INSERT INTO option_choices (group_id, key, name, price_delta, hex, sort)
SELECT og.id, json_extract(c.value, '$.id'), json_extract(c.value, '$.name'),
       json_extract(c.value, '$.price'), json_extract(c.value, '$.hex'), CAST(c.key AS INTEGER)
FROM legacy.products l
JOIN json_each(l.options) g
JOIN json_each(g.value, '$.choices') c
JOIN option_groups og ON og.product_id = l.id AND og.key = json_extract(g.value, '$.id')
ORDER BY l.id, g.key, c.key;

-- Ảnh theo từng màu: /vehicles/a.svg -> /vehicles/a--<màu>.svg
INSERT INTO media (url, r2_key, mime, size)
SELECT replace(l.image, '.svg', '--' || oc.key || '.svg'), NULL, 'image/svg+xml', 0
FROM option_choices oc
JOIN option_groups og ON og.id = oc.group_id AND og.type = 'color'
JOIN legacy.products l ON l.id = og.product_id
ORDER BY oc.id;

UPDATE option_choices SET media_id = (
  SELECT m.id FROM media m
  JOIN option_groups og ON og.id = option_choices.group_id
  JOIN legacy.products l ON l.id = og.product_id
  WHERE m.url = replace(l.image, '.svg', '--' || option_choices.key || '.svg')
) WHERE group_id IN (SELECT id FROM option_groups WHERE type = 'color');
