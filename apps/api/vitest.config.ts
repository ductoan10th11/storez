import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, CLOUD_NAME: 'test-cloud', CLOUD_API_KEY: '123456', CLOUD_API_SECRET: 'test-secret',
            AI_BASE_URL: 'https://ai.test/v1', AI_API_KEY: 'ai-test-key', AI_LLM_MODEL: 'test-llm', AI_EMBEDDING_MODEL: 'test-embed', AI_RERANKER_MODEL: 'test-rerank' },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
    },
  }
})
