// CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SECRET: tài khoản Cloudinary lưu ảnh tải lên (wrangler secret / .dev.vars)
// AI_*: endpoint tương thích OpenAI cho trợ lý Speedy (chat, rerank, embedding). AI_BASE_URL gồm cả tiền tố /v1 nếu có.
export type Bindings = {
  DB: D1Database
  CART: KVNamespace
  CLOUD_NAME: string
  CLOUD_API_KEY: string
  CLOUD_API_SECRET: string
  AI_BASE_URL: string
  AI_API_KEY: string
  AI_LLM_MODEL: string
  AI_EMBEDDING_MODEL: string
  AI_RERANKER_MODEL: string
}

export type SessionUser = {
  id: string
  phone: string
  name: string
  email: string | null
  role: 'customer' | 'admin'
}

export type Variables = { user: SessionUser | null; sessionId: string | null }

export type AppEnv = { Bindings: Bindings; Variables: Variables }
