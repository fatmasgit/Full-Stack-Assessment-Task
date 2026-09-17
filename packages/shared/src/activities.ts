import type { UserSummary } from './api';

export enum ActivityType {
  TASK_ASSIGNEE_CHANGED = 'TASK_ASSIGNEE_CHANGED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
}

export interface TaskActivity {
  id: string;
  type: ActivityType;
  actor: UserSummary;
  taskId: string;
  metadata: {
    from: UserSummary | null;
    to: UserSummary | null;
  };
  createdAt: string;
}

export const ACTIVITY_TYPES = Object.values(ActivityType);
