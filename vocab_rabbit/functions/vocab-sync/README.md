# VocaRabbit Cloud Sync Function

This directory is deployed as an Alibaba Cloud Function Compute Node.js 20 function. The browser calls it through same-origin ESA routes under `/api`.

## Security Boundary

- The frontend never receives Tablestore credentials.
- Prefer a Function Compute RAM role with Tablestore read/write access.
- `FAMILY_CODE_HASH` stores only a salted SHA-256 hash, not the family code.
- `PHOTO_ACCESS_CODE_HASH` separately protects private life photos; the photo code is never stored by the browser.
- Study and photo device tokens use separate signing secrets and scopes, expire after 365 days, and roll forward after authenticated requests.
- Device tokens are checked against `vocab_app_states` on every protected request. Delete the device row or set `active` to `false` to revoke it manually.
- Life photos stay in a private OSS bucket. The function returns short-lived V4 GET URLs only to active devices.
- The app has no cloud reset or cloud delete endpoint.

## Prepare

1. Copy `.env.example` values into Function Compute environment variables.
2. Generate independent random salts and token secrets for study data and photos.
3. Generate the family code hash locally:

```bash
node --input-type=module -e "import { hashFamilyCode } from './index.mjs'; console.log(hashFamilyCode(process.argv[1], process.argv[2]))" 'YOUR_FAMILY_CODE' 'YOUR_RANDOM_SALT'
```

Generate the photo access-code hash with the same command, using a different salt.

4. Install dependencies and create the three Tablestore tables:

```bash
npm install
npm run create:tables
```

The table creation command needs temporary local AccessKey environment variables. The deployed function should use its RAM role instead.

## Function Compute

- Runtime: Node.js 20
- Handler: `index.handler`
- Trigger: HTTP trigger, `POST`
- Authentication: no FC trigger authentication; the function validates its own device token
- Recommended timeout: 30 seconds
- Recommended memory: 512 MB

Deploy this directory including `node_modules`, or let the Function Compute build step run `npm ci --omit=dev`.

Required environment variables:

```text
TABLESTORE_ENDPOINT
TABLESTORE_INSTANCE_NAME
OSS_BUCKET
FAMILY_CODE_SALT
FAMILY_CODE_HASH
TOKEN_SIGNING_SECRET
PHOTO_ACCESS_CODE_SALT
PHOTO_ACCESS_CODE_HASH
PHOTO_TOKEN_SIGNING_SECRET
FIXED_USER_ID
ALLOWED_ORIGIN
```

The three `PHOTO_*` variables are only needed for private life photos. When they are
missing, `/api/media/connect` and `/api/media/sign` answer `503
PHOTO_ACCESS_NOT_CONFIGURED`; study sync keeps working.

Optional table overrides:

```text
TABLESTORE_EVENTS_TABLE
TABLESTORE_WORDS_TABLE
TABLESTORE_APP_TABLE
OSS_REGION
OSS_PUBLIC_ENDPOINT
OSS_SIGNED_URL_TTL_SECONDS
```

## ESA Routes

Proxy these same-origin paths to the Function Compute HTTP trigger without caching:

```text
/api/device/connect
/api/device/verify
/api/sync
/api/media/connect
/api/media/sign
```

Keep the original path and `Authorization` header. Set the API cache policy to bypass/no-store. The frontend remains configured with relative `/api` URLs, so no cloud URL or secret is embedded in the build.

## Verification

After deployment:

1. Connect a new device with the family code.
2. Confirm `/api/sync` returns a cursor and `serverTime`.
3. Answer one word offline, reconnect, and confirm the event exists once in `vocab_learning_events`.
4. Open a second device and confirm both devices converge on the same event count.
5. Enter the separate photo password once, download a private photo, and confirm later downloads reuse only the photo-scoped device token.
6. Clear local data from Settings and confirm the Tablestore rows remain.

## Cursor Fast Path

After a successful merge, the browser stores the returned server cursor. On a
later startup with no pending local changes, it sends only that cursor with
`hasLocalChanges: false` and `snapshot: null`.

- Matching cursors return `upToDate: true` and no snapshot.
- A stale cursor returns the current cloud snapshot without rewriting it.
- Pending local changes still use the full merge path.
- Requests from older clients without `hasLocalChanges` continue to use the
  full merge path.
