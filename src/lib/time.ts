import { DurationUnit } from "@prisma/client";

export function calculateExpiration(startDate: Date, value: number, unit: DurationUnit): Date {
  const date = new Date(startDate);
  switch (unit) {
    case DurationUnit.MINUTE:
      date.setMinutes(date.getMinutes() + value);
      break;
    case DurationUnit.HOUR:
      date.setHours(date.getHours() + value);
      break;
    case DurationUnit.DAY:
      date.setDate(date.getDate() + value);
      break;
    case DurationUnit.MONTH:
      date.setMonth(date.getMonth() + value);
      break;
    case DurationUnit.YEAR:
      date.setFullYear(date.getFullYear() + value);
      break;
  }
  return date;
}

export function durationToSeconds(value: number, unit: DurationUnit): number {
  if (value <= 0) return 0;
  switch (unit) {
    case DurationUnit.MINUTE:
      return value * 60;
    case DurationUnit.HOUR:
      return value * 3600;
    case DurationUnit.DAY:
      return value * 86400;
    case DurationUnit.MONTH:
      return value * 30 * 86400;
    case DurationUnit.YEAR:
      return value * 365 * 86400;
    default:
      return value;
  }
}

/** Durée forfait → session-timeout MikroTik (ex. 00:30:00, 7d, none). */
export function toMikrotikSessionTimeout(
  durationValue: number,
  durationUnit: DurationUnit
): string {
  if (durationValue <= 0) return "none";

  const pad2 = (n: number) => String(n).padStart(2, "0");

  switch (durationUnit) {
    case DurationUnit.MINUTE: {
      const totalMinutes = durationValue;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${pad2(hours)}:${pad2(minutes)}:00`;
    }
    case DurationUnit.HOUR: {
      const totalMinutes = durationValue * 60;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${pad2(hours)}:${pad2(minutes)}:00`;
    }
    case DurationUnit.DAY:
      return `${durationValue}d`;
    case DurationUnit.MONTH:
      return `${durationValue * 30}d`;
    case DurationUnit.YEAR:
      return `${durationValue * 365}d`;
    default:
      return `${durationValue}d`;
  }
}

export function formatDuration(value: number, unit: DurationUnit): string {
  switch (unit) {
    case DurationUnit.MINUTE:
      return `${value} minute${value > 1 ? 's' : ''}`;
    case DurationUnit.HOUR:
      return `${value} heure${value > 1 ? 's' : ''}`;
    case DurationUnit.DAY:
      return `${value} jour${value > 1 ? 's' : ''}`;
    case DurationUnit.MONTH:
      return `${value} mois`;
    case DurationUnit.YEAR:
      return `${value} an${value > 1 ? 's' : ''}`;
    default:
      return `${value} ${unit}`;
  }
}
