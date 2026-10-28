import { AppError } from '../middleware/errors'
import { now as nowSec } from '../lib/time'

export type CloudinaryEnv = { CLOUD_NAME?: string; CLOUD_API_KEY?: string; CLOUD_API_SECRET?: string }

const sha1Hex = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('')

// Chữ ký Cloudinary: các tham số (trừ file, api_key) sắp theo tên, nối "k=v&..." rồi cộng api_secret, băm SHA-1
export const sign = (params: Record<string, string | number>, secret: string) =>
  sha1Hex(
    Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&') + secret,
  )

function config(env: CloudinaryEnv) {
  if (!env.CLOUD_NAME || !env.CLOUD_API_KEY || !env.CLOUD_API_SECRET) {
    throw new AppError(503, 'storage_unavailable', 'Chưa cấu hình kho lưu ảnh (Cloudinary)')
  }
  return { cloud: env.CLOUD_NAME, key: env.CLOUD_API_KEY, secret: env.CLOUD_API_SECRET }
}

const fail = (what: string, status?: number) => {
  console.error('cloudinary_error', what, status ?? '')
  return new AppError(502, 'storage_error', 'Không lưu được ảnh, vui lòng thử lại')
}

export async function uploadImage(env: CloudinaryEnv, bytes: Uint8Array, mime: string, publicId: string) {
  const { cloud, key, secret } = config(env)
  const timestamp = nowSec()
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: mime }), 'upload')
  form.set('public_id', publicId)
  form.set('timestamp', String(timestamp))
  form.set('api_key', key)
  form.set('signature', await sign({ public_id: publicId, timestamp }, secret))
  let res: Response
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form })
  } catch (e) {
    throw fail(String((e as Error)?.message))
  }
  if (!res.ok) throw fail('upload', res.status)
  const body = (await res.json().catch(() => null)) as { secure_url?: string; public_id?: string; width?: number; height?: number } | null
  if (!body?.secure_url || !body.public_id) throw fail('upload-body')
  return { url: body.secure_url, publicId: body.public_id, width: body.width ?? null, height: body.height ?? null }
}

// Xóa ảnh; ảnh không còn trên Cloudinary ("not found") coi như đã xóa
export async function destroyImage(env: CloudinaryEnv, publicId: string) {
  const { cloud, key, secret } = config(env)
  const timestamp = nowSec()
  const form = new FormData()
  form.set('public_id', publicId)
  form.set('timestamp', String(timestamp))
  form.set('api_key', key)
  form.set('signature', await sign({ public_id: publicId, timestamp }, secret))
  let res: Response
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, { method: 'POST', body: form })
  } catch (e) {
    throw fail(String((e as Error)?.message))
  }
  if (!res.ok) throw fail('destroy', res.status)
  const body = (await res.json().catch(() => null)) as { result?: string } | null
  if (body?.result !== 'ok' && body?.result !== 'not found') throw fail('destroy-result')
}
