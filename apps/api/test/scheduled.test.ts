import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:workers'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import worker, { runScheduled } from '../src/index'
import { adminCookie, count, post, quickOrder, registerUser, setStock, stockOf } from './helpers'

const expireHold = (code: string) => env.DB.prepare('UPDATE orders SET hold_expires_at = 1 WHERE code = ?').bind(code).run()
const status = async (code: string) => (await env.DB.prepare('SELECT status FROM orders WHERE code = ?').bind(code).first<any>()).status

describe('cron hằng giờ', () => {
  it('đơn pending quá hạn thành expired, có sự kiện, kho được trả; chạy lần hai không đổi gì', async () => {
    await setStock(1, 5)
    const o = await quickOrder({ qty: 2 })
    expect(await stockOf(1)).toBe(3)
    await expireHold(o.code)

    const ctx = createExecutionContext()
    await worker.scheduled(createScheduledController(), env, ctx)
    await waitOnExecutionContext(ctx)
    expect(await status(o.code)).toBe('expired')
    expect(await stockOf(1)).toBe(5)
    const ev = await env.DB.prepare(`SELECT status, actor_id FROM order_events WHERE status = 'expired'`).all<any>()
    expect(ev.results).toEqual([{ status: 'expired', actor_id: null }])

    await runScheduled(env)
    expect(await stockOf(1)).toBe(5)
    expect(await count('order_events')).toBe(2)
  })

  it('đơn confirmed không bị hết hạn; đơn còn hạn không đổi', async () => {
    const admin = await adminCookie()
    const confirmed = await quickOrder({ phone: '0912345678' })
    await post(`/api/admin/orders/${confirmed.code}/status`, { status: 'confirmed' }, admin.opts)
    await expireHold(confirmed.code)
    const fresh = await quickOrder({ phone: '0912345679' })
    await runScheduled(env)
    expect(await status(confirmed.code)).toBe('confirmed')
    expect(await status(fresh.code)).toBe('pending')
  })

  it('đơn đã bị khách hủy trước đó không bị hết hạn lại và không cộng kho hai lần', async () => {
    await setStock(1, 5)
    const o = await quickOrder({ qty: 2 })
    await env.DB.prepare(`UPDATE orders SET status = 'cancelled' WHERE code = ?`).bind(o.code).run()
    await env.DB.prepare('UPDATE products SET stock = 5 WHERE id = 1').run()
    await expireHold(o.code)
    await runScheduled(env)
    expect(await status(o.code)).toBe('cancelled')
    expect(await stockOf(1)).toBe(5)
  })

  it('xe làm theo đơn (stock NULL) hết hạn không đụng kho', async () => {
    const o = await quickOrder({ qty: 3 })
    await expireHold(o.code)
    await runScheduled(env)
    expect(await status(o.code)).toBe('expired')
    expect(await stockOf(1)).toBeNull()
  })

  it('dọn phiên hết hạn, giữ phiên còn hạn', async () => {
    const a = await registerUser()
    await registerUser()
    await env.DB.prepare('UPDATE sessions SET expires_at = 1 WHERE user_id = ?').bind(a.user.id).run()
    await runScheduled(env)
    expect(await count('sessions')).toBe(1)
  })
})
