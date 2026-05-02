"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Image as ImageIcon } from "lucide-react";

export default function CompanySettingsClient({ company }: { company: any }) {
  const router = useRouter();
  
  const [logoUrl, setLogoUrl] = useState(company.logoUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate size (500KB)
    if (file.size > 500 * 1024) {
      return setError("L'image ne doit pas dépasser 500 KB.");
    }

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return setError("Seuls les formats JPG, PNG et WEBP sont acceptés.");
    }

    setLoading(true);

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
        if (!res.ok) throw new Error("Erreur lors de la sauvegarde du logo");
        router.refresh();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-6 shadow-xl backdrop-blur-xl max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-cyan/10 rounded-lg">
          <ImageIcon className="w-5 h-5 text-cyan" />
        </div>
        <h2 className="text-lg font-semibold text-white">Logo de l'entreprise</h2>
      </div>

      <div className="flex flex-col items-center mb-6">
        <div className="relative group">
          <div className="w-32 h-32 rounded-2xl bg-black/20 border-2 border-white/10 flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-sm font-medium text-white/30 text-center px-4">Aucun logo<br/>(Par défaut BizaNet)</span>
            )}
          </div>
          
          <label className="absolute -bottom-3 -right-3 p-3 bg-cyan text-[#0B131E] rounded-xl cursor-pointer hover:bg-cyan/80 transition shadow-lg">
            <Camera className="w-5 h-5" />
            <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" onChange={handleImageChange} disabled={loading} />
          </label>
        </div>
        {loading && <span className="text-xs text-cyan mt-4">Chargement...</span>}
        {error && <span className="text-xs text-red-400 mt-4">{error}</span>}
      </div>

      <div className="text-xs text-white/50 text-center">
        <p>Formats acceptés : PNG, JPG, WEBP. Taille max : 500 KB.</p>
        <p className="mt-2">Ce logo apparaîtra sur les tickets et factures générés pour vos clients.</p>
      </div>
    </div>
  );
}
