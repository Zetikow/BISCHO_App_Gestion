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
  apiKey: "AIzaSyCU2E4cu55ZoAAS4MkGCsm8-2MjOlE-NuI",
  authDomain: "lustuzone.firebaseapp.com",
  projectId: "lustuzone",
  storageBucket: "lustuzone.firebasestorage.app",
  messagingSenderId: "1007511435940",
  appId: "1:1007511435940:web:73de2b7d7259e9ed554431",
};

const FCM_VAPID_KEY = "BBx9U5og9l94xmZHjW4DpVvBOJcVPNeM9O0rWC7QzXfps4tMCtpti1sIJBMo0EEI_NpXFxMO8dPpuFSI62RwtSs";
