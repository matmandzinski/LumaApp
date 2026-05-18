import { AppButton, Card, Heading, MetaText } from "../components/ui";

type QuickLessonCompletedScreenProps = {
  currentStreak: number;
  lastStudyDate: string | null;
  longestStreak: number;
  message?: string;
  onBackHome: () => void;
  onContinueLearning: () => void;
  totalStudyDays: number;
};

type WeekStreakDay = {
  dateNumber: number;
  isStudied: boolean;
  isToday: boolean;
  key: string;
  label: string;
};

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function QuickLessonCompletedScreen({
  currentStreak,
  lastStudyDate,
  longestStreak,
  message = "Quick lesson completed.",
  onBackHome,
  onContinueLearning,
  totalStudyDays,
}: QuickLessonCompletedScreenProps) {
  const weekDays = getWeekStreakDays(currentStreak, lastStudyDate);
  const title = getCompletionStreakTitle(currentStreak);

  return (
    <div className="screen-content completion-screen">
      <div className="completion-badge" aria-hidden>
        <CheckIcon />
      </div>
      <header className="centered-header">
        <Heading>Done!</Heading>
        <MetaText>{message}</MetaText>
      </header>

      <Card as="article" className="completion-streak-card">
        <span className="completion-streak-flame" aria-hidden>
          <FlameIcon />
        </span>
        <div className="completion-streak-copy">
          <p className="completion-streak-kicker">Streak</p>
          <p className="completion-streak-title">{title}</p>
          <MetaText>You kept your flow going. Tiny steps are adding up.</MetaText>
        </div>
        <div className="completion-week-strip" aria-label="Current week streak">
          {weekDays.map((day) => (
            <div className="completion-week-day" key={day.key}>
              <span className="completion-week-label">{day.label}</span>
              <span
                className={`completion-week-dot ${day.isStudied ? "studied" : ""} ${
                  day.isToday ? "today" : ""
                }`.trim()}
              >
                {day.isStudied ? <CheckIcon /> : day.dateNumber}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card as="article" className="completion-progress-card">
        <span className="completion-progress-icon" aria-hidden>
          <BookIcon />
        </span>
        <span className="completion-progress-copy">
          <p className="card-title">Progress saved</p>
          <MetaText>
            Longest streak: {formatDayCount(longestStreak)}. Total study days:{" "}
            {formatDayCount(totalStudyDays)}.
          </MetaText>
        </span>
      </Card>

      <AppButton fullWidth onClick={onBackHome}>
        Back to home
      </AppButton>
      <AppButton variant="secondary" fullWidth onClick={onContinueLearning}>
        Continue learning
      </AppButton>
      <p className="session-duration">Session duration: 4m 12s</p>
    </div>
  );
}

function getCompletionStreakTitle(currentStreak: number) {
  if (currentStreak <= 0) return "Start today";
  return formatDayCount(currentStreak);
}

function formatDayCount(days: number) {
  return days === 1 ? "1 day" : `${days} days`;
}

function getWeekStreakDays(currentStreak: number, lastStudyDate: string | null): WeekStreakDay[] {
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const monday = getWeekStart(today);
  const streakStart =
    lastStudyDate && currentStreak > 0
      ? getDateKeyWithOffset(lastStudyDate, -(currentStreak - 1))
      : null;

  return WEEKDAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = getLocalDateKey(date);
    const isStudied =
      Boolean(streakStart && lastStudyDate) &&
      key >= streakStart! &&
      key <= lastStudyDate! &&
      key <= todayKey;

    return {
      dateNumber: date.getDate(),
      isStudied,
      isToday: key === todayKey,
      key,
      label,
    };
  });
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  const dayOffset = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dayOffset);
  weekStart.setHours(0, 0, 0, 0);

  return weekStart;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateKeyWithOffset(dateKey: string, offsetDays: number) {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return getLocalDateKey();
  }

  return getLocalDateKey(new Date(year, month - 1, day + offsetDays));
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="M12.4 3.7c.2 2.9 2.7 4 4 6.2 1.7 2.8.8 7.2-2.9 8.4 1-2 .2-3.4-1.1-4.7-.6 2.4-2.3 3.4-4 4 .6-1.5-.2-2.6-.8-3.6-1.3-2.3-.5-5 1.8-6.6.4 1.5 1.2 2.4 2.1 3 .4-2.3-.8-4.2.9-6.7Z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="M6 4.75h9.25A2.75 2.75 0 0 1 18 7.5v11.75H7.75A2.75 2.75 0 0 1 5 16.5V5.75a1 1 0 0 1 1-1Z" />
      <path d="M8 8h6" />
      <path d="M8 11h5" />
      <path d="M7.75 19.25A2.75 2.75 0 0 1 5 16.5" />
    </svg>
  );
}
