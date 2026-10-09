// Corps HTML de la vue, partagé avec les tests de rendu (aucune dépendance à vscode).
export const BODY = `  <header id="bar">
    <span id="count">Aucun agent</span>
    <nav id="zones" aria-label="Zones">
      <button data-zone="lead" class="ghost" title="Bureau du lead (L)">★ Lead</button>
      <button data-zone="war" class="ghost" title="Salle de planification (P)">Plan</button>
      <button data-zone="open" class="ghost" title="Open space">Open space</button>
      <button data-zone="lounge" class="ghost" title="Lounge">Lounge</button>
      <button data-zone="annex" class="ghost" title="Annexe : agents des autres workspaces" hidden>Annexe</button>
      <button data-zone="all" class="ghost" title="Vue d'ensemble (F)">⤢</button>
    </nav>
    <span class="spacer"></span>
    <span class="zoom">
      <button id="zout" class="ghost" title="Dézoomer (-)">−</button>
      <input id="zrange" type="range" min="0" max="100" value="50" aria-label="Niveau de zoom" title="Zoom">
      <button id="zlvl" class="ghost" title="Revenir au zoom 3×">3×</button>
      <button id="zin" class="ghost" title="Zoomer (+)">+</button>
    </span>
    <button id="journal" class="ghost" title="Journal de la journée (J)">📊</button>
    <button id="hooksBadge" class="ghost badge" hidden title="Installer les hooks Claude Code pour un suivi exact">≈ estimé</button>
    <button id="visit" class="ghost" title="Se promener avec les flèches / ZQSD (V)">🚶 Visiter</button>
    <button id="add" title="Lancer Claude Code dans un nouveau terminal">＋ Agent</button>
  </header>
  <main id="stage">
    <canvas id="screen" tabindex="0" aria-label="Campus des agents"></canvas>
    <div id="empty" hidden>
      Aucun agent actif. Lance <code>claude</code> dans un terminal, ou
      <button id="add2">lance un agent</button>
    </div>
    <div id="hint">Glisser : se déplacer · Molette / pincement : zoom · Double-clic : zoomer ou suivre un agent · F : tout voir · V : visiter · J : journal</div>
    <section id="journalPanel" hidden aria-label="Journal de la journée">
      <header><strong>Journal</strong><select id="journalDay" aria-label="Jour"></select><span class="spacer"></span>
        <button id="journalCsv" class="secondary">Exporter CSV</button><button id="journalClose" class="secondary" title="Fermer">✕</button></header>
      <div id="journalBody"></div>
    </section>
  </main>
  <footer id="info" hidden></footer>`;
