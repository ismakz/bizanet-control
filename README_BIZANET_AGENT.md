# BizaNet-Agent — Pont cloud → MikroTik

## Architecture

```
Vercel (bizanetcontrol.online)
    ↓ HTTPS (tunnel Cloudflare / ngrok)
BizaNet-Agent (PC local, port 3010)
    ↓ RouterOS API :8728
MikroTik (192.168.88.1)
```

## Installation locale

```powershell
cd C:\Users\SAIBA\BizaNet-Agent
copy .env.example .env
# Renseigner MIKROTIK_PASSWORD et AGENT_API_KEY
npm install
npm run dev
```

Service Windows permanent :

```powershell
npm run build
npm run service:install
```

## Configuration Vercel

Variables sur le projet **bizanet-control** :

| Variable | Exemple |
|----------|---------|
| `BIZANET_AGENT_URL` | `https://agent.votredomaine.com` (URL tunnel) |
| `BIZANET_AGENT_API_KEY` | même que `AGENT_API_KEY` local |
| `BIZANET_AGENT_JWT_SECRET` | optionnel, même secret des deux côtés |

## Tunnel (exemple Cloudflare)

Exposez `http://127.0.0.1:3010` vers une URL publique HTTPS.  
Ajoutez l’IP du tunnel dans `ALLOWED_IPS` du fichier `.env` agent.

## Comportement cloud

- Génération de tickets : **toujours enregistrée en base**
- Si l’agent est hors ligne : message **« Agent local hors ligne »** (ticket créé, sync MikroTik différée)
- API de contrôle : `GET /api/agent/status`

## Santé

- Agent : `GET http://localhost:3010/health`
- Routeur : `GET http://localhost:3010/router/status`
