// ===================================================================
// SYNC — endpoint "tout en un" utilisé par le frontend (startPolling)
// pour récupérer l'état de toutes les feuilles en un seul appel.
// ===================================================================

// action=getAll (ou par défaut) -> tout en un seul appel
// Sécurité : authentification obligatoire, codes PIN jamais renvoyés, Paiements réservé à l'Admin.
function api_getAll(ss, e) {
  const callerRole = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!callerRole) return jsonOut({ ok: false, error: "auth" });

  const grid = ss.getSheetByName("Grid").getDataRange().getValues();
  const comptesRaw = ss.getSheetByName("Comptes").getDataRange().getValues();
  const comptes = comptesRaw.map((row, i) => {
    if (i === 0) return row; // en-tête
    const copy = row.slice();
    copy[COL_CODE] = ""; // ne jamais renvoyer les codes PIN au client, même le sien
    return copy;
  });
  const presences = ss.getSheetByName("Presences").getDataRange().getValues();
  const paiements = hasRole(callerRole, "Admin") ? ss.getSheetByName("Paiements").getDataRange().getValues() : [];
  const evenements = ss.getSheetByName("Evenements").getDataRange().getValues();
  const presenceEvenements = ss.getSheetByName("PresenceEvenements").getDataRange().getValues();
  const actualitesSheet = ss.getSheetByName("Actualites");
  const actualites = actualitesSheet ? actualitesSheet.getDataRange().getValues() : [];
  const covoiturageSheet = ss.getSheetByName("Covoiturage");
  const covoiturage = covoiturageSheet ? covoiturageSheet.getDataRange().getValues() : [];
  const osteoSlotsSheet = ss.getSheetByName("OsteoSlots");
  const osteoSlotsRaw = osteoSlotsSheet ? osteoSlotsSheet.getDataRange().getValues() : [];
  const osteoSlots = osteoSlotsRaw.map((row, i) => {
    if (i === 0) return row;
    const copy = row.slice();
    if (copy[1] instanceof Date) copy[1] = Utilities.formatDate(copy[1], Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (copy[2] instanceof Date) copy[2] = Utilities.formatDate(copy[2], Session.getScriptTimeZone(), "HH:mm");
    return copy;
  });
  const osteoReservationsSheet = ss.getSheetByName("OsteoReservations");
  if (osteoReservationsSheet) ensureOsteoReservationsSchema(osteoReservationsSheet);
  const osteoReservationsRaw = osteoReservationsSheet ? osteoReservationsSheet.getDataRange().getValues() : [];
  // Ne renvoie JAMAIS la colonne "NotesEve" (notes privées d'Eve, voir Osteo.gs) via ce endpoint
  // générique chargé par absolument tout le monde (joueurs compris) — seul le endpoint dédié et
  // restreint api_getExterneClientsHistory (réservé à Ostéo/Admin) l'expose, comme pour les codes
  // PIN de "Comptes" juste au-dessus.
  const osteoReservations = osteoReservationsRaw.map(row => row.slice(0, 3));
  const compositionsSheet = ss.getSheetByName("Compositions");
  const compositions = compositionsSheet ? compositionsSheet.getDataRange().getValues() : [];
  const compositionsMetaSheet = ss.getSheetByName("CompositionsMeta");
  const compositionsMeta = compositionsMetaSheet ? compositionsMetaSheet.getDataRange().getValues() : [];
  const selectionsSheet = ss.getSheetByName("Selections");
  const selections = selectionsSheet ? selectionsSheet.getDataRange().getValues() : [];
  const selectionsMetaSheet = ss.getSheetByName("SelectionsMeta");
  const selectionsMeta = selectionsMetaSheet ? selectionsMetaSheet.getDataRange().getValues() : [];
  const benevolesSheet = ss.getSheetByName("Benevoles");
  const benevoles = benevolesSheet ? benevolesSheet.getDataRange().getValues() : [];
  const gouterSheet = ss.getSheetByName("Gouter");
  const gouter = gouterSheet ? gouterSheet.getDataRange().getValues() : [];
  const gouterOptionsSheet = ss.getSheetByName("GouterOptions");
  const gouterOptions = gouterOptionsSheet ? gouterOptionsSheet.getDataRange().getValues() : [];
  const tableMarqueSheet = ss.getSheetByName("TableMarque");
  const tableMarque = tableMarqueSheet ? tableMarqueSheet.getDataRange().getValues() : [];
  const maillotsSheet = ss.getSheetByName("Maillots");
  const maillots = maillotsSheet ? maillotsSheet.getDataRange().getValues() : [];
  const foodtrucksSheet = ss.getSheetByName("Foodtrucks");
  const foodtrucks = (foodtrucksSheet && canManageFoodtrucks(callerRole)) ? foodtrucksSheet.getDataRange().getValues() : [];
  const repasMenuSheet = ss.getSheetByName("RepasMenu");
  const repasMenu = repasMenuSheet ? repasMenuSheet.getDataRange().getValues() : [];
  const repasPrevuSheet = ss.getSheetByName("RepasPrevu");
  const repasPrevu = repasPrevuSheet ? repasPrevuSheet.getDataRange().getValues() : [];
  const repasTarifsSheet = ss.getSheetByName("RepasTarifs");
  const repasTarifs = repasTarifsSheet ? repasTarifsSheet.getDataRange().getValues() : [];
  const repasFinancesSheet = ss.getSheetByName("RepasFinances");
  const repasFinances = (repasFinancesSheet && canManageRepas(callerRole)) ? repasFinancesSheet.getDataRange().getValues() : [];

  return jsonOut({ ok: true, grid, comptes, presences, paiements, evenements, presenceEvenements, actualites, covoiturage, osteoSlots, osteoReservations, compositions, compositionsMeta, selections, selectionsMeta, benevoles, gouter, gouterOptions, tableMarque, maillots, foodtrucks, repasMenu, repasPrevu, repasTarifs, repasFinances });
}
