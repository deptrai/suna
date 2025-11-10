/**
 * Unit Tests for useAuthState Hook
 * 
 * Story 13.3: Authentication Flow in Side Panel
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useAuthState } from '../useAuthState';
import { createSupabaseClient } from '../../../shared/supabase-extension';

// Mock Supabase client
jest.mock('../../../shared/supabase-extension', () => ({
  createSupabaseClient: jest.fn(),
}));

const mockCreateSupabaseClient = createSupabaseClient as jest.MockedFunction<typeof createSupabaseClient>;

describe('useAuthState', () => {
  const mockGetSession = jest.fn();
  const mockOnAuthStateChange = jest.fn();
  const mockUnsubscribe = jest.fn();

  const mockSupabaseClient = {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseClient.mockResolvedValue(mockSupabaseClient as any);
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  it('should return loading state initially', () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAuthState());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBe(null);
    expect(result.current.session).toBe(null);
  });

  it('should return user và session khi authenticated', async () => {
    const mockUser = { id: '123', email: 'test@example.com' } as any;
    const mockSession = { access_token: 'token', user: mockUser } as any;

    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuthState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.session).toEqual(mockSession);
  });

  it('should return null user và session khi not authenticated', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAuthState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBe(null);
    expect(result.current.session).toBe(null);
  });

  it('should subscribe to auth state changes', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    renderHook(() => useAuthState());

    await waitFor(() => {
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });
  });

  it('should unsubscribe from auth state changes on unmount', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { unmount } = renderHook(() => useAuthState());

    await waitFor(() => {
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should update user và session khi auth state changes', async () => {
    const mockUser = { id: '123', email: 'test@example.com' } as any;
    const mockSession = { access_token: 'token', user: mockUser } as any;

    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAuthState());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate auth state change
    const authStateChangeCallback = mockOnAuthStateChange.mock.calls[0][0];
    authStateChangeCallback('SIGNED_IN', mockSession);

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.session).toEqual(mockSession);
    });
  });
});

