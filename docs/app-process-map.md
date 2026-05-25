# SimpleFlashCards App Process Map

## Purpose

SimpleFlashCards is a lightweight flashcard learning app focused on short,
low-friction study sessions. The product goal is to help a learner open the app,
pick or continue one active deck, complete a quick lesson, and gradually move
cards from new or difficult into learned without feeling overloaded.

The current repo contains two app surfaces:

- A .NET 8 console app with SQLite persistence.
- A Vite/React mobile-first web app named LumaApp with localStorage persistence
  and a placeholder PWA shell.

These surfaces share the default set data but do not currently share one runtime
state store or API.

## Product Goals

- Make the next learning action obvious from the first screen.
- Support tiny daily sessions through a 10-card quick lesson.
- Let users create, edit, and delete their own flashcard sets.
- Provide ready-made sets so the app is useful immediately.
- Track lightweight progress and habit streaks.
- Work offline-first locally, then eventually sync progress across devices.
- Keep the UX calm, mobile-friendly, and focused on learning rather than heavy
  analytics or gamification.

## Current Architecture

### .NET Console App

Entry point:

- `Program.cs` creates `ConsoleApplication` with `FlashcardSetService`.

Main layers:

- `ConsoleUi/` contains menu and flow screens.
- `Models/` contains flashcards, sets, queue snapshots, learning state, and
  progress snapshots.
- `Services/FlashcardSetService.cs` coordinates sets, active deck, queues,
  progress, persistence, and legacy JSON migration.
- `Services/LearningQueue.cs` owns card ordering and learning-stage transitions.
- `Services/LearningSessionV2.cs` wraps a queue for quick lessons and longer
  learning sessions.
- `Services/SqliteFlashcardStore.cs` persists data to SQLite.
- `Services/SpacedRepetitionSm2.cs` contains a classic SM-2 scheduler, but it is
  not wired into the current console learning flow.

### React Web App

Entry point:

- `web/src/main.tsx` renders `App`.

Main layers:

- `web/src/App.tsx` owns app state, routing, persistence helpers, learning rules,
  and callbacks.
- `web/src/screens/` contains Home, Learning, Sets, Stats, Settings, and
  completion screens.
- `web/src/components/` contains chrome, bottom navigation, and shared UI pieces.
- `web/src/data/defaultSets.ts` imports `Data/default_sets.json` and maps it into
  web flashcard set objects.
- `web/public/manifest.webmanifest` and `web/public/sw.js` provide a basic PWA
  shell.

## Domain Model

| Concept | Meaning |
| --- | --- |
| `Flashcard` | A front/back card plus learning state. |
| `FlashcardSet` | A named collection of flashcards. |
| `FlashcardSetSource` | Either `User` or `ReadyMade`. |
| Active set | The deck currently used by quick lesson and continue learning. |
| Learning queue | Ordered cards waiting to be reviewed in a session. |
| Learning progress | Per-card learning stage plus daily streak stats. |
| Quick lesson | A short session capped at 10 cards. |
| Continue learning | A longer session over all currently unlearned cards. |

## Learning State Rules

The active learning flow uses a simple staged model:

| Stage | Meaning |
| --- | --- |
| `0` | New or neutral card. |
| `1` | First successful review. |
| `2` | Second successful review. |
| `3` | Learned card. |
| `-1` | Difficult card. |

Current review behavior:

- `Know it` sets `LastReviewedAt` and clears `ReviewAgainStreak`.
- `Know it` moves stage `0` or `-1` to `1`.
- `Know it` moves stage `1` to `2`.
- `Know it` moves stage `2` or higher to `3` and marks the card learned.
- `Review again` sets `LastReviewedAt` and increments `ReviewAgainStreak`.
- A second consecutive `Review again`, or any repeat on an already difficult
  card, sets stage `-1`.
- Learned cards are excluded from new queues.

Queue reinsertion differs by session type:

- Quick lesson does not reinsert repeated cards into the same session.
- Continue learning reinserts cards later:
  - Stage `1` known card: 10 to 20 positions later.
  - Stage `2` known card: 40 to 50 positions later.
  - First repeat: 5 to 10 positions later.
  - Difficult repeat: 3 to 5 positions later.

## Feature Inventory

### Implemented In Console

- Load user sets, ready-made sets, active state, and saved queue at startup.
- Select an active set from user or ready-made decks.
- Show dashboard-style main menu with active set progress.
- Start a 10-card quick lesson.
- Continue learning all unlearned cards.
- Reveal answer, then mark each card as known or repeat.
- Exit a lesson and preserve the current card/queue.
- Create custom user sets.
- Edit user sets, names, card fronts, and card backs.
- Delete user sets.
- Persist user sets, ready-made sets, active set, quick lesson completion,
  learning queue, per-card progress, and streak stats in SQLite.
- Migrate older JSON files into SQLite once.
- Normalize legacy missing IDs on sets and cards.

### Implemented In Web

- Mobile-first app chrome with top bar and bottom navigation.
- Home dashboard with active set, quick lesson status, streak card, and learning
  summary.
- Quick lesson flow capped at 10 unlearned cards.
- Continue learning flow over all unlearned cards.
- Tap-to-reveal flashcards.
- Button and swipe gestures for `Know it` and `Review again`.
- Completion screen with streak summary.
- Sets screen grouped into custom sets and ready-made sets.
- Create user set.
- Delete user set.
- Set active deck.
- Reset set progress.
- Add, edit, and delete cards for user sets.
- Read-only card viewing for ready-made sets.
- Persist user-created sets in localStorage.
- Persist ready-made set progress in localStorage.
- Persist streak progress in localStorage.
- Basic PWA manifest and service worker placeholder.

### Partial Or Placeholder Features

- `StatsScreen` currently shows static example numbers.
- `SettingsScreen` currently shows static example settings.
- `ReadyMadeSetsScreen` in Explore/Home route shows static example cards, while
  the real ready-made sets are listed in the Sets screen.
- `SpacedRepetitionSm2` exists and is tested, but current learning sessions do
  not use `EaseFactor`, `Repetitions`, `IntervalDays`, or `NextReviewUtc`.
- Browser app state does not currently persist active set selection, current
  queue, quick lesson completion, or in-progress lesson state.
- Console and web persistence are separate. Console uses SQLite; web uses
  localStorage.
- `PendingReviewEvent` documents a future offline sync event shape but is not
  used by the app yet.
- PWA service worker does not cache app assets or queue offline sync.
- There is no Supabase/backend sync layer yet.

## Process Maps

### Console Startup

```text
Program.cs
-> new ConsoleApplication(new FlashcardSetService())
-> FlashcardSetService creates Data/simple_flashcards.db
-> migrate legacy JSON if needed
-> LoadUserSets()
-> LoadDefaultSets()
-> LoadLearningState()
-> LoadLearningQueue()
-> show main menu loop
```

### Console Active Set Selection

```text
User opens My Sets or Ready-made Sets
-> selects a set
-> FlashcardSetService.SetActiveSet(set)
-> active set is stored
-> current learning queue is reset
-> quick lesson completion flag is reset
-> learning state is saved
-> saved queue is cleared
```

### Console Quick Lesson

```text
Main menu: Start Quick Lesson
-> require active set
-> reject if quick lesson already completed
-> reject if no unlearned cards
-> create shuffled queue with max 10 cards
-> LearningSessionV2(limit: 10, allowReinsert: false)
-> for each card:
   -> show front
   -> reveal back
   -> user chooses Know it, Repeat, or Exit
   -> update learning stage
   -> register study activity
   -> persist user set if user-owned
   -> save learning progress
   -> save queue
   -> save learning state
-> on natural completion:
   -> mark quick lesson done
   -> save state and queue
   -> show completion screen
```

### Console Continue Learning

```text
Main menu: Continue Learning
-> require active set
-> reject if no unlearned cards
-> create shuffled queue from all unlearned cards
-> LearningSessionV2(limit: int.MaxValue, allowReinsert: true)
-> each review updates stage and may reinsert card later
-> progress, queue, and state are saved after each decision
```

### User Set Management

```text
Create new set
-> read set name
-> collect front/back cards until blank front
-> add set as User source
-> save user sets

Edit set
-> rename set and save
-> edit card front/back and save
-> delete card and save
-> delete set
   -> remove from user list
   -> if it was active, clear active state and queue
   -> save user sets
```

### SQLite Persistence

```text
FlashcardSetService
-> SqliteFlashcardStore
-> Data/simple_flashcards.db
```

SQLite tables:

- `app_metadata`: one-time migration markers.
- `flashcard_sets`: set identity, name, source, order.
- `flashcards`: card content, set relation, scheduling fields, learning stage,
  learned flag, review streak, timestamps, order.
- `learning_state`: active set and quick lesson completion.
- `learning_stats`: current streak, longest streak, last study date, total study
  days.
- `learning_queue_state`: active set for saved queue.
- `learning_queue_cards`: ordered card IDs for saved queue.

### Legacy JSON Migration

```text
FlashcardSetService constructor
-> check app_metadata legacy_json_migration_v1
-> load Data/user_sets.json if present
-> load Data/default_sets.json if present
-> load Data/learning_progress.json if present
-> apply saved progress to matching cards
-> save sets and progress into SQLite
-> load legacy learning state and queue if present
-> mark migration complete
```

### Web Startup

```text
main.tsx
-> render App
-> load user sets from localStorage
-> load ready-made progress from localStorage
-> load study streak from localStorage
-> import ready-made sets from Data/default_sets.json
-> choose first ready-made set as default active set
-> show Home dashboard
```

### Web Quick Lesson

```text
Home: Start now
-> create shuffled queue from unlearned cards in active set
-> cap queue at 10 cards
-> store queue in React state
-> route to quickLesson
-> user taps to reveal answer
-> user clicks/swipes Know it or Review again
-> update card learning stage
-> persist card progress:
   -> user set: update simple-flashcards:user-sets
   -> ready-made set: update simple-flashcards:learning-progress
-> update streak in simple-flashcards:study-progress
-> increment reviewed count
-> when reviewed count reaches queue length, show completion screen
```

### Web Continue Learning

```text
Home: Practice cards
-> create shuffled queue from all unlearned cards in active set
-> route to continueLearning
-> user reviews cards
-> known/repeat decisions update progress
-> repeated and early-stage known cards can be reinserted later
-> route to completion when queue is empty
```

### Web Set Management

```text
Sets tab
-> list custom sets and ready-made sets
-> create set sheet validates duplicate names
-> set active deck
-> reset progress
-> delete custom set
-> open set detail
   -> user sets allow add/edit/delete cards
   -> ready-made sets are read-only
```

## Storage Map

### Console Storage

Primary storage:

- `Data/simple_flashcards.db`

Seed and legacy files:

- `Data/default_sets.json`
- `Data/user_sets.json`
- `Data/learning_state.json`
- `Data/learning_queue.json`
- `Data/learning_progress.json`

### Web Storage

localStorage keys:

- `simple-flashcards:user-sets`
- `simple-flashcards:learning-progress`
- `simple-flashcards:study-progress`

Not currently persisted in web:

- Active set ID.
- Current quick lesson queue.
- Current continue-learning queue.
- Quick lesson completed flag.
- In-progress card/revealed state.

## Test Coverage

The .NET tests currently cover:

- Queue ordering, shuffling, reinsertion, and learning-stage transitions.
- Session limits and repeat behavior.
- SQLite-backed persistence of sets, active state, queue state, learning progress,
  and daily streaks.
- Legacy JSON migration and ID normalization.
- SM-2 interval behavior.

Current test gap:

- The React app does not have automated component, interaction, localStorage, or
  end-to-end tests.

## Current Risks And Gaps

- Two separate implementations of the learning rules exist: one in C# and one in
  TypeScript. They can drift over time.
- The SM-2 scheduler exists but the user-facing flows use the custom staged
  learning model instead.
- Web progress is browser-local only and can be lost by clearing site data.
- Web active deck and in-progress sessions do not survive reloads.
- Stats and settings are mostly placeholders.
- Explore/Ready-made screen does not yet reflect real ready-made data.
- PWA/offline behavior is only scaffolded.
- There is no shared backend, authentication, or sync.
- Default data includes Polish translations; keep the JSON and editor workflow
  consistently UTF-8 to avoid mojibake in terminals or rendered UI.

## Recommended Next Implementation

### 1. Decide The Primary Product Surface

Pick whether the web app is the main product and the console app is a prototype,
or whether both should remain supported. This decision affects where the source
of truth for domain rules and persistence should live.

Recommended direction: treat the React/PWA app as the main product surface and
keep the .NET console app as a tested domain/persistence reference until a real
backend or shared library replaces duplication.

### 2. Persist Complete Web Session State

Add localStorage persistence for:

- Active set ID.
- Quick lesson completed flag for the current day or active set.
- Current queue snapshots.
- Continue-learning queue snapshots.

This will make reloads and mobile browser interruptions less punishing.

### 3. Replace Placeholder Stats With Real Data

Track and display:

- Cards reviewed today.
- Known vs repeat decisions today.
- Current streak.
- Longest streak.
- Total study days.
- Learned, learning, and difficult cards per active set.
- Weekly activity from real review events.

This likely requires storing review events, not only the latest card state.

### 4. Unify Learning Rules

Move learning-stage rules into one shared specification and keep C# and
TypeScript implementations tested against the same cases. At minimum, duplicate
the existing C# queue/session tests as web unit tests.

### 5. Decide How SM-2 Should Be Used

Choose one of these paths:

- Keep the current staged model and remove/deprioritize SM-2.
- Use SM-2 for long-term due scheduling after cards reach learned state.
- Replace staged learning with SM-2 everywhere.

Recommended direction: keep the simple staged model for first-time learning, then
use SM-2 for reviews after a card becomes learned.

### 6. Implement Due Scheduling

Once scheduling is chosen:

- Use `NextReviewUtc` or a web equivalent to decide ready cards.
- Change "ready" counts from "all unlearned cards" to "new + due + difficult".
- Add a separate "learned but due for review" state.
- Make reset progress explicit and reversible only if a backup/export exists.

### 7. Wire Real Ready-made Explore

Update Explore/Ready-made to use the same data as the Sets screen. It should
support opening real set details, setting a ready-made deck as active, and
starting a lesson from it.

### 8. Add Sync Architecture

Introduce the sync model planned by `PendingReviewEvent`:

- Persist review events locally.
- Replay pending events when online.
- Add conflict rules for card progress.
- Add Supabase tables or another backend store.
- Add authentication only when cross-device sync is ready.

### 9. Strengthen PWA Offline Behavior

Extend the service worker to cache:

- App shell assets.
- Default sets.
- Icons and core images.

Then add safe offline indicators and retry behavior for sync.

### 10. Add Web Tests And CI

Add tests for:

- Creating, editing, deleting, and selecting sets.
- Quick lesson completion.
- Continue-learning reinsertion.
- localStorage migration/normalization.
- Streak updates across dates.
- Read-only ready-made behavior.

Run in CI:

- `dotnet test`
- `npm run build` from `web/`
- Web unit tests when added.

## Near-Term Backlog

1. Persist active set and quick lesson completion in the web app.
2. Replace static Stats screen with values from `studyProgress` and card state.
3. Make Explore use real `defaultSets`.
4. Add TypeScript unit tests for learning-stage transitions.
5. Add review-event storage for accurate daily and weekly metrics.
6. Decide and document staged learning vs SM-2 scheduling.
7. Add due-review logic after the scheduling decision.
8. Expand service worker caching for production PWA builds.
9. Add import/export for user sets.
10. Add a small troubleshooting section to docs for SQLite data location,
    localStorage keys, and resetting local data.

