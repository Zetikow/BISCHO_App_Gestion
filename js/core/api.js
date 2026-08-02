// ===================================================================
// SYNC — récupère en un seul appel l'état de toutes les feuilles
// (endpoint action=getAll, voir apps-script/Sync.gs) et le maintient à
// jour par sondage régulier. Les appels d'écriture propres à chaque
// module (writeXxxApi) restent dans leur fichier respectif.
// ===================================================================

async function fetchAll() {
  let rawText = null;
  try {
    const params = new URLSearchParams({ action: "getAll", authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    if (!res.ok) throw new Error("bad response");
    rawText = await res.text();
    const data = JSON.parse(rawText);
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
    benevoles = (data.benevoles || []).slice(1).filter(r => r[0]);
    gouter = (data.gouter || []).slice(1).filter(r => r[0]);
    tableMarque = (data.tableMarque || []).slice(1).filter(r => r[0]);
    maillots = (data.maillots || []).slice(1).filter(r => r[0]);
    foodtrucks = (data.foodtrucks || []).slice(1).filter(r => r[0]);
    repasMenu = (data.repasMenu || []).slice(1).filter(r => r[0]);
    repasPrevu = (data.repasPrevu || []).slice(1).filter(r => r[0]);
    repasTarifs = (data.repasTarifs || []).slice(1).filter(r => r[0]);
    repasFinances = (data.repasFinances || []).slice(1).filter(r => r[0]);
    const parsedPE = parsePresenceEvenements(data.presenceEvenements || []);
    presenceEvenements = parsedPE.p;
    presenceJustifications = parsedPE.j;
    isOnline = true;
  } catch (err) {
    isOnline = false;
  }
  // Ne reconstruit l'affichage que si les données (ou le statut en ligne/hors ligne) ont
  // réellement changé depuis le dernier rendu — la plupart des sondages toutes les 10s ne
  // changent rien — et jamais si un formulaire est ouvert ou qu'un champ/menu déroulant a
  // actuellement le focus, sinon la synchro périodique se voit (saut de page) ou coupe une
  // saisie/un menu natif en cours. Les deux marqueurs "__lastFetchAllRaw"/"__lastRenderedOnline"
  // n'avancent que lors d'un rendu effectif : si un rendu est sauté pendant une saisie, le
  // prochain sondage retente dès que l'utilisateur relâche le champ, au lieu de rester bloqué sur
  // un affichage périmé (données ou bandeau "Hors ligne").
  const dataChanged = rawText !== null && rawText !== window.__lastFetchAllRaw;
  const onlineStatusChanged = isOnline !== window.__lastRenderedOnlineStatus;
  if ((dataChanged || onlineStatusChanged) && !isFormOpen() && !isActivelyEditing()) {
    if (rawText !== null) window.__lastFetchAllRaw = rawText;
    window.__lastRenderedOnlineStatus = isOnline;
    render();
  }
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
