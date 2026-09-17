# Production Bug Report

## Root Cause

The `PATCH /tasks/:taskId/status` controller did not pass the authenticated user's ID to `TasksService.updateStatus()`. As a result, the service updated a task's status without checking whether the user had permission to manage its project.

The authorization system distinguishes:
- `assertCanView()` — access to view a project and its tasks.
- `assertCanManage()` — permission to modify a project's tasks.

Status updates are a modification, so they require `assertCanManage()`. 
Every other task endpoint (update, assignee change, delete) already had this check correctly — only status update was missing it, and that's what caused the bug.

## Impact

An authenticated user with no access to a project could change the status of its tasks (e.g. `IN_REVIEW` → `DONE`).

Reproduced with the `Outside User` account (no org/project membership):
- Task: `WEB-3` (`6aa8283bf67023175ddc16a0`), Project: `Customer Portal` (`6aa8283bf67023175ddc1691`), original status `IN_REVIEW`.
- Before the fix, this user changed the status to `DONE` and got `200 OK`.

## Reproduction

1. Log in as `outside@example.com` / `Password123!` and get an auth token.
2. `PATCH /tasks/6aa8283bf67023175ddc16a0/status` with body `{ "status": "DONE" }`.
3. Before the fix: `200 OK`, status changed `IN_REVIEW` → `DONE`, confirming the bug.

As a check, the same user was tested against the regular task update and assignee update endpoints — both correctly returned `403 Forbidden`, confirming the gap was isolated to status update.

## Fix

The controller now passes the authenticated user's ID to `TasksService.updateStatus()`, which verifies permission before making any change:

```javascript
const { project } = await this.projectAccessService.assertCanManage(
  task.projectId,
  userId,
);
```

The status is only changed after this check succeeds. After the fix, the same request from `Outside User` returns `403 Forbidden` ("You do not have access to this project") and the task is not modified.

## Regression Prevention

Added a test in `apps/api/test/tasks.e2e.spec.ts`: a valid project member creates a task, then `Outside User` attempts a status change. Verifies the response is `403`, the status is unchanged, and it remains `TODO`.

Full test suite after the fix: 4 suites passed, 21 tests passed, 0 failures.
