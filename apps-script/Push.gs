// ===================================================================
// NOTIFICATIONS PUSH — envoi effectif via Firebase Cloud Messaging
// (API HTTP v1). Complète js/core/push.js (abonnement côté appareil,
// qui enregistre le jeton dans Comptes.PushSubIds via api_setPushToken
// dans Auth.gs) et sw.js (réception côté appareil) : ce fichier gère
// l'ENVOI depuis le serveur, le seul morceau qu'Apps Script ne peut
// pas faire nativement (le protocole Web Push demande un échange
// OAuth2 signé en RS256, reconstruit ici à la main).
//
// Configuration nécessaire — PAS dans ce fichier, dans les Propriétés
// du script (Apps Script > ⚙️ Paramètres du projet > Propriétés du
// script > Ajouter une propriété du script) :
//   FCM_PROJECT_ID    : "lustuzone" (l'ID du projet Firebase)
//   FCM_CLIENT_EMAIL  : le champ "client_email" du fichier .json du
//                       compte de service (Firebase > Paramètres du
//                       projet > Comptes de service > Générer une
//                       nouvelle clé privée)
//   FCM_PRIVATE_KEY   : le champ "private_key" du même fichier .json,
//                       tel quel (avec ses \n) — c'est la valeur
//                       sensible, jamais dans le code source.
// ===================================================================

function getFcmAccessToken() {
  const props = PropertiesService.getScriptProperties();
  const clientEmail = props.getProperty("FCM_CLIENT_EMAIL");
  // Le fichier .json du compte de service encode les retours à la ligne de la clé en "\n" littéral
  // (deux caractères, pas un vrai saut de ligne) — un copier-coller direct dans une Propriété du
  // script les conserve tels quels. On les reconvertit ici en vrais sauts de ligne, sans quoi la
  // signature RSA échoue silencieusement.
  const privateKeyRaw = props.getProperty("FCM_PRIVATE_KEY");
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;
  if (!clientEmail || !privateKey) {
    throw new Error("FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY manquants dans les Propriétés du script.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64url = (obj) => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
  const unsignedJwt = base64url(header) + "." + base64url(claimSet);
  const signatureBytes = Utilities.computeRsaSha256Signature(unsignedJwt, privateKey);
  const signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, "");
  const jwt = unsignedJwt + "." + signature;

  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (!data.access_token) {
    throw new Error("Échec de l'obtention du token FCM : " + res.getContentText());
  }
  return data.access_token;
}

// Envoie une notification push à un jeton d'appareil donné. Ne lève jamais d'erreur vers
// l'appelant (retourne simplement false) : un échec d'envoi ne doit jamais empêcher l'action qui
// le déclenche (ex: publication d'une actualité, qui doit réussir même si le push échoue).
function sendPushNotification(pushToken, title, body) {
  if (!pushToken) return false;
  try {
    const projectId = PropertiesService.getScriptProperties().getProperty("FCM_PROJECT_ID");
    if (!projectId) throw new Error("FCM_PROJECT_ID manquant dans les Propriétés du script.");
    const accessToken = getFcmAccessToken();
    const res = UrlFetchApp.fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + accessToken },
      payload: JSON.stringify({
        message: {
          token: pushToken,
          notification: { title: title, body: body },
          webpush: { fcm_options: { link: "/" } },
        },
      }),
      muteHttpExceptions: true,
    });
    const ok = res.getResponseCode() === 200;
    if (!ok) Logger.log("Échec envoi push : " + res.getContentText());
    return ok;
  } catch (err) {
    Logger.log("Erreur envoi push : " + err);
    return false;
  }
}

// Envoie à tous les comptes ayant un jeton enregistré (PushSubIds non vide). Retourne le nombre
// envoyé avec succès — même logique que l'envoi de mail en masse (voir sendDisponibilitesReminders
// dans Notifications.gs), à brancher progressivement pour chaque type de rappel de la liste.
function sendPushToAll(title, body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Comptes");
  const data = sheet.getDataRange().getValues();
  let sent = 0;
  for (let i = 1; i < data.length; i++) {
    const token = data[i][COL_PUSHSUBIDS];
    if (token && sendPushNotification(token, title, body)) sent++;
  }
  return sent;
}

// À exécuter manuellement depuis l'éditeur (menu déroulant > testPushNotification > Exécuter)
// pour vérifier que tout fonctionne de bout en bout, une fois les 3 Propriétés du script
// renseignées ET qu'au moins un compte a cliqué "🔔 Activer les notifications" dans l'appli
// (et accepté la permission sur son appareil). Envoie au premier compte trouvé avec un jeton
// enregistré (pas de nom à deviner).
function testPushNotification() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const token = data[i][COL_PUSHSUBIDS];
    if (token) {
      const ok = sendPushNotification(token, "Test LustuZone", "Si tu vois ceci, les notifications push fonctionnent !");
      Logger.log(ok
        ? "Notification envoyée avec succès à " + data[i][COL_NOM] + "."
        : "Échec de l'envoi à " + data[i][COL_NOM] + " — voir les lignes ci-dessus pour le détail.");
      return;
    }
  }
  Logger.log("Aucun compte n'a encore de jeton push enregistré — active d'abord les notifications depuis l'appli (menu avatar > 🔔 Activer les notifications).");
}
