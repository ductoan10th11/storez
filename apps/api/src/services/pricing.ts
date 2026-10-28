import type { CatalogProduct } from './catalog'

export type Picks = Record<string, string> // groupId -> choiceId
export type LineOption = { group: string; choice: string; hex?: string; price: number }

// Nhóm nào thiếu hoặc không hợp lệ thì lấy lựa chọn đầu tiên (dùng chung cho giỏ và hiển thị)
export const normalizePicks = (p: CatalogProduct, picks: Picks = {}): Picks =>
  Object.fromEntries(
    p.options.map((g) => [g.id, g.choices.some((c) => c.id === picks[g.id]) ? picks[g.id] : g.choices[0].id]),
  )

// Khi đặt hàng: picks phải khớp đúng các nhóm hiện có và mọi lựa chọn còn tồn tại (BR-PRC-2)
export const picksValid = (p: CatalogProduct, picks: Picks = {}) =>
  Object.keys(picks).length === p.options.length &&
  p.options.every((g) => g.choices.some((c) => c.id === picks[g.id]))

// Cùng xe + cùng lựa chọn thì chung một dòng giỏ hàng
export const lineId = (productId: number, picks: Picks) =>
  `${productId}~${Object.keys(picks).sort().map((k) => `${k}.${picks[k]}`).join('~')}`

// Giá và ảnh của một dòng, với picks đã chuẩn hóa/hợp lệ
export function priceLine(p: CatalogProduct, picks: Picks) {
  const options: LineOption[] = p.options.flatMap((g) => {
    const ch = g.choices.find((x) => x.id === picks[g.id])
    return ch ? [{ group: g.name, choice: ch.name, ...(ch.hex ? { hex: ch.hex } : {}), price: ch.price }] : []
  })
  const unitPrice = p.price + options.reduce((s, o) => s + o.price, 0)
  const color = p.options.find((g) => g.type === 'color')
  const image = (color && color.choices.find((c) => c.id === picks[color.id])?.image) || p.image
  return { options, unitPrice, image }
}
