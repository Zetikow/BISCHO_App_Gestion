// ===================================================================
// SYNC — endpoint "tout en un" utilisé par le frontend (startPolling)
// pour récupérer l'état de toutes les feuilles en un seul appel.
//
// Regroupe les ~23 lectures de feuilles en UN SEUL appel réseau via l'API
// Sheets avancée (Sheets.Spreadsheets.Values.batchGet), au lieu d'autant
// d'appels séparés ss.getSheetByName(...).getDataRange().getValues() —
// c'est ce qui rendait la connexion et le sondage (toutes les 10s) lents.
// Piège : contrairement à SpreadsheetApp.getValues() qui convertit
// automatiquement les cellules Date en objets Date JS, l'API avancée (avec
// valueRenderOption=UNFORMATTED_VALUE) renvoie ces cellules comme des
// NUMÉROS DE SÉRIE (jours depuis le 30/12/1899) — seules les colonnes
// Date/Heure natives d'OsteoSlots sont concernées ici (les autres feuilles
// stockent leurs dates en texte brut "yyyy-MM-dd", donc inchangées par
// UNFORMATTED_VALUE). Voir serialToDateString/serialToTimeString ci-dessous.
// ===================================================================

// Convertit un numéro de série Sheets (jours depuis le 30/12/1899, partie
// entière = date) en "yyyy-MM-dd", sans passer par un fuseau horaire — on
// construit le Date en UTC et on relit les champs UTC directement comme
// s'ils étaient "l'heure du mur" voulue par la feuille (évite tout décalage
// de fuseau qu'introduirait Utilities.formatDate).
function serialToDateString(serial) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convertit un numéro de série Sheets en "yyyy-MM-dd HH:mm" (date + heure dans
// la même cellule) — utilisé pour la colonne Date d'Actualites, écrite en texte
// par api_addActualite mais qu'appendRow laisse Sheets ré-interpréter en vraie
// cellule datetime, donc renvoyée en numéro de série par UNFORMATTED_VALUE.
function serialToDateTimeString(serial) {
  return `${serialToDateString(Math.floor(serial))} ${serialToTimeString(serial)}`;
}

// Convertit un numéro de série Sheets (partie fractionnaire = heure du jour)
// en "HH:mm".
function serialToTimeString(serial) {
  const fractionalDay = serial - Math.floor(serial);
  const totalMinutes = Math.round(fractionalDay * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const min = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Liste des feuilles lues par api_getAll : [nomFeuille, cléRésultat]. L'ordre n'a pas
// d'importance (on retrouve chaque plage par son index dans la réponse batchGet).
const GETALL_SHEETS = [
  ["Grid", "grid"],
  ["Comptes", "comptesRaw"],
  ["Presences", "presences"],
  ["Paiements", "paiementsRaw"],
  ["Evenements", "evenements"],
  ["PresenceEvenements", "presenceEvenements"],
  ["Actualites", "actualites"],
  ["Covoiturage", "covoiturage"],
  ["OsteoSlots", "osteoSlotsRaw"],
  ["OsteoReservations", "osteoReservationsRaw"],
  ["Compositions", "compositions"],
  ["CompositionsMeta", "compositionsMeta"],
  ["Selections", "selections"],
  ["SelectionsMeta", "selectionsMeta"],
  ["Benevoles", "benevoles"],
  ["Gouter", "gouter"],
  ["GouterOptions", "gouterOptions"],
  ["TableMarque", "tableMarque"],
  ["Maillots", "maillots"],
  ["RepasMenu", "repasMenu"],
  ["RepasPrevu", "repasPrevu"],
  ["RepasTarifs", "repasTarifs"],
  ["RepasFinances", "repasFinancesRaw"],
];

// action=getAll (ou par défaut) -> tout en un seul appel
// Sécurité : authentification obligatoire, codes PIN jamais renvoyés, Paiements réservé à l'Admin.
function api_getAll(ss, e) {
  const callerRole = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!callerRole) return jsonOut({ ok: false, error: "auth" });

  const osteoReservationsSheet = ss.getSheetByName("OsteoReservations");
  if (osteoReservationsSheet) ensureOsteoReservationsSchema(osteoReservationsSheet);

  // On ne demande à batchGet que les feuilles qui existent vraiment : lui référencer une feuille
  // absente ferait échouer TOUT l'appel (contrairement à ss.getSheetByName qui renvoie juste null).
  const existingSheetNames = new Set(ss.getSheets().map(s => s.getName()));
  const sheetsToFetch = GETALL_SHEETS.filter(([name]) => existingSheetNames.has(name));

  const result = {};
  GETALL_SHEETS.forEach(([, key]) => { result[key] = []; }); // défaut : [] pour toute feuille absente

  if (sheetsToFetch.length > 0) {
    const response = Sheets.Spreadsheets.Values.batchGet(ss.getId(), {
      ranges: sheetsToFetch.map(([name]) => name),
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    response.valueRanges.forEach((vr, i) => {
      const key = sheetsToFetch[i][1];
      result[key] = vr.values || [];
    });
  }

  const comptes = result.comptesRaw.map((row, i) => {
    if (i === 0) return row; // en-tête
    const copy = row.slice();
    copy[COL_CODE] = ""; // ne jamais renvoyer les codes PIN au client, même le sien
    return copy;
  });
  const paiements = hasRole(callerRole, "Admin") ? result.paiementsRaw : [];
  const osteoSlots = result.osteoSlotsRaw.map((row, i) => {
    if (i === 0) return row;
    const copy = row.slice();
    if (typeof copy[1] === "number") copy[1] = serialToDateString(copy[1]);
    if (typeof copy[2] === "number") copy[2] = serialToTimeString(copy[2]);
    return copy;
  });
  // Filet de sécurité : Evenements.gs force les colonnes Date/Heure en texte pour éviter que
  // Sheets ne les convertisse en vraies dates (voir setupEvenements), mais seulement sur les 500
  // premières lignes — d'anciens événements ou des lignes au-delà peuvent donc encore être des
  // cellules Date natives, renvoyées en numéro de série par UNFORMATTED_VALUE.
  const evenements = result.evenements.map((row, i) => {
    if (i === 0) return row;
    const copy = row.slice();
    if (typeof copy[1] === "number") copy[1] = serialToDateString(copy[1]);
    if (typeof copy[2] === "number") copy[2] = serialToTimeString(copy[2]);
    return copy;
  });
  // Ne renvoie JAMAIS la colonne "NotesEve" (notes privées d'Eve, voir Osteo.gs) via ce endpoint
  // générique chargé par absolument tout le monde (joueurs compris) — seul le endpoint dédié et
  // restreint api_getExterneClientsHistory (réservé à Ostéo/Admin) l'expose, comme pour les codes
  // PIN de "Comptes" juste au-dessus.
  const osteoReservations = result.osteoReservationsRaw.map(row => row.slice(0, 3));
  // api_addActualite écrit sa date en TEXTE ("yyyy-MM-dd HH:mm"), mais appendRow laisse Sheets la
  // ré-interpréter en vraie cellule datetime — UNFORMATTED_VALUE la renvoie alors en numéro de
  // série (une actu publiée s'affichait "46238" au lieu de sa date). Même filet que pour
  // Evenements/OsteoSlots plus haut.
  const actualites = result.actualites.map((row, i) => {
    if (i === 0) return row;
    const copy = row.slice();
    if (typeof copy[5] === "number") copy[5] = serialToDateTimeString(copy[5]);
    return copy;
  });
  const repasFinances = canManageRepas(callerRole) ? result.repasFinancesRaw : [];

  return jsonOut({ ok: true, grid: result.grid, comptes, presences: result.presences, paiements, evenements, presenceEvenements: result.presenceEvenements, actualites, covoiturage: result.covoiturage, osteoSlots, osteoReservations, compositions: result.compositions, compositionsMeta: result.compositionsMeta, selections: result.selections, selectionsMeta: result.selectionsMeta, benevoles: result.benevoles, gouter: result.gouter, gouterOptions: result.gouterOptions, tableMarque: result.tableMarque, maillots: result.maillots, repasMenu: result.repasMenu, repasPrevu: result.repasPrevu, repasTarifs: result.repasTarifs, repasFinances });
}
