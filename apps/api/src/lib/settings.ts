import { z } from 'zod'
import { parseHm } from './time'

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:MM')

export const showroomSchema = z.object({
  name: z.string().trim().min(1, 'Không được để trống').max(80),
  address: z.string().trim().min(1, 'Không được để trống').max(200),
  phone: z.string().trim().min(1, 'Không được để trống').max(20),
})

export const pickupSchema = z
  .object({
    open: hm,
    close: hm,
    days: z
      .array(z.number().int().min(0, 'Ngày từ 0 đến 6').max(6, 'Ngày từ 0 đến 6'))
      .min(1, 'Chọn ít nhất một ngày')
      .refine((d) => new Set(d).size === d.length, 'Ngày bị lặp'),
    slotMinutes: z.number().int().min(15, 'Tối thiểu 15 phút').max(480),
    capacity: z.number().int().min(1, 'Tối thiểu 1 đơn mỗi khung').max(100),
    minNoticeHours: z.number().int().min(0).max(720),
    maxAdvanceDays: z.number().int().min(1).max(365),
  })
  .superRefine((v, ctx) => {
    const span = parseHm(v.close) - parseHm(v.open)
    if (span <= 0) ctx.addIssue({ code: 'custom', path: ['close'], message: 'Giờ đóng cửa phải sau giờ mở cửa' })
    else if (span % v.slotMinutes !== 0) {
      ctx.addIssue({ code: 'custom', path: ['slotMinutes'], message: 'Độ dài khung phải chia hết khoảng giờ mở cửa' })
    }
  })

export const ordersSchema = z.object({
  pendingHoldHours: z.number().int().min(1, 'Tối thiểu 1 giờ').max(24 * 30),
})

export const settingSchemas = { showroom: showroomSchema, pickup: pickupSchema, orders: ordersSchema } as const
export type SettingKey = keyof typeof settingSchemas
export const settingKeys = Object.keys(settingSchemas) as SettingKey[]

export type Showroom = z.infer<typeof showroomSchema>
export type Pickup = z.infer<typeof pickupSchema>
export type OrdersSettings = z.infer<typeof ordersSchema>
export type Settings = { showroom: Showroom; pickup: Pickup; orders: OrdersSettings }

// Dùng khi bảng settings thiếu hoặc hỏng
export const DEFAULT_SETTINGS: Settings = {
  showroom: {
    name: 'Speed Showroom',
    address: 'Số nhà 36, đường Z115, phường Phan Đình Phùng, tỉnh Thái Nguyên',
    phone: '0336436536',
  },
  pickup: { open: '08:00', close: '18:00', days: [0, 1, 2, 3, 4, 5, 6], slotMinutes: 60, capacity: 5, minNoticeHours: 2, maxAdvanceDays: 30 },
  orders: { pendingHoldHours: 48 },
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const raw = new Map(results.map((r) => [r.key, r.value]))
  const out = { ...DEFAULT_SETTINGS } as Settings
  for (const key of settingKeys) {
    try {
      const parsed = settingSchemas[key].safeParse(JSON.parse(raw.get(key) ?? 'null'))
      if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data
    } catch {
      // JSON hỏng: giữ mặc định
    }
  }
  return out
}
