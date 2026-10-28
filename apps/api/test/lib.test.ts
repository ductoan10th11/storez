import { describe, expect, it } from 'vitest'
import { newOrderCode, normalizeCode, nanoid } from '../src/lib/ids'
import { normalizePhone } from '../src/lib/phone'
import { addDays, epochToVnDate, epochToVnMinutes, vnToEpoch, weekday } from '../src/lib/time'
import { hashPassword, needsRehash, verifyPassword } from '../src/lib/password'
import { maskEmail, maskName, maskPhone } from '../src/services/masking'

// Vector từ docs/reference/lib.test.mjs
describe('che dữ liệu', () => {
  it.each([
    [maskName('Nguyễn Văn An'), 'N**** V** A*'],
    [maskName('  Trần   Thị  Bích Ngọc '), 'T*** T** B*** N***'],
    [maskName('An'), 'A*'],
    [maskName('Lê'), 'L*'],
    [maskName('A'), 'A'],
    [maskName('Nguyễn'.normalize('NFD') + ' Văn'.normalize('NFD')), 'N**** V**'],
    [maskPhone('0336436536'), '033****536'],
    [maskPhone('0912345678'), '091****678'],
    [maskEmail('hdtoan.dev@gmail.com'), 'h***@g***.com'],
    [maskEmail('an@example.co.uk'), 'a***@e***.co.uk'],
    [maskEmail('x@y.vn'), 'x***@y***.vn'],
    [maskEmail('khong-hop-le'), '***'],
  ])('%s = %s', (got, want) => expect(got).toBe(want))
})

describe('SĐT và mã đơn', () => {
  it.each([
    [normalizePhone('0336 436 536'), '0336436536'],
    [normalizePhone('+84 336.436.536'), '0336436536'],
    [normalizePhone('84336436536'), '0336436536'],
    [normalizePhone('0236123456'), null],
    [normalizePhone('12345'), null],
    [normalizeCode('ss-k7m2q-9xp4d'), 'SS-K7M2Q-9XP4D'],
    [normalizeCode('K7M2Q9XP4D'), 'SS-K7M2Q-9XP4D'],
    [normalizeCode('SS K7M2Q 9XP4D'), 'SS-K7M2Q-9XP4D'],
    [normalizeCode('SS-K7M2Q-9XP4O'), 'SS-K7M2Q-9XP40'],
    [normalizeCode('SS-K7M2Q-9XP4U'), null],
    [normalizeCode('SS-123'), null],
  ])('%s = %s', (got, want) => expect(got).toBe(want))

  it('5000 mã sinh ra hợp lệ, không trùng, tự chuẩn hóa về chính nó', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) {
      const c = newOrderCode()
      expect(c).toMatch(/^SS-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/)
      expect(normalizeCode(c)).toBe(c)
      seen.add(c)
    }
    expect(seen.size).toBe(5000)
  })

  it('nanoid đúng độ dài và ký tự', () => {
    expect(nanoid()).toMatch(/^[\w-]{21}$/)
    expect(new Set(Array.from({ length: 1000 }, () => nanoid())).size).toBe(1000)
  })
})

describe('giờ Việt Nam', () => {
  it('đổi ngày/giờ sang epoch và ngược lại', () => {
    const e = vnToEpoch('2026-11-03', 9 * 60)
    expect(e).toBe(Date.UTC(2026, 10, 3, 2, 0) / 1000)
    expect(epochToVnDate(e)).toBe('2026-11-03')
    expect(epochToVnMinutes(e)).toBe(540)
    expect(epochToVnDate(vnToEpoch('2026-11-03', 0))).toBe('2026-11-03')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(weekday('2026-11-01')).toBe(0) // Chủ nhật
  })
})

describe('mật khẩu', () => {
  it('băm đúng định dạng, so sánh đúng, muối khác nhau', async () => {
    const h = await hashPassword('matkhau-123')
    expect(h).toMatch(/^pbkdf2\$sha256\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(h).not.toContain('matkhau-123')
    expect(await verifyPassword('matkhau-123', h)).toBe(true)
    expect(await verifyPassword('sai-mat-khau', h)).toBe(false)
    expect(await hashPassword('matkhau-123')).not.toBe(h)
    expect(needsRehash(h)).toBe(false)
    expect(needsRehash(h.replace('$100000$', '$1000$'))).toBe(true)
    expect(await verifyPassword('x', 'rac')).toBe(false)
  })
})
