"use client";

import { useEffect, useState } from "react";

type RouterItem = {
  id: string;
  companyId: string;
  name: string;
  host: string;
  username: string;
  status: string;
  lastError: string | null;
  createdAt: string;
};

export default function RoutersPage() {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<Record<string, any[]>>({});
  const [isCeo, setIsCeo] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => setIsCeo(d.user?.role === "BIZANET_CEO"))
      .catch(() => {});
  }, []);

  const fetchRouters = async () => {
    const res = await fetch("/api/routers");
    if (!res.ok) {
      setError("Impossible de charger les routers");
      return;
    }
    const data = await res.json();
    setRouters(data.routers || []);
  };

  useEffect(() => {
    fetchRouters();
  }, []);

  const testRouter = async (id: string) => {
    const res = await fetch(`/api/routers/${id}/test`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      alert("Test réussi!");
    } else {
      alert(`Erreur: ${data.error || "Échec"}`);
    }
    fetchRouters();
  };

  const getActiveUsers = async (id: string) => {
    const res = await fetch(`/api/routers/${id}/active-users`);
    if (res.ok) {
      const data = await res.json();
      setActiveUsers((prev) => ({ ...prev, [id]: data.activeUsers }));
    } else {
      alert("Erreur lors de la récupération des utilisateurs actifs");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Routers</h1>
      {error ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
      <div className="card p-5 overflow-x-auto">
        <table className="min-w-[800px] text-left text-sm">
          <thead className="text-xs uppercase text-white/50">
            <tr>
              <th className="py-2 pr-4">name</th>
              <th className="py-2 pr-4">host</th>
              <th className="py-2 pr-4">status</th>
              {isCeo && <th className="py-2 pr-4">users connectés</th>}
              {isCeo && <th className="py-2 pr-4">actions</th>}
            </tr>
          </thead>
          <tbody>
            {routers.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="py-3 pr-4 text-white/90">{r.name}</td>
                <td className="py-3 pr-4 text-white/70">{r.host}</td>
                <td className="py-3 pr-4">
                  <span className={`px-2 py-1 rounded text-xs ${r.status === 'ONLINE' ? 'bg-green-500/20 text-green-300' : r.status === 'OFFLINE' ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-gray-300'}`}>
                    {r.status}
                  </span>
                  {r.lastError && <p className="text-red-400 text-xs mt-1 max-w-[200px] truncate" title={r.lastError}>{r.lastError}</p>}
                </td>
                {isCeo && (
                  <td className="py-3 pr-4 text-white/70">
                    {activeUsers[r.id] ? activeUsers[r.id].length : "-"}
                  </td>
                )}
                {isCeo && (
                  <td className="py-3 pr-4 flex gap-2">
                    <button 
                      onClick={() => testRouter(r.id)}
                      className="px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-600/30 transition text-xs"
                    >
                      Test
                    </button>
                    <button 
                      onClick={() => getActiveUsers(r.id)}
                      className="px-3 py-1 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded hover:bg-purple-600/30 transition text-xs"
                    >
                      Get Users
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
