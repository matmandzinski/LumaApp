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
        private readonly Random _random;

        private FlashcardSet? _activeSet;
        private LearningQueue? _learningQueue;
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

            if (hadLegacyIds)
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

            EntityIdNormalizer.EnsureIds(list);
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
                _learningQueue = LearningQueue.CreateShuffled(_activeSet.Flashcards, _random);
                _isQuickLessonDone = false;
            }
            else if (rebuildIfEmpty && !_learningQueue.HasCards)
            {
                _learningQueue = LearningQueue.CreateShuffled(_activeSet.Flashcards, _random);
            }

            return _learningQueue;
        }

        /// <summary>True when a queue exists and has no cards (session drained it).</summary>
        public bool IsLearningQueueEmpty => _learningQueue != null && !_learningQueue.HasCards;

        public bool IsQuickLessonDone => _isQuickLessonDone;

        public void MarkQuickLessonDone()
        {
            _isQuickLessonDone = true;
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
                if (idToCard.TryGetValue(id, out var card))
                    ordered.Add(card);
            }

            _learningQueue = new LearningQueue(ordered);
        }

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
