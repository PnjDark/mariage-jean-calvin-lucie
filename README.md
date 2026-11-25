# Invitation de mariage — Cloudflare

Site statique servi par Cloudflare Workers Static Assets, avec une petite API Worker qui lit un dossier photo public Google Drive. Le navigateur ne reçoit jamais la clé Google.

## Préparer Google Drive

1. Créer un dossier réservé aux photos publiées sur le site et le partager avec **Toute personne disposant du lien — Lecteur**. Les images du dossier seront publiques.
2. Activer l’API Google Drive dans un projet Google Cloud et créer une clé API restreinte à cette API.
3. Renseigner l’identifiant du dossier dans `vars.GOOGLE_DRIVE_FOLDER_ID` dans `wrangler.jsonc`.
4. Ajouter la clé au Worker comme secret avec `npx wrangler secret put GOOGLE_DRIVE_API_KEY`.

Le Worker ne liste que les images JPEG, PNG, GIF, WebP et AVIF directement présentes dans ce dossier. Il ne permet ni de téléverser, ni de modifier, ni de supprimer des fichiers. Les réponses sont mises en cache pour réduire les appels à Google Drive.

## Développer et déployer

```powershell
npm install
npx wrangler login
npm run dev
```

Configurer le dossier et le secret Google avant le déploiement :

```powershell
npx wrangler secret put GOOGLE_DRIVE_API_KEY
npm run deploy:check
npm run deploy
```

`npm run deploy` publie le site et son API sur le domaine `workers.dev` du compte Cloudflare connecté. Le nom du Worker est `jean-calvin-lucie-invitation`; il doit être disponible dans ce compte. Le site peut être relié à un domaine personnalisé depuis le tableau de bord Cloudflare.

Sans l’identifiant du dossier et la clé API, l’invitation se déploie mais la galerie répond explicitement qu’elle n’est pas encore configurée.
