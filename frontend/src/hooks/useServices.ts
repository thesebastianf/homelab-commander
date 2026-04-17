import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';

export function useNotificationServices() {
  return useQuery({
    queryKey: ['notificationServices'],
    queryFn: api.fetchNotificationServices,
  });
}

export function useCreateNotificationService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createNotificationService,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificationServices'] }),
  });
}

export function useUpdateNotificationService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof api.updateNotificationService>[1]) =>
      api.updateNotificationService(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificationServices'] }),
  });
}

export function useDeleteNotificationService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteNotificationService,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificationServices'] }),
  });
}

export function useTestNotificationService() {
  return useMutation({
    mutationFn: api.testNotificationService,
  });
}

export function usePortReservations() {
  return useQuery({
    queryKey: ['portReservations'],
    queryFn: api.fetchPortReservations,
  });
}

export function useCreatePortReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPortReservation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portReservations'] }),
  });
}

export function useDeletePortReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deletePortReservation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portReservations'] }),
  });
}

export function useSmartStartupConfigs() {
  return useQuery({
    queryKey: ['smartStartup'],
    queryFn: api.fetchSmartStartupConfigs,
    refetchInterval: 30_000,
  });
}

export function useSmartStartupDeviceStatus() {
  return useQuery({
    queryKey: ['smartStartupDeviceStatus'],
    queryFn: api.fetchSmartStartupDeviceStatus,
    refetchInterval: 15_000,
  });
}

export function useSmartStartupStartupWarnings() {
  return useQuery({
    queryKey: ['smartStartupStartupWarnings'],
    queryFn: api.fetchSmartStartupStartupWarnings,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useCheckSmartStartupAddressNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.checkSmartStartupAddressNow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smartStartup'] });
      qc.invalidateQueries({ queryKey: ['smartStartupDeviceStatus'] });
    },
  });
}

export function useCreateSmartStartupConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createSmartStartupConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smartStartup'] });
      qc.invalidateQueries({ queryKey: ['smartStartupStartupWarnings'] });
    },
  });
}

export function useUpdateSmartStartupConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof api.updateSmartStartupConfig>[1]) =>
      api.updateSmartStartupConfig(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smartStartup'] });
      qc.invalidateQueries({ queryKey: ['smartStartupStartupWarnings'] });
    },
  });
}

export function useDeleteSmartStartupConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteSmartStartupConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smartStartup'] });
      qc.invalidateQueries({ queryKey: ['smartStartupStartupWarnings'] });
    },
  });
}
