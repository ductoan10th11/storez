// Che dữ liệu khi tra cứu công khai (docs/05-security.md mục 6).
const stars = (n: number) => '*'.repeat(Math.max(0, n))

export function maskName(name: string) {
  return name
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .map((w) => {
      const cs = Array.from(w)
      return cs[0] + stars(Math.min(cs.length - 1, 4))
    })
    .join(' ')
}

export function maskPhone(phone: string) {
  return phone.length < 7 ? stars(phone.length) : phone.slice(0, 3) + stars(phone.length - 6) + phone.slice(-3)
}

export function maskEmail(email: string) {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const dot = domain.indexOf('.')
  const label = dot === -1 ? domain : domain.slice(0, dot)
  const rest = dot === -1 ? '' : domain.slice(dot)
  return Array.from(local)[0] + '***@' + (Array.from(label)[0] ?? '') + '***' + rest
}
