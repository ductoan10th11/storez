// SĐT chuẩn hóa về 0xxxxxxxxx; email chữ thường.
export function normalizePhone(raw: string) {
  let p = raw.replace(/[\s.\-()]/g, '')
  if (p.startsWith('+84')) p = '0' + p.slice(3)
  else if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2)
  return /^0[35789]\d{8}$/.test(p) ? p : null
}

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase()

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
