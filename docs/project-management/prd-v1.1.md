# ChainLens Product Requirements Document (PRD) — v1.1 (MVP Launch Update)

Phiên bản: 1.1  
Ngày cập nhật: 18/09/2025  
Tác giả: Analyst (BMad™ Core)  
Trạng thái: Ready for Execution — 14-day MVP Launch  
Liên quan: docs/project-management/prd.md (bản đầy đủ chiến lược)

---

1) Executive Summary (Tóm tắt điều hành)

Mục tiêu: Đưa ChainLens (AI-driven crypto analytics) lên production với MVP tập trung tốc độ, chi phí thấp và network effects. Bản v1.1 này là bản cập nhật thực thi (execution-focused) cho 14 ngày tới, dựa trên:
- Brainstorming Session: Caching → Network Effects → Token Economy → Developer Marketplace → Market Dominance
- Strategic Evaluation: Clone ChainLens.so (agent runtime) + Microservices crypto chuyên biệt + Viral Growth Engine

Key Outcomes trong 14 ngày:
- Hoàn thiện Testing Framework + LLM Orchestration Module
- Kích hoạt Daily Alpha Reports (tự động) + seeding nội dung
- Bật Monetization cơ bản (Free vs Pro) + Stripe
- Đạt < 2 giây response cho nội dung cached, 5–8 giây cho fresh

2) Scope & Changes vs PRD cũ

V1.1 là bổ sung thực thi, không thay thế toàn bộ PRD đầy đủ (docs/project-management/prd.md). Các thay đổi cốt lõi:
- Thêm Network Effects Strategy: vòng lặp dữ liệu từ truy vấn người dùng → cải thiện chất lượng + giảm chi phí
- Caching Moat chi tiết: chính sách TTL theo volatility, cache warming, đo lường hit/miss, chi phí/1000 truy vấn
- LLM Orchestration Module: fallback chain, tool selection, progressive disclosure, streaming
- Daily Alpha Reports Pipeline: cron + templating + social distribution
- Monetization sớm: Free (5 queries/ngày) vs Pro ($29/tháng)
- Token Economy & Marketplace: chuyển sang Phase 2 (thiết kế trước, triển khai sau)

3) Personas & Use Cases (Phiên bản MVP)

Personas:
- Retail Investor: Hỏi nhanh về token/ticker, muốn insight ngắn, cảnh báo, rủi ro
- Professional Trader: Cần on-chain metrics, whale moves, sentiment nhanh, export
- VC/Research: Báo cáo tổng hợp, scorecard, trend dự báo, export PDF

Use cases ưu tiên:
- “Phân tích nhanh token X trong 60 giây”: market cap, volume, holders, sentiment, rủi ro, khuyến nghị
- “Cảnh báo & theo dõi”: watchlist + alert đơn giản (qua email/Discord/Telegram channel MVP)
- “Báo cáo alpha hàng ngày”: top 10 trending tokens với điểm số + 3 insight chính

4) MVP Feature Set (14 ngày)

Phải có (Must-have):
- Conversational UX (ChainLens base) + crypto-focused templates
- 4 service endpoints qua Gateway: onchain, sentiment, tokenomics, team
- Caching layer (Redis) với TTL theo loại dữ liệu + warming top tickers
- LLM orchestration (fallback + streaming + tool selection)
- Daily alpha report generator + auto-post (tối thiểu: Markdown/PDF export)
- Pricing: Free vs Pro + Stripe
- Basic feedback widget (“Kết quả này hữu ích?”)

Nên có (Should-have):
- Alerts cho watchlist (beta: email/Discord)
- Export PDF/Markdown có brand
- Basic usage analytics (events: query, share, feedback)

Có thể hoãn (Could/Phase 2):
- Token economy + developer marketplace
- Advanced predictive models (price/volatility)
- Mobile app riêng (dùng responsive web tạm thời)

5) Functional Requirements (Delta cho MVP)

FR-MVP-1: Người dùng truy vấn ticker (e.g., PEPE) → trả về báo cáo tóm tắt 5 phần (Market, Sentiment, On-chain, Risks, Actions) trong 5–8 giây (fresh) hoặc <2 giây (cached).  
FR-MVP-2: Gateway cung cấp endpoints: GET /v1/onchain/{symbol}, /v1/sentiment/{symbol}, /v1/tokenomics/{symbol}, /v1/team/{projectId}, POST /v1/refresh/{symbol}.  
FR-MVP-3: Caching: TTL cho KPIs 5–15 phút; sentiment 15–30 phút; invalidation qua /refresh.  
FR-MVP-4: LLM orchestration: nếu thiếu dữ liệu từ 1 service, hệ thống tiếp tục với partial và gắn cờ nguồn thiếu.  
FR-MVP-5: Daily Alpha Reports: chạy theo lịch 1 lần/ngày, tạo “Top 10” + 3 insight/highlight mỗi token.  
FR-MVP-6: Pricing: Free (5 queries/ngày) vs Pro (không giới hạn cơ bản) với Stripe checkout.  
FR-MVP-7: Feedback widget yes/no per query, lưu event + optional comment (text ngắn).  
FR-MVP-8: Export Markdown/PDF cho report chi tiết.  
FR-MVP-9: Basic alerts (beta): cho phép đăng ký alert giá đơn giản cho 5 tickers (email/Discord webhook).  
FR-MVP-10: Telemetry: log latency, cache hit/miss, error rate, conversion (free→pro), share events.

6) Non-Functional Requirements (MVP)

NFR-MVP-1 Performance: P95 <2s cho cached; fresh 5–8s; homepage TTFB < 300ms.  
NFR-MVP-2 Availability: 99.9% (beta); incident runbook + alerts cơ bản.  
NFR-MVP-3 Cost: Theo dõi $/1K queries; target giảm 40% nhờ caching >70% hit rate.  
NFR-MVP-4 Security: API key auth ở Gateway; secrets via env; no PII persistence (ngoại trừ email alert).  
NFR-MVP-5 Observability: request latency, cache ratio, error codes, Stripe events, report generation time.  
NFR-MVP-6 Compliance: Disclaimer “không phải lời khuyên đầu tư” + ToS/Privacy cơ bản; GDPR tối thiểu cho email.

7) Technical Architecture (MVP-focused)

Thành phần:
- ChainLens-based Chat Frontend: UI đàm thoại + templates crypto
- API Gateway (FastAPI): routing → microservices; auth; rate limit; OpenAPI (/docs)
- Redis Cache: key pattern kpi:{symbol}:{metric}, sent:{symbol}; TTL theo loại
- Microservices (NestJS): OnChain, Sentiment, Tokenomics, Team (PostgreSQL/TimescaleDB)
- LLM Orchestration: tool selection, fallback chain, streaming responses
- Scheduler: Daily Alpha Reports (cron) → storage + export → distribution hooks
- Stripe Billing: Free/Pro gating + webhook xử lý trạng thái

Data flow tóm tắt:
1) User query → Orchestrator xác định dữ liệu cần → Gateway gọi services song song → hợp nhất kết quả → format template → cache kết quả tổng hợp.  
2) Daily alpha cron → lấy danh sách top tokens (by trend/volume) → gọi services → tổng hợp → xuất Markdown/PDF → lưu & (tùy chọn) publish.  

Caching policy:
- Popular ticker list để warming lúc deploy + mỗi 2 giờ  
- Volatility-based TTL: tokens có biến động cao TTL ngắn hơn  
- Cache metrics: hit%, evictions, memory → báo cáo hằng ngày  

LLM Orchestration:
- Progressive disclosure: trả phần nhanh trước, stream phần sâu sau  
- Fallback: nếu sentiment lỗi, vẫn trả on-chain + tokenomics, gắn cờ “sentiment unavailable”  
- Tool gating: tránh gọi lại dịch vụ nếu cache đủ tươi  

8) API Spec (MVP — rút gọn)

- GET /v1/onchain/{symbol}
  - Query: symbol (string)
  - Response: { market_cap, volume_24h, holders, whales, updated_at }

- GET /v1/sentiment/{symbol}
  - Response: { score (0–100), trend, sources:[…], updated_at }

- GET /v1/tokenomics/{symbol}
  - Response: { distribution, unlocks, inflation, risks:[…], updated_at }

- GET /v1/team/{projectId}
  - Response: { credibility_score, github_activity, partnerships, flags:[…] }

- POST /v1/refresh/{symbol}
  - Body: { sections: ["onchain"|"sentiment"|…] }
  - Response: { status, refreshed_sections, started_at }

9) Go-To-Market (GTM) — 30 ngày đầu

Kênh chính:
- Daily Alpha Reports: chạy từ ngày 1; share thread/social (X/Twitter), email digest  
- Referral: credit $10 cho mỗi giới thiệu (áp dụng Pro)  
- Community: Discord server + Telegram alerts (kênh thông báo)  
- Content: blog hằng ngày + 2 video/tuần  

Checklist tuần 1–2:
- Setup cron + templates + auto-export  
- Social hooks + UTM tracking  
- Landing “Pricing” + Stripe  
- Feedback widget → backlog cải tiến  

10) Network Effects & Data Moat Strategy

Loops cốt lõi:
- Query → Insight → Share → New users → More queries → Better cache/data → Lower cost/Better quality → Retention↑  
- Feedback → Model prompt/tooling refinement → Quality↑ → Shareability↑  
- Daily Alpha → Habit formation → DAU↑ → Organic reach↑  

Signals/KPIs theo dõi:
- Viral coefficient (k) mục tiêu tuần 4: ≥ 0.2  
- Cache hit% mục tiêu tuần 2: ≥ 70% (top 50 tickers)  
- Cost per 1K queries: giảm ≥ 30% vs baseline tuần 1  
- Share rate > 10% query results  

11) Monetization (MVP)

- Free: 5 queries/ngày, alpha digest tóm tắt  
- Pro: $29/tháng, không giới hạn cơ bản, export PDF/Markdown, alerts beta  
- Stripe: checkout + webhook; dừng quyền khi hủy/subscription overdue  
- Roadmap: Enterprise/Whale tiers (post-MVP)

12) Token Economy & Marketplace (Phase 2 — định hướng)

- Utility token cho credit nội bộ, staking để giảm phí, governance nhẹ  
- Developer marketplace: plugin/tools của bên thứ ba, revenue-sharing 70/30, KYC nhẹ + rating  
- Target: thiết kế chi tiết & POC Q2/2025; rollout sau khi PMF ổn định

13) Security, Privacy & Compliance (MVP)

- Security: API key isolation, rate limit per key, secret rotation; WAF (nếu có)  
- Privacy: tối thiểu thu thập PII (email), lưu trữ consent, xóa theo yêu cầu  
- Legal: ToS/Privacy/Disclaimer “Not financial advice”; cookie banner đơn giản  
- Audit: logging tập trung, giữ 14–30 ngày cho MVP

14) Observability & SRE (MVP)

- Metrics: latency per endpoint, cache ratio, error rate, Stripe events, report duration  
- Dashboards: latency P50/P95, cache hit%, top symbols, failures by service  
- Alerts: error rate spike, cache hit < 50%, Stripe webhook fail, report failure  
- Runbook: incident triage (service down, API quota, Stripe outage, cache saturation)

15) 14-Day Implementation Plan (Sprint)

Tuần 1:
- Day 1–2: Testing framework hoàn thiện; logging/metrics baseline; cache adapter finalize  
- Day 3–4: LLM orchestration (fallback + streaming + tool gating)  
- Day 5–7: Daily Alpha pipeline (cron, templates, export) + basic distribution hooks  

Tuần 2:
- Day 8–9: Pricing page + Stripe integration + gating Free/Pro  
- Day 10–11: Load/stress test, cache warming top 50 tickers, performance tuning  
- Day 12–13: Bug fixing, polish templates, finalize feedback widget  
- Day 14: Launch checklist, dry-run, go-live  

16) Launch Checklist (Rút gọn)

- [ ] Health checks all services green  
- [ ] Cache warmed for top 50 tickers  
- [ ] Stripe live keys + test purchases passed  
- [ ] Daily alpha cron chạy + xuất bản  
- [ ] Observability dashboards live + alert rules bật  
- [ ] ToS/Privacy/Disclaimer hiển thị  
- [ ] Rollback plan (disable cron, route-to-cache-only, feature flags)  

17) KPIs & Success Metrics

Tuần Launch:
- 1,000+ reports generated  
- ≥ 50 DAU, ≥ 100 Pro trials  
- Cache hit% ≥ 60% (top 50 tickers ≥ 70%)  
- P95 cached < 2s; fresh ≤ 8s  

Tháng 1:
- 10,000+ reports; 500+ paying  
- Viral coefficient ≥ 0.2; Share rate ≥ 10%  
- MRR ≥ $10K; Churn trial→paid < 40%  

18) Risks & Mitigations (MVP)

- Data provider rate limits → Caching aggressive, provider fallback, backoff  
- LLM chi phí tăng → Cache-first, prompt tối ưu, batch processing cho cron  
- Stripe/Payment failures → Retry + grace period + webhooks monitor  
- Legal/Compliance → Disclaimer rõ ràng, không advice, tối thiểu PII  
- Cạnh tranh phản ứng nhanh → Lặp nhanh, tăng moats: data/quality/speed/community  

19) Ownership & RACI (MVP)

- Product: prioritization, acceptance  
- Eng Lead: delivery, architecture & quality  
- Data/ML: templates, scoring, prompt/pipeline  
- DevOps: observability, deployments, reliability  
- Growth: daily alpha distribution, referral, analytics  

20) Change Log

- 1.1 (18/09/2025): Bản cập nhật thực thi 14 ngày: Network Effects, Caching Moat, LLM Orchestration, Daily Alpha, Monetization Free/Pro, KPI & GTM.  
- Tham chiếu: PRD chiến lược đầy đủ tại docs/project-management/prd.md.
