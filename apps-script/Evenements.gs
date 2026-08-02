// ===================================================================
// AGENDA — matchs et entraînements (feuille "Evenements").
// ===================================================================

function setupEvenements() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Evenements");
  if (!sheet) sheet = ss.insertSheet("Evenements");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 7).setValues([["ID", "Date", "Heure", "Type", "Titre", "Lieu", "Equipe"]]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  // Empêche Google Sheets de convertir automatiquement les colonnes Date/Heure
  // en vraies valeurs de type Date/Heure (ce qui cassait l'affichage)
  try {
    sheet.getRange(2, 2, 500, 2).setNumberFormat("@");
    SpreadsheetApp.flush(); // force l'exécution immédiate pour que l'erreur soit attrapée ici, pas plus loin
  } catch (err) {
    Logger.log("setupEvenements : impossible de forcer le format texte sur Date/Heure — la plage Evenements est probablement une Table Google Sheets. Convertis-la en plage normale (clic droit > Convertir en plage) puis relance setup(). Détail : " + err);
  }
  migrateEvenementsFormat();
  renameVenueInEvenements("Gymnase Leclerc", "Lustucru Arena");
  ensureEvenementsEquipeColumn(sheet);
}

// Ajoute la colonne "Score" (ex: "28-24") à la feuille Evenements si elle n'existe pas encore —
// utilisée pour afficher les derniers résultats sans dépendre d'un widget externe.
function ensureEvenementsScoreColumn(sheet) {
  const header = sheet.getRange(1, 1, 1, 8).getValues()[0];
  if (header[7] !== "Score") {
    sheet.getRange(1, 8).setValue("Score");
    sheet.getRange(1, 8).setFontWeight("bold");
  }
}

// Ajoute la colonne "Equipe" si la feuille existait déjà avant son introduction,
// et marque "SM1" par défaut les événements déjà créés (tous étaient SM1 jusqu'ici).
function ensureEvenementsEquipeColumn(sheet) {
  const header = sheet.getRange(1, 1, 1, 7).getValues()[0];
  if (header[6] !== "Equipe") {
    sheet.getRange(1, 7).setValue("Equipe");
    sheet.getRange(1, 7).setFontWeight("bold");
  }
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && !data[i][6]) {
      sheet.getRange(i + 1, 7).setValue("SM1");
    }
  }
}

// Renomme un lieu dans tous les événements existants (utile en cas de renommage du gymnase)
function renameVenueInEvenements(oldName, newName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Evenements");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === oldName) {
      sheet.getRange(i + 1, 6).setValue(newName);
    }
  }
}

// Corrige les événements déjà enregistrés avec le bug de conversion Date/Heure.
// Si la plage a été convertie en "Table" structurée par Google Sheets, setNumberFormat()
// est refusé par Sheets sur ces colonnes ("colonne saisie") : on log et on continue plutôt
// que de faire planter tout setup() pour ça. Correction complète : dans l'onglet Evenements,
// clic droit sur la plage > "Convertir en plage", pour retirer ce typage automatique.
function migrateEvenementsFormat() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Evenements");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const dateVal = data[i][1];
    const heureVal = data[i][2];
    if (Object.prototype.toString.call(dateVal) === "[object Date]") {
      const y = dateVal.getFullYear(), m = String(dateVal.getMonth() + 1).padStart(2, "0"), d = String(dateVal.getDate()).padStart(2, "0");
      try {
        sheet.getRange(i + 1, 2).setNumberFormat("@").setValue(`${y}-${m}-${d}`);
        SpreadsheetApp.flush();
      } catch (err) {
        Logger.log("migrateEvenementsFormat : impossible de reformater la colonne Date (ligne " + (i + 1) + ") — la plage Evenements est probablement une Table Google Sheets. Convertis-la en plage normale (clic droit > Convertir en plage) puis relance setup(). Détail : " + err);
      }
    }
    if (Object.prototype.toString.call(heureVal) === "[object Date]") {
      const h = String(heureVal.getHours()).padStart(2, "0"), min = String(heureVal.getMinutes()).padStart(2, "0");
      try {
        sheet.getRange(i + 1, 3).setNumberFormat("@").setValue(`${h}:${min}`);
        SpreadsheetApp.flush();
      } catch (err) {
        Logger.log("migrateEvenementsFormat : impossible de reformater la colonne Heure (ligne " + (i + 1) + ") — la plage Evenements est probablement une Table Google Sheets. Convertis-la en plage normale (clic droit > Convertir en plage) puis relance setup(). Détail : " + err);
      }
    }
  }
}

// Écrit une valeur en forçant le format texte (pour empêcher Sheets de convertir Date/Heure en
// vraie Date, voir setupEvenements) quand c'est possible. Si la plage Evenements a été convertie
// en Table Google Sheets, setNumberFormat() est refusé ("Vous ne pouvez pas définir le format
// numérique des cellules dans une colonne saisie") — dans ce cas on écrit quand même la valeur
// (migrateEvenementsFormat() la corrigera au prochain setup()) plutôt que de faire échouer toute
// la création/modification de l'événement.
function setEvenementCell(range, value) {
  try {
    range.setNumberFormat("@").setValue(value);
  } catch (err) {
    range.setValue(value);
  }
}

// ===================== ACTIONS API =====================

function api_generateSeasonTrainings(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Evenements");
  const data = sheet.getDataRange().getValues();
  const equipe = e.parameter.equipe || "SM1";
  const existingKeys = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === "Entraînement") existingKeys.add(`${data[i][1]}_${data[i][6] || "SM1"}`);
  }

  // Mardi et jeudi ont chacun leur propre date de départ, heure et lieu (équipes/gymnases différents possibles).
  const startMardi = e.parameter.startMardi ? new Date(e.parameter.startMardi) : null;
  const startJeudi = e.parameter.startJeudi ? new Date(e.parameter.startJeudi) : null;
  const end = new Date(e.parameter.end);
  end.setHours(0, 0, 0, 0);
  if (startMardi) startMardi.setHours(0, 0, 0, 0);
  if (startJeudi) startJeudi.setHours(0, 0, 0, 0);
  const heureMardi = e.parameter.heureMardi || "20:00";
  const heureJeudi = e.parameter.heureJeudi || "20:00";
  const lieuMardi = e.parameter.lieuMardi || e.parameter.lieu || "";
  const lieuJeudi = e.parameter.lieuJeudi || e.parameter.lieu || "";

  const earliestStart = [startMardi, startJeudi].filter(Boolean).sort((a, b) => a - b)[0];
  if (!earliestStart) return jsonOut({ ok: false, error: "no_start_date" });

  let created = 0;
  let d = new Date(earliestStart);
  while (d <= end) {
    const dow = d.getDay();
    const isMardi = dow === 2 && startMardi && d >= startMardi;
    const isJeudi = dow === 4 && startJeudi && d >= startJeudi;
    if (isMardi || isJeudi) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${dd}`;
      const heure = isMardi ? heureMardi : heureJeudi;
      const lieu = isMardi ? lieuMardi : lieuJeudi;
      const key = `${dateStr}_${equipe}`;
      if (!existingKeys.has(key)) {
        const id = "e" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
        const row = sheet.getLastRow() + 1;
        sheet.getRange(row, 1).setValue(id);
        setEvenementCell(sheet.getRange(row, 2), dateStr);
        setEvenementCell(sheet.getRange(row, 3), heure);
        sheet.getRange(row, 4).setValue("Entraînement");
        sheet.getRange(row, 5).setValue("Entraînement");
        sheet.getRange(row, 6).setValue(lieu);
        sheet.getRange(row, 7).setValue(equipe);
        existingKeys.add(key);
        created++;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return jsonOut({ ok: true, created });
}

function api_addEvenement(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Coach") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Evenements");
  ensureEvenementsScoreColumn(sheet);
  const id = "e" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1).setValue(id);
  setEvenementCell(sheet.getRange(row, 2), e.parameter.date || "");
  setEvenementCell(sheet.getRange(row, 3), e.parameter.heure || "");
  sheet.getRange(row, 4).setValue(e.parameter.type || "Autre");
  sheet.getRange(row, 5).setValue(e.parameter.titre || "");
  sheet.getRange(row, 6).setValue(e.parameter.lieu || "");
  const equipesCoach = equipesForRole(ss, e.parameter.authNom, e.parameter.authCode, "Coach");
  sheet.getRange(row, 7).setValue(e.parameter.equipe || equipesCoach[0] || "SM1");
  return jsonOut({ ok: true, id });
}

function api_updateEvenement(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Coach") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Evenements");
  ensureEvenementsScoreColumn(sheet);
  const id = e.parameter.id;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const row = i + 1;
      const before = data[i]; // état AVANT écriture, pour détecter un changement d'horaire/lieu ci-dessous
      const newDate = e.parameter.date || "";
      const newHeure = e.parameter.heure || "";
      const newLieu = e.parameter.lieu || "";
      setEvenementCell(sheet.getRange(row, 2), newDate);
      setEvenementCell(sheet.getRange(row, 3), newHeure);
      sheet.getRange(row, 4).setValue(e.parameter.type || "Autre");
      sheet.getRange(row, 5).setValue(e.parameter.titre || "");
      sheet.getRange(row, 6).setValue(newLieu);
      if (Object.prototype.hasOwnProperty.call(e.parameter, "equipe")) {
        sheet.getRange(row, 7).setValue(e.parameter.equipe || "SM1");
      }
      if (Object.prototype.hasOwnProperty.call(e.parameter, "score")) {
        sheet.getRange(row, 8).setValue(e.parameter.score || "");
      }

      notifyEvenementUpdatedPush(ss, before, newDate, newHeure, newLieu, e.parameter.type, e.parameter.equipe);

      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

// Notifie l'équipe si la date, l'heure ou le lieu a changé (jamais pour un simple changement de
// titre/score) — jamais bloquant pour la modification de l'événement elle-même.
function notifyEvenementUpdatedPush(ss, before, newDate, newHeure, newLieu, newType, newEquipeParam) {
  try {
    const oldDate = String(before[1] || "");
    const oldHeure = String(before[2] || "");
    const oldLieu = String(before[5] || "");
    const dateChanged = oldDate !== newDate;
    const heureChanged = oldHeure !== newHeure;
    const lieuChanged = oldLieu !== newLieu;
    if (!dateChanged && !heureChanged && !lieuChanged) return;

    const type = newType || before[3] || "Autre";
    const equipe = newEquipeParam !== undefined ? (newEquipeParam || "SM1") : (before[6] || "SM1");
    const estMatch = type === "Match";
    const naturePhrase = estMatch ? `Le match ${equipe}` : `L'entraînement ${equipe}`;
    const dateAff = formatDateFr(newDate);

    let body;
    if (heureChanged && !lieuChanged) {
      body = `${naturePhrase} du ${dateAff} passe à ${newHeure} (au lieu de ${oldHeure || "heure non précisée"}).`;
    } else if (lieuChanged && !heureChanged) {
      body = `${naturePhrase} du ${dateAff} passe à ${newLieu} (au lieu de ${oldLieu || "lieu non précisé"}).`;
    } else if (heureChanged && lieuChanged) {
      body = `${naturePhrase} du ${dateAff} passe à ${newHeure}, ${newLieu} (au lieu de ${oldHeure || "?"}, ${oldLieu || "?"}).`;
    } else {
      // Seule la date a changé.
      body = `${naturePhrase} est décalé du ${formatDateFr(oldDate)} au ${dateAff}.`;
    }

    const tokens = pushTokensForEquipe(ss, equipe, ["Joueur", "Coach"], true);
    tokens.forEach(token => sendPushNotification(token, "🔄 Horaire modifié", body));
  } catch (err) {
    Logger.log("Erreur notif push changement horaire événement : " + err);
  }
}

function api_deleteEvenement(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!hasRole(role, "Coach") && !hasRole(role, "Admin")) return jsonOut({ ok: false, error: "forbidden" });
  const sheet = ss.getSheetByName("Evenements");
  const id = e.parameter.id;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const evRow = data[i]; // capturé AVANT suppression, pour la notification (voir plus bas)
      sheet.deleteRow(i + 1);
      notifyEvenementDeletedPush(ss, evRow);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

// Notifie l'équipe concernée de l'annulation — jamais bloquant pour la suppression elle-même.
function notifyEvenementDeletedPush(ss, evRow) {
  try {
    const type = evRow[3] || "Autre";
    const dateAff = formatDateFr(evRow[1]);
    const heureStr = evRow[2] || "";
    const equipe = evRow[6] || "SM1";

    let titre, naturePhrase;
    if (type === "Match") {
      titre = "🚫 Match annulé";
      naturePhrase = "Le match";
    } else if (type === "Entraînement") {
      titre = "🚫 Entraînement annulé";
      naturePhrase = "L'entraînement";
    } else {
      titre = "🚫 Événement annulé";
      naturePhrase = "L'événement";
    }
    const body = `${naturePhrase} ${equipe} du ${dateAff} à ${heureStr} est annulé.`;

    const tokens = pushTokensForEquipe(ss, equipe, ["Joueur", "Coach"], true);
    tokens.forEach(token => sendPushNotification(token, titre, body));
  } catch (err) {
    Logger.log("Erreur notif push annulation événement : " + err);
  }
}
