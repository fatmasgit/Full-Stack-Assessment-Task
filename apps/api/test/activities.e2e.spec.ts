import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { OrganizationRole, ProjectRole } from '@projectflow/shared';

import { createTestApp, resetDatabase } from './utils/test-app';
import {
  addOrganizationMember,
  addProjectMember,
  authHeader,
  createOrganization,
  createProject,
  registerUser,
  type TestUser,
} from './utils/fixtures';

describe('Activities', () => {
  let app: INestApplication;
  let connection: Connection;

  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let projectId: string;

  beforeAll(async () => {
    ({ app, connection } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(connection);

    owner = await registerUser(app, 'Ammar Yaser', 'ammar@example.com');
    member = await registerUser(app, 'Magd Ali', 'magd@example.com');
    outsider = await registerUser(app, 'Outside User', 'outside@example.com');

    const organizationId = await createOrganization(
      connection,
      'Acme Software',
      'acme-software',
      owner.id,
    );

    await addOrganizationMember(connection, organizationId, owner.id, OrganizationRole.OWNER);

    await addOrganizationMember(connection, organizationId, member.id, OrganizationRole.MEMBER);

    projectId = await createProject(
      connection,
      organizationId,
      'Internal Platform',
      'ENG',
      owner.id,
    );

    await addProjectMember(connection, projectId, member.id, ProjectRole.MEMBER);
  });

  it('creates an activity when the assignee changes', async () => {
    const createResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({
        title: 'Activity task',
      })
      .expect(201);

    const taskId = createResponse.body.id;

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(member))
      .send({
        assigneeId: member.id,
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activities`)
      .set('Authorization', authHeader(member))
      .expect(200);

    expect(response.body.total).toBe(1);

    expect(response.body.items[0]).toMatchObject({
      type: 'TASK_ASSIGNEE_CHANGED',
      taskId,
      actor: {
        id: member.id,
      },
      metadata: {
        from: null,
        to: {
          id: member.id,
        },
      },
    });
  });

  it('creates the appropriate activity when a task is unassigned', async () => {
    const createResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({
        title: 'Unassignment activity',
      })
      .expect(201);

    const taskId = createResponse.body.id;

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(member))
      .send({
        assigneeId: member.id,
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(member))
      .send({
        assigneeId: null,
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activities`)
      .set('Authorization', authHeader(member))
      .expect(200);

    expect(response.body.total).toBe(2);

    expect(response.body.items[0]).toMatchObject({
      type: 'TASK_ASSIGNEE_CHANGED',
      taskId,
      metadata: {
        from: {
          id: member.id,
        },
        to: null,
      },
    });
  });

  it('prevents an unauthorized user from accessing task activity', async () => {
    const createResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({
        title: 'Private activity',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/tasks/${createResponse.body.id}/activities`)
      .set('Authorization', authHeader(outsider))
      .expect(403);
  });
});
