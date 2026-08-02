// ===================================================================
// COMPOSITION D'ÉQUIPE — placement des joueurs sur le terrain (feuille
// "Compositions") et statut de publication aux joueurs/parents (feuille
// "CompositionsMeta"). Module optionnel, pensé pour l'instant pour l'U17
// uniquement (voir composition.js côté frontend) : à supprimer avec son
// fichier frontend js/modules/composition.js pour un club qui n'a pas ce
// besoin.
//
// Une ligne de "Compositions" = un placement. Un joueur peut avoir DEUX
// lignes pour le même match : une sur un poste fixe (terrain haut ou
// banc) et une en zone libre (LibreX/LibreY, en %), pour montrer en plus
// son placement défensif — la zone libre n'est accessible qu'à un joueur
// déjà présent sur un poste fixe ou le banc (voir api_setCompositionFreePos).
//
// 12 postes fixes au total : GB, AiG, AiD, PV, ArG, ArD, DC (terrain) +
// Banc1..Banc5 (banc) — un seul joueur par poste. Le plafond de 12 est
// garanti par construction (12 codes de poste distincts, un par ligne) :
// pas de compteur séparé à maintenir en cohérence.
// ===================================================================

const COMPOSITION_SLOTS = ["GB", "AiG", "AiD", "PV", "ArG", "ArD", "DC", "Banc1", "Banc2", "Banc3", "Banc4", "Banc5"];

function setupCompositions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Compositions");
  if (!sheet) sheet = ss.insertSheet("Compositions");
  if (sheet.getDataRange().getNumRows() <= 1) {
    sheet.getRange(1, 1, 1, 5).setValues([["MatchID", "Nom", "Zone", "LibreX", "LibreY"]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  let metaSheet = ss.getSheetByName("CompositionsMeta");
  if (!metaSheet) metaSheet = ss.insertSheet("CompositionsMeta");
  if (metaSheet.getDataRange().getNumRows() <= 1) {
    metaSheet.getRange(1, 1, 1, 2).setValues([["MatchID", "Publie"]]);
    metaSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    metaSheet.setFrozenRows(1);
  }
}

function compositionCanManage(role) {
  return hasRole(role, "Coach") || hasRole(role, "Admin");
}

// ===================== ACTIONS API =====================

// Place un joueur sur un poste fixe (terrain ou banc), le retire s'il y était déjà ailleurs pour
// ce match, et libère automatiquement le poste cible s'il était occupé par quelqu'un d'autre
// (échange : l'ancien occupant redevient simplement non placé). zone="" retire le joueur de tout
// poste fixe pour ce match (glissé en arrière vers la liste effectif), sans toucher à sa
// éventuelle position en zone libre.
function api_setCompositionSlot(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!compositionCanManage(role)) return jsonOut({ ok: false, error: "forbidden" });
  setupCompositions();
  const matchId = e.parameter.matchId;
  const nom = e.parameter.nom;
  const zone = e.parameter.zone || "";
  if (zone && COMPOSITION_SLOTS.indexOf(zone) === -1) return jsonOut({ ok: false, error: "invalid_zone" });

  const sheet = ss.getSheetByName("Compositions");
  const data = sheet.getDataRange().getValues();

  if (zone) {
    const occupiedByOther = data.some((r, i) => i > 0 && r[0] === matchId && r[2] === zone && r[1] !== nom);
    const alreadyHasSlot = data.some((r, i) => i > 0 && r[0] === matchId && r[1] === nom && COMPOSITION_SLOTS.indexOf(r[2]) !== -1);
    if (!alreadyHasSlot) {
      const occupiedSlots = new Set(data.filter((r, i) => i > 0 && r[0] === matchId && COMPOSITION_SLOTS.indexOf(r[2]) !== -1).map(r => r[2]));
      if (occupiedSlots.size >= COMPOSITION_SLOTS.length && !occupiedByOther) return jsonOut({ ok: false, error: "team_full" });
    }
  }

  // Retire l'éventuel poste fixe déjà occupé par ce joueur pour ce match, et l'éventuel
  // occupant actuel du poste cible (échange) — jamais sa ligne "Libre" éventuelle.
  for (let i = data.length - 1; i >= 1; i--) {
    const r = data[i];
    if (r[0] !== matchId || COMPOSITION_SLOTS.indexOf(r[2]) === -1) continue;
    if (r[1] === nom || (zone && r[2] === zone)) sheet.deleteRow(i + 1);
  }

  if (zone) sheet.appendRow([matchId, nom, zone, "", ""]);
  return jsonOut({ ok: true });
}

// Place/déplace un joueur en zone libre (défense), ou le retire (x/y vides). Réservé aux joueurs
// déjà sur un poste fixe (terrain ou banc) pour ce match — voir le commentaire d'en-tête.
function api_setCompositionFreePos(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!compositionCanManage(role)) return jsonOut({ ok: false, error: "forbidden" });
  setupCompositions();
  const matchId = e.parameter.matchId;
  const nom = e.parameter.nom;
  const x = e.parameter.x;
  const y = e.parameter.y;

  const sheet = ss.getSheetByName("Compositions");
  const data = sheet.getDataRange().getValues();

  if (x !== undefined && x !== "") {
    const hasFixedSlot = data.some((r, i) => i > 0 && r[0] === matchId && r[1] === nom && COMPOSITION_SLOTS.indexOf(r[2]) !== -1);
    if (!hasFixedSlot) return jsonOut({ ok: false, error: "not_selected" });
  }

  for (let i = data.length - 1; i >= 1; i--) {
    const r = data[i];
    if (r[0] === matchId && r[1] === nom && r[2] === "Libre") sheet.deleteRow(i + 1);
  }
  if (x !== undefined && x !== "") sheet.appendRow([matchId, nom, "Libre", x, y]);
  return jsonOut({ ok: true });
}

// Rend (ou masque) la composition visible aux joueurs/parents — action séparée de l'édition,
// pour que le brouillon reste invisible tant que le coach n'a pas cliqué explicitement dessus.
function api_publishComposition(ss, e) {
  const role = checkAuth(ss, e.parameter.authNom, e.parameter.authCode);
  if (!compositionCanManage(role)) return jsonOut({ ok: false, error: "forbidden" });
  setupCompositions();
  const matchId = e.parameter.matchId;
  const publie = e.parameter.publie === "1" ? "1" : "";

  const metaSheet = ss.getSheetByName("CompositionsMeta");
  const data = metaSheet.getDataRange().getValues();
  let wasAlreadyPublished = false;
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === matchId) {
      wasAlreadyPublished = data[i][1] === "1";
      metaSheet.getRange(i + 1, 2).setValue(publie);
      found = true;
      break;
    }
  }
  if (!found) metaSheet.appendRow([matchId, publie]);

  // Notifie joueurs + parents seulement au moment où la compo PASSE à publiée (jamais à une
  // republication ni à une dépublication) — jamais bloquant pour la publication elle-même.
  if (publie === "1" && !wasAlreadyPublished) {
    try {
      const evSheet = ss.getSheetByName("Evenements");
      const evData = evSheet.getDataRange().getValues();
      const evRow = evData.find(r => r[0] === matchId);
      if (evRow) {
        const equipe = evRow[6] || "SM1";
        const adversaire = extractOpponentFromTitre(evRow[4]) || evRow[4] || "";
        const tokens = pushTokensForEquipe(ss, equipe, ["Joueur"], true);
        tokens.forEach(token => sendPushNotification(token, "🧩 Composition publiée", `La compo de ${equipe} vs ${adversaire} est en ligne !`));
      }
    } catch (err) {
      Logger.log("Erreur notif push composition publiée : " + err);
    }
  }

  return jsonOut({ ok: true });
}
