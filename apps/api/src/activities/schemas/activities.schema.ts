import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';
import { ACTIVITY_TYPES, ActivityType } from '@projectflow/shared';

export type ActivityDocument = HydratedDocument<Activity>;

@Schema({ timestamps: true, collection: 'activities' })
export class Activity {
  @Prop({ type: String, enum: ACTIVITY_TYPES, required: true })
  type: ActivityType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true })
  taskId: Types.ObjectId;

  @Prop({
    type: {
      from: { type: Types.ObjectId, ref: 'User', default: null },
      to: { type: Types.ObjectId, ref: 'User', default: null },
    },
    required: true,
    _id: false,
  })
  metadata: {
    from: Types.ObjectId | null;
    to: Types.ObjectId | null;
  };

  createdAt: Date;
  updatedAt: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

ActivitySchema.index({ taskId: 1, createdAt: -1 });
