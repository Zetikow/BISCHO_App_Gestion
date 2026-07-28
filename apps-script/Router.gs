// ===================================================================
// ROUTEUR API — point d'entrée doGet/doPost, redirige chaque action
// vers la fonction du module concerné. Aucune logique métier ici : en
// retirant un module (fichier .gs + entrée ci-dessous), les actions
// correspondantes redeviennent simplement inconnues (404 logique côté
// frontend), sans casser le reste.
// ===================================================================

const API_HANDLERS = {
  set: api_setGridCell,                                   // Grid.gs
  accountStatus: api_accountStatus,                        // Auth.gs
  changeCode: api_changeCode,                               // Auth.gs
  setCode: api_setCode,                                     // Auth.gs
  listNoms: api_listNoms,                                   // Auth.gs
  setPoste: api_setPoste,                                   // Auth.gs
  setEmail: api_setEmail,                                   // Auth.gs
  login: api_login,                                         // Auth.gs
  notifyPaymentClaim: api_notifyPaymentClaim,               // Paiements.gs
  addPaiement: api_addPaiement,                             // Paiements.gs
  updatePaiement: api_updatePaiement,                       // Paiements.gs
  deletePaiement: api_deletePaiement,                       // Paiements.gs
  sendSupportMessage: api_sendSupportMessage,               // Support.gs
  getMySupportHistory: api_getMySupportHistory,             // Support.gs
  getAllSupportRequests: api_getAllSupportRequests,         // Support.gs
  replySupportMessage: api_replySupportMessage,             // Support.gs
  addOsteoSlot: api_addOsteoSlot,                           // Osteo.gs
  reserveOsteoSlot: api_reserveOsteoSlot,                   // Osteo.gs
  cancelOsteoReservation: api_cancelOsteoReservation,       // Osteo.gs
  reassignOsteoSlotPriority: api_reassignOsteoSlotPriority, // Osteo.gs
  deleteOsteoSlot: api_deleteOsteoSlot,                     // Osteo.gs
  setCovoiturage: api_setCovoiturage,                       // Covoiturage.gs
  setPresence: api_setPresence,                             // Presences.gs
  setPresenceEvenement: api_setPresenceEvenement,           // Presences.gs
  generateSeasonTrainings: api_generateSeasonTrainings,     // Evenements.gs
  addEvenement: api_addEvenement,                           // Evenements.gs
  updateEvenement: api_updateEvenement,                     // Evenements.gs
  deleteEvenement: api_deleteEvenement,                     // Evenements.gs
  addActualite: api_addActualite,                           // Actualites.gs
  deleteActualite: api_deleteActualite,                     // Actualites.gs
  photosListForMatch: api_photosListForMatch,               // Photos.gs
  salariesList: api_salariesList,                           // Salaries.gs
  salariesCreateFolder: api_salariesCreateFolder,           // Salaries.gs
  salariesUploadFile: api_salariesUploadFile,               // Salaries.gs
  salariesAddLink: api_salariesAddLink,                     // Salaries.gs
  salariesDelete: api_salariesDelete,                       // Salaries.gs
  setCompositionSlot: api_setCompositionSlot,               // Compositions.gs
  setCompositionFreePos: api_setCompositionFreePos,         // Compositions.gs
  publishComposition: api_publishComposition,               // Compositions.gs
  setSelection: api_setSelection,                           // Selections.gs
};

// Toute action passe par ce try/catch : sans lui, une erreur non prévue dans un handler (ex:
// ligne de feuille manquante, colonne hors limites) fait renvoyer par Apps Script une page
// d'erreur HTML au lieu de JSON — le frontend ne peut alors plus la parser et affiche à tort
// "Hors ligne", alors que le serveur a bien reçu la requête mais a planté dessus. Ici, l'erreur
// est capturée et renvoyée en JSON avec son message, visible directement dans le toast/la
// console du navigateur, sans avoir besoin d'ouvrir les Exécutions Apps Script.
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const handler = API_HANDLERS[e.parameter.action];
    if (handler) return handler(ss, e);
    return api_getAll(ss, e); // action=getAll (ou par défaut) -> tout en un seul appel, voir Sync.gs
  } catch (err) {
    Logger.log("Erreur doGet (action=" + e.parameter.action + ") : " + err);
    return jsonOut({ ok: false, error: "server_error", detail: String(err) });
  }
}

// Les requêtes POST (upload de fichier, payload potentiellement volumineux) sont
// simplement redirigées vers la même logique que doGet, via un objet compatible.
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  return doGet({ parameter: body });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
