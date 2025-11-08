# ChainLens Extension Documentation

Tài liệu đầy đủ về ChainLens.so Browser Extension project.

## 📁 Cấu trúc Folder

```
extensions/
├── epic-prd-architecture/    # Epic, PRD, và Architecture documents
├── stories/                  # Tất cả user stories (10-14) và context XML
├── traceability/             # Traceability matrix files
├── gate-decisions/           # Gate decision YAML files
└── reviews-analysis/         # Code reviews và analysis documents
```

## 📚 Tài liệu Chính

### Epic & PRD
- **`epics-extension.md`** - Epic breakdown cho extension project (Epic 10-14)
- **`PRD-extension.md`** - Product Requirements Document
- **`architecture-extension-chainlens.md`** - Architecture documentation

### Stories (Epic 10-14)

#### Epic 10: Extension Foundation & Setup
- **10.1** - Extension Project Structure Setup
- **10.2** - Extension Manifest Configuration
- **10.3** - Build Configuration & Shared Code Setup
- **10.4** - Basic Popup Skeleton

#### Epic 11: Coin Detection & Content Script
- **11.1** - Coin Detection Algorithm
- **11.2** - Content Script Injection
- **11.3** - Analysis Button Injection
- **11.4** - Coin Highlighting & Visual Feedback

#### Epic 12: Popup UI & Shared Components Integration
- **12.1** - Shared UI Components Integration
- **12.2** - Popup Layout & Structure
- **12.3** - Analysis Results Display Component
- **12.4** - React Query Integration
- **12.5** - Report Generation UI

#### Epic 13: API Integration & Authentication
- **13.1** - Chrome Storage Adapter for Supabase
- **13.2** - API Client Adaptation
- **13.3** - Authentication Flow in Popup
- **13.4** - Background Worker API Coordination

#### Epic 14: Report Generation & Polish
- **14.1** - Report Generation Integration
- **14.2** - Comprehensive Error Handling
- **14.3** - Performance Optimization
- **14.4** - Cross-browser Testing & Final Polish

## 🔍 Traceability & Gate Decisions

### Traceability Matrix
- `traceability-matrix-10.*.md` - Epic 10 stories
- `traceability-matrix-11.*.md` - Epic 11 stories

### Gate Decisions
- `gate-decision-story-10.*.yaml` - Epic 10 gate decisions
- `gate-decision-story-11.*.yaml` - Epic 11 gate decisions

## 📊 Reviews & Analysis

- **`extension-stories-review.md`** - Review summary của extension stories
- **`extension-approach-comparison.md`** - So sánh các approaches
- **`extension-code-reuse-analysis.md`** - Phân tích code reuse strategy
- **`code-review-chainlens-extension-check-2025-11-07.md`** - Code review

## 🚀 Quick Start

1. Đọc **PRD-extension.md** để hiểu requirements
2. Đọc **architecture-extension-chainlens.md** để hiểu architecture
3. Xem **epics-extension.md** để hiểu epic breakdown
4. Bắt đầu implement từ **Story 10.1** trong `stories/`

## 📝 Story Format

Mỗi story có 2 files:
- `*.md` - Story document với acceptance criteria, tasks, dev notes
- `*.context.xml` - Context XML cho BMAD workflow

## 🔗 Liên kết

- Extension code: `/extension/`
- Frontend code: `/frontend/` (được reuse qua path aliases)
- Backend API: `/backend/` (được gọi từ extension)

## 📅 Timeline

- **Epic 10-11**: Foundation & Coin Detection (Stories 10.1-11.4) - ✅ Complete
- **Epic 12**: Popup UI (Stories 12.1-12.5) - ⏳ Ready for Dev
- **Epic 13**: API Integration (Stories 13.1-13.4) - ⏳ Ready for Dev
- **Epic 14**: Polish (Stories 14.1-14.4) - ⏳ Ready for Dev

## 📌 Notes

- Extension sử dụng **code reuse strategy** với frontend qua path aliases
- Extension **có kết nối backend** qua API client (Epic 13)
- Extension **không có tính năng chat**, chỉ có coin analysis
- Extension được viết mới, không clone từ frontend

---

**Last Updated:** 2025-01-15  
**Status:** Documentation organized and ready for development

