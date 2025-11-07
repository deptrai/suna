# Cách Sử Dụng Story Context XML

## 📋 Tổng Quan

Story Context XML (`1-1-enable-openai-prompt-caching.context.xml`) là file chứa **tất cả thông tin kỹ thuật** cần thiết để implement story. File này được **tự động sử dụng** bởi `dev-story` workflow khi bạn chạy development.

## 🎯 Mục Đích

Context XML cung cấp **just-in-time expertise injection** cho dev agent:
- **Story file** (`1-1-enable-openai-prompt-caching.md`) = "WHAT" (yêu cầu, acceptance criteria)
- **Context XML** = "HOW" (cách implement, code references, constraints, testing)

## 🔄 Workflow Sử Dụng

### 1. Khi Chạy `dev-story` Workflow

```bash
# Dev agent sẽ tự động:
1. Load story file: docs/stories/1-1-enable-openai-prompt-caching.md
2. Tìm context file: docs/stories/1-1-enable-openai-prompt-caching.context.xml
3. Parse cả 2 files để có đầy đủ context
4. Implement story dựa trên thông tin từ cả 2 sources
```

### 2. Các Sections Trong Context XML

#### 📖 `<story>` Section
- **asA, iWant, soThat**: User story statement
- **tasks**: Danh sách tasks với subtasks chi tiết
- **Usage**: Dev agent sử dụng để hiểu requirements và break down work

#### ✅ `<acceptanceCriteria>` Section
- **ac id="1-5"**: 5 acceptance criteria cần đạt được
- **Usage**: Dev agent verify implementation đáp ứng từng AC

#### 📚 `<artifacts>` Section

**`<docs>`**: Documentation references
```xml
<doc>
  <path>docs/epics-optimization.md</path>
  <title>Epic Breakdown</title>
  <section>Story 1.1</section>
  <snippet>Brief excerpt...</snippet>
</doc>
```
- **Usage**: Dev agent đọc docs này để hiểu requirements và technical details

**`<code>`**: Code files cần modify
```xml
<file>
  <path>backend/core/run.py</path>
  <kind>service</kind>
  <symbol>PromptManager.build_system_prompt()</symbol>
  <lines>326-491</lines>
  <reason>Primary method to modify for prompt restructuring...</reason>
</file>
```
- **Usage**: Dev agent biết chính xác file nào, function nào, lines nào cần modify

**`<dependencies>`**: Packages/frameworks cần thiết
```xml
<ecosystem>Python</ecosystem>
<packages>
  <package>litellm</package>
  <package>openai</package>
</packages>
```
- **Usage**: Dev agent biết dependencies cần import và sử dụng

#### 🚧 `<constraints>` Section
```xml
<constraint>
  <type>Quality Requirement</type>
  <description>Zero quality impact required...</description>
</constraint>
```
- **Usage**: Dev agent tuân thủ constraints khi implement (không được break quality, backward compatibility, etc.)

#### 🔌 `<interfaces>` Section
```xml
<interface>
  <name>PromptManager.build_system_prompt()</name>
  <kind>method</kind>
  <signature>async def build_system_prompt(...)</signature>
  <path>backend/core/run.py</path>
</interface>
```
- **Usage**: Dev agent biết chính xác method signature, parameters, return types

#### 🧪 `<tests>` Section
```xml
<standards>Testing standards include: Quality validation...</standards>
<locations>
  <location>backend/tests/</location>
</locations>
<ideas>
  <test ac="1">
    <idea>Unit test: Verify prompt restructuring logic...</idea>
  </test>
</ideas>
```
- **Usage**: Dev agent biết cách viết tests, test locations, và test ideas cho mỗi AC

## 💡 Ví Dụ Cụ Thể

### Khi Dev Agent Implement Task 1:

1. **Đọc Task từ Story File:**
   ```
   Task 1: Restructure system prompt với static content first (AC: #1)
   ```

2. **Load Context XML để biết HOW:**
   - **Code artifact**: `backend/core/run.py::PromptManager.build_system_prompt()` (lines 326-491)
   - **Reason**: "Primary method to modify for prompt restructuring. Currently builds prompt by concatenating sections..."
   - **Constraints**: "Zero quality impact required", "Minimal code changes"
   - **Interfaces**: Method signature và parameters
   - **Test ideas**: "Unit test: Verify prompt restructuring logic correctly identifies static vs dynamic sections"

3. **Implement dựa trên context:**
   - Dev agent biết chính xác file nào cần modify
   - Biết current implementation structure
   - Biết constraints cần tuân thủ
   - Biết cách test implementation

## 🎯 Lợi Ích

### ✅ Không Cần Manual Context Gathering
- Dev agent không cần tự tìm docs, code files, interfaces
- Tất cả đã được curated và structured trong context XML

### ✅ Consistent Implementation
- Tất cả dev agents sử dụng cùng context
- Đảm bảo implementation đúng requirements và constraints

### ✅ Faster Development
- Dev agent có ngay tất cả thông tin cần thiết
- Không mất thời gian search codebase

### ✅ Better Quality
- Context includes testing standards và ideas
- Constraints đảm bảo không break existing functionality

## 📝 Manual Usage (Nếu Cần)

Nếu bạn muốn manually review context trước khi chạy dev-story:

```bash
# 1. Đọc context XML
cat docs/stories/1-1-enable-openai-prompt-caching.context.xml

# 2. Review các sections:
# - artifacts.code: Files cần modify
# - constraints: Rules cần follow
# - interfaces: Method signatures
# - tests: Testing requirements

# 3. Sau đó chạy dev-story
# Dev agent sẽ tự động load context này
```

## 🔄 Khi Context Cần Update

Nếu story requirements thay đổi hoặc codebase thay đổi:

```bash
# Re-generate context
workflow story-context --story_path docs/stories/1-1-enable-openai-prompt-caching.md

# Context sẽ được update với latest information
```

## ⚠️ Lưu Ý

1. **Context XML là READ-ONLY** trong dev-story workflow
   - Dev agent chỉ đọc, không modify context XML
   - Context được generate bởi story-context workflow

2. **Context phải match với Story File**
   - Nếu story file thay đổi, cần re-generate context
   - Context references story file trong `<sourceStoryPath>`

3. **Context paths là PROJECT-RELATIVE**
   - Tất cả paths trong context là relative to project root
   - Ví dụ: `backend/core/run.py` không phải `/Users/.../backend/core/run.py`

## 🚀 Next Steps

1. **Review context XML** để hiểu technical requirements
2. **Chạy dev-story workflow** để implement story
3. **Dev agent sẽ tự động sử dụng context** để implement đúng requirements

---

**Tóm lại**: Context XML là "technical blueprint" cho story. Dev agent sử dụng nó để biết **chính xác** file nào, function nào, cách nào để implement story đúng requirements và constraints.

