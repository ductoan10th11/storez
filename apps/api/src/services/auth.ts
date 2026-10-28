import { AppError } from '../middleware/errors'
import { nanoid } from '../lib/ids'
import { dummyVerify, hashPassword, needsRehash, newToken, sha256Hex, verifyPassword } from '../lib/password'
import { now as nowSec } from '../lib/time'
import type { SessionUser } from '../env'

export const SESSION_TTL = 60 * 60 * 24 * 30 // 30 ngày
export const RENEW_AFTER = 60 * 60 * 24 // 1 ngày

type UserRow = {
  id: string
  phone: string
  email: string | null
  password_hash: string
  name: string
  role: 'customer' | 'admin'
  disabled: number
}

export const toSessionUser = (u: Pick<UserRow, 'id' | 'phone' | 'name' | 'email' | 'role'>): SessionUser => ({
  id: u.id,
  phone: u.phone,
  name: u.name,
  email: u.email,
  role: u.role,
})

type Meta = { ua?: string; ip?: string }

const insertSession = (db: D1Database, sid: string, userId: string, meta: Meta, t: number) =>
  db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, last_used_at, user_agent, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(sid, userId, t + SESSION_TTL, t, meta.ua?.slice(0, 200) ?? null, meta.ip ?? null, t)

export async function createSession(db: D1Database, userId: string, meta: Meta) {
  const token = newToken()
  await insertSession(db, await sha256Hex(token), userId, meta, nowSec()).run()
  return token
}

// Đọc phiên + người dùng bằng một truy vấn JOIN; tài khoản bị khóa coi như chưa đăng nhập
export async function lookupSession(db: D1Database, token: string, t = nowSec()) {
  const row = await db
    .prepare(
      `SELECT s.id AS sid, s.last_used_at, u.id, u.phone, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0`,
    )
    .bind(await sha256Hex(token), t)
    .first<{ sid: string; last_used_at: number } & Pick<UserRow, 'id' | 'phone' | 'email' | 'name' | 'role'>>()
  if (!row) return null
  return { sessionId: row.sid, lastUsedAt: row.last_used_at, user: toSessionUser(row) }
}

export const renewSession = (db: D1Database, sessionId: string, t = nowSec()) =>
  db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').bind(t, t + SESSION_TTL, sessionId).run()

export const deleteSession = (db: D1Database, sessionId: string) =>
  db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()

export const cleanExpiredSessions = async (db: D1Database, t = nowSec()) =>
  (await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t).run()).meta.changes

// ---------- Đăng ký / đăng nhập ----------

const takenError = (which: 'phone' | 'email') =>
  which === 'phone'
    ? new AppError(409, 'phone_taken', 'Số điện thoại đã được đăng ký', { phone: 'Số điện thoại đã được đăng ký' })
    : new AppError(409, 'email_taken', 'Email đã được sử dụng', { email: 'Email đã được sử dụng' })

export const invalidCredentials = () => new AppError(401, 'invalid_credentials', 'Sai số điện thoại/email hoặc mật khẩu')

export async function register(
  db: D1Database,
  input: { phone: string; password: string; name: string; email: string | null },
  meta: Meta,
) {
  const taken = await db
    .prepare('SELECT phone, email FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?)')
    .bind(input.phone, input.email ?? '')
    .first<{ phone: string; email: string | null }>()
  if (taken) throw takenError(taken.phone === input.phone ? 'phone' : 'email')

  const id = nanoid()
  const t = nowSec()
  const token = newToken()
  const hash = await hashPassword(input.password)
  try {
    const res = await db.batch([
      db
        .prepare(`INSERT INTO users (id, phone, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, 'customer', ?)`)
        .bind(id, input.phone, input.email, hash, input.name, t),
      // BR-ACC-1: gắn mọi đơn đã đặt bằng SĐT này, không xác minh
      db.prepare('UPDATE orders SET user_id = ? WHERE contact_phone = ? AND user_id IS NULL').bind(id, input.phone),
      insertSession(db, await sha256Hex(token), id, meta, t),
    ])
    return {
      user: toSessionUser({ id, phone: input.phone, name: input.name, email: input.email, role: 'customer' }),
      token,
      linkedOrders: res[1].meta.changes,
    }
  } catch (e) {
    // Hai yêu cầu đăng ký cùng lúc: UNIQUE chặn, cả batch hoàn tác
    const msg = String((e as Error)?.message)
    if (/UNIQUE constraint failed: users\.phone/i.test(msg)) throw takenError('phone')
    if (/UNIQUE constraint failed: users\.email/i.test(msg)) throw takenError('email')
    throw e
  }
}

export async function login(
  db: D1Database,
  input: { by: 'phone' | 'email'; value: string | null; password: string },
  meta: Meta,
) {
  const user =
    input.value === null
      ? null
      : await db.prepare(`SELECT * FROM users WHERE ${input.by} = ?`).bind(input.value).first<UserRow>()
  if (!user) {
    await dummyVerify(input.password) // cùng thời gian như người dùng thật
    throw invalidCredentials()
  }
  if (!(await verifyPassword(input.password, user.password_hash))) throw invalidCredentials()
  if (user.disabled) throw new AppError(403, 'account_disabled', 'Tài khoản đã bị khóa')
  if (needsRehash(user.password_hash)) {
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(input.password), user.id).run()
  }
  return { user: toSessionUser(user), token: await createSession(db, user.id, meta) }
}

// ---------- Hồ sơ ----------

export async function updateProfile(db: D1Database, userId: string, patch: { name?: string; email?: string | null }) {
  const sets: string[] = []
  const binds: (string | null)[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    binds.push(patch.name)
  }
  if (patch.email !== undefined) {
    sets.push('email = ?')
    binds.push(patch.email)
  }
  if (sets.length) {
    try {
      await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, userId).run()
    } catch (e) {
      if (/UNIQUE constraint failed: users\.email/i.test(String((e as Error)?.message))) throw takenError('email')
      throw e
    }
  }
  const u = await db.prepare('SELECT id, phone, name, email, role FROM users WHERE id = ?').bind(userId).first<UserRow>()
  return toSessionUser(u!)
}

// Đổi mật khẩu: hủy mọi phiên KHÁC, giữ phiên hiện tại
export async function changePassword(db: D1Database, userId: string, currentSessionId: string | null, current: string, next: string) {
  const u = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first<{ password_hash: string }>()
  if (!u || !(await verifyPassword(current, u.password_hash))) throw invalidCredentials()
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, currentSessionId ?? ''),
  ])
}
