import { IsMongoId, IsOptional } from 'class-validator';

export class UpdateTaskAssigneeDto {
  @IsOptional()
  @IsMongoId()
  assigneeId?: string | null;
}
