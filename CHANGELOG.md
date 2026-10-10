# Journal des versions

## 0.5.2
- **Rendu 3D : caméra de suivi** : en suivi ou en mode Visiter, la caméra se place derrière l'agent, regarde dans sa direction et tourne avec lui (glisser pour décaler la vue). Elle se rapproche quand un mur la masque, et les bulles proches de la caméra rétrécissent.
- **Rendu 3D : expérimental** : le réglage `renderer` est signalé comme expérimental, avec la configuration matérielle recommandée dans le README. Les salles sont éclairées la nuit.
- **Planification** : un agent qui lance un skill de planification (`brainstorming`, `writing-plans`, `architecture`…), écrit un fichier de plan ou de spec (`plans/`, `specs/`) ou est un sous-agent `Plan` / `architect` rejoint la salle de plan, même hors mode plan. Il y reste tant qu'il ne modifie pas de code. Les autres skills s'affichent en « réfléchit ».
- **Outillage** : `npm run package` ajoute la section du CHANGELOG, change la version et construit le `.vsix` (`package:dev` pour un `.vsix` de test) ; les dossiers d'outils sont exclus du `.vsix` ; `allowScripts` pour npm 12.

## 0.5.1
- **Rendu 3D : zoom et commandes** : la barre de zoom (−, curseur, niveau), les touches `+` `-` `0`, `F` `L` `P`, les boutons de zones, le suivi d'un agent (double-clic), le zoom par double-clic et le mode Visiter fonctionnent désormais en 3D. Le visiteur est visible dans la scène.
- **Rendu 3D : écrans animés** : les écrans des bureaux, du lead, de la borne d'arcade et le kanban de la salle de plan reprennent les animations du rendu pixel selon l'état de l'agent.
- **Rendu 3D : lisibilité** : étiquettes à taille constante à l'écran avec ligne d'état (survol, sélection ou zoom ≥ 3×), anneaux de survol et de sélection, bulles qui pulsent, étoile du lead.
- **Rendu 3D : décor** : parquet, carrelage, tapis, claviers, plantes animées, rendu cinéma. Les lampes de bureau ne pèsent plus sur le rendu de jour.
- **Outillage** : cas de test 3D (jour, nuit, zoom, sélection et visite).

## 0.5.0
- **Rendu 3D expérimental** (Three.js) : réglage `realPixelAgent.renderer` (`pixel` par défaut, `3d`). Bureaux, salles vitrées, personnages animés, bulles d'état et ambiances jour / coucher de soleil / nuit. Glisser pour tourner, clic droit pour se déplacer, molette pour zoomer, clic sur un agent pour le sélectionner. Le changement de rendu recharge la vue immédiatement. Pas encore en 3D : visite, suivi d'un agent, minimap.
- **Outillage** : captures de test régénérées pour Playwright 1.64.

## 0.4.2
- **Salle de plan en mode auto** : un agent qui lance un skill de planification (`writing-plans`, `brainstorming`…) ou écrit un fichier « plan » rejoint la salle de plan, même sans mode plan.

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
