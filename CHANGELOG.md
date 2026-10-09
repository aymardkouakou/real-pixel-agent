# Journal des versions

## 0.4.1
- **Outillage** : Node 22 (`.nvmrc`, CI) ; mise à jour de `@vscode/vsce` 4, `esbuild` 0.28 et `playwright` 1.64.

## 0.4.0
- **Hooks Claude Code** (commande « Installer les hooks ») : permissions exactes (`PermissionRequest`), fin de tour, mode plan (`permission_mode`), fermeture de session, et lien automatique agent ↔ terminal par PID. Hooks asynchrones : ils ne ralentissent ni ne modifient Claude. Sans hooks, l'estimation par transcription reste active.
- **Scanner** : surveillance des fichiers (réaction immédiate) avec scan de secours toutes les 5 s, réévaluation des états sans I/O chaque seconde, lecture incrémentale des transcriptions (seuls les octets ajoutés).
- **Rendu** : seule la zone visible est redessinée ; minimap sur la couche statique.
- **Déplacements** : départs étalés lors des réunions, priorité de passage entre marcheurs.
- **Journal de la journée** (📊 ou `J`) : temps par agent et par état sur 7 jours, export CSV.
- **Son** discret à chaque nouvelle demande de permission.
- **Ambiances** jour / coucher de soleil / nuit (lampes de bureau), automatiques ou forcées.
- **Personnalisation** : renommer un agent, changer son apparence (🎲).
- **Annexe** : les agents des autres workspaces dans un bâtiment voisin (`showOtherWorkspaces`).
- **Qualité** : webview découpé en modules (`media/src`) assemblés par esbuild, tests de rendu par captures, test de fumée de l'extension, CI GitHub Actions avec publication du `.vsix` sur les tags.

## 0.3.0
- Renommage en **Real Pixel Agent**.
- Zoom continu (0,35×–10×) net à tous les niveaux, molette, pincement, curseur, double-clic, inertie au glisser.
- Cadence d'affichage adaptative, lectures du scanner réduites.

## 0.2.0
- Campus : bureau du lead, open space, salle de plan, lounge, réception ; pathfinding ; réunion automatique en mode plan ; navigation (caméra, minimap, mode visite).

## 0.1.0
- Première version : un bureau, un personnage par session Claude Code.
