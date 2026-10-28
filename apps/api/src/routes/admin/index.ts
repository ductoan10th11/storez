import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { noStore, requireAdmin } from '../../middleware/auth'
import media from './media'
import orders from './orders'
import products from './products'
import settings from './settings'
import stats from './stats'
import users from './users'

// Mọi route /api/admin/* đi qua requireAdmin: 401 chưa đăng nhập, 403 không phải admin
const app = new Hono<AppEnv>()
app.use('*', noStore, requireAdmin)

app.route('/', products)
app.route('/media', media)
app.route('/', orders)
app.route('/users', users)
app.route('/', settings)
app.route('/stats', stats)

export default app
