import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';

export interface TestContext {
  app: INestApplication;
  connection: Connection;
  mongoServer: MongoMemoryReplSet;
}

export async function createTestApp(): Promise<TestContext> {
  const mongoServer = await MongoMemoryReplSet.create({
    replSet: {
      name: 'testset',
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });

  process.env.MONGODB_URI = mongoServer.getUri();

  // Import AppModule only after setting the test MongoDB URI.
  const { AppModule } = await import('../../src/app.module');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  const connection = app.get<Connection>(getConnectionToken());

  const replicaSetStatus = await connection.db!.admin().command({
    replSetGetStatus: 1,
  });

  if (!replicaSetStatus.ok) {
    throw new Error('Test MongoDB connection is not a replica set');
  }

  return {
    app,
    connection,
    mongoServer,
  };
}

export async function resetDatabase(connection: Connection): Promise<void> {
  const collections = await connection.db!.collections();

  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}
