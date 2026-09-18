# AI Usage Log

## 01. Tools Used

* ChatGPT
* Claude

## 02. How I Used Them

I used ChatGPT and Claude for repetitive implementation tasks, exploring unfamiliar parts of the codebase, checking package compatibility, debugging, testing, code review, and discussing concurrency.

I also used them to set up the MongoDB replica set required for transaction-based tests.

## 03. Suggestions I Rejected or Changed

I rejected the suggestion to add assignee changes directly to the general `updateTask` endpoint.

I kept assignee changes in the dedicated assignment endpoint because the general task update can be performed by any project member, while task assignment requires stricter permission checks.
