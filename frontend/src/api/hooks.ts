import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  AiSuggestResult,
  ChatMessage,
  ChatResult,
  Edge,
  LibraryEntry,
  MapBreadcrumbEntry,
  MapDetail,
  MapEvent,
  MapMetrics,
  MapSummary,
  Step,
} from './types'

// ── Maps ─────────────────────────────────────────────────────────────────────

export function useMaps() {
  return useQuery({
    queryKey: ['maps'],
    queryFn: () => api.get<MapSummary[]>('/maps'),
  })
}

/** The Map Library — featured 15288 scaffolds + published project snapshots, each with a
 * "used by N projects" count. Never mixed into useMaps() above. */
export function useMapLibrary() {
  return useQuery({
    queryKey: ['maps', 'library'],
    queryFn: () => api.get<LibraryEntry[]>('/maps/library'),
  })
}

/** The one demo map the nav's "Sample Map" opens — an editable sandbox. */
export function useSampleMap() {
  return useQuery({
    queryKey: ['maps', 'sample'],
    queryFn: () => api.get<MapSummary>('/maps/sample'),
    staleTime: 5 * 60_000,
  })
}

/** Restore the Sample Map to its seeded state — discards edits and any expanded sub-processes.
 * Broad invalidation: the map, its graph/metrics, the sample id (which changes on rebuild),
 * and the main list (sub-process maps may have been deleted). */
export function useResetSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<MapDetail>('/maps/sample/reset'),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useMap(mapId: string | undefined) {
  return useQuery({
    queryKey: ['maps', mapId],
    queryFn: () => api.get<MapDetail>(`/maps/${mapId}`),
    enabled: !!mapId,
  })
}

export function useMapMetrics(mapId: string | undefined) {
  return useQuery({
    queryKey: ['maps', mapId, 'metrics'],
    queryFn: () => api.get<MapMetrics>(`/maps/${mapId}/metrics`),
    enabled: !!mapId,
  })
}

export function useMapBreadcrumb(mapId: string | undefined) {
  return useQuery({
    queryKey: ['maps', mapId, 'breadcrumb'],
    queryFn: () => api.get<MapBreadcrumbEntry[]>(`/maps/${mapId}/breadcrumb`),
    enabled: !!mapId,
  })
}

function useInvalidateMap(mapId: string | undefined) {
  const qc = useQueryClient()
  return () => {
    // ['maps', mapId] prefix-matches the graph, metrics, breadcrumb AND events queries — an
    // edit's auto-captured journal entries show up on the next render without a separate call.
    qc.invalidateQueries({ queryKey: ['maps', mapId] })
    qc.invalidateQueries({ queryKey: ['maps'] })
  }
}

// ── Journal ──────────────────────────────────────────────────────────────────

/** The map's journal. Pass `targetId` to scope it to one step/edge (the drawer view);
 * omit for the whole-map feed. */
export function useMapEvents(mapId: string | undefined, targetId?: string) {
  return useQuery({
    queryKey: ['maps', mapId, 'events', targetId ?? 'all'],
    queryFn: () =>
      api.get<MapEvent[]>(
        `/maps/${mapId}/events${targetId ? `?target_id=${encodeURIComponent(targetId)}` : ''}`,
      ),
    enabled: !!mapId,
  })
}

export function useAddMapEvent(mapId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      note: string
      author?: string
      target_type?: 'step' | 'edge' | 'map'
      target_id?: string
      target_name?: string
    }) => api.post<MapEvent>(`/maps/${mapId}/events`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps', mapId, 'events'] }),
  })
}

export function useDeleteMapEvent(mapId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) => api.del<void>(`/maps/${mapId}/events/${eventId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps', mapId, 'events'] }),
  })
}

export function useCreateMap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; portfolio?: string; project?: string }) =>
      api.post<MapDetail>('/maps', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  })
}

export function useUpdateMap(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (data: {
      name?: string
      description?: string | null
      portfolio?: string | null
      project?: string | null
    }) => api.put<MapDetail>(`/maps/${mapId}`, data),
    onSuccess: invalidate,
  })
}

export function useDeleteMap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mapId: string) => api.del<void>(`/maps/${mapId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  })
}

export function useDuplicateMap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) =>
      api.post<MapDetail>(`/maps/${id}/duplicate`, name ? { name } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  })
}

/** Clone a library map (featured scaffold or published snapshot) into a project — a fresh
 * working map, filed under the target project, that counts toward the source's "used by N". */
export function useCloneFromLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      portfolio,
      project,
      name,
    }: { id: string; portfolio?: string; project?: string; name?: string }) =>
      api.post<MapDetail>(`/maps/${id}/clone`, { portfolio, project, name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maps'] })
      qc.invalidateQueries({ queryKey: ['maps', 'library'] })
    },
  })
}

/** Publish a finished working map into the library: a frozen COPY carrying its real recorded
 * numbers. The working map (mapId) is untouched. Publishing it again overwrites the snapshot.
 * See routes/maps.py's publish_map. */
export function usePublishMap(mapId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { template_category?: string; name?: string }) =>
      api.post<MapDetail>(`/maps/${mapId}/publish`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maps', 'library'] })
      qc.invalidateQueries({ queryKey: ['maps', mapId] })
    },
  })
}

// ── Steps ────────────────────────────────────────────────────────────────────

export function useCreateStep(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (data: Partial<Step> & { name: string }) =>
      api.post<Step>(`/maps/${mapId}/steps`, data),
    onSuccess: invalidate,
  })
}

/** `data` may carry `author` / `journal_note` alongside the field changes — the backend
 * strips them from the row update and uses them to attribute the auto-captured journal
 * entries (and attach the optional "why" note). */
export function useUpdateStep(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: ({
      stepId,
      data,
    }: {
      stepId: string
      data: Partial<Step> & { author?: string; journal_note?: string }
    }) => api.put<Step>(`/steps/${stepId}`, data),
    onSuccess: invalidate,
  })
}

export function useDeleteStep(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (stepId: string) => api.del<void>(`/steps/${stepId}`),
    onSuccess: invalidate,
  })
}

export function useExpandStep(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (stepId: string) => api.post<MapDetail>(`/steps/${stepId}/expand`),
    onSuccess: invalidate,
  })
}

export function useCollapseStep(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (stepId: string) => api.del<void>(`/steps/${stepId}/child-map`),
    onSuccess: invalidate,
  })
}

// ── Edges ────────────────────────────────────────────────────────────────────

export function useCreateEdge(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (data: { source_step_id: string; target_step_id: string; wait_time_sec?: number; label?: string }) =>
      api.post<Edge>(`/maps/${mapId}/edges`, data),
    onSuccess: invalidate,
  })
}

export function useUpdateEdge(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: ({
      edgeId,
      data,
    }: {
      edgeId: string
      data: Partial<Edge> & { author?: string; journal_note?: string }
    }) => api.put<Edge>(`/edges/${edgeId}`, data),
    onSuccess: invalidate,
  })
}

export function useDeleteEdge(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (edgeId: string) => api.del<void>(`/edges/${edgeId}`),
    onSuccess: invalidate,
  })
}

// ── Health ───────────────────────────────────────────────────────────────────

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ status: string; ai_configured: boolean }>('/health'),
    staleTime: 60_000,
  })
}

// ── AI ───────────────────────────────────────────────────────────────────────

export function useAiSuggestStep() {
  return useMutation({
    mutationFn: (stepId: string) => api.post<AiSuggestResult>(`/steps/${stepId}/ai-suggest`),
  })
}

/** Conversation history lives entirely in the caller's React state, not here and not on the
 * server — each call sends the full message list so far and gets one reply back. The backend
 * rebuilds the map's context fresh on every call, so an edit made mid-conversation is
 * reflected in the very next reply without needing to restart the chat. */
export function useMapChat(mapId: string) {
  return useMutation({
    mutationFn: (messages: ChatMessage[]) =>
      api.post<ChatResult>(`/maps/${mapId}/chat`, { messages }),
  })
}
