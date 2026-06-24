# Console d'administration — Laëti'Bienfaits

Mini-backend Node qui sert la console d'admin et stocke le contenu du site + les
images sur un volume persistant. La cliente édite chaque texte / image de chaque
section depuis `/admin`, et le site public lit le contenu via l'API.

## Lancer en local

```bash
cd site/backend
npm install
ADMIN_PASSWORD=laeti node server.js
# Console : http://localhost:3000/admin   (mot de passe : laeti)
```

Les données sont écrites dans `./data/` (content.json + uploads/), ignoré par git.

## Endpoints

| Méthode | Route             | Auth | Rôle                                   |
|---------|-------------------|------|----------------------------------------|
| GET     | `/api/content`    | non  | Contenu courant (lu par le site)       |
| POST    | `/api/content`    | oui  | Enregistre le contenu                  |
| POST    | `/api/login`      | —    | `{password}` → `{token}` (HMAC, 12 h)  |
| POST    | `/api/upload`     | oui  | `multipart "file"` → `{url}`           |
| GET     | `/uploads/<f>`    | non  | Images / vidéos uploadées              |
| GET     | `/admin/`         | non  | Console (écran de connexion)           |

## Déploiement Coolify (à faire)

1. Pousser `site/backend/` dans un repo Git (ou base directory du monorepo).
2. Nouvelle application Coolify, build pack **Dockerfile**.
3. **Volume persistant** monté sur `/data` (indispensable : contenu + images).
4. Variables d'env : `ADMIN_PASSWORD` (mot de passe de la cliente), `PORT=3000`.
5. Domaine via le wildcard `*.lamidetlm.com` (ex. `admin.lamidetlm.com`), HTTPS auto.
6. Dans le site public (`hydrate.js`), pointer la base API sur l'URL du backend.

CORS est ouvert sur l'API (le contenu est public ; les écritures sont protégées
par le jeton). Le mot de passe par défaut `laeti` DOIT être changé en prod via
`ADMIN_PASSWORD`.

## Modifier les champs éditables

- `admin/schema.js` : ajoute / modifie les onglets et les champs.
- `admin/content.default.json` : valeurs par défaut (= contenu actuel du site).
- Les `key` doivent correspondre aux marqueurs `data-k` / `data-ki` du site
  (étape « brancher le site », à venir).
