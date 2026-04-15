import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type { BackupConfig } from '../lib/types';

export function useBackupConfig(stackId: string) {
  return useQuery({
    queryKey: ['backups', stackId, 'config'],
    queryFn: () => api.fetchBackupConfig(stackId),
    enabled: !!stackId,
  });
}

export function useUpdateBackupConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stackId, config }: { stackId: string; config: Partial<BackupConfig> }) =>
      api.updateBackupConfig(stackId, config),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['backups', vars.stackId] });
    },
  });
}

export function useBackupJobs(stackId: string) {
  return useQuery({
    queryKey: ['backups', stackId, 'jobs'],
    queryFn: () => api.fetchBackupJobs(stackId),
    enabled: !!stackId,
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stackId: string) => api.runBackup(stackId),
    onSuccess: (_data, stackId) => {
      qc.invalidateQueries({ queryKey: ['backups', stackId] });
    },
  });
}
