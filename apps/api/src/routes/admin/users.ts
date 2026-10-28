import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../env'
import { pageSchema, passwordSchema, validate } from '../../lib/validate'
import { listUsers, patchUser, resetPassword, userPatchSchema } from '../../services/admin-users'

const app = new Hono<AppEnv>()

app.get('/', validate('query', pageSchema.extend({ q: z.string().optional(), role: z.enum(['customer', 'admin']).optional() })), async (c) =>
  c.json(await listUsers(c.env.DB, c.req.valid('query'))),
)

app.patch('/:id', validate('json', userPatchSchema), async (c) =>
  c.json({ user: await patchUser(c.env.DB, c.var.user!.id, c.req.param('id'), c.req.valid('json')) }),
)

app.post('/:id/reset-password', validate('json', z.object({ newPassword: passwordSchema })), async (c) => {
  await resetPassword(c.env.DB, c.var.user!.id, c.req.param('id'), c.req.valid('json').newPassword)
  return c.body(null, 204)
})

export default app
