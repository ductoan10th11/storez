import { AppError } from '../middleware/errors'
import { nanoid } from '../lib/ids'
import { now as nowSec } from '../lib/time'
import { destroyImage, uploadImage, type CloudinaryEnv } from './cloudinary'

type MediaEnv = { DB: D1Database } & CloudinaryEnv

export const MAX_UPLOAD = 5 * 1024 * 1024
export const MAX_CONTENT_LENGTH = 6 * 1024 * 1024

export type ImageKind = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' }

// Nhận diện định dạng bằng chữ ký nội dung, không tin tên file hay Content-Type của client. Không nhận SVG.
export function sniffImage(b: Uint8Array): ImageKind | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v)
  if (at(0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' }
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png' }
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: 'image/webp', ext: 'webp' }
  return null
}

// Kích thước do client gợi ý: số nguyên 1..4000 hoặc bỏ trống
export function parseDimension(v: unknown, field: string) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  if (typeof v !== 'string' || !/^\d+$/.test(v) || n < 1 || n > 4000) {
    throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { [field]: 'Phải là số nguyên từ 1 đến 4000' })
  }
  return n
}

export async function saveUpload(
  env: MediaEnv,
  file: File,
  dims: { width: number | null; height: number | null },
  userId: string,
) {
  if (file.size > MAX_UPLOAD) throw new AppError(413, 'payload_too_large', 'Ảnh vượt quá 5 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImage(bytes)
  if (!kind) throw new AppError(415, 'unsupported_media', 'Chỉ nhận ảnh JPEG, PNG hoặc WebP')

  const t = nowSec()
  const yyyymm = new Date(t * 1000).toISOString().slice(0, 7).replace('-', '')
  // public_id do server sinh, không dùng tên file của người dùng
  const up = await uploadImage(env, bytes, kind.mime, `products/${yyyymm}/${nanoid()}`)
  try {
    const res = await env.DB.prepare(
      'INSERT INTO media (url, storage_key, mime, size, width, height, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(up.url, up.publicId, kind.mime, bytes.byteLength, dims.width ?? up.width, dims.height ?? up.height, userId, t)
      .run()
    return { id: res.meta.last_row_id, url: up.url, mime: kind.mime, size: bytes.byteLength, width: dims.width ?? up.width, height: dims.height ?? up.height }
  } catch (e) {
    await destroyImage(env, up.publicId).catch(() => {})
    throw e
  }
}

// Ảnh đang được dùng: thư viện sản phẩm, ảnh riêng của lựa chọn, hoặc bản chụp trong đơn cũ
export const IN_USE_SQL = `(
  EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)
  OR EXISTS (SELECT 1 FROM option_choices c WHERE c.media_id = m.id)
  OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.image = m.url)
)`

export async function deleteMedia(env: MediaEnv, id: number) {
  const m = await env.DB.prepare(`SELECT m.id, m.storage_key, ${IN_USE_SQL} AS in_use FROM media m WHERE m.id = ?`)
    .bind(id)
    .first<{ id: number; storage_key: string | null; in_use: number }>()
  if (!m) throw new AppError(404, 'not_found', 'Không tìm thấy ảnh')
  if (m.in_use) throw new AppError(409, 'media_in_use', 'Ảnh đang được sử dụng')
  // Xóa trên Cloudinary trước, bảng sau: nếu bảng lỗi thì chỉ còn dòng không tham chiếu, cron sẽ dọn
  if (m.storage_key) await destroyImage(env, m.storage_key)
  await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run()
}

// Cron: ảnh tải lên không còn được tham chiếu và quá 24 giờ thì xóa trên Cloudinary rồi xóa dòng
export async function cleanOrphanMedia(env: MediaEnv, t = nowSec(), limit = 200) {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.storage_key FROM media m
     WHERE m.storage_key IS NOT NULL AND m.created_at < ? AND NOT ${IN_USE_SQL} LIMIT ?`,
  )
    .bind(t - 86400, limit)
    .all<{ id: number; storage_key: string }>()
  let removed = 0
  for (const m of results) {
    try {
      await destroyImage(env, m.storage_key)
    } catch (e) {
      if (e instanceof AppError) continue // lỗi tạm thời: để lần sau
      throw e
    }
    await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(m.id).run()
    removed++
  }
  return removed
}
