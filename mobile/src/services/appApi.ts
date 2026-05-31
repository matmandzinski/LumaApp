import { Platform } from 'react-native';

export const DEFAULT_API_BASE_URL = 'http://localhost:5057';
export const ANDROID_EMULATOR_API_BASE_URL = 'http://10.0.2.2:5057';

// iOS Simulator can use localhost. Android Emulator needs 10.0.2.2 to reach
// the host machine. Physical phones still need EXPO_PUBLIC_API_BASE_URL set to
// your computer LAN IP, for example http://192.168.x.x:5057.
const platformDefaultApiBaseUrl =
  Platform.OS === 'android' ? ANDROID_EMULATOR_API_BASE_URL : DEFAULT_API_BASE_URL;

export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') ?? platformDefaultApiBaseUrl;

export type ApiRequestOptions = RequestInit;

export type ApiProgressSummary = {
  externalSetId: string;
  internalSetId: string;
  userId: string;
  cardCount: number;
  newCount: number;
  learningCount: number;
  learnedCount: number;
  difficultCount: number;
};

export type ApiSetSource = 'User' | 'ReadyMade';

export type ApiSetListItem = {
  id: string;
  externalId: string;
  ownerUserId: string | null;
  name: string;
  source: ApiSetSource;
  cardCount: number;
  progressSummary: ApiProgressSummary;
};

export type ApiFlashcard = {
  id: string;
  front: string;
  back: string;
  learningStage: number;
  reviewAgainStreak: number;
  isLearned: boolean;
  lastReviewedAt: string | null;
  easeFactor?: number;
  repetitions?: number;
  intervalDays?: number;
  nextReviewAt?: string | null;
};

export type ApiSetDetail = ApiSetListItem & {
  flashcards: ApiFlashcard[];
};

export type ApiQuickLessonCompletion = {
  activeSetId: string;
  activeSetInternalId: string;
  activeSetExternalId: string;
  date: string;
  completed: boolean;
  completedAt: string | null;
};

export type ApiLessonSnapshot = {
  activeSetId: string;
  activeSetInternalId: string;
  activeSetExternalId: string;
  sessionType: string;
  queueCardIds: string[];
  currentCardIndex: number;
  reviewedCount: number;
  isRevealed: boolean;
  localDate: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiAppState = {
  activeSetId: string | null;
  activeSetInternalId: string | null;
  activeSetExternalId: string | null;
  localDate: string;
  todaysQuickLessonCompletion: ApiQuickLessonCompletion | null;
  lessonSnapshot: ApiLessonSnapshot | null;
};

export type ApiActiveSetResponse = {
  activeSetId: string;
  activeSetInternalId: string;
  activeSetExternalId: string;
};

export type ApiUpdateSetRequest = {
  name: string;
};

export type ApiCardInputRequest = {
  front: string;
  back: string;
};

export type ApiDeleteSetResponse = {
  externalId: string;
  deleted: boolean;
  activeSetExternalId: string | null;
};

export type ApiReviewDecision = 'know' | 'reviewAgain';

export type ApiReviewSessionType = 'quickLesson' | 'continueLearning';

export type ApiReviewCardRequest = {
  decision: ApiReviewDecision;
  sessionType: ApiReviewSessionType;
  reviewedAt?: string;
};

export type ApiReviewCardResponse = {
  externalSetId: string;
  internalSetId: string;
  cardId: string;
  decision: ApiReviewDecision;
  sessionType: ApiReviewSessionType;
  reviewedAt: string;
  card: ApiFlashcard;
  previousStage: number;
  nextStage: number;
  isLearned: boolean;
  progressSummary: ApiProgressSummary;
};

export type ApiErrorResponse = {
  message?: string;
  title?: string;
  detail?: string;
  status?: number;
  errors?: Record<string, string[]>;
};

export class AppApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly response?: ApiErrorResponse,
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

export async function getAppState() {
  return requestJson<ApiAppState>('/api/app-state');
}

export async function getSets() {
  return requestJson<ApiSetListItem[]>('/api/sets');
}

export async function getSet(externalSetId: string) {
  return requestJson<ApiSetDetail>(`/api/sets/${encodeURIComponent(externalSetId)}`);
}

export async function saveActiveSet(externalSetId: string) {
  return requestJson<ApiActiveSetResponse>('/api/active-set', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ activeSetId: externalSetId }),
  });
}

export async function resetSetProgress(externalSetId: string) {
  return requestJson<ApiProgressSummary>(
    `/api/sets/${encodeURIComponent(externalSetId)}/reset-progress`,
    {
      method: 'POST',
    },
  );
}

export async function renameSet(externalSetId: string, name: string) {
  return requestJson<ApiSetDetail>(`/api/sets/${encodeURIComponent(externalSetId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name } satisfies ApiUpdateSetRequest),
  });
}

export async function deleteSet(externalSetId: string) {
  return requestJson<ApiDeleteSetResponse>(`/api/sets/${encodeURIComponent(externalSetId)}`, {
    method: 'DELETE',
  });
}

export async function addCard(externalSetId: string, input: ApiCardInputRequest) {
  return requestJson<ApiFlashcard>(`/api/sets/${encodeURIComponent(externalSetId)}/cards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
}

export async function reviewCard(
  externalSetId: string,
  cardId: string,
  input: ApiReviewCardRequest,
) {
  return requestJson<ApiReviewCardResponse>(
    `/api/sets/${encodeURIComponent(externalSetId)}/cards/${encodeURIComponent(cardId)}/review`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
}

async function requestJson<T>(path: string, init?: ApiRequestOptions): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, init);
  } catch {
    throw new AppApiError(
      `Unable to reach the local API at ${apiBaseUrl}. Start SimpleFlashCards.Api and try again.`,
    );
  }

  if (!response.ok) {
    const errorResponse = await readErrorResponse(response);
    throw new AppApiError(getErrorMessage(response, errorResponse), response.status, errorResponse);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new AppApiError('Local API returned an invalid JSON response.', response.status);
  }
}

async function readErrorResponse(response: Response): Promise<ApiErrorResponse | undefined> {
  try {
    return (await response.clone().json()) as ApiErrorResponse;
  } catch {
    return undefined;
  }
}

function getErrorMessage(response: Response, errorResponse: ApiErrorResponse | undefined) {
  if (errorResponse?.message) return errorResponse.message;
  if (errorResponse?.detail) return errorResponse.detail;

  const validationError = Object.values(errorResponse?.errors ?? {})[0]?.[0];
  if (validationError) return validationError;

  if (errorResponse?.title) return errorResponse.title;

  return `Local API request failed: ${response.status} ${response.statusText}`;
}
