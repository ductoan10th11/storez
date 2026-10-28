import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { validate } from '../lib/validate'
import { AppError } from '../middleware/errors'
import { checkRate, rateLimit } from '../middleware/rate-limit'
import { runAgent } from '../services/ai/agent'
import { aiConfigured, aiUnavailable } from '../services/ai/llm'

// Trợ lý Speedy: không cần đăng nhập, nên giới hạn chặt để khỏi tốn chi phí mô hình
const PER_IP = { limit: 20, windowSec: 600 }
const DAILY_CAP = 2000 // tổng số tin mỗi ngày trên cả cửa hàng
const MAX_TURNS = 10
const USER_MAX = 500

const body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1, 'Tin nhắn không được để trống').max(4000),
      }),
    )
    .min(1)
    .max(40)
    .superRefine((m, ctx) => {
      if (!m.length) return // min(1) đã báo lỗi
      if (m[m.length - 1].role !== 'user') ctx.addIssue({ code: 'custom', message: 'Tin cuối phải của khách' })
      m.forEach((x, i) => {
        if (x.role === 'user' && x.content.length > USER_MAX) {
          ctx.addIssue({ code: 'custom', path: [i, 'content'], message: `Tin nhắn tối đa ${USER_MAX} ký tự` })
        }
      })
    }),
})

const app = new Hono<AppEnv>()

app.post('/chat', rateLimit('assistant', PER_IP.limit, PER_IP.windowSec), validate('json', body), async (c) => {
  if (!aiConfigured(c.env)) throw aiUnavailable()
  await checkRate(c.env.CART, 'assistant-day', 'all', DAILY_CAP, 86400)
  const history = c.req.valid('json').messages.slice(-MAX_TURNS)
  if (history[0].role !== 'user') history.shift() // lịch sử luôn bắt đầu bằng tin của khách

  return streamSSE(c, async (stream) => {
    const ctl = new AbortController()
    stream.onAbort(() => ctl.abort())
    // Ghi tuần tự và chờ xong hết trước khi đóng luồng, nếu không các sự kiện cuối (thẻ, done) bị mất
    let queue: Promise<unknown> = Promise.resolve()
    const send = (event: string, data: unknown) => (queue = queue.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })))
    try {
      await runAgent(c.env, history, (e) => void send(e.type, e), ctl.signal)
      await queue
    } catch (e) {
      if (ctl.signal.aborted) return
      const err = e instanceof AppError ? e : null
      if (!err) console.error('assistant_error', (e as Error)?.name, (e as Error)?.message)
      await send('error', {
        code: err?.code ?? 'assistant_error',
        message: err?.message ?? 'Speedy đang bận, bạn thử lại sau ít phút nhé',
      })
      await queue
    }
  })
})

export default app
