import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PaginatedWithMeta, TaskActivity } from '@projectflow/shared';
import { ActivityType } from '@projectflow/shared';
import { type ClientSession, Model, Types } from 'mongoose';

import { toUserSummary } from '../common/utils/serialize';
import { getPaginationMeta } from '../common/utils/pagination';
import { ProjectAccessService } from '../projects/project-access.service';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema';
import { UsersService } from '../users/users.service';

import { ListTaskActivitiesQueryDto } from './dto/list-task-activities.dto';
import { Activity, type ActivityDocument } from './schemas/activities.schema';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,

    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,

    private readonly projectAccessService: ProjectAccessService,

    private readonly usersService: UsersService,
  ) {}

  async createTaskAssigneeChanged(
    taskId: Types.ObjectId,
    actorId: Types.ObjectId,
    from: Types.ObjectId | null,
    to: Types.ObjectId | null,
    session: ClientSession,
  ): Promise<void> {
    await this.activityModel.create(
      [
        {
          type: ActivityType.TASK_ASSIGNEE_CHANGED,
          actorId,
          taskId,
          metadata: {
            from,
            to,
          },
        },
      ],
      { session },
    );
  }

  async findByTask(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    query: ListTaskActivitiesQueryDto,
  ): Promise<PaginatedWithMeta<TaskActivity>> {
    const task = await this.taskModel.findById(taskId).exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.projectAccessService.assertCanView(task.projectId, userId);

    const { page, pageSize } = query;

    const [activities, total] = await Promise.all([
      this.activityModel
        .find({ taskId })
        .sort({ createdAt: -1 })
        .skip(query.skip)
        .limit(pageSize)
        .lean()
        .exec(),

      this.activityModel.countDocuments({ taskId }).exec(),
    ]);

    const userIds = new Set<string>();

    for (const activity of activities) {
      userIds.add(activity.actorId.toString());

      if (activity.metadata.from) {
        userIds.add(activity.metadata.from.toString());
      }

      if (activity.metadata.to) {
        userIds.add(activity.metadata.to.toString());
      }
    }

    // Batch-load all users in one query to avoid N+1 queries.
    const users = await this.usersService.findManyByIds(
      Array.from(userIds).map((id) => new Types.ObjectId(id)),
    );

    const usersMap = new Map(users.map((user) => [user._id.toString(), toUserSummary(user)]));

    const items: TaskActivity[] = activities.map((activity) => ({
      id: activity._id.toString(),
      type: activity.type,
      actor: usersMap.get(activity.actorId.toString()) ?? DELETED_USER,
      taskId: activity.taskId.toString(),
      metadata: {
        from: activity.metadata.from
          ? (usersMap.get(activity.metadata.from.toString()) ?? DELETED_USER)
          : null,
        to: activity.metadata.to
          ? (usersMap.get(activity.metadata.to.toString()) ?? DELETED_USER)
          : null,
      },
      createdAt: activity.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      ...getPaginationMeta(page, pageSize, total),
    };
  }
}

const DELETED_USER = {
  id: '',
  name: 'Unknown user',
  email: '',
  avatarUrl: null,
};
