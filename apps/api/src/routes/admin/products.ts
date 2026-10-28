import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../env'
import { pageSchema, validate } from '../../lib/validate'
import { AppError } from '../../middleware/errors'
import {
  categoryCreateSchema, categoryUpdateSchema, createCategory, createProduct, deleteCategory, deleteProduct,
  listAdminCategories, listAdminProducts, loadAdminProduct, patchProduct, productInputSchema, quickPatchSchema,
  updateCategory, updateProduct,
} from '../../services/admin-products'

const app = new Hono<AppEnv>()

const idParam = (v: string) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1) throw new AppError(404, 'not_found', 'Không tìm thấy')
  return n
}

app.get(
  '/products',
  validate('query', pageSchema.extend({ q: z.string().optional(), category: z.string().optional(), active: z.enum(['0', '1']).optional() })),
  async (c) => c.json(await listAdminProducts(c.env.DB, c.req.valid('query'))),
)

app.get('/products/:id', async (c) => {
  const p = await loadAdminProduct(c.env.DB, idParam(c.req.param('id')))
  if (!p) throw new AppError(404, 'not_found', 'Không tìm thấy sản phẩm')
  return c.json({ product: p })
})

app.post('/products', validate('json', productInputSchema), async (c) =>
  c.json({ product: await createProduct(c.env.DB, c.req.valid('json'), c.var.user!.id) }, 201),
)

app.put('/products/:id', validate('json', productInputSchema), async (c) =>
  c.json({ product: await updateProduct(c.env.DB, idParam(c.req.param('id')), c.req.valid('json'), c.var.user!.id) }),
)

app.patch('/products/:id', validate('json', quickPatchSchema), async (c) =>
  c.json({ product: await patchProduct(c.env.DB, idParam(c.req.param('id')), c.req.valid('json'), c.var.user!.id) }),
)

app.delete('/products/:id', async (c) => {
  await deleteProduct(c.env.DB, idParam(c.req.param('id')), c.var.user!.id)
  return c.body(null, 204)
})

app.get('/categories', async (c) => c.json(await listAdminCategories(c.env.DB)))

app.post('/categories', validate('json', categoryCreateSchema), async (c) =>
  c.json({ category: await createCategory(c.env.DB, c.req.valid('json'), c.var.user!.id) }, 201),
)

app.put('/categories/:id', validate('json', categoryUpdateSchema), async (c) =>
  c.json({ category: await updateCategory(c.env.DB, idParam(c.req.param('id')), c.req.valid('json'), c.var.user!.id) }),
)

app.delete('/categories/:id', async (c) => {
  await deleteCategory(c.env.DB, idParam(c.req.param('id')), c.var.user!.id)
  return c.body(null, 204)
})

export default app
