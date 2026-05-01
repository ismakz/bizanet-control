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
