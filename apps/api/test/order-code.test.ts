import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:workers'
import { contact, count, newCart, slot, addItem, quickOrder } from './helpers'
import { AppError } from '../src/middleware/errors'
import { kvStore } from '../src/services/cart'
import { createOrder } from '../src/services/orders'

// Gọi thẳng service để điều khiển bộ sinh mã
async function create(newCode: () => string) {
  const cartId = newCart()
  await addItem(cartId, 1)
  const c = contact({ phone: '0912345678' })
  return createOrder(env.DB, {
    input: { contact: { ...c, phone: c.phone, email: 'a@example.com', address: null }, note: null, pickupAt: await slot() },
    store: kvStore(env.CART, cartId),
    userId: null,
    newCode,
  })
}

describe('sinh mã đơn khi bị trùng', () => {
  it('trùng mã thì sinh mã mới và thử lại', async () => {
    const first = await quickOrder()
    const queue = [first.code, first.code]
    const calls: string[] = []
    const second = await create(() => {
      const code = queue.shift() ?? 'SS-ABCDE-FGHJK'
      calls.push(code)
      return code
    })
    expect(calls).toEqual([first.code, first.code, 'SS-ABCDE-FGHJK'])
    expect(second.code).toBe('SS-ABCDE-FGHJK')
    expect(await count('orders')).toBe(2)
    expect(await count('order_items')).toBe(2) // lần thử lỗi không để lại dòng nào
    expect(await count('order_events')).toBe(2)
  })

  it('trùng liên tiếp 5 lần thì báo lỗi và không tạo gì', async () => {
    const first = await quickOrder()
    let calls = 0
    const err = await create(() => (calls++, first.code)).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.status).toBe(500)
    expect(calls).toBe(5)
    expect(await count('orders')).toBe(1)
    expect(await count('order_items')).toBe(1)
  })
})
