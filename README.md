# ProjectFlow

## Implemented Assessment Features

### Task Assignment

Implemented task assignment by adding a nullable `assignee` field to the existing task model.

The implementation:

1. Checks project access using `ProjectAccessService`.
2. Checks `canView` and `canManage` for the project.
3. Checks the current user's project and organization role.
4. Validates that the assignee exists.
5. Validates that the assignee is a member of the task's project.
6. Supports assigning and unassigning a task.
7. Invalidates the relevant TanStack Query data after assignment or unassignment so the task and activity history are refreshed in the UI.

`createdBy` remains the user who created the task, while `assignee` represents the user responsible for the task.

### Role-Based Assignment

Implemented assignment permissions using the existing ProjectFlow roles.

In the frontend, `useCurrentUser()` and `useProjects()` are used to determine the current user's organization role and project information.

The task view uses these values to calculate `canManage`, which controls whether the assignment UI is enabled or disabled.

`useProjectMembers()` loads the members of the current project for the assignee selector, while `useTask()` loads the current task and assignee.

`TaskAssigneeSelect` receives the project members, current user ID, current assignee, and `canManage`.

The backend also checks the user's access and permissions before allowing the assignment.

### Activity History

Implemented activity history for task changes, including assignee changes.

Activity records contain:

* Actor
* Activity type
* Previous assignee
* New assignee
* Task
* Timestamp

Activity history supports pagination and related user resolution.

After assigning or unassigning a task, the relevant TanStack Query data is invalidated so the activity history is refreshed and the new activity appears in the UI.

### Transactional Task and Activity Updates

Implemented task assignment and activity creation inside the same MongoDB transaction.

```text
Update task
     +
Create activity
     ↓
MongoDB transaction
     ↓
Commit
```

If either operation fails, the transaction is rolled back.

### Atomic Task Number Generation

Implemented an atomic MongoDB counter for task number generation.

The counter uses an atomic increment so concurrent task creation requests receive unique task numbers.

Duplicate-key handling is also used to handle concurrent creation races.

### Frontend Assignee Selector

Implemented the assignee selector in the task view.

`useProjectMembers()` loads the members of the current project, so only project members are available for assignment.

`useCurrentUser()` and `useProjects()` are used to determine the user's roles and calculate `canManage`.

The `canManage` value is passed to `TaskAssigneeSelect` to enable or disable assignment actions.

After an assignment or unassignment mutation, the relevant queries are invalidated so the task and activity data are refreshed.

### Avoiding N+1 Queries

Implemented batched user loading for activity history.

Actor, previous assignee, and new assignee IDs are collected and loaded in batches instead of querying users separately for every activity.

### Pagination Metadata

Implemented the reusable `getPaginationMeta()` helper.

The API returns:

* `page`
* `pageSize`
* `pages`
* `hasMore`

Activity history uses the returned pagination metadata on the frontend.

The current implementation uses `skip()` and `limit()`.

## Testing

Implemented tests covering the assessment features.

The API test suite contains **30 tests across 5 test suites**.

Tests cover:

* Task creation
* Task assignment and unassignment
* Task updates
* Task status updates
* Authorization
* Project membership
* Activity history
* Activity pagination
* Actor and assignee resolution
* Concurrent task creation
* Atomic task number generation
* Transaction-based updates
* Production bug regression

### Task Tests — 13 tests

Cover task creation, updates, assignment, unassignment, authorization, status changes, project membership, and concurrent task creation.

### Activity Tests — 3 tests

Cover activity creation, retrieval, related user resolution, and pagination.

### Production Bug Test — `productionBug()`

Added a regression test for the production bug to verify the corrected authorization behavior.

The API tests use an in-memory MongoDB replica set for transaction-based tests.
