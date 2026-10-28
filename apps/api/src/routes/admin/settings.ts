import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../env'
import { fieldsOf } from '../../lib/validate'
import { getSettings, settingKeys, settingSchemas, type SettingKey } from '../../lib/settings'
import { now } from '../../lib/time'
import { AppError } from '../../middleware/errors'
import { auditStmt } from '../../services/audit'

const app = new Hono<AppEnv>()

app.get('/settings', async (c) => c.json(await getSettings(c.env.DB)))

app.put('/settings/:key', async (c) => {
  const key = c.req.param('key') as SettingKey
  if (!settingKeys.includes(key)) throw new AppError(404, 'not_found', 'Không có cấu hình này')
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ value: settingSchemas[key] }).safeParse(body)
  if (!parsed.success) {
    // đường dẫn lỗi bỏ tiền tố "value."
    const fields = Object.fromEntries(Object.entries(fieldsOf(parsed.error)).map(([k, v]) => [k.replace(/^value\.?/, '') || 'value', v]))
    throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', fields)
  }
  const before = (await getSettings(c.env.DB))[key]
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(parsed.data.value)),
    auditStmt(c.env.DB, { actorId: c.var.user!.id, action: 'settings.update', target: `settings:${key}`, detail: { before, after: parsed.data.value } }, now()),
  ])
  return c.json(parsed.data.value)
})

export default app
