# Assessment Notes

## Architecture

*Scope note: the only source file I was given is `tasks.service.ts`. There's no controller,
schema, guard, or frontend code in front of me, so several answers below are inferences from
that one file rather than confirmed facts. I've marked which is which.*

**How is the application structured, and what are the major modules?**
It's a NestJS backend on MongoDB/Mongoose, organized by domain feature modules rather than by
technical layer. From the imports alone I can see at least: `tasks`, `projects` (with a
dedicated `project-access` sub-concern), `project-members`, `users`, `comments`, and
`activities`, plus a `common` module for shared serialization helpers (`toUserSummary`). Each
module owns its own Mongoose schema (`Task`, `TaskCounter`, `Project`, `Comment`) and exposes a
service that other modules call into rather than reaching into each other's models directly —
`TasksService` depends on `ProjectAccessService`, `ProjectMembersService`, `UsersService`, and
`ActivitiesService` as injected collaborators, not on their underlying Mongo collections.
Types like `Paginated`, `TaskDetail`, and `TaskSummary` come from a `@projectflow/shared`
package, which strongly suggests this is a monorepo with a package dedicated to types shared
between the backend and (presumably) the frontend — a decent way to keep API contracts in sync,
assuming the frontend actually imports from it rather than duplicating shapes (unconfirmed,
no frontend visible).

**Where does business logic live?**
In the service layer, not in controllers or schemas — `TasksService` is where all task rules
(who can edit what, how keys are generated, when an activity gets logged) actually live.
Authorization *decisions* are centralized in `ProjectAccessService` (`assertCanView`,
`assertCanManage`, and a `canManage(access)` helper), which `TasksService` calls rather than
reimplementing role checks inline — that's a good separation. That said, some business logic is
still duplicated/scattered inline in `TasksService` itself (e.g., "is this user the task
creator", "is this user the current assignee" are computed ad hoc per method rather than
centralized), and the per-project task numbering scheme (`TaskCounter`, key format
`${project.key}-${number}`) is embedded directly in `TasksService.create` rather than pulled out
into its own module.

**How does the frontend talk to the backend, and how is server state handled?**
I can't confirm this from what I have — there's no controller or frontend code in front of me.
What I can infer: the return types (`Paginated<TaskSummary>`, `TaskDetail`) are shaped like a
typed REST (or RPC-style) response contract coming from the shared package, which implies the
frontend consumes strongly-typed responses rather than loosely-typed JSON. I'd want to see the
controller layer and the frontend's data-fetching code (e.g., is it React Query/SWR, or
hand-rolled fetch + local state?) before saying anything more concrete here — this is the
weakest part of my answer given the available evidence.

**How are authentication and authorization implemented?**
Authentication isn't visible in this file — no guard, strategy, or `@UseGuards` decorator is
shown, so I'm assuming (standard for NestJS) it's handled by a global or route-level guard
(e.g., JWT) upstream of these service methods; every method here simply receives an already
-resolved `userId`. Authorization is role-based and project-scoped, and happens in two layers:
coarse-grained checks via `ProjectAccessService.assertCanView`/`assertCanManage` (throwing if the
user isn't at least a viewer, or isn't a manager, of the project), and finer-grained inline
checks inside `TasksService` itself (e.g. "manager OR the task's creator" for `update`,
"manager OR currently-assigned self" for unassigning). The finer-grained rules aren't
centralized, so understanding "who can do X to a task" means reading each method individually
rather than consulting one policy — see Observation 1 below for where that's already caused an
inconsistency.

**How are the main entities related?**
- `Project` 1—* `Task` (`task.projectId`)
- `Project` 1—* `ProjectMember` (role per user per project — inferred from
  `projectMembersService.findRole`)
- `Project` 1—1 `TaskCounter` (per-project atomic sequence used to generate `key`, e.g. `PROJ-42`)
- `Task` *—1 `User` as creator (`createdBy`), *—0..1 `User` as `assignee`
- `Task` 1—* `Comment` (`comment.taskId`), cascade-deleted when the task is removed
- `Task` 1—* `Activity` (audit entries — at least assignee-change events, capturing actor,
  previous, and new assignee)
- `User` is referenced by id everywhere (`createdBy`, `assignee`, activity actor) and hydrated
  in bulk on read via `UsersService.findManyByIds`, i.e. users live in their own collection and
  are denormalized-by-reference rather than embedded.

## Observations

### 1. A task's status can be changed through a path that bypasses the intended permission check
**What I noticed:** `updateStatus()` requires `assertCanManage` — only project managers may call
it. But the generic `update()` method accepts `dto.status` too, and its guard is
`canManage(access) || isCreator` — a non-manager task *creator* can change status simply by
calling `update()` (e.g. `PATCH /tasks/:id` with `{ status: ... }`) instead of the dedicated
status endpoint.
**Why it's a problem:** this is a real authorization inconsistency, not just a style issue — the
codebase clearly intends status changes to be manager-only (that's the entire reason
`updateStatus` exists as a separate, more restrictive method), and `update()` quietly
undermines it. Anyone who knows the generic update endpoint accepts a `status` field can bypass
the intended workflow control (e.g., a task creator moving their own task to "Done" without
manager sign-off, if that's a real workflow gate for this team).
**Fix now or later:** now. It's a genuine authorization bug with a clear one-line fix (drop
`status` handling from `update()`, or require `assertCanManage` there too), and it's the kind of
thing that gets worse the longer two divergent code paths exist for the same field.

### 2. `remove()` deletes across two collections without a transaction
**What I noticed:** `remove()` runs `commentModel.deleteMany({ taskId })` and `task.deleteOne()`
concurrently via `Promise.all`, with no Mongo session/transaction.
**Why it's a problem:** if one of the two deletes fails after the other has already committed,
you're left with either orphaned comments pointing at a task that no longer exists, or a
"deleted" task whose comments survive. Contrast this with `updateAssignee`, which *does* wrap
its multi-document write (task save + activity log) in a session — the codebase already knows
how to do this correctly, it's just not applied consistently.
**Fix now or later:** could go either way depending on how often tasks are actually deleted in
this product, but I'd lean towards now-ish rather than backlog: it's a small, mechanical change
(wrap in `session.withTransaction`, same pattern as `updateAssignee`) and data-integrity bugs
in a delete path are the kind that are only noticed once someone's data is already
inconsistent.

### 3. `TaskCounter` initialization has a narrow but real race window
**What I noticed:** `create()` does a check-then-act sequence: look for an existing counter,
and if none exists, derive a starting value from the *current* highest task number and try to
create the counter document, catching a duplicate-key error (`code 11000`) as the "someone else
already created it" case. That recovery path is a reasonable pattern, but it depends entirely on
`TaskCounter` having a unique index on `projectId` — which isn't visible in this file (no schema
shown).
**Why it's a problem:** if that unique index doesn't actually exist, two concurrent
first-ever-task creations for the same project could both succeed in creating a `TaskCounter`
document, and the subsequent `findOneAndUpdate` increments could operate against two different
counter documents — producing duplicate task keys (two tasks both called `PROJ-1`, say). A
duplicate human-facing business key is a bad bug to discover after the fact, since by the time
someone notices, other data (links, comments, notifications) may already reference the
ambiguous key.
**Fix now or later:** now, but as a five-minute verification rather than a redesign — confirm
the unique index exists on `TaskCounter.projectId` in the schema. If it's there, this concern is
moot and the existing retry logic is fine. If it isn't, add it; the application-level
try/catch already assumes it.

### 4. No optimistic concurrency control on task writes (minor, worth knowing about)
**What I noticed:** `update()`, `updateStatus()`, and `updateAssignee()` all follow a
load-mutate-save pattern with no version check (`task.save()` with no guard against a
concurrent write that happened in between the load and the save).
**Why it's a problem:** two users editing the same task around the same time will silently
overwrite each other — last write wins, with no conflict surfaced to either user. For a
collaborative tool where multiple people can touch the same task, that's a plausible source of
"my edit disappeared" bug reports.
**Fix now or later:** later. Mongoose's default `__v` versioning could catch this relatively
cheaply if wired up (`optimisticConcurrency` on the schema + handling the resulting
`VersionError`), but it's a UX/polish concern rather than a correctness or security one, and I'd
want to see actual evidence of concurrent-edit collisions being a problem before prioritizing
it over the items above.

## Code Review

Reviewing this as a PR against the existing `TasksService` (which already has a working
`updateAssignee` method). The submitted `assignTask` reimplements the same feature but drops
almost every guarantee the current codebase relies on. I would not approve this as-is.

```ts
async assignTask(taskId: string, assigneeId: string, userId: string) {
  const task = await this.taskModel.findById(taskId);
  if (!task) { throw new NotFoundException(); }
  const user = await this.userModel.findById(assigneeId);
  if (!user) { throw new NotFoundException(); }
  task.assignee = user._id;
  await task.save();
  return task;
}
```

### 1. Authorization is completely missing (blocker)
`userId` is accepted as a parameter but never used anywhere in the function body. That means:

- There's no call to `projectAccessService` to confirm the caller can even see the project.
- There's no `canManage` check, so **any authenticated user can reassign any task in any
  project to anyone**, including tasks they have no relationship to.
- The existing business rule — a non-manager may only assign a task to *themselves*, and can
  only unassign if they are the current assignee — is gone entirely.

This is a straightforward authZ bypass and the most serious issue in the diff. I'd block the PR
on this alone. The fix is to load `access = await projectAccessService.assertCanView(task.projectId, userId)`
and gate manager-only behavior behind `canManage(access)`, mirroring `updateAssignee`.

### 2. No check that the assignee is a project member (business rule)
The current implementation only confirms the target `assigneeId` corresponds to *some* user in
the system, not that they belong to the project the task lives in. The existing service enforces
this via `projectMembersService.findRole(...)` and rejects with a `ForbiddenException` if the
role is `null`. Without this, tasks can be assigned to people with no access to the project at
all, which will confuse permissions elsewhere (e.g. that user won't be able to view the task they
were "assigned").

### 3. No support for unassigning
The DTO pattern elsewhere (`UpdateTaskAssigneeDto`) treats `assigneeId: null` as a valid,
meaningful "unassign" request. This function requires `assigneeId` to resolve to a real user, so
there's no way to clear an assignee. That's a functional regression, not just a style nit.

### 4. No audit trail / activity log, and no transaction
`updateAssignee` wraps the save and an `activitiesService.createTaskAssigneeChanged(...)` call in
a Mongo session/transaction so the task update and its activity record either both happen or
neither does. `assignTask` does neither — the change is silent (no history of who reassigned what
and when) and, if an activity log call were added later without a transaction, we'd risk a task
being reassigned with no corresponding audit entry on partial failure.

### 5. Untrusted/unvalidated input types
`taskId` and `assigneeId` are typed as `string` and passed straight into `findById`. Mongoose
will throw a `CastError` on a malformed ObjectId, which isn't caught here — that surfaces as an
unhandled 500 instead of a clean 400. The rest of the service takes `Types.ObjectId` and relies on
the controller/DTO layer to validate and convert; this function breaks that boundary and should
either accept `Types.ObjectId` or validate the string explicitly.

### 6. No idempotency / no-op short-circuit
If the task is already assigned to `assigneeId`, this still writes to the DB and (once audit
logging is added) would generate a spurious "assignee changed" activity. `updateAssignee` checks
`sameAssignee` up front and returns early. Minor compared to the issues above, but worth aligning
for consistency and to avoid noisy activity feeds.

### 7. Leaky return value
The function returns the raw Mongoose `TaskDocument` rather than a serialized `TaskDetail`
(as every other method in `TasksService` does via `toDetail`/`toSummaries`). That exposes internal
fields (`__v`, raw `ObjectId`s, etc.) directly through the API and produces a response shape that's
inconsistent with the rest of the tasks endpoints — clients would have to special-case this
route.

### 8. Sequential lookups
`taskModel.findById` and `userModel.findById` don't depend on each other and are awaited one
after another. Not a big deal at this scale, but `Promise.all([...])` is the pattern used
elsewhere in this file (e.g. `toSummaries`) and would shave a round trip.

### 9. Generic error messages
Both `NotFoundException()` calls omit a message. The rest of the service is specific
(`'Task not found'`, `'The assignee must be a member of this project'`), which matters for
debugging and for any client that surfaces the error text.

### 10. Naming/signature inconsistency
Every mutating method in this service takes a typed DTO (`UpdateTaskAssigneeDto`, etc.) and
`Types.ObjectId` params, and is named after the resource action (`updateAssignee`). `assignTask`
with three positional strings is a different convention for the same responsibility — since a
correct version of this already exists as `updateAssignee`, my main question for the engineer
would be **why this wasn't built as a call to (or modification of) that method** rather than a
parallel implementation that quietly drops its guarantees.

### Summary — what I'd ask the engineer to change
1. Use `userId` to authorize: check project access, and enforce that non-managers can only
   assign to themselves / unassign only if currently assigned.
2. Verify the assignee is a member of the task's project, not just any user in the system.
3. Support `assigneeId: null` for unassignment.
4. Wrap the assignment + activity logging in a transaction, and actually record the change.
5. Validate/convert `taskId`/`assigneeId` consistently with the rest of the service.
6. Short-circuit when the assignee is unchanged.
7. Return a serialized `TaskDetail`, not the raw document.
8. Parallelize the two independent lookups.
9. Add descriptive messages to thrown exceptions.
10. Reconcile this with the existing `updateAssignee` — ideally this PR should not exist as a
    second, weaker code path for the same feature.
