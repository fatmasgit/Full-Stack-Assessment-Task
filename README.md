

# ProjectFlow


## Tech Stack

### Backend

* NestJS
* TypeScript
* MongoDB
* Mongoose
* JWT authentication
* bcryptjs
* Jest
* Supertest
* mongodb-memory-server

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* TanStack Query
* React Hook Form
* Zod
* Radix UI
* Phosphor Icons

### Monorepo

* pnpm workspaces
* Turborepo

## Project Structure

```text
ProjectFlow/
├── apps/
│   ├── api/       # NestJS backend
│   └── web/       # Next.js frontend
│
├── packages/
│   ├── shared/    # Shared types and constants
│   ├── eslint-config/
│   └── tsconfig/
│
├── .env
└── package.json
```

## Main Domain Model

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
                ├── Comment
                └── Activity
```

A task has:

* `projectId`
* `number`
* `key`
* `title`
* `description`
* `status`
* `priority`
* `createdBy`
* nullable `assignee`

`createdBy` and `assignee` represent different concepts. The creator is the user who created the task, while the assignee is the project member currently responsible for the task.

## Authentication and Authorization

Authentication uses JWT bearer tokens.

Authorization is handled primarily on the backend through `ProjectAccessService`.

Authorization considers:

* Organization owner/admin permissions
* Project membership
* Project roles

Task-specific authorization is then applied on top of project access.

For task assignment, the selected assignee must be a member of the task's project. This prevents assigning a task to an unrelated organization user.

Frontend permission checks are used to control which actions are displayed, but the backend remains the source of truth for authorization.

## Implemented Assessment Features

Task Assignment

The existing task model was adapted to support a nullable assignee field. The assignee represents the project member currently responsible for the task, while the existing createdBy field continues to represent the user who created it.

The assignment flow uses the existing project access rules to determine what the current user can do:

The task and its project are resolved.
Project access is checked using the existing canView / canManage rules.
The current user's permission to manage the assignment is verified.
The assignee exists when assigning a user.
The assignee is a member of the task's project.

A task can also be unassigned.

The existing task model and project access system were adapted rather than replaced so the assignment functionality fits the original ProjectFlow data model and authorization structure.

### Activity History

Activity history was added to record important task changes, including assignee changes.

Activity records include information such as:

* Actor
* Activity type
* Previous assignee
* New assignee
* Task
* Timestamp

The activity API supports pagination and returns pagination metadata for the frontend.

### Transactional Task and Activity Updates

Task assignment and its corresponding activity record are handled inside the same MongoDB transaction.

The flow is:

```text
Update task
     +
Create activity
     ↓
MongoDB transaction
     ↓
Commit
```

If either operation fails, the transaction is rolled back. This prevents the task state and activity history from becoming inconsistent.

### Atomic Task Number Counter

Task creation uses an atomic counter to generate task numbers safely when multiple tasks are created concurrently.

The counter uses MongoDB atomic operations rather than relying on a read-then-increment approach.

This prevents concurrent requests from generating duplicate task numbers.

Duplicate-key handling is also used as a safety mechanism for concurrent creation races.

### Frontend Assignee Selector

The task view uses the existing project and task hooks to load the data required for assignment:

* `useTask()` — loads the current task and its existing assignee.
* `useProjectMembers()` — loads the members of the current project to populate the assignee selector.
* `useCurrentUser()` — loads the current user for permission checks.
* `useProjects()` — loads project information used to resolve the user's organization role.

The frontend uses this data to determine whether the current user can manage the task. Project managers and organization owners/admins can manage the assignment.

The `TaskAssigneeSelect` component receives the project members, current user ID, current assignee, and `canManage` state, so the selector only allows assignment actions when the user has the required permissions.

The available assignees are based on project membership rather than simply showing every organization user.

### Frontend Hooks

The frontend uses reusable TanStack Query hooks for server-state operations.

The task-related hooks handle operations such as:

* Fetching project tasks
* Creating tasks
* Updating tasks
* Updating task status
* Updating task assignees
* Invalidating and refetching task data after mutations

Activity history is also loaded through frontend query hooks, with pagination metadata used to control the activity list.

Keeping these operations inside reusable hooks separates API communication, caching, mutation handling, and query invalidation from the UI components.

### Role-Based Access

The implementation respects the existing ProjectFlow organization and project roles.

Authorization is enforced on the backend rather than relying only on frontend controls.

This prevents users from bypassing UI restrictions by directly calling the API.

### Avoiding N+1 Queries

Activity history can reference several users, such as:

* Activity actor
* Previous assignee
* New assignee

Instead of querying the database separately for every activity, the implementation collects the required user IDs and loads the related users in batches.

This avoids an N+1 query pattern when returning activity history.

### Pagination Metadata

The existing pagination implementation was updated to return pagination metadata through a reusable `getPaginationMeta()` helper.

The helper calculates and returns:

* `page` — the current page
* `pageSize` — the number of items per page
* `pages` — the total number of pages
* `hasMore` — whether another page is available

This keeps pagination calculations consistent across the API and gives the frontend the information it needs to control pagination.

The current implementation uses offset pagination with `skip()` and `limit()`.

## Testing

The API test suite contains **30 tests across 5 test suites**.

The tests cover:

* Task creation
* Task assignment and unassignment
* Task updates
* Task status updates
* Task authorization
* Project membership rules
* Activity history
* Activity pagination
* Activity actor and assignee resolution
* Concurrent task creation
* Atomic task number generation
* Transaction-based task and activity updates
* Production bug regression testing

The main test areas include:

### Task Tests — 13 tests

The task test suite covers task creation, updates, assignment, authorization, status changes, and concurrent task creation behavior.

### Activity Tests — 3 tests

The activity tests cover activity creation and retrieval, including the related user information and pagination behavior.

### Production Bug Test — `productionBug()`

A regression test was added for the production bug to verify that the corrected behavior remains protected against the original issue.

The API tests use an in-memory MongoDB replica set so transaction-based functionality can be tested without requiring a separate test database.
