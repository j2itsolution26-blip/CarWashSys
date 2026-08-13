/**
 * Business-day and human-numbering helpers.
 *
 * The daily customer counter resets at local midnight in the SHOP's timezone,
 * not the server's. On Vercel the server runs in UTC, so a wash at 7am Manila
 * would otherwise be filed under the previous business day and "Customer 1"
 * would restart in the middle of the morning.
 */

const DEFAULT_TIMEZONE = "Asia/Manila";

export function getBusinessTimezone(): string {
  return process.env.BUSINESS_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

/** `YYYY-MM-DD` for the given instant, as seen in the shop's timezone. */
export function businessDateKey(at: Date = new Date(), timeZone = getBusinessTimezone()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  // en-CA already formats as YYYY-MM-DD.
  return parts;
}

/**
 * The value stored in `transactions.businessDate` (a Postgres `date`).
 * Anchored at UTC midnight so the date component is stable regardless of how a
 * driver localises it on the way back out.
 */
export function businessDate(at: Date = new Date(), timeZone = getBusinessTimezone()): Date {
  return new Date(`${businessDateKey(at, timeZone)}T00:00:00.000Z`);
}

/** Inclusive start / exclusive end instants covering one shop day, in UTC. */
export function businessDayRange(at: Date = new Date(), timeZone = getBusinessTimezone()): {
  start: Date;
  end: Date;
} {
  const key = businessDateKey(at, timeZone);
  const offsetMinutes = timezoneOffsetMinutes(new Date(`${key}T12:00:00.000Z`), timeZone);
  const start = new Date(new Date(`${key}T00:00:00.000Z`).getTime() - offsetMinutes * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

/**
 * Minutes that `timeZone` is ahead of UTC at the given instant.
 * Derived from Intl rather than hardcoded so DST-observing zones keep working
 * if the business ever operates outside the Philippines.
 */
function timezoneOffsetMinutes(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(at).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** `1` → `TXN-000001`. Six digits covers ~1M transactions before widening. */
export function formatTransactionNumber(sequence: number): string {
  return `TXN-${String(sequence).padStart(6, "0")}`;
}

/** `1` → `Customer 1`. The only "customer identity" this system collects. */
export function formatCustomerLabel(customerNumber: number): string {
  return `Customer ${customerNumber}`;
}

export function formatDateTime(value: Date | string, timeZone = getBusinessTimezone()): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateOnly(value: Date | string, timeZone = getBusinessTimezone()): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone, dateStyle: "long" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

export function formatTimeOnly(value: Date | string, timeZone = getBusinessTimezone()): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone, timeStyle: "short" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}
