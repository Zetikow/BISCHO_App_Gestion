// ===================================================================
// SUPPORT — messages envoyés par les membres à la gestion du club
// (feuille "Support"), avec réponse visible depuis l'appli.
// ===================================================================

// Suivi des demandes de support (date, nom, message, réponse — la réponse reste vide pour
// l'instant, prête pour une future fonctionnalité de réponse visible depuis l'appli).
function setupSupport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Support");
  if (!sheet) sheet = ss.insertSheet("Support");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 5).setValues([["ID", "Date", "Nom", "Message", "Reponse"]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

// Normalise la date d'une demande de support en texte, que la cellule contienne du texte
// (cas normal) ou que Google Sheets l'ait converti en vraie date (anciennes lignes).
function formatSupportDateValue(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  }
  return String(val || "");
}

// ===================== ACTIONS API =====================

// Envoie une question/demande de support directement à l'adresse de gestion du club, et
// l'enregistre dans un onglet de suivi (visible ensuite par la personne dans l'appli).
function api_sendSupportMessage(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const message = (e.parameter.message || "").trim();
  if (!message) return jsonOut({ ok: false, error: "empty" });
  const comptesSheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(comptesSheet);
  const data = comptesSheet.getDataRange().getValues();
  let expediteurEmail = "";
  const adminEmails = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL_NOM] === e.parameter.authNom) expediteurEmail = data[i][COL_EMAIL] || "";
    if (rowHasRole(data[i], "Admin") && data[i][COL_EMAIL]) adminEmails.push(data[i][COL_EMAIL]);
  }
  const body = "Nouveau message depuis LustuZone :\n\n"
    + "De : " + e.parameter.authNom + " (" + role.join(", ") + ")\n"
    + (expediteurEmail ? "Adresse mail renseignée : " + expediteurEmail + "\n" : "")
    + "\nMessage :\n" + message
    + "\n\nRéponds directement depuis l'appli (menu Support, réservé aux Admin).";
  try {
    const mailOptions = { name: "LustuZone — Support" };
    if (expediteurEmail) mailOptions.replyTo = expediteurEmail;
    MailApp.sendEmail(CLUB_SUPPORT_EMAIL, "LustuZone — Question de " + e.parameter.authNom, body, mailOptions);
    // Prévient en plus chaque Admin ayant une adresse mail personnelle renseignée, pour ne pas
    // dépendre uniquement de la surveillance de la boîte mail partagée du club.
    [...new Set(adminEmails)].filter(em => em !== CLUB_SUPPORT_EMAIL).forEach(em => {
      try { MailApp.sendEmail(em, "LustuZone — Question de " + e.parameter.authNom, body, mailOptions); } catch (err) { /* pas bloquant */ }
    });
  } catch (err) {
    return jsonOut({ ok: false, error: "send_failed" });
  }
  try {
    const supportSheet = ss.getSheetByName("Support");
    setupSupport();
    const id = "s" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    const row = supportSheet.getLastRow() + 1;
    supportSheet.getRange(row, 2).setNumberFormat("@"); // force le texte, sinon Sheets convertit en date réelle
    supportSheet.getRange(row, 1, 1, 5).setValues([[id, now, e.parameter.authNom, message, ""]]);
  } catch (err) {
    Logger.log("Erreur enregistrement suivi support : " + err); // le mail est déjà parti, pas bloquant
  }

  // Notifie les Admin (seule audience qui peut voir les demandes, voir api_getAllSupportRequests
  // ci-dessous) — jamais bloquant pour l'envoi de la demande elle-même.
  try {
    const tokens = pushTokensForRole(ss, "Admin");
    const body = `${e.parameter.authNom} a envoyé une question via Support.`;
    tokens.forEach(token => sendPushNotification(token, "💬 Nouvelle demande support", body));
  } catch (err) {
    Logger.log("Erreur notif push nouvelle demande support : " + err);
  }

  return jsonOut({ ok: true });
}

// Historique des demandes de support d'une personne, du plus récent au plus ancien.
function api_getMySupportHistory(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const supportSheet = ss.getSheetByName("Support");
  if (!supportSheet) return jsonOut({ ok: true, history: [] });
  const data = supportSheet.getDataRange().getValues();
  const history = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === e.parameter.authNom) {
      history.push({ date: formatSupportDateValue(data[i][1]), message: data[i][3], reponse: data[i][4] || "" });
    }
  }
  history.reverse();
  return jsonOut({ ok: true, history });
}

// Toutes les demandes de support, toutes personnes confondues — réservé à l'Admin.
function api_getAllSupportRequests(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const supportSheet = ss.getSheetByName("Support");
  if (!supportSheet) return jsonOut({ ok: true, requests: [] });
  const data = supportSheet.getDataRange().getValues();
  const requests = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) requests.push({ id: data[i][0], date: formatSupportDateValue(data[i][1]), nom: data[i][2], message: data[i][3], reponse: data[i][4] || "" });
  }
  requests.reverse();
  return jsonOut({ ok: true, requests });
}

// Enregistre la réponse de l'Admin à une demande, et prévient l'auteur par mail si possible.
function api_replySupportMessage(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const id = e.parameter.id;
  const reponse = (e.parameter.reponse || "").trim();
  if (!reponse) return jsonOut({ ok: false, error: "empty" });
  const supportSheet = ss.getSheetByName("Support");
  if (!supportSheet) return jsonOut({ ok: false, error: "not_found" });
  const data = supportSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      supportSheet.getRange(i + 1, 5).setValue(reponse);
      const nomAuteur = data[i][2];
      const comptesSheet = ss.getSheetByName("Comptes");
      ensureComptesSchema(comptesSheet);
      const comptesData = comptesSheet.getDataRange().getValues();
      let auteurEmail = "";
      let auteurToken = "";
      for (let k = 1; k < comptesData.length; k++) {
        if (comptesData[k][COL_NOM] === nomAuteur) {
          auteurEmail = comptesData[k][COL_EMAIL] || "";
          auteurToken = comptesData[k][COL_PUSHSUBIDS] || "";
          break;
        }
      }
      if (auteurEmail) {
        try {
          MailApp.sendEmail(auteurEmail, "LustuZone — Réponse à ta question",
            "Bonjour " + nomAuteur + ",\n\nTu as reçu une réponse à ta question :\n\n" + reponse + "\n\nConsulte-la aussi depuis l'appli (menu Support).",
            { name: "LustuZone — Support" });
        } catch (err) { /* pas bloquant */ }
      }
      if (auteurToken) sendPushNotification(auteurToken, "💬 Réponse reçue", "On a répondu à ta question dans Support.");
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}
