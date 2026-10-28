import assert from 'node:assert/strict'
import { maskName, maskPhone, maskEmail, normalizePhone, newOrderCode, normalizeCode } from './lib.mjs'
const t = [
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
]
for (const [got, want] of t) assert.equal(got, want, `${got} != ${want}`)
const seen = new Set()
for (let i = 0; i < 5000; i++) { const c = newOrderCode(); assert.match(c, /^SS-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/); assert.equal(normalizeCode(c), c); seen.add(c) }
assert.equal(seen.size, 5000)
console.log(t.length, 'vector đúng; 5000 mã sinh ra đều hợp lệ, không trùng, tự chuẩn hóa về chính nó')
