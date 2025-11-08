# Story 13.3: Authentication Flow in Popup

Status: ready-for-dev

## Story

As a user,  
I want login trong extension popup,  
So that I can access authenticated features.

## Acceptance Criteria

1. Login UI trong popup (reuse frontend auth components)
2. Login form submits credentials
3. Auth token stored in chrome.storage after login
4. Popup shows logged-in state
5. Logout functionality works
6. Auth state persists across browser sessions

## Tasks / Subtasks

- [ ] Task 1: Create login UI (AC: 1)
  - [ ] **Reference:** `frontend/src/app/auth/page.tsx:37-480` (login form pattern)
  - [ ] **Reference:** `frontend/src/app/auth/actions.ts:40-66` (signIn action)
  - [ ] **Create simplified login form:**
    ```typescript
    // extension/src/sidepanel/components/LoginForm.tsx
    import { useState } from 'react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { createClient } from '@/lib/supabase/client'; // From Story 13.1

    export function LoginForm() {
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState<string | null>(null);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
          const supabase = createClient();
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            setError(error.message);
          } else {
            // Success - session stored automatically via chrome.storage adapter
            // Auth state will update automatically
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
          setLoading(false);
        }
      };

      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      );
    }
    ```
  - [ ] **Dependencies:**
    - ✅ `@/components/ui/button` - Available (Story 12.1)
    - ⚠️ `@/components/ui/input` - Need to verify availability
    - ✅ `@/lib/supabase/client` - Available from Story 13.1
  - [ ] Test login UI displays correctly
  - [ ] Test form submission works

- [ ] Task 2: Implement login form submission (AC: 2)
  - [ ] **Source:** `frontend/src/app/auth/actions.ts:40-66` (signIn pattern)
  - [ ] **Supabase signIn:** `supabase.auth.signInWithPassword({ email, password })`
  - [ ] **Pattern from frontend:**
    ```typescript
    // From frontend/src/app/auth/actions.ts:55-58
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    ```
  - [ ] **Implementation:**
    ```typescript
    // extension/src/sidepanel/components/LoginForm.tsx
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Handle error
        setError(error.message);
      } else {
        // Success - session automatically stored via chrome.storage adapter
        // Auth state will update automatically
      }
    };
    ```
  - [ ] Test login submission works
  - [ ] Test error handling works
  - [ ] Test success case stores session

- [ ] Task 3: Store auth token (AC: 3)
  - [ ] **Source:** `frontend/src/components/AuthProvider.tsx:31-43` (session retrieval pattern)
  - [ ] **Note:** Session automatically stored via chrome.storage adapter (Story 13.1)
  - [ ] **No additional code needed** - Supabase client từ Story 13.1 handles storage automatically
  - [ ] **Verify session stored:**
    ```typescript
    // After login, verify session is stored
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      console.log('Session stored:', session.access_token);
    }
    ```
  - [ ] Test token stored correctly
  - [ ] Test token persistence (after extension restart)
  - [ ] Verify storage works

- [ ] Task 4: Show logged-in state (AC: 4)
  - [ ] **Source:** `frontend/src/components/AuthProvider.tsx:31-43` (auth state check pattern)
  - [ ] **Create auth state hook:**
    ```typescript
    // extension/src/sidepanel/hooks/useAuthState.ts
    import { useEffect, useState } from 'react';
    import { createClient } from '@/lib/supabase/client';
    import { User, Session } from '@supabase/supabase-js';

    export function useAuthState() {
      const [user, setUser] = useState<User | null>(null);
      const [session, setSession] = useState<Session | null>(null);
      const [isLoading, setIsLoading] = useState(true);

      useEffect(() => {
        const supabase = createClient();
        
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          setUser(session?.user ?? null);
          setIsLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setIsLoading(false);
          }
        );

        return () => subscription.unsubscribe();
      }, []);

      return { user, session, isLoading };
    }
    ```
  - [ ] **Use trong side panel:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { useAuthState } from '../hooks/useAuthState';
    import { LoginForm } from './LoginForm';

    export function ChatInterface() {
      const { user, isLoading } = useAuthState();

      if (isLoading) {
        return <div>Loading...</div>;
      }

      if (!user) {
        return <LoginForm />;
      }

      return (
        <div>
          <div>Welcome, {user.email}</div>
          {/* Chat interface */}
        </div>
      );
    }
    ```
  - [ ] Test logged-in state displays
  - [ ] Test login form hidden when logged in
  - [ ] Test authenticated UI shows correctly

- [ ] Task 5: Implement logout (AC: 5)
  - [ ] **Source:** `frontend/src/components/AuthProvider.tsx:73-81` (signOut pattern)
  - [ ] **Supabase signOut:** `supabase.auth.signOut()`
  - [ ] **Pattern from frontend:**
    ```typescript
    // From frontend/src/components/AuthProvider.tsx:73-81
    const signOut = async () => {
      try {
        await supabase.auth.signOut();
        // Clear local storage after successful sign out
        clearUserLocalStorage();
      } catch (error) {
        console.error('Error signing out:', error);
      }
    };
    ```
  - [ ] **Implementation:**
    ```typescript
    // extension/src/sidepanel/components/ChatInterface.tsx
    import { createClient } from '@/lib/supabase/client';

    const handleLogout = async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      // Auth state will update automatically via onAuthStateChange
    };

    // Add logout button
    <Button onClick={handleLogout}>Logout</Button>
    ```
  - [ ] Test logout works
  - [ ] Test auth state clears after logout
  - [ ] Test login form shows after logout

- [ ] Task 6: Test auth persistence (AC: 6)
  - [ ] Test auth state persists after popup close
  - [ ] Test auth state persists after browser restart
  - [ ] Test auth state loads on popup open
  - [ ] Verify persistence works correctly
  - [ ] Test across browser sessions

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test login UI displays
  - [ ] Test login form submission
  - [ ] Test auth token storage
  - [ ] Test logged-in state
  - [ ] Test logout functionality
  - [ ] Test auth persistence

## Dev Notes

### Architecture Patterns and Constraints

**Authentication Flow:**
- User enters credentials in popup
- Submit to Supabase signIn
- Session stored via chrome.storage adapter
- Popup shows logged-in state
- Logout clears session

**UI Components:**
- Reuse frontend auth components if possible
- Or create extension-specific login UI
- Use shared UI components (Button, Input, etc.)
- Match frontend design

**State Management:**
- Use Supabase auth state
- Check auth state on popup open
- Update UI based on auth state
- Handle auth state changes

### Project Structure Notes

**Login Component:**
- Create `extension/src/popup/components/LoginForm.tsx`
- Or import từ frontend if possible
- Use trong popup layout

**Auth State:**
- Use Supabase client từ Story 13.1
- Check `supabase.auth.getSession()` on popup open
- Listen for auth state changes

## Code Reuse Instructions

### Authentication: Supabase Auth Methods

**Source File:**
- **Path:** `frontend/src/app/auth/actions.ts`
- **Lines:** `40-66` (signIn function)
- **Pattern:** `supabase.auth.signInWithPassword({ email, password })`

**Source File:**
- **Path:** `frontend/src/components/AuthProvider.tsx`
- **Lines:** `73-81` (signOut function)
- **Pattern:** `supabase.auth.signOut()`

**Source File:**
- **Path:** `frontend/src/components/AuthProvider.tsx`
- **Lines:** `31-43` (getSession pattern)
- **Pattern:** `supabase.auth.getSession()`

**Import Statement:**
```typescript
import { createClient } from '@/lib/supabase/client'; // From Story 13.1
```

**What to Reuse:**
- ✅ **Supabase auth methods** (no modifications needed)
- ✅ **Auth patterns** from frontend (signIn, signOut, getSession)
- ✅ **Auth state management** (onAuthStateChange listener)

**Usage Example:**
```typescript
// extension/src/sidepanel/components/LoginForm.tsx
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Handle error
    } else {
      // Success - session stored automatically
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

**Auth State Management:**
```typescript
// extension/src/sidepanel/hooks/useAuthState.ts
import { createClient } from '@/lib/supabase/client';

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user };
}
```

**Dependencies:**
- ✅ `@/lib/supabase/client` - Available from Story 13.1
- ✅ `@supabase/supabase-js` - Available (package.json)
- ✅ `@/components/ui/button` - Available (Story 12.1)
- ⚠️ `@/components/ui/input` - Need to verify availability

**Test Checklist:**
- [ ] Login works với email/password
- [ ] Session stored correctly
- [ ] Auth state updates on login
- [ ] Logout works correctly
- [ ] Auth state persists after extension restart
- [ ] Auth state updates on auth changes

### References

- [Source: docs/epics-extension.md#Epic-13] - Epic 13 goal: authentication flow
- [Source: docs/epics-extension.md#Story-13.3] - Story acceptance criteria và prerequisites
- [Source: docs/stories/13-1-chrome-storage-adapter-for-supabase.md#Dev-Agent-Record] - Supabase client available
- [Source: docs/stories/13-2-api-client-adaptation.md#Dev-Agent-Record] - API client ready
- [Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record] - Side panel layout ready
- [Source: frontend/src/app/auth/actions.ts:40-66] - signIn pattern
- [Source: frontend/src/components/AuthProvider.tsx:73-81] - signOut pattern
- [Source: frontend/src/components/AuthProvider.tsx:31-43] - getSession pattern

### Learnings from Previous Story

**From Story 13.2 (Status: ready-for-dev)**

- **API Client Ready**: API client adapted với extension-specific auth
- **Token Retrieval**: Can get auth token từ chrome.storage
- **API Calls Work**: API calls include JWT token in headers
- **Error Handling**: Error handling matches frontend patterns

**Reuse:**
- Use API client từ Story 13.2
- Use Supabase client từ Story 13.1
- Integrate authentication vào popup

[Source: docs/stories/13-2-api-client-adaptation.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

