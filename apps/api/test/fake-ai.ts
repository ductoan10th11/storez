import { fetchHandlers } from './fake-cloudinary'

// LLM + reranker giả cho trợ lý Speedy. Mỗi lần gọi /chat/completions lấy một bước từ kịch bản.
type Step = { content?: string; narration?: string; tools?: { name: string; args: unknown }[]; status?: number; hang?: boolean }

export const ai = {
  script: [] as Step[],
  requests: [] as { messages: any[]; tools: any[] | undefined; body: any }[],
  rerankCalls: [] as { query: string; documents: string[] }[],
  rerankFail: false,
  // Điểm giả: số từ của truy vấn xuất hiện trong tài liệu / số từ truy vấn
  rerankScore: (query: string, doc: string) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return words.length ? words.filter((w) => doc.toLowerCase().includes(w)).length / words.length : 0
  },
  reset() {
    this.script = []
    this.requests = []
    this.rerankCalls = []
    this.rerankFail = false
  },
}

const sse = (chunks: unknown[]) =>
  new Response([...chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`), 'data: [DONE]\n\n'].join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })

const chunk = (delta: unknown, finish: string | null = null) => ({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })

fetchHandlers.push(async (url, init) => {
  if (url.hostname !== 'ai.test') return undefined
  const body = JSON.parse(String(init?.body ?? '{}'))
  if (url.pathname === '/v1/rerank') {
    ai.rerankCalls.push({ query: body.query, documents: body.documents })
    if (ai.rerankFail) return new Response('boom', { status: 500 })
    const results = (body.documents as string[]).map((d, index) => ({ index, relevance_score: ai.rerankScore(body.query, d) }))
    return Response.json({ results })
  }
  if (url.pathname === '/v1/chat/completions') {
    ai.requests.push({ messages: body.messages, tools: body.tools, body })
    const step = ai.script.shift() ?? { content: 'Hết kịch bản' }
    if (step.status) return new Response('upstream error', { status: step.status })
    if (step.hang) return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const chunks: unknown[] = [chunk({ role: 'assistant', reasoning_content: 'đang nghĩ' })]
    if (step.tools) {
      if (step.narration) chunks.push(chunk({ content: step.narration }))
      // Tên và đối số tới theo nhiều mảnh như LLM thật
      step.tools.forEach((t, i) => {
        const args = JSON.stringify(t.args)
        chunks.push(chunk({ tool_calls: [{ index: i, id: `call_${i}`, type: 'function', function: { name: t.name, arguments: '' } }] }))
        chunks.push(chunk({ tool_calls: [{ index: i, function: { arguments: args.slice(0, 7) } }] }))
        chunks.push(chunk({ tool_calls: [{ index: i, function: { arguments: args.slice(7) } }] }))
      })
      chunks.push(chunk({}, 'tool_calls'))
    } else {
      const text = step.content ?? ''
      for (let i = 0; i < text.length; i += 7) chunks.push(chunk({ content: text.slice(i, i + 7) }))
      chunks.push(chunk({}, 'stop'))
    }
    return sse(chunks)
  }
  return new Response('not found', { status: 404 })
})
