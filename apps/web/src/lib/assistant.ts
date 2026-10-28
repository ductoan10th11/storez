import { ApiError, apiError, type Availability } from '@/api'

// Trợ lý Speedy: gọi /api/assistant/chat và đọc luồng SSE (status, delta, products, done, error)
export type Card = {
  slug: string
  name: string
  price: number
  image: string
  category: string
  badge: string
  availability: Availability
  leadTimeDays: number | null
}
export type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string; cards?: Card[]; error?: boolean }
export type Turn = { role: 'user' | 'assistant'; content: string }

export const MAX_INPUT = 500

type Handlers = {
  onStatus: (text: string) => void
  onDelta: (text: string) => void
  onProducts: (cards: Card[]) => void
}

export async function streamChat(messages: Turn[], h: Handlers, signal: AbortSignal) {
  let res: Response
  try {
    res = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    })
  } catch (e) {
    if (signal.aborted) throw e
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ, vui lòng thử lại')
  }
  if (!res.ok || !res.body) throw await apiError(res)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let event = ''
  const line = (raw: string) => {
    if (raw.startsWith('event:')) event = raw.slice(6).trim()
    else if (raw.startsWith('data:')) {
      let d: any
      try {
        d = JSON.parse(raw.slice(5))
      } catch {
        return
      }
      if (event === 'status') h.onStatus(d.text)
      else if (event === 'delta') h.onDelta(d.text)
      else if (event === 'products') h.onProducts(d.products)
      else if (event === 'error') throw new ApiError(res.status, d.code ?? 'assistant_error', d.message ?? 'Speedy đang bận, bạn thử lại sau nhé')
    }
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: !done })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      line(buf.slice(0, nl).replace(/\r$/, ''))
      buf = buf.slice(nl + 1)
    }
    if (done) break
  }
  line(buf.trim())
}
