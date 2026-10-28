import type { D1Migration } from '@cloudflare/vitest-plugin'
import type { Bindings } from '../src/env'

declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

declare module '*.sql?raw' {
  const sql: string
  export default sql
}
