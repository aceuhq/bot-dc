# Rapport de validation

Validation locale effectuée avec Node.js 24.22.1, discord.js 14.28.1 et dotenv 17.4.2, versions exactes dans package-lock.json.

- `npm run check` : analyse syntaxique de tous les fichiers JavaScript du projet.
- `npm test` : 20 tests automatisés, tous réussis lors de la première exécution complète. Une nouvelle exécution est effectuée avant livraison.

## Scénarios couverts localement

| Scénario demandé | Vérification |
| --- | --- |
| Trusted ouvre et applique une BL autorisée | Autorisation, réservation SQLite, appel du gateway, statut actif |
| Trusted ne peut pas utiliser Wipe | Refus de la matrice de permissions |
| System peut utiliser Wipe et motif personnel | Permission et vrai formulaire Discord.js sérialisable |
| Dev attribue Trusted/System, pas Super Dev | Modifications réelles SQLite, historiques et refus |
| Super Dev accède aux commandes | Matrice complète et ouverture des treize commandes |
| Cibles protégées | Refus égal/supérieur, Dev et Super Dev |
| Menus BL réactifs | Interactions exécutées, état persistant et contenu du panel modifié |
| Annuler ne bannit pas | Aucun appel ban, session close |
| Wipe résiste à un unban manuel | Événement simulé, nouvel appel ban et audit |
| Unwipe ferme avant unban | Adaptateur vérifie le statut SQLite au moment de l'appel |
| Expirations et permanentes | Exécution du planificateur, clôture temporaire, permanente maintenue |
| Listes paginées et historiques | Jeux de dossiers distincts, deux pages, filtre auteur |
| Clear confirmé | Bouton, modal, mauvaise phrase refusée, bonne phrase exécutée, audit conservé |
| Hakai | Double confirmation, table distincte, option exacte `604800` transmise |
| Persistance | Fermeture et réouverture d'un vrai fichier SQLite avec sanctions, grades et session |
| Deux modérateurs | Sessions distinctes, requêtes concurrentes, un seul ban sur la même cible/type |
| Erreur réseau et erreur unban | État pending/réconciliation et reprise durable release_pending |
| Plusieurs sanctions / ban externe | Autre sanction conserve le ban ; ban externe non supprimé |
| Perte de permissions Wipe | Erreur journalisée sans réussite simulée |

## Limites de la validation

Aucun token ni serveur Discord n'a été fourni. Les appels REST et les événements du Gateway **n'ont pas été exécutés contre Discord**. Les tests remplacent explicitement l'adaptateur réseau ; ils valident les décisions, arguments, états SQLite, routages et builders, pas la disponibilité ni le rendu réel du service Discord.

Restent à vérifier sur serveur : rendu visuel exact, permissions et hiérarchie des rôles réels, réception des intents, latences/rate limits, suppression effective des messages Hakai, restauration après unban réel et synchronisation des rôles. La procédure détaillée est dans README.md. Aucun des trois screenshots de référence n'était présent dans la pièce jointe reçue.
