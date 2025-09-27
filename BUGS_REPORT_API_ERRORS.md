# 🐛 API Errors Bug Report - Dashboard Issues

**Date**: 2025-01-27  
**Reporter**: QA Persona  
**Severity**: HIGH  
**Status**: IDENTIFIED  

## 📊 **Error Summary**

### **Observed Errors in Dashboard:**
- ❌ **404 Not Found**: `/api/agents/3d4...`, `/api/templates/...`
- ❌ **CORS Policy Blocked**: Multiple endpoints from `localhost:3000`
- ❌ **500 Internal Server Error**: Template API endpoints
- ❌ **ERR_FAILED**: Network failures on various endpoints

---

## 🔍 **Root Cause Analysis**

### **1. PRIMARY ISSUE: Missing `/api` Prefix**

**Problem**: Frontend API calls missing required `/api` prefix

**Evidence**:
```typescript
// ❌ WRONG - frontend/src/hooks/react-query/agents/utils.ts:193
const url = `${API_URL}/agents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

// ✅ CORRECT - Should be:
const url = `${API_URL}/api/agents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
```

**Backend Configuration**:
```python
# backend/api.py:227 - All API routes have /api prefix
app.include_router(api_router, prefix="/api")
```

### **2. CORS Errors (Consequence)**

**Problem**: CORS errors occur because 404 responses don't include CORS headers

**Evidence**:
- CORS middleware configured correctly for `localhost:3000`
- ENV_MODE=local allows frontend origin
- Preflight OPTIONS requests fail on non-existent endpoints

### **3. Authentication Working Correctly**

**Evidence**:
```typescript
// ✅ CORRECT - Authentication headers properly set
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${session.access_token}`,
}
```

---

## 🎯 **Affected Components**

### **Frontend API Utilities**
- `frontend/src/hooks/react-query/agents/utils.ts`
- `frontend/src/hooks/react-query/templates/utils.ts` (likely)
- Any direct API calls not using `backendApi` wrapper

### **Backend Endpoints**
- ✅ `/api/agents` - Working (with correct prefix)
- ✅ `/api/templates` - Working (with correct prefix)
- ❌ `/agents` - 404 (missing prefix)
- ❌ `/templates` - 404 (missing prefix)

---

## 🔧 **Solutions**

### **Solution 1: Fix Frontend API URLs (RECOMMENDED)**

**File**: `frontend/src/hooks/react-query/agents/utils.ts`

```typescript
// Line 193 - Fix agents endpoint
- const url = `${API_URL}/agents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
+ const url = `${API_URL}/api/agents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

// Line 230 - Fix individual agent endpoint  
- const url = `${API_URL}/agents/${agentId}`;
+ const url = `${API_URL}/api/agents/${agentId}`;

// Apply similar fixes to all API endpoints
```

### **Solution 2: Use Existing API Client (ALTERNATIVE)**

**Replace direct fetch calls with `backendApi` wrapper**:

```typescript
// ❌ Current approach
const response = await fetch(url, { ... });

// ✅ Better approach - uses backendApi.get()
import { backendApi } from '@/lib/api-client';
const { data, error } = await backendApi.get('/api/agents', { ... });
```

### **Solution 3: Template API Investigation**

**Check and fix template-related API calls**:
- Verify `/api/templates` endpoints
- Fix any missing `/api` prefixes
- Investigate 500 internal server errors

---

## 🧪 **Testing Plan**

### **1. Verification Steps**
```bash
# Test correct endpoints
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/agents
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/templates

# Verify 404 on wrong endpoints  
curl http://localhost:8000/agents  # Should return 404
curl http://localhost:8000/templates  # Should return 404
```

### **2. Frontend Testing**
- [ ] Dashboard loads without API errors
- [ ] Agents list displays correctly
- [ ] Templates load without 500 errors
- [ ] No CORS errors in browser console
- [ ] Authentication working properly

---

## 📋 **Implementation Checklist**

### **High Priority (Fix Immediately)**
- [ ] Fix `/agents` endpoint URL in `utils.ts`
- [ ] Fix `/agents/{id}` endpoint URL
- [ ] Fix template API endpoints
- [ ] Test dashboard functionality

### **Medium Priority (Code Quality)**
- [ ] Migrate to `backendApi` wrapper for consistency
- [ ] Add URL validation in development
- [ ] Update API documentation

### **Low Priority (Monitoring)**
- [ ] Add API endpoint monitoring
- [ ] Implement better error handling
- [ ] Add retry logic for failed requests

---

## 🔗 **Related Files**

### **Frontend**
- `frontend/src/hooks/react-query/agents/utils.ts` - **PRIMARY FIX NEEDED**
- `frontend/src/lib/api-client.ts` - Working correctly
- `frontend/src/hooks/react-query/templates/utils.ts` - Check for similar issues

### **Backend**
- `backend/api.py` - CORS and routing configuration
- `backend/core/api.py` - Agent endpoints
- `backend/core/templates/api.py` - Template endpoints

---

## 💡 **Prevention Measures**

1. **Use centralized API client** (`backendApi`) for all API calls
2. **Add TypeScript types** for API endpoints
3. **Implement API URL validation** in development mode
4. **Add integration tests** for API endpoints
5. **Document API prefix requirements** clearly

---

## 🚨 **Impact Assessment**

**User Impact**: HIGH
- Dashboard completely non-functional
- No agents or templates loading
- Poor user experience with loading states

**Business Impact**: HIGH  
- Core functionality broken
- User onboarding affected
- Development workflow disrupted

**Technical Debt**: MEDIUM
- Inconsistent API calling patterns
- Missing error handling
- No API endpoint validation

---

**Next Steps**: Implement Solution 1 immediately to restore dashboard functionality.
