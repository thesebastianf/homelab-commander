import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useImages() {
  return useQuery({
    queryKey: ['images'],
    queryFn: api.fetchImages,
    refetchInterval: 30000,
  });
}

export function usePullImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, tag }: { name: string; tag?: string }) => api.pullImage(name, tag),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['images'] }),
  });
}

export function useRemoveImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => api.removeImage(id, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['images'] }),
  });
}
