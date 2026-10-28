# 08. Trợ lý AI Speedy

Trợ lý tư vấn khách bằng tiếng Việt dựa trên **sản phẩm đang bán**. Nút "Hỏi Speedy" nổi ở mọi trang cửa hàng (không có ở `/admin`). Khách vãng lai dùng được, không cần đăng nhập.

## 1. Vì sao dùng tool calling, không dùng RAG

Sản phẩm, giá, tùy chọn, tồn kho đổi liên tục. RAG cần nhúng vector cho từng sản phẩm và giữ index đồng bộ, lệch là báo sai giá. Với tool calling, mô hình gọi các công cụ đọc **thẳng D1 ở thời điểm hỏi**, nên không có chỗ nào để dữ liệu cũ. Câu hỏi có điều kiện ("dưới 500 triệu", "so sánh A và B") cũng hợp với lọc có cấu trúc hơn là so khớp vector.

Phần hiểu nghĩa cho câu hỏi mơ hồ ("xe đi làm trong phố") dùng **reranker lúc truy vấn**: chấm điểm các sản phẩm đã qua bộ lọc với câu hỏi, không lưu vector nào. Mô hình embedding (`AI_EMBEDDING_MODEL`) **chưa dùng**; chỉ cần khi catalog lên cỡ vài trăm sản phẩm (khi đó cache vector trong KV theo hash nội dung + `updated_at`).

## 2. Luồng một câu hỏi

```
Trình duyệt ── POST /api/assistant/chat {messages} ──► Worker
   ▲                                                    │ rate limit (KV) → kiểm tra body
   │ SSE: status / delta / products / done / error      ▼
   └────────────────────────────────────────── runAgent (services/ai/agent.ts)
                                                  │ lặp tối đa 4 lượt:
                                                  │   LLM (stream) ─ gọi công cụ? ─ có ─► runTool ► D1 / reranker ─┐
                                                  │        ▲                                                       │
                                                  │        └───────────── kết quả công cụ (JSON) ◄─────────────────┘
                                                  └ không gọi nữa ─► câu trả lời + thẻ sản phẩm
```

- Server **không giữ trạng thái**: trình duyệt gửi lại lịch sử (lưu `sessionStorage`), server chỉ lấy 10 tin cuối, tin của khách tối đa 500 ký tự.
- Mỗi lượt tối đa 3 công cụ; hết 4 lượt (hoặc mô hình trả rỗng sau khi đã có dữ liệu) thì lượt kế bị **buộc trả lời** (không có công cụ, kèm lời nhắc).
- Lời dẫn trước khi gọi công cụ ("Để mình tìm...") bị giữ lại và bỏ, khách chỉ thấy câu trả lời thật.
- **Thẻ sản phẩm do server dựng từ D1**, chọn theo sản phẩm mà câu trả lời nhắc tên (tối đa 4). Giá và đường dẫn trên thẻ không phụ thuộc chữ do mô hình viết.

## 3. Công cụ (`services/ai/tools.ts`)

| Công cụ | Việc | Ghi chú |
|---|---|---|
| `search_products` | Lọc theo loại, giá, "có sẵn"; `query` được rerank | Không có `query` thì chỉ lọc (không gọi reranker). Reranker lỗi → quay về khớp từ khóa. Ngưỡng điểm `RERANK_MIN_SCORE` |
| `get_product` | Chi tiết, tùy chọn kèm phụ phí, tình trạng | Nhận slug hoặc tên |
| `compare_products` | So sánh 2-4 sản phẩm | Báo slug không tìm thấy |
| `quote` | Giá cuối theo màu/phiên bản/phụ kiện | Dùng `pricing.ts` (`priceLine`); nhóm không nói rõ thì lấy mặc định và báo lại |
| `get_showroom_info` | Địa chỉ, SĐT, giờ mở cửa, cách mua | Đọc từ bảng `settings` |

Quy ước: chỉ trả dữ liệu công khai (`toPublic`): **không có số lượng tồn kho, không có sản phẩm ẩn**. Mỗi sản phẩm có `price` dạng chữ ("từ 32,9 triệu đồng") và `priceVnd` để mô hình không tự đổi đơn vị. Công cụ không bao giờ ném lỗi: lỗi đổi thành `{ error }` để mô hình tự sửa.

## 4. Cấu hình

| Biến | Ý nghĩa |
|---|---|
| `AI_BASE_URL` | Endpoint tương thích OpenAI, gồm cả tiền tố nếu có (`/chat/completions`, `/rerank` nối sau) |
| `AI_API_KEY` | Khóa Bearer |
| `AI_LLM_MODEL` | Mô hình chat có tool calling. Gửi kèm `chat_template_kwargs.enable_thinking=false` cho nhanh |
| `AI_RERANKER_MODEL` | Mô hình rerank (`POST /rerank {model, query, documents}`) |
| `AI_EMBEDDING_MODEL` | Chưa dùng |

Local: `apps/api/.dev.vars`. Production: `cd apps/api && npx wrangler secret bulk .dev.vars`. Thiếu `AI_BASE_URL`/`AI_API_KEY`/`AI_LLM_MODEL` thì `/api/assistant/chat` trả `503 assistant_unavailable`, phần còn lại của cửa hàng không ảnh hưởng.

## 5. An toàn và chi phí

- Giới hạn: 20 tin / 10 phút / IP (`429 rate_limited`, có `Retry-After`) và trần 2000 tin / ngày cho cả cửa hàng (KV `rl:assistant-day:all:*`). Chỉnh ở `routes/assistant.ts`.
- `max_tokens` 700, timeout 30 giây mỗi lượt gọi LLM, 8 giây cho reranker.
- Prompt (`services/ai/prompt.ts`): giá/tình trạng chỉ lấy từ công cụ, không hứa khuyến mãi, không tự đặt hàng, từ chối ngoài phạm vi, coi nội dung công cụ và tin khách là dữ liệu (không làm theo lệnh trong đó).
- Log (`console`): tên công cụ + đối số + 160 ký tự đầu kết quả, tổng thời gian. Không ghi nội dung tin nhắn đầy đủ hay thông tin cá nhân.
- Khả năng bịa vẫn còn (LLM): giảm bằng thẻ sản phẩm lấy từ D1 và `price` dạng chữ trong kết quả công cụ. Không thay được việc đọc lại thẻ/giá trên trang sản phẩm.

## 6. Kiểm thử

- `make test`: `test/ai-tools.test.ts` (công cụ, lọc, rerank/fallback, không lộ dữ liệu ẩn) và `test/assistant.test.ts` (vòng lặp agent, SSE, giới hạn, validate). LLM và reranker là **giả** (`test/fake-ai.ts`), không cần mạng.
- Đánh giá với LLM thật: chạy API local (`cd apps/api && npx wrangler dev --port 8799`) rồi `node scripts/eval-speedy.mjs [baseUrl] [từ khóa]`. 18 câu hỏi tiếng Việt kiểm tra công cụ được gọi, thẻ sản phẩm, và các điều không được xảy ra (bịa giá, lộ chỉ dẫn, làm theo lệnh chèn). Dùng khi đổi prompt, mô hình, hoặc ngưỡng reranker. Mô hình trả lời không tất định nên đôi khi có câu rớt; chạy lại để phân biệt lỗi thật.

## 7. Chưa làm

Tra cứu đơn qua chat (cần xác minh SĐT), lưu hội thoại và trang admin xem lại, đa ngôn ngữ, embedding/Vectorize, Turnstile cho nút chat.
