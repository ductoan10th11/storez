import type { Bindings } from '../../env'
import { getSettings } from '../../lib/settings'
import { epochToVnDate, now } from '../../lib/time'
import { fold, type Product } from '../catalog'
import { streamRound, type ChatMessage, type ToolCall } from './llm'
import { systemPrompt } from './prompt'
import { runTool, TOOLS } from './tools'

export const MAX_TOOL_ROUNDS = 4 // số lượt gọi công cụ tối đa, sau đó buộc trả lời
const MAX_CALLS_PER_ROUND = 3
const MAX_CARDS = 4
const HOLD_CHARS = 120

// Thẻ sản phẩm gửi cho giao diện: lấy từ D1, không phải từ chữ do mô hình viết
export type Card = Pick<Product, 'slug' | 'name' | 'price' | 'image' | 'category' | 'badge' | 'availability' | 'leadTimeDays'>

export type AgentEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'products'; products: Card[] }
  | { type: 'done'; tools: string[] } // tools: công cụ đã gọi, để gỡ lỗi/đánh giá

export type Turn = { role: 'user' | 'assistant'; content: string }

const STATUS: Record<string, string> = {
  search_products: 'Đang tìm sản phẩm phù hợp…',
  get_product: 'Đang xem chi tiết sản phẩm…',
  compare_products: 'Đang so sánh…',
  quote: 'Đang tính giá…',
  get_showroom_info: 'Đang tra thông tin showroom…',
}

// Thêm vào lượt trả lời bắt buộc: mô hình hay bỏ lửng khi hết công cụ mà chưa được dặn trả lời
const NUDGE: ChatMessage = {
  role: 'user',
  content: '(Hệ thống) Đã có đủ dữ liệu từ công cụ. Hãy trả lời khách ngay bằng tiếng Việt dựa trên dữ liệu đó, không gọi thêm công cụ.',
}

const FALLBACK = 'Xin lỗi, mình chưa trả lời được câu này. Bạn thử hỏi lại ngắn gọn hơn, hoặc gọi showroom để được hỗ trợ nhé.'

const toCard = (p: Product): Card => ({
  slug: p.slug,
  name: p.name,
  price: p.price,
  image: p.image,
  category: p.category,
  badge: p.badge,
  availability: p.availability,
  leadTimeDays: p.leadTimeDays,
})

// Chọn thẻ cho những sản phẩm mà câu trả lời thực sự nhắc tới (theo thứ tự xuất hiện)
function cardsFor(text: string, seen: Map<string, Product>): Card[] {
  const t = fold(text)
  return [...seen.values()]
    .map((p) => ({ p, at: t.indexOf(fold(p.name)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_CARDS)
    .map((x) => toCard(x.p))
}

export async function runAgent(env: Bindings, history: Turn[], emit: (e: AgentEvent) => void, signal?: AbortSignal) {
  const started = Date.now()
  const { showroom } = await getSettings(env.DB)
  const messages: ChatMessage[] = [systemPrompt(showroom.name, epochToVnDate(now())), ...history]
  const seen = new Map<string, Product>()
  const used: string[] = []
  let text = ''

  let forced = false // true: bắt buộc trả lời, không cho gọi công cụ
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const force = forced || round === MAX_TOOL_ROUNDS
    // Lời dẫn ngắn trước khi gọi công cụ ("Để mình tìm...") không nên hiện cho khách: giữ lại đầu lượt,
    // bỏ nếu mô hình chuyển sang gọi công cụ, còn lại thì phát ra (đủ dài thì phát ngay để stream mượt)
    let held = ''
    let live = false
    let dropped = false
    const release = () => {
      live = true
      if (held) (text += held, emit({ type: 'delta', text: held }))
      held = ''
    }
    const r = await streamRound(
      env,
      force && used.length ? [...messages, NUDGE] : messages,
      force ? null : TOOLS,
      (d) => {
        if (dropped) return
        if (live) return void ((text += d), emit({ type: 'delta', text: d }))
        held += d
        if (held.length >= HOLD_CHARS) release()
      },
      signal,
      () => {
        dropped = !live
        held = ''
      },
    )
    if (!live && !dropped) release()
    if (force || !r.toolCalls.length) {
      // Có dữ liệu công cụ rồi mà mô hình trả rỗng: ép trả lời thêm một lần
      if (!force && used.length && !r.content.trim()) {
        forced = true
        continue
      }
      break
    }

    const calls: ToolCall[] = r.toolCalls.slice(0, MAX_CALLS_PER_ROUND)
    messages.push({ role: 'assistant', content: r.content || null, tool_calls: calls })
    for (const call of calls) {
      emit({ type: 'status', text: STATUS[call.function.name] ?? 'Đang tra cứu…' })
      used.push(call.function.name)
      const res = await runTool({ env }, call.function.name, call.function.arguments)
      console.log('assistant_tool', call.function.name, call.function.arguments.slice(0, 300), JSON.stringify(res.data).slice(0, 160))
      for (const p of res.products ?? []) seen.set(p.slug, p)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(res.data) })
    }
  }

  if (!text.trim()) {
    text = FALLBACK
    emit({ type: 'delta', text })
  }
  const cards = cardsFor(text, seen)
  if (cards.length) emit({ type: 'products', products: cards })
  emit({ type: 'done', tools: used })
  console.log('assistant', JSON.stringify({ tools: used, cards: cards.length, ms: Date.now() - started }))
}
