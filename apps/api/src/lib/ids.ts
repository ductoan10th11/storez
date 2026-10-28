// Id ngẫu nhiên, mã đơn. Dùng crypto.getRandomValues, không dùng Math.random.

const URL_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'

// Tương đương nanoid: bảng chữ 64 ký tự, 256 chia hết cho 64 nên `byte & 63` không bị lệch
export const nanoid = (size = 21) =>
  Array.from(crypto.getRandomValues(new Uint8Array(size)), (b) => URL_ALPHABET[b & 63]).join('')

// Bảng chữ Crockford base32 bỏ I, L, O, U để khỏi nhầm
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function newOrderCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  const s = Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join('')
  return `SS-${s.slice(0, 5)}-${s.slice(5)}`
}

// Chuẩn hóa mã khách nhập; trả null nếu không thể là mã đơn
export function normalizeCode(raw: string) {
  const s = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^SS/, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  return s.length === 10 && [...s].every((c) => CODE_ALPHABET.includes(c))
    ? `SS-${s.slice(0, 5)}-${s.slice(5)}`
    : null
}
