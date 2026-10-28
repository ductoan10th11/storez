import { aiHeaders, aiUrl, type AiEnv } from './llm'

const TIMEOUT_MS = 8_000

// Chấm điểm mức liên quan của từng tài liệu với câu truy vấn (điểm 0..1).
// Mọi lỗi (mạng, chưa cấu hình, định dạng lạ) trả null để nơi gọi quay về tìm theo từ khóa.
export async function rerank(env: Partial<AiEnv>, query: string, documents: string[]): Promise<number[] | null> {
  if (!env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_RERANKER_MODEL || !documents.length) return null
  try {
    const res = await fetch(aiUrl(env as AiEnv, '/rerank'), {
      method: 'POST',
      headers: aiHeaders(env as AiEnv),
      body: JSON.stringify({ model: env.AI_RERANKER_MODEL, query, documents }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { results?: { index: number; relevance_score: number }[] }
    if (!Array.isArray(body.results)) return null
    const scores = new Array<number>(documents.length).fill(0)
    for (const r of body.results) if (r.index >= 0 && r.index < documents.length) scores[r.index] = r.relevance_score
    return scores
  } catch {
    return null
  }
}
