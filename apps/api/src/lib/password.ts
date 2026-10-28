// PBKDF2-HMAC-SHA256 qua WebCrypto. Định dạng: pbkdf2$sha256$<vòng>$<muối b64>$<hash b64>
// Workers (workerd) chỉ cho tối đa 100.000 vòng PBKDF2; số vòng được ghi vào chuỗi để nâng cấp sau.
export const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BYTES = 32

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BYTES * 8),
  )
}

// So sánh thời gian cố định
function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`
}

function parse(stored: string) {
  const [scheme, alg, iter, salt, hash] = stored.split('$')
  const iterations = Number(iter)
  if (scheme !== 'pbkdf2' || alg !== 'sha256' || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return null
  return { iterations, salt: unb64(salt), hash: unb64(hash) }
}

export async function verifyPassword(password: string, stored: string) {
  const p = parse(stored)
  if (!p) return false
  return equal(await derive(password, p.salt, p.iterations), p.hash)
}

export const needsRehash = (stored: string) => (parse(stored)?.iterations ?? 0) < PBKDF2_ITERATIONS

// Hash giả để người dùng không tồn tại vẫn tốn cùng thời gian như người dùng thật
let dummy: Promise<string> | undefined
export const dummyVerify = async (password: string) => {
  dummy ??= hashPassword('khong-ai-dung-mat-khau-nay')
  await verifyPassword(password, await dummy)
}

// Token phiên: 32 byte ngẫu nhiên, base64url (43 ký tự)
export const newToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// id phiên trong CSDL = SHA-256 (hex) của token
export async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('')
}
