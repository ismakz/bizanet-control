type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

function stamp(): string {
  return new Date().toISOString();
}

export function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const base = `[${stamp()}] [${level}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    console.log(base, JSON.stringify(meta));
  } else {
    console.log(base);
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("INFO", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("WARN", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("ERROR", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log("DEBUG", msg, meta),
};
