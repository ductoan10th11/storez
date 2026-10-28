-- 0004_media_storage_key.sql
-- Ảnh tải lên chuyển từ R2 sang Cloudinary: cột r2_key đổi tên thành storage_key
-- (= public_id trên Cloudinary). NULL vẫn nghĩa là ảnh tĩnh đi kèm bản build.
-- url của ảnh tải lên giờ là URL https tuyệt đối của Cloudinary.
ALTER TABLE media RENAME COLUMN r2_key TO storage_key;
