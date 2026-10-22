// Exécuté par VS Code à la désinstallation de l'extension (« vscode:uninstall ») : retire nos hooks
// de settings.json et le script copié, pour ne pas laisser de commande orpheline. Aucun import vscode.
import * as fs from 'fs';
import * as path from 'path';
import { claudeSettingsPath, dataDir, hooksStatus, readSettings, removeHooks, updateSettings } from './hooks';

export function cleanup(file = claudeSettingsPath(), dir = dataDir()): void {
  try {
    const s = readSettings(file); // JSON invalide : on ne touche à rien
    if (hooksStatus(s) !== 'none') updateSettings(removeHooks, file);
  } catch { /* ignore : une désinstallation ne doit jamais échouer */ }
  try { fs.rmSync(path.join(dir, 'real-pixel-agent-hook.js'), { force: true }); } catch { /* ignore */ }
  // les événements contiennent chemins et commandes : on ne les laisse pas derrière nous
  try { fs.rmSync(path.join(dir, 'events'), { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmdirSync(dir); } catch { /* non vide ou absent */ }
}

if (require.main === module) cleanup();
