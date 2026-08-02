// ===================================================================
// ACTUALITÉS — fil d'annonces (feuille "Actualites"), avec portée
// (Générale ou par équipe) restreinte pour les Coach non-Admin.
// ===================================================================

function setupActualites() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Actualites");
  if (!sheet) sheet = ss.insertSheet("Actualites");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 6).setValues([["ID", "Titre", "Scope", "Texte", "Auteur", "Date"]]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// ===================== ACTIONS API =====================

function api_addActualite(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Coach") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const scope = e.parameter.scope || "Générale";
  if (hasRole(role, "Coach") && !hasRole(role, "Admin")) {
    const equipesCoach = equipesForRole(ss, e.parameter.authNom, e.parameter.authCode, "Coach");
    if (equipesCoach.indexOf(scope) === -1) return jsonOut({ ok: false, error: "forbidden_scope" });
  }
  const sheet = ss.getSheetByName("Actualites");
  const id = "a" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const titre = e.parameter.titre || "";
  sheet.appendRow([id, titre, scope, e.parameter.texte || "", e.parameter.authNom, dateStr]);

  notifyActualitePush(ss, titre, scope);

  return jsonOut({ ok: true, id });
}

// Notifie selon la même portée que la visibilité (voir visibleActualites() dans
// js/modules/actualites.js) : "Générale" touche tout le monde ayant un jeton ; une actu par
// équipe touche les Joueur/Coach/Parent de cette équipe, PLUS Admin/Salarié/Ostéo qui voient
// toutes les portées quel que soit leur équipe. Jamais bloquant pour la publication elle-même.
function notifyActualitePush(ss, titre, scope) {
  try {
    const body = `"${titre}" vient d'être publiée sur LustuZone.`;
    let tokens;
    if (scope === "Générale") {
      tokens = pushTokensAll(ss);
    } else {
      const teamTokens = pushTokensForEquipe(ss, scope, ["Joueur", "Coach"], true);
      const broadTokens = [].concat(pushTokensForRole(ss, "Admin"), pushTokensForRole(ss, "Salarié"), pushTokensForRole(ss, "Ostéo"));
      tokens = Array.from(new Set(teamTokens.concat(broadTokens)));
    }
    tokens.forEach(token => sendPushNotification(token, "📰 Nouvelle actualité", body));
  } catch (err) {
    Logger.log("Erreur notif push nouvelle actualité : " + err);
  }
}

function api_deleteActualite(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Coach") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Actualites");
  const data = sheet.getDataRange().getValues();
  const id = e.parameter.id;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      if (hasRole(role, "Coach") && !hasRole(role, "Admin")) {
        const equipesCoach = equipesForRole(ss, e.parameter.authNom, e.parameter.authCode, "Coach");
        if (equipesCoach.indexOf(data[i][2]) === -1) return jsonOut({ ok: false, error: "forbidden_scope" });
      }
      sheet.deleteRow(i + 1);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}
