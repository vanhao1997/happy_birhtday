import { nowIso } from "./time";
import {
  REQUIRED_CHAPTER_COUNT,
  type AdminCampaignAnalyticsResult,
  type GameEvent,
  type GameSession,
  type Recipient,
} from "./types";

export type AnalyticsRecipient = Pick<Recipient, "id" | "displayName">;
export type AnalyticsSession = Pick<
  GameSession,
  | "id"
  | "recipientId"
  | "status"
  | "completedChapters"
  | "startedAt"
  | "completedAt"
  | "voucherRevealedAt"
  | "lastSeenAt"
>;
export type AnalyticsEvent = Pick<GameEvent, "eventName" | "sessionId"> & {
  payload?: GameEvent["payload"];
};

const MEMORY_NODE_IDS = [
  "childhood-home",
  "summer-playground",
  "old-classroom",
  "dream-road",
  "new-age-gate",
] as const;

export function buildCampaignAnalytics(input: {
  campaignId: string;
  timezone: string;
  recipients: AnalyticsRecipient[];
  sessions: AnalyticsSession[];
  events: AnalyticsEvent[];
  refreshedAt?: string;
}): AdminCampaignAnalyticsResult {
  const sessionsCompleted = input.sessions.filter((session) => session.status === "completed");
  const vouchersRevealed = input.sessions.filter((session) => session.voucherRevealedAt);
  const completedDurations = sessionsCompleted
    .filter((session) => session.completedAt)
    .map((session) => Date.parse(session.completedAt as string) - Date.parse(session.startedAt))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  const averageDurationMs = completedDurations.length
    ? Math.round(
        completedDurations.reduce((sum, duration) => sum + duration, 0) /
          completedDurations.length,
      )
    : null;

  const recipients = input.recipients.map((recipient) => {
    const sessions = input.sessions.filter((session) => session.recipientId === recipient.id);
    const status = sessions.some((session) => session.voucherRevealedAt)
      ? "voucher_revealed" as const
      : sessions.some((session) => session.status === "completed")
        ? "completed" as const
        : sessions.length > 0
          ? "in_progress" as const
          : "not_started" as const;
    const latestActivityAt = sessions.reduce<string | null>((latest, session) => {
      if (!latest || Date.parse(session.lastSeenAt) > Date.parse(latest)) {
        return session.lastSeenAt;
      }
      return latest;
    }, null);

    return {
      recipientId: recipient.id,
      displayName: recipient.displayName,
      status,
      sessionsStarted: sessions.length,
      latestActivityAt,
    };
  });

  const chapterDropOff = Array.from({ length: REQUIRED_CHAPTER_COUNT }, (_, index) => {
    const chapterOrder = index + 1;
    const arrived = input.sessions.filter(
      (session) => session.completedChapters >= chapterOrder - 1,
    ).length;
    const advanced = input.sessions.filter(
      (session) => session.completedChapters >= chapterOrder,
    ).length;

    return {
      chapterOrder,
      arrived,
      advanced,
      dropOffRate: arrived > 0 ? (arrived - advanced) / arrived : 0,
    };
  });

  const uniqueEventSessions = (eventName: string) => new Set(
    input.events
      .filter((event) => event.eventName === eventName && event.sessionId)
      .map((event) => event.sessionId as string),
  ).size;
  const sessionStartedEvents = uniqueEventSessions("session_started");
  const voucherRevealEvents = uniqueEventSessions("voucher_revealed");
  const eventNodeId = (event: AnalyticsEvent) => {
    const value = event.payload?.nodeId ?? event.payload?.checkpointId;
    return typeof value === "string" ? value : null;
  };
  const eventPairs = (eventName: string) => input.events.filter(
    (event) => event.eventName === eventName && event.sessionId && eventNodeId(event),
  );
  const uniquePairCount = (events: AnalyticsEvent[]) => new Set(
    events.map((event) => `${event.sessionId}:${eventNodeId(event)}`),
  ).size;
  const questStarts = eventPairs("quest_started");
  const memoryReveals = eventPairs("memory_revealed");
  const questRetryRate = questStarts.length > 0
    ? Math.max(0, questStarts.length - uniquePairCount(questStarts)) / questStarts.length
    : 0;
  const revisitRate = memoryReveals.length > 0
    ? Math.max(0, memoryReveals.length - uniquePairCount(memoryReveals)) / memoryReveals.length
    : 0;
  const nodeDropOff = MEMORY_NODE_IDS.map((nodeId, index) => {
    const arrived = new Set(input.events
      .filter((event) => (
        (event.eventName === "checkpoint_reached" || event.eventName === "quest_started")
        && event.sessionId
        && eventNodeId(event) === nodeId
      ))
      .map((event) => event.sessionId as string)).size;
    const completed = new Set(input.events
      .filter((event) => (
        event.eventName === "quest_objective_completed"
        && event.sessionId
        && eventNodeId(event) === nodeId
      ))
      .map((event) => event.sessionId as string)).size;
    return {
      nodeId,
      nodeOrder: index + 1,
      arrived,
      completed,
      dropOffRate: arrived > 0 ? Math.max(0, arrived - completed) / arrived : 0,
    };
  });

  return {
    campaignId: input.campaignId,
    timezone: input.timezone,
    grain: "campaign/recipient/chapter/day",
    refreshedAt: input.refreshedAt ?? nowIso(),
    refreshAfterSeconds: 60,
    recipients,
    totals: {
      recipients: input.recipients.length,
      sessionsStarted: input.sessions.length,
      sessionsCompleted: sessionsCompleted.length,
      vouchersRevealed: vouchersRevealed.length,
      completionRate: input.sessions.length > 0
        ? sessionsCompleted.length / input.sessions.length
        : 0,
      voucherRevealRate: sessionsCompleted.length > 0
        ? vouchersRevealed.length / sessionsCompleted.length
        : 0,
      averageDurationMs,
      questRetryRate,
      revisitRate,
    },
    chapterDropOff,
    nodeDropOff,
    consistency: {
      sessionStartedEvents,
      voucherRevealEvents,
      matchesSessionSource:
        sessionStartedEvents === input.sessions.length &&
        voucherRevealEvents === vouchersRevealed.length,
    },
  };
}
