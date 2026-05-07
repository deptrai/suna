'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useServerStore } from '@/stores/server-store';
import { authenticatedFetch } from '@/lib/auth-token';

// ---------------------------------------------------------------------------
// Types — mirror the live /epsilon/tasks API contract
// ---------------------------------------------------------------------------

export type EpsilonTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'input_needed'
  | 'awaiting_review'
  | 'completed'
  | 'cancelled';

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

export interface EpsilonTaskEvent {
  id: string;
  task_id: string;
  project_id: string;
  session_id: string | null;
  type:
    | 'progress'
    | 'blocker'
    | 'evidence'
    | 'verification_started'
    | 'verification_passed'
    | 'verification_failed'
    | 'delivered';
  message: string | null;
  payload_json: string | null;
  created_at: string;
}

export interface EpsilonTaskLiveStatus {
  task_id: string;
  status: EpsilonTaskStatus;
  latest_run_id: string | null;
  run_status: 'running' | 'input_needed' | 'awaiting_review' | 'completed' | 'cancelled' | 'failed' | null;
  owner_session_id: string | null;
  detail: string;
}

interface EpsilonTaskQueryOptions {
  enabled?: boolean;
  pollingEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const taskKeys = {
  all: ['epsilon', 'tasks'] as const,
  byProject: (projectId: string) => ['epsilon', 'tasks', projectId] as const,
  single: (id: string) => ['epsilon', 'tasks', 'detail', id] as const,
  events: (id: string) => ['epsilon', 'tasks', 'events', id] as const,
  status: (id: string) => ['epsilon', 'tasks', 'status', id] as const,
};

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function epsilonTaskFetch<T>(serverUrl: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${serverUrl.replace(/\/+$/, '')}/epsilon/tasks${path}`;
  const res = await authenticatedFetch(url, init);
  if (!res.ok) throw new Error(`Tasks API ${res.status}`);
  return res.json();
}

const VALID_STATUSES: EpsilonTaskStatus[] = [
  'todo', 'in_progress', 'input_needed', 'awaiting_review',
  'completed', 'cancelled',
];

function normalizeTask(raw: any): EpsilonTask {
  const status = VALID_STATUSES.includes(raw?.status) ? raw.status : 'todo';
  return {
    id: raw.id,
    project_id: raw.project_id,
    title: raw.title || '',
    description: raw.description || '',
    verification_condition: raw.verification_condition || '',
    status,
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

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function useEpsilonTasks(
  projectId?: string,
  status?: string,
  options: EpsilonTaskQueryOptions = {},
) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  const params = new URLSearchParams();
  if (projectId) params.set('project_id', projectId);
  if (status) params.set('status', status);
  const qs = params.toString() ? `?${params}` : '';
  return useQuery({
    queryKey: [...taskKeys.all, projectId, status],
    queryFn: async () => {
      const rows = await epsilonTaskFetch<any[]>(serverUrl, qs);
      return Array.isArray(rows) ? rows.map(normalizeTask) : [];
    },
    enabled: !!projectId && (options.enabled ?? true),
    refetchInterval: options.pollingEnabled === false ? false : 3000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}

export function useEpsilonTask(id: string, options: EpsilonTaskQueryOptions = {}) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery({
    queryKey: taskKeys.single(id),
    queryFn: async () => {
      const raw = await epsilonTaskFetch<any>(serverUrl, `/${encodeURIComponent(id)}`);
      return normalizeTask(raw);
    },
    enabled: !!id && (options.enabled ?? true),
    refetchInterval: options.pollingEnabled === false ? false : 3000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}

export function useEpsilonTaskEvents(id: string, options: EpsilonTaskQueryOptions = {}) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery({
    queryKey: taskKeys.events(id),
    queryFn: async () => {
      const rows = await epsilonTaskFetch<EpsilonTaskEvent[]>(serverUrl, `/${encodeURIComponent(id)}/events`);
      return Array.isArray(rows) ? rows : [];
    },
    enabled: !!id && (options.enabled ?? true),
    refetchInterval: options.pollingEnabled === false ? false : 3000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}

export function useEpsilonTaskStatus(id: string, options: EpsilonTaskQueryOptions = {}) {
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useQuery({
    queryKey: taskKeys.status(id),
    queryFn: async () => {
      return epsilonTaskFetch<EpsilonTaskLiveStatus>(serverUrl, `/${encodeURIComponent(id)}/status`);
    },
    enabled: !!id && (options.enabled ?? true),
    refetchInterval: options.pollingEnabled === false ? false : 3000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}

export function useCreateEpsilonTask() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: (data: {
      project_id: string;
      title: string;
      description?: string;
      verification_condition?: string;
      status?: EpsilonTaskStatus;
    }) =>
      epsilonTaskFetch<EpsilonTask>(serverUrl, '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useUpdateEpsilonTask() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<EpsilonTask>) =>
      epsilonTaskFetch<EpsilonTask>(serverUrl, `/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useStartEpsilonTask() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      epsilonTaskFetch<EpsilonTask>(serverUrl, `/${encodeURIComponent(id)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
      qc.invalidateQueries({ queryKey: ['epsilon', 'projects'] });
      if ((task as any)?.project_id) {
        qc.invalidateQueries({ queryKey: ['epsilon', 'projects', (task as any).project_id] });
        qc.invalidateQueries({ queryKey: ['epsilon', 'projects', (task as any).project_id, 'sessions'] });
      }
    },
  });
}

export function useApproveEpsilonTask() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: (id: string) =>
      epsilonTaskFetch<EpsilonTask>(serverUrl, `/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useDeleteEpsilonTask() {
  const qc = useQueryClient();
  const serverUrl = useServerStore((s) => s.getActiveServerUrl());
  return useMutation({
    mutationFn: (id: string) =>
      epsilonTaskFetch<{ deleted: boolean }>(serverUrl, `/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
