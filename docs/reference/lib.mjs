// Cài đặt tham chiếu cho các hàm thuần của backend (chạy được bằng Node thuần, không phụ thuộc gì).
// Đây là ĐẶC TẢ chạy được: khi viết apps/api/src/lib/{phone,ids}.ts và services/masking.ts bằng TypeScript,
// hãy giữ nguyên hành vi và đưa các vector trong lib.test.mjs vào bộ test vitest.
//   node docs/reference/lib.test.mjs
// Xem docs/05-security.md mục 6 (che dữ liệu) và mục 8 (mã đơn).

const stars = (n) => '*'.repeat(Math.max(0, n))
export function maskName(name) {
  return name.normalize('NFC').trim().split(/\s+/).map((w) => {
    const cs = Array.from(w)
    return cs[0] + stars(Math.min(cs.length - 1, 4))
  }).join(' ')
}
export function maskPhone(phone) {
  return phone.length < 7 ? stars(phone.length) : phone.slice(0, 3) + stars(phone.length - 6) + phone.slice(-3)
}
export function maskEmail(email) {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at), domain = email.slice(at + 1)
  const dot = domain.indexOf('.')
  const label = dot === -1 ? domain : domain.slice(0, dot)
  const rest = dot === -1 ? '' : domain.slice(dot)
  return Array.from(local)[0] + '***@' + (Array.from(label)[0] ?? '') + '***' + rest
}
export function normalizePhone(raw) {
  let p = raw.replace(/[\s.\-()]/g, '')
  if (p.startsWith('+84')) p = '0' + p.slice(3)
  else if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2)
  return /^0[35789]\d{8}$/.test(p) ? p : null
}
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export function newOrderCode() {
  const b = crypto.getRandomValues(new Uint8Array(10))
  const s = Array.from(b, (x) => ALPHABET[x & 31]).join('')
  return `SS-${s.slice(0, 5)}-${s.slice(5)}`
}
export function normalizeCode(raw) {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^SS/, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  return s.length === 10 && [...s].every((c) => ALPHABET.includes(c)) ? `SS-${s.slice(0, 5)}-${s.slice(5)}` : null
}
