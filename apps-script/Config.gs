// ===================================================================
// CONFIG DU CLUB — seul fichier à modifier pour adapter le backend à
// une autre association (barème, effectif, colonnes de la feuille
// Comptes). Le reste du projet ne contient plus aucune donnée propre
// à un club en particulier.
// ===================================================================

const ACTIONS = [
  ["participation mensuelle", 5],
  ["Retard entraînement", 1],
  ["Retard match", 1],
  ["Absence non justifié à l'entrainement", 10],
  ["Oubli de vêtement entraînement", 3],
  ["Oubli de vêtement match", 6],
  ["Absence non justifié au match", 50],
  ["Oubli de chasuble", 2],
  ["Taxer une serviette de douche", 2],
  ["Taxer du savon", 1],
  ["Taxer de la crème", 0.5],
  ["Carton Rouge direct", 7],
  ["2min pour avoir râler", 4],
  ["Carton bleu", 15],
  ["Pas de logo BISCHO pour le déplacement", 5],
  ["Ballon dégueulasse (vraiment !)", 2],
  ["Oubli du ballon (match / entrainement)", 2],
  ["Taxer de l'eau", 1],
  ["Pas présent repas après match domicile", 5],
  ["Nom dans le journal", 2],
  ["Photo dans le journal", 4],
  ["Pire action du match (+ déguisement)", 1],
  ["Meilleure action du match", 2],
  ["Autre (à préciser)", 1],
];

// ATTENTION : ce barème est aussi dupliqué côté frontend (js/config/club-config.js,
// à venir) pour l'affichage. Les deux doivent rester synchronisés manuellement.
const PLAYERS = ["Thomas L.","JM B.","Hugo R.","Yann N.","Arnaud H.","Victor S.","Romain J.","Volodia M.","Victor P.","Mattéo MP.","Gabriel W.","Basile L.","Brahim I.","Maximilien M.","Arthur M.","Damien P.","Alexis W.","Mathieu S.","Nicolas Z.","Robin S."];

// Colonnes de la feuille "Comptes" (une ligne par personne) :
// Nom, Code, Roles, Poste, NomComplet, PhotoURL, Email, PushSubIds
const COL_NOM = 0, COL_CODE = 1, COL_ROLES = 2, COL_POSTE = 3, COL_NOMCOMPLET = 4, COL_PHOTOURL = 5, COL_EMAIL = 6, COL_PUSHSUBIDS = 7;

// Adresse mail de gestion du club, qui reçoit une copie de chaque message envoyé
// depuis la page Support de l'appli.
const CLUB_SUPPORT_EMAIL = "hbcb.gestion@gmail.com";

// Nom du club utilisé comme expéditeur des mails automatiques (rappels de présence, etc.)
const CLUB_NAME = "HBC Bischoffsheim";

// Reconnaît le nom complet/court du club dans un titre de match (ex: "Bischo vs Illkirch") pour
// en extraire l'adversaire — utilisé côté serveur pour construire le texte des notifications
// push (compo publiée, sélection, match demain...). DOIT rester identique à
// CLUB_FULL_NAME_PATTERN/CLUB_SHORT_NAME_PATTERN dans js/config/club-config.js (source de
// vérité pour l'affichage côté frontend, voir extractOpponent() dans js/modules/agenda.js).
const CLUB_FULL_NAME_PATTERN = /hbc\s*bischoffsheim/gi;
const CLUB_SHORT_NAME_PATTERN = /bischo/gi;
function extractOpponentFromTitre(titre) {
  let t = String(titre || "").replace(CLUB_FULL_NAME_PATTERN, "").replace(CLUB_SHORT_NAME_PATTERN, "");
  t = t.replace(/\bvs\b|\bcontre\b/gi, " ");
  t = t.replace(/[-–—]/g, " ");
  return t.trim().replace(/\s+/g, " ");
}

// Convertit une date stockée au format texte "YYYY-MM-DD" (voir Evenements.gs) en "DD/MM/YYYY"
// pour l'affichage dans les notifications — renvoie la valeur telle quelle si le format ne
// correspond pas (ne casse jamais l'envoi d'une notification pour un souci de format).
function formatDateFr(dateStr) {
  const s = String(dateStr || "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
