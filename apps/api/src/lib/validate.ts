import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'
import { AppError } from '../middleware/errors'
import { EMAIL_RE, normalizePhone } from './phone'

export const fieldsOf = (error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) => {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] ??= issue.message
  }
  return fields
}

// zValidator đổi lỗi zod thành AppError validation_failed kèm fields
export const validate = <S extends z.ZodType, T extends keyof ValidationTargets>(target: T, schema: S) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError(400, 'validation_failed', 'Dữ liệu không hợp lệ', fieldsOf(result.error))
    }
  })

// ---- Schema dùng chung ----

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .min(min, `${label} tối thiểu ${min} ký tự`)
    .max(max, `${label} tối đa ${max} ký tự`)

export const nameSchema = trimmed(2, 80, 'Họ tên')

export const phoneSchema = z
  .string({ error: 'Số điện thoại không hợp lệ' })
  .transform((s, ctx) => {
    const p = normalizePhone(s)
    if (!p) ctx.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ' })
    return p ?? ''
  })

export const emailSchema = z
  .string({ error: 'Email không hợp lệ' })
  .trim()
  .max(120, 'Email tối đa 120 ký tự')
  .regex(EMAIL_RE, 'Email không hợp lệ')
  .transform((s) => s.toLowerCase())

// Email không bắt buộc: thiếu, null hoặc chuỗi rỗng đều là "không có" (kết quả null)
export const optionalEmail = z
  .union([z.literal('').transform(() => null), z.null(), emailSchema])
  .optional()
  .transform((e) => e ?? null)

export const passwordSchema = z
  .string({ error: 'Mật khẩu không hợp lệ' })
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128, 'Mật khẩu tối đa 128 ký tự')

// Chuỗi rỗng coi như không có
export const optionalText = (max: number, label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .max(max, `${label} tối đa ${max} ký tự`)
    .nullish()
    .transform((s) => (s ? s : null))

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
