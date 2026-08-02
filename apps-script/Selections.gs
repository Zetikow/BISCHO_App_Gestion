// ===================================================================
// SÉLECTION MATCH — qui est retenu pour un match donné, distinct de la
// simple présence : une ligne par (événement, personne). Réservé
// Coach/Admin, fonctionne pour n'importe quelle équipe. Sert aussi de
// base au suivi du brûlage SM1 (voir composition.js / profil.js) tant
// qu'il n'existe pas de feuille de composition publiée pour cette
// équipe. feuille "Selections".
// ===================================================================

function setupSelections() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Selections");
  if (!sheet) sheet = ss.insertSheet("Selections");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["EventID", "Nom", "Selectionne"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  // Statut de publication aux joueurs/parents, même forme que CompositionsMeta (Compositions.gs) :
  // une ligne par match, "Publie" = "1" une fois visible. Tant que non publiée, seul Coach/Admin
  // voit qui est retenu (voir js/modules/presence.js, selectionIsPublished).
  let metaSheet = ss.getSheetByName("SelectionsMeta");
  if (!metaSheet) metaSheet = ss.insertSheet("SelectionsMeta");
  if (metaSheet.getDataRange().getNumRows() <= 1) {
    metaSheet.getRange(1, 1, 1, 2).setValues([["EventID", "Publie"]]);
    metaSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    metaSheet.setFrozenRows(1);
  }
}

function canManageSelections(role) {
  return hasRole(role, "Coach") || hasRole(role, "Admin");
}

// ===================== ACTION API =====================

// Coach/Admin uniquement : coche/décoche un joueur comme sélectionné pour un match.
// selectionne vide = retire la ligne (désélection).
function api_setSelection(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageSelections(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Selections");
  const eventId = e.parameter.eventId;
  const nom = e.parameter.nom;
  const selectionne = e.parameter.selectionne || "";
  const data = sheet.getDataRange().getValues();
  if (!selectionne) {
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventId && data[i][1] === nom) sheet.deleteRow(i + 1);
    }
    return jsonOut({ ok: true });
  }
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][1] === nom) {
      sheet.getRange(i + 1, 3).setValue(selectionne);
      notifySelectionPush(ss, eventId, nom);
      return jsonOut({ ok: true });
    }
  }
  sheet.appendRow([eventId, nom, selectionne]);
  notifySelectionPush(ss, eventId, nom);
  return jsonOut({ ok: true });
}

// Publie (ou masque) la sélection aux joueurs/parents pour un match donné — feuille
// "SelectionsMeta", même principe que api_publishComposition (Compositions.gs). Notifie
// seulement au moment où ça PASSE à publié (jamais à une republication ni à une dépublication),
// jamais bloquant pour la publication elle-même.
function api_publishSelection(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageSelections(role)) return jsonOut({ ok: false, error: "forbidden" });
  setupSelections();
  const eventId = e.parameter.eventId || e.parameter.matchId;
  const publie = e.parameter.publie === "1" ? "1" : "";

  const metaSheet = ss.getSheetByName("SelectionsMeta");
  const data = metaSheet.getDataRange().getValues();
  let wasAlreadyPublished = false;
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId) {
      wasAlreadyPublished = data[i][1] === "1";
      metaSheet.getRange(i + 1, 2).setValue(publie);
      found = true;
      break;
    }
  }
  if (!found) metaSheet.appendRow([eventId, publie]);

  if (publie === "1" && !wasAlreadyPublished) notifySelectionPublishPush(ss, eventId);

  return jsonOut({ ok: true });
}

// Vrai si la sélection de ce match est déjà publiée — évite de prévenir un joueur en pleine
// composition du brouillon (voir notifySelectionPush ci-dessous) avant que le coach ait
// explicitement cliqué "Publier la sélection".
function selectionIsPublishedServer(ss, eventId) {
  const metaSheet = ss.getSheetByName("SelectionsMeta");
  if (!metaSheet) return false;
  const data = metaSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId) return data[i][1] === "1";
  }
  return false;
}

// Prévient le joueur qu'il est sélectionné pour un match — seulement à la sélection (jamais à
// la désélection, voir les deux appels ci-dessus), et seulement une fois la sélection déjà
// publiée (sinon un pointage en pleine composition du brouillon révélerait prématurément un
// choix pas encore définitif). Une fois publiée, ce genre d'ajustement ponctuel reste notifié
// individuellement, en plus de la notification groupée envoyée à la publication elle-même (voir
// notifySelectionPublishPush). Jamais bloquant pour la sélection elle-même.
function notifySelectionPush(ss, eventId, nom) {
  try {
    if (!selectionIsPublishedServer(ss, eventId)) return;
    const evSheet = ss.getSheetByName("Evenements");
    const evData = evSheet.getDataRange().getValues();
    const evRow = evData.find(r => r[0] === eventId);
    if (!evRow) return;
    const equipe = evRow[6] || "SM1";
    const adversaire = extractOpponentFromTitre(evRow[4]) || evRow[4] || "";
    const dateStr = formatDateFr(evRow[1]);
    const token = pushTokenForNom(ss, nom);
    if (token) sendPushNotification(token, "✅ Sélectionné", `Tu es sélectionné pour ${equipe} vs ${adversaire} le ${dateStr}.`);
  } catch (err) {
    Logger.log("Erreur notif push sélection : " + err);
  }
}

// Notification groupée envoyée à la publication : joueurs sélectionnés ET non sélectionnés
// (tout le monde apprend que l'équipe est connue) + le(s) Coach(s) de l'équipe — même
// ciblage que la composition publiée (pushTokensForEquipe avec includeParents), en ajoutant le
// rôle Coach. Jamais bloquant pour la publication elle-même.
function notifySelectionPublishPush(ss, eventId) {
  try {
    const evSheet = ss.getSheetByName("Evenements");
    const evData = evSheet.getDataRange().getValues();
    const evRow = evData.find(r => r[0] === eventId);
    if (!evRow) return;
    const equipe = evRow[6] || "SM1";
    const adversaire = extractOpponentFromTitre(evRow[4]) || evRow[4] || "";
    const dateStr = formatDateFr(evRow[1]);
    const tokens = pushTokensForEquipe(ss, equipe, ["Joueur", "Coach"], true);
    tokens.forEach(token => sendPushNotification(token, "📋 Sélection publiée", `La sélection de ${equipe} vs ${adversaire} (${dateStr}) est en ligne.`));
  } catch (err) {
    Logger.log("Erreur notif push sélection publiée : " + err);
  }
}
