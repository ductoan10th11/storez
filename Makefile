.PHONY: run stop status build build-web build-api db-init test art

API_PORT := 8787
WEB_PORT := 5173
RUN_DIR  := .run

run: stop
	@mkdir -p $(RUN_DIR)
	@nohup npm run dev -w apps/api > $(RUN_DIR)/api.log 2>&1 &
	@nohup npm run dev -w apps/web > $(RUN_DIR)/web.log 2>&1 &
	@echo "Đang khởi động... (log: $(RUN_DIR)/api.log, $(RUN_DIR)/web.log)"
	@echo "  web: http://localhost:$(WEB_PORT)"
	@echo "  api: http://localhost:$(API_PORT)"

stop:
	@for port in $(API_PORT) $(WEB_PORT); do \
		pids=$$(lsof -ti tcp:$$port -sTCP:LISTEN); \
		if [ -n "$$pids" ]; then kill $$pids && echo "Đã dừng tiến trình trên cổng $$port"; fi; \
	done; \
	pkill -f "wrangler dev" 2>/dev/null; pkill -f "apps/web.*vite" 2>/dev/null; true

status:
	@for entry in api:$(API_PORT) web:$(WEB_PORT); do \
		name=$${entry%%:*}; port=$${entry##*:}; \
		pid=$$(lsof -ti tcp:$$port -sTCP:LISTEN | head -1); \
		if [ -n "$$pid" ]; then echo "$$name: ĐANG CHẠY (pid $$pid) http://localhost:$$port"; \
		else echo "$$name: đã dừng"; fi; \
	done

build-web:
	npm run build -w apps/web

# Typecheck + bundle thử Worker (không deploy)
build-api:
	npm run typecheck -w apps/api
	cd apps/api && npx wrangler deploy --dry-run --outdir dist

build: build-web build-api

# Làm lại DB local từ đầu: xóa trạng thái D1 local, áp migration, nạp seed (XÓA dữ liệu local)
db-init:
	npm run db:init

# Chạy bộ test của API (vitest, D1/KV/R2 giả lập)
test:
	npm test

# Sinh lại ảnh minh họa SVG (apps/web/public/vehicles) từ seed cũ (scripts/legacy-seed.sql)
art:
	node scripts/gen-vehicle-art.mjs apps/web/public/vehicles scripts/legacy-seed.sql
