# Stratégie de Sauvegarde (Backup) - BizaNet Control

Ce document détaille la procédure de sauvegarde pour la base de données PostgreSQL hébergée sur Neon, ainsi que la configuration Vercel.

## 1. Sauvegarde de la Base de Données (Neon)

Neon gère automatiquement des sauvegardes continues (Point-In-Time Recovery) grâce à son architecture serveur. Cependant, il est fortement recommandé de réaliser des exports réguliers pour garantir une totale indépendance.

### Procédure Manuelle via pg_dump

Vous aurez besoin de l'outil `pg_dump` (fourni avec PostgreSQL).

```bash
# Export complet de la base de données
pg_dump -h ep-delicate-hall-am9sdd56.c-5.us-east-1.aws.neon.tech \
        -U bizanet_admin \
        -d neondb \
        -F c \
        -f bizanet_backup_$(date +%F).dump
```

*Remplacez l'URL et l'utilisateur par ceux présents dans la variable `DATABASE_URL` de Vercel.*

### Fréquence Recommandée
- **Quotidienne** (Automatisé via un script cron local ou GitHub Actions).
- **Avant chaque déploiement majeur**.

### Restauration (pg_restore)

Si une restauration est nécessaire sur un nouveau cluster :
```bash
pg_restore -h <NOUVEAU_HOST> -U <USER> -d <DB_NAME> -1 bizanet_backup_YYYY-MM-DD.dump
```

## 2. Exports de Données Métier (CSV)

La plateforme BizaNet dispose désormais d'une API d'export CSV intégrée (`/api/export`) accessible uniquement par le CEO et les Company Admins.

Vous pouvez exporter :
- **Tokens** (`/api/export?entity=tokens`) : Liste des tokens générés, vendus, statut, risque.
- **Customers** (`/api/export?entity=customers`) : Liste des clients finaux.
- **Payments** (`/api/export?entity=payments`) : Historique financier.
- **AuditLogs** (`/api/export?entity=auditlogs`) : Traces d'activités.

Ces exports permettent un backup métier rapide lisible sur Excel.

## 3. Déploiement Vercel

Vercel ne stocke aucune donnée persistante (tout est en DB).
- En cas de crash Vercel, l'application peut être redéployée en 1 minute.
- Assurez-vous que les variables d'environnement (`DATABASE_URL`, `JWT_SECRET`, etc.) sont sauvegardées de manière sécurisée (ex: gestionnaire de mots de passe, 1Password, Vault).
