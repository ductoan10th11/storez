import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv, Bindings } from './env'
import { errorBody, notFound, onError, requireJson } from './middleware/errors'
import { session } from './middleware/session'
import account from './routes/account'
import admin from './routes/admin'
import assistant from './routes/assistant'
import auth from './routes/auth'
import cart from './routes/cart'
import catalog from './routes/catalog'
import orders from './routes/orders'
import track from './routes/track'
import { cleanExpiredSessions } from './services/auth'
import { cleanOrphanMedia } from './services/media'
import { expireOrders } from './services/orders'

const api = new Hono<AppEnv>()
api.use('*', session)
api.use('*', requireJson)
api.route('/', catalog)
api.route('/cart', cart)
api.route('/auth', auth)
api.route('/orders', orders)
api.route('/track', track)
api.route('/account', account)
api.route('/assistant', assistant)
api.route('/admin', admin)
api.all('*', (c) => c.json(errorBody('not_found', 'Không tìm thấy'), 404))

export const app = new Hono<AppEnv>()
app.use('*', secureHeaders())
app.onError(onError)
app.notFound(notFound)
app.route('/api', api)

// Việc định kỳ (mỗi giờ). Mỗi việc idempotent và có giới hạn số dòng.
export async function runScheduled(env: Bindings) {
  const [expired, sessions, mediaRemoved] = await Promise.all([
    expireOrders(env.DB),
    cleanExpiredSessions(env.DB),
    cleanOrphanMedia(env),
  ])
  console.log('scheduled', JSON.stringify({ expired, sessions, mediaRemoved }))
}

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(env))
  },
} satisfies ExportedHandler<Bindings>
