// ===================================================================
// RDV OSTÉO — créneaux proposés (feuille "OsteoSlots") et réservations
// (feuille "OsteoReservations"). Module optionnel : à supprimer avec
// son fichier frontend js/modules/osteo.js pour un club qui n'a pas ce
// service.
//
// Notifications mail : chaque réservation/annulation prévient Eve ET la
// personne concernée (voir sendOsteoBookingNotifications) ; la réassignation
// prioritaire prévient seulement la personne réassignée (voir
// api_reassignOsteoSlotPriority). Toutes reposent sur la colonne Email de
// "Comptes" — sans adresse renseignée, l'envoi est silencieusement ignoré.
// ===================================================================

// Créneaux de RDV ostéo proposés par Eve (ou l'Admin). RecurrentId regroupe les créneaux créés
// en série (même jour chaque semaine, sur plusieurs semaines).
function setupOsteoSlots() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("OsteoSlots");
  if (!sheet) sheet = ss.insertSheet("OsteoSlots");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 6).setValues([["ID", "Date", "Heure", "Lieu", "Equipe", "RecurrentId"]]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// Réservations : une ligne par créneau réservé. Motif = raison de consultation, strictement
// privée (jamais montrée aux autres joueurs, seulement à Eve et à la personne concernée).
function setupOsteoReservations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("OsteoReservations");
  if (!sheet) sheet = ss.insertSheet("OsteoReservations");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["SlotID", "Nom", "Motif"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// À exécuter UNE FOIS depuis l'éditeur pour repartir sur une base propre : vide les créneaux et
// réservations ostéo de test, et supprime les actualités "Nouveau(x) créneau(x)..." déjà postées.
// Ne touche à RIEN d'autre (Grid, Comptes, etc. restent intacts).
function resetOsteoTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const slotsSheet = ss.getSheetByName("OsteoSlots");
  if (slotsSheet && slotsSheet.getLastRow() > 1) {
    slotsSheet.getRange(2, 1, slotsSheet.getLastRow() - 1, slotsSheet.getLastColumn()).clearContent();
  }

  const resaSheet = ss.getSheetByName("OsteoReservations");
  if (resaSheet && resaSheet.getLastRow() > 1) {
    resaSheet.getRange(2, 1, resaSheet.getLastRow() - 1, resaSheet.getLastColumn()).clearContent();
  }

  const actualitesSheet = ss.getSheetByName("Actualites");
  if (actualitesSheet) {
    const data = actualitesSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1] || "").indexOf("Nouveau(x) créneau(x) RDV Ostéo") === 0) {
        actualitesSheet.deleteRow(i + 1);
      }
    }
  }

  Logger.log("Nettoyage terminé : créneaux, réservations et actualités de test RDV Ostéo effacés.");
}

// À exécuter UNE FOIS depuis l'éditeur pour créer le compte d'Eve (ostéopathe du club), avec
// le rôle Ostéo (accès Agenda + Actualités de toutes les équipes, et la page RDV Ostéo).
// Vérifie qu'elle n'existe pas déjà, pour ne jamais créer de doublon.
function addOsteoAccount() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const nom = "Eve";
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_NOM]).trim() === nom) {
      Logger.log("Le compte '" + nom + "' existe déjà — rien fait.");
      return;
    }
  }
  const row = new Array(8).fill("");
  row[COL_NOM] = nom;
  row[COL_ROLES] = "Ostéo:Toutes";
  row[COL_NOMCOMPLET] = "Eve"; // à compléter avec son nom de famille dans Google Sheets si besoin
  sheet.appendRow(row);
  Logger.log("Compte '" + nom + "' créé avec le rôle Ostéo.");
}

// ===================== RAPPEL RDV OSTÉO (la veille) =====================
// À exécuter chaque jour (voir installOsteoReminderTrigger) : prévient par mail toute personne
// ayant un RDV ostéo réservé le lendemain.
function sendOsteoReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const slotsSheet = ss.getSheetByName("OsteoSlots");
  const resaSheet = ss.getSheetByName("OsteoReservations");
  const comptesSheet = ss.getSheetByName("Comptes");
  if (!slotsSheet || !resaSheet || !comptesSheet) return;
  ensureComptesSchema(comptesSheet);

  const tz = Session.getScriptTimeZone();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = Utilities.formatDate(tomorrow, tz, "yyyy-MM-dd");

  const slots = slotsSheet.getDataRange().getValues();
  const slotsForTomorrow = {};
  for (let i = 1; i < slots.length; i++) {
    if (String(slots[i][1]).trim() === tomorrowStr) slotsForTomorrow[slots[i][0]] = slots[i];
  }
  if (Object.keys(slotsForTomorrow).length === 0) return;

  const reservations = resaSheet.getDataRange().getValues();
  const comptesData = comptesSheet.getDataRange().getValues();
  function emailFor(nom) {
    for (let i = 1; i < comptesData.length; i++) {
      if (comptesData[i][COL_NOM] === nom) return comptesData[i][COL_EMAIL] || "";
    }
    return "";
  }

  for (let i = 1; i < reservations.length; i++) {
    const slot = slotsForTomorrow[reservations[i][0]];
    if (!slot) continue;
    const nom = reservations[i][1];
    const motif = reservations[i][2] || "";
    const email = emailFor(nom);
    if (!email) continue;
    const heure = slot[2] || "";
    const lieu = slot[3] || "";
    const body = "Bonjour " + nom + ",\n\n"
      + "Petit rappel : tu as rendez-vous avec Eve (ostéopathe du club) demain à " + heure + (lieu ? ", à " + lieu : "") + ".\n\n"
      + (motif ? "Motif indiqué : " + motif + "\n\n" : "")
      + "Besoin d'annuler ? Rends-toi sur l'appli, page RDV Ostéo → Mes RDV.\n\n"
      + "À demain !";
    try {
      MailApp.sendEmail(email, "Rappel : ton RDV ostéo demain" + (heure ? " à " + heure : ""), body, { name: "LustuZone — RDV Ostéo" });
    } catch (err) { /* pas bloquant */ }
  }
}

// À exécuter UNE FOIS depuis l'éditeur pour installer le rappel quotidien (tous les jours à 18h).
function installOsteoReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sendOsteoReminders") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendOsteoReminders").timeBased().everyDays(1).atHour(18).create();
}

// ===================== ACTIONS API =====================

// Crée un ou plusieurs créneaux de RDV ostéo (récurrence hebdomadaire possible). Réservé au
// rôle Ostéo et à l'Admin. Peut aussi publier une actualité générale pour l'annoncer.
function api_addOsteoSlot(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Ostéo") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  setupOsteoSlots();
  const sheet = ss.getSheetByName("OsteoSlots");
  const date = e.parameter.date; // "YYYY-MM-DD"
  const heure = e.parameter.heure || "";
  const lieu = e.parameter.lieu || "";
  const equipe = e.parameter.equipe || "Toutes";
  const semaines = Math.max(1, parseInt(e.parameter.semaines, 10) || 1);
  const recurrentId = semaines > 1 ? ("r" + Date.now()) : "";
  const createdIds = [];

  for (let w = 0; w < semaines; w++) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + w * 7);
    const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const id = "osl" + Date.now() + "_" + w + "_" + Math.floor(Math.random() * 1000);
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 2).setNumberFormat("@"); // force le texte, sinon Sheets convertit en date réelle
    sheet.getRange(row, 3).setNumberFormat("@"); // idem pour l'heure, sinon Sheets la convertit en horodatage
    sheet.getRange(row, 1, 1, 6).setValues([[id, dateStr, heure, lieu, equipe, recurrentId]]);
    createdIds.push(id);
  }

  if (e.parameter.publierActualite === "1") {
    try {
      const actualitesSheet = ss.getSheetByName("Actualites");
      const actId = "a" + Date.now();
      const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
      const titre = "Nouveau(x) créneau(x) RDV Ostéo disponible(s)";
      const texte = "Un ou plusieurs créneaux de RDV avec Eve (ostéopathe du club) sont maintenant ouverts à la réservation" + (semaines > 1 ? (", chaque semaine sur " + semaines + " semaines") : "") + ". Rendez-vous sur la page RDV Ostéo pour réserver.";
      actualitesSheet.appendRow([actId, titre, (equipe === "Toutes" ? "Générale" : equipe), texte, e.parameter.authNom, now]);
    } catch (err) {
      Logger.log("Erreur création actualité RDV Ostéo : " + err); // pas bloquant pour la création du créneau, mais visible dans le journal
    }
  }

  return jsonOut({ ok: true, ids: createdIds });
}

// Réserve un créneau — pour soi-même, ou pour quelqu'un d'autre si Admin/Ostéo (utile en cas
// de besoin d'aide). Refuse si le créneau est déjà pris (vérifié côté serveur).
function api_reserveOsteoSlot(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom || e.parameter.authNom;
  if (nom !== e.parameter.authNom && !hasRole(role, "Admin") && !hasRole(role, "Ostéo")) {
    return jsonOut({ ok: false, error: "forbidden" });
  }
  setupOsteoReservations();
  const slotId = e.parameter.slotId;
  const motif = e.parameter.motif || "";
  const resaSheet = ss.getSheetByName("OsteoReservations");
  const data = resaSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === slotId) return jsonOut({ ok: false, error: "already_taken" });
  }
  resaSheet.appendRow([slotId, nom, motif]);
  sendOsteoBookingNotifications(ss, slotId, nom, motif, "reserve");
  return jsonOut({ ok: true });
}

// Annule sa propre réservation (ou celle de quelqu'un d'autre si Admin/Ostéo) — le créneau
// redevient automatiquement disponible pour les autres, sans aucune action supplémentaire.
function api_cancelOsteoReservation(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom || e.parameter.authNom;
  if (nom !== e.parameter.authNom && !hasRole(role, "Admin") && !hasRole(role, "Ostéo")) {
    return jsonOut({ ok: false, error: "forbidden" });
  }
  setupOsteoReservations();
  const slotId = e.parameter.slotId;
  const resaSheet = ss.getSheetByName("OsteoReservations");
  const data = resaSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === slotId && data[i][1] === nom) {
      resaSheet.deleteRow(i + 1);
      sendOsteoBookingNotifications(ss, slotId, nom, "", "cancel");
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

// Prévient par mail Eve ET la personne concernée à chaque réservation/annulation de créneau
// ostéo — que l'action vienne de la personne elle-même ou d'Eve/Admin agissant pour elle
// (auquel cas "nom" est la personne concernée, pas l'auteur de l'action). Jamais bloquant :
// une erreur d'envoi ne doit jamais faire échouer la réservation/annulation elle-même.
function sendOsteoBookingNotifications(ss, slotId, nom, motif, action) {
  try {
    const slotsSheet = ss.getSheetByName("OsteoSlots");
    const slot = slotsSheet.getDataRange().getValues().find(r => r[0] === slotId);
    if (!slot) return;
    const comptesSheet = ss.getSheetByName("Comptes");
    ensureComptesSchema(comptesSheet);
    const comptesData = comptesSheet.getDataRange().getValues();
    const emailFor = (n) => {
      for (let i = 1; i < comptesData.length; i++) {
        if (comptesData[i][COL_NOM] === n) return comptesData[i][COL_EMAIL] || "";
      }
      return "";
    };

    const dateStr = slot[1] instanceof Date ? Utilities.formatDate(slot[1], Session.getScriptTimeZone(), "dd/MM/yyyy") : slot[1];
    const heure = slot[2] instanceof Date ? Utilities.formatDate(slot[2], Session.getScriptTimeZone(), "HH:mm") : slot[2];
    const lieu = slot[3] || "";
    const quand = dateStr + " à " + heure + (lieu ? ", à " + lieu : "");

    const playerEmail = emailFor(nom);
    if (playerEmail) {
      const subject = action === "reserve" ? "Ton RDV ostéo est confirmé" : "Ton RDV ostéo a bien été annulé";
      const body = action === "reserve"
        ? "Bonjour " + nom + ",\n\nTa réservation de RDV ostéo le " + quand + " est bien enregistrée.\n\n" + (motif ? "Motif indiqué : " + motif + "\n\n" : "") + "Tu peux l'annuler à tout moment depuis l'appli, page RDV Ostéo → Mes RDV.\n\nÀ bientôt !"
        : "Bonjour " + nom + ",\n\nTon RDV ostéo du " + quand + " a bien été annulé. Le créneau est de nouveau disponible pour les autres.\n\nÀ bientôt !";
      try { MailApp.sendEmail(playerEmail, subject, body, { name: "LustuZone — RDV Ostéo" }); } catch (err) { Logger.log("Erreur envoi mail ostéo à " + nom + " : " + err); }
    }

    const eveEmail = emailFor("Eve");
    if (eveEmail) {
      const subject = action === "reserve" ? "Nouvelle réservation RDV ostéo" : "Annulation RDV ostéo";
      const body = action === "reserve"
        ? nom + " vient de réserver un RDV ostéo le " + quand + "." + (motif ? "\n\nMotif indiqué : " + motif : "")
        : "Le RDV ostéo du " + quand + " avec " + nom + " vient d'être annulé.";
      try { MailApp.sendEmail(eveEmail, subject, body, { name: "LustuZone — RDV Ostéo" }); } catch (err) { Logger.log("Erreur envoi mail ostéo à Eve : " + err); }
    }
  } catch (err) {
    Logger.log("Erreur sendOsteoBookingNotifications : " + err); // jamais bloquant pour la réservation/annulation
  }
}

// Réservé à Ostéo/Admin : annule la réservation en cours sur un créneau et la réattribue
// directement à quelqu'un d'autre jugé prioritaire.
function api_reassignOsteoSlotPriority(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Ostéo") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  setupOsteoReservations();
  const slotId = e.parameter.slotId;
  const newNom = e.parameter.newNom;
  const message = (e.parameter.message || "").trim();
  const resaSheet = ss.getSheetByName("OsteoReservations");
  const data = resaSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === slotId) { resaSheet.deleteRow(i + 1); break; }
  }
  resaSheet.appendRow([slotId, newNom, ""]);

  try {
    const slotsSheet = ss.getSheetByName("OsteoSlots");
    const slotsData = slotsSheet.getDataRange().getValues();
    const slot = slotsData.find(r => r[0] === slotId);
    const comptesSheet = ss.getSheetByName("Comptes");
    ensureComptesSchema(comptesSheet);
    const comptesData = comptesSheet.getDataRange().getValues();
    let email = "";
    for (let i = 1; i < comptesData.length; i++) {
      if (comptesData[i][COL_NOM] === newNom) { email = comptesData[i][COL_EMAIL] || ""; break; }
    }
    if (slot && email) {
      const dateStr = slot[1] instanceof Date ? Utilities.formatDate(slot[1], Session.getScriptTimeZone(), "dd/MM/yyyy") : slot[1];
      const heure = slot[2] instanceof Date ? Utilities.formatDate(slot[2], Session.getScriptTimeZone(), "HH:mm") : slot[2];
      const lieu = slot[3] || "";
      const body = "Bonjour " + newNom + ",\n\n"
        + "Je t'ai réservé en priorité un créneau de RDV ostéo le " + dateStr + " à " + heure + (lieu ? ", à " + lieu : "") + ".\n\n"
        + (message ? message + "\n\n" : "")
        + "Tu peux consulter ou annuler ce RDV depuis l'appli, page RDV Ostéo → Mes RDV.\n\n"
        + "À bientôt,\nEve Ostéo";
      MailApp.sendEmail(email, "RDV ostéo prioritaire", body, { name: "Eve Ostéo" });
    }
  } catch (err) {
    Logger.log("Erreur envoi mail réassignation ostéo : " + err); // pas bloquant
  }

  return jsonOut({ ok: true });
}

// Réservé à Ostéo/Admin : supprime un créneau entièrement (et sa réservation associée si elle existe).
function api_deleteOsteoSlot(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Ostéo") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  setupOsteoSlots();
  setupOsteoReservations();
  const slotId = e.parameter.slotId;
  const slotsSheet = ss.getSheetByName("OsteoSlots");
  const slotsData = slotsSheet.getDataRange().getValues();
  for (let i = 1; i < slotsData.length; i++) {
    if (slotsData[i][0] === slotId) { slotsSheet.deleteRow(i + 1); break; }
  }
  const resaSheet = ss.getSheetByName("OsteoReservations");
  const resaData = resaSheet.getDataRange().getValues();
  for (let i = 1; i < resaData.length; i++) {
    if (resaData[i][0] === slotId) { resaSheet.deleteRow(i + 1); break; }
  }
  return jsonOut({ ok: true });
}
