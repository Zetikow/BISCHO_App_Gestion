// ===================================================================
// SETUP — point d'entrée unique pour initialiser toutes les feuilles.
// À exécuter UNE FOIS depuis l'éditeur (sélectionner "setup" dans le
// menu déroulant en haut, puis "Exécuter") pour un nouveau classeur.
// Sur un classeur existant, relancer setup() ne réinitialise que Grid
// (voir setupGrid) ; les autres setupXxx() n'écrivent rien si la
// feuille contient déjà des données.
//
// Pour un club qui ne veut pas un module donné (ex. Ostéo), retirer
// simplement l'appel setupXxx() correspondant ci-dessous, en plus de
// supprimer le fichier .gs du module.
// ===================================================================

function setup() {
  setupGrid();
  setupComptes();
  setupPresences();
  setupPaiements();
  setupEvenements();
  setupPresenceEvenements();
  setupActualites();
  setupCovoiturage();
  setupSupport();
  setupOsteoSlots();
  setupOsteoReservations();
  setupCompositions();
  setupSelections();
  setupBenevoles();
  setupGouter();
  setupTableMarque();
  setupMaillots();
  setupFoodtrucks();
  setupRepas();
  ensureGridAction("Non renseigné avant dimanche soir", 1); // lié à Notifications.gs (checkDisponibilitesDimanche)
}

// ===================== MIGRATION ÉQUIPE U17 -> U17M1 =====================
// À exécuter UNE SEULE FOIS depuis l'éditeur (choisir "migrateU17ToU17M1" dans le menu
// déroulant, puis Exécuter) après avoir redéployé le code mis à jour — renomme l'équipe U17
// en U17M1 dans les données déjà enregistrées : Roles de la feuille "Comptes" (ex:
// "Joueur:U17" -> "Joueur:U17M1") et colonne Equipe de la feuille "Evenements". Sans danger à
// relancer plusieurs fois par erreur : une fois fait, il n'y a plus de "U17" exact à remplacer.
function migrateU17ToU17M1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let comptesTouches = 0, evenementsTouches = 0;

  const comptesSheet = ss.getSheetByName("Comptes");
  if (comptesSheet) {
    const data = comptesSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const roles = String(data[i][COL_ROLES] || "");
      if (!roles) continue;
      const updated = roles.split(",").map(pair => {
        const idx = pair.indexOf(":");
        if (idx === -1) return pair;
        const role = pair.slice(0, idx);
        const equipe = pair.slice(idx + 1).trim();
        return equipe === "U17" ? `${role}:U17M1` : pair;
      }).join(",");
      if (updated !== roles) {
        comptesSheet.getRange(i + 1, COL_ROLES + 1).setValue(updated);
        comptesTouches++;
      }
    }
  }

  const evenementsSheet = ss.getSheetByName("Evenements");
  if (evenementsSheet) {
    const data = evenementsSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][6] === "U17") {
        evenementsSheet.getRange(i + 1, 7).setValue("U17M1");
        evenementsTouches++;
      }
    }
  }

  Logger.log(`Migration U17 -> U17M1 terminée : ${comptesTouches} compte(s), ${evenementsTouches} événement(s).`);
}

// ===================== DONNÉES DE DÉPART SPÉCIFIQUES À CE CLUB =====================
// À exécuter UNE FOIS depuis l'éditeur pour ajouter en une fois les comptes parents/joueurs
// d'une équipe — vérifie automatiquement les noms déjà existants (Nom) pour ne jamais créer de
// doublon, même si relancée plusieurs fois par erreur.
// L'effectif réel du club n'est PAS gardé ici : les comptes déjà créés vivent uniquement dans la
// feuille "Comptes" de Google Sheets (ce repo est public — ne pas y remettre de noms complets
// réels). Pour un nouvel effectif, remplace la liste ci-dessous avant d'exécuter (nom affiché,
// rôle:équipe, nom complet) :
function addU17M1ParentsAndPlayers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);

  const nouveauxComptes = [
    // ["Prénom N.", "Parent:Prénom Enfant N.", "Prénom NOM"],
    // ["Prénom Enfant N.", "Joueur:U17M1", "Prénom NOM"],
  ];

  const data = sheet.getDataRange().getValues();
  const nomsExistants = new Set(data.slice(1).map(r => String(r[COL_NOM]).trim()));

  let ajoutes = 0, ignores = 0;
  nouveauxComptes.forEach(([nom, roles, nomComplet]) => {
    if (nomsExistants.has(nom.trim())) {
      Logger.log("Ignoré (déjà existant) : " + nom);
      ignores++;
      return;
    }
    const row = new Array(8).fill("");
    row[COL_NOM] = nom;
    row[COL_ROLES] = roles;
    row[COL_NOMCOMPLET] = nomComplet;
    sheet.appendRow(row);
    nomsExistants.add(nom.trim());
    ajoutes++;
  });

  Logger.log(ajoutes + " compte(s) ajouté(s), " + ignores + " ignoré(s) car déjà existant(s).");
}
