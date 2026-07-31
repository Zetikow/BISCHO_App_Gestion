// ===================================================================
// REPAS D'APRÈS-MATCH — remplace le suivi des foodtrucks (page Gestion
// des matchs, voir gestion-matchs.js). Quatre feuilles :
//  - RepasMenu : liste de plats réutilisable d'un match à l'autre.
//  - RepasPrevu : quels plats du menu sont prévus pour un match donné
//    (une ligne par plat coché).
//  - RepasTarifs : liste de tarifs réutilisable (ex: "Repas adulte" =
//    8€) — sert d'aide à la saisie d'une recette (voir le sélecteur de
//    tarif + quantité dans la fiche finances), reste une aide, pas un
//    calcul individuel stocké : seule la ligne agrégée (montant total)
//    finit dans RepasFinances.
//  - RepasFinances : dépenses/recettes de l'organisation d'un match
//    (pas de coût par plat individuel) — le rendement (recette - dépense)
//    est calculé côté appli, pas stocké.
// Réservé Admin/Coach/Salarié, comme l'étaient les foodtrucks.
// ===================================================================

function setupRepas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let menuSheet = ss.getSheetByName("RepasMenu");
  if (!menuSheet) menuSheet = ss.insertSheet("RepasMenu");
  if (menuSheet.getDataRange().getNumRows() <= 1) {
    menuSheet.getRange(1, 1, 1, 2).setValues([["ID", "Nom"]]);
    menuSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    menuSheet.setFrozenRows(1);
  }

  let prevuSheet = ss.getSheetByName("RepasPrevu");
  if (!prevuSheet) prevuSheet = ss.insertSheet("RepasPrevu");
  if (prevuSheet.getDataRange().getNumRows() <= 1) {
    prevuSheet.getRange(1, 1, 1, 2).setValues([["EventID", "MenuID"]]);
    prevuSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    prevuSheet.setFrozenRows(1);
  }

  let tarifsSheet = ss.getSheetByName("RepasTarifs");
  if (!tarifsSheet) tarifsSheet = ss.insertSheet("RepasTarifs");
  if (tarifsSheet.getDataRange().getNumRows() <= 1) {
    tarifsSheet.getRange(1, 1, 1, 3).setValues([["ID", "Label", "Prix"]]);
    tarifsSheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    tarifsSheet.setFrozenRows(1);
  }

  let financesSheet = ss.getSheetByName("RepasFinances");
  if (!financesSheet) financesSheet = ss.insertSheet("RepasFinances");
  if (financesSheet.getDataRange().getNumRows() <= 1) {
    financesSheet.getRange(1, 1, 1, 5).setValues([["ID", "EventID", "Type", "Label", "Montant"]]);
    financesSheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    financesSheet.setFrozenRows(1);
  }
}

function canManageRepas(role) {
  return hasRole(role, "Coach") || hasRole(role, "Admin") || hasRole(role, "Salarié");
}

// ===================== MENU (réutilisable) =====================

function api_addRepasMenuItem(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("RepasMenu");
  const id = Utilities.getUuid();
  sheet.appendRow([id, e.parameter.nom || ""]);
  return jsonOut({ ok: true, id });
}

function api_deleteRepasMenuItem(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("RepasMenu");
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === e.parameter.id) sheet.deleteRow(i + 1);
  }
  return jsonOut({ ok: true });
}

// ===================== TARIFS (réutilisable) =====================

function api_addRepasTarif(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("RepasTarifs");
  const id = Utilities.getUuid();
  sheet.appendRow([id, e.parameter.label || "", e.parameter.prix || "0"]);
  return jsonOut({ ok: true, id });
}

function api_deleteRepasTarif(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("RepasTarifs");
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === e.parameter.id) sheet.deleteRow(i + 1);
  }
  return jsonOut({ ok: true });
}

// ===================== PRÉVU PAR MATCH (coché/décoché) =====================

function api_setRepasPrevu(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("RepasPrevu");
  const data = sheet.getDataRange().getValues();
  const eventId = e.parameter.eventId || "";
  const menuId = e.parameter.menuId || "";
  const prevu = e.parameter.prevu === "1";
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][1] === menuId) {
      if (!prevu) sheet.deleteRow(i + 1);
      return jsonOut({ ok: true });
    }
  }
  if (prevu) sheet.appendRow([eventId, menuId]);
  return jsonOut({ ok: true });
}

// ===================== FINANCES PAR MATCH =====================

function api_addRepasFinance(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("RepasFinances");
  const id = Utilities.getUuid();
  const type = e.parameter.type === "recette" ? "recette" : "depense";
  sheet.appendRow([id, e.parameter.eventId || "", type, e.parameter.label || "", e.parameter.montant || "0"]);
  return jsonOut({ ok: true, id });
}

function api_deleteRepasFinance(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("RepasFinances");
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === e.parameter.id) sheet.deleteRow(i + 1);
  }
  return jsonOut({ ok: true });
}

// ===================== ANNONCE (actualité + mail) =====================
// Publie une actualité générale pour mettre en avant le repas d'après-match d'un match donné,
// et envoie un mail à tous les comptes ayant une adresse renseignée. Déclenché manuellement
// (bouton "Publier une actualité" dans la fiche du match), jamais automatiquement à chaque
// coche d'un plat — sinon un mail partirait à chaque modification du menu prévu.
// Attention quotas Gmail/Apps Script (~100 mails/jour sur un compte Gmail standard, plus sur
// Workspace) : à surveiller si le club grandit ou si plusieurs annonces partent le même jour.
function api_publishRepasActualite(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageRepas(role)) return jsonOut({ ok: false, error: "forbidden" });

  const titre = e.parameter.titre || "Repas d'après-match";
  const texte = e.parameter.texte || "";

  const actualitesSheet = ss.getSheetByName("Actualites");
  const actId = "a" + Date.now();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  actualitesSheet.appendRow([actId, titre, "Générale", texte, e.parameter.authNom, now]);

  const comptesSheet = ss.getSheetByName("Comptes");
  const comptes = comptesSheet.getDataRange().getValues();
  let sent = 0;
  for (let i = 1; i < comptes.length; i++) {
    const email = comptes[i][COL_EMAIL];
    if (!email) continue;
    try {
      MailApp.sendEmail(email, titre, texte + "\n\nRetrouve toutes les infos sur LustuZone.", { name: CLUB_NAME });
      sent++;
    } catch (err) {
      Logger.log("Erreur envoi mail annonce repas à " + comptes[i][COL_NOM] + " : " + err);
    }
  }

  return jsonOut({ ok: true, sent });
}
