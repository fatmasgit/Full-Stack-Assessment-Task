'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ProjectMemberEntry } from '@projectflow/shared';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useUpdateTaskAssignee } from '../hooks';

interface TaskAssigneeSelectProps {
    taskId: string;
    projectId: string;
    assigneeId: string | null;
    members: ProjectMemberEntry[];
    currentUserId: string;
    canManage: boolean;
}

export function TaskAssigneeSelect({
    taskId,
    projectId,
    assigneeId,
    members,
    currentUserId,
    canManage,
}: TaskAssigneeSelectProps) {
    const [search, setSearch] = useState('');

    const updateAssignee = useUpdateTaskAssignee(taskId, projectId);

    const filteredMembers = useMemo(() => {
        const searchValue = search.trim().toLowerCase();

        if (!searchValue) {
            return members;
        }

        return members.filter((member) =>
            member.user.name.toLowerCase().includes(searchValue),
        );
    }, [members, search]);

    const isPending = updateAssignee.isPending;

    return (
        <div className="space-y-1.5">
            <Select
                value={assigneeId ?? 'unassigned'}
                disabled={isPending}
                onValueChange={(value) => {
                    updateAssignee.mutate(
                        value === 'unassigned' ? null : value,
                        {
                            onError: (error) => {
                                toast.error(error.message);
                            },
                        },
                    );
                }}
            >
                <SelectTrigger
                    aria-label="Task assignee"
                    aria-disabled={isPending}
                >
                    <SelectValue placeholder="Unassigned" />
                </SelectTrigger>

                <SelectContent>
                    {members.length > 0 && (
                        <div className="p-2">
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                onKeyDown={(event) => event.stopPropagation()}
                                placeholder="Search members..."
                                aria-label="Search project members"
                                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    )}

                    <SelectItem
                        value="unassigned"
                        disabled={!canManage && assigneeId !== currentUserId}
                    >
                        Unassigned
                    </SelectItem>

                    {filteredMembers.map((member) => {
                        const isCurrentUser = member.user.id === currentUserId;

                        return (
                            <SelectItem
                                key={member.user.id}
                                value={member.user.id}
                                disabled={!canManage && !isCurrentUser}
                            >
                                {member.user.name}
                            </SelectItem>
                        );
                    })}

                    {members.length === 0 && (
                        <p className="px-2 py-2 text-[13px] text-muted-foreground">
                            No project members available.
                        </p>
                    )}

                    {members.length > 0 && filteredMembers.length === 0 && (
                        <p className="px-2 py-2 text-[13px] text-muted-foreground">
                            No members found.
                        </p>
                    )}
                </SelectContent>
            </Select>

            {!canManage && (
                <p className="text-[12px] text-muted-foreground">
                    You can only assign tasks to yourself.
                </p>
            )}

            {isPending && (
                <p className="text-[12px] text-muted-foreground">
                    Updating assignee...
                </p>
            )}
        </div>
    );
}