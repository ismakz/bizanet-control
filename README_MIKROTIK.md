# Configuration MikroTik pour BizaNet Control

Ce guide décrit la configuration terrain à appliquer sur vos routeurs MikroTik (RouterOS v6 ou v7) pour qu'ils s'intègrent parfaitement à la plateforme BizaNet Control.

## 1. Création de l'Utilisateur API

BizaNet communique avec votre routeur via l'API MikroTik (port 8728).

```routeros
/user group add name=bizanet policy=local,telnet,ssh,ftp,reboot,read,write,policy,test,winbox,password,web,sniff,sensitive,api,romon,dude,tikapp
/user add name=bizanet_api password=MON_SUPER_MOT_DE_PASSE group=bizanet
/ip service set api disabled=no
```

## 2. Configuration selon le Type d'Accès

### A. WiFi Hotspot
La configuration Hotspot classique de MikroTik est requise.
BizaNet utilisera `/ip hotspot user` pour créer et supprimer les comptes de connexion.
Assurez-vous qu'un serveur Hotspot est opérationnel sur l'interface WiFi.

**Fichier `login.html` (portail captif)** — remplacer le fichier sur le routeur par `mikrotik/login.html` du dépôt (WinBox → Files → dossier HTML du profil hotspot). Il redirige vers `https://bizanetcontrol.online/hotspot/login` en conservant `link-login`, `dst` (link-orig), `username` et `password`. Ne pas pointer vers `192.168.x.x:3000` ni `/hotspot`.

### B. Câble (Ethernet)
BizaNet utilise la méthode "Hybrid DHCP / Simple Queues".
1. Un serveur DHCP doit distribuer les adresses IP sur l'interface câblée.
2. BizaNet écoutera les `/ip dhcp-server lease` pour identifier l'appareil.
3. Lors de l'activation, BizaNet convertit le bail en statique (`make-static`) et crée une `/queue simple` ciblée sur l'adresse IP/MAC pour limiter la vitesse.

### C. PPPoE
1. Activez le serveur PPPoE sur l'interface souhaitée.
2. BizaNet s'occupera de générer les `/ppp profile` (avec `only-one=yes` et limitation de débit) ainsi que les `/ppp secret` correspondants aux tokens des clients.

## 3. Remarques de Sécurité

- Si vous utilisez une IP publique directe sur le routeur, pensez à bloquer le port 8728 depuis l'extérieur, et ne l'autoriser que depuis l'IP du serveur Vercel/BizaNet.
- Vérifiez que le NTP (Time) est correctement configuré sur le routeur pour éviter les soucis d'expiration de session.
