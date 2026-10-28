import type { Picks, Product } from '@/api'

export const ADDRESS = 'Số nhà 36, đường Z115, phường Phan Đình Phùng, tỉnh Thái Nguyên'
export const PHONE = '0336436536'
export const PHONE_LABEL = '0336 436 536'
export const MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`

export const CATEGORIES = [
  { id: 'xe-may', name: 'Xe máy', image: '/vehicles/xe-may-sport-r.svg' },
  { id: 'o-to', name: 'Ô tô', image: '/vehicles/o-to-suv-ranger.svg' },
  { id: 'may-bay', name: 'Máy bay', image: '/vehicles/may-bay-jet-phenom.svg' },
  { id: 'truc-thang', name: 'Trực thăng', image: '/vehicles/truc-thang-twin.svg' },
  { id: 'xe-tang', name: 'Xe tăng', image: '/vehicles/xe-tang-main.svg' },
]

export const SORTS = [
  ['default', 'Mặc định'],
  ['asc', 'Giá thấp đến cao'],
  ['desc', 'Giá cao đến thấp'],
] as const
export type Sort = (typeof SORTS)[number][0]

// Bỏ dấu để gõ "xe tang" vẫn ra "Xe tăng"
export const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').toLowerCase()

export const catName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? ''

// Lựa chọn mặc định = phương án đầu tiên của mỗi nhóm
export const defaultPicks = (p: Product): Picks =>
  Object.fromEntries(p.options.map((g) => [g.id, g.choices[0].id]))

export const priceOf = (p: Product, picks: Picks) =>
  p.price +
  p.options.reduce((s, g) => s + (g.choices.find((c) => c.id === picks[g.id])?.price ?? 0), 0)

