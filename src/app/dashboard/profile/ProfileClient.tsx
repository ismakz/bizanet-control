"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function ProfileClient({ initialUser }: { initialUser: any }) {
  const router = useRouter();
  
  // Profile State
  const [profileImageUrl, setProfileImageUrl] = useState(initialUser.profileImageUrl);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{type: "error" | "success", text: string} | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageError(null);

    // Validate size (500KB)
    if (file.size > 500 * 1024) {
      return setImageError("L'image ne doit pas dépasser 500 KB.");
    }

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return setImageError("Seuls les formats JPG, PNG et WEBP sont acceptés.");
    }

    setLoadingImage(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setProfileImageUrl(base64);

      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileImageUrl: base64 }),
        });
        if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
        router.refresh();
      } catch (err: any) {
        setImageError(err.message);
      } finally {
        setLoadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);

    if (newPassword.length < 6) {
      return setPwdMessage({ type: "error", text: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
    }
    if (newPassword !== confirmPassword) {
      return setPwdMessage({ type: "error", text: "Les mots de passe ne correspondent pas." });
    }

    setLoadingPwd(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors du changement.");

      setPwdMessage({ type: "success", text: "Mot de passe mis à jour avec succès." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwdMessage({ type: "error", text: err.message });
    } finally {
      setLoadingPwd(false);
    }
  };

  // Helper to get initials
  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Informations Personnelles */}
      <div className="rounded-xl border border-white/5 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-white mb-6">Informations Personnelles</h2>
        
        <div className="flex flex-col items-center mb-6">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-cyan/10 border-2 border-cyan/30 flex items-center justify-center overflow-hidden">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-cyan">{getInitials(initialUser.fullName)}</span>
              )}
            </div>
            
            <label className="absolute bottom-0 right-0 p-2 bg-cyan text-[#0B131E] rounded-full cursor-pointer hover:bg-cyan/80 transition shadow-lg">
              <Camera className="w-4 h-4" />
              <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" onChange={handleImageChange} disabled={loadingImage} />
            </label>
          </div>
          {loadingImage && <span className="text-xs text-cyan mt-2">Chargement...</span>}
          {imageError && <span className="text-xs text-red-400 mt-2">{imageError}</span>}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/50 block mb-1">Nom complet</label>
            <div className="text-sm text-white font-medium bg-black/20 p-3 rounded-lg border border-white/5">{initialUser.fullName}</div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Téléphone</label>
            <div className="text-sm text-white font-medium bg-black/20 p-3 rounded-lg border border-white/5">{initialUser.phone}</div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Rôle</label>
            <div className="text-sm text-cyan font-medium bg-black/20 p-3 rounded-lg border border-white/5">{initialUser.role.replace("_", " ")}</div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Entreprise</label>
            <div className="text-sm text-white font-medium bg-black/20 p-3 rounded-lg border border-white/5">{initialUser.companyName}</div>
          </div>
        </div>
      </div>

      {/* Sécurité */}
      <div className="rounded-xl border border-white/5 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-cyan/10 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-cyan" />
          </div>
          <h2 className="text-lg font-semibold text-white">Changer le mot de passe</h2>
        </div>

        {pwdMessage && (
          <div className={`mb-6 rounded-xl border p-3 text-center text-sm ${pwdMessage.type === 'error' ? 'border-red-500/20 bg-red-500/10 text-red-200' : 'border-green-500/20 bg-green-500/10 text-green-200'}`}>
            {pwdMessage.text}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Mot de passe actuel</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder-white/30 transition focus:border-cyan focus:bg-black/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Nouveau mot de passe</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder-white/30 transition focus:border-cyan focus:bg-black/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Confirmer le nouveau mot de passe</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder-white/30 transition focus:border-cyan focus:bg-black/40 focus:outline-none"
            />
          </div>
          <div className="flex justify-end pt-2">
             <button type="button" onClick={() => setShowPassword(!showPassword)} className="flex items-center gap-1 text-xs text-white/50 hover:text-white">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPassword ? "Masquer" : "Afficher"}
            </button>
          </div>
          <button
            type="submit"
            disabled={loadingPwd}
            className="w-full rounded-xl bg-cyan py-3 text-sm font-semibold text-[#050A10] transition hover:bg-cyan/90 disabled:opacity-50 mt-4"
          >
            {loadingPwd ? "Mise à jour..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
