// ===================================================================
// CONSIGNES D'UTILISATION — page d'aide statique, un texte par module
// actif pour ce club. À adapter si vous retirez/ajoutez des modules.
// ===================================================================

function guideSections() {
  const isSM1 = isInTeam("SM1") || hasRole("Admin");
  return [
    { title: "Se connecter", items: [
      "Tape ton nom — une liste de suggestions apparaît au fur et à mesure.",
      "La première fois, choisis un code à 4 chiffres : retiens-le bien, il te sera redemandé à chaque connexion.",
      "Si tu as plusieurs rôles au club (ex : joueur et coach), tous tes accès s'ajoutent automatiquement — rien à choisir.",
    ]},
    { title: "Accueil", items: [
      "Le prochain événement est mis en avant, avec un bouton Présent/Absent en un tap.",
      "Les résultats et prochains matchs de ton équipe défilent en carrousel (glisse ou utilise les flèches) — vert pour une victoire.",
      "Un encart \"Rendez-vous Ostéo\" affiche les créneaux disponibles, réservables directement depuis l'Accueil.",
      isSM1 ? "Un encart Caisse noire et Présence apparaît si ton rôle y donne accès." : "Un encart Présence apparaît si ton rôle y donne accès.",
    ]},
    { title: "Agenda", items: [
      "Matchs, entraînements, repas, soirées — filtrés par équipe si tu en as plusieurs.",
      "Coach/Admin/Salarié peuvent créer un événement avec le bouton \"+ Ajouter un événement\".",
      "Le bouton \"Exporter mon calendrier\" télécharge un fichier à ajouter à l'agenda de ton téléphone.",
    ]},
    { title: "Actualités", items: [
      "Publications de ton équipe et publications générales du club.",
      "Coach, Admin et Salarié peuvent publier une actualité.",
    ]},
    ...(isSM1 ? [{ title: "Caisse noire (SM1)", items: [
      "Chaque joueur SM1 voit sa carte avec le détail des actions et le total dû, ainsi que le montant déjà payé.",
      "Pour un retard (entraînement ou match), indique juste le nombre de minutes — le montant se calcule automatiquement selon le barème.",
      "Seul l'Admin peut modifier un compteur en cas d'erreur, ou consulter le tableau détaillé complet.",
    ]}] : []),
    { title: "Présence", items: [
      "Réservé au Coach et à l'Admin : historique complet et moyennes de présence par joueur.",
    ]},
    ...(isSM1 ? [{ title: "Paiements", items: [
      "Chaque joueur SM1 voit sa propre cotisation restante (sans voir celle des autres) et peut payer via PayPal.",
      "Après paiement, le bouton \"J'ai payé\" prévient l'Admin par mail pour qu'il valide et enregistre.",
      "L'Admin, lui, voit le suivi complet de toute l'équipe et enregistre les paiements reçus.",
    ]}] : []),
    { title: "Profil", items: [
      "Ta photo, tes rôles, ton ou tes postes.",
      "Renseigne ton adresse mail pour recevoir les rappels de présence — c'est le seul moyen d'être prévenu automatiquement.",
      "Si tu es à la fois joueur et coach, bascule entre les deux vues avec les boutons en haut de la page.",
    ]},
    { title: "Espace salariés", items: [
      "Réservé au Salarié et à l'Admin : documents et dossiers du club, hébergés sur Google Drive.",
    ]},
    { title: "Galerie photos", items: [
      "Accessible depuis le bouton 📷 sur la carte des résultats de l'Accueil.",
      "Les photos sont ajoutées par l'Admin ou le Salarié directement sur Google Drive.",
    ]},
    { title: "Gestion Matchs", items: [
      "Covoiturage : visible pour les matchs à l'extérieur uniquement — indique si tu conduis (avec le nombre de places) ou si tu cherches une place. Pour les équipes de mineurs, le joueur ET son parent peuvent tous les deux le renseigner.",
      "Goûter et Table de marque : inscriptions bénévoles pour la préparation, match par match.",
      "Maillots : suivi de qui a le jeu de maillots pour chaque match.",
      "Foodtrucks (Coach/Admin/Salarié) : suivi des foodtrucks sur les matchs à domicile.",
    ]},
    { title: "RDV Ostéo", items: [
      "Onglet \"Disponibles\" : réserve un créneau libre pour ton équipe (ou ouvert à tous), avec un motif optionnel visible seulement par toi et Eve.",
      "Onglet \"Mes RDV\" : tes rendez-vous à venir (annulables, ce qui libère automatiquement le créneau) et ton historique.",
      "Un mail de rappel est envoyé automatiquement la veille de chaque rendez-vous.",
      "Eve (et l'Admin, sous l'onglet Disponibles) peuvent créer des créneaux — y compris récurrents sur plusieurs semaines — et gérer les réservations.",
    ]},
    { title: "Une question qui n'est pas ici ?", items: [
    "Utilise \"Support / une question ?\" dans le menu (en cliquant sur tes initiales) — ton message part directement à l'équipe de gestion du club.",
    "Tu retrouves tes demandes précédentes sur cette même page, avec la réponse dès qu'elle est donnée (et un mail te prévient).",
  ]},
  ];
}

function renderGuidePage() {
  let html = `<button class="back-link" data-goto-page="home">← Retour à l'accueil</button>`;
  html += `<div class="page-title">Consignes d'utilisation</div><div class="page-sub">Tout ce qu'il faut savoir pour utiliser LustuZone</div>`;
  guideSections().forEach(s => {
    html += `<div class="card">
      <div class="section-h" style="margin-top:0;">${escapeHtml(s.title)}</div>
      ${s.items.map(i => `<div style="font-size:12.5px; color:#e4e8f2; margin-bottom:7px; line-height:1.5; padding-left:14px; position:relative;"><span style="position:absolute; left:0;">•</span>${escapeHtml(i)}</div>`).join("")}
    </div>`;
  });
  return html;
}
