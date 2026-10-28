// Sinh ảnh minh họa SVG cho 15 phương tiện và biến thể theo màu.
//
// Cách dùng:  node scripts/gen-vehicle-art.mjs <thư-mục-đầu-ra> [seed.sql cũ]
// Hoặc:       make art
//
// - Không có tham số seed: chỉ sinh 15 ảnh gốc.
// - Có seed: đọc mã màu và id lựa chọn màu từ seed cũ (apps/api/seed.sql) để sinh thêm
//   ảnh theo từng màu: <tên>--<idMàu>.svg. Script đọc đúng định dạng của seed CŨ,
//   nên nếu đã thay seed bằng docs/sql/seed-catalog.sql thì chỉ cần chạy khi muốn sinh lại ảnh gốc.
// Ảnh chỉ là dữ liệu minh họa; khi admin tải ảnh thật lên R2 (xem docs/03-data-model.md) thì không cần script này.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const out = process.argv[2]
mkdirSync(out, { recursive: true })

const DARK = '#20242c'
const GLASS = '#bcd9f5'
const CHROME = '#aab3bf'

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16)
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))))
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

const wheel = (cx, cy, r, rim = '#d5dbe3') => {
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3
    return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * r * 0.58}" y2="${cy + Math.sin(a) * r * 0.58}" stroke="#8d96a3" stroke-width="3"/>`
  }).join('')
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#14171c"/><circle cx="${cx}" cy="${cy}" r="${r * 0.64}" fill="${rim}"/>${spokes}<circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#3a3f4a"/>`
}

const shadow = (cx, rx, y = 378) => `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="12" fill="#000" opacity=".22"/>`

/* ---------- xe máy ---------- */
const bike = (c) => {
  const m2 = shade(c.main, -0.25)
  if (c.kind === 'scooter')
    return `${shadow(300, 190, 380)}
    ${wheel(170, 334, 42)}${wheel(432, 334, 42)}
    <path d="M410,200 L432,334" stroke="${CHROME}" stroke-width="8" stroke-linecap="round"/>
    <path d="M118,300 Q128,232 220,226 L285,232 L302,264 L252,302 Z" fill="${c.main}"/>
    <rect x="262" y="290" width="120" height="16" rx="7" fill="${m2}"/>
    <path d="M380,304 L378,216 Q382,190 410,182 L432,222 L424,304 Z" fill="${c.main}"/>
    <path d="M128,226 Q200,204 288,226 L282,240 L134,244 Z" fill="${DARK}"/>
    <path d="M410,196 L388,176 L360,178" fill="none" stroke="${DARK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="428" cy="210" rx="9" ry="7" fill="#fff4c4"/>
    <path d="M392,304 Q432,268 466,316" fill="none" stroke="${m2}" stroke-width="9" stroke-linecap="round"/>
    <rect x="114" y="248" width="9" height="16" rx="3" fill="#e03b3b"/>`
  if (c.kind === 'cruiser')
    return `${shadow(300, 220, 382)}
    <path d="M175,318 L292,292" stroke="${DARK}" stroke-width="9" stroke-linecap="round"/>
    ${wheel(175, 318, 56)}${wheel(432, 318, 56)}
    <path d="M432,318 L372,206" stroke="${CHROME}" stroke-width="9" stroke-linecap="round"/>
    <rect x="268" y="262" width="96" height="52" rx="10" fill="#4a5060"/>
    <circle cx="298" cy="288" r="14" fill="${CHROME}"/><circle cx="338" cy="288" r="14" fill="${CHROME}"/>
    <path d="M300,306 L190,314 L132,296" fill="none" stroke="${CHROME}" stroke-width="13" stroke-linecap="round"/>
    <path d="M125,296 Q175,232 232,296" fill="none" stroke="${c.main}" stroke-width="11"/>
    <path d="M168,248 Q215,236 264,244 L264,258 L172,264 Z" fill="${DARK}"/>
    <path d="M258,230 Q300,198 352,222 Q346,264 300,264 Q262,260 258,230 Z" fill="${c.main}"/>
    <path d="M372,208 L360,170 L330,164" fill="none" stroke="${DARK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="396" cy="224" r="12" fill="${CHROME}"/><circle cx="396" cy="224" r="7" fill="#fff4c4"/>
    <path d="M388,262 Q430,236 484,290" fill="none" stroke="${c.main}" stroke-width="10" stroke-linecap="round"/>`
  return `${shadow(300, 220, 382)}
    <path d="M185,318 L290,292" stroke="${DARK}" stroke-width="9" stroke-linecap="round"/>
    ${wheel(185, 318, 54)}${wheel(420, 318, 54)}
    <path d="M420,318 L392,198" stroke="${CHROME}" stroke-width="9" stroke-linecap="round"/>
    <rect x="270" y="262" width="95" height="48" rx="12" fill="#3b4150"/>
    <path d="M300,305 L215,312 L168,296" fill="none" stroke="${CHROME}" stroke-width="12" stroke-linecap="round"/>
    <path d="M178,252 Q200,226 262,236 L262,264 L190,272 Z" fill="${c.main}"/>
    <path d="M214,238 Q245,228 272,238 L268,250 L210,252 Z" fill="${DARK}"/>
    <path d="M255,238 Q300,196 352,212 L380,252 L262,270 Z" fill="${c.main}"/>
    <path d="M365,205 L442,250 L406,286 L360,264 Z" fill="${m2}"/>
    <path d="M368,205 L396,168 L422,176 L398,214 Z" fill="rgba(130,180,230,.75)"/>
    <path d="M395,190 L374,176" stroke="${DARK}" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="432" cy="238" rx="10" ry="6" fill="#fff4c4"/>`
}

/* ---------- ô tô ---------- */
const car = (c) => {
  const W = '#0d1016'
  const k = {
    compact: {
      body: 'M95,330 L95,285 Q95,262 122,258 L195,252 Q225,200 280,192 L380,192 Q420,196 440,240 L488,254 Q510,262 510,290 L510,330 Z',
      wins: ['M222,250 Q242,208 282,203 L318,203 L318,250 Z', 'M330,203 L378,203 Q406,206 420,246 L330,250 Z'],
      x0: 95, x1: 510, wx: [185, 420], r: 48, door: 324,
    },
    sedan: {
      body: 'M70,330 L70,290 Q70,268 98,266 L175,262 Q200,258 230,226 Q250,200 300,198 L390,198 Q426,200 450,236 L478,254 L520,262 Q535,270 535,296 L535,330 Z',
      wins: ['M240,244 Q256,210 300,206 L338,206 L338,246 Z', 'M348,206 L388,206 Q414,210 436,244 L348,246 Z'],
      x0: 70, x1: 535, wx: [170, 445], r: 48, door: 342,
    },
    suv: {
      body: 'M90,330 L90,250 Q90,228 115,226 L150,224 L175,178 Q182,168 200,168 L400,168 Q425,168 440,190 L468,236 L500,244 Q518,250 518,282 L518,330 Z',
      wins: ['M190,222 L204,184 L262,184 L262,222 Z', 'M274,184 L338,184 L338,222 L274,222 Z', 'M350,184 L398,184 Q414,186 424,206 L440,222 L350,222 Z'],
      x0: 90, x1: 518, wx: [185, 425], r: 52, door: 268,
    },
  }[c.kind]
  const dark = shade(c.main, -0.3)
  return `${shadow(300, 240)}
    <path d="${k.body}" fill="${c.main}"/>
    <path d="M${k.x0},302 L${k.x1},302 L${k.x1},330 L${k.x0},330 Z" fill="#000" opacity=".2"/>
    ${k.wins.map((w) => `<path d="${w}" fill="${GLASS}"/>`).join('')}
    <path d="M${k.door},${c.kind === 'suv' ? 184 : 206} L${k.door},302" stroke="${dark}" stroke-width="3"/>
    <rect x="${k.door + 12}" y="${c.kind === 'suv' ? 236 : 246}" width="22" height="5" rx="2" fill="${dark}"/>
    ${c.kind === 'suv' ? `<path d="M180,166 L410,166" stroke="${DARK}" stroke-width="6" stroke-linecap="round"/>` : ''}
    <path d="M${k.x1 - 22},${c.kind === 'suv' ? 258 : 266} L${k.x1 - 4},${c.kind === 'suv' ? 264 : 272} L${k.x1 - 14},${c.kind === 'suv' ? 280 : 286} Z" fill="#fff4c4"/>
    <rect x="${k.x0}" y="268" width="9" height="18" rx="3" fill="#e03b3b"/>
    ${k.wx.map((x) => `<circle cx="${x}" cy="330" r="${k.r + 8}" fill="${W}"/>${wheel(x, 330, k.r)}`).join('')}
    ${c.ev ? `<path d="M${k.x1 - 70},298 L${k.x1 - 58},298 L${k.x1 - 64},308 L${k.x1 - 54},308 L${k.x1 - 70},324 L${k.x1 - 66},312 L${k.x1 - 74},312 Z" fill="#ffd23f"/>` : ''}`
}

/* ---------- máy bay ---------- */
const plane = (c) => {
  const k = { prop: { rx: 205, ry: 34, win: 5 }, turbo: { rx: 245, ry: 40, win: 9 }, jet: { rx: 255, ry: 34, win: 8 } }[c.kind]
  const cx = 305, cy = 228
  const wing = '#dfe5ee'
  const windows = Array.from({ length: k.win }, (_, i) => `<circle cx="${cx + 100 - i * 26}" cy="${cy - 10}" r="6" fill="#5b7da6"/>`).join('')
  const tail =
    c.kind === 'jet'
      ? `<path d="M120,${cy - 10} L84,120 L118,120 L168,${cy - 18} Z" fill="${c.accent}"/><path d="M92,128 L40,118 L112,112 Z" fill="${wing}"/>`
      : `<path d="M120,${cy - 8} L84,138 L122,138 L164,${cy - 12} Z" fill="${c.accent}"/><path d="M100,${cy + 4} L52,${cy + 26} L138,${cy + 18} Z" fill="${wing}"/>`
  let wings = ''
  if (c.kind === 'jet') wings = `<path d="M330,${cy + 14} L214,326 L262,332 L420,${cy + 22} Z" fill="${wing}"/><ellipse cx="318" cy="298" rx="54" ry="17" fill="#cfd6df"/><ellipse cx="368" cy="298" rx="8" ry="12" fill="#3a3f4a"/>`
  if (c.kind === 'turbo') wings = `<path d="M330,${cy + 14} L228,322 L290,328 L420,${cy + 22} Z" fill="${wing}"/><ellipse cx="288" cy="292" rx="46" ry="15" fill="#cfd6df"/><ellipse cx="236" cy="292" rx="5" ry="42" fill="#222" opacity=".45"/><circle cx="240" cy="292" r="8" fill="${c.accent}"/>`
  if (c.kind === 'prop') wings = `<path d="M330,${cy - 22} L276,160 L356,160 L410,${cy - 24} Z" fill="${wing}"/><path d="M300,${cy + 32} L286,${cy + 62} L300,${cy + 66}" fill="none" stroke="#555" stroke-width="6"/><circle cx="300" cy="${cy + 70}" r="10" fill="#222"/><circle cx="380" cy="${cy + 70}" r="10" fill="#222"/><path d="M380,${cy + 32} L380,${cy + 66}" stroke="#555" stroke-width="6"/>`
  const nose = c.kind === 'jet' ? '' : `<ellipse cx="${cx + k.rx + 6}" cy="${cy}" rx="6" ry="${c.kind === 'prop' ? 66 : 0}" fill="#222" opacity=".4"/><circle cx="${cx + k.rx + 4}" cy="${cy}" r="9" fill="${c.accent}"/>`
  return `${tail}
    ${c.kind === 'prop' ? wings : ''}
    <ellipse cx="${cx}" cy="${cy}" rx="${k.rx}" ry="${k.ry}" fill="${c.body}"/>
    <clipPath id="fz"><ellipse cx="${cx}" cy="${cy}" rx="${k.rx}" ry="${k.ry}"/></clipPath>
    <rect x="0" y="${cy + 8}" width="600" height="9" fill="${c.accent}" clip-path="url(#fz)"/>
    <rect x="0" y="${cy + 17}" width="600" height="5" fill="${c.accent2 || c.accent}" opacity=".6" clip-path="url(#fz)"/>
    ${windows}
    <path d="M${cx + k.rx - 52},${cy - 16} Q${cx + k.rx - 18},${cy - 18} ${cx + k.rx - 8},${cy - 2} L${cx + k.rx - 52},${cy - 2} Z" fill="#5b7da6"/>
    ${c.kind === 'prop' ? '' : wings}
    ${nose}`
}

/* ---------- trực thăng ---------- */
const heli = (c) => {
  const glass = 'rgba(160,205,245,.9)'
  return `${shadow(300, 170, 384)}
    <path d="M172,346 L420,346 Q446,346 450,324" fill="none" stroke="${DARK}" stroke-width="8" stroke-linecap="round"/>
    <path d="M236,302 L230,346 M352,306 L358,346" stroke="${DARK}" stroke-width="7"/>
    <path d="M190,228 L66,212 L66,232 L196,264 Z" fill="${c.main}"/>
    <path d="M66,212 L48,166 L76,168 L86,218 Z" fill="${c.accent}"/>
    <circle cx="56" cy="196" r="24" fill="#222" opacity=".22"/>
    <path d="M180,255 Q175,185 255,175 L355,178 Q420,190 448,262 Q440,306 380,308 L225,308 Q185,300 180,255 Z" fill="${c.main}"/>
    <path d="M360,186 Q415,200 436,258 L350,258 Z" fill="${glass}"/>
    <path d="M262,190 L345,192 L340,256 L250,256 Q246,206 262,190 Z" fill="${glass}"/>
    <path d="M184,284 L444,284 L440,298 L186,300 Z" fill="${c.accent}"/>
    ${c.twin ? `<path d="M236,180 Q262,150 290,180 Z M296,180 Q322,150 350,180 Z" fill="${DARK}"/>` : `<path d="M250,178 Q298,152 345,178 Z" fill="${DARK}"/>`}
    <rect x="292" y="140" width="10" height="38" rx="3" fill="${DARK}"/>
    <ellipse cx="298" cy="140" rx="250" ry="6" fill="#222" opacity=".18"/>
    <path d="M52,138 L544,134 L544,146 L52,150 Z" fill="${DARK}" opacity=".9"/>
    <circle cx="297" cy="140" r="9" fill="#555"/>
    ${c.cross ? `<g transform="translate(212 262)"><circle r="20" fill="#fff"/><rect x="-5" y="-14" width="10" height="28" fill="#e03b3b"/><rect x="-14" y="-5" width="28" height="10" fill="#e03b3b"/></g>` : ''}`
}

/* ---------- xe tăng ---------- */
const tank = (c) => {
  const k = {
    light: { hull: 'M110,300 L150,256 L440,256 L495,298 Z', turret: 'M230,256 L246,218 Q256,204 282,204 L350,204 Q372,208 382,226 L394,256 Z', barrel: [380, 218, 100, 12], hatch: [296, 206] },
    main: { hull: 'M108,300 L146,248 L442,248 L496,298 Z', turret: 'M205,248 L226,200 Q238,184 276,184 L372,184 Q402,190 414,214 L430,248 Z', barrel: [402, 200, 140, 15], hatch: [290, 186] },
    heavy: { hull: 'M104,300 L138,234 L452,234 L500,298 Z', turret: 'M196,234 L214,184 Q228,166 270,166 L378,166 Q412,172 426,200 L444,234 Z', barrel: [412, 184, 150, 20], hatch: [286, 168] },
  }[c.kind]
  const m2 = shade(c.main, -0.22), m3 = shade(c.main, 0.12)
  const wheels = Array.from({ length: 6 }, (_, i) => `<circle cx="${140 + i * 64}" cy="342" r="19" fill="#4a505a" stroke="#1b1e24" stroke-width="3"/><circle cx="${140 + i * 64}" cy="342" r="7" fill="#22262d"/>`).join('')
  const [bx, by, bw, bh] = k.barrel
  return `${shadow(300, 235, 382)}
    <rect x="98" y="312" width="404" height="58" rx="29" fill="#23272e"/>
    ${wheels}
    <circle cx="474" cy="340" r="25" fill="#3a3f48" stroke="#1b1e24" stroke-width="3"/><circle cx="126" cy="340" r="23" fill="#3a3f48" stroke="#1b1e24" stroke-width="3"/>
    <path d="M92,320 L508,320 L492,298 L108,298 Z" fill="${m2}"/>
    <path d="${k.hull}" fill="${c.main}"/>
    <ellipse cx="230" cy="278" rx="34" ry="9" fill="${c.camo}" opacity=".55"/><ellipse cx="350" cy="276" rx="42" ry="8" fill="${c.camo}" opacity=".55"/>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="#2f343c"/>
    <rect x="${bx + bw - 14}" y="${by - 3}" width="16" height="${bh + 6}" rx="3" fill="#232830"/>
    <path d="${k.turret}" fill="${m3}"/>
    <ellipse cx="${k.hatch[0] + 56}" cy="${k.hatch[1] + 10}" rx="34" ry="8" fill="${c.camo}" opacity=".5"/>
    <ellipse cx="${k.hatch[0]}" cy="${k.hatch[1]}" rx="22" ry="7" fill="${DARK}"/>
    <rect x="${k.hatch[0] + 40}" y="${k.hatch[1] - 14}" width="26" height="6" rx="2" fill="#2f343c"/>`
}

const THEME = {
  moto: { bg: ['#ffe5d2', '#ffc29b'], ground: '#3a3f4a' },
  car: { bg: ['#e0ebf7', '#b6cbe6'], ground: '#2c323c' },
  plane: { bg: ['#d3e9ff', '#8fc3f7'], ground: null },
  heli: { bg: ['#ffeac6', '#ffc57c'], ground: '#4a3a2e' },
  tank: { bg: ['#e6ead2', '#c3cc9e'], ground: '#6b6847' },
}

const clouds = `<g fill="#fff" opacity=".85"><ellipse cx="120" cy="90" rx="62" ry="18"/><ellipse cx="160" cy="76" rx="40" ry="18"/><ellipse cx="480" cy="340" rx="70" ry="18"/><ellipse cx="520" cy="324" rx="40" ry="16"/><ellipse cx="470" cy="70" rx="50" ry="14"/></g>`
const sun = `<circle cx="500" cy="110" r="46" fill="#fff4d0" opacity=".8"/>`
const hills = (f) => `<path d="M0,330 L120,262 L230,318 L360,240 L500,310 L600,270 L600,450 L0,450 Z" fill="${f}" opacity=".35"/>`

const items = [
  ['xe-may-pho-rider', 'moto', bike, { kind: 'scooter', main: '#ff7a1a' }],
  ['xe-may-sport-r', 'moto', bike, { kind: 'sport', main: '#e5322d' }],
  ['xe-may-cruiser', 'moto', bike, { kind: 'cruiser', main: '#2b2f3a' }],
  ['o-to-city-ev', 'car', car, { kind: 'compact', main: '#25b8a6', ev: true }],
  ['o-to-sedan-prime', 'car', car, { kind: 'sedan', main: '#4d6ea8' }],
  ['o-to-suv-ranger', 'car', car, { kind: 'suv', main: '#3d6b4f' }],
  ['may-bay-sky-trainer', 'plane', plane, { kind: 'prop', body: '#fdfdfd', accent: '#e5322d' }],
  ['may-bay-turboprop', 'plane', plane, { kind: 'turbo', body: '#fdfdfd', accent: '#2b5fbf', accent2: '#8fb4f5' }],
  ['may-bay-jet-phenom', 'plane', plane, { kind: 'jet', body: '#fdfdfd', accent: '#c8942a', accent2: '#2b2f3a' }],
  ['truc-thang-scout', 'heli', heli, { main: '#ffcf33', accent: '#2b2f3a' }],
  ['truc-thang-twin', 'heli', heli, { main: '#2e4a86', accent: '#ff7a1a', twin: true }],
  ['truc-thang-rescue', 'heli', heli, { main: '#f4f4f4', accent: '#e5322d', twin: true, cross: true }],
  ['xe-tang-light', 'tank', tank, { kind: 'light', main: '#6f7f45', camo: '#4a5a2c' }],
  ['xe-tang-main', 'tank', tank, { kind: 'main', main: '#b59a63', camo: '#8a7240' }],
  ['xe-tang-heavy', 'tank', tank, { kind: 'heavy', main: '#4e5a4a', camo: '#333d30' }],
]

const render = (theme, draw, c) => {
  const t = THEME[theme]
  const scene =
    theme === 'plane'
      ? clouds
      : `${theme === 'heli' ? sun : ''}${theme === 'tank' || theme === 'moto' ? hills(t.ground) : ''}<rect x="0" y="372" width="600" height="78" fill="${t.ground}"/><rect x="0" y="372" width="600" height="4" fill="#000" opacity=".15"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450" width="600" height="450">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg[0]}"/><stop offset="1" stop-color="${t.bg[1]}"/></linearGradient></defs>
  <rect width="600" height="450" fill="url(#g)"/>
  ${scene}
  ${draw(c)}
</svg>
`
}

for (const [name, theme, draw, c] of items) writeFileSync(`${out}/${name}.svg`, render(theme, draw, c))

// Biến thể theo màu: lấy id + mã màu từ seed.sql để luôn khớp với option trong DB
const paint = (name, c, hex) => {
  if (name === 'truc-thang-rescue' || name.startsWith('may-bay')) {
    const accent2 = name === 'may-bay-turboprop' ? shade(hex, 0.45) : c.accent2
    return { ...c, accent: hex, accent2 }
  }
  if (name.startsWith('xe-tang')) return { ...c, main: hex, camo: shade(hex, -0.3) }
  return { ...c, main: hex }
}

const seedPath = process.argv[3]
let variants = 0
if (seedPath) {
  const sql = readFileSync(seedPath, 'utf8')
  for (const line of sql.split('\n')) {
    const img = line.match(/\/vehicles\/([\w-]+)\.svg/)
    const opt = line.match(/'(\[.*\])'\)[,;]\s*$/)
    if (!img || !opt) continue
    const item = items.find((it) => it[0] === img[1])
    if (!item) throw new Error(`không có ảnh gốc cho ${img[1]}`)
    const color = JSON.parse(opt[1]).find((g) => g.type === 'color')
    for (const ch of color?.choices ?? []) {
      writeFileSync(`${out}/${item[0]}--${ch.id}.svg`, render(item[1], item[2], paint(item[0], item[3], ch.hex)))
      variants++
    }
  }
}
console.log(items.length, 'ảnh gốc,', variants, 'biến thể màu')
