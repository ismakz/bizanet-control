"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Camera, Image as ImageIcon } from "lucide-react";

type CompanySettingsClientProps = {
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
};

export default function CompanySettingsClient({
  company,
}: CompanySettingsClientProps) {
  const router = useRouter();

  const [companyName, setCompanyName] = useState(company.name);
  const [logoUrl, setLogoUrl] = useState(company.logoUrl);
  const [loadingLogo, setLoadingLogo] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    if (file.size > 500 * 1024) {
      return setError("L'image ne doit pas dépasser 500 KB.");
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return setError("Seuls les formats JPG, PNG et WEBP sont acceptés.");
    }

    setLoadingLogo(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setLogoUrl(base64);

      try {
        const res = await fetch(`/api/companies/${company.id}/branding`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logoUrl: base64 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Erreur lors de la sauvegarde du logo");
        }
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur logo");
      } finally {
        setLoadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompanyInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = companyName.trim();
    if (!trimmed) {
      setError("Le nom de l'entreprise est obligatoire.");
      return;
    }

    if (trimmed === company.name) {
      setSuccess("Nom de l'entreprise mis à jour avec succès.");
      return;
    }

    setLoadingSave(true);
    try {
      const res = await fetch(`/api/companies/${company.id}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || "Impossible d'enregistrer les informations entreprise"
        );
      }
      setCompanyName(data.company?.name ?? trimmed);
      setSuccess(
        data.message || "Nom de l'entreprise mis à jour avec succès."
      );
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de sauvegarde");
    } finally {
      setLoadingSave(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <form
        onSubmit={handleSaveCompanyInfo}
        className="rounded-xl border border-white/5 bg-white/5 p-6 shadow-xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-cyan/10 rounded-lg">
            <Building2 className="w-5 h-5 text-cyan" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Informations entreprise
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              Visible sur le dashboard, les tickets Wi-Fi, rapports et impressions.
            </p>
          </div>
        </div>

        {success ? (
          <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">
            {success}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-xs font-medium text-white/70">
            Nom du cybercafé / entreprise
          </span>
          <input
            type="text"
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              setSuccess(null);
            }}
            maxLength={120}
            required
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder-white/30 transition focus:border-cyan focus:bg-black/40 focus:outline-none"
            placeholder="Ex. Cyber Café Horizon"
          />
        </label>

        <p className="mt-3 text-xs text-white/40">
          Ce champ modifie uniquement le nom de l&apos;entreprise, pas le nom de
          votre compte utilisateur.
        </p>

        <button
          type="submit"
          disabled={loadingSave}
          className="mt-6 w-full rounded-xl bg-cyan py-3 text-sm font-semibold text-[#050A10] transition hover:bg-cyan/90 disabled:opacity-50"
        >
          {loadingSave
            ? "Enregistrement…"
            : "Enregistrer les informations entreprise"}
        </button>
      </form>

      <div className="rounded-xl border border-white/5 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-cyan/10 rounded-lg">
            <ImageIcon className="w-5 h-5 text-cyan" />
          </div>
          <h2 className="text-lg font-semibold text-white">
            Logo de l&apos;entreprise
          </h2>
        </div>

        <div className="flex flex-col items-center mb-6">
          <div className="relative group">
            <div className="w-32 h-32 rounded-2xl bg-black/20 border-2 border-white/10 flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-sm font-medium text-white/30 text-center px-4">
                  Aucun logo
                  <br />
                  (Par défaut BizaNet)
                </span>
              )}
            </div>

            <label className="absolute -bottom-3 -right-3 p-3 bg-cyan text-[#0B131E] rounded-xl cursor-pointer hover:bg-cyan/80 transition shadow-lg">
              <Camera className="w-5 h-5" />
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp"
                className="hidden"
                onChange={handleImageChange}
                disabled={loadingLogo}
              />
            </label>
          </div>
          {loadingLogo ? (
            <span className="text-xs text-cyan mt-4">Chargement...</span>
          ) : null}
        </div>

        <div className="text-xs text-white/50 text-center">
          <p>Formats acceptés : PNG, JPG, WEBP. Taille max : 500 KB.</p>
          <p className="mt-2">
            Ce logo apparaîtra sur les tickets et factures générés pour vos
            clients.
          </p>
        </div>
      </div>
    </div>
  );
}
