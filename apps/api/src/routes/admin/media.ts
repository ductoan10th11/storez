import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { pageSchema, validate } from '../../lib/validate'
import { AppError } from '../../middleware/errors'
import { checkRate } from '../../middleware/rate-limit'
import { auditStmt } from '../../services/audit'
import { deleteMedia, IN_USE_SQL, MAX_CONTENT_LENGTH, parseDimension, saveUpload } from '../../services/media'

const app = new Hono<AppEnv>()

// Kiểm tra theo docs/05 mục 7: quyền admin (đã qua requireAdmin) -> giới hạn -> kích thước -> nội dung
app.post('/', async (c) => {
  const user = c.var.user!
  await checkRate(c.env.CART, 'upload', user.id, 30, 600)

  const declared = Number(c.req.header('content-length'))
  if (declared > MAX_CONTENT_LENGTH) throw new AppError(413, 'payload_too_large', 'Ảnh vượt quá 5 MB')
  if (!/^multipart\/form-data\b/i.test(c.req.header('content-type') ?? '')) {
    throw new AppError(415, 'unsupported_media', 'Cần gửi multipart/form-data với trường file')
  }

  const form = await c.req.parseBody().catch(() => {
    throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { file: 'Không đọc được dữ liệu tải lên' })
  })
  const file = form.file
  if (!(file instanceof File)) throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', { file: 'Thiếu ảnh' })
  const width = parseDimension(form.width, 'width')
  const height = parseDimension(form.height, 'height')

  const media = await saveUpload(c.env, file, { width, height }, user.id)
  await auditStmt(c.env.DB, { actorId: user.id, action: 'media.upload', target: `media:${media.id}`, detail: { url: media.url, size: media.size } }).run()
  return c.json({ media }, 201)
})

app.get('/', validate('query', pageSchema), async (c) => {
  const { page, pageSize } = c.req.valid('query')
  const [count, rows] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM media'),
    c.env.DB.prepare(
      `SELECT m.id, m.url, m.mime, m.size, m.width, m.height, m.created_at, ${IN_USE_SQL} AS in_use
       FROM media m ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
    ).bind(pageSize, (page - 1) * pageSize),
  ])
  return c.json({
    items: (rows.results as { id: number; url: string; mime: string; size: number; width: number | null; height: number | null; created_at: number; in_use: number }[]).map((m) => ({
      id: m.id, url: m.url, mime: m.mime, size: m.size, width: m.width, height: m.height, createdAt: m.created_at, inUse: m.in_use === 1,
    })),
    total: (count.results[0] as { n: number }).n,
    page,
    pageSize,
  })
})

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) throw new AppError(404, 'not_found', 'Không tìm thấy ảnh')
  await deleteMedia(c.env, id)
  await auditStmt(c.env.DB, { actorId: c.var.user!.id, action: 'media.delete', target: `media:${id}` }).run()
  return c.body(null, 204)
})

export default app
