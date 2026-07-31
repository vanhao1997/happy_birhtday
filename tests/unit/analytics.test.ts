import { describe, expect, it } from "vitest";
import {
  buildCampaignAnalytics,
  type AnalyticsEvent,
  type AnalyticsRecipient,
  type AnalyticsSession,
} from "@/lib/birthday/analytics";

const recipients: AnalyticsRecipient[] = [
  { id: "recipient-1", displayName: "Mai" },
  { id: "recipient-2", displayName: "Quân" },
  { id: "recipient-3", displayName: "Hương" },
];

const sessions: AnalyticsSession[] = [
  {
    id: "session-1",
    recipientId: "recipient-1",
    status: "completed",
    completedChapters: 4,
    startedAt: "2026-08-01T02:00:00.000Z",
    completedAt: "2026-08-01T02:06:00.000Z",
    voucherRevealedAt: "2026-08-01T02:06:10.000Z",
    lastSeenAt: "2026-08-01T02:06:10.000Z",
  },
  {
    id: "session-2",
    recipientId: "recipient-2",
    status: "active",
    completedChapters: 2,
    startedAt: "2026-08-01T03:00:00.000Z",
    completedAt: null,
    voucherRevealedAt: null,
    lastSeenAt: "2026-08-01T03:02:00.000Z",
  },
];

const events: AnalyticsEvent[] = [
  { eventName: "session_started", sessionId: "session-1" },
  { eventName: "session_started", sessionId: "session-2" },
  { eventName: "voucher_revealed", sessionId: "session-1" },
  { eventName: "voucher_revealed", sessionId: "session-1" },
  { eventName: "quest_started", sessionId: "session-1", payload: { checkpointId: "childhood-home" } },
  { eventName: "quest_started", sessionId: "session-1", payload: { checkpointId: "childhood-home" } },
  { eventName: "checkpoint_reached", sessionId: "session-1", payload: { checkpointId: "childhood-home" } },
  { eventName: "quest_objective_completed", sessionId: "session-1", payload: { nodeId: "childhood-home" } },
  { eventName: "memory_revealed", sessionId: "session-1", payload: { checkpointId: "childhood-home" } },
  { eventName: "memory_revealed", sessionId: "session-1", payload: { checkpointId: "childhood-home" } },
];

describe("campaign analytics", () => {
  it("calculates status, drop-off, rates, timezone, and event consistency", () => {
    const result = buildCampaignAnalytics({
      campaignId: "campaign-1",
      timezone: "Asia/Bangkok",
      recipients,
      sessions,
      events,
      refreshedAt: "2026-08-01T04:00:00.000Z",
    });

    expect(result.totals).toMatchObject({
      recipients: 3,
      sessionsStarted: 2,
      sessionsCompleted: 1,
      vouchersRevealed: 1,
      completionRate: 0.5,
      voucherRevealRate: 1,
      averageDurationMs: 360_000,
      questRetryRate: 0.5,
      revisitRate: 0.5,
    });
    expect(result.recipients.map((recipient) => recipient.status)).toEqual([
      "voucher_revealed",
      "in_progress",
      "not_started",
    ]);
    expect(result.chapterDropOff).toEqual([
      { chapterOrder: 1, arrived: 2, advanced: 2, dropOffRate: 0 },
      { chapterOrder: 2, arrived: 2, advanced: 2, dropOffRate: 0 },
      { chapterOrder: 3, arrived: 2, advanced: 1, dropOffRate: 0.5 },
      { chapterOrder: 4, arrived: 1, advanced: 1, dropOffRate: 0 },
    ]);
    expect(result.consistency).toEqual({
      sessionStartedEvents: 2,
      voucherRevealEvents: 1,
      matchesSessionSource: true,
    });
    expect(result.nodeDropOff[0]).toEqual({
      nodeId: "childhood-home",
      nodeOrder: 1,
      arrived: 1,
      completed: 1,
      dropOffRate: 0,
    });
    expect(result.timezone).toBe("Asia/Bangkok");
    expect(result.grain).toBe("campaign/recipient/chapter/day");
  });
});
