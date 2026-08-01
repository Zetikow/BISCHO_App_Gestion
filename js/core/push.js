// ===================================================================
// NOTIFICATIONS PUSH (Firebase Cloud Messaging) — abonnement côté
// appareil. La réception/l'envoi effectif des notifications se fait
// ailleurs : sw.js (notification reçue appli fermée/en arrière-plan)
// et apps-script/Push.gs qui appelle l'API FCM côté serveur.
// Config : voir config/firebase-config.js (FIREBASE_CONFIG, FCM_VAPID_KEY).
// ===================================================================

let firebaseMessagingApp = null;

function getFirebaseMessaging() {
  if (typeof firebase === "undefined") return null; // SDK pas chargé (offline au premier chargement, etc.)
  if (!firebaseMessagingApp) {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebaseMessagingApp = firebase.messaging();
    // Notification reçue pendant que l'appli est ouverte au premier plan : le navigateur
    // n'affiche rien tout seul dans ce cas (contrairement à appli fermée/arrière-plan, géré
    // par sw.js) — on affiche donc un toast pour ne pas la perdre silencieusement.
    firebaseMessagingApp.onMessage((payload) => {
      const title = (payload.notification && payload.notification.title) || "Notification";
      showToast(title, "success");
    });
  }
  return firebaseMessagingApp;
}

// Demande la permission, récupère le jeton FCM de cet appareil et l'enregistre côté serveur.
// Appelée depuis un geste explicite de la personne (bouton "Activer les notifications") — jamais
// automatiquement au chargement, les navigateurs bloquent/ignorent les demandes de permission non
// déclenchées par une interaction utilisateur.
async function enablePushNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    showToast("Notifications non supportées sur cet appareil", "error");
    return;
  }
  if (window.matchMedia("(display-mode: browser)").matches && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    showToast("Sur iPhone, installe d'abord l'appli (Partager > Ajouter à l'écran d'accueil) avant d'activer les notifications.", "error");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("Permission refusée pour les notifications", "error");
    return;
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    showToast("Notifications indisponibles pour le moment (hors ligne ?)", "error");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) {
      showToast("Échec de l'activation des notifications", "error");
      return;
    }
    await savePushTokenApi(token);
    showToast("Notifications activées !", "success");
  } catch (err) {
    showToast("Échec de l'activation des notifications", "error");
  }
}

async function savePushTokenApi(token) {
  try {
    const params = new URLSearchParams({ action: "setPushToken", token, authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    isOnline = true;
    if (!data.ok) showToast("Le jeton n'a pas pu être enregistré côté serveur", "error");
  } catch (err) {
    isOnline = false;
    showToast("Échec de l'enregistrement du jeton (hors ligne)", "error");
  }
}
