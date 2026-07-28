// ===================================================================
// SYNC — récupère en un seul appel l'état de toutes les feuilles
// (endpoint action=getAll, voir apps-script/Sync.gs) et le maintient à
// jour par sondage régulier. Les appels d'écriture propres à chaque
// module (writeXxxApi) restent dans leur fichier respectif.
// ===================================================================

async function fetchAll() {
  try {
    const params = new URLSearchParams({ action: "getAll", authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "auth");
    grid = parseSheetData(data.grid);
    comptes = data.comptes || [];
    presences = parsePresences(data.presences || []);
    paiements = (data.paiements || []).slice(1);
    evenements = (data.evenements || []).slice(1).filter(r => r[0]);
    actualites = (data.actualites || []).slice(1).filter(r => r[0]);
    covoiturage = (data.covoiturage || []).slice(1).filter(r => r[0]);
    osteoSlots = (data.osteoSlots || []).slice(1).filter(r => r[0]);
    osteoReservations = (data.osteoReservations || []).slice(1).filter(r => r[0]);
    compositions = (data.compositions || []).slice(1).filter(r => r[0]);
    compositionsMeta = (data.compositionsMeta || []).slice(1).filter(r => r[0]);
    selections = (data.selections || []).slice(1).filter(r => r[0]);
    const parsedPE = parsePresenceEvenements(data.presenceEvenements || []);
    presenceEvenements = parsedPE.p;
    presenceJustifications = parsedPE.j;
    isOnline = true;
  } catch (err) {
    isOnline = false;
  }
  // Ne pas reconstruire l'affichage si un formulaire de saisie est ouvert
  // (évite d'interrompre un sélecteur de date/heure natif en cours d'utilisation)
  if (!isFormOpen()) render();
}

function startPolling() {
  fetchAll();
  setInterval(() => {
    if (document.visibilityState === "visible") fetchAll();
  }, 10000);
  // Dès qu'on revient sur l'appli (changement d'onglet, réveil du téléphone), on rafraîchit
  // tout de suite plutôt que d'attendre le prochain cycle — évite la sensation de données figées.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session) fetchAll();
  });
}
