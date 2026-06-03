import { RouterOSClient } from "routeros-client";

import { config } from "../config";

import { logger } from "../logger";

import {

  formatMikrotikFailure,

  formatTcpUnreachable,

  testMikrotikTcp,

} from "./diagnostics";



export type RouterState = {

  connected: boolean;

  lastOkAt: string | null;

  lastError: string | null;

  reconnectAttempts: number;

  host: string;

  port: number;

};



const state: RouterState = {

  connected: false,

  lastOkAt: null,

  lastError: null,

  reconnectAttempts: 0,

  host: config.mikrotik.host,

  port: config.mikrotik.port,

};



let client: RouterOSClient | null = null;

let connecting = false;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

let lastTcpOk = false;



export function getRouterState(): RouterState {

  return { ...state };

}



/** Force une tentative de connexion et met à jour l'état (pour /router/status). */

export async function refreshMikrotikConnection(): Promise<RouterState> {

  try {

    await ensureMikrotikConnection();

  } catch {

    /* state.lastError déjà renseigné */

  }

  return getRouterState();

}



function getRouterOsClientOptions() {

  const { host, port, user, password } = config.mikrotik;



  if (port === 8728 && config.mikrotik.tls) {

    logger.warn(

      "MIKROTIK_TLS ignoré : port 8728 = API RouterOS 6.x non-SSL (pas api-ssl 8729)"

    );

  }

  if (port === 8729 && !config.mikrotik.tls) {

    logger.warn("Port 8729 : activer MIKROTIK_TLS=true pour api-ssl");

  }



  // RouterOS 6.49.x : API binaire sur 8728 sans TLS

  const useTls = config.mikrotik.tls && port === 8729;



  if (!password) {

    logger.warn("MIKROTIK_PASSWORD vide — login RouterOS probablement impossible");

  }



  return {

    host,

    user,

    password,

    port,

    timeout: 15,

    tls: useTls ? { rejectUnauthorized: false } : undefined,

  };

}



async function openClient(): Promise<RouterOSClient> {

  const opts = getRouterOsClientOptions();



  const tcp = await testMikrotikTcp(opts.host, opts.port, 5000);

  lastTcpOk = tcp.ok;



  if (!tcp.ok) {

    const msg = formatTcpUnreachable(tcp);

    throw new Error(msg);

  }



  const api = new RouterOSClient(opts);



  try {

    await api.connect();

    return api;

  } catch (e) {

    const msg = formatMikrotikFailure(e, "routeros");

    throw new Error(msg);

  }

}



function setConnectionError(message: string): void {

  state.connected = false;

  state.lastError = message;

}



export async function ensureMikrotikConnection(): Promise<RouterOSClient> {

  if (client && state.connected) {

    return client;

  }



  if (connecting) {

    await new Promise((r) => setTimeout(r, 500));

    if (client && state.connected) return client;

  }



  connecting = true;

  state.reconnectAttempts += 1;



  try {

    if (client) {

      try {

        client.close();

      } catch {

        /* ignore */

      }

      client = null;

    }



    logger.info("Connexion MikroTik…", {

      host: config.mikrotik.host,

      port: config.mikrotik.port,

      user: config.mikrotik.user,

      tls: false,

      api: "RouterOS-API-plain",

    });



    client = await openClient();

    state.connected = true;

    state.lastOkAt = new Date().toISOString();

    state.lastError = null;

    logger.info("MikroTik connecté", {

      host: config.mikrotik.host,

      port: config.mikrotik.port,

    });

    return client;

  } catch (e) {

    const message =

      e instanceof Error ? e.message : formatMikrotikFailure(e, lastTcpOk ? "routeros" : "tcp");

    setConnectionError(message);

    logger.error("Échec connexion MikroTik", { error: message });

    throw new Error(message);

  } finally {

    connecting = false;

  }

}



export async function withMikrotik<T>(

  fn: (api: RouterOSClient) => Promise<T>

): Promise<T> {

  const maxAttempts = 3;

  let lastErr: unknown;



  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    try {

      const api = await ensureMikrotikConnection();

      const result = await fn(api);

      state.lastOkAt = new Date().toISOString();

      return result;

    } catch (e) {

      lastErr = e;

      const message =

        e instanceof Error ? e.message : formatMikrotikFailure(e, lastTcpOk ? "routeros" : "tcp");

      setConnectionError(message);

      logger.warn(`Retry MikroTik ${attempt}/${maxAttempts}`, { error: message });

      if (client) {

        try {

          client.close();

        } catch {

          /* ignore */

        }

        client = null;

      }

      await new Promise((r) => setTimeout(r, config.reconnectMs));

    }

  }



  const finalMsg =

    lastErr instanceof Error

      ? lastErr.message

      : formatMikrotikFailure(lastErr, lastTcpOk ? "routeros" : "tcp");

  throw new Error(finalMsg);

}



async function heartbeatPing(): Promise<void> {

  try {

    await withMikrotik(async (api) => {

      const menu = (api as any).menu("/system/resource");

      await menu.get();

    });

    state.connected = true;

    state.lastOkAt = new Date().toISOString();

    logger.debug("Heartbeat OK");

  } catch (e) {

    const message =

      e instanceof Error ? e.message : formatMikrotikFailure(e, lastTcpOk ? "routeros" : "tcp");

    setConnectionError(message);

    logger.warn("Heartbeat échoué", { error: message });

  }

}



export function startMikrotikHeartbeat(): void {

  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {

    heartbeatPing().catch(() => undefined);

  }, config.heartbeatMs);

  heartbeatPing().catch(() => undefined);

  logger.info("Heartbeat MikroTik démarré", { intervalMs: config.heartbeatMs });

}



export function stopMikrotikHeartbeat(): void {

  if (heartbeatTimer) {

    clearInterval(heartbeatTimer);

    heartbeatTimer = null;

  }

}

