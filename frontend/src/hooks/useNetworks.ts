import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useNetworks() {
  return useQuery({
    queryKey: ['networks'],
    queryFn: api.fetchNetworks,
    refetchInterval: 30000,
  });
}

export function useCreateNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, driver }: { name: string; driver?: string }) => api.createNetwork(name, driver),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks'] }),
  });
}

export function useRemoveNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeNetwork(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks'] }),
  });
}
