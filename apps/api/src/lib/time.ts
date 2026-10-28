// Showroom tính theo Asia/Ho_Chi_Minh = UTC+7 cố định (không có giờ mùa hè).
export const VN_OFFSET = 7 * 3600
export const DAY = 86400

export const now = () => Math.floor(Date.now() / 1000)

const pad = (n: number) => String(n).padStart(2, '0')

export const isDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

// "HH:MM" -> số phút trong ngày
export const parseHm = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export const formatHm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

// ("2026-11-03", "09:00") theo giờ Việt Nam -> epoch giây
export function vnToEpoch(date: string, minutesOfDay: number) {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 1000 + minutesOfDay * 60 - VN_OFFSET
}

// epoch giây -> ngày "YYYY-MM-DD" theo giờ Việt Nam
export const epochToVnDate = (epoch: number) =>
  new Date((epoch + VN_OFFSET) * 1000).toISOString().slice(0, 10)

// epoch giây -> số phút trong ngày theo giờ Việt Nam
export const epochToVnMinutes = (epoch: number) => Math.floor((((epoch + VN_OFFSET) % DAY) + DAY) % DAY / 60)

export const addDays = (date: string, n: number) => epochToVnDate(vnToEpoch(date, 0) + n * DAY)

// 0 = Chủ nhật
export const weekday = (date: string) => new Date(vnToEpoch(date, 12 * 60) * 1000 + VN_OFFSET * 1000).getUTCDay()

export const daysBetween = (from: string, to: string) => Math.round((vnToEpoch(to, 0) - vnToEpoch(from, 0)) / DAY)
