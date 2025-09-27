# Bug Report: API Authentication Errors

## Summary
Multiple API endpoints returning 404 "Not Found" errors when user attempts to interact with the system, despite being authenticated. The errors occur during normal user workflow when trying to initiate agent conversations.

## Error Details - Reproduced via Playwright

### 1. Agent Initiation Errors (Primary Issue)
```
[API] Error initiating agent: 404 Not Found {"detail":"Agent not found or access denied"}
[API] Failed to initiate agent: Error: Error initiating agent: Not Found (404)
API Error: Error: Error initiating agent: Not Found (404)
```

### 2. Template/Agent Loading Errors
```
Error fetching agent: Error: HTTP 404: Not Found
Failed to load resource: the server responded with a status of 404 (Not Found)
Access to fetch at 'http://localhost:8000/api/templates/marketplace?limit=10&is_epsilon_team...'
Failed to load resource: net::ERR_FAILED
```

### 3. UI Impact
- Toast notification: "Failed to initiate agent: Error initiating agent: Not Found (404)"
- Message: "Failed to load custom agents"
- Input textbox becomes disabled after failed submission
- User cannot proceed with agent interaction

## Root Cause Analysis

### Investigation Results:
✅ **Backend Server**: Running on port 8000 (uvicorn)
✅ **Frontend Server**: Running on port 3000 (Next.js)  
✅ **Database**: Supabase running on port 54321
✅ **Redis**: Running on port 6379
✅ **Health Check**: `/api/health` returns {"status":"ok"}

### Actual Problem: **Authentication Issues**

When testing the `/api/agent/initiate` endpoint directly:
```bash
curl -X POST http://localhost:8000/api/agent/initiate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}'

# Response:
HTTP/1.1 401 Unauthorized
{"detail":"No valid authentication credentials found"}
```

## Technical Analysis

### Authentication Flow:
1. **Frontend** (`api-client.ts`): Gets session from Supabase and sends JWT token
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   if (session?.access_token) {
     headers['Authorization'] = `Bearer ${session.access_token}`;
   }
   ```

2. **Backend** (`auth_utils.py`): Validates JWT token and extracts user_id
   ```python
   async def verify_and_get_user_id_from_jwt(request: Request) -> str:
     # Requires valid JWT with 'sub' claim (user ID)
   ```

### The Problem:
- **User IS Authenticated**: User "admin@example.com" is logged in with valid session
- **JWT Token Present**: Frontend successfully sends Authorization header with access_token
- **Backend Authentication Works**: JWT verification passes (no 401 errors)
- **Actual Issue**: Backend logic error - authenticated requests still return 404 "Agent not found"
- **Database/Logic Problem**: Likely missing agent records or incorrect query logic

## Environment Configuration

### Backend (.env):
```
ENV_MODE=local
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Frontend (.env.local):
```
NEXT_PUBLIC_ENV_MODE="local"
NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000/api"
```

## Reproduction Steps (Confirmed via Playwright)
1. Navigate to `http://localhost:3000`
2. User is already authenticated (admin@example.com)
3. Click "Dashboard" to access main interface
4. Click on message input textbox
5. Type any message (e.g., "Help me analyze some data")
6. Press Enter to submit
7. **Result**: Multiple API errors and failed agent initiation

## Solutions

### Option 1: Database Investigation (Recommended)
Check if default agents exist in database:
```sql
SELECT * FROM agents WHERE account_id = 'user-account-id';
SELECT * FROM agent_versions;
```

### Option 2: Create Default Agent
Ensure system has default agent available:
```python
# Create default Chainlens agent for user
# Check agent_crud.py for proper agent creation logic
```

### Option 3: Fix Agent Query Logic
Review `/api/agent/initiate` endpoint logic:
- Check agent_id parameter handling
- Verify account_id matching
- Ensure proper error responses

## Impact
- **Critical**: Core agent functionality completely broken
- **User Experience**: Users cannot initiate any agent conversations
- **Business Logic**: System fails despite proper authentication
- **Development**: Blocks all agent-related features and testing

## Next Steps
1. **Immediate**: Investigate database state and agent records
2. **Database**: Check if default agents exist for authenticated users
3. **Backend**: Review agent query logic in `/api/agent/initiate` endpoint
4. **Error Handling**: Improve error messages to distinguish between auth vs data issues
5. **Testing**: Add proper error handling for missing agent scenarios

## Playwright Test Evidence
- Successfully reproduced all errors in controlled browser environment
- Confirmed user authentication is working (admin@example.com logged in)
- Verified API calls are being made with proper headers
- Documented exact error messages and UI behavior

## Files Involved
- `backend/core/utils/auth_utils.py` - JWT verification
- `frontend/src/lib/api-client.ts` - Token sending
- `backend/core/agent_runs.py` - Protected endpoints
- `frontend/src/components/AuthProvider.tsx` - Session management
