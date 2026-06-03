import { withMikrotik } from "./connection";

type RosMenu = {
  where: (k: string, v: string) => {
    get: () => Promise<Record<string, unknown>[]>;
    set: (d: Record<string, string>) => Promise<void>;
  };
  add: (d: Record<string, string>) => Promise<void>;
  remove?: (id: string) => Promise<void>;
};

function menu(api: unknown, path: string): RosMenu {
  return (api as any).menu(path);
}

export async function upsertSimpleQueue(input: {
  name: string;
  target: string;
  maxLimit: string;
  comment?: string;
}): Promise<void> {
  await withMikrotik(async (api) => {
    const queueMenu = menu(api, "/queue simple");
    const existing = await queueMenu.where("name", input.name).get();
    const data: Record<string, string> = {
      name: input.name,
      target: input.target,
      "max-limit": input.maxLimit,
      comment: input.comment || "bizanet-queue",
      disabled: "no",
    };
    if (existing.length === 0) {
      await queueMenu.add(data);
    } else {
      await queueMenu.where("name", input.name).set(data);
    }
  });
}

export async function removeSimpleQueue(name: string): Promise<void> {
  await withMikrotik(async (api) => {
    const queueMenu = menu(api, "/queue simple");
    const rows = await queueMenu.where("name", name).get();
    for (const row of rows) {
      const id = row[".id"];
      if (typeof id === "string") await queueMenu.remove?.(id);
    }
  });
}
