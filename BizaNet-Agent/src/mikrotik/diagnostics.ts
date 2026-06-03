import net from "net";
import { config } from "../config";
import { logger } from "../logger";

const WIN_ERRNO_HINT: Record<number, string> = {
  [-4078]: "ECONNREFUSED",
  [-4077]: "ENETUNREACH",
  [-4075]: "EHOSTUNREACH",
  [-4039]: "ETIMEDOUT",
};

export type TcpProbeResult =
  | { ok: true }
  | { ok: false; code?: string; message: string; errno?: number };

export function testMikrotikTcp(
  host = config.mikrotik.host,
  port = config.mikrotik.port,
  timeoutMs = 5000
): Promise<TcpProbeResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: TcpProbeResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      logger.info("[TCP TEST] success", { host, port });
      finish({ ok: true });
    });

    socket.once("timeout", () => {
      const message = `timeout après ${timeoutMs} ms`;
      logger.error("[TCP TEST ERROR]", { code: "ETIMEDOUT", message, host, port });
      finish({ ok: false, code: "ETIMEDOUT", message });
    });

    socket.once("error", (err: NodeJS.ErrnoException) => {
      logger.error("[TCP TEST ERROR]", {
        code: err.code,
        message: err.message,
        errno: err.errno,
        host,
        port,
      });
      finish({
        ok: false,
        code: err.code,
        message: err.message || String(err),
        errno: err.errno,
      });
    });

    socket.connect(port, host);
  });
}

function errnoLabel(errno: unknown): string {
  if (errno === undefined || errno === null) return "unknown";
  return String(errno);
}

function resolveErrnoCode(errno: unknown): string | undefined {
  if (typeof errno === "string" && errno.length > 0 && !/^-?\d+$/.test(errno)) {
    return errno;
  }
  const n =
    typeof errno === "number"
      ? errno
      : typeof errno === "string"
        ? Number(errno)
        : NaN;
  if (Number.isFinite(n) && WIN_ERRNO_HINT[n]) {
    return WIN_ERRNO_HINT[n];
  }
  return undefined;
}

export function describeRouterOsError(err: unknown): {
  name: string;
  errno: string;
  code: string;
  message: string;
} {
  if (err && typeof err === "object") {
    const e = err as {
      name?: string;
      errno?: string | number;
      message?: string;
      code?: string;
    };
    const errno = errnoLabel(e.errno);
    const code = e.code || resolveErrnoCode(e.errno) || errno;
    const message =
      (e.message && e.message.trim()) ||
      (code && code !== "unknown"
        ? `Erreur RouterOS/système (${code})`
        : `Erreur sans message (errno=${errno})`);
    return {
      name: e.name || "Error",
      errno,
      code,
      message,
    };
  }
  const message = String(err);
  return { name: "Error", errno: "unknown", code: "unknown", message };
}

export function formatMikrotikFailure(
  err: unknown,
  phase: "tcp" | "routeros"
): string {
  const { host, port, user } = config.mikrotik;
  const d = describeRouterOsError(err);

  if (phase === "tcp") {
    return (
      `TCP ${port} inaccessible depuis l'agent — ` +
      `host=${host} port=${port} username=${user} ` +
      `errorName=${d.name} errorCode=${d.code} errno=${d.errno} message=${d.message}`
    );
  }

  const isLogin =
    d.errno === "CANTLOGIN" ||
    d.code === "CANTLOGIN" ||
    /invalid|password|login|credential/i.test(d.message);

  const prefix = isLogin
    ? "TCP OK mais login RouterOS échoue"
    : "TCP OK mais connexion RouterOS échoue (librairie)";

  return (
    `${prefix} — host=${host} port=${port} username=${user} ` +
    `errorName=${d.name} errorCode=${d.code} errno=${d.errno} message=${d.message}`
  );
}

export function formatTcpUnreachable(tcp: Extract<TcpProbeResult, { ok: false }>): string {
  const { host, port, user } = config.mikrotik;
  const code = tcp.code || resolveErrnoCode(tcp.errno) || "unknown";
  const hint =
    code === "ECONNREFUSED"
      ? " (port fermé, API désactivée, ou pare-feu)"
      : code === "ETIMEDOUT"
        ? " (routeur injoignable ou filtrage)"
        : code === "EHOSTUNREACH" || code === "ENETUNREACH"
          ? " (réseau local / câble / VLAN)"
          : "";
  return (
    `TCP ${port} inaccessible depuis l'agent${hint} — ` +
    `host=${host} port=${port} username=${user} ` +
    `errorCode=${code} errno=${tcp.errno ?? "n/a"} message=${tcp.message}`
  );
}
