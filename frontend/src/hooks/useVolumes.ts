import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useVolumes() {
  return useQuery({
    queryKey: ['volumes'],
    queryFn: api.fetchVolumes,
    refetchInterval: 30000,
  });
}

export function useCreateVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, driver }: { name: string; driver?: string }) => api.createVolume(name, driver),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['volumes'] }),
  });
}

export function useRemoveVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.removeVolume(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['volumes'] }),
  });
}
