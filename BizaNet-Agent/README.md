# BizaNet-Agent

Pont permanent **Vercel → PC local → MikroTik**.

```
Dashboard (Vercel)  →  URL publique tunnel  →  Agent :3010  →  MikroTik :8728
```

## Installation

```powershell
cd C:\Users\SAIBA\BizaNet-Agent
copy .env.example .env
# Éditer .env (MIKROTIK_PASSWORD, AGENT_API_KEY)
npm install
npm run dev
```

Production :

```powershell
npm run build
npm start
```

Service Windows (démarrage auto) :

```powershell
npm run service:install
```

## Sécurité

- `AGENT_API_KEY` obligatoire (`x-api-key` ou `?apiKey=`)
- `ALLOWED_IPS` : IPs autorisées (ajouter l’IP du tunnel Cloudflare/ngrok)
- `AGENT_JWT_SECRET` : si défini, exiger aussi `Authorization: Bearer <jwt>`

## Tunnel (obligatoire pour Vercel)

L’agent écoute en local. Exposez-le avec **Cloudflare Tunnel** ou **ngrok** :

```text
https://agent-votre-domaine.example.com  →  http://127.0.0.1:3010
```

Sur Vercel (BizaNet Control) :

```env
BIZANET_AGENT_URL=https://agent-votre-domaine.example.com
BIZANET_AGENT_API_KEY=même_clé_que_AGENT_API_KEY
BIZANET_AGENT_JWT_SECRET=optionnel_même_secret
```

## Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Santé agent + MikroTik |
| GET | `/router/status` | Statut connexion routeur |
| POST | `/hotspot/create-user` | Créer utilisateur hotspot |
| POST | `/hotspot/remove-user` | Supprimer utilisateur |
| POST | `/hotspot/upsert-profile` | Créer/mettre à jour profil |
| POST | `/hotspot/remove-profile` | Supprimer profil |

Heartbeat MikroTik : toutes les 30 s (configurable).
