# Guide BizaNet Control - Company Admin (Client SaaS)

Bienvenue sur la plateforme BizaNet Control. En tant que `COMPANY_ADMIN`, vous avez le contrôle total sur votre infrastructure de vente d'internet.

## 1. Gestion des Routeurs
La première étape consiste à connecter votre routeur MikroTik à BizaNet.
- Rendez-vous dans **Routeurs**.
- Ajoutez un nouveau routeur en renseignant son IP/Host, le port API (généralement 8728 ou le port configuré), et les identifiants d'un utilisateur RouterOS ayant les droits `full`.

## 2. Création de Forfaits (Plans)
BizaNet vous permet de vendre différents types d'accès :
- **WiFi Hotspot** : Idéal pour les lieux publics, restaurants, etc.
- **Câble Ethernet** : Pour les abonnés fixes (ex: immeubles). La détection de l'appareil se fait par adresse MAC (automatiquement ou manuellement).
- **PPPoE** : Pour les abonnés plus techniques avec leur propre routeur (identifiant et mot de passe requis).
- Réglez la durée (Minutes, Heures, Jours, Mois) et la limite de bande passante (Download/Upload).

## 3. Génération et Vente de Tokens
Les tokens sont vos "tickets" prépayés.
- Allez dans **Tokens > Générer**.
- Choisissez le forfait, la quantité et l'agent qui sera chargé de la vente.
- Vous pouvez imprimer ces tokens en masse (Format Tickets). Les instructions sur le ticket s'adaptent automatiquement au type d'accès (WiFi vs Câble vs PPPoE).

## 4. Gestion de vos Agents
- Dans **Agents**, invitez vos revendeurs.
- Validez leur **KYC** : Un agent ne peut pas retirer son argent (Wallet) tant que vous n'avez pas approuvé son identité (KYC Status = APPROVED).

## 5. Wallet & Commissions
Chaque agent possède un Wallet BizaNet.
- Lorsqu'un agent vend un token ou active un client, sa commission est ajoutée à son Wallet.
- Vous pouvez gérer les demandes de retraits des agents dans l'onglet **Retraits (Withdrawals)**.

## 6. Surveillance (Production Guardian)
- **Centre d'Alertes** : Surveillez les routeurs hors ligne ou les activités suspectes.
- **Support Premium** : Recherchez rapidement un client ou un token problématique.

Pour toute question technique, contactez le support BizaNet via votre dashboard.
