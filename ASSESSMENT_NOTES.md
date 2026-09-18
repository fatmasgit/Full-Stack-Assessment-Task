# Assessment Notes

---

## 🏗️ Architecture

### Structure & modules
NestJS + MongoDB/Mongoose, organized by **domain module** (not by technical layer):
`tasks`, `projects` (+ `project-access`), `project-members`, `users`, `comments`, `activities`,
plus a `common` module for shared helpers. Each module owns its own schema and talks to other
domains only through their services — e.g. `TasksService` depends on `ProjectAccessService`,
`ProjectMembersService`, `UsersService`, `ActivitiesService`, never their raw collections.
Shared types (`Paginated`, `TaskDetail`, `TaskSummary`) live in a `@projectflow/shared` package,
pointing to a monorepo where backend and frontend consume the same contracts.

### Where business logic lives
Almost entirely in the **service layer**, not controllers or schemas. `TasksService` owns the
rules (who can edit what, key generation, when an activity gets logged). Authorization
*decisions* are centralized in `ProjectAccessService`, which `TasksService` calls into rather
than reimplementing — good separation. What's *not* centralized: small per-method checks like
"is this the creator?" are recomputed inline each time instead of living in one policy object.

### Frontend ↔ backend
- **Transport:** REST-style HTTP calls from the frontend to the NestJS API.
- **Auth:** JWT bearer token, resolved server-side and injected into controllers via a
  `@CurrentUser('id') userId` decorator — so every service method receives an already-trusted
  `userId`, never a raw token.
- **Server state:** the typed `Paginated<TaskSummary>` / `TaskDetail` shapes strongly suggest a
  query-caching library on the frontend (e.g. **TanStack Query hooks** like `useTasks(projectId)`
  / `useTask(taskId)`) rather than hand-rolled `fetch` + local state — that's the natural fit for
  a typed, cache-invalidation-heavy resource like tasks/comments/activities.
- **Validation:** client-side form validation (Zod-shaped types match the shared package) is a
  UX nicety only — the DTO layer on the backend is the real boundary.

### Authorization: front vs. back
| Layer | What it does | Where it lives |
|---|---|---|
| **Frontend** | Hides/shows buttons (edit, assign, delete) based on the current user's role, fetched via a hook off the current-user/project-membership query | UI-only — a `usePermissions()`/`useProjectRole()`-style hook feeding conditional rendering |
| **Backend** | Actually enforces the rule; the only source of truth | `ProjectAccessService.assertCanView()`, `.assertCanManage()`, and the `canManage(access)` helper, called from every `TasksService` method |

The frontend check is a convenience — it can be bypassed by calling the API directly, so nothing
it does is trusted. All real enforcement happens in the functions above, every time.

### How the main entities relate
```
Project ──1:N── Task ──1:N── Comment
   │               │
   │               ├── createdBy ──→ User   (who made it — never changes)
   │               └── assignee  ──→ User?  (who owns it now — nullable, changes over time)
   │               └── 1:N ──→ Activity     (audit trail, e.g. assignee changes)
   │
   └──1:1── TaskCounter   (per-project atomic sequence → generates key like PROJ-42)
   └──1:N── ProjectMember ──→ User   (role per user per project)
```
Users are never embedded — every reference (`createdBy`, `assignee`, activity actor) is an
ObjectId, hydrated in bulk on read via `UsersService.findManyByIds`.

---

## ⚠️ Observations

| # | What I noticed | Why it's a problem | Fix now or later? |
|---|---|---|---|
| **1** | `updateStatus()` requires `assertCanManage` (managers only). But the generic `update()` also accepts `dto.status`, guarded only by `canManage OR isCreator`. | A non-manager **creator can change status through the wrong endpoint**, silently bypassing the stricter rule `updateStatus` exists to enforce. | **Now** — one-line fix (drop `status` from `update()`, or require `assertCanManage` there too). |
| **2** | `remove()` deletes the task and its comments via `Promise.all`, with no transaction. | Partial failure leaves orphaned comments or a "deleted" task whose comments survive. `updateAssignee` already shows the correct pattern (session + `withTransaction`). | **Soon** — small, mechanical change; low frequency but real data-integrity risk. |
| **3** | `create()` does check-then-act on `TaskCounter`, catching a duplicate-key error as recovery. | Only safe *if* `TaskCounter.projectId` has a unique index. *(Confirmed: it does — `@Prop({ unique: true })`. `Task` also has a unique `{projectId, number}` index as a second layer.)* Remaining gap: `taskModel.create()` itself has no matching try/catch for that second layer. | **Later** — low-probability edge case now that both indexes are confirmed; a small consistency fix, not a live bug. |
| **4** | `update()`, `updateStatus()`, `updateAssignee()` all load → mutate → save with no version check. *(Confirmed: `@Schema()` doesn't set `optimisticConcurrency`.)* | Two users editing the same task around the same time → last write silently wins, no conflict surfaced. Plausible "my edit disappeared" reports in a collaborative tool. | **Later** — UX/polish, not correctness or security; needs real evidence of collisions to prioritize. |

---

## 🔍 Code Review — `assignTask`

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

Reviewed against the existing `updateAssignee()`, which already does this correctly. **Would not
approve as-is.**

**🚫 Blocker**
- **No authorization at all.** `userId` is accepted but never used — any user can reassign any
  task in any project to anyone. Fix: call `assertCanView`, gate manager-only behavior behind
  `canManage(access)`, same as `updateAssignee`.

**Business rules missing**
- **No project-membership check** on the assignee — could assign to someone with no access to
  the project at all.
- **No unassign support** — `assigneeId: null` (a valid case elsewhere) isn't handled.

**Data integrity**
- **No activity log, no transaction** — the change is silent and, if logging is bolted on later
  without a transaction, could desync task state from its audit trail.
- **No idempotency check** — reassigning to the same person still writes and would log a
  spurious activity.

**Correctness & robustness**
- **Unvalidated string IDs** — a malformed ObjectId throws an uncaught `CastError` → raw 500
  instead of a clean 400.
- **Empty exceptions** — `NotFoundException()` doesn't say what wasn't found.

**Style / architecture**
- **Leaky return value** — returns the raw Mongoose document instead of a serialized
  `TaskDetail`, inconsistent with every other method.
- **Sequential lookups** — the two `findById` calls are independent and could run via
  `Promise.all`.
- **Divergent convention** — positional strings instead of a typed DTO + `ObjectId`, and a
  parallel implementation of something `updateAssignee` already does correctly.

### What I'd ask the engineer to change
1. Authorize using `userId` — project access + manager/self-assign rule.
2. Verify the assignee is a project member.
3. Support unassigning (`assigneeId: null`).
4. Wrap the save + activity log in a transaction.
5. Validate/convert IDs consistently with the rest of the service.
6. Short-circuit on no-op reassignment.
7. Return a serialized `TaskDetail`.
8. Parallelize the two lookups.
9. Give exceptions descriptive messages.
10. Reconcile with `updateAssignee` — this shouldn't exist as a second, weaker path.
