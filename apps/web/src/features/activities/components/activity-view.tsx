'use client';

import { ActivityItem } from './activity-item';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskActivities } from '../hooks';

interface ActivityViewProps {
  taskId: string;
}

export function ActivityView({ taskId }: ActivityViewProps) {
  const { data, isPending, isError, error } = useTaskActivities(taskId);

  if (isPending) {
    return (
      <section aria-label="Activity">
        <h2 className="pb-4 text-sm font-semibold text-foreground">
          Activity
        </h2>

        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label="Activity">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Activity
        </h2>

        <p className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-[13px] text-danger">
          {error.message}
        </p>
      </section>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <section aria-label="Activity">
        <h2 className="pb-4 text-sm font-semibold text-foreground">
          Activity
        </h2>

        <p className="text-[13px] italic text-subtle-foreground">
          No activity yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Activity">
      <h2 className="pb-4 text-sm font-semibold text-foreground">
        Activity
      </h2>

      <div className="space-y-4">
        {data.items.map((activity) => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>
    </section>
  );
}