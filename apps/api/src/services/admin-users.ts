import { z } from 'zod'
import { AppError } from '../middleware/errors'
import { hashPassword } from '../lib/password'
import { auditStmt } from './audit'

export const userPatchSchema = z.object({
  disabled: z.boolean().optional(),
  role: z.enum(['customer', 'admin']).optional(),
  name: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(80, 'Họ tên tối đa 80 ký tự').optional(),
})

type UserListRow = { id: string; phone: string; name: string; email: string | null; role: 'customer' | 'admin'; disabled: number; created_at: number; order_count: number }

const toUser = (r: UserListRow) => ({
  id: r.id,
  phone: r.phone,
  name: r.name,
  email: r.email,
  role: r.role,
  disabled: r.disabled === 1,
  createdAt: r.created_at,
  orderCount: r.order_count,
})

const SELECT = `SELECT u.id, u.phone, u.name, u.email, u.role, u.disabled, u.created_at,
  (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count FROM users u`

export async function listUsers(db: D1Database, q: { q?: string; role?: 'customer' | 'admin'; page: number; pageSize: number }) {
  const where: string[] = []
  const binds: (string | number)[] = []
  if (q.role) (where.push('u.role = ?'), binds.push(q.role))
  if (q.q?.trim()) {
    const raw = q.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)
    where.push(`(u.phone LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')`)
    binds.push(`%${raw.replace(/[\s.\-()]/g, '')}%`, `%${raw}%`, `%${raw.toLowerCase()}%`)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM users u ${w}`).bind(...binds),
    db.prepare(`${SELECT} ${w} ORDER BY u.created_at DESC, u.rowid DESC LIMIT ? OFFSET ?`).bind(...binds, q.pageSize, (q.page - 1) * q.pageSize),
  ])
  return {
    items: (rows.results as UserListRow[]).map(toUser),
    total: (count.results[0] as { n: number }).n,
    page: q.page,
    pageSize: q.pageSize,
  }
}

export async function patchUser(db: D1Database, actorId: string, id: string, patch: z.output<typeof userPatchSchema>) {
  const user = await db.prepare(`${SELECT} WHERE u.id = ?`).bind(id).first<UserListRow>()
  if (!user) throw new AppError(404, 'not_found', 'Không tìm thấy người dùng')
  // Admin không tự khóa hoặc tự hạ quyền mình
  if (id === actorId && (patch.disabled === true || patch.role === 'customer')) {
    throw new AppError(409, 'self_action', 'Bạn không thể tự khóa hoặc tự hạ quyền chính mình')
  }
  const sets: string[] = []
  const binds: (string | number)[] = []
  if (patch.disabled !== undefined) (sets.push('disabled = ?'), binds.push(patch.disabled ? 1 : 0))
  if (patch.role !== undefined) (sets.push('role = ?'), binds.push(patch.role))
  if (patch.name !== undefined) (sets.push('name = ?'), binds.push(patch.name))
  if (sets.length) {
    const stmts = [
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id),
      auditStmt(db, { actorId, action: patch.disabled === true ? 'user.disable' : patch.disabled === false ? 'user.enable' : 'user.update', target: `user:${id}`, detail: patch }),
    ]
    // Khóa tài khoản thì hủy mọi phiên ngay (BR-ACC-3); hạ quyền cũng hủy để quyền cũ không còn hiệu lực
    if (patch.disabled === true || patch.role === 'customer') stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id))
    await db.batch(stmts)
  }
  return toUser((await db.prepare(`${SELECT} WHERE u.id = ?`).bind(id).first<UserListRow>())!)
}

export async function resetPassword(db: D1Database, actorId: string, id: string, newPassword: string) {
  if (!(await db.prepare('SELECT 1 AS ok FROM users WHERE id = ?').bind(id).first())) {
    throw new AppError(404, 'not_found', 'Không tìm thấy người dùng')
  }
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(newPassword), id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    // Chỉ ghi sự kiện, không ghi giá trị mật khẩu
    auditStmt(db, { actorId, action: 'user.reset-password', target: `user:${id}` }),
  ])
}
