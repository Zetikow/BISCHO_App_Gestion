// ===================================================================
// GOÛTER D'APRÈS MATCH — liste extensible "qui amène quoi" (même
// principe que la carte "apero", voir Cartes.gs) : chaque match à
// domicile a sa propre liste de choix (feuille "GouterOptions"), et
// chaque personne coche ce qu'elle apporte (une ligne par item coché,
// feuille "Gouter" — plusieurs items possibles par personne).
// Concerne uniquement les matchs à domicile (voir gestion-matchs.js).
// ===================================================================

function setupGouter() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Gouter");
  if (!sheet) sheet = ss.insertSheet("Gouter");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["EventID", "Nom", "Item"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  let options = ss.getSheetByName("GouterOptions");
  if (!options) options = ss.insertSheet("GouterOptions");
  if (options.getDataRange().getNumRows() <= 1) {
    options.getRange(1, 1, 1, 2).setValues([["EventID", "OptionsJSON"]]);
    options.getRange(1, 1, 1, 2).setFontWeight("bold");
    options.setFrozenRows(1);
  }
}

// ===================== ACTION API =====================

// Soi-même, l'Admin, ou un Parent déclaré pour cette personne précise peuvent cocher/décocher un
// item pour un match donné (même règle d'autorisation que le covoiturage).
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
  const item = e.parameter.item || "";
  const valeur = e.parameter.valeur || "";
  const data = sheet.getDataRange().getValues();
  if (!valeur) {
    // Décoché : supprime la ligne (une par item coché, contrairement à l'ancien champ texte
    // libre unique par personne).
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === eventId && data[i][1] === nom && data[i][2] === item) sheet.deleteRow(i + 1);
    }
    return jsonOut({ ok: true });
  }
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][1] === nom && data[i][2] === item) {
      return jsonOut({ ok: true }); // déjà coché
    }
  }
  sheet.appendRow([eventId, nom, item]);
  return jsonOut({ ok: true });
}

// N'importe quel compte authentifié peut proposer un nouveau choix pour un match donné —
// ajouté à la liste s'il n'y est pas déjà (même principe que api_addCarteOption).
function api_addGouterOption(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const option = (e.parameter.option || "").trim();
  if (!option) return jsonOut({ ok: false, error: "empty" });
  const eventId = e.parameter.eventId;
  const sheet = ss.getSheetByName("GouterOptions");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId) {
      let options = [];
      try { options = JSON.parse(data[i][1] || "[]"); } catch (err) { options = []; }
      if (options.indexOf(option) === -1) {
        options.push(option);
        sheet.getRange(i + 1, 2).setValue(JSON.stringify(options));
      }
      return jsonOut({ ok: true });
    }
  }
  sheet.appendRow([eventId, JSON.stringify([option])]);
  return jsonOut({ ok: true });
}

// Admin uniquement : retire un choix de la liste (ex: doublon, faute de frappe) — les éventuelles
// inscriptions déjà cochées sur ce choix restent en base mais deviennent invisibles/impossibles à
// décocher depuis l'UI (même limitation assumée que pour la carte "apero", voir
// api_removeCarteOption dans Cartes.gs).
function api_removeGouterOption(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role || !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const option = e.parameter.option || "";
  const eventId = e.parameter.eventId;
  const sheet = ss.getSheetByName("GouterOptions");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId) {
      let options = [];
      try { options = JSON.parse(data[i][1] || "[]"); } catch (err) { options = []; }
      options = options.filter(o => o !== option);
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(options));
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}
