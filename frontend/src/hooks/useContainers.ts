import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useContainers() {
  return useQuery({
    queryKey: ['containers'],
    queryFn: api.fetchContainers,
    refetchInterval: 5000,
  });
}

export function useContainer(id: string) {
  return useQuery({
    queryKey: ['containers', id],
    queryFn: () => api.fetchContainer(id),
    enabled: !!id,
  });
}

export function useContainerStats(id: string) {
  return useQuery({
    queryKey: ['containers', id, 'stats'],
    queryFn: () => api.fetchContainerStats(id),
    refetchInterval: 3000,
    enabled: !!id,
  });
}

export function useContainerLogs(id: string, tail = 100) {
  return useQuery({
    queryKey: ['containers', id, 'logs', tail],
    queryFn: () => api.fetchContainerLogs(id, tail),
    enabled: !!id,
  });
}

export function useAggregatedLogs() {
  return useQuery({
    queryKey: ['containers', 'logs', 'all'],
    queryFn: api.fetchAggregatedLogs,
    refetchInterval: 10000,
  });
}

export function useStartContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.startContainer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
}

export function useStopContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.stopContainer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
}

export function useRestartContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restartContainer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
}

export function useRemoveContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => api.removeContainer(id, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
}
