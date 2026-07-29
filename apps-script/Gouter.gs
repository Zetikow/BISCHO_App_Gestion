// ===================================================================
// GOÛTER D'APRÈS MATCH — une ligne par (événement, personne). Concerne
// uniquement les matchs à domicile (voir gestion-matchs.js). feuille
// "Gouter".
// ===================================================================

function setupGouter() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Gouter");
  if (!sheet) sheet = ss.insertSheet("Gouter");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["EventID", "Nom", "Quoi"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// ===================== ACTION API =====================

// Soi-même, l'Admin, ou un Parent déclaré pour cette personne précise peuvent renseigner
// (même règle d'autorisation que le covoiturage).
function api_setGouter(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom;
  let autorise = hasRole(role, "Admin") || e.parameter.authNom === nom;
  if (!autorise) {
    const details = getSessionRoleDetails(ss, e.parameter.authNom, e.parameter.authCode);
    autorise = !!details && details.some(d => d.role === "Parent" && d.equipe === nom);
  }
  if (!autorise) return jsonOut({ ok: false, error: "forbidden" });

  const sheet = ss.getSheetByName("Gouter");
  const eventId = e.parameter.eventId;
  const quoi = e.parameter.quoi || "";
  const data = sheet.getDataRange().getValues();
  if (!quoi) {
    // Désinscription : supprime la ligne plutôt que de la laisser vide
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventId && data[i][1] === nom) sheet.deleteRow(i + 1);
    }
    return jsonOut({ ok: true });
  }
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][1] === nom) {
      sheet.getRange(i + 1, 3).setValue(quoi);
      return jsonOut({ ok: true });
    }
  }
  sheet.appendRow([eventId, nom, quoi]);
  return jsonOut({ ok: true });
}
