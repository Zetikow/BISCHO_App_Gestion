// ===================================================================
// FOODTRUCKS — suivi des passages de foodtrucks lors des matchs à
// domicile : une ligne par passage, feuille "Foodtrucks". Réservé
// Admin/Coach/Salarié (page Gestion des matchs, voir gestion-matchs.js).
// ===================================================================

function setupFoodtrucks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Foodtrucks");
  if (!sheet) sheet = ss.insertSheet("Foodtrucks");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 6).setValues([["ID", "EventID", "Nom", "Prix", "Benefice", "Notes"]]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function canManageFoodtrucks(role) {
  return hasRole(role, "Coach") || hasRole(role, "Admin") || hasRole(role, "Salarié");
}

// ===================== ACTION API =====================

function api_addFoodtruck(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageFoodtrucks(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Foodtrucks");
  const id = Utilities.getUuid();
  sheet.appendRow([id, e.parameter.eventId || "", e.parameter.nom || "", e.parameter.prix || "", e.parameter.benefice || "", e.parameter.notes || ""]);
  return jsonOut({ ok: true, id });
}

function api_updateFoodtruck(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageFoodtrucks(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Foodtrucks");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === e.parameter.id) {
      sheet.getRange(i + 1, 2, 1, 5).setValues([[e.parameter.eventId || "", e.parameter.nom || "", e.parameter.prix || "", e.parameter.benefice || "", e.parameter.notes || ""]]);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

function api_deleteFoodtruck(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !canManageFoodtrucks(role)) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Foodtrucks");
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === e.parameter.id) sheet.deleteRow(i + 1);
  }
  return jsonOut({ ok: true });
}
