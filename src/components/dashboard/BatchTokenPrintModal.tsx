import { X, Printer } from "lucide-react";
import { formatDuration } from "@/lib/time";
import { QRCodeCanvas } from "qrcode.react";

type BatchTokenPrintModalProps = {
  tokens: any[];
  onClose: () => void;
};

export function BatchTokenPrintModal({ tokens, onClose }: BatchTokenPrintModalProps) {
  if (!tokens || tokens.length === 0) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:bg-white print:p-0 print:block overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none mt-16 sm:mt-0 pb-20 print:pb-0">
        
        {/* En-tête de contrôle (Caché à l'impression) */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-md p-4 border-b flex items-center justify-between print:hidden z-10 shadow-sm">
          <h2 className="text-xl font-bold text-black flex-1">Impression par lot ({tokens.length} tokens)</h2>
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-xl font-semibold hover:bg-black/80 transition"
            >
              <Printer className="w-4 h-4" /> Imprimer tout
            </button>
            <button onClick={onClose} className="p-2 bg-black/5 hover:bg-black/10 rounded-full text-black/50 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Zone d'impression */}
        <div className="print-area">
          {tokens.map((tokenData, index) => {
            const activationUrl = `${window.location.origin}/portal/activate?token=${tokenData.token}`;
            
            return (
              <div 
                key={tokenData.id} 
                className={`p-8 text-center text-black border-b border-black/10 last:border-0 print:border-0 ${index !== tokens.length - 1 ? 'print:break-after-page' : ''}`}
                style={{ breakAfter: index !== tokens.length - 1 ? 'page' : 'auto' }}
              >
                <h2 className="text-2xl font-bold uppercase tracking-widest mb-1">{tokenData.company.name}</h2>
                <p className="text-xs text-black/60 uppercase mb-4">{tokenData.company.city}</p>
                
                <div className="border-t-2 border-dashed border-black/20 my-4"></div>

                <h3 className="text-lg font-bold">{tokenData.plan.name}</h3>
                <div className="text-sm font-medium text-black/70">
                  Durée : {formatDuration(tokenData.plan.durationValue, tokenData.plan.durationUnit)}
                </div>
                <div className="text-xl font-bold mt-2">
                  {tokenData.price} {tokenData.currency}
                </div>

                <div className="border-t-2 border-dashed border-black/20 my-4"></div>

                <p className="text-xs font-bold uppercase text-black/50 mb-2">Code d'accès secret</p>
                <div className="bg-black/5 rounded-xl py-3 px-2 border-2 border-black/10 mb-4 inline-block w-full max-w-xs">
                  <span className="font-mono text-3xl font-black tracking-[0.2em]">{tokenData.token}</span>
                </div>
                
                <div className="flex justify-center p-2 bg-white rounded-xl mx-auto w-max border-2 border-black/10 mb-4">
                  <QRCodeCanvas value={activationUrl} size={150} level="H" />
                </div>

                <div className="text-xs font-medium text-black/60 space-y-1 mb-4">
                  {tokenData.plan.accessType === "PPPOE" ? (
                    <>
                      <p>1. Connectez le routeur au réseau</p>
                      <p>2. Configurez la connexion PPPoE</p>
                      <p>3. Identifiant/Mot de passe : {tokenData.token}</p>
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
                      <p>1. Connectez-vous au WiFi BizaNet</p>
                      <p>2. Ouvrez la page d'activation si besoin</p>
                      <p>3. Scannez le QR ou entrez le token</p>
                      <p>4. Internet activé</p>
                    </>
                  )}
                </div>
                
                <div className="text-[10px] text-black/40 uppercase">
                  Généré le {new Date(tokenData.createdAt).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
