// ===================================================================
// RÈGLE "DISPONIBILITÉS AVANT DIMANCHE SOIR" — chaque dimanche soir,
// sanctionne automatiquement (comme une absence non justifiée) tout
// joueur SM1 qui n'a pas répondu Présent/Absent aux entraînements de
// la semaine à venir, plus les rappels par mail associés.
// ===================================================================

// À exécuter une seule fois manuellement : installWeeklyDisponibilitesTrigger()
// (menu Apps Script > sélectionner cette fonction > Exécuter). Elle crée le déclencheur
// hebdomadaire ; pas besoin de la relancer ensuite.
function installWeeklyDisponibilitesTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "checkDisponibilitesDimanche") ScriptApp.deleteTrigger(t);
  });
  // Déclenché juste après minuit dimanche->lundi (l'échéance est "dimanche soir/minuit").
  ScriptApp.newTrigger("checkDisponibilitesDimanche")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(0)
    .create();
}

function checkDisponibilitesDimanche() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const evenementsSheet = ss.getSheetByName("Evenements");
  const comptesSheet = ss.getSheetByName("Comptes");
  const presenceEvSheet = ss.getSheetByName("PresenceEvenements");
  const gridSheet = ss.getSheetByName("Grid");
  if (!evenementsSheet || !comptesSheet || !presenceEvSheet || !gridSheet) return;
  ensurePresenceEvenementsSchema(presenceEvSheet);

  const evenements = evenementsSheet.getDataRange().getValues();
  const comptes = comptesSheet.getDataRange().getValues();
  const presenceEv = presenceEvSheet.getDataRange().getValues();

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Entraînements SM1 de la semaine à venir (la caisse noire reste réservée à la SM1 pour le moment)
  const upcomingTrainings = [];
  for (let i = 1; i < evenements.length; i++) {
    const row = evenements[i];
    if (!row[0] || row[3] !== "Entraînement") continue;
    if (String(row[6] || "SM1").trim() !== "SM1") continue;
    const d = new Date(String(row[1]) + "T" + (row[2] || "00:00"));
    if (d >= now && d <= in7Days) upcomingTrainings.push(row);
  }
  if (upcomingTrainings.length === 0) return;

  const responded = new Set();
  for (let i = 1; i < presenceEv.length; i++) {
    if (presenceEv[i][0] && presenceEv[i][1]) responded.add(`${presenceEv[i][0]}_${presenceEv[i][1]}`);
  }

  const joueursSM1 = [];
  for (let i = 1; i < comptes.length; i++) {
    if (rowHasRole(comptes[i], "Joueur") && rowEquipesForRole(comptes[i], "Joueur").indexOf("SM1") !== -1) joueursSM1.push(comptes[i][COL_NOM]);
  }

  upcomingTrainings.forEach(ev => {
    const eventId = ev[0];
    joueursSM1.forEach(nom => {
      const key = `${eventId}_${nom}`;
      if (!responded.has(key)) {
        presenceEvSheet.appendRow([eventId, nom, "Non", "Non renseigné avant l'échéance du dimanche soir (sanction automatique)"]);
        applyCaisseNoireSanction(gridSheet, nom, "Non renseigné avant dimanche soir");
      }
    });
  });
}

// Envoie un rappel par mail aux joueurs SM1 qui n'ont pas encore répondu à un entraînement
// à venir dans les 7 prochains jours — même périmètre exact que checkDisponibilitesDimanche,
// pour que le rappel corresponde toujours à ce qui sera sanctionné.
// mode = "friday" (rappel standard) ou "sunday" (dernier rappel, ton plus urgent).
function sendDisponibilitesReminders(mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const evenementsSheet = ss.getSheetByName("Evenements");
  const comptesSheet = ss.getSheetByName("Comptes");
  const presenceEvSheet = ss.getSheetByName("PresenceEvenements");
  if (!evenementsSheet || !comptesSheet || !presenceEvSheet) return;
  ensureComptesSchema(comptesSheet); // garantit que la colonne Email existe

  const evenements = evenementsSheet.getDataRange().getValues();
  const comptes = comptesSheet.getDataRange().getValues();
  const presenceEv = presenceEvSheet.getDataRange().getValues();

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Tous les entraînements à venir, toutes équipes confondues (plus limité à la SM1).
  const upcomingTrainings = [];
  for (let i = 1; i < evenements.length; i++) {
    const row = evenements[i];
    if (!row[0] || row[3] !== "Entraînement") continue;
    const equipe = String(row[6] || "SM1").trim();
    const d = new Date(String(row[1]) + "T" + (row[2] || "00:00"));
    if (d >= now && d <= in7Days) upcomingTrainings.push({ id: row[0], titre: row[4] || "Entraînement", date: d, equipe });
  }
  if (upcomingTrainings.length === 0) return;

  const responded = new Set();
  for (let i = 1; i < presenceEv.length; i++) {
    if (presenceEv[i][0] && presenceEv[i][1]) responded.add(`${presenceEv[i][0]}_${presenceEv[i][1]}`);
  }

  // Tous les joueurs, toutes équipes (chacun avec la ou les équipes où il est Joueur).
  const joueurs = [];
  for (let i = 1; i < comptes.length; i++) {
    if (rowHasRole(comptes[i], "Joueur")) {
      rowEquipesForRole(comptes[i], "Joueur").forEach(equipe => {
        joueurs.push({ nom: comptes[i][COL_NOM], email: comptes[i][COL_EMAIL] || "", equipe });
      });
    }
  }
  if (joueurs.length === 0) return;

  const subject = mode === "sunday" ? "⏰ Dernier rappel — Présence à renseigner ce soir" : "Rappel — Présence à renseigner d'ici dimanche";

  joueurs.forEach(j => {
    const pending = upcomingTrainings.filter(t => t.equipe === j.equipe && !responded.has(`${t.id}_${j.nom}`));
    if (pending.length === 0) return;

    // Notification push — indépendante du mail ci-dessous (envoyée même sans adresse mail
    // renseignée), même texte quel que soit le mode (friday/sunday). Jamais bloquant.
    try {
      const token = pushTokenForNom(ss, j.nom);
      if (token) sendPushNotification(token, "⏰ Présence à renseigner", "Réponds avant dimanche minuit pour les entraînements de la semaine.");
    } catch (err) {
      Logger.log("Erreur notif push rappel présence à " + j.nom + " : " + err);
    }

    if (!j.email) return; // pas d'adresse mail renseignée : rien à envoyer pour cette personne

    // La sanction caisse noire ne concerne que la SM1 — on ne la mentionne pas aux autres équipes.
    const urgencyLine = j.equipe === "SM1"
      ? (mode === "sunday" ? "C'est aujourd'hui le dernier délai : réponds avant minuit pour éviter la sanction." : "Tu as jusqu'à dimanche minuit pour répondre.")
      : (mode === "sunday" ? "C'est aujourd'hui le dernier délai pour répondre, merci de penser à ton coach !" : "Merci de répondre avant dimanche pour que ton coach puisse s'organiser.");
    const sanctionLine = j.equipe === "SM1" ? "Sans réponse, une sanction de 1€ sera automatiquement ajoutée à ta caisse noire.\n\n" : "";

    const liste = pending.map(t => "- " + t.titre + " (" + Utilities.formatDate(t.date, Session.getScriptTimeZone(), "dd/MM 'à' HH:mm") + ")").join("\n");
    const body = "Bonjour " + j.nom + ",\n\n"
      + "Tu n'as pas encore renseigné ta présence pour :\n" + liste + "\n\n"
      + urgencyLine + "\n"
      + sanctionLine
      + "Réponds directement depuis LustuZone.\n\n"
      + "L'équipe " + j.equipe;
    try {
      MailApp.sendEmail(j.email, subject, body, { name: CLUB_NAME + " " + j.equipe });
    } catch (err) {
      Logger.log("Erreur envoi mail à " + j.nom + " (" + j.equipe + ") : " + err);
    }
  });
}

// À exécuter manuellement pour tester l'envoi de mail tout de suite, sans dépendre d'un vrai
// entraînement à venir non répondu. Remplace "Maximilien M." par ton propre nom exact si besoin.
function testEmailNotification() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Comptes");
  ensureComptesSchema(sheet);
  const data = sheet.getDataRange().getValues();
  const nomCible = "Maximilien M.";
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_NOM]).trim() === nomCible) {
      const email = data[i][COL_EMAIL];
      if (!email) {
        Logger.log("Aucune adresse mail enregistrée pour ce compte — renseigne-la sur le Profil de l'appli, puis relance ce test.");
        return;
      }
      MailApp.sendEmail(email, "Test LustuZone", "Si tu reçois ce mail, les rappels par mail fonctionnent bien !", { name: CLUB_NAME + " SM1" });
      Logger.log("Mail de test envoyé à " + email);
      return;
    }
  }
  Logger.log("Compte introuvable.");
}

function sendDisponibilitesReminderFriday() { sendDisponibilitesReminders("friday"); }
function sendDisponibilitesReminderSunday() { sendDisponibilitesReminders("sunday"); }

// À exécuter UNE FOIS depuis l'éditeur Apps Script pour installer les deux rappels
// (vendredi matin + dimanche matin), en plus du déclencheur de sanction déjà en place.
function installReminderTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === "sendDisponibilitesReminderFriday" || fn === "sendDisponibilitesReminderSunday") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("sendDisponibilitesReminderFriday")
    .timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(9).create();
  ScriptApp.newTrigger("sendDisponibilitesReminderSunday")
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(9).create();
}
