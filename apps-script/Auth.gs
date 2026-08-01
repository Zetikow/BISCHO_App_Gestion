// ===================================================================
// AUTH & COMPTES — schéma/migration de la feuille "Comptes", vérification
// des identifiants, gestion des rôles multi-équipes, et les actions API
// liées au compte (connexion, code PIN, poste, email).
// ===================================================================

// ===================== SCHÉMA COMPTES (une ligne par personne) =====================
// "Roles" contient tous les rôles de la personne dans une seule cellule, au format
// "Joueur:SM1,Coach:U17,Admin:Toutes" — plus besoin de plusieurs lignes reliées par "Personne".

function parseRoles(cell) {
  return String(cell || "").split(",").map(s => s.trim()).filter(Boolean).map(pair => {
    const idx = pair.indexOf(":");
    if (idx === -1) return { role: pair, equipe: "SM1" };
    return { role: pair.slice(0, idx).trim(), equipe: pair.slice(idx + 1).trim() || "SM1" };
  });
}
function stringifyRoles(arr) {
  return arr.map(r => `${r.role}:${r.equipe}`).join(",");
}
function rowHasRole(row, roleName) {
  return parseRoles(row[COL_ROLES]).some(r => r.role === roleName);
}
function rowEquipesForRole(row, roleName) {
  return parseRoles(row[COL_ROLES]).filter(r => r.role === roleName).map(r => r.equipe);
}

function ensureComptesSchema(sheet) {
  const headers = ["Nom", "Code", "Roles", "Poste", "NomComplet", "PhotoURL", "Email", "PushSubIds"];
  const current = sheet.getRange(1, 1, 1, 8).getValues()[0];
  for (let c = 0; c < 8; c++) {
    if (current[c] !== headers[c]) {
      sheet.getRange(1, c + 1).setValue(headers[c]);
      sheet.getRange(1, c + 1).setFontWeight("bold");
    }
  }
}

function setupComptes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Comptes");
  if (!sheet) sheet = ss.insertSheet("Comptes");
  // Ne PAS effacer si déjà rempli, pour ne pas perdre les codes déjà changés
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 8).setValues([["Nom", "Code", "Roles", "Poste", "NomComplet", "PhotoURL", "Email", "PushSubIds"]]);
    const rows = PLAYERS.map(p => [p, "", "Joueur:SM1", "", "", "", "", ""]);
    rows.push(["Coach", "", "Coach:SM1", "COACH", "", "", "", ""]);
    rows.push(["Admin", "", "Admin:Toutes", "", "", "", "", ""]);
    rows.push(["Bénévole", "", "Bénévole:SM1", "", "", "", "", ""]);
    sheet.getRange(2, 1, rows.length, 8).setValues(rows);
    sheet.getRange(2, 2, rows.length, 1).setNumberFormat("@");
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  ensureComptesSchema(sheet);
}

// À exécuter UNE FOIS depuis l'éditeur pour fusionner les anciennes lignes multiples par
// personne (reliées par "Personne") en UNE SEULE ligne par personne, avec tous ses rôles
// listés dans la colonne "Roles". Fait une sauvegarde complète de l'onglet Comptes avant
// toute modification (nouvel onglet "Comptes_backup_...") — rien n'est perdu en cas de souci.
function migrateComptesToSingleRowPerPerson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Comptes");
  const data = sheet.getDataRange().getValues();

  const backupName = "Comptes_backup_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
  const backupSheet = sheet.copyTo(ss);
  backupSheet.setName(backupName);

  // Détecte le format réel en regardant les DONNÉES (pas juste l'en-tête, qui a pu être
  // renommé séparément par ensureComptesSchema sans que les lignes soient migrées) :
  // dans l'ancien format, la colonne B contient un rôle ("Joueur", "Coach"...) ; dans le
  // nouveau, elle ne contient qu'un code à 4 chiffres ou rien.
  const KNOWN_ROLES = ["Joueur", "Coach", "Admin", "Salarié", "Bénévole"];
  const looksOldFormat = data.slice(1).some(row => KNOWN_ROLES.indexOf(String(row[1] || "").trim()) !== -1);
  if (!looksOldFormat) {
    Logger.log("La feuille Comptes semble déjà migrée (aucun rôle trouvé en colonne B). Rien fait. Sauvegarde tout de même créée : " + backupName);
    return;
  }

  // Ancien schéma : Nom(0), Role(1), Code(2), Equipe(3), Personne(4), Poste(5), NomComplet(6), PhotoURL(7), Email(8), PushSubIds(9)
  const groups = {};
  const order = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const personne = row[4] || row[0];
    if (!groups[personne]) { groups[personne] = []; order.push(personne); }
    groups[personne].push(row);
  }

  const newRows = [];
  order.forEach(personne => {
    const rows = groups[personne];
    const roleSet = [];
    let code = "";
    let poste = [];
    let nomComplet = "";
    let photoUrl = "";
    let email = "";
    let pushSubIds = [];
    rows.forEach(row => {
      const role = String(row[1] || "").trim();
      const equipe = String(row[3] || "SM1").trim();
      if (role && !roleSet.some(r => r.role === role && r.equipe === equipe)) roleSet.push({ role, equipe });
      if (!code && row[2]) code = String(row[2]).trim();
      if (row[5]) String(row[5]).split(",").forEach(p => { p = p.trim(); if (p && poste.indexOf(p) === -1) poste.push(p); });
      if (!nomComplet && row[6]) nomComplet = row[6];
      if (!photoUrl && row[7]) photoUrl = row[7];
      if (!email && row[8]) email = row[8];
      if (row[9]) String(row[9]).split(",").forEach(id => { id = id.trim(); if (id && pushSubIds.indexOf(id) === -1) pushSubIds.push(id); });
    });
    newRows.push([personne, code, stringifyRoles(roleSet), poste.join(","), nomComplet, photoUrl, email, pushSubIds.join(",")]);
  });

  sheet.clear();
  const headers = ["Nom", "Code", "Roles", "Poste", "NomComplet", "PhotoURL", "Email", "PushSubIds"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.getRange(1, 2, 1, 1).setNumberFormat("@");
  if (newRows.length > 0) {
    sheet.getRange(2, 1, newRows.length, headers.length).setValues(newRows);
    sheet.getRange(2, 2, newRows.length, 1).setNumberFormat("@");
  }
  sheet.setFrozenRows(1);
  Logger.log("Migration terminée : " + newRows.length + " personne(s) consolidée(s) depuis " + (data.length - 1) + " ligne(s) d'origine. Sauvegarde de l'ancien format : " + backupName);
}

// ===================== AUTHENTIFICATION =====================

// Retourne le détail des rôles d'une personne à partir de sa ligne unique (Nom+Code) —
// un compte multi-rôles cumule automatiquement tous ses droits (parsés depuis la cellule
// "Roles"), sans avoir à choisir une "casquette" à la connexion.
function getSessionRoleDetails(ss, nom, code) {
  const comptes = ss.getSheetByName("Comptes").getDataRange().getValues();
  for (let i = 1; i < comptes.length; i++) {
    if (String(comptes[i][COL_NOM]).trim() === String(nom).trim() && String(comptes[i][COL_CODE]).trim() === String(code).trim()) {
      return parseRoles(comptes[i][COL_ROLES]).map(r => ({ ...r, nom: comptes[i][COL_NOM] }));
    }
  }
  return null;
}

// Renvoie un tableau des rôles (dédupliqués) de la personne, ou null si nom+code invalide.
// Utiliser hasRole(roles, "X") pour vérifier l'appartenance à un rôle donné.
function checkAuth(ss, nom, code) {
  const details = getSessionRoleDetails(ss, nom, code);
  if (!details) return null;
  return [...new Set(details.map(d => d.role))];
}

function hasRole(roles, roleName) {
  return !!roles && roles.indexOf(roleName) !== -1;
}

// Renvoie la liste des équipes où la personne a le rôle donné (ex: hasRole+équipes pour "Coach").
function equipesForRole(ss, nom, code, roleName) {
  const details = getSessionRoleDetails(ss, nom, code);
  if (!details) return [];
  return [...new Set(details.filter(d => d.role === roleName).map(d => d.equipe))];
}

// ===================== ACTIONS API =====================

function api_login(ss, e) {
  const nom = e.parameter.nom;
  const code = e.parameter.code;
  const details = getSessionRoleDetails(ss, nom, code);
  if (details) return jsonOut({ ok: true, roles: details });
  return jsonOut({ ok: false });
}

function api_accountStatus(ss, e) {
  const nom = e.parameter.nom;
  const comptes = ss.getSheetByName("Comptes").getDataRange().getValues();
  for (let i = 1; i < comptes.length; i++) {
    if (comptes[i][COL_NOM] === nom) {
      const codeVide = !comptes[i][COL_CODE] || String(comptes[i][COL_CODE]).trim() === "";
      return jsonOut({ ok: true, needsSetup: codeVide });
    }
  }
  return jsonOut({ ok: false });
}

function api_changeCode(ss, e) {
  const nom = e.parameter.authNom;
  const oldCode = e.parameter.oldCode;
  const role = checkAuth(ss, nom, oldCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const newCode = String(e.parameter.newCode || "");
  if (!/^\d{4}$/.test(newCode)) return jsonOut({ ok: false, error: "format" });
  const sheet = ss.getSheetByName("Comptes");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_NOM]).trim() === String(nom).trim() && String(data[i][COL_CODE]).trim() === String(oldCode).trim()) {
      sheet.getRange(i + 1, COL_CODE + 1).setNumberFormat("@");
      sheet.getRange(i + 1, COL_CODE + 1).setValue(newCode);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

function api_setCode(ss, e) {
  const nom = e.parameter.nom;
  const newCode = String(e.parameter.newCode || "");
  if (!/^\d{4}$/.test(newCode)) return jsonOut({ ok: false, error: "format" });
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL_NOM] === nom) {
      const codeVide = !data[i][COL_CODE] || String(data[i][COL_CODE]).trim() === "";
      if (!codeVide) return jsonOut({ ok: false, error: "already_set" });
      sheet.getRange(i + 1, COL_CODE + 1).setNumberFormat("@");
      sheet.getRange(i + 1, COL_CODE + 1).setValue(newCode);
      const details = getSessionRoleDetails(ss, nom, newCode);
      return jsonOut({ ok: true, roles: details || parseRoles(data[i][COL_ROLES]).map(r => ({ ...r, nom })) });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

function api_listNoms(ss, e) {
  const comptes = ss.getSheetByName("Comptes").getDataRange().getValues();
  const seen = new Set();
  const noms = [];
  for (let i = 1; i < comptes.length; i++) {
    if (comptes[i][COL_NOM] && !seen.has(comptes[i][COL_NOM])) {
      seen.add(comptes[i][COL_NOM]);
      noms.push({ nom: comptes[i][COL_NOM], role: comptes[i][COL_ROLES] });
    }
  }
  return jsonOut({ ok: true, noms });
}

function api_setPoste(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom;
  const isSelfEdit = e.parameter.authNom === nom;
  if (!hasRole(role, "Admin") && !isSelfEdit) {
    return jsonOut({ ok: false, error: "forbidden" });
  }
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const matches = isSelfEdit
      ? (String(data[i][COL_NOM]).trim() === String(nom).trim() && String(data[i][COL_CODE]).trim() === String(e.parameter.authCode).trim())
      : (String(data[i][COL_NOM]).trim() === String(nom).trim());
    if (matches) {
      sheet.getRange(i + 1, COL_POSTE + 1).setValue(e.parameter.poste || "");
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

function api_setEmail(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const nom = e.parameter.nom;
  const isSelfEdit = e.parameter.authNom === nom;
  if (!hasRole(role, "Admin") && !isSelfEdit) {
    return jsonOut({ ok: false, error: "forbidden" });
  }
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const matches = isSelfEdit
      ? (String(data[i][COL_NOM]).trim() === String(nom).trim() && String(data[i][COL_CODE]).trim() === String(e.parameter.authCode).trim())
      : (String(data[i][COL_NOM]).trim() === String(nom).trim());
    if (matches) {
      sheet.getRange(i + 1, COL_EMAIL + 1).setValue(e.parameter.email || "");
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}

function api_setPushToken(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!role) return jsonOut({ ok: false, error: "auth" });
  const token = e.parameter.token;
  if (!token) return jsonOut({ ok: false, error: "missing_token" });
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_NOM]).trim() === String(e.parameter.authNom).trim() && String(data[i][COL_CODE]).trim() === String(e.parameter.authCode).trim()) {
      sheet.getRange(i + 1, COL_PUSHSUBIDS + 1).setValue(token);
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: "not_found" });
}
