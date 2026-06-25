# Activer Google Agenda pour les rendez-vous

Le code est déjà en place mais **désactivé** tant que les 2 variables d'environnement
ci-dessous ne sont pas définies. Une fois activé :

- chaque demande crée un événement **« ⏳ DEMANDE — Nom »** (jaune) dans l'agenda de Laetitia,
  avec le lien Accepter/Refuser dans la description ;
- à l'acceptation, l'événement devient **« ✅ RDV — Nom »** (vert) à la bonne durée ;
- au refus, l'événement est supprimé ;
- les créneaux déjà occupés dans son agenda ne sont plus proposés (anti-doublon).

## 1. Projet + API (console Google Cloud)
1. https://console.cloud.google.com → créer un projet (ex. « laeti-rdv »).
2. « APIs & Services » → « Enable APIs » → activer **Google Calendar API**.

## 2. Compte de service + clé JSON
3. « IAM & Admin » → « Service Accounts » → **Create service account**
   (nom ex. « laeti-rdv-bot »). Pas besoin de rôle. Créer.
4. Ouvrir le compte de service → onglet **Keys** → **Add key → Create new key → JSON**.
   Un fichier `.json` se télécharge. **Garde-le, ne le commit jamais.**
5. Note l'**email** du compte de service (du type
   `laeti-rdv-bot@laeti-rdv.iam.gserviceaccount.com`).

## 3. Laetitia partage son agenda
6. Sur https://calendar.google.com (compte **laetibienfaits@gmail.com**) :
   Paramètres de son agenda principal → **Partager avec des personnes précises**
   → ajouter l'**email du compte de service** → autorisation
   **« Apporter des modifications aux événements »** → Envoyer.

## 4. Variables d'environnement (Coolify, app `laeti-bienfaits-admin`)
Comme pour `SMSMODE_API_KEY` :
- `GOOGLE_SERVICE_ACCOUNT` = **tout le contenu du fichier JSON sur une seule ligne**
  (copie/colle le JSON entier ; les `\n` de la clé privée doivent rester tels quels).
- `GOOGLE_CALENDAR_ID` = `laetibienfaits@gmail.com`

Puis **redéployer** l'app. C'est tout — l'intégration s'active automatiquement
(`google.enabled()` devient vrai). Le code : `site/backend/google.js`.

> Avantage de cette méthode (compte de service + partage) : pas d'OAuth, donc
> **pas d'expiration tous les 7 jours** et pas de validation Google à demander.
