import { now as nowSec } from '../lib/time'

export type AuditEntry = { actorId: string | null; action: string; target: string | null; detail?: unknown }

// Nhật ký thao tác quản trị. Không bao giờ đưa mật khẩu vào detail.
export const auditStmt = (db: D1Database, a: AuditEntry, t = nowSec()) =>
  db
    .prepare('INSERT INTO audit_log (actor_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?)')
    .bind(a.actorId, a.action, a.target, a.detail === undefined ? null : JSON.stringify(a.detail), t)
