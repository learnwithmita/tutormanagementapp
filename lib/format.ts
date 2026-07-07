// Display formatting. Timezone is Asia/Singapore everywhere.

const SGT = "Asia/Singapore";

// Hours: whole numbers plain ("3"), halves as "1.5", other fractions to 2dp.
export function formatHours(hours: number): string {
  if (Number.isInteger(hours)) return String(hours);
  const rounded = Math.round(hours * 100) / 100;
  return String(rounded);
}

export function hoursFromMinutes(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

// "10 June" (day + month) in SGT.
export function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    timeZone: SGT,
    day: "numeric",
    month: "long",
  });
}

// "7 PM" or "8:30 PM" — 12-hour, no leading zero, no ":00" for whole hours.
export function formatTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: SGT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour");
  const minute = get("minute");
  const period = get("dayPeriod").toUpperCase();
  return minute === "00" ? `${hour} ${period}` : `${hour}:${minute} ${period}`;
}

// A lesson range: "10 June 7 PM - 8:30 PM".
export function formatLessonRange(startsAt: string, durationMin: number): string {
  const end = new Date(new Date(startsAt).getTime() + durationMin * 60_000);
  return `${formatDayMonth(startsAt)} ${formatTime(startsAt)} - ${formatTime(
    end.toISOString(),
  )}`;
}

// "Mon, 10 Jun 2026, 7:00 PM" — a fuller stamp for detail views.
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    timeZone: SGT,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// "10 Jun 2026" for a date-only value (payment/receipt dates).
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    timeZone: SGT,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Today's date in SGT as YYYY-MM-DD (for <input type="date"> defaults).
export function todaySGT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MODE_LABELS: Record<string, string> = {
  STUDENT_HOME: "Student's home",
  TUTOR_HOME: "My home",
  ONLINE: "Online",
};

export function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}
