import { APP_TIMEZONE } from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function bangkokDateKey(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

export function isWithinCampaignWindow(
  startsAt: string | null,
  endsAt: string | null,
  now = new Date(),
): boolean {
  if (startsAt && now < new Date(startsAt)) {
    return false;
  }

  if (endsAt && now > new Date(endsAt)) {
    return false;
  }

  return true;
}
