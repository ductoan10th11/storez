import { describe, expect, it } from 'vitest'
import { priceText, runTool } from '../src/services/ai/tools'
import { ai } from './fake-ai'
import { env, setStock } from './helpers'

const run = async (name: string, args: unknown) => {
  const r = await runTool({ env }, name, typeof args === 'string' ? args : JSON.stringify(args))
  return { ...r, data: r.data as any }
}
const slugs = (data: any) => data.products.map((p: any) => p.slug)

describe('priceText', () => {
  it('đổi VND sang chữ dễ đọc', () => {
    expect(priceText(32_900_000)).toBe('32,9 triệu đồng')
    expect(priceText(135_000_000)).toBe('135 triệu đồng')
    expect(priceText(4_200_000_000)).toBe('4,2 tỷ đồng')
    expect(priceText(210_000_000_000)).toBe('210 tỷ đồng')
    expect(priceText(500_000)).toBe('500.000 đồng')
  })
})

describe('search_products', () => {
  it('lọc theo loại và giá không cần query, không gọi reranker', async () => {
    const r = await run('search_products', { category: 'o-to', max_price: 500_000_000 })
    expect(slugs(r.data)).toEqual(['o-to-city-ev'])
    expect(r.data.method).toBe('filter')
    expect(r.products?.map((p) => p.slug)).toEqual(['o-to-city-ev'])
    expect(ai.rerankCalls).toHaveLength(0)
  })

  it('nhận tên loại tiếng Việt có dấu hoặc không dấu', async () => {
    expect((await run('search_products', { category: 'Ô tô' })).data.matched).toBe(3)
    expect((await run('search_products', { category: 'xe tang' })).data.matched).toBe(3)
  })

  it('lọc khoảng giá, sắp xếp và giới hạn số kết quả', async () => {
    expect(slugs((await run('search_products', { max_price: 100_000_000 })).data)).toEqual(['xe-may-pho-rider', 'xe-may-sport-r'])
    const top = await run('search_products', { sort: 'price_desc', limit: 2 })
    expect(slugs(top.data)).toEqual(['xe-tang-heavy', 'may-bay-jet-phenom'])
    expect(top.data.matched).toBe(15)
    expect(top.data.shown).toBe(2)
    expect(slugs((await run('search_products', { min_price: 100_000_000_000 })).data)).toEqual(['may-bay-jet-phenom', 'xe-tang-main', 'xe-tang-heavy'])
  })

  it('có query thì rerank và bỏ sản phẩm dưới ngưỡng', async () => {
    const r = await run('search_products', { query: 'Tank' })
    expect(r.data.method).toBe('rerank')
    expect(slugs(r.data).sort()).toEqual(['xe-tang-heavy', 'xe-tang-light', 'xe-tang-main'])
    expect(ai.rerankCalls).toHaveLength(1)
    expect(ai.rerankCalls[0].documents).toHaveLength(15)
  })

  it('kết hợp lọc giá với rerank: chỉ rerank phần đã lọc', async () => {
    const r = await run('search_products', { query: 'Tank', max_price: 50_000_000_000 })
    expect(slugs(r.data)).toEqual(['xe-tang-light'])
    expect(ai.rerankCalls[0].documents.length).toBeLessThan(15)
  })

  it('reranker lỗi thì quay về từ khóa', async () => {
    ai.rerankFail = true
    const r = await run('search_products', { query: 'tank heavy' })
    expect(r.data.method).toBe('keyword')
    expect(slugs(r.data)[0]).toBe('xe-tang-heavy')
  })

  it('từ khóa bỏ dấu và bỏ từ thừa khi quay về tìm từ khóa', async () => {
    ai.rerankFail = true
    expect(slugs((await run('search_products', { query: 'tôi muốn mua xe điện' })).data)).toEqual(['o-to-city-ev'])
  })

  it('không khớp gì thì trả note gợi ý nới điều kiện', async () => {
    const r = await run('search_products', { max_price: 1000 })
    expect(r.data.matched).toBe(0)
    expect(r.data.products).toEqual([])
    expect(r.data.note).toMatch(/nới lỏng/)
    expect(r.products).toEqual([])
  })

  it('không lộ sản phẩm ẩn, số lượng tồn kho', async () => {
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 1').run()
    await setStock(2, 5)
    const r = await run('search_products', { category: 'xe-may' })
    expect(slugs(r.data)).toEqual(['xe-may-sport-r', 'xe-may-cruiser'])
    const text = JSON.stringify(r.data)
    expect(text).not.toMatch(/"stock"|"active"/)
    expect(r.data.products[0].availability).toBe('Có sẵn tại showroom')
    expect(r.data.products[1].availability).toMatch(/Đặt trước/)
  })

  it('in_stock_only chỉ lấy xe có sẵn', async () => {
    expect((await run('search_products', { in_stock_only: true })).data.matched).toBe(0)
    await setStock(1, 3)
    expect(slugs((await run('search_products', { in_stock_only: true })).data)).toEqual(['xe-may-pho-rider'])
  })

  it('in_stock_only không ra kết quả nhưng có xe đặt trước thì note nói rõ để mô hình tìm lại', async () => {
    const r = await run('search_products', { category: 'o-to', in_stock_only: true })
    expect(r.data.matched).toBe(0)
    expect(r.data.note).toMatch(/3 xe khớp nhu cầu nhận đặt trước/)
    expect(r.data.note).toMatch(/KHÔNG dùng in_stock_only/)
  })

  it('mỗi kết quả có giá chữ, giá số và đường dẫn', async () => {
    const [p] = (await run('search_products', { category: 'xe-may', limit: 1 })).data.products
    expect(p).toMatchObject({ slug: 'xe-may-pho-rider', name: 'Phố Rider 125', category: 'Xe máy', priceVnd: 32_900_000, price: 'từ 32,9 triệu đồng', url: '/p/xe-may-pho-rider' })
  })
})

describe('get_product / compare_products', () => {
  it('lấy chi tiết theo slug hoặc theo tên', async () => {
    for (const slug of ['o-to-city-ev', 'City EV', 'city ev']) {
      const r = await run('get_product', { slug })
      expect(r.data.name).toBe('City EV')
      expect(r.data.options.map((g: any) => g.group)).toEqual(['Màu sắc', 'Nội thất', 'Gói an toàn'])
      expect(r.data.options[1].choices).toEqual([
        { name: 'Da đen', extra: 'không phụ phí' },
        { name: 'Da be', extra: '+8 triệu đồng' },
      ])
      expect(r.products?.[0].slug).toBe('o-to-city-ev')
    }
  })

  it('sản phẩm không tồn tại hoặc đã ẩn thì báo lỗi cho mô hình', async () => {
    expect((await run('get_product', { slug: 'khong-co' })).data.error).toMatch(/Không tìm thấy/)
    await env.DB.prepare('UPDATE products SET active = 0 WHERE id = 4').run()
    expect((await run('get_product', { slug: 'o-to-city-ev' })).data.error).toMatch(/Không tìm thấy/)
  })

  it('so sánh 2-4 sản phẩm, báo cái không tìm thấy', async () => {
    const r = await run('compare_products', { slugs: ['xe-may-sport-r', 'xe-may-cruiser', 'abc-xyz'] })
    expect(r.data.products.map((p: any) => p.slug)).toEqual(['xe-may-sport-r', 'xe-may-cruiser'])
    expect(r.data.notFound).toEqual(['abc-xyz'])
    expect(r.products).toHaveLength(2)
  })

  it('so sánh cần đủ 2 sản phẩm', async () => {
    expect((await run('compare_products', { slugs: ['xe-may-sport-r'] })).data.error).toMatch(/không hợp lệ/)
  })
})

describe('quote', () => {
  it('cộng phụ phí theo tên nhóm và tên lựa chọn, không phân biệt dấu', async () => {
    const r = await run('quote', { slug: 'o-to-city-ev', choices: { 'mau sac': 'bac', 'Nội thất': 'Da be', 'Gói an toàn': 'Camera 360 + cảnh báo va chạm' } })
    expect(r.data.totalVnd).toBe(420_000_000 + 8_000_000 + 25_000_000)
    expect(r.data.total).toBe('453 triệu đồng')
    expect(r.data.selections.map((s: any) => s.choice)).toEqual(['Bạc', 'Da be', 'Camera 360 + cảnh báo va chạm'])
    expect(r.data.defaultedGroups).toBeUndefined()
  })

  it('nhóm không nói rõ hoặc lựa chọn lạ lấy mặc định và báo lại', async () => {
    const r = await run('quote', { slug: 'o-to-city-ev', choices: { 'Màu sắc': 'Đỏ' } })
    expect(r.data.totalVnd).toBe(420_000_000)
    expect(r.data.defaultedGroups).toEqual(['Màu sắc', 'Nội thất', 'Gói an toàn'])
  })
})

describe('get_showroom_info và xử lý lỗi', () => {
  it('trả địa chỉ, giờ mở cửa, cách mua', async () => {
    const r = await run('get_showroom_info', {})
    expect(r.data).toMatchObject({ phone: '0336436536', openHours: '08:00 - 18:00' })
    expect(r.data.address).toMatch(/Thái Nguyên/)
    expect(r.data.openDays).toContain('Chủ nhật')
    expect(r.data.howToBuy).toMatch(/Không giao hàng/)
  })

  it('đối số sai / công cụ lạ / JSON hỏng đều thành { error }, không ném lỗi', async () => {
    expect((await run('search_products', { max_price: 'rẻ' })).data.error).toMatch(/không hợp lệ/)
    expect((await run('search_products', { limit: 99 })).data.error).toMatch(/không hợp lệ/)
    expect((await run('drop_tables', {})).data.error).toMatch(/Không có công cụ/)
    expect((await run('search_products', '{oops')).data.error).toMatch(/JSON/)
    expect((await run('get_showroom_info', '')).data.name).toBeTruthy()
  })
})
