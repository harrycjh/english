# VocaRabbit Tablestore Learning Sync Design

Date: 2026-07-13
Status: Confirmed

## Goals

- Keep IndexedDB as the local, offline-capable store.
- Synchronize learning data with Alibaba Cloud before entering the app.
- Preserve every answer attempt for future learning analytics.
- Support one child, Xiaojunjun, without an account or role system.
- Require a family sync code only when connecting a new device or clearing local data.
- Merge local and server progress automatically after offline learning.

## Non-goals

- No multi-user account system or permission levels.
- No cloud reset or cloud deletion control in the app.
- No cloud storage for imported life photos in the first version.
- No direct browser access to Tablestore credentials.

## Architecture

The React frontend remains on Alibaba Cloud ESA. ESA routes same-origin API requests to an Alibaba Cloud Function Compute service. Function Compute validates device tokens and accesses Tablestore through the official Node.js SDK. Tablestore AccessKey credentials exist only in Function Compute environment variables.

The browser keeps using the existing Dexie database. A new sync layer records local mutations, uploads pending changes, downloads server changes, and applies the merged result in one IndexedDB transaction. Normal screens render only after the startup synchronization gate completes or the user explicitly chooses offline entry after a connection failure.

## Device Connection

A new device displays a one-time connection screen and asks for the family sync code. The Function Compute service compares a secure hash of the submitted code with its configured value. On success it issues a revocable device token. The raw family sync code is not stored in IndexedDB.

Subsequent launches use the device token silently. There is no username, password, profile selection, or role system. All connected devices have full access to the single fixed user space.

## Startup Flow

1. Load the local Dexie database and device sync metadata.
2. If no device token exists, show the family sync code connection screen.
3. Upload pending local mutations and the last acknowledged server cursor.
4. Download server mutations after that cursor.
5. Deduplicate and merge events, then rebuild derived state.
6. Persist merged data and the new cursor atomically.
7. Enter the app only after synchronization succeeds.

If the server is unavailable, show a clear error with `Retry` and `Enter offline` actions. Offline entry keeps all features available and marks new mutations as pending. The next successful launch automatically merges both sides.

## Learning Event Model

Every answer is an immutable event. Existing fields remain: event ID, word ID, date key, answer time, question kind, selected answer, correct answer, correctness, and response time. The event also stores device ID, schema version, mastery and review stage before and after the answer, and the calculated next due time.

Events are append-only and idempotent by event ID. They are never overwritten by normal synchronization. Reset generations may exclude old events from active calculations, but historical events remain available for audit and future analytics.

## Tablestore Tables

### `vocab_learning_events`

- Primary key: fixed user ID, event time, event ID.
- Attributes: word ID, device ID, question data, result, response time, before/after learning state, next due time, generation, schema version, and server receive time.
- Purpose: permanent answer history and incremental synchronization.

### `vocab_word_states`

- Primary key: fixed user ID, word ID.
- Attributes: current mastery level, review stage, streak, wrong count, last studied time, next due time, generation, and state revision.
- Purpose: fast startup and task generation.

### `vocab_app_states`

- Primary key: fixed user ID, state type, state ID.
- Stores daily tasks, per-word selection state, parent settings, device registrations, sync cursors, and migration checkpoints.

## Merge Rules

Synchronization performs a three-way merge from the last common server revision.

- Answer events: union by event ID, then sort by answer time and event ID.
- Word learning state: deterministically replay merged active events from the latest valid checkpoint.
- Daily completion: derive answered words and counts from merged events; rebuild the active task when required.
- Word selection: merge per word using the latest update revision, with a deterministic device ID tie-breaker.
- Parent settings: merge per field using the latest update revision.
- Duplicate retries: safe because writes are idempotent.

If the server has not changed during offline use, local events are uploaded directly. If both sides changed, both histories are retained and automatically merged. The UI shows a merge summary rather than asking the user to overwrite one side.

## Existing Data Migration

The first cloud synchronization uploads all existing answer events plus a current-state checkpoint. The checkpoint preserves learning state that may predate complete answer-event history. Future states are derived from that checkpoint and later immutable events.

The existing JSON export and import features remain as manual backup tools. Importing a backup creates local pending mutations that are merged on the next sync instead of directly deleting cloud data.

## Local Data Clearing

The settings page exposes only one destructive action: `Clear local data`.

1. Explain that only the current device will be affected.
2. Ask for the original family sync code.
3. Verify the code through Function Compute.
4. Ask for final confirmation.
5. Clear IndexedDB learning data, local photos, device token, and sync metadata.
6. Return to the device connection screen.

This action never deletes or resets Tablestore data. The app exposes no cloud reset endpoint or cloud deletion control. Any cloud reset must be performed manually by the owner in Alibaba Cloud.

## Failure Handling

- Network or Function Compute failure: retain all local data and offer retry or offline entry.
- Partial Tablestore batch failure: treat the whole sync as incomplete, retain pending mutations, and retry idempotently.
- Invalid or revoked device token: return to the family sync code screen without deleting local progress.
- Invalid family sync code: rate-limit attempts and keep the device disconnected.
- Schema mismatch: stop synchronization and show an upgrade-required error; never discard unknown data.

## Deployment Configuration

Function Compute receives Tablestore instance name, endpoint, AccessKey credentials or RAM role, family-code hash, token-signing secret, fixed user ID, and allowed ESA origin through environment variables. ESA proxies `/api/device/connect`, `/api/device/verify`, and `/api/sync` to Function Compute so the browser uses same-origin HTTPS requests.

The production frontend receives only the same-origin API base path. No Tablestore credential or family sync code is included in the built assets.

## Verification

- Unit tests for event deduplication, deterministic replay, per-field state merge, and migration checkpoints.
- Contract tests for connect, verify, sync, invalid token, partial batch failure, and idempotent retries.
- IndexedDB integration tests for atomic merge and pending mutation recovery.
- End-to-end tests for first device connection, successful startup sync, offline entry, two-device merge, token revocation, and local clearing.
- Production smoke test through the ESA domain with Function Compute and Tablestore request IDs captured for diagnosis.
