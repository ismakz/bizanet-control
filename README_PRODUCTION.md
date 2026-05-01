# BizaNet Control - Production Readiness Guide

Ce guide documente les étapes requises pour déployer **BizaNet Control** sur un environnement de production (ex: VPS Linux, Vercel, AWS).

## 1. Prérequis Système
- **Node.js** >= 18.x
- **Base de données** : PostgreSQL (Recommandé pour la production)
- **Serveur web** : Nginx ou Apache (si déploiement VPS)
- **Gestionnaire de processus** : PM2 (si déploiement VPS)

## 2. Variables d'Environnement
Copiez le fichier `.env.example` vers `.env` et remplissez les valeurs :

```bash
cp .env.example .env
```

Assurez-vous de définir un `JWT_SECRET` robuste (utilisez `openssl rand -base64 32`).

## 3. Migration de SQLite vers PostgreSQL (Optionnel mais Recommandé)
Actuellement, l'application utilise SQLite pour le développement. Pour passer en production avec PostgreSQL :

1. Modifiez `prisma/schema.prisma` :
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
2. Dans `.env`, définissez `DATABASE_URL="postgresql://user:password@localhost:5432/bizanet"`
3. Exécutez la migration initiale :
```bash
npx prisma migrate dev --name init
```

## 4. Déploiement

### Déploiement sur Vercel
Vercel est la plateforme la plus simple pour déployer Next.js.
1. Poussez le code sur GitHub.
2. Liez le dépôt sur Vercel.
3. Configurez les variables d'environnement dans les paramètres du projet Vercel.
4. Déployez !

### Déploiement sur un VPS Ubuntu avec PM2
1. Clonez le dépôt et installez les dépendances :
```bash
npm install
```
2. Construisez l'application de production :
```bash
npm run build
```
3. Démarrez avec PM2 :
```bash
pm2 start npm --name "bizanet-control" -- start
```
4. Configurez un reverse proxy Nginx pointant vers le port 3000.

## 5. Cron Jobs (Automatisations)
L'application possède une route API pour expirer automatiquement les clients :
`GET /api/cron/expire-customers`

Vous devez configurer un service externe pour l'appeler périodiquement (ex: toutes les nuits à 00:00).
- **Via Vercel Cron** : Configurez le fichier `vercel.json`.
- **Via VPS (Crontab)** : `0 0 * * * curl -X GET https://votre-domaine.com/api/cron/expire-customers`

## 6. Sécurité MikroTik
- Assurez-vous que les routeurs MikroTik acceptent les connexions API uniquement depuis l'adresse IP de votre serveur de production BizaNet (règle Firewall).
- Utilisez un utilisateur API restreint sur MikroTik (limité aux permissions hotspot).

## 7. Sauvegardes
- Configurez un script `pg_dump` quotidien sur le serveur de base de données.
- Stockez les sauvegardes chiffrées sur un espace externe (ex: Amazon S3).
