// ===================================================================
// BOOT — tout ce qui doit s'exécuter une seule fois au chargement de
// la page. Doit rester le DERNIER fichier chargé (après tous les
// modules), puisqu'il appelle immédiatement render() et démarre le
// sondage serveur / l'écran de connexion.
// ===================================================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// Ferme les menus (avatar / "Plus" de la barre de nav) au clic en dehors — écouteur global,
// posé une seule fois ici (pas dans attachEvents(), qui est rappelée à chaque rendu).
document.addEventListener("click", (e) => {
  if (window.__avatarMenuOpen && !e.target.closest(".avatar-wrap")) {
    window.__avatarMenuOpen = false;
    render();
  }
  if (window.__navExtraMenuOpen && !e.target.closest(".bn-select-wrap")) {
    window.__navExtraMenuOpen = false;
    render();
  }
  if (window.__evMenuOpen && !e.target.closest(".ev-kebab-wrap")) {
    window.__evMenuOpen = null;
    render();
  }
});

async function fetchLoginNoms(retriesLeft = 2) {
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=listNoms`);
    const data = await res.json();
    if (data.ok) {
      loginNoms = data.noms;
      if (!session) render();
    } else if (retriesLeft > 0) {
      setTimeout(() => fetchLoginNoms(retriesLeft - 1), 1500);
    }
  } catch (err) {
    // Le premier appel à Apps Script peut être lent à démarrer ("cold start") — on retente
    // avant d'abandonner sur la liste figée, pour ne pas rester bloqué sur une liste au hasard.
    if (retriesLeft > 0) setTimeout(() => fetchLoginNoms(retriesLeft - 1), 1500);
  }
}

grid = initGrid();
render();
if (session) startPolling();
else {
  fetchLoginNoms();
  // Un utilisateur déjà mémorisé sur cet appareil a forcément déjà défini son code par le
  // passé : pas besoin d'attendre un aller-retour serveur pour savoir s'il faut lui montrer
  // le champ code — on l'affiche tout de suite, ce qui accélère nettement l'écran de connexion.
  if (loginSelectedNom && loginPrefilledFromMemory) {
    loginNeedsSetup = false;
    render();
  } else if (loginSelectedNom) {
    checkAccountStatus(loginSelectedNom);
  }
}

initPullToRefresh();
