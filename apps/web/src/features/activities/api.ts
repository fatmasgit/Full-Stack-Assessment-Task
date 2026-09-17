import type { PaginatedWithMeta, TaskActivity } from '@projectflow/shared';
import { apiRequest } from '@/lib/api-client';

export function fetchTaskActivities(
  taskId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedWithMeta<TaskActivity>> {
  return apiRequest<PaginatedWithMeta<TaskActivity>>(`/tasks/${taskId}/activities`, {
    query: { page, pageSize },
  });
}
