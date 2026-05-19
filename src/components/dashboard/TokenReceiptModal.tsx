import { X, Printer, Copy, Wifi, Link as LinkIcon } from "lucide-react";
import { formatDuration } from "@/lib/time";
import { buildHotspotTicketLoginUrl } from "@/lib/hotspot-login-url";
import { QRCodeCanvas } from "qrcode.react";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.559 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

type TokenReceiptModalProps = {
  tokenData: any;
  onClose: () => void;
};

export function TokenReceiptModal({ tokenData, onClose }: TokenReceiptModalProps) {
  if (!tokenData) return null;

  const isHotspotWifi =
    !tokenData.plan?.accessType || tokenData.plan.accessType === "HOTSPOT_WIFI";
  const hotspotLoginUrl = buildHotspotTicketLoginUrl(tokenData.token);
  const activationUrl = isHotspotWifi
    ? hotspotLoginUrl
    : `${typeof window !== "undefined" ? window.location.origin : ""}/portal/activate?token=${tokenData.token}`;

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    const text = isHotspotWifi ? hotspotLoginUrl : tokenData.token;
    navigator.clipboard.writeText(text);
    alert(
      isHotspotWifi
        ? "Lien de connexion hotspot copié !"
        : "Code copié dans le presse-papier !"
    );
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activationUrl);
    alert("Lien d'activation copié !");
  };

  const handleWhatsApp = () => {
    const duration = formatDuration(tokenData.plan.durationValue, tokenData.plan.durationUnit);
    const linkLine = isHotspotWifi
      ? `👉 Connectez-vous au WiFi puis ouvrez :\n${hotspotLoginUrl}`
      : `👉 Activez ici :\n${activationUrl}`;
    const message = `Bonjour 👋\n\nVoici votre accès internet :\n\nCode : ${tokenData.token}\n\nForfait : ${tokenData.plan.name}\nDurée : ${duration}\n\n${linkLine}\n\nMerci 🙏`;
    
    const encodedMessage = encodeURIComponent(message);
    const phone = tokenData.assignedCustomer?.phone || "";

    if (phone) {
      window.open(`https://wa.me/${phone}?text=${encodedMessage}`, "_blank");
    } else {
      window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: "Code d'accès Internet",
      text: isHotspotWifi
        ? `Code WiFi : ${tokenData.token}\nForfait: ${tokenData.plan.name}\nConnexion: ${hotspotLoginUrl}`
        : `Voici votre code d'accès internet : ${tokenData.token}\nForfait: ${tokenData.plan.name}\nActivez-le sur le portail captif.`,
      url: isHotspotWifi ? hotspotLoginUrl : undefined,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Erreur lors du partage :", err);
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:bg-white print:p-0 print:block">
      {/* Container Principal (Visible écran + Impression) */}
      <div className="print-area relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none flex flex-col max-h-[95vh] print:max-h-none print:block">
        
        {/* Boutons d'action (Cachés à l'impression) */}
        <div className="absolute top-4 right-4 flex gap-2 print:hidden z-10">
          <button onClick={onClose} className="p-2 bg-black/5 hover:bg-black/10 rounded-full text-black/50 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Le Ticket à imprimer */}
        <div className="p-8 text-center text-black overflow-y-auto print:overflow-visible flex-1">
          {/* Header */}
          <div className="mb-6 space-y-1">
            <div className="flex justify-center mb-3">
              {tokenData.company.logoUrl ? (
                <img src={tokenData.company.logoUrl} alt="Logo Entreprise" className="h-16 max-w-[150px] object-contain" />
              ) : (
                <Wifi className="w-10 h-10 text-black" />
              )}
            </div>
            <h2 className="text-2xl font-bold uppercase tracking-widest">{tokenData.company.name}</h2>
            <p className="text-xs text-black/60 uppercase">{tokenData.company.city}</p>
          </div>

          <div className="border-t-2 border-dashed border-black/20 my-6"></div>

          {/* Détails Forfait */}
          <div className="space-y-2 mb-6">
            <h3 className="text-lg font-bold">{tokenData.plan.name}</h3>
            <div className="text-sm font-medium text-black/70">
              Vitesse : {tokenData.plan.downloadLimitMbps}Mbps / {tokenData.plan.uploadLimitMbps}Mbps
            </div>
            <div className="text-sm font-medium text-black/70">
              Durée : {formatDuration(tokenData.plan.durationValue, tokenData.plan.durationUnit)}
            </div>
            <div className="text-xl font-bold mt-2">
              {tokenData.price} {tokenData.currency}
            </div>
          </div>

          <div className="border-t-2 border-dashed border-black/20 my-6"></div>

          {/* Token (Très Grand) */}
          <div className="mb-6">
            <p className="text-xs font-bold uppercase text-black/50 mb-2">Code d'accès secret</p>
            <div className="bg-black/5 rounded-xl py-4 px-2 border-2 border-black/10 mb-4">
              <span className="font-mono text-3xl font-black tracking-[0.2em]">{tokenData.token}</span>
            </div>
            
            <div className="flex justify-center p-2 bg-white rounded-xl mx-auto w-max border-2 border-black/10">
              <QRCodeCanvas value={activationUrl} size={120} level="H" />
            </div>
          </div>

          {/* Instructions */}
          <div className="text-xs font-medium text-black/60 space-y-1 mb-6">
            {tokenData.plan.accessType === "PPPOE" ? (
              <>
                <p>1. Connectez le routeur au réseau</p>
                <p>2. Configurez la connexion PPPoE</p>
                <p>3. Nom d'utilisateur : {tokenData.token}</p>
                <p>4. Mot de passe : {tokenData.token}</p>
              </>
            ) : tokenData.plan.accessType === "WIRED_ETHERNET" ? (
              <>
                <p>1. Branchez votre câble réseau</p>
                <p>2. Ouvrez la page d'activation</p>
                <p>3. Entrez le code ou détectez votre appareil</p>
                <p>4. Internet activé</p>
              </>
            ) : (
              <>
                <p>1. Connectez-vous au WiFi hotspot</p>
                <p>2. Scannez le QR code (connexion auto)</p>
                <p>3. Ou ouvrez : login.bizanet</p>
                <p>4. Code : {tokenData.token}</p>
              </>
            )}
          </div>

          <div className="border-t-2 border-dashed border-black/20 my-6"></div>

          {/* Footer */}
          <div className="text-[10px] text-black/40 uppercase">
            <p>Support : {tokenData.company.ownerPhone || "Non renseigné"}</p>
            <p>Généré le {new Date(tokenData.createdAt).toLocaleString()}</p>
            <p className="mt-2">Propulsé par BizaNet Control</p>
          </div>
        </div>

        {/* Footer Actions (Caché à l'impression) */}
        <div className="bg-black/5 p-4 flex flex-col gap-2 print:hidden shrink-0">
          <button 
            onClick={handleWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white px-4 py-3 rounded-xl font-semibold hover:bg-[#128C7E] transition"
          >
            <WhatsAppIcon className="w-5 h-5" /> Envoyer WhatsApp
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 bg-black text-white px-4 py-3 rounded-xl font-semibold hover:bg-black/80 transition"
            >
              <Printer className="w-4 h-4" /> Imprimer
            </button>
            <button 
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 bg-black/10 text-black px-4 py-3 rounded-xl font-semibold hover:bg-black/20 transition"
            >
              <Copy className="w-4 h-4" /> Partager
            </button>
            <button 
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-2 bg-black/10 text-black px-4 py-3 rounded-xl font-semibold hover:bg-black/20 transition"
              title="Copier le lien d'activation"
            >
              <LinkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
