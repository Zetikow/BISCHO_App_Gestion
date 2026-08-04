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
// NotesEve (4e colonne, voir ensureOsteoReservationsSchema ci-dessous) = notes de suivi propres
// à Eve sur cette réservation précise, jamais montrées à la personne qui a réservé, ni à qui que
// ce soit d'autre (même pas via api_getAll — voir Sync.gs, qui tronque volontairement cette
// colonne pour ce endpoint générique chargé par tout le monde).
function setupOsteoReservations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("OsteoReservations");
  if (!sheet) sheet = ss.insertSheet("OsteoReservations");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 4).setValues([["SlotID", "Nom", "Motif", "NotesEve"]]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// Ajoute la colonne "NotesEve" si la feuille "OsteoReservations" existait déjà avant son
// introduction (une ligne par réservation, avant elle n'avait que SlotID/Nom/Motif) — même
// idiome que ensureComptesSchema (Auth.gs) / ensureEvenementsScoreColumn (Evenements.gs) /
// ensurePresenceEvenementsSchema (Presences.gs). À appeler en tête de tout handler qui lit ou
// écrit "OsteoReservations", pour qu'un club sur une feuille encore à 3 colonnes migre sans
// aucune manipulation manuelle du Google Sheet.
function ensureOsteoReservationsSchema(sheet) {
  const header = sheet.getRange(1, 1, 1, 4).getValues()[0];
  if (header[3] !== "NotesEve") {
    sheet.getRange(1, 4).setValue("NotesEve");
    sheet.getRange(1, 4).setFontWeight("bold");
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
  ensureOsteoReservationsSchema(resaSheet);

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
      // Même format que api_addActualite ("yyyy-MM-dd HH:mm") : l'ancien "dd/MM/yyyy" était
      // ré-interprété par Sheets en vraie cellule date, donc renvoyé en numéro de série par
      // UNFORMATTED_VALUE (batchGet) — l'actu s'affichait "46238" au lieu de sa date. Le format
      // "@" forcé juste après empêche cette ré-interprétation à la source.
      const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
      const titre = "Nouveau(x) créneau(x) RDV Ostéo disponible(s)";
      const scope = equipe === "Toutes" ? "Générale" : equipe;
      const texte = "Un ou plusieurs créneaux de RDV avec Eve (ostéopathe du club) sont maintenant ouverts à la réservation" + (semaines > 1 ? (", chaque semaine sur " + semaines + " semaines") : "") + ". Rendez-vous sur la page RDV Ostéo pour réserver.";
      actualitesSheet.appendRow([actId, titre, scope, texte, e.parameter.authNom, now]);
      actualitesSheet.getRange(actualitesSheet.getLastRow(), 6).setNumberFormat("@").setValue(now);
    } catch (err) {
      Logger.log("Erreur création actualité RDV Ostéo : " + err); // pas bloquant pour la création du créneau, mais visible dans le journal
    }
  }

  // Notification envoyée à CHAQUE création de créneau, indépendamment de la case "publier une
  // actualité" — c'est l'ouverture des créneaux qui intéresse les gens, pas le fait qu'une actu
  // accompagne ou non. Une seule notification par création (jamais deux même si l'actu est
  // publiée), ciblée selon l'équipe du créneau : "Toutes" = tout le club, sinon uniquement
  // l'équipe concernée.
  notifyOsteoSlotsPush(ss, equipe, createdIds.length);

  return jsonOut({ ok: true, ids: createdIds });
}

// Cible exactement comme la visibilité des créneaux : "Toutes" touche tout le monde ayant un
// jeton ; une équipe précise touche ses Joueur/Coach et les parents de ses joueurs, PLUS
// Admin/Salarié/Ostéo qui voient tout quelle que soit leur équipe (même règle que
// notifyActualitePush dans Actualites.gs). Jamais bloquant pour la création du créneau.
function notifyOsteoSlotsPush(ss, equipe, count) {
  try {
    const quoi = count > 1 ? `${count} nouveaux créneaux sont ouverts` : "Un nouveau créneau est ouvert";
    const body = `${quoi} à la réservation avec Eve, ostéopathe du club.`;
    let tokens;
    if (equipe === "Toutes") {
      tokens = pushTokensAll(ss);
    } else {
      const teamTokens = pushTokensForEquipe(ss, equipe, ["Joueur", "Coach"], true);
      const broadTokens = [].concat(pushTokensForRole(ss, "Admin"), pushTokensForRole(ss, "Salarié"), pushTokensForRole(ss, "Ostéo"));
      tokens = Array.from(new Set(teamTokens.concat(broadTokens)));
    }
    tokens.forEach(token => sendPushNotification(token, "🦴 Créneaux RDV Ostéo", body));
  } catch (err) {
    Logger.log("Erreur notif push nouveaux créneaux Ostéo : " + err);
  }
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
  ensureOsteoReservationsSchema(resaSheet);
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
  ensureOsteoReservationsSchema(resaSheet);
  const data = resaSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === slotId && data[i][1] === nom) {
      resaSheet.deleteRow(i + 1);
      sendOsteoBookingNotifications(ss, slotId, nom, "", "cancel");
      notifyOsteoCancelPush(ss, slotId, nom);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

// Prévient par push toutes les personnes ayant le rôle Ostéo (il peut y en avoir plusieurs)
// qu'un joueur a annulé son RDV — jamais bloquant pour l'annulation elle-même.
function notifyOsteoCancelPush(ss, slotId, nom) {
  try {
    const slotsSheet = ss.getSheetByName("OsteoSlots");
    const slot = slotsSheet.getDataRange().getValues().find(r => r[0] === slotId);
    if (!slot) return;
    const dateStr = slot[1] instanceof Date ? Utilities.formatDate(slot[1], Session.getScriptTimeZone(), "dd/MM/yyyy") : formatDateFr(slot[1]);
    const heure = slot[2] instanceof Date ? Utilities.formatDate(slot[2], Session.getScriptTimeZone(), "HH:mm") : slot[2];
    const tokens = pushTokensForRole(ss, "Ostéo");
    tokens.forEach(token => sendPushNotification(token, "❌ RDV annulé", `${nom} a annulé son RDV du ${dateStr} à ${heure}.`));
  } catch (err) {
    Logger.log("Erreur notif push annulation ostéo : " + err);
  }
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
  ensureOsteoReservationsSchema(resaSheet);
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
  ensureOsteoReservationsSchema(resaSheet);
  const resaData = resaSheet.getDataRange().getValues();
  for (let i = 1; i < resaData.length; i++) {
    if (resaData[i][0] === slotId) { resaSheet.deleteRow(i + 1); break; }
  }
  return jsonOut({ ok: true });
}

// ===================== RDV OSTÉO — PERSONNES EXTERNES AU CLUB =====================
// Un "externe" est une personne qu'Eve suit en dehors du club (pas un membre) : elle réserve/
// annule ses propres créneaux depuis une page à part (osteo-externe.html), qui ne partage AUCUN
// fichier frontend avec le reste de l'appli (voir js/osteo-externe.js). Côté backend en revanche,
// c'est le même compte "Comptes" et les mêmes feuilles OsteoSlots/OsteoReservations que tout le
// monde : Eve voit donc les réservations des externes exactement au même endroit que celles des
// joueurs, dans sa vue manager RDV Ostéo habituelle, sans rien changer à son propre usage de
// l'appli. Le rôle "Externe" n'a accès qu'aux routes génériques, non restreintes par rôle
// (checkAuth suffit) : reserveOsteoSlot/cancelOsteoReservation/getOsteoExterneData, plus
// setEmail/sendSupportMessage/getMySupportHistory pour les onglets Profil et Support de
// osteo-externe.html (voir js/osteo-externe.js) — toute tentative d'appeler une action
// réservée à un autre rôle (dont setOsteoReservationNote/getExterneClientsHistory, réservées
// à Ostéo/Admin ci-dessous) échoue comme pour n'importe qui.

// Réservé à Ostéo/Admin (même allowlist que api_addOsteoSlot) : crée le compte d'une personne
// externe au club, avec le rôle "Externe:Toutes" toujours — un externe n'est jamais rattaché à
// une équipe précise (décision du club : aucune distinction par équipe pour ce profil), donc
// "Toutes" est forcé ici sans condition, même si le client envoie encore un paramètre "equipe"
// (défense en profondeur, jamais fait confiance). Code PIN laissé vide, auto-activé ensuite via
// l'existant api_setCode, exactement comme addOsteoAccount() pour Eve.
function api_addExterneAccount(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Ostéo") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const nom = String(e.parameter.nom || "").trim();
  if (!nom) return jsonOut({ ok: false, error: "missing_nom" });
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_NOM]).trim() === nom) return jsonOut({ ok: false, error: "exists" });
  }
  const row = new Array(8).fill("");
  row[COL_NOM] = nom;
  row[COL_ROLES] = "Externe:Toutes";
  sheet.appendRow(row);
  return jsonOut({ ok: true });
}

// Données minimales pour la page externe : les créneaux à venir pertinents pour l'équipe de
// l'appelant (ou "Toutes" pour un compte Ostéo/Admin de test), avec juste un booléen "disponible"
// (jamais le nom ni le motif de la personne qui a réservé), PLUS les propres réservations de
// l'appelant (celles-là seules, avec leur motif). Contrairement à api_getAll (utilisé par le reste
// de l'appli, où c'est uniquement l'UI qui cache les infos des autres), ce endpoint ne renvoie
// JAMAIS les données des autres personnes, même dans la réponse brute. checkAuth suffit comme
// garde (pas de rôle "Externe" imposé) : un Admin/Ostéo qui teste cette page doit aussi pouvoir la
// charger, et cette fonction ne fait de toute façon rien de plus sensible que ça. Pas de try/catch
// ici : doGet() (Router.gs) enveloppe déjà tout appel de handler dans le sien.
function api_getOsteoExterneData(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });

  let callerEquipe = "Toutes";
  if (!hasRole(role, "Admin") && !hasRole(role, "Ostéo")) {
    const details = getSessionRoleDetails(ss, e.parameter.authNom, e.parameter.authCode) || [];
    const externeRole = details.find(d => d.role === "Externe");
    callerEquipe = externeRole ? externeRole.equipe : "Toutes";
  }

  setupOsteoSlots();
  setupOsteoReservations();
  const resaSheet = ss.getSheetByName("OsteoReservations");
  ensureOsteoReservationsSchema(resaSheet);
  const slotsData = ss.getSheetByName("OsteoSlots").getDataRange().getValues();
  const resaData = resaSheet.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();

  // "moi" alimente l'onglet Profil de la page externe (voir js/osteo-externe.js) : nom + email
  // tels qu'enregistrés dans Comptes, et le nombre de RDV déjà passés (calculé ici, jamais stocké).
  const comptesSheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(comptesSheet);
  const comptesData = comptesSheet.getDataRange().getValues();
  let moiEmail = "";
  for (let i = 1; i < comptesData.length; i++) {
    if (comptesData[i][COL_NOM] === e.parameter.authNom) { moiEmail = comptesData[i][COL_EMAIL] || ""; break; }
  }

  const reservedSlotIds = new Set();
  for (let i = 1; i < resaData.length; i++) reservedSlotIds.add(resaData[i][0]);

  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const slots = [];
  for (let i = 1; i < slotsData.length; i++) {
    const row = slotsData[i];
    if (!row[0]) continue;
    const dateStr = row[1] instanceof Date ? Utilities.formatDate(row[1], tz, "yyyy-MM-dd") : String(row[1] || "");
    if (dateStr < todayStr) continue; // ne montre jamais les créneaux passés
    const equipe = row[4] || "Toutes";
    if (equipe !== "Toutes" && equipe !== callerEquipe) continue;
    slots.push({
      id: row[0],
      date: dateStr,
      heure: row[2] instanceof Date ? Utilities.formatDate(row[2], tz, "HH:mm") : String(row[2] || ""),
      lieu: row[3] || "",
      equipe: equipe,
      disponible: !reservedSlotIds.has(row[0]),
    });
  }

  const mesReservations = [];
  let rdvPasses = 0;
  for (let i = 1; i < resaData.length; i++) {
    if (resaData[i][1] !== e.parameter.authNom) continue; // jamais les réservations des autres
    const slotId = resaData[i][0];
    const slotRow = slotsData.find(r => r[0] === slotId);
    if (!slotRow) continue;
    const slotDateStr = slotRow[1] instanceof Date ? Utilities.formatDate(slotRow[1], tz, "yyyy-MM-dd") : String(slotRow[1] || "");
    if (slotDateStr < todayStr) rdvPasses++;
    mesReservations.push({
      slotId: slotId,
      motif: resaData[i][2] || "",
      date: slotDateStr,
      heure: slotRow[2] instanceof Date ? Utilities.formatDate(slotRow[2], tz, "HH:mm") : String(slotRow[2] || ""),
      lieu: slotRow[3] || "",
    });
  }

  const moi = { nom: e.parameter.authNom, email: moiEmail, rdvPasses: rdvPasses };

  return jsonOut({ ok: true, slots: slots, mesReservations: mesReservations, moi: moi });
}

// Réservé à Ostéo/Admin : enregistre la note privée d'Eve sur une réservation précise (colonne
// "NotesEve", jamais visible par la personne qui a réservé — voir ensureOsteoReservationsSchema
// plus haut et api_getExterneClientsHistory ci-dessous pour la lecture). Identifie la ligne par
// slotId + nom (comme partout ailleurs dans ce fichier), pas par un ID de réservation dédié —
// cohérent avec le reste du schéma "OsteoReservations".
function api_setOsteoReservationNote(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Ostéo") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  setupOsteoReservations();
  const resaSheet = ss.getSheetByName("OsteoReservations");
  ensureOsteoReservationsSchema(resaSheet);
  const slotId = e.parameter.slotId;
  const nom = e.parameter.nom;
  const note = e.parameter.note || "";
  const data = resaSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === slotId && data[i][1] === nom) {
      resaSheet.getRange(i + 1, 4).setValue(note);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

// Réservé à Ostéo/Admin : historique complet (passé ET à venir, du plus récent au plus ancien)
// de chaque personne ayant le rôle "Externe", pour l'écran "Mes clients externes" d'Eve (voir
// renderOsteoClientsSection dans js/modules/osteo.js). Inclut le motif ET la note privée d'Eve —
// contrairement à api_getOsteoExterneData (utilisé par les externes eux-mêmes pour leurs PROPRES
// réservations), qui n'a jamais accès à NotesEve. Contrairement aussi à api_getAll (Sync.gs), qui
// tronque volontairement cette même colonne avant de la renvoyer à tout le monde.
function api_getExterneClientsHistory(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Ostéo") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });

  const comptesSheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(comptesSheet);
  const comptesData = comptesSheet.getDataRange().getValues();

  setupOsteoSlots();
  setupOsteoReservations();
  const resaSheet = ss.getSheetByName("OsteoReservations");
  ensureOsteoReservationsSchema(resaSheet);
  const resaData = resaSheet.getDataRange().getValues();
  const slotsData = ss.getSheetByName("OsteoSlots").getDataRange().getValues();
  const tz = Session.getScriptTimeZone();

  const slotById = {};
  for (let i = 1; i < slotsData.length; i++) {
    if (slotsData[i][0]) slotById[slotsData[i][0]] = slotsData[i];
  }

  const clients = [];
  for (let i = 1; i < comptesData.length; i++) {
    const row = comptesData[i];
    if (!row[COL_NOM] || !rowHasRole(row, "Externe")) continue;
    const nom = row[COL_NOM];
    const email = row[COL_EMAIL] || "";
    const reservations = [];
    for (let j = 1; j < resaData.length; j++) {
      if (resaData[j][1] !== nom) continue;
      const slot = slotById[resaData[j][0]];
      if (!slot) continue;
      reservations.push({
        slotId: resaData[j][0],
        date: slot[1] instanceof Date ? Utilities.formatDate(slot[1], tz, "yyyy-MM-dd") : String(slot[1] || ""),
        heure: slot[2] instanceof Date ? Utilities.formatDate(slot[2], tz, "HH:mm") : String(slot[2] || ""),
        lieu: slot[3] || "",
        motif: resaData[j][2] || "",
        notesEve: resaData[j][3] || "",
      });
    }
    reservations.sort((a, b) => (b.date + "T" + b.heure).localeCompare(a.date + "T" + a.heure));
    clients.push({ nom: nom, email: email, reservations: reservations });
  }

  return jsonOut({ ok: true, clients: clients });
}
