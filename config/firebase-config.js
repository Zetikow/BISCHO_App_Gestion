// ===================================================================
// CONFIGURATION FIREBASE (notifications push)
// ===================================================================
// Config du projet Firebase (console.firebase.google.com > Paramètres du projet > Général >
// Vos applications > appli Web). Ces valeurs ne sont pas secrètes — Firebase les considère
// publiques par conception, la sécurité se fait via les règles Firebase, pas en les cachant.
//
// FCM_VAPID_KEY : Paramètres du projet > Cloud Messaging > Configuration Web > Certificats Web
// Push > "Générer une paire de clés". Clé PUBLIQUE elle aussi, sans risque à exposer côté client.
//
// Ce même bloc firebaseConfig doit aussi être collé dans sw.js (les service workers ne peuvent
// pas importer les fichiers JS de la page principale) — pense à mettre à jour les deux si tu
// recrées le projet Firebase.
// ===================================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD2x5SnYT5bz_niQkUMAL_H-DwxajuRTJA",
  authDomain: "appgestionlustuzone.firebaseapp.com",
  projectId: "appgestionlustuzone",
  storageBucket: "appgestionlustuzone.firebasestorage.app",
  messagingSenderId: "746274171647",
  appId: "1:746274171647:web:01659a3777cbd8ec503aca",
};

const FCM_VAPID_KEY = "BFlMvQ62zLZt6LmgmOd_L8k50iLL0aToPbUl_hcsd9TWiIiFofN4Ebyk5Rr0qcBo40WZxHdrriTs9rupAU-DHys";
