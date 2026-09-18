# Assessment Notes

## Architecture

### Application Structure

ProjectFlow is a TypeScript monorepo managed with pnpm workspaces and Turborepo.

The main applications are:

* `apps/api` — NestJS backend
* `apps/web` — Next.js frontend

Shared types and constants are kept in `packages/shared`.

The backend is organized into NestJS modules such as:

* Authentication
* Users
* Organizations
* Organization Members
* Projects
* Project Members
* Tasks
* Comments
* Activities

The frontend uses Next.js App Router with React and TanStack Query for server state management.

### Where Business Logic Lives

Most business logic lives in the backend service layer.

Controllers are responsible mainly for receiving HTTP requests, validating/parsing input, getting the current user, and calling the appropriate service method.

For example, `TasksController` receives the task request and calls methods such as:

* `tasksService.create()`
* `tasksService.update()`
* `tasksService.updateAssignee()`
* `tasksService.updateStatus()`
* `tasksService.remove()`

The business rules are then handled inside `TasksService`.

Database access is handled through Mongoose models.

### Frontend and Backend Communication

The Next.js frontend communicates with the NestJS API through HTTP requests.

Authentication uses a JWT bearer token, which is sent with authenticated API requests.

TanStack Query is used on the frontend to manage server state, including fetching, caching, updating, and invalidating task and activity data.

React Hook Form and Zod are used for form handling and client-side validation.

Backend DTO validation provides the final validation boundary before business logic is executed.

## Authentication and Authorization

### Authentication

Authentication is implemented using JWT bearer tokens.

The authenticated user is made available to controllers through the `CurrentUser` decorator.

For example, task endpoints use:

```ts
@CurrentUser('id') userId: string
```

The controller converts the user ID to an ObjectId before passing it to the service.

### Backend Authorization

Authorization is mainly handled on the backend through `ProjectAccessService`.

The important functions include:

* `assertCanView()` — verifies that the user can access the project.
* `assertCanManage()` — verifies that the user has permission to manage the project.
* `canManage()` — determines whether the resolved project access allows management operations.

Project access is based on organization and project membership.

Organization owners and admins have access to projects in their organization, while other users need an appropriate project membership.

Task-specific rules are then applied on top of project access.

For example, `TasksService.update()` first checks project access and then checks whether the user is the task creator or has project management permissions.

For assignment, `updateAssignee()` also verifies that the selected assignee is a member of the task's project. This prevents assigning a task to an unrelated user who may exist in the organization.

This separation is important because authentication answers **who the user is**, while authorization determines **what that user is allowed to do**.

### Frontend Authorization

The frontend uses the authenticated user and API responses to control what actions are available in the UI.

For example, the UI can decide whether to show task editing or assignment controls based on the user's available permissions and role.

However, frontend authorization is only a UI-level restriction. The backend remains the source of truth and must perform the actual authorization checks before modifying data.

This is important because a user could bypass frontend restrictions and call the API directly.

## Main Entity Relationships

The main relationships are:

```text
Organization
    │
    ├── OrganizationMember ── User
    │
    └── Project
          │
          ├── ProjectMember ── User
          │
          └── Task
                │
                └── Comment
```

A task belongs to one project and has a `createdBy` user.

A task can also have a nullable `assignee`.

`createdBy` and `assignee` represent different concepts:

* `createdBy` — the user who created the task.
* `assignee` — the project member currently responsible for the task.

Activities record important changes to tasks, such as assignee changes.

---

## Observations

### 1. Task and Activity Consistency

**What I noticed:** When a task change should create an activity, the task update and activity creation need to happen together.

**Why it could be a problem:** If one operation succeeds and the other fails, the task data and activity history can become inconsistent.

**Decision:** Fix now by using a MongoDB transaction so both operations succeed or fail together.

### 2. Optimistic Concurrency Is Not Enabled

**What I noticed:** The `Task` schema uses `@Schema({ timestamps: true, collection: 'tasks' })` without enabling Mongoose's `optimisticConcurrency` option.

**Why it could be a problem:** If two users update the same task at nearly the same time, both can work with an older version of the task. The later save may overwrite changes made by the first user without detecting that the task was already modified.

**Decision:** Consider enabling optimistic concurrency or using targeted atomic updates to detect or prevent conflicting concurrent task updates.

### 3. Overlapping Task Update Paths

**What I noticed:** There are two ways to update a task. The general `updateTask` endpoint allows the task creator to update fields such as title, description, status, and priority, while dedicated endpoints handle specific features, such as `updateStatus`.

**Why it could be a problem:** This means the same field, such as status, can be changed through different endpoints with different authorization rules depending on who is making the request.

**Decision:** Refactor later by choosing either whole-task updates or dedicated feature updates to keep the business rules consistent.

### 4. Pagination Performance at Scale

**What I noticed:** Task and activity listing use `skip()` and `limit()` for pagination.

**Why it could be a problem:** With very large datasets, high `skip` values can become less efficient.

**Decision:** Keep it for now because the current dataset is small. Consider cursor-based pagination if the data volume grows significantly.

### 5. Delete Flow Is Not Transactional

**What I noticed:** `remove()` deletes the task and its comments in parallel using `Promise.all()` instead of a transaction.

**Why it could be a problem:** If one operation succeeds and the other fails, the task and its related comments can become inconsistent.

**Decision:** Fix later by using a MongoDB transaction for the related deletions.

---

## Code Review

* **Authorization:** `userId` is not used to verify that the current user is allowed to assign the task.
* **Business rules:** The assignee is not verified as a member of the task's project.
* **Data consistency:** The assignment operation does not create an activity record for the change.
* **Transaction safety:** Updating the task and creating the activity should happen in the same transaction so the task and activity history cannot become inconsistent.
* **Error handling:** `NotFoundException()` is empty and does not clearly explain what was not found.

### Database Indexes

Activity queries are scoped by `taskId` and ordered by `createdAt`. The current index supports this query pattern. At larger scale, I would profile index usage and adjust indexes based on the queries that are actually used.

### Cursor vs Offset Pagination

The current activity listing uses `skip()` / `limit()`, which is reasonable at the current size. As activity histories become much larger, I would replace this with cursor pagination using `createdAt` and `_id` as a stable cursor, allowing MongoDB to continue from the last activity instead of skipping large numbers of records.

### Query Patterns

The current implementation avoids N+1 queries by loading the related actor, previous assignee, and new assignee users in batches. At larger scale, I would keep this approach and select only the fields needed by the activity response. If profiling shows that these lookups become a bottleneck, I would consider MongoDB `$lookup` or denormalizing the data needed by the activity feed, for example:

```ts
{
  actorId,
  actorName,
  fromUserId,
  fromUserName,
  toUserId,
  toUserName
}
```

This would reduce the need for additional user lookups when reading the activity feed.

### Data Growth and Retention

Activity records are created for task changes and will continuously increase as the system is used. At larger scale, I would define how long detailed activity needs to remain in the main collection and consider removing or moving older records based on the product's retention requirements.

