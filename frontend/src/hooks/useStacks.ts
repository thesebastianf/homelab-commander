import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type { Stack } from '../lib/types';

export function useStacks() {
  return useQuery({
    queryKey: ['stacks'],
    queryFn: api.fetchStacks,
    refetchInterval: 10000,
  });
}

export function useExternalStacks() {
  return useQuery({
    queryKey: ['externalStacks'],
    queryFn: api.fetchExternalStacks,
    refetchInterval: 15000,
  });
}

export function useAdoptStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, stackPath }: { name: string; stackPath: string }) =>
      api.adoptStack(name, stackPath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stacks'] });
      qc.invalidateQueries({ queryKey: ['externalStacks'] });
    },
  });
}

export function useStack(id: string) {
  return useQuery({
    queryKey: ['stacks', id],
    queryFn: () => api.fetchStack(id),
    enabled: !!id,
  });
}

export function useCreateStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; composeContent: string; envContent?: string }) =>
      api.createStack(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks'] }),
  });
}

export function useUpdateStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Stack & { composeContent: string; envContent: string }>) =>
      api.updateStack(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks'] }),
  });
}

export function useDeleteStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteStack(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks'] }),
  });
}

export function useDeployStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deployStack(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks'] }),
  });
}

export function useStopStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.stopStack(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks'] }),
  });
}

export function useRestartStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restartStack(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks'] }),
  });
}
