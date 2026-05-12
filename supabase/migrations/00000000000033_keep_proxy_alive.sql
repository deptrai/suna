-- Kích hoạt extension pg_net và pg_cron nếu chưa có
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Xóa job cũ nếu đã tồn tại để tránh lỗi trùng lặp
DO $$
BEGIN
  PERFORM cron.unschedule('keep_proxy_alive');
EXCEPTION WHEN OTHERS THEN
  -- Ignore error if job doesn't exist
END
$$;

-- Tạo job gọi API mỗi 1 giờ (vào phút thứ 0)
SELECT cron.schedule(
  'keep_proxy_alive',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url:='https://fallback.viber.vn/v1/messages',
      headers:='{"Content-Type": "application/json", "x-api-key": "sk-vibervn-JN0nhN2SOwjRRlPsBcoKJ56I", "anthropic-version": "2023-06-01"}'::jsonb,
      body:='{"model": "claude-haiku-4-5", "max_tokens": 5, "messages": [{"role": "user", "content": "alo"}]}'::jsonb,
      timeout_milliseconds:=5000
    );
  $$
);
