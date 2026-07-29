// ===================================================================
// TABLE DE MARQUE — une ligne par (événement, personne), disponibilité
// pour tenir la table de marque. Concerne tous les matchs, domicile
// comme extérieur (voir gestion-matchs.js). feuille "TableMarque".
// ===================================================================

function setupTableMarque() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("TableMarque");
  if (!sheet) sheet = ss.insertSheet("TableMarque");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["EventID", "Nom", "Disponible"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// ===================== ACTION API =====================

function api_setTableMarque(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom;
  let autorise = hasRole(role, "Admin") || e.parameter.authNom === nom;
  if (!autorise) {
    const details = getSessionRoleDetails(ss, e.parameter.authNom, e.parameter.authCode);
    autorise = !!details && details.some(d => d.role === "Parent" && d.equipe === nom);
  }
  if (!autorise) return jsonOut({ ok: false, error: "forbidden" });

  const sheet = ss.getSheetByName("TableMarque");
  const eventId = e.parameter.eventId;
  const disponible = e.parameter.disponible || "";
  const data = sheet.getDataRange().getValues();
  if (!disponible) {
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventId && data[i][1] === nom) sheet.deleteRow(i + 1);
    }
    return jsonOut({ ok: true });
  }
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][1] === nom) {
      sheet.getRange(i + 1, 3).setValue(disponible);
      return jsonOut({ ok: true });
    }
  }
  sheet.appendRow([eventId, nom, disponible]);
  return jsonOut({ ok: true });
}
