# Story Code References Audit

**Generated:** 2025-01-15  
**Analyst:** Mary (Business Analyst)  
**Purpose:** Audit existing stories và identify gaps in code references

---

## 📊 Audit Results

### Stories với Good Code References ✅

#### Story 11.3: Analysis Button Injection
- ✅ **File paths với line numbers:** `injector.ts:88-115`, `content-script.css:4-24`
- ✅ **Code references:** Specific function names và line ranges
- ✅ **Evidence:** Clear implementation details

#### Story 11.4: Coin Highlighting
- ✅ **File paths với line numbers:** `content-script.css:29-40`, `highlighter.ts:38-53`
- ✅ **Code references:** Specific CSS classes và functions
- ✅ **Evidence:** Clear implementation details

#### Story 12.1: Shared UI Components (After Implementation)
- ✅ **File paths:** `ComponentTest.tsx:10`, `popup.css` với line numbers
- ✅ **Implementation details:** Clear evidence of what was implemented

### Stories với Poor Code References ❌

#### Story 12.2: Side Panel Layout
- ❌ **Missing:** File paths với line numbers
- ❌ **Missing:** Code snippets cụ thể
- ❌ **Missing:** Exact import statements
- ⚠️ **Has:** General references to frontend components

#### Story 13.2: API Client Adaptation
- ❌ **Missing:** File paths với line numbers cho API client
- ❌ **Missing:** Code snippets cụ thể
- ❌ **Missing:** Exact import statements
- ⚠️ **Has:** General references to `@/lib/api`

#### Story 13.3: Authentication Flow
- ❌ **Missing:** File paths với line numbers cho auth components
- ❌ **Missing:** Code snippets cụ thể
- ❌ **Missing:** Exact import statements
- ⚠️ **Has:** General references to frontend auth components

#### Story 15.1-15.5: Chat Integration (New Stories)
- ⚠️ **Need:** Detailed code references (template created)

---

## 🔍 Gap Analysis

### Missing Information in Stories

1. **File Paths với Line Numbers:**
   - ❌ Most stories chỉ có file paths, không có line numbers
   - ❌ Không rõ exact lines cần copy/reuse
   - ✅ Need: `frontend/src/components/thread/chat-input/chat-input.tsx:134-1038`

2. **Code Snippets:**
   - ❌ Most stories không có code snippets cụ thể
   - ❌ Không rõ exact code cần copy
   - ✅ Need: Complete code examples với imports

3. **Import Statements:**
   - ❌ Most stories chỉ có general imports
   - ❌ Không rõ exact import statements
   - ✅ Need: `import { ChatInput } from '@/components/thread/chat-input/chat-input';`

4. **Dependencies List:**
   - ❌ Most stories không list dependencies
   - ❌ Không rõ what dependencies are needed
   - ✅ Need: Complete dependencies list với availability status

5. **Usage Examples:**
   - ❌ Most stories không có usage examples
   - ❌ Không rõ how to use components/functions
   - ✅ Need: Complete usage examples với code

---

## 📋 Recommendations

### 1. Update Existing Stories

**Priority 1: Epic 15 Stories (Chat Integration)**
- ✅ **Story 15.1:** Already created với detailed code references (example)
- ⚠️ **Story 15.2-15.5:** Need to create với same format

**Priority 2: Epic 13 Stories (API Integration)**
- ⚠️ **Story 13.2:** Update với detailed API client references
- ⚠️ **Story 13.3:** Update với detailed auth component references
- ⚠️ **Story 13.4:** Update với detailed background worker references

**Priority 3: Epic 12 Stories (UI Components)**
- ⚠️ **Story 12.2:** Update với detailed layout references
- ⚠️ **Story 12.3:** Update hoặc remove (replaced by chat)
- ⚠️ **Story 12.4:** Update với detailed React Query references
- ⚠️ **Story 12.5:** Update với detailed report generation references

### 2. Create Template

✅ **Template Created:** `story-code-reuse-template.md`
- Format cho code reuse instructions
- Examples với file paths, line numbers, code snippets
- Checklist để ensure completeness

### 3. Update Story Creation Process

**New Requirements:**
- ✅ All stories must have "Code Reuse Instructions" section
- ✅ All code references must include file paths + line numbers
- ✅ All imports must have exact import statements
- ✅ All components must have usage examples
- ✅ All dependencies must be listed với availability status

---

## ✅ Action Items

### Immediate Actions

1. ✅ **Create Story 15.1 với detailed code references** (Done - example created)
2. ⚠️ **Create Stories 15.2-15.5 với same format** (Pending)
3. ⚠️ **Update Story 13.2 với detailed API client references** (Pending)
4. ⚠️ **Update Story 13.3 với detailed auth references** (Pending)
5. ⚠️ **Update Story 12.2 với detailed layout references** (Pending)

### Long-term Actions

1. ⚠️ **Update all stories với code reuse instructions** (As needed)
2. ⚠️ **Create context XML files với code references** (For BMAD workflow)
3. ⚠️ **Document code reuse patterns** (For future stories)

---

## 📚 Resources

### Templates & Guides

1. **Story Code Reuse Template:** `story-code-reuse-template.md`
   - Format cho code reuse instructions
   - Examples với file paths, line numbers
   - Checklist để ensure completeness

2. **Example Story:** `15-1-chat-interface-setup.md`
   - Complete example với detailed code references
   - File paths với line numbers
   - Code snippets với usage examples
   - Dependencies list với availability status

### Reference Stories

1. **Story 11.3:** Good example với file paths và line numbers
2. **Story 11.4:** Good example với code references
3. **Story 12.1:** Good example sau khi implementation (evidence)

---

## 🎯 Success Criteria

Stories được coi là "complete" khi có:

- ✅ **File Paths:** Đầy đủ file paths với line numbers
- ✅ **Code Snippets:** Code snippets cụ thể cần copy
- ✅ **Import Statements:** Exact import statements
- ✅ **Usage Examples:** Complete usage examples
- ✅ **Dependencies:** Dependencies list với availability
- ✅ **Test Checklist:** Test checklist cho từng component

---

**Generated by:** Mary (Business Analyst)  
**Date:** 2025-01-15  
**Status:** Audit Complete - Template Created - Action Items Defined

