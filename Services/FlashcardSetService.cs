using SimpleFlashCards.Models;
using System.Text.Json;

namespace SimpleFlashCards.Services
{
    public class FlashcardSetService
    {
        private readonly List<FlashcardSet> _userSets = new();
        private List<FlashcardSet>? _defaultSetsCache;
        private readonly string _dataDirectory;
        private readonly string _userSetsPath;
        private readonly string _defaultSetsPath;
        private readonly string _learningStatePath;
        private readonly string _learningQueuePath;
        private readonly string _learningProgressPath;
        private readonly string _databasePath;
        private readonly SqliteFlashcardStore _store;
        private readonly Random _random;

        private FlashcardSet? _activeSet;
        private LearningQueue? _learningQueue;
        private LearningProgressSnapshot _learningProgress = new();
        private bool _learningProgressLoaded;
        private bool _isQuickLessonDone;
        private bool _legacyJsonMigrated;

        /// <param name="applicationBaseDirectory">Directory containing the <c>Data</c> folder (defaults to <see cref="AppContext.BaseDirectory"/>).</param>
        public FlashcardSetService(string? applicationBaseDirectory = null, Random? random = null)
        {
            var root = applicationBaseDirectory ?? AppContext.BaseDirectory;
            _dataDirectory = Path.Combine(root, "Data");
            _userSetsPath = Path.Combine(_dataDirectory, "user_sets.json");
            _defaultSetsPath = Path.Combine(_dataDirectory, "default_sets.json");
            _learningStatePath = Path.Combine(_dataDirectory, "learning_state.json");
            _learningQueuePath = Path.Combine(_dataDirectory, "learning_queue.json");
            _learningProgressPath = Path.Combine(_dataDirectory, "learning_progress.json");
            _databasePath = Path.Combine(_dataDirectory, "simple_flashcards.db");
            _store = new SqliteFlashcardStore(_databasePath);
            _random = random ?? Random.Shared;

            _store.EnsureCreated();
            MigrateLegacyJsonFilesIfNeeded();
        }

        private static void EnsureDataDirectoryExists(string directory)
        {
            Directory.CreateDirectory(directory);
        }

        public List<FlashcardSet> GetUserSets()
        {
            return _userSets;
        }

        public void AddUserSet(FlashcardSet set)
        {
            set.Source = FlashcardSetSource.User;
            _userSets.Add(set);
        }

        public void LoadUserSets()
        {
            MigrateLegacyJsonFilesIfNeeded();

            var sets = _store.LoadSets(FlashcardSetSource.User);
            var hadLegacyIds = sets.Any(s =>
                s.Id == Guid.Empty || s.Flashcards.Any(c => c.Id == Guid.Empty));

            foreach (var set in sets)
                set.Source = FlashcardSetSource.User;

            EntityIdNormalizer.EnsureIds(sets);
            var normalizedLearningProgress = NormalizeLearningProgress(sets);
            var appliedLearningProgress = ApplySavedLearningProgress(sets);

            _userSets.Clear();
            _userSets.AddRange(sets);

            if (hadLegacyIds || normalizedLearningProgress || appliedLearningProgress)
                SaveUserSets();
        }

        /// <summary>Returns true if the set is stored in user data (SRS can be persisted).</summary>
        public bool IsUserOwnedSet(FlashcardSet set) =>
            _userSets.Any(s => s.Id == set.Id);

        public void SaveUserSets()
        {
            MigrateLegacyJsonFilesIfNeeded();

            EntityIdNormalizer.EnsureIds(_userSets);
            NormalizeLearningProgress(_userSets);

            foreach (var set in _userSets)
                set.Source = FlashcardSetSource.User;

            _store.SaveSets(_userSets, FlashcardSetSource.User);
        }

        public List<FlashcardSet> GetDefaultSets()
        {
            MigrateLegacyJsonFilesIfNeeded();

            if (_defaultSetsCache != null)
                return _defaultSetsCache;

            if (File.Exists(_defaultSetsPath))
            {
                var json = File.ReadAllText(_defaultSetsPath);
                var importedDefaults = JsonSerializer.Deserialize<List<FlashcardSet>>(json)
                                       ?? new List<FlashcardSet>();

                foreach (var set in importedDefaults)
                    set.Source = FlashcardSetSource.ReadyMade;

                EntityIdNormalizer.EnsureIds(importedDefaults, useStableIds: true);
                NormalizeLearningProgress(importedDefaults);
                _store.SaveSets(
                    importedDefaults,
                    FlashcardSetSource.ReadyMade,
                    preserveExistingCardProgress: true);
            }

            var list = _store.LoadSets(FlashcardSetSource.ReadyMade);

            foreach (var set in list)
                set.Source = FlashcardSetSource.ReadyMade;

            EntityIdNormalizer.EnsureIds(list, useStableIds: true);
            var normalizedLearningProgress = NormalizeLearningProgress(list);
            var appliedLearningProgress = ApplySavedLearningProgress(list);
            _defaultSetsCache = list;

            if (normalizedLearningProgress || appliedLearningProgress)
                _store.SaveSets(_defaultSetsCache, FlashcardSetSource.ReadyMade);

            return _defaultSetsCache;
        }

        /// <summary>Eagerly loads default sets (same as <see cref="GetDefaultSets"/>). Call during app startup.</summary>
        public void LoadDefaultSets() => GetDefaultSets();

        public FlashcardSet? GetActiveSet()
        {
            return _activeSet;
        }

        public void SetActiveSet(FlashcardSet set)
        {
            _activeSet = set;
            ResetLearningState();
            SaveLearningState();
            SaveLearningQueue();
        }

        /// <param name="rebuildIfEmpty">When true (default), an empty queue is refilled from the active set (e.g. starting from Home). When false, returns the queue as-is.</param>
        public LearningQueue GetOrCreateQueue(bool rebuildIfEmpty = true)
        {
            if (_activeSet == null)
                throw new InvalidOperationException("No active set.");

            if (_learningQueue == null)
            {
                _learningQueue = CreateLearningQueue();
                _isQuickLessonDone = false;
            }
            else if (rebuildIfEmpty && !_learningQueue.HasCards)
            {
                _learningQueue = CreateLearningQueue();
            }

            return _learningQueue;
        }

        public LearningQueue CreateLearningSessionQueue(int? limit = null)
        {
            if (_activeSet == null)
                throw new InvalidOperationException("No active set.");

            _learningQueue = CreateLearningQueue(limit);
            return _learningQueue;
        }

        public IReadOnlyList<Flashcard> GetEligibleLearningCards()
        {
            return _activeSet?.Flashcards
                .Where(card => !card.IsLearned)
                .ToList()
                ?? new List<Flashcard>();
        }

        public (int TotalCards, int LearnedCards, int LearningCards, int DifficultCards, int ReadyCards)
            GetActiveSetLearningCounts()
        {
            if (_activeSet == null)
                return (0, 0, 0, 0, 0);

            var totalCards = _activeSet.Flashcards.Count;
            var learnedCards = _activeSet.Flashcards.Count(card => card.IsLearned);
            var learningCards = _activeSet.Flashcards.Count(card => !card.IsLearned);
            var difficultCards = _activeSet.Flashcards.Count(card => card.LearningStage == -1);

            return (totalCards, learnedCards, learningCards, difficultCards, learningCards);
        }

        private LearningQueue CreateLearningQueue(int? limit = null)
        {
            if (_activeSet == null)
                throw new InvalidOperationException("No active set.");

            return LearningQueue.CreateShuffled(
                _activeSet.Flashcards.Where(card => !card.IsLearned),
                _random,
                limit);
        }

        /// <summary>True when a queue exists and has no cards (session drained it).</summary>
        public bool IsLearningQueueEmpty => _learningQueue != null && !_learningQueue.HasCards;

        public bool IsQuickLessonDone => _isQuickLessonDone;

        public void MarkQuickLessonDone()
        {
            _isQuickLessonDone = true;
        }

        public LearningProgressSnapshot GetLearningProgressSnapshot()
        {
            var progress = GetLoadedLearningProgressSnapshot();

            return new LearningProgressSnapshot
            {
                CurrentStreak = progress.CurrentStreak,
                LongestStreak = progress.LongestStreak,
                LastStudyDate = progress.LastStudyDate,
                TotalStudyDays = progress.TotalStudyDays,
                Cards = progress.Cards.ToList()
            };
        }

        public void RegisterStudyActivity(DateOnly? studyDate = null)
        {
            var progress = GetLoadedLearningProgressSnapshot();
            var today = studyDate ?? DateOnly.FromDateTime(DateTime.Now);

            if (progress.LastStudyDate == today)
                return;

            if (!progress.LastStudyDate.HasValue)
            {
                progress.CurrentStreak = 1;
                progress.TotalStudyDays = 1;
            }
            else if (progress.LastStudyDate.Value == today.AddDays(-1))
            {
                progress.CurrentStreak++;
                progress.TotalStudyDays++;
            }
            else
            {
                progress.CurrentStreak = 1;
                progress.TotalStudyDays++;
            }

            if (progress.CurrentStreak > progress.LongestStreak)
                progress.LongestStreak = progress.CurrentStreak;

            progress.LastStudyDate = today;
            SaveLearningProgress();
        }

        public void ResetLearningState()
        {
            _learningQueue = null;
            _isQuickLessonDone = false;
        }

        public void SaveLearningState()
        {
            var state = new LearningState
            {
                ActiveSetId = _activeSet?.Id,
                ActiveSetName = _activeSet?.Name,
                IsQuickLessonDone = _isQuickLessonDone
            };

            _store.SaveLearningState(state);
        }

        public void SaveLearningQueue()
        {
            if (_activeSet == null || _learningQueue == null)
            {
                TryDeleteLearningQueueFile();
                return;
            }

            var snapshot = new LearningQueueSnapshot
            {
                ActiveSetId = _activeSet.Id,
                CardIds = _learningQueue.Snapshot().Select(c => c.Id).ToList()
            };

            _store.SaveLearningQueue(snapshot);
        }

        public void LoadLearningQueue()
        {
            if (_activeSet == null)
                return;

            var snapshot = _store.LoadLearningQueue();

            if (snapshot == null)
                return;

            if (!snapshot.ActiveSetId.HasValue || snapshot.ActiveSetId.Value != _activeSet.Id)
                return;

            var idToCard = _activeSet.Flashcards.ToDictionary(c => c.Id);
            var ordered = new List<Flashcard>();
            foreach (var id in snapshot.CardIds)
            {
                if (idToCard.TryGetValue(id, out var card) && !card.IsLearned)
                    ordered.Add(card);
            }

            _learningQueue = new LearningQueue(ordered, _random);
        }

        public void SaveLearningProgress()
        {
            var progress = GetLoadedLearningProgressSnapshot();

            var readyMadeSets = (_defaultSetsCache ?? new List<FlashcardSet>())
                .Where(set => set.Source == FlashcardSetSource.ReadyMade)
                .ToList();

            var snapshot = new LearningProgressSnapshot
            {
                CurrentStreak = progress.CurrentStreak,
                LongestStreak = progress.LongestStreak,
                LastStudyDate = progress.LastStudyDate,
                TotalStudyDays = progress.TotalStudyDays,
                Cards = _defaultSetsCache == null
                    ? progress.Cards.ToList()
                    : readyMadeSets
                        .SelectMany(set => set.Flashcards.Select(card => new CardLearningProgress
                        {
                            SetId = set.Id,
                            CardId = card.Id,
                            LearningStage = card.LearningStage,
                            ReviewAgainStreak = card.ReviewAgainStreak,
                            IsLearned = card.IsLearned,
                            LastReviewedAt = card.LastReviewedAt
                        }))
                        .ToList()
            };

            _store.SaveLearningProgressSnapshot(snapshot);
            if (_defaultSetsCache != null)
                _store.SaveSets(readyMadeSets, FlashcardSetSource.ReadyMade);

            _learningProgress = NormalizeLearningProgressSnapshot(snapshot);
            _learningProgressLoaded = true;
        }

        private bool ApplySavedLearningProgress(IEnumerable<FlashcardSet> sets)
        {
            var snapshot = GetLoadedLearningProgressSnapshot();
            if (snapshot.Cards.Count == 0)
                return false;

            var progressByCard = snapshot.Cards
                .GroupBy(card => (card.SetId, card.CardId))
                .ToDictionary(group => group.Key, group => group.Last());

            var appliedProgress = false;
            foreach (var set in sets)
            {
                foreach (var card in set.Flashcards)
                {
                    if (!progressByCard.TryGetValue((set.Id, card.Id), out var progress))
                        continue;

                    if (set.Source == FlashcardSetSource.User && HasLearningProgress(card))
                        continue;

                    if (set.Source == FlashcardSetSource.User && !HasLearningProgress(progress))
                        continue;

                    ApplyLearningProgress(card, progress);
                    appliedProgress = true;
                }
            }

            return appliedProgress;
        }

        private LearningProgressSnapshot GetLoadedLearningProgressSnapshot()
        {
            if (_learningProgressLoaded)
                return _learningProgress;

            _learningProgress = LoadLearningProgressSnapshot();
            _learningProgressLoaded = true;
            return _learningProgress;
        }

        private LearningProgressSnapshot LoadLearningProgressSnapshot()
        {
            try
            {
                return NormalizeLearningProgressSnapshot(_store.LoadLearningProgressSnapshot());
            }
            catch
            {
                return new LearningProgressSnapshot();
            }
        }

        private static LearningProgressSnapshot NormalizeLearningProgressSnapshot(
            LearningProgressSnapshot snapshot)
        {
            snapshot.Cards ??= new List<CardLearningProgress>();

            if (!snapshot.LastStudyDate.HasValue)
                snapshot.CurrentStreak = 0;

            snapshot.CurrentStreak = Math.Max(0, snapshot.CurrentStreak);
            snapshot.LongestStreak = Math.Max(snapshot.CurrentStreak, snapshot.LongestStreak);
            snapshot.TotalStudyDays = Math.Max(0, snapshot.TotalStudyDays);

            if (snapshot.LastStudyDate.HasValue && snapshot.TotalStudyDays == 0)
                snapshot.TotalStudyDays = 1;

            return snapshot;
        }

        private static bool NormalizeLearningProgress(IEnumerable<FlashcardSet> sets)
        {
            var normalizedProgress = false;

            foreach (var card in sets.SelectMany(set => set.Flashcards))
            {
                if (card.LearningStage >= 3)
                {
                    if (card.LearningStage != 3 || !card.IsLearned)
                        normalizedProgress = true;

                    card.LearningStage = 3;
                    card.IsLearned = true;
                    continue;
                }

                if (card.IsLearned)
                {
                    if (card.LearningStage != 3)
                        normalizedProgress = true;

                    card.LearningStage = 3;
                }
            }

            return normalizedProgress;
        }

        private static void ApplyLearningProgress(Flashcard card, CardLearningProgress progress)
        {
            var learningStage = progress.IsLearned && progress.LearningStage < 3
                ? 3
                : progress.LearningStage;

            if (learningStage >= 3)
                learningStage = 3;

            card.LearningStage = learningStage;
            card.ReviewAgainStreak = progress.ReviewAgainStreak;
            card.IsLearned = progress.IsLearned || learningStage >= 3;
            card.LastReviewedAt = progress.LastReviewedAt;
        }

        private static bool HasLearningProgress(Flashcard card) =>
            card.LearningStage != 0 ||
            card.ReviewAgainStreak != 0 ||
            card.IsLearned ||
            card.LastReviewedAt.HasValue;

        private static bool HasLearningProgress(CardLearningProgress progress) =>
            progress.LearningStage != 0 ||
            progress.ReviewAgainStreak != 0 ||
            progress.IsLearned ||
            progress.LastReviewedAt.HasValue;

        private void MigrateLegacyJsonFilesIfNeeded()
        {
            if (_legacyJsonMigrated)
                return;

            if (_store.IsLegacyJsonMigrationComplete())
            {
                _legacyJsonMigrated = true;
                return;
            }

            var legacyProgress = LoadLegacyLearningProgressSnapshot();
            var userSets = LoadLegacySets(
                _userSetsPath,
                FlashcardSetSource.User,
                useStableIds: false);
            var defaultSets = LoadLegacySets(
                _defaultSetsPath,
                FlashcardSetSource.ReadyMade,
                useStableIds: true);

            ApplyLearningProgressSnapshot(userSets, legacyProgress);
            ApplyLearningProgressSnapshot(defaultSets, legacyProgress);

            if (userSets.Count > 0)
                _store.SaveSets(userSets, FlashcardSetSource.User);

            if (defaultSets.Count > 0)
                _store.SaveSets(defaultSets, FlashcardSetSource.ReadyMade);

            _store.SaveLearningProgressSnapshot(legacyProgress);

            if (userSets.Count > 0)
                _store.SaveSets(userSets, FlashcardSetSource.User);

            if (defaultSets.Count > 0)
                _store.SaveSets(defaultSets, FlashcardSetSource.ReadyMade);

            var legacyState = LoadLegacyJson<LearningState>(_learningStatePath);
            if (legacyState != null)
                _store.SaveLearningState(legacyState);

            var legacyQueue = LoadLegacyJson<LearningQueueSnapshot>(_learningQueuePath);
            if (legacyQueue != null)
            {
                try
                {
                    _store.SaveLearningQueue(legacyQueue);
                }
                catch
                {
                    // Legacy queue rows can point at cards that no longer exist.
                }
            }

            _store.MarkLegacyJsonMigrationComplete();
            _legacyJsonMigrated = true;
        }

        private static List<FlashcardSet> LoadLegacySets(
            string path,
            FlashcardSetSource source,
            bool useStableIds)
        {
            if (!File.Exists(path))
                return new List<FlashcardSet>();

            try
            {
                var json = File.ReadAllText(path);
                var sets = JsonSerializer.Deserialize<List<FlashcardSet>>(json)
                           ?? new List<FlashcardSet>();

                foreach (var set in sets)
                    set.Source = source;

                EntityIdNormalizer.EnsureIds(sets, useStableIds);
                NormalizeLearningProgress(sets);
                return sets;
            }
            catch
            {
                return new List<FlashcardSet>();
            }
        }

        private LearningProgressSnapshot LoadLegacyLearningProgressSnapshot()
        {
            var snapshot = LoadLegacyJson<LearningProgressSnapshot>(_learningProgressPath)
                           ?? new LearningProgressSnapshot();

            return NormalizeLearningProgressSnapshot(snapshot);
        }

        private static T? LoadLegacyJson<T>(string path)
        {
            if (!File.Exists(path))
                return default;

            try
            {
                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<T>(json);
            }
            catch
            {
                return default;
            }
        }

        private static bool ApplyLearningProgressSnapshot(
            IEnumerable<FlashcardSet> sets,
            LearningProgressSnapshot snapshot)
        {
            if (snapshot.Cards.Count == 0)
                return false;

            var progressByCard = snapshot.Cards
                .GroupBy(card => (card.SetId, card.CardId))
                .ToDictionary(group => group.Key, group => group.Last());

            var appliedProgress = false;
            foreach (var set in sets)
            {
                foreach (var card in set.Flashcards)
                {
                    if (!progressByCard.TryGetValue((set.Id, card.Id), out var progress))
                        continue;

                    if (set.Source == FlashcardSetSource.User && HasLearningProgress(card))
                        continue;

                    if (set.Source == FlashcardSetSource.User && !HasLearningProgress(progress))
                        continue;

                    ApplyLearningProgress(card, progress);
                    appliedProgress = true;
                }
            }

            return appliedProgress;
        }

        private void TryDeleteLearningQueueFile()
        {
            try
            {
                _store.ClearLearningQueue();
            }
            catch
            {
                // best-effort cleanup
            }
        }

        public void LoadLearningState()
        {
            var state = _store.LoadLearningState();

            if (state == null)
                return;

            _isQuickLessonDone = state.IsQuickLessonDone;

            var allSets = GetDefaultSets()
                .Concat(_userSets)
                .ToList();

            if (state.ActiveSetId.HasValue && state.ActiveSetId.Value != Guid.Empty)
            {
                _activeSet = allSets.FirstOrDefault(s => s.Id == state.ActiveSetId.Value);
            }

            if (_activeSet == null && !string.IsNullOrWhiteSpace(state.ActiveSetName))
            {
                _activeSet = allSets.FirstOrDefault(s => s.Name == state.ActiveSetName);
            }
        }

        public void RemoveUserSet(FlashcardSet set)
        {
            _userSets.Remove(set);

            if (_activeSet == set)
            {
                _activeSet = null;
                ResetLearningState();
                SaveLearningState();
                SaveLearningQueue();
            }
        }

    }
}
