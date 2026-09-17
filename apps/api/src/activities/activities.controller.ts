import { Controller, Get, Param, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toObjectId } from '../common/utils/object-id';

import { ActivitiesService } from './activities.service';
import { ListTaskActivitiesQueryDto } from './dto/list-task-activities.dto';

@Controller('tasks')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get(':taskId/activities')
  findByTask(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListTaskActivitiesQueryDto,
  ) {
    return this.activitiesService.findByTask(
      toObjectId(taskId, 'task id'),
      toObjectId(userId, 'user id'),
      query,
    );
  }
}
