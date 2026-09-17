import type { TaskActivity } from '@projectflow/shared';

import { Avatar } from '@/components/ui/avatar';
import { formatDate } from '@/lib/format';

interface ActivityItemProps {
    activity: TaskActivity;
}

export function ActivityItem({ activity }: ActivityItemProps) {
    return (
        <div className="flex gap-3">
            <Avatar user={activity.actor} size="sm" />

            <div className="min-w-0 space-y-1">
                <p className="text-[13px] text-foreground">
                    <span className="font-medium">{activity.actor.name}</span>{' '}
                    {getActivityText(activity)}
                </p>

                <p className="text-[12px] text-muted-foreground">
                    {formatDate(activity.createdAt)}
                </p>
            </div>
        </div>
    );
}

function getActivityText(activity: TaskActivity): React.ReactNode {
    switch (activity.type) {
        case 'TASK_ASSIGNEE_CHANGED': {
            const from = activity.metadata.from?.name ?? 'Unassigned';
            const to = activity.metadata.to?.name ?? 'Unassigned';

            return (
                <>
                    changed the assignee{' '}
                    <span className="text-primary">from</span> {from}{' '}
                    <span className="text-primary">to</span> {to}
                </>
            );
        }

        case 'TASK_STATUS_CHANGED':
            return 'changed the task status';

        default:
            return 'updated the task';
    }
}