import { RotateCcw, SendHorizontal, Sparkles } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { vndShort } from '@/api'
import { MAX_INPUT, streamChat, type Card, type ChatMsg } from '@/lib/assistant'
import { errorText } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Availability } from './Availability'

const STORE_KEY = 'speedy-chat'
const SUGGESTIONS = ['Xe máy nào rẻ nhất?', 'Gợi ý ô tô điện đi trong phố', 'So sánh các mẫu máy bay', 'Showroom mở cửa mấy giờ?']
const GREETING = 'Chào bạn, mình là Speedy. Bạn cần tìm xe máy, ô tô, máy bay, trực thăng hay xe tăng? Cho mình biết nhu cầu và ngân sách, mình gợi ý mẫu đang bán phù hợp nhé.'

const uid = () => crypto.randomUUID()

// Chữ hiện dần với tốc độ đều (ký tự/giây), nhanh dần khi còn tồn nhiều để không bị tụt xa so với stream
const TYPE_CPS = 45
const TYPE_CATCHUP = 1
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Cắt giữa chừng có thể để lại ** chưa đóng: đóng tạm để không hiện dấu sao lạ rồi mới nhảy sang chữ đậm
const partial = (t: string) => {
  const cut = t.endsWith('*') && !t.endsWith('**') ? t.slice(0, -1) : t
  return (cut.match(/\*\*/g)?.length ?? 0) % 2 ? `${cut}**` : cut
}

// sessionStorage chỉ là tiện ích: hỏng/bị chặn thì vẫn chạy bình thường
const load = (): ChatMsg[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const save = (m: ChatMsg[]) => {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(m.slice(-30)))
  } catch {
    // bỏ qua
  }
}

// Markdown tối giản: **đậm**, gạch đầu dòng. Không dùng HTML thô nên nội dung từ mô hình không chèn được thẻ.
const inline = (s: string): ReactNode[] =>
  s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))

function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (!bullets.length) return
    const items = bullets
    blocks.push(
      <ul key={`u${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {items.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }
  for (const raw of text.split('\n')) {
    const m = /^\s*(?:[-*•]\s+)(.*)$/.exec(raw)
    if (m) bullets.push(m[1])
    else {
      flush()
      if (raw.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(raw.trim())}</p>)
    }
  }
  flush()
  return <div className="space-y-1.5">{blocks}</div>
}

function ProductMini({ c, onNavigate }: { c: Card; onNavigate: () => void }) {
  return (
    <Link
      to={`/p/${c.slug}`}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl border bg-background p-2 transition-colors hover:border-foreground/30"
    >
      <img src={c.image} alt="" className="h-[48px] w-[64px] shrink-0 rounded-lg object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{c.name}</span>
        <span className="block text-sm text-brand">từ {vndShort(c.price)}</span>
        <Availability p={c} className="mt-0 text-[11px]" />
      </span>
    </Link>
  )
}

// Chờ phản hồi: chữ có vệt sáng chạy ngang
function Thinking({ text }: { text: string }) {
  return (
    <div className="w-fit rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm shadow-xs" role="status">
      <span className="shimmer-text font-medium">{text}</span>
    </div>
  )
}

function BotMessage({ m, text, typing, waiting, status, onNavigate }: { m: ChatMsg; text: string; typing: boolean; waiting: boolean; status: string; onNavigate: () => void }) {
  const showText = text !== '' || (!waiting && !typing)
  return (
    <div className="flex max-w-[92%] flex-col gap-2">
      {showText && (
        <div className={cn('rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm shadow-xs', m.error && 'border border-destructive/40 text-destructive')}>
          <Rich text={text} />
        </div>
      )}
      {text === '' && waiting && <Thinking text={status || 'Speedy đang suy nghĩ…'} />}
      {!typing && m.cards?.map((c) => <ProductMini key={c.slug} c={c} onNavigate={onNavigate} />)}
    </div>
  )
}

export function SpeedyChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>(load)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null) // tin đang hiện dần và số ký tự đã hiện
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => save(messages), [messages])
  useEffect(() => () => abort.current?.abort(), [])
  const typingLen = reveal ? (messages.find((m) => m.id === reveal.id)?.content.length ?? 0) : 0
  const live = useRef({ len: 0, busy: false })
  live.current = { len: typingLen, busy }
  const typingId = reveal?.id

  useEffect(() => {
    if (!typingId) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(t - last, 100) / 1000
      last = t
      setReveal((r) => {
        if (!r) return r
        const { len, busy: streaming } = live.current
        if (r.n >= len) return streaming ? r : null // hiện hết và stream đã xong
        return { ...r, n: Math.min(len, r.n + (TYPE_CPS + (len - r.n) * TYPE_CATCHUP) * dt) }
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [typingId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, status, open, Math.floor(reveal?.n ?? 0)]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setOpen(false)

  async function send(text: string) {
    const content = text.trim().slice(0, MAX_INPUT)
    if (!content || busy) return
    const botId = uid()
    const history = [...messages, { id: uid(), role: 'user' as const, content }]
    setMessages([...history, { id: botId, role: 'assistant', content: '' }])
    setReveal(reducedMotion() ? null : { id: botId, n: 0 }) // tin trước (nếu đang hiện dở) hiện nốt ngay
    setInput('')
    setBusy(true)
    setStatus('')
    const ctl = (abort.current = new AbortController())
    const patch = (fn: (m: ChatMsg) => ChatMsg) => setMessages((ms) => ms.map((m) => (m.id === botId ? fn(m) : m)))
    // Chỉ gửi vai trò + nội dung, bỏ tin lỗi; máy chủ tự cắt còn 10 tin gần nhất
    const turns = history.filter((m) => !m.error && m.content).map(({ role, content }) => ({ role, content }))
    try {
      await streamChat(
        turns,
        {
          onStatus: setStatus,
          onDelta: (d) => (setStatus(''), patch((m) => ({ ...m, content: m.content + d }))),
          onProducts: (cards) => patch((m) => ({ ...m, cards })),
        },
        ctl.signal,
      )
    } catch (e) {
      if (ctl.signal.aborted) return
      console.error('speedy_chat', e)
      patch((m) => ({ ...m, content: m.content || errorText(e), error: !m.content }))
    } finally {
      if (abort.current === ctl) {
        setBusy(false)
        setStatus('')
      }
    }
  }

  function reset() {
    abort.current?.abort()
    setReveal(null)
    setMessages([])
    setBusy(false)
    setStatus('')
    inputRef.current?.focus()
  }

  return (
    <>
      <Button
        variant="brand"
        size="lg"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-12 gap-2 px-5 shadow-lg print:hidden"
        aria-label="Hỏi Speedy, trợ lý tư vấn"
      >
        <Sparkles className="size-4" />
        Hỏi Speedy
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-105">
          <SheetHeader className="flex-row items-center gap-3 border-b p-4 pr-14">
            <span className="grid size-9 place-items-center rounded-full bg-brand text-brand-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base">Speedy</SheetTitle>
              <SheetDescription className="text-xs">Trợ lý tư vấn, trả lời theo sản phẩm đang bán</SheetDescription>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới">
                <RotateCcw />
              </Button>
            )}
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-muted/30 p-4" aria-live="polite">
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm shadow-xs">{GREETING}</div>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
                  {m.content}
                </div>
              ) : (
                <BotMessage
                  key={m.id}
                  m={m}
                  text={m.id === typingId ? partial(m.content.slice(0, Math.floor(reveal!.n))) : m.content}
                  typing={m.id === typingId}
                  waiting={(busy || m.id === typingId) && m === messages.at(-1)}
                  status={status}
                  onNavigate={close}
                />
              ),
            )}
            <div ref={bottom} />
          </div>

          <form
            className="flex items-end gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              rows={1}
              maxLength={MAX_INPUT}
              placeholder="Nhập câu hỏi, vd: xe điện dưới 500 triệu"
              aria-label="Tin nhắn gửi Speedy"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border bg-background px-3.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <Button type="submit" variant="brand" size="icon-lg" disabled={busy || !input.trim()} aria-label="Gửi">
              <SendHorizontal />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
