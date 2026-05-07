/**
 * Epsilon Projects hooks.
 *
 * Fetches from epsilon-master's /epsilon/projects API through the currently
 * active sandbox route (/v1/p/.../8000/epsilon/projects). This keeps Epsilon
 * workspace data on the same authenticated transport path as the rest of the
 * dashboard/OpenCode APIs.
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { authenticatedFetch } from '@/lib/auth-token';
import { useAuth } from '@/components/AuthProvider';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EpsilonProject {
  id: string;
  name: string;
  path: string;
  description: string;
  created_at: string;
  opencode_id: string | null;
  /** 1 = legacy tasks layout, 2 = new tickets/board. New projects default to 2. */
  structure_version?: number;
  sessionCount?: number;
  // Extended properties from OpenCode Project (optional for compatibility)
  worktree?: string;
  time?: {
    created: number;
    updated: number;
    initialized?: number;
  };
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function epsilonFetch<T>(serverUrl: string, apiPath: string, init?: RequestInit): Promise<T> {
  const url = `${serverUrl.replace(/\/+$/, '')}/epsilon/projects${apiPath}`;
  const res = await authenticatedFetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Epsilon API ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json();
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const epsilonKeys = {
  projects: () => ['epsilon', 'projects'] as const,
  project: (id: string) => ['epsilon', 'projects', id] as const,
};

interface EpsilonProjectQueryOptions {
  enabled?: boolean;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useEpsilonProjects(_args?: undefined, options: EpsilonProjectQueryOptions = {}) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery<EpsilonProject[]>({
    queryKey: [...epsilonKeys.projects(), user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: () => epsilonFetch<EpsilonProject[]>(serverUrl, ''),
    enabled: !isAuthLoading && !!user && !!serverUrl && (options.enabled ?? true),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useEpsilonProject(id: string) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery<EpsilonProject>({
    queryKey: [...epsilonKeys.project(id), user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: () => epsilonFetch<EpsilonProject>(serverUrl, `/${encodeURIComponent(id)}`),
    enabled: !isAuthLoading && !!user && !!serverUrl && !!id,
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    // Keep previous data while a new query (e.g. from a serverVersion bump
    // when another tab closes) is loading. Prevents the skeleton flash.
    placeholderData: keepPreviousData,
  });
}

export function useEpsilonProjectForSession(sessionId: string, options: EpsilonProjectQueryOptions = {}) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery<EpsilonProject | null>({
    queryKey: ['epsilon', 'projects', 'by-session', sessionId, user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: async () => {
      try {
        return await epsilonFetch<EpsilonProject>(serverUrl, `/by-session/${encodeURIComponent(sessionId)}`);
      } catch {
        return null;
      }
    },
    enabled: !isAuthLoading && !!user && !!serverUrl && !!sessionId && (options.enabled ?? true),
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetch sessions linked to a specific project.
 * Returns OpenCode session objects enriched with title, time, etc.
 */
export function useEpsilonProjectSessions(
  projectId: string,
  options: EpsilonProjectQueryOptions = {},
) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const serverVersion = useServerStore((s) => s.serverVersion);
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery<any[]>({
    queryKey: ['epsilon', 'projects', projectId, 'sessions', user?.id ?? 'anonymous', serverUrl, serverVersion],
    queryFn: () => epsilonFetch<any[]>(serverUrl, `/${encodeURIComponent(projectId)}/sessions`),
    enabled: !isAuthLoading && !!user && !!serverUrl && !!projectId && (options.enabled ?? true),
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
    placeholderData: keepPreviousData,
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: (id: string) =>
      epsilonFetch<{ deleted: boolean; name: string; path: string }>(serverUrl, `/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: epsilonKeys.projects() });
    },
  });
}

export function usePatchProject() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; user_handle?: string | null }) =>
      epsilonFetch<EpsilonProject>(serverUrl, `/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: epsilonKeys.project(vars.id) });
      qc.invalidateQueries({ queryKey: epsilonKeys.projects() });
    },
  });
}

