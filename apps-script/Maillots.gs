// ===================================================================
// MAILLOTS — qui prend les maillots à laver après le match, une ligne
// par (événement, personne). Le nombre de fois où une personne les a
// pris se calcule côté frontend en comptant ses lignes sur la saison
// (voir maillotsCountFor dans gestion-matchs.js). feuille "Maillots".
// ===================================================================

function setupMaillots() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Maillots");
  if (!sheet) sheet = ss.insertSheet("Maillots");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["EventID", "Nom", "Pris"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// ===================== ACTION API =====================

function api_setMaillots(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom;
  let autorise = hasRole(role, "Admin") || e.parameter.authNom === nom;
  if (!autorise) {
    const details = getSessionRoleDetails(ss, e.parameter.authNom, e.parameter.authCode);
    autorise = !!details && details.some(d => d.role === "Parent" && d.equipe === nom);
  }
  if (!autorise) return jsonOut({ ok: false, error: "forbidden" });

  const sheet = ss.getSheetByName("Maillots");
  const eventId = e.parameter.eventId;
  const pris = e.parameter.pris || "";
  const data = sheet.getDataRange().getValues();
  if (!pris) {
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventId && data[i][1] === nom) sheet.deleteRow(i + 1);
    }
    return jsonOut({ ok: true });
  }
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][1] === nom) {
      sheet.getRange(i + 1, 3).setValue(pris);
      return jsonOut({ ok: true });
    }
  }
  sheet.appendRow([eventId, nom, pris]);
  return jsonOut({ ok: true });
}
