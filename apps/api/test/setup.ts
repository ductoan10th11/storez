import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach } from 'vitest'
import { ai } from './fake-ai'
import { installFakeCloudinary } from './fake-cloudinary'
import seed from '../seed/seed-catalog.sql?raw'

// Tách file seed thành từng câu lệnh (mỗi câu kết thúc bằng ";" cuối dòng, bỏ dòng chú thích)
const statements = seed
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean)

// Mỗi test bắt đầu từ DB/KV sạch: áp migration rồi nạp seed
beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)))
  installFakeCloudinary()
  ai.reset()
})
