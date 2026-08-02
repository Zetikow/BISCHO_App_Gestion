// ===================================================================
// CAISSE NOIRE — feuille "Grid" (barème x joueurs).
// ===================================================================

function columnToLetter(column) {
  let temp, letter = "";
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function setupGrid() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Grid");
  if (sheet) { sheet.clear(); } else { sheet = ss.insertSheet("Grid"); }
  sheet.setName("Grid");

  const nbPlayers = PLAYERS.length;
  const firstPlayerCol = 3;
  const lastPlayerCol = firstPlayerCol + nbPlayers - 1;
  const totalCol = lastPlayerCol + 1;
  const firstDataRow = 2;
  const lastDataRow = firstDataRow + ACTIONS.length - 1;
  const totalRow = lastDataRow + 1;

  const header = ["Action", "Valeur", ...PLAYERS, "Total Action"];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  const rows = ACTIONS.map((a, i) => {
    const row = [a[0], a[1]];
    PLAYERS.forEach(() => row.push(i === 0 ? 10 : 0));
    return row;
  });
  sheet.getRange(firstDataRow, 1, rows.length, header.length - 1).setValues(rows);

  let paramSheet = ss.getSheetByName("Paramètres");
  if (!paramSheet) paramSheet = ss.insertSheet("Paramètres");
  paramSheet.clear();
  paramSheet.getRange("A1").setValue("liste du nombre d'action");
  const numberValues = [];
  for (let v = 0; v <= 50; v++) numberValues.push([v]);
  paramSheet.getRange(2, 1, numberValues.length, 1).setValues(numberValues);

  const sourceRange = paramSheet.getRange(2, 1, numberValues.length, 1);
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(firstDataRow, firstPlayerCol, ACTIONS.length, nbPlayers).setDataValidation(validation);

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const playerRange = `${columnToLetter(firstPlayerCol)}${r}:${columnToLetter(lastPlayerCol)}${r}`;
    sheet.getRange(r, totalCol).setFormula(`=SUM(${playerRange})*B${r}`);
  }

  sheet.getRange(totalRow, 1).setValue("TOTAL Joueur");
  for (let c = firstPlayerCol; c <= lastPlayerCol; c++) {
    const col = columnToLetter(c);
    sheet.getRange(totalRow, c).setFormula(`=SUMPRODUCT(${col}${firstDataRow}:${col}${lastDataRow},$B${firstDataRow}:$B${lastDataRow})`);
  }
  sheet.getRange(totalRow, totalCol).setFormula(`=SUM(${columnToLetter(totalCol)}${firstDataRow}:${columnToLetter(totalCol)}${lastDataRow})`);

  sheet.getRange(totalRow, 1, 1, header.length).setFontWeight("bold");
  sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  SpreadsheetApp.flush();
}

// À exécuter UNE FOIS après la mise à jour du barème (ACTIONS) : réorganise les lignes de la
// feuille Grid pour qu'elles correspondent au nouveau barème. Indispensable car les lignes sont
// associées par POSITION, pas par nom — sans cette étape, les montants existants se
// retrouveraient attribués aux mauvaises actions pour tout le monde.
// Convertit aussi l'historique des anciens retards (comptés à l'occurrence) en équivalent
// euros cumulés, pour ne rien perdre.
function migrateGridBareme() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Grid");
  const data = sheet.getDataRange().getValues();
  const nbPlayers = PLAYERS.length;
  const firstPlayerCol = 3;
  const lastPlayerCol = firstPlayerCol + nbPlayers - 1;
  const totalCol = lastPlayerCol + 1;
  const firstDataRow = 2;

  const oldRowsByLabel = {};
  for (let i = 1; i < data.length; i++) {
    const label = data[i][0];
    if (label) oldRowsByLabel[String(label).trim()] = data[i].slice(2, 2 + nbPlayers);
  }
  function getOld(label) {
    return oldRowsByLabel[label] || new Array(nbPlayers).fill(0);
  }

  const newValues = ACTIONS.map(([label]) => {
    let values;
    if (label === "Retard entraînement") {
      const v1 = getOld("Retard entraînement 1 min");
      const v5 = getOld("Retard entraînement 5 min");
      const v10 = getOld("Retard entraînement 10 min ou +");
      values = PLAYERS.map((p, idx) => (Number(v1[idx]) || 0) * 1 + (Number(v5[idx]) || 0) * 2 + (Number(v10[idx]) || 0) * 5);
    } else if (label === "Retard match") {
      const vOld = getOld("Retard match");
      values = PLAYERS.map((p, idx) => (Number(vOld[idx]) || 0) * 5); // ancienne valeur : 5€/occurrence
    } else if (label === "Oubli de vêtement match") {
      values = getOld("Oubli tenu de match");
    } else if (label === "Oubli de vêtement entraînement") {
      values = getOld("Oubli de vêtement hors chasuble");
    } else {
      values = getOld(label);
    }
    return values.map(v => Number(v) || 0);
  });

  const oldLastRow = sheet.getLastRow();
  if (oldLastRow >= firstDataRow) {
    sheet.getRange(firstDataRow, 1, oldLastRow - firstDataRow + 1, totalCol).clearContent();
  }

  const lastDataRow = firstDataRow + ACTIONS.length - 1;
  const totalRow = lastDataRow + 1;

  const rowsToWrite = ACTIONS.map((a, i) => [a[0], a[1], ...newValues[i]]);
  sheet.getRange(firstDataRow, 1, rowsToWrite.length, 2 + nbPlayers).setValues(rowsToWrite);

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const playerRange = `${columnToLetter(firstPlayerCol)}${r}:${columnToLetter(lastPlayerCol)}${r}`;
    sheet.getRange(r, totalCol).setFormula(`=SUM(${playerRange})*B${r}`);
  }

  sheet.getRange(totalRow, 1).setValue("TOTAL Joueur");
  for (let c = firstPlayerCol; c <= lastPlayerCol; c++) {
    const col = columnToLetter(c);
    sheet.getRange(totalRow, c).setFormula(`=SUMPRODUCT(${col}${firstDataRow}:${col}${lastDataRow},$B${firstDataRow}:$B${lastDataRow})`);
  }
  sheet.getRange(totalRow, totalCol).setFormula(`=SUM(${columnToLetter(totalCol)}${firstDataRow}:${columnToLetter(totalCol)}${lastDataRow})`);
  sheet.getRange(totalRow, 1, 1, totalCol).setFontWeight("bold");

  Logger.log(ACTIONS.length + " actions réécrites (contre " + (oldLastRow - firstDataRow) + " avant). Vérifie les montants dans Google Sheets pour confirmer que tout est cohérent avant de continuer.");
}

// Incrémente de 1 la case (joueur x action) déjà existante dans Grid — ne modifie pas la structure de la feuille.
function applyCaisseNoireSanction(gridSheet, nom, actionLabel) {
  const data = gridSheet.getDataRange().getValues();
  const header = data[0];
  const playerCol = header.indexOf(nom);
  if (playerCol === -1) return;
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === actionLabel) {
      const currentVal = data[r][playerCol] || 0;
      gridSheet.getRange(r + 1, playerCol + 1).setValue(currentVal + 1);
      return;
    }
  }
}

// Ajoute une nouvelle action à la feuille Grid si elle n'existe pas déjà, sans jamais effacer les données existantes.
function ensureGridAction(label, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Grid");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === label) return; // déjà présente
  }
  const totalRowIdx = data.findIndex(row => row[0] === "TOTAL Joueur");
  const insertAtRow = totalRowIdx === -1 ? sheet.getLastRow() + 1 : totalRowIdx + 1; // ligne 1-indexée, juste avant TOTAL
  if (totalRowIdx !== -1) sheet.insertRowBefore(insertAtRow);
  const nbCols = data[0].length;
  const firstPlayerCol = 3, lastPlayerCol = nbCols - 1, totalCol = nbCols;
  const newRow = new Array(nbCols).fill(0);
  newRow[0] = label;
  newRow[1] = value;
  sheet.getRange(insertAtRow, 1, 1, nbCols).setValues([newRow]);
  const playerRange = `${columnToLetter(firstPlayerCol)}${insertAtRow}:${columnToLetter(lastPlayerCol)}${insertAtRow}`;
  sheet.getRange(insertAtRow, totalCol).setFormula(`=SUM(${playerRange})*B${insertAtRow}`);
}

// ===================== ACTION API =====================

function api_setGridCell(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const sheet = ss.getSheetByName("Grid");
  const row = parseInt(e.parameter.row, 10);
  const col = parseInt(e.parameter.col, 10);
  const value = parseInt(e.parameter.value, 10);
  const oldValue = Number(sheet.getRange(row, col).getValue()) || 0;
  sheet.getRange(row, col).setValue(value);

  // Notifie le joueur seulement quand une NOUVELLE occurrence est ajoutée (compteur en hausse) —
  // pas sur une correction/suppression (compteur stable ou en baisse, ex: édition depuis la vue
  // détaillée). C'est le seul signal disponible ici : le endpoint reçoit juste row/col/value,
  // sans distinguer "ajout" et "édition" côté appel (voir writeCell dans caisse-noire.js, utilisé
  // par les deux). Jamais bloquant pour l'écriture elle-même.
  if (value > oldValue) {
    try {
      const actionLabel = sheet.getRange(row, 1).getValue();
      const actionValeur = Number(sheet.getRange(row, 2).getValue()) || 0;
      const nom = PLAYERS[col - 3];
      if (nom && actionLabel) {
        const montant = (value - oldValue) * actionValeur;
        const token = pushTokenForNom(ss, nom);
        if (token) sendPushNotification(token, "💰 Caisse noire", `Nouvelle action : "${actionLabel}" (+${montant}€).`);
      }
    } catch (err) {
      Logger.log("Erreur notif push caisse noire : " + err);
    }
  }

  return jsonOut({ ok: true });
}
