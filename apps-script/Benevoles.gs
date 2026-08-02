// ===================================================================
// PRÉSENCE BÉNÉVOLE — auto-inscription à un événement de type "Bénévole",
// distincte de la présence habituelle : une ligne par (événement, personne).
// Self-service (chacun gère sa propre ligne), contrairement à Selections.gs
// qui est réservé Coach/Admin. feuille "Benevoles".
// ===================================================================

function setupBenevoles() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Benevoles");
  if (!sheet) sheet = ss.insertSheet("Benevoles");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["EventID", "Nom", "Present"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// ===================== ACTION API =====================

// Soi-même, ou un Admin/Coach/Salarié pour quelqu'un d'autre (l'onglet Bénévole est un onglet de
// gestion pour ces rôles, pas de l'auto-inscription — voir renderPresenceBenevoleSheet côté
// frontend, même permission ici) — même idiome que api_reserveOsteoSlot (Osteo.gs). present vide
// = retire la ligne (désinscription).
function api_setBenevole(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom || e.parameter.authNom;
  if (nom !== e.parameter.authNom && !hasRole(role, "Coach") && !hasRole(role, "Admin") && !hasRole(role, "Salarié")) {
    return jsonOut({ ok: false, error: "forbidden" });
  }
  const sheet = ss.getSheetByName("Benevoles");
  const eventId = e.parameter.eventId;
  const present = e.parameter.present || "";
  const data = sheet.getDataRange().getValues();
  if (!present) {
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventId && data[i][1] === nom) sheet.deleteRow(i + 1);
    }
    return jsonOut({ ok: true });
  }
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][1] === nom) {
      sheet.getRange(i + 1, 3).setValue(present);
      return jsonOut({ ok: true });
    }
  }
  sheet.appendRow([eventId, nom, present]);
  return jsonOut({ ok: true });
}
