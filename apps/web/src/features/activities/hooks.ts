'use client';

import { useQuery } from '@tanstack/react-query';
import type { PaginatedWithMeta, TaskActivity } from '@projectflow/shared';

import { fetchTaskActivities } from './api';

export function useTaskActivities(taskId: string, page = 1, pageSize = 20) {
  return useQuery<PaginatedWithMeta<TaskActivity>>({
    queryKey: ['task-activities', taskId, page, pageSize],
    queryFn: () => fetchTaskActivities(taskId, page, pageSize),
    enabled: taskId.length > 0,
  });
}
