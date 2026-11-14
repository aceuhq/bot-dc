# DSB — Bot Discord de modération

Projet JavaScript pour **Node.js 24 LTS**, **Discord.js v14**, **Discord Components V2** et **SQLite**. Les treize commandes utilisent le préfixe unique `&`. Le token est exclusivement lu depuis `process.env.DISCORD_TOKEN`.

## Installation Windows 11 / PowerShell

1. Installer Node.js **24 LTS** depuis https://nodejs.org et VS Code. Ouvrir le dossier `DSB` dans VS Code, puis son terminal PowerShell.
2. Dans https://discord.com/developers/applications, créer une application **DSB**, puis ouvrir **Bot** et générer un token. Ne jamais le publier ni le joindre à un rapport.
3. Dans **Bot → Privileged Gateway Intents**, activer **Message Content Intent** et **Server Members Intent**. Ce dernier sert au contrôle des arrivées et à la hiérarchie. Presence Intent n'est pas utilisé. Une application vérifiée peut nécessiter l'approbation Discord de ces intents.
4. Dans **OAuth2 → URL Generator**, sélectionner le scope **bot**. Aucune commande slash n'est utilisée. Accorder : **View Channels**, **Send Messages**, **Read Message History**, **Ban Members** ; **Manage Roles** uniquement si la synchronisation des grades est activée. Autoriser **Send Messages in Threads** si les commandes sont utilisées dans des fils. Il n'est pas nécessaire d'accorder Administrator ni Manage Messages pour Hakai.
5. Inviter le bot dans un serveur de test. Placer son rôle **au-dessus de tous les rôles qu'il devra sanctionner ou synchroniser**. Il ne peut pas bannir le propriétaire Discord.
6. Activer le mode développeur dans Discord, puis copier votre ID utilisateur et l'ID du salon de logs.

```powershell
node --version
npm ci
# Creer votre fichier local de configuration :
Copy-Item .env.example .env
code .env
```

Renseigner `.env` :

```dotenv
DISCORD_TOKEN=votre_token_prive
OWNER_ID=votre_identifiant_discord
LOG_CHANNEL_ID=identifiant_du_salon_de_logs
DATABASE_PATH=./data/dsb.sqlite
```

L'ID d'exemple est un exemple à remplacer. Exécuter toutes les commandes depuis la racine `DSB`.

```powershell
npm run check
npm test
npm start
```

`npm install` convient aussi ; `npm ci` utilise les versions exactes du lockfile fourni. Le SQLite utilisé est `node:sqlite`, inclus dans Node 24 : aucune compilation native ni installation Python/Visual Studio Build Tools n'est nécessaire. Son API peut encore être signalée expérimentale selon la révision de Node. Le projet masque uniquement cet avertissement au lancement, pas les erreurs du bot.

## Premier accès et récupération

`OWNER_ID` confère **toujours Super Dev**, indépendamment de SQLite ou des rôles Discord. Ce compte ouvre `&grade @membre`, sélectionne un grade puis confirme. Un membre sans entrée de grade peut utiliser `&help`. Le bouton de retrait de grade sélectionne Friends ; il faut ensuite confirmer.

Seul le propriétaire principal peut attribuer Super Dev. Aucun membre ne peut s'auto-modifier. Les Super Dev autres que le propriétaire ne peuvent pas modifier un autre Super Dev. Un Dev ne peut attribuer que System, Trusted et Friends. **Aucune procédure permettant de sanctionner un Dev n'est activée** : Dev et Super Dev sont toujours protégés. Le propriétaire Discord et le bot sont également protégés contre les sanctions.

Pour récupérer les accès : arrêter le bot, corriger `OWNER_ID` dans `.env`, relancer. Protéger l'accès local au dossier et aux sauvegardes.

## Commandes

| Commande | Grade minimum | Utilisation |
| --- | --- | --- |
| `&help` | Tous | Aide interactive, cinq catégories et commandes verrouillées identifiables |
| `&bl [@membre / ID]` | Trusted | Panel BL avec cible ; registre paginé sans argument |
| `&unbl @membre / ID / BL-XXXXXXXX` | Trusted | Confirmation du retrait |
| `&mybl` | Trusted | Historique personnel, tous statuts |
| `&clearmybl` | Trusted | Nettoyer les BL personnels encore autorisés |
| `&wipe [@membre / ID]` | System | Panel Wipe avec cible ; registre actif sans argument |
| `&unwipe @membre / ID / WIPE-XXXXXXXX` | System | Fermer le Wipe avant débannissement |
| `&mywipe` | System | Historique Wipe personnel |
| `&clearmywipe` | System | Nettoyer les Wipes personnels encore autorisés |
| `&grade @membre / ID` | Dev | Attribuer un grade autorisé, ou Friends |
| `&clearbl` | Super Dev | Nettoyage global BL avec formulaire de confirmation |
| `&clearwipe` | Super Dev | Nettoyage global Wipe : bouton puis formulaire |
| `&hakai @membre / ID` | Super Dev | Bouton puis saisie de HAKAI, bannissement définitif et suppression demandée sur sept jours |

Les cibles absentes du serveur sont acceptées lorsque l'API Discord le permet. Les numéros de dossier sont complets et comprennent le préfixe BL-/WIPE-.

### Choix d'autorisation documentés

- Un Trusted, System ou Dev ne peut retirer que **ses propres sanctions**, avec son grade actuel au moins égal au grade enregistré lors de l'émission. Un Super Dev peut retirer celles des autres membres. Cela s'applique aussi aux nettoyages personnels.
- Seul Super Dev peut gérer les permanentes, même si un ancien Super Dev a conservé ses dossiers après rétrogradation.
- Toute cible de grade égal ou supérieur est protégée. Les contrôles DSB sont distincts des permissions Discord ; lors d'un bannissement, le rôle Discord de l'exécutant doit aussi dépasser celui de la cible, sauf propriétaire Discord. Le rôle du bot doit toujours dépasser la cible présente.
- Les grades sont **autoritaires en SQLite**. Un rôle Discord attribué manuellement ne donne pas d'accès DSB. La synchronisation optionnelle projette les changements effectués dans DSB vers les rôles.
- Une cible sous sanction nécessitant un ban ne peut pas recevoir un nouveau grade tant que la sanction n'a pas été retirée. En cas de modification directe de la base provoquant une protection Dev/Super Dev, la réapplication du Wipe est suspendue et journalisée ; aucune exception de sanction Dev n'est créée implicitement.
- Les raisons Gluant et Glouton sont proposées pour BL. Le Wipe propose Infraction grave, Récidive, Raison personnelle et Pas de raison spécifique. Une raison personnelle exige System ; l'absence de raison spécifique exige Super Dev.
- Durées par défaut : Trusted 12 h, System 12 h/7 j, Dev 12 h/7 j/14 j, Super Dev toutes les précédentes et permanente.
- « Double compte » est une annotation déclarative enregistrée dans le motif. Aucun autre compte n'est sanctionné automatiquement et aucune détection d'identité n'est prétendue.

## Configuration

`config/config.js` : durées, raisons et seuils, délai d'expiration des panels, taille des pages, miniatures HTTPS, synchronisation des rôles et option `blacklistBan` (activée par défaut). Wipe et Hakai bannissent toujours. `config/permissions.js` centralise les grades et les seuils de commandes. `config/emojis.js` accepte les emojis Unicode ou `<:nom:ID>` / `<a:nom:ID>` utilisables par le bot.

Les miniatures sont facultatives ; les panels utilisent le conteneur sombre natif, des séparateurs, des menus et des boutons V2. Les trois captures citées dans le cahier des charges n'étaient pas jointes : la réalisation suit la description textuelle, sans prétendre reproduire des images non reçues. Une URL d'image peut être définie pour chaque miniature, dont Hakai.

Pour plusieurs serveurs, il est possible de définir les salons et les rôles par serveur. Arrêter le bot, copier puis modifier le JSON :

```powershell
Copy-Item config/guild-settings.example.json config/mon-serveur.json
code config/mon-serveur.json
node scripts/settings.js ID_SERVEUR config/mon-serveur.json
npm start
```

`roleIds` contient les identifiants des rôles Friends (1), Trusted (2), System (3), Dev (4) et Super Dev (5). Chaque rôle doit être distinct, non géré par une intégration, et placé sous celui du bot. Définir `syncRoles: true` pour activer la projection. Une erreur de rôle est annoncée et journalisée ; le grade SQLite reste inchangé si l'appel Discord échoue. Discord et SQLite n'offrent pas de transaction distribuée : un échec partiel peut laisser un rôle Discord à corriger manuellement. Puisque les rôles ne donnent pas de droits DSB, cela ne promeut pas le compte dans le bot.

## Persistance, erreurs et anti-débannissement

Les tables `users`, `grades`, `blacklists`, `wipes`, `hakai_history`, `moderation_logs`, `grade_history`, `guild_settings` et `sessions` sont créées automatiquement. La base utilise WAL, des transactions pour les écritures liées et des index uniques pour empêcher deux dossiers simultanés du même type pour la même cible. Une BL et un Wipe peuvent coexister.

Chaque dossier conserve la cible, son pseudo, l'auteur et son grade à l'émission, le motif, les durées/dates UTC, le statut, la révocation et les erreurs. Les audits ne sont jamais effacés par Clear. Les listes publiques montrent les dossiers actifs ; les historiques personnels montrent également les échecs et dossiers en attente, révoqués ou expirés. Les dates sont stockées en millisecondes UTC puis affichées par Discord dans le fuseau du lecteur.

- **pending** : opération réservée avant appel Discord. Une réponse réseau incertaine reste en attente et est réconciliée. Une erreur d'autorisation définitive devient **failed**. Un bannissement déjà appliqué avec le marqueur exact du dossier est reconnu après un crash sans rejouer la suppression Hakai.
- **active** : opération confirmée par Discord, ou registre confirmé lorsque la BL sans ban est explicitement configurée.
- **revoked / expired** : registre clos. Un champ durable `release_pending` conserve les débannissements à reprendre après erreur ou redémarrage.
- Les expirations et les reprises s'exécutent au démarrage puis toutes les **30 secondes**, sans timer par sanction. Aucune expiration automatique d'un dossier permanent.
- Avant un unban, le bot vérifie les autres dossiers BL/Wipe/Hakai encore actifs ou en attente nécessitant le ban. Il conserve aussi un ban externe : un ban préexistant n'est pas réétiqueté DSB par une BL ou un Wipe. Hakai préserve également le motif externe si la cible était déjà bannie.
- Wipe écoute `guildBanRemove`, les arrivées et vérifie le registre au démarrage puis périodiquement. Il tente de remettre le ban et journalise le résultat. Sans permissions, hors ligne ou retiré du serveur, le bot ne peut pas garantir le bannissement. La reprise ne supprime pas les traces d'incident.
- Hakai est conservé dans une table séparée et bloque les unbans automatiques liés à d'autres dossiers. Il n'a pas de commande de révocation dans ce cahier des charges, et n'utilise pas la protection anti-unban Wipe. Un administrateur Discord peut lever manuellement le ban Hakai ; son audit reste permanent.
- Clear fige les numéros de dossier du panel : aucune nouvelle sanction créée après son ouverture ne rejoint le lot. Les permissions sont revérifiées pour chaque dossier ; le bilan et les logs indiquent les réussites, échecs, dossiers déjà clos et débannissements à reprendre. Un arrêt au milieu d'un lot ne poursuit pas les dossiers pas encore traités : relancer Clear affiche les dossiers encore actifs. Les dossiers déjà clos reprennent leur éventuel unban grâce à `release_pending`.

Les sessions de panels persistent **30 minutes**, y compris après redémarrage, et appartiennent à leur créateur. Les contrôles sont vérifiés au clic et à l'exécution, puis les contrôles sont retirés après réussite/annulation. Un ancien panel expiré répond par une erreur privée. Les interactions sont acquittées avant la file de traitements pour ne pas attendre une opération concurrente. Les mutations sont sérialisées par serveur, et les identifiants de requête et index SQLite empêchent une double sanction. Une seule instance doit utiliser une base donnée : un verrou de processus bloque le second lancement.

Une sanction ne peut pas être annulée une fois l'appel Discord confirmé. Une opération incertaine ne doit pas être relancée sous un autre dossier : consulter l'historique et les journaux. Les erreurs n'affichent ni token, ni en-têtes HTTP.

## Tests et validation Discord

```powershell
npm run check
npm test
```

Les tests utilisent la vraie base SQLite et les vrais builders Discord.js. L'adaptateur des appels réseau est remplacé dans les tests uniquement : **le code de production utilise les méthodes Discord.js réelles**. Le rapport fourni distingue les tests locaux des essais encore nécessaires sur Discord.

Sur un serveur de test, avec des comptes et rôles distincts :

1. Vérifier `&help`, les cinq catégories et le grade affiché ; essayer les clics depuis un autre compte.
2. Attribuer Trusted, System et Dev ; vérifier les restrictions et le refus d'auto-promotion.
3. Trusted : créer une BL de 12 h avec Gluant/Glouton ; vérifier le ban dans Discord et le log. Essayer Wipe et une cible protégée : refus attendu. Annuler un autre panel : aucun ban.
4. System : créer un Wipe avec raison personnelle, puis retirer manuellement le ban dans Discord ; vérifier son rétablissement et l'audit. Retirer ensuite par `&unwipe` : le ban ne doit pas revenir.
5. Faire coexister une BL et un Wipe sur la même cible ; retirer la BL doit maintenir le ban. Retirer le dernier dossier doit le lever. Essayer un ban externe : il doit être conservé.
6. Pour tester rapidement une expiration, ajouter temporairement une durée de quelques dizaines de secondes dans `config/config.js`, de grade minimum adapté. Redémarrer avant l'échéance, attendre un passage du planificateur, vérifier le statut et le ban. Rétablir ensuite la configuration.
7. Tester toutes les listes avec plus de quatre dossiers ; recherche par ID, motif et pseudo, historique personnel, navigation et actualisation. Tester les mêmes interfaces simultanément avec deux modérateurs.
8. Essayer Clear et les nettoyages personnels ; vérifier phrase exacte, nombre de dossiers, conservation des audits et permissions actuelles. Retirer temporairement Ban Members pour constater les erreurs et reprises.
9. Sur une cible de test avec messages récents, confirmer Hakai deux fois. Vérifier le ban et les messages. Discord accepte `deleteMessageSeconds: 604800` mais ne renvoie pas le nombre supprimé : **le bot ne prétend pas effacer tous les anciens messages**.
10. Activer la synchronisation des rôles, vérifier les ajouts/retraits, puis tester un rôle hors hiérarchie et un rôle d'intégration. Vérifier que le grade DSB ne change pas lors d'un échec annoncé.

## Démarrage automatique Windows

Option simple : **Planificateur de tâches** Windows → Créer une tâche → déclencheur « À l'ouverture de session » ou « Au démarrage ». Action : démarrer le programme `C:\Program Files\nodejs\node.exe`, arguments `src/index.js`, champ **Démarrer dans** : chemin absolu du dossier `DSB`. Choisir un compte Windows ayant accès au dossier et au réseau. Cocher « Redémarrer en cas d'échec » selon vos besoins et « Ne pas démarrer une nouvelle instance ». Si la tâche démarre avant la connexion réseau, prévoir un délai. Éviter simultanément un lancement VS Code et le lancement automatique.

Pour garder une console et des logs visibles, lancer `npm start` dans PowerShell. Pour une tâche sans console, configurer la redirection dans un script PowerShell et prévoir une rotation de ses fichiers de logs.

## Sauvegarde et exploitation

Arrêter DSB proprement avec Ctrl+C, puis sauvegarder `data/` et la configuration dans un emplacement privé. Une copie brute SQLite pendant une écriture peut être incohérente : ne pas copier seulement `dsb.sqlite` en ignorant WAL/SHM pendant le fonctionnement. Restaurer le dossier avec le bot arrêté, relancer et vérifier les journaux de réconciliation. Ne jamais supprimer la base pour « débloquer » un Wipe.

Le fichier `.env`, les bases, les verrous et `node_modules` sont exclus de Git. Le depot contient `.env.example`, sans token ni donnee de serveur. Le fichier `.env` doit etre cree localement et ne doit jamais etre ajoute a Git. La connexion et les événements réels nécessitent votre configuration ; aucun accès Discord n'a été utilisé pour les tests locaux.
