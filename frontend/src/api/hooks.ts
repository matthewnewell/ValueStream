import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  AiInsightsResult,
  AiSuggestResult,
  Edge,
  MapBreadcrumbEntry,
  MapDetail,
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
    qc.invalidateQueries({ queryKey: ['maps', mapId] })
    qc.invalidateQueries({ queryKey: ['maps', mapId, 'metrics'] })
    qc.invalidateQueries({ queryKey: ['maps'] })
  }
}

export function useCreateMap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.post<MapDetail>('/maps', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  })
}

export function useUpdateMap(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      api.put<MapDetail>(`/maps/${mapId}`, data),
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
    mutationFn: (mapId: string) => api.post<MapDetail>(`/maps/${mapId}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
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

export function useUpdateStep(mapId: string) {
  const invalidate = useInvalidateMap(mapId)
  return useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: Partial<Step> }) =>
      api.put<Step>(`/steps/${stepId}`, data),
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
    mutationFn: ({ edgeId, data }: { edgeId: string; data: Partial<Edge> }) =>
      api.put<Edge>(`/edges/${edgeId}`, data),
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

export function useAiInsights(mapId: string) {
  return useMutation({
    mutationFn: () => api.post<AiInsightsResult>(`/maps/${mapId}/ai-insights`),
  })
}
