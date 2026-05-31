# Local API testing

This API is for local development and manual testing only. The React app loads
API-backed sets, persists the active set, uses API-backed custom set/card CRUD,
and writes learning review decisions through the local API.

## Start the API

From the repository root:

```powershell
dotnet run --project SimpleFlashCards.Api
```

// MOBILE 
cd mobile
npx expo start 

The launch profile uses:

- API base URL: `http://localhost:5057`
- Swagger URL: `http://localhost:5057/swagger`
- SQLite database: `Data/simple_flashcards.db`

The API uses the repository root as the data root by default. To point it at a
different existing data directory, set `SIMPLE_FLASHCARDS_DATA_ROOT` to the
directory that contains the `Data` folder.

## User-scoped progress

Card content still lives in `flashcards`, but learning progress is now stored in
`user_card_progress` for a placeholder local user:

```text
local-user
```

There is no login, profile, session, Supabase, or cloud sync yet. The frontend
should not pass a `userId`; the API uses `local-user` automatically until real
authentication exists.

Ready-made set content is shared, but ready-made progress is per-user. Custom
sets created through the API are owned by `local-user` through
`flashcard_sets.owner_user_id`; ready-made sets have no owner. Legacy progress
columns still exist on `flashcards` for console/test compatibility and are kept
synchronized for the default local user.

## Start the Vite web app

From the repository root:

```powershell
cd web
npm run dev -- --host localhost --port 5173
```

The API CORS policy allows the default Vite dev origin:
`http://localhost:5173`.

## Manual curl examples

Use `GET /api/sets` first and copy one returned `externalId`. Public set
endpoints prefer `externalId`; the `id` field is the internal SQLite GUID.
Use `GET /api/sets/{externalId}` to copy card IDs for card and lesson snapshot
examples.

```powershell
$base = "http://localhost:5057"
$externalSetId = "<external-id-from-get-sets>"
$cardId1 = "<card-id-from-get-set>"
$cardId2 = "<another-card-id-from-get-set>"
$date = "2026-05-27"
```

Read app state:

```powershell
curl.exe "$base/api/app-state"
```

Save active set:

```powershell
curl.exe -X PUT "$base/api/active-set" `
  -H "Content-Type: application/json" `
  -d "{ `"activeSetId`": `"$externalSetId`" }"
```

Read active set through app state:

```powershell
curl.exe "$base/api/app-state"
```

Save quick lesson completion:

```powershell
curl.exe -X PUT "$base/api/quick-lesson-completion" `
  -H "Content-Type: application/json" `
  -d "{ `"activeSetId`": `"$externalSetId`", `"date`": `"$date`" }"
```

Read quick lesson completion:

```powershell
curl.exe "$base/api/quick-lesson-completion?activeSetId=$externalSetId&date=$date"
```

Save lesson snapshot:

```powershell
curl.exe -X PUT "$base/api/lesson-snapshot" `
  -H "Content-Type: application/json" `
  -d "{ `"activeSetId`": `"$externalSetId`", `"sessionType`": `"quickLesson`", `"queueCardIds`": [`"$cardId1`", `"$cardId2`"], `"currentCardIndex`": 0, `"reviewedCount`": 0, `"isRevealed`": false, `"localDate`": `"$date`" }"
```

Read lesson snapshot:

```powershell
curl.exe "$base/api/lesson-snapshot"
```

Delete lesson snapshot:

```powershell
curl.exe -X DELETE "$base/api/lesson-snapshot"
```

Read set progress for the default local user:

```powershell
curl.exe "$base/api/sets/$externalSetId/progress"
```

Review a card as `know`:

```powershell
curl.exe -X POST "$base/api/sets/$externalSetId/cards/$cardId1/review" `
  -H "Content-Type: application/json" `
  -d "{ `"decision`": `"know`", `"sessionType`": `"quickLesson`", `"reviewedAt`": `"2026-05-27T12:00:00.0000000Z`" }"
```

Review a card as `reviewAgain`:

```powershell
curl.exe -X POST "$base/api/sets/$externalSetId/cards/$cardId2/review" `
  -H "Content-Type: application/json" `
  -d "{ `"decision`": `"reviewAgain`", `"sessionType`": `"continueLearning`", `"reviewedAt`": `"2026-05-27T12:01:00.0000000Z`" }"
```

Check set progress after review:

```powershell
curl.exe "$base/api/sets/$externalSetId/progress"
```

Confirm `local-user` progress changed in SQLite:

```sql
SELECT p.user_id,
       p.card_id,
       p.learning_stage,
       p.review_again_streak,
       p.is_learned,
       p.last_reviewed_at
FROM user_card_progress p
WHERE p.user_id = 'local-user'
  AND p.card_id IN ('<card-id-from-get-set>', '<another-card-id-from-get-set>');
```

Create a custom set:

```powershell
curl.exe -X POST "$base/api/sets" `
  -H "Content-Type: application/json" `
  -d "{ `"name`": `"API Test Set`", `"cards`": [{ `"front`": `"alpha`", `"back`": `"pierwszy`" }] }"
```

Copy the returned `externalId` into `$customSetId`, and copy the first returned
card `id` into `$customCardId`:

```powershell
$customSetId = "<created-set-external-id>"
$customCardId = "<created-card-id>"
```

Rename a custom set:

```powershell
curl.exe -X PUT "$base/api/sets/$customSetId" `
  -H "Content-Type: application/json" `
  -d "{ `"name`": `"Renamed API Test Set`" }"
```

Add a card:

```powershell
curl.exe -X POST "$base/api/sets/$customSetId/cards" `
  -H "Content-Type: application/json" `
  -d "{ `"front`": `"beta`", `"back`": `"drugi`" }"
```

Edit a card:

```powershell
curl.exe -X PUT "$base/api/sets/$customSetId/cards/$customCardId" `
  -H "Content-Type: application/json" `
  -d "{ `"front`": `"alpha edited`", `"back`": `"pierwszy edited`" }"
```

Reset set progress:

```powershell
curl.exe -X POST "$base/api/sets/$customSetId/reset-progress"
```

Delete a card:

```powershell
curl.exe -X DELETE "$base/api/sets/$customSetId/cards/$customCardId"
```

Delete a custom set:

```powershell
curl.exe -X DELETE "$base/api/sets/$customSetId"
```

Attempt to modify a ready-made set and receive the expected read-only error:

```powershell
$readyMadeSetId = "<ready-made-external-id-from-get-sets>"
curl.exe -X PUT "$base/api/sets/$readyMadeSetId" `
  -H "Content-Type: application/json" `
  -d "{ `"name`": `"Should fail`" }"
```

Expected response: HTTP 403 with the title `Ready-made sets are read-only.`

## Notes and limitations

- Default sets are imported into SQLite from `Data/default_sets.json` when the
  API starts.
- `flashcard_sets.id` remains the internal SQLite GUID primary key.
- `flashcard_sets.external_id` is the public set identifier for future React API
  calls.
- Ready-made `external_id` values match the current web default ID formula:
  `default-{index}-{lowercase-name-with-dashes}`.
- User-created sets use their internal GUID string as `external_id`. This keeps
  local API-created custom sets stable without adding another ID generator.
- Set list and detail responses include `progressSummary` for `local-user`.
- Set detail card responses include user-scoped progress fields:
  `learningStage`, `isLearned`, `reviewAgainStreak`, `lastReviewedAt`,
  `easeFactor`, `repetitions`, `intervalDays`, and `nextReviewAt`.
- `POST /api/sets/{externalSetId}/cards/{cardId}/review` applies the current
  `Know it` / `Review again` stage rules for `local-user` and returns the
  updated card plus progress summary.
- Existing localStorage user sets are still not imported into SQLite; a later web
  connection step needs a migration/import plan for browser-local custom sets.
- `simple-flashcards:study-progress` is still used temporarily for streak and
  study-day stats until those events move to the API.
- Authentication, cloud sync, Supabase, user profiles, and learning-rule changes
  are intentionally out of scope for this local API step.
