// ===================================================================
// SÉLECTION MATCH — qui est retenu pour un match donné (SM1 en premier
// lieu), distinct de la simple présence : une ligne par (événement,
// personne). Réservé Coach/Admin. Sert de base au suivi du brûlage SM1
// (voir composition.js / profil.js) tant qu'il n'existe pas de feuille
// de composition publiée pour cette équipe. feuille "Selections".
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
      return jsonOut({ ok: true });
    }
  }
  sheet.appendRow([eventId, nom, selectionne]);
  return jsonOut({ ok: true });
}
