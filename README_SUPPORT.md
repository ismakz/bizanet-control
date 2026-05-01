# Guide BizaNet Control - Support Technique (CEO & Admins)

Le mode **Support Premium** (`/dashboard/support`) est un outil puissant pour diagnostiquer et résoudre les problèmes des clients finaux en temps réel.

## Recherche Globale (Global Search)
Entrez un numéro de téléphone, un Token (ex: `BN-A1B2-C3D4`) ou un nom de client dans la barre de recherche.

## Actions Possibles sur un Token
Si vous trouvez un token, vous verrez ses informations clés :
- **Statut** : `UNUSED`, `ACTIVE`, `EXPIRED`
- **Type d'accès** : WiFi, Câble, ou PPPoE.
- **Niveau de risque (Anti-Fraude)** : 
  - `NORMAL` : Tout va bien.
  - `WATCH` : Le token a été tenté sur plusieurs appareils. Surveillez ce comportement.
  - `BLOCKED` : Le token est bloqué suite à un abus. (Déblocage via l'interface).

## Actions Possibles sur un Client
Si un client paie mais n'a pas internet :
1. Cherchez le client.
2. Dépliez ses souscriptions pour voir l'état `networkActivationStatus`.
3. Si le statut est `FAILED` ou `PENDING`, utilisez le bouton **"Relancer l'activation réseau"**. Cela forcera BizaNet à envoyer la commande de création (`createHotspotUser`, `SimpleQueue`, ou `PPP Secret`) au routeur MikroTik.

## Alertes de Sécurité
L'onglet **Alertes** vous notifie si :
- Un routeur MikroTik perd sa connexion avec la plateforme (OFFLINE).
- Un script de Brute-Force tente de deviner les mots de passe (Trop d'échecs bloqués temporairement).
- Des activations réseaux échouent de façon répétée (indiquant un problème API sur RouterOS).
