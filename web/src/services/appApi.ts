const DEFAULT_API_BASE_URL = "http://localhost:5057";

export const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ||
  DEFAULT_API_BASE_URL;

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

export type ApiSetListItem = {
  id: string;
  externalId: string;
  ownerUserId: string | null;
  name: string;
  source: "User" | "ReadyMade";
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

export type ApiCardInputRequest = {
  front: string;
  back: string;
};

export type ApiCreateSetRequest = {
  name: string;
  cards?: ApiCardInputRequest[];
};

export type ApiUpdateSetRequest = {
  name: string;
};

export type ApiCreateCardRequest = ApiCardInputRequest;

export type ApiUpdateCardRequest = ApiCardInputRequest;

export type ApiDeleteSetResponse = {
  externalId: string;
  deleted: boolean;
  activeSetExternalId: string | null;
};

export type ApiDeleteCardResponse = {
  setExternalId: string;
  cardId: string;
  deleted: boolean;
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
    this.name = "AppApiError";
  }
}

export async function getAppState() {
  return requestJson<ApiAppState>("/api/app-state");
}

export async function getSets() {
  return requestJson<ApiSetListItem[]>("/api/sets");
}

export async function getSet(externalSetId: string) {
  return requestJson<ApiSetDetail>(`/api/sets/${encodeURIComponent(externalSetId)}`);
}

export async function saveActiveSet(externalSetId: string) {
  return requestJson<ApiActiveSetResponse>("/api/active-set", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ activeSetId: externalSetId }),
  });
}

export async function createSet(input: ApiCreateSetRequest) {
  return requestJson<ApiSetDetail>("/api/sets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function renameSet(externalSetId: string, input: ApiUpdateSetRequest) {
  return requestJson<ApiSetDetail>(`/api/sets/${encodeURIComponent(externalSetId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function deleteSet(externalSetId: string) {
  return requestJson<ApiDeleteSetResponse>(`/api/sets/${encodeURIComponent(externalSetId)}`, {
    method: "DELETE",
  });
}

export async function resetSetProgress(externalSetId: string) {
  return requestJson<ApiProgressSummary>(
    `/api/sets/${encodeURIComponent(externalSetId)}/reset-progress`,
    {
      method: "POST",
    },
  );
}

export async function addCard(externalSetId: string, input: ApiCreateCardRequest) {
  return requestJson<ApiFlashcard>(`/api/sets/${encodeURIComponent(externalSetId)}/cards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function updateCard(
  externalSetId: string,
  cardId: string,
  input: ApiUpdateCardRequest,
) {
  return requestJson<ApiFlashcard>(
    `/api/sets/${encodeURIComponent(externalSetId)}/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteCard(externalSetId: string, cardId: string) {
  return requestJson<ApiDeleteCardResponse>(
    `/api/sets/${encodeURIComponent(externalSetId)}/cards/${encodeURIComponent(cardId)}`,
    {
      method: "DELETE",
    },
  );
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBaseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new AppApiError(
      `Unable to reach the local API at ${apiBaseUrl}. Is SimpleFlashCards.Api running?`,
    );
  }

  if (!response.ok) {
    const errorResponse = await readErrorResponse(response);
    throw new AppApiError(
      getErrorMessage(response, errorResponse),
      response.status,
      errorResponse,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new AppApiError("Local API returned an invalid JSON response.", response.status);
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
