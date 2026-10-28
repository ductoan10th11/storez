import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { nameSchema, optionalEmail, passwordSchema, phoneSchema, validate } from '../lib/validate'
import { normalizeEmail, normalizePhone } from '../lib/phone'
import { noStore, requireAuth } from '../middleware/auth'
import { checkRate, clientIp, rateLimit } from '../middleware/rate-limit'
import { clearSessionCookie, setSessionCookie } from '../middleware/session'
import { deleteSession, login, register } from '../services/auth'
import { mergeGuestCart } from '../services/cart'

const app = new Hono<AppEnv>()
app.use('*', noStore)

app.get('/me', (c) => c.json({ user: c.var.user }))

app.post(
  '/register',
  rateLimit('register', 5, 3600),
  validate(
    'json',
    z.object({
      phone: phoneSchema,
      password: passwordSchema,
      name: nameSchema,
      email: optionalEmail,
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const meta = { ua: c.req.header('user-agent'), ip: clientIp(c) }
    const { user, token, linkedOrders } = await register(c.env.DB, body, meta)
    const mergedCartLines = await mergeGuestCart(c.env.DB, c.env.CART, user.id, c.req.header('x-cart-id'))
    setSessionCookie(c, token)
    return c.json({ user, linkedOrders, mergedCartLines }, 201)
  },
)

app.post(
  '/login',
  rateLimit('login-ip', 30, 900),
  validate('json', z.object({ identifier: z.string().trim().min(1, 'Nhập số điện thoại hoặc email'), password: z.string().min(1, 'Nhập mật khẩu') })),
  async (c) => {
    const { identifier, password } = c.req.valid('json')
    const by = identifier.includes('@') ? 'email' : 'phone'
    const value = by === 'email' ? normalizeEmail(identifier) : normalizePhone(identifier)
    const ip = clientIp(c)
    await checkRate(c.env.CART, 'login', `${ip}:${value ?? identifier.toLowerCase()}`, 10, 900)
    const { user, token } = await login(c.env.DB, { by, value, password }, { ua: c.req.header('user-agent'), ip })
    const mergedCartLines = await mergeGuestCart(c.env.DB, c.env.CART, user.id, c.req.header('x-cart-id'))
    setSessionCookie(c, token)
    return c.json({ user, mergedCartLines })
  },
)

app.post('/logout', requireAuth, async (c) => {
  await deleteSession(c.env.DB, c.var.sessionId!)
  clearSessionCookie(c)
  return c.body(null, 204)
})

export default app
