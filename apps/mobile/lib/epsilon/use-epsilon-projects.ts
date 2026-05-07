/**
 * Epsilon Projects hooks — ported from apps/web/src/hooks/epsilon/use-epsilon-projects.ts
 *
 * Fetches from epsilon-master's /epsilon/projects API through the sandbox URL.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '@/api/config';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EpsilonProject {
  id: string;
  name: string;
  path: string;
  description: string;
  created_at: string;
  opencode_id: string | null;
  sessionCount?: number;
  // Extended properties from OpenCode Project
  worktree?: string;
  time?: {
    created: number;
    updated: number;
    initialized?: number;
  };
}

// Task status — aligned with the live Epsilon task pipeline.
// Pipeline: todo → [START] → in_progress → input_needed/awaiting_review → [APPROVE] → completed
export type EpsilonTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'input_needed'
  | 'awaiting_review'
  | 'completed'
  | 'cancelled';

const VALID_TASK_STATUSES: EpsilonTaskStatus[] = [
  'todo',
  'in_progress',
  'input_needed',
  'awaiting_review',
  'completed',
  'cancelled',
];

/** Map legacy statuses from older backends to the new schema */
function normalizeTaskStatus(status: unknown): EpsilonTaskStatus {
  if (typeof status !== 'string') return 'todo';
  if ((VALID_TASK_STATUSES as string[]).includes(status)) return status as EpsilonTaskStatus;
  // Back-compat mapping for pre-26cf37f data
  if (status === 'pending') return 'todo';
  if (status === 'done') return 'completed';
  if (status === 'blocked') return 'input_needed';
  return 'todo';
}

function normalizeTask(raw: any): EpsilonTask {
  return {
    id: raw.id,
    project_id: raw.project_id,
    title: raw.title || '',
    description: raw.description || '',
    verification_condition: raw.verification_condition || '',
    status: normalizeTaskStatus(raw?.status),
    result: raw.result ?? null,
    verification_summary: raw.verification_summary ?? null,
    blocking_question: raw.blocking_question ?? null,
    owner_session_id: raw.owner_session_id ?? null,
    owner_agent: raw.owner_agent ?? null,
    requested_by_session_id: raw.requested_by_session_id ?? null,
    started_at: raw.started_at ?? null,
    completed_at: raw.completed_at ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export interface EpsilonTask {
  id: string;
  project_id: string;
  title: string;
  description: string;
  verification_condition: string;
  status: EpsilonTaskStatus;
  result: string | null;
  verification_summary: string | null;
  blocking_question: string | null;
  owner_session_id: string | null;
  owner_agent: string | null;
  requested_by_session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpsilonAgent {
  id: string;
  project_id: string;
  session_id: string;
  parent_session_id: string;
  agent_type: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  result: string | null;
  verification_summary: string | null;
  blocking_question: string | null;
  owner_session_id: string | null;
  owner_agent: string | null;
  requested_by_session_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function epsilonFetch<T>(sandboxUrl: string, path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const url = `${sandboxUrl.replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Epsilon API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const epsilonKeys = {
  projects: (url: string) => ['epsilon', 'projects', url] as const,
  project: (url: string, id: string) => ['epsilon', 'projects', url, id] as const,
  projectSessions: (url: string, id: string) =>
    ['epsilon', 'projects', url, id, 'sessions'] as const,
  tasks: (url: string, projectId: string) => ['epsilon', 'tasks', url, projectId] as const,
  agents: (url: string, projectId: string) => ['epsilon', 'agents', url, projectId] as const,
  connectors: (url: string) => ['epsilon', 'connectors', url] as const,
};

// ── Connector types & hooks ──────────────────────────────────────────────────

export interface EpsilonConnector {
  id: string;
  name: string;
  description: string | null;
  source: string | null;
  pipedream_slug: string | null;
  env_keys: string[] | null;
  notes: string | null;
  auto_generated: boolean;
  created_at: string;
  updated_at: string;
}

export function useEpsilonConnectors(sandboxUrl: string | undefined) {
  return useQuery<EpsilonConnector[]>({
    queryKey: epsilonKeys.connectors(sandboxUrl || ''),
    queryFn: async () => {
      const data = await epsilonFetch<{ connectors?: EpsilonConnector[] } | EpsilonConnector[]>(
        sandboxUrl!,
        '/epsilon/connectors',
      );
      if (Array.isArray(data)) return data;
      return data.connectors ?? [];
    },
    enabled: !!sandboxUrl,
    staleTime: 30_000,
    retry: 2,
  });
}

// ── Project hooks ────────────────────────────────────────────────────────────

export function useEpsilonProjects(sandboxUrl: string | undefined) {
  return useQuery<EpsilonProject[]>({
    queryKey: epsilonKeys.projects(sandboxUrl || ''),
    queryFn: () => epsilonFetch<EpsilonProject[]>(sandboxUrl!, '/epsilon/projects'),
    enabled: !!sandboxUrl,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useEpsilonProject(sandboxUrl: string | undefined, id: string) {
  return useQuery<EpsilonProject>({
    queryKey: epsilonKeys.project(sandboxUrl || '', id),
    queryFn: () =>
      epsilonFetch<EpsilonProject>(sandboxUrl!, `/epsilon/projects/${encodeURIComponent(id)}`),
    enabled: !!sandboxUrl && !!id,
    staleTime: 15_000,
    retry: 2,
  });
}

export function useEpsilonProjectSessions(sandboxUrl: string | undefined, projectId: string) {
  return useQuery<any[]>({
    queryKey: epsilonKeys.projectSessions(sandboxUrl || '', projectId),
    queryFn: () =>
      epsilonFetch<any[]>(sandboxUrl!, `/epsilon/projects/${encodeURIComponent(projectId)}/sessions`),
    enabled: !!sandboxUrl && !!projectId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useEpsilonTasks(sandboxUrl: string | undefined, projectId: string | undefined) {
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  return useQuery<EpsilonTask[]>({
    queryKey: epsilonKeys.tasks(sandboxUrl || '', projectId || ''),
    queryFn: async () => {
      const rows = await epsilonFetch<any[]>(sandboxUrl!, `/epsilon/tasks${qs}`);
      return Array.isArray(rows) ? rows.map(normalizeTask) : [];
    },
    enabled: !!sandboxUrl && !!projectId,
    refetchInterval: 5000,
    retry: 2,
  });
}

/** Fetch a single task by ID (ported from web 26cf37f). */
export function useEpsilonTask(sandboxUrl: string | undefined, id: string | undefined) {
  return useQuery<EpsilonTask>({
    queryKey: ['epsilon', 'tasks', sandboxUrl || '', 'detail', id || ''],
    queryFn: async () => {
      const raw = await epsilonFetch<any>(sandboxUrl!, `/epsilon/tasks/${encodeURIComponent(id!)}`);
      return normalizeTask(raw);
    },
    enabled: !!sandboxUrl && !!id,
    refetchInterval: 5000,
    retry: 2,
  });
}

export function useEpsilonAgents(sandboxUrl: string | undefined, projectId: string | undefined) {
  const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  return useQuery<EpsilonAgent[]>({
    queryKey: epsilonKeys.agents(sandboxUrl || '', projectId || ''),
    queryFn: async () => {
      try {
        return await epsilonFetch<EpsilonAgent[]>(sandboxUrl!, `/epsilon/agents${qs}`);
      } catch {
        return [];
      }
    },
    enabled: !!sandboxUrl && !!projectId,
    refetchInterval: 5000,
  });
}
// ── Mutation hooks ───────────────────────────────────────────────────────────

export function useUpdateProject(sandboxUrl: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string }) =>
      epsilonFetch<EpsilonProject>(sandboxUrl!, `/epsilon/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_, vars) => {
      if (sandboxUrl) {
        qc.invalidateQueries({ queryKey: epsilonKeys.project(sandboxUrl, vars.id) });
        qc.invalidateQueries({ queryKey: epsilonKeys.projects(sandboxUrl) });
      }
    },
  });
}

export function useDeleteProject(sandboxUrl: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      epsilonFetch<{ deleted: boolean; name: string; path: string }>(
        sandboxUrl!,
        `/epsilon/projects/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      ),
    onSuccess: () => {
      if (sandboxUrl) {
        qc.invalidateQueries({ queryKey: epsilonKeys.projects(sandboxUrl) });
      }
    },
  });
}

// ── Task mutation hooks (ported from web 8e1bc7b + 26cf37f) ─────────────────

export function useCreateEpsilonTask(sandboxUrl: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      project_id: string;
      title: string;
      description?: string;
      verification_condition?: string;
      status?: EpsilonTaskStatus;
    }) => {
      const raw = await epsilonFetch<any>(sandboxUrl!, `/epsilon/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return normalizeTask(raw);
    },
    onSuccess: () => {
      if (sandboxUrl) {
        qc.invalidateQueries({ queryKey: ['epsilon', 'tasks', sandboxUrl] });
      }
    },
  });
}

export function useUpdateEpsilonTask(sandboxUrl: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<EpsilonTask>) => {
      const raw = await epsilonFetch<any>(sandboxUrl!, `/epsilon/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return normalizeTask(raw);
    },
    onSuccess: () => {
      if (sandboxUrl) {
        // Invalidate all task queries for this sandbox
        qc.invalidateQueries({ queryKey: ['epsilon', 'tasks', sandboxUrl] });
      }
    },
  });
}

/** Start a task — transitions it from `todo` → `in_progress` (ported from web 26cf37f) */
export function useStartEpsilonTask(sandboxUrl: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      session_id,
      agent,
    }: {
      id: string;
      session_id?: string;
      agent?: string;
    }) => {
      const raw = await epsilonFetch<any>(
        sandboxUrl!,
        `/epsilon/tasks/${encodeURIComponent(id)}/start`,
        {
          method: 'POST',
          body: JSON.stringify({ session_id, agent }),
        }
      );
      return normalizeTask(raw);
    },
    onSuccess: () => {
      if (sandboxUrl) {
        qc.invalidateQueries({ queryKey: ['epsilon', 'tasks', sandboxUrl] });
      }
    },
  });
}

/** Approve a task waiting for input/review — transitions it to `completed` (ported from web 26cf37f) */
export function useApproveEpsilonTask(sandboxUrl: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const raw = await epsilonFetch<any>(
        sandboxUrl!,
        `/epsilon/tasks/${encodeURIComponent(id)}/approve`,
        {
          method: 'POST',
        }
      );
      return normalizeTask(raw);
    },
    onSuccess: () => {
      if (sandboxUrl) {
        qc.invalidateQueries({ queryKey: ['epsilon', 'tasks', sandboxUrl] });
      }
    },
  });
}

export function useDeleteEpsilonTask(sandboxUrl: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      epsilonFetch<{ deleted: boolean }>(sandboxUrl!, `/epsilon/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      if (sandboxUrl) {
        qc.invalidateQueries({ queryKey: ['epsilon', 'tasks', sandboxUrl] });
      }
    },
  });
}
