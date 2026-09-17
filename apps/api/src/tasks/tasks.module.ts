import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivitiesModule } from '../activities/activities.module';
import { Comment, CommentSchema } from '../comments/schemas/comment.schema';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectMembersModule } from '../project-members/project-members.module';
import { UsersModule } from '../users/users.module';

import { TaskCounter, TaskCounterSchema } from './schemas/task-counter.schema';
import { Task, TaskSchema } from './schemas/task.schema';

import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: TaskCounter.name, schema: TaskCounterSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
    ActivitiesModule,
    ProjectsModule,
    ProjectMembersModule,
    UsersModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService, MongooseModule],
})
export class TasksModule {}
