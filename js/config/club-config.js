// ===================================================================
// CONFIG DU CLUB — seul fichier (avec Config.gs côté backend) à modifier
// pour adapter le frontend à une autre association : barème, effectif,
// nom d'équipe, salle, liens externes.
// ===================================================================

// ATTENTION : ce barème doit rester identique à ACTIONS dans apps-script/Config.gs
// (source de vérité côté serveur) — à mettre à jour des deux côtés en même temps.
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

// Doit rester identique à PLAYERS dans apps-script/Config.gs.
const PLAYERS = ["Thomas L.","JM B.","Hugo R.","Yann N.","Arnaud H.","Victor S.","Romain J.","Volodia M.","Victor P.","Mattéo MP.","Gabriel W.","Basile L.","Brahim I.","Maximilien M.","Arthur M.","Damien P.","Alexis W.","Mathieu S.","Nicolas Z.","Robin S."];

// Ton identifiant PayPal.me (ex: "HBCBischoffsheim" pour paypal.me/HBCBischoffsheim).
// Laisse vide "" tant que ce n'est pas créé : le bouton Payer reste alors simplement masqué.
const PAYPAL_ME_USERNAME = "CaisseNoireHBCB";
const TEAMS = ["SM1", "U17", "SM2"];

// Libellé affiché pour une équipe, si différent de son identifiant interne (TEAMS/eventEquipe
// restent "U17" côté données — changer ça toucherait les comptes déjà enregistrés dans Google
// Sheets — seul l'affichage change ici). Voir teamDisplayLabel().
const TEAM_DISPLAY_LABELS = { U17: "U17M1" };
function teamDisplayLabel(equipe) { return TEAM_DISPLAY_LABELS[equipe] || equipe; }

// Brûlage : nombre max de matchs avant de ne plus pouvoir redescendre dans l'équipe inférieure.
// SM1 se base sur la Sélection match (feuille "Selections", pas de composition publiée pour
// cette équipe) ; U17 se base sur la composition publiée (comme avant), voir composition.js.
const BRULAGE_MAX_MATCHES_SM1 = 11;
const BRULAGE_MAX_MATCHES_U17 = 10;

// Nombre de places pour la sélection d'un match (compteur "x/12" affiché sur la carte).
const SELECTION_MAX_PLAYERS = 12;

// Adresse mail de relance visible sur Profil/Accueil pour permettre aux joueurs de la renseigner.
const EMAIL_REMINDER_UI_VISIBLE = true;

// Colle ici l'URL d'intégration (iframe) du widget "Équipe" créé sur ton espace Score'n'co,
// une par équipe. Laisse vide "" tant que le widget n'est pas encore créé : la carte ne
// s'affiche simplement pas pour cette équipe-là.
// IDs des widgets "Équipe" Score'n'co (un par équipe), au format div adaptatif —
// pas des URLs d'iframe. Laisse vide "" tant que le widget n'est pas encore créé.
const SCORENCO_WIDGET_IDS = {
  SM1: "192700",
  U17: "",
  SM2: "",
};
// Nom affiché sur le widget Score'n'co le temps qu'il charge.
const SCORENCO_CLUB_LABEL = "HBC Bischoffsheim";

// Nom court de l'équipe/du club utilisé partout où on affiche "Bischo" (cartes de match,
// formulaire de création d'événement...).
const CLUB_TEAM_NAME = "Bischo";
// Reconnaît le nom complet du club dans un titre de match pour en extraire l'adversaire
// (ex: "HBC Bischoffsheim vs Illkirch" -> "Illkirch").
const CLUB_FULL_NAME_PATTERN = /hbc\s*bischoffsheim/gi;
const CLUB_SHORT_NAME_PATTERN = /bischo/gi;

// Mot-clé (en minuscules) présent dans le nom de la salle du club, pour détecter si un match
// est à domicile ou à l'extérieur à partir du lieu renseigné.
const HOME_VENUE_KEYWORD = "lustucru";
// Nom complet de la salle, utilisé comme valeur par défaut dans les formulaires.
const DEFAULT_VENUE_NAME = "Lustucru Arena";

// Lien affiché dans le menu (icône avatar) vers le site du club.
const CLUB_WEBSITE_URL = "https://handballbischoffsheim.fr/";
