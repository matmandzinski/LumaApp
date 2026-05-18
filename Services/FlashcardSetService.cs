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
        private readonly Random _random;

        private FlashcardSet? _activeSet;
        private LearningQueue? _learningQueue;
        private LearningProgressSnapshot _learningProgress = new();
        private bool _learningProgressLoaded;
        private bool _isQuickLessonDone;

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
            _random = random ?? Random.Shared;
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
            if (!File.Exists(_userSetsPath))
                return;

            var json = File.ReadAllText(_userSetsPath);

            var sets = JsonSerializer.Deserialize<List<FlashcardSet>>(json);

            if (sets == null)
                return;

            var hadLegacyIds = sets.Any(s =>
                s.Id == Guid.Empty || s.Flashcards.Any(c => c.Id == Guid.Empty));

            foreach (var set in sets)
                set.Source = FlashcardSetSource.User;

            _userSets.AddRange(sets);
            EntityIdNormalizer.EnsureIds(_userSets);
            var normalizedLearningProgress = NormalizeLearningProgress(_userSets);
            var appliedLearningProgress = ApplySavedLearningProgress(_userSets);

            if (hadLegacyIds || normalizedLearningProgress || appliedLearningProgress)
                SaveUserSets();
        }

        /// <summary>Returns true if the set is stored in user data (SRS can be persisted).</summary>
        public bool IsUserOwnedSet(FlashcardSet set) =>
            _userSets.Any(s => s.Id == set.Id);

        public void SaveUserSets()
        {
            EnsureDataDirectoryExists(_dataDirectory);
            var json = JsonSerializer.Serialize(
                _userSets,
                new JsonSerializerOptions { WriteIndented = true });

            File.WriteAllText(_userSetsPath, json);
        }

        public List<FlashcardSet> GetDefaultSets()
        {
            if (_defaultSetsCache != null)
                return _defaultSetsCache;

            if (!File.Exists(_defaultSetsPath))
            {
                _defaultSetsCache = new List<FlashcardSet>();
                return _defaultSetsCache;
            }

            var json = File.ReadAllText(_defaultSetsPath);

            var list = JsonSerializer.Deserialize<List<FlashcardSet>>(json)
                       ?? new List<FlashcardSet>();

            foreach (var set in list)
                set.Source = FlashcardSetSource.ReadyMade;

            EntityIdNormalizer.EnsureIds(list, useStableIds: true);
            NormalizeLearningProgress(list);
            ApplySavedLearningProgress(list);
            _defaultSetsCache = list;
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
            EnsureDataDirectoryExists(_dataDirectory);
            var state = new LearningState
            {
                ActiveSetId = _activeSet?.Id,
                ActiveSetName = _activeSet?.Name,
                IsQuickLessonDone = _isQuickLessonDone
            };

            var json = JsonSerializer.Serialize(state, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            File.WriteAllText(_learningStatePath, json);
        }

        public void SaveLearningQueue()
        {
            if (_activeSet == null || _learningQueue == null)
            {
                TryDeleteLearningQueueFile();
                return;
            }

            EnsureDataDirectoryExists(_dataDirectory);
            var snapshot = new LearningQueueSnapshot
            {
                ActiveSetId = _activeSet.Id,
                CardIds = _learningQueue.Snapshot().Select(c => c.Id).ToList()
            };

            var json = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_learningQueuePath, json);
        }

        public void LoadLearningQueue()
        {
            if (!File.Exists(_learningQueuePath) || _activeSet == null)
                return;

            var json = File.ReadAllText(_learningQueuePath);
            var snapshot = JsonSerializer.Deserialize<LearningQueueSnapshot>(json);

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
            EnsureDataDirectoryExists(_dataDirectory);
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

            var json = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_learningProgressPath, json);
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
            if (!File.Exists(_learningProgressPath))
                return new LearningProgressSnapshot();

            try
            {
                var json = File.ReadAllText(_learningProgressPath);
                return NormalizeLearningProgressSnapshot(
                    JsonSerializer.Deserialize<LearningProgressSnapshot>(json)
                    ?? new LearningProgressSnapshot());
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

        private void TryDeleteLearningQueueFile()
        {
            try
            {
                if (File.Exists(_learningQueuePath))
                    File.Delete(_learningQueuePath);
            }
            catch
            {
                // best-effort cleanup
            }
        }

        public void LoadLearningState()
        {
            if (!File.Exists(_learningStatePath))
                return;

            var json = File.ReadAllText(_learningStatePath);
            var state = JsonSerializer.Deserialize<LearningState>(json);

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
