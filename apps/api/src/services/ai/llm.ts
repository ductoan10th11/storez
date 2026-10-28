import type { Bindings } from '../../env'
import { AppError } from '../../middleware/errors'

// Client cho endpoint tương thích OpenAI. Chỉ dùng fetch, không thêm thư viện.
export type AiEnv = Pick<Bindings, 'AI_BASE_URL' | 'AI_API_KEY' | 'AI_LLM_MODEL' | 'AI_EMBEDDING_MODEL' | 'AI_RERANKER_MODEL'>

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

export const LLM_TIMEOUT_MS = 30_000
const MAX_TOKENS = 700

export const aiConfigured = (env: Partial<AiEnv>) => Boolean(env.AI_BASE_URL && env.AI_API_KEY && env.AI_LLM_MODEL)

export const aiUnavailable = () => new AppError(503, 'assistant_unavailable', 'Trợ lý Speedy tạm thời không khả dụng, vui lòng thử lại sau')

export const aiHeaders = (env: Pick<AiEnv, 'AI_API_KEY'>) => ({
  authorization: `Bearer ${env.AI_API_KEY}`,
  'content-type': 'application/json',
})

export const aiUrl = (env: Pick<AiEnv, 'AI_BASE_URL'>, path: string) => `${env.AI_BASE_URL.replace(/\/+$/, '')}${path}`

export type Round = { content: string; toolCalls: ToolCall[] }

// Một lượt gọi mô hình ở chế độ stream. onDelta nhận từng đoạn chữ; tool_calls được ghép lại từ các mảnh.
// Tắt chế độ "suy nghĩ" của mô hình để trả lời nhanh; reasoning_content (nếu có) bị bỏ.
export async function streamRound(
  env: AiEnv,
  messages: ChatMessage[],
  tools: ToolDef[] | null,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  onToolCall?: () => void, // gọi một lần khi mô hình bắt đầu yêu cầu công cụ
): Promise<Round> {
  const res = await fetch(aiUrl(env, '/chat/completions'), {
    method: 'POST',
    headers: aiHeaders(env),
    body: JSON.stringify({
      model: env.AI_LLM_MODEL,
      messages,
      stream: true,
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      chat_template_kwargs: { enable_thinking: false },
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(LLM_TIMEOUT_MS)]) : AbortSignal.timeout(LLM_TIMEOUT_MS),
  })
  if (!res.ok || !res.body) {
    console.error('llm_error', res.status)
    throw aiUnavailable()
  }

  let content = ''
  const calls: { id: string; name: string; args: string }[] = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  const handle = (line: string) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    let chunk: any
    try {
      chunk = JSON.parse(data)
    } catch {
      return
    }
    const delta = chunk.choices?.[0]?.delta
    if (!delta) return
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content
      onDelta(delta.content)
    }
    for (const tc of delta.tool_calls ?? []) {
      if (!calls.length) onToolCall?.()
      const i = typeof tc.index === 'number' ? tc.index : 0
      const cur = (calls[i] ??= { id: '', name: '', args: '' })
      if (tc.id) cur.id = tc.id
      if (tc.function?.name) cur.name += tc.function.name
      if (tc.function?.arguments) cur.args += tc.function.arguments
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: !done })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      handle(buf.slice(0, nl).trimEnd())
      buf = buf.slice(nl + 1)
    }
    if (done) break
  }
  handle(buf.trim())

  const toolCalls: ToolCall[] = calls
    .filter((c) => c.name)
    .map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }))
  return { content, toolCalls }
}
