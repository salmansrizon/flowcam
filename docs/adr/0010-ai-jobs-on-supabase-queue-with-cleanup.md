# AI Jobs run on a Supabase queue, and temporary files are cleaned up automatically

Every AI Job is placed on a Supabase queue and run by a worker that calls OpenRouter, retries on failure, saves the result, settles Credits and notifies the user, so a Job finishes and is billed correctly even if the user closes the tab. We rejected browser polling, which leaves results uncollected and Credits unsettled when the tab closes, and a dedicated job service (Inngest, Trigger.dev), which adds a vendor and a bill.

Storage is cleaned up by fixed rules: Job inputs and in-between files are deleted when the Job completes; a Free user's result is deleted once their device has downloaded it, or after 7 days at most; a Pro user's result is kept, because it becomes an Image or Video on their Board; and a daily sweep removes files left behind by deleted Boards and failed uploads.

## Consequences

- Retries and Credit settlement live in one place, the worker.
- Deleting a Pro user's result would break their Board on other devices, so results are never part of the cleanup.
