// ===================================================================
// ÉTAT GLOBAL — données synchronisées avec le backend, identité de la
// session en cours, et petits utilitaires de lecture/écriture partagés
// par tous les modules (comptes, rôles, équipes).
// ===================================================================

const LOGO_DATA_URI = "images/icon-512.png";
const SESSION_KEY = "caisse-noire-session"; // {nom, role, code, equipe}
const APP_VERSION_KEY = "caisse-noire-app-version";
const LAST_USER_KEY = "lustuzone-last-user"; // simple mémorisation du dernier nom connecté sur cet appareil (pas le code)
const APP_VERSION = "2026-07-24-5"; // À incrémenter à chaque mise à jour déployée
const SEASON_START = new Date(2026, 8, 1);  // 1er septembre 2026
const SEASON_END = new Date(2027, 5, 30);   // 30 juin 2027

let grid = {};
let comptes = []; // [[nom, code, roles, poste, nomComplet, photoUrl, email, pushSubIds], ...] (+ header row) — une ligne par personne
let presences = {}; // { "YYYY-MM-DD_Nom": "1"/"0" }
let paiements = []; // [[id, joueur, montant, date, commentaire], ...]
let evenements = []; // [[id, date, heure, type, titre, lieu, equipe], ...]
let presenceEvenements = {}; // { eventId_nom: "Oui"/"Non" }
let presenceJustifications = {}; // { eventId_nom: "texte du motif" }
let actualites = []; // [[id, titre, scope, texte, auteur, date], ...] (+ header row)
let covoiturage = []; // [[eventId, nom, jeConduit, places, besoinPlace], ...] (+ header row)
let osteoSlots = []; // [[id, date, heure, lieu, equipe, recurrentId], ...] (+ header row)
let osteoReservations = []; // [[slotId, nom, motif], ...] (+ header row)
let compositions = []; // [[matchId, nom, zone, libreX, libreY], ...] — zone = poste fixe (GB/AiG/.../Banc5) ou "Libre"
let compositionsMeta = []; // [[matchId, publie], ...] — publie = "1" une fois visible aux joueurs/parents

let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
if (session && !session.code) { session = null; localStorage.removeItem(SESSION_KEY); }

// Un compte multi-rôles (ex: Joueur SM1 + Coach U17 + Admin) cumule automatiquement tous ses
// droits dès la connexion — pas de "casquette" à choisir. session.roles est la liste de tous
// les rôles/équipes de la personne ; ces fonctions remplacent les anciens session.role/equipe.
function hasRole(roleName) {
  return !!session && Array.isArray(session.roles) && session.roles.some(r => r.role === roleName);
}
function equipesForRole(roleName) {
  if (!session || !Array.isArray(session.roles)) return [];
  return [...new Set(session.roles.filter(r => r.role === roleName).map(r => r.equipe))];
}
function isInTeam(equipeName) {
  return !!session && Array.isArray(session.roles) && session.roles.some(r => r.equipe === equipeName);
}
// Équipe "par défaut" à utiliser quand le contexte ne précise pas de rôle particulier —
// priorité Joueur, puis Coach, puis la première équipe disponible.
function primaryEquipe() {
  if (!session || !Array.isArray(session.roles) || session.roles.length === 0) return "SM1";
  const joueur = session.roles.find(r => r.role === "Joueur");
  if (joueur) return joueur.equipe;
  const coach = session.roles.find(r => r.role === "Coach");
  if (coach) return coach.equipe;
  const parent = session.roles.find(r => r.role === "Parent");
  if (parent) {
    const childRow = findCompteRow(parent.equipe);
    const childTeams = childRow ? rowEquipesForRole(childRow, "Joueur") : [];
    if (childTeams.length) return childTeams[0];
  }
  const firstEquipe = session.roles[0].equipe;
  return TEAMS.includes(firstEquipe) ? firstEquipe : "SM1";
}
function rolesLabel() {
  if (!session || !Array.isArray(session.roles)) return "";
  return [...new Set(session.roles.map(r => r.role))].join(" / ");
}

// Un compte "Parent pur" (sans autre rôle) ne peut que consulter la présence de son enfant,
// pas la modifier — c'est à l'enfant (ou au coach/admin) de le faire.
function myPresenceIdentity() {
  const isPureParent = hasRole("Parent") && !hasRole("Joueur") && !hasRole("Coach") && !hasRole("Admin");
  if (isPureParent) {
    const parentRole = (session.roles || []).find(r => r.role === "Parent");
    if (parentRole) return { nom: parentRole.equipe, editable: false };
  }
  return { nom: session.nom, editable: true };
}

// Retrouve l'identité "Joueur" de la session (peu importe le rôle utilisé pour se connecter,
// puisque tous les rôles liés sont désormais cumulés directement dans session.roles).
function myJoueurIdentity() {
  const joueurRole = (session.roles || []).find(r => r.role === "Joueur");
  if (joueurRole) return { nom: joueurRole.nom || session.nom, equipe: joueurRole.equipe || "SM1" };
  return null;
}

// Si une nouvelle version de l'appli a été déployée, on déconnecte tout le monde
// pour garantir que chacun recharge bien la dernière version et ses dernières données
if (localStorage.getItem(APP_VERSION_KEY) !== APP_VERSION) {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
}
let currentPage = "home";
let isOnline = false;
let loginError = "";
let loginNeedsSetup = null; // null = pas encore vérifié, true/false ensuite
let loginSelectedNom = localStorage.getItem(LAST_USER_KEY) || "";
let loginPrefilledFromMemory = !!loginSelectedNom;
let loginNoms = null; // [{nom, role}, ...] chargé avant connexion, remplace la liste figée PLAYERS pour le menu
let showAddEvent = false;

// ---------- Données ----------

function initGrid() {
  const g = {};
  PLAYERS.forEach(p => {
    g[p] = {};
    ACTIONS.forEach((a, i) => { g[p][i] = i === 0 ? 10 : 0; });
  });
  return g;
}

function parseSheetData(rows) {
  const g = {};
  PLAYERS.forEach((p) => { g[p] = {}; });
  for (let i = 0; i < ACTIONS.length; i++) {
    const sheetRow = rows[i + 1];
    if (!sheetRow) continue;
    PLAYERS.forEach((p, pIndex) => {
      const val = sheetRow[pIndex + 2];
      g[p][i] = (typeof val === "number") ? val : (parseInt(val, 10) || 0);
    });
  }
  return g;
}

function parsePresences(rows) {
  const p = {};
  for (let i = 1; i < rows.length; i++) {
    const [date, joueur, present] = rows[i];
    if (!date) continue;
    const d = (date instanceof Date) ? formatDateKey(date) : String(date).slice(0, 10);
    p[`${d}_${joueur}`] = String(present);
  }
  return p;
}

function parsePresenceEvenements(rows) {
  const p = {};
  const j = {};
  for (let i = 1; i < rows.length; i++) {
    const [eventId, nom, present, justification] = rows[i];
    if (!eventId) continue;
    p[`${eventId}_${nom}`] = String(present);
    if (justification) j[`${eventId}_${nom}`] = String(justification);
  }
  return { p, j };
}

// Toute la page Support est gardée (elle a toujours un champ de message ouvert), mais la page
// Ostéo est listée via ses formulaires précis (ajout/réservation/réassignation de créneau) et
// non "currentPage === osteo" entier — sinon la liste des créneaux ne se rafraîchit jamais tant
// qu'on reste sur la page, même sans aucun formulaire ouvert (ça donnait l'impression que
// l'appli "bloquait" après une création de créneau, sans erreur : il fallait recharger pour
// voir le résultat).
function isFormOpen() {
  return !!window.__compositionDragActive || !!showAddEvent || !!window.__editingEvenementId || !!window.__editingPaiementId || !!window.__showAddPaiement || !!window.__showChangeCode || !!window.__showGenerateTrainings || !!window.__profilPosteAdding || (window.__profilPosteEditIndex !== null && window.__profilPosteEditIndex !== undefined) || !!window.__showAddActualite || !!window.__cnEditPlayer || !!window.__showSalariesAdd || !!window.__salariesPreviewFile || !!window.__salariesUploading || !!window.__profilEmailEditing || currentPage === "support" || !!window.__showAddOsteoSlot || !!window.__osteoReassignId || !!window.__osteoReserveSlotId;
}

function logout() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  render();
}

// ---------- Comptes / rôles ----------
// Schéma Comptes (une ligne par personne) : Nom(0), Code(1, jamais renvoyé par le serveur),
// Roles(2, ex: "Joueur:SM1,Coach:U17,Admin:Toutes"), Poste(3), NomComplet(4), PhotoURL(5),
// Email(6), PushSubIds(7). On lit toujours les rôles d'une ligne en cherchant dans sa cellule
// "Roles", jamais via des colonnes séparées ou un regroupement par "Personne".
function parseRoles(cell) {
  return String(cell || "").split(",").map(s => s.trim()).filter(Boolean).map(pair => {
    const idx = pair.indexOf(":");
    if (idx === -1) return { role: pair, equipe: "SM1" };
    return { role: pair.slice(0, idx).trim(), equipe: pair.slice(idx + 1).trim() || "SM1" };
  });
}
function rowHasRole(row, roleName) {
  return parseRoles(row[2]).some(r => r.role === roleName);
}
function rowEquipesForRole(row, roleName) {
  return parseRoles(row[2]).filter(r => r.role === roleName).map(r => r.equipe);
}

function findCompteRow(nom) {
  return comptes.slice(1).find(c => c[0] === nom) || null;
}

// Liste des joueurs d'une équipe donnée, à partir des comptes réels (plus de dépendance à PLAYERS).
function rosterForEquipe(equipe) {
  return comptes.slice(1).filter(c => rowHasRole(c, "Joueur") && rowEquipesForRole(c, "Joueur").indexOf(equipe) !== -1).map(c => c[0]);
}

// Équipes qu'un compte peut consulter : toutes celles de ses rôles cumulés (ex: un joueur
// SM1 qui est aussi coach U17 voit les deux), et toutes pour l'Admin.
function myAllowedEquipes() {
  if (hasRole("Admin") || hasRole("Ostéo")) return TEAMS.slice();
  const set = new Set();
  (session.roles || []).forEach(r => {
    if (TEAMS.includes(r.equipe)) set.add(r.equipe);
    if (r.role === "Parent") {
      const childRow = findCompteRow(r.equipe);
      if (childRow) rowEquipesForRole(childRow, "Joueur").forEach(t => set.add(t));
    }
  });
  if (set.size === 0) set.add(primaryEquipe());
  return TEAMS.filter(t => set.has(t));
}

function equipesForSwitcher() {
  if (hasRole("Admin")) return TEAMS.slice();
  return myAllowedEquipes();
}

// Équipes concernées par le covoiturage pour cette session : les siennes (Joueur/Coach) +
// celles des enfants dont on est "Parent" (le rôle Parent stocke le nom de l'enfant dans le
// champ "equipe" — on va chercher sa vraie équipe via sa propre ligne Comptes).
function myCarpoolTeams() {
  if (hasRole("Admin")) return TEAMS.slice();
  const set = new Set();
  (session.roles || []).forEach(r => {
    if ((r.role === "Joueur" || r.role === "Coach") && TEAMS.includes(r.equipe)) set.add(r.equipe);
    if (r.role === "Parent") {
      const childRow = findCompteRow(r.equipe);
      if (childRow) rowEquipesForRole(childRow, "Joueur").forEach(t => set.add(t));
    }
  });
  return TEAMS.filter(t => set.has(t));
}

// Qui, dans cette session, peut renseigner le covoiturage pour cette équipe précise — peut être
// plusieurs identités (soi-même ET un ou plusieurs enfants dans la même équipe).
function myCarpoolIdentitiesForTeam(equipe) {
  const identities = [];
  // Un joueur (même mineur, équipe U) peut désormais renseigner son propre covoiturage, en plus
  // de son parent qui garde aussi cette possibilité — les deux peuvent le faire, en autonomie.
  const selfEligible = hasRole("Admin")
    || (hasRole("Joueur") && equipesForRole("Joueur").includes(equipe))
    || (hasRole("Coach") && equipesForRole("Coach").includes(equipe));
  if (selfEligible) identities.push({ nom: session.nom, label: "Toi", isChild: false });
  (session.roles || []).filter(r => r.role === "Parent").forEach(r => {
    const childRow = findCompteRow(r.equipe);
    if (childRow && rowEquipesForRole(childRow, "Joueur").includes(equipe)) {
      identities.push({ nom: r.equipe, label: `Pour ${r.equipe}`, isChild: true });
    }
  });
  return identities;
}
