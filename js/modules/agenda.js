// ===================================================================
// AGENDA — matchs, entraînements et autres événements (feuille
// "Evenements") : widget Score'n'co, cartes de résultats/prochains
// matchs, export calendrier (.ics), formulaire de création/édition.
//
// Un match U17 affiche en plus le bouton Composition (voir composition.js
// / renderCompositionCardButtons, appelé depuis renderEventCard) et, une
// fois la compo publiée, peut remplacer le toggle Présent/Absent d'un
// joueur non retenu par un badge verrouillé (compositionNonSelected).
// ===================================================================

function renderScorencoWidget(equipe) {
  const widgetId = SCORENCO_WIDGET_IDS[equipe];
  if (widgetId) {
    // On ne pose ici qu'une simple ancre vide : le vrai widget (créé une seule fois, dans
    // un portail hors de #app) y sera déplacé après le rendu par relocateScorencoWidgets().
    // Ça évite de le détruire/recréer à chaque reconstruction périodique de la page, ce qui
    // le laissait bloqué indéfiniment sur son écran de chargement.
    return `<div class="card">
      <div class="section-h" style="margin-bottom:8px;">Calendrier officiel FFHB — ${equipe}</div>
      <div data-scorenco-anchor="${escapeHtml(equipe)}" style="min-height:500px;"></div>
    </div>`;
  }
  // Pas encore configuré : rappel visible pour l'Admin uniquement (pas de TODO technique
  // affiché aux joueurs/coachs), pour ne pas oublier de créer le widget et coller son ID.
  if (!hasRole("Admin")) return "";
  return `<div class="card scorenco-widget-todo">
    <div class="section-h" style="margin-bottom:6px;">Calendrier officiel FFHB — ${equipe}</div>
    <div class="muted" style="font-size:11px; line-height:1.5;">
      À configurer : demande au club s'il existe déjà un compte <b style="color:#fff;">scorenco.com</b>, sinon crée-en un (gratuit), puis crée un widget "Équipe" pour ${equipe} et donne-moi son identifiant (<code style="color:#5a8fe8;">data-widget-id</code>) pour le coller dans <code style="color:#5a8fe8;">SCORENCO_WIDGET_IDS</code>.
    </div>
  </div>`;
}

// Portail : les vrais widgets Score'n'co vivent en dehors de #app (jamais détruits par nos
// reconstructions), et sont simplement déplacés (pas recréés) vers leur ancre à chaque rendu.
function ensureScorencoPortal() {
  let portal = document.getElementById("scorenco-portal");
  if (!portal) {
    portal = document.createElement("div");
    portal.id = "scorenco-portal";
    portal.style.display = "none";
    document.body.appendChild(portal);
  }
  return portal;
}

function getOrCreateScorencoWidgetEl(equipe, widgetId) {
  let el = document.getElementById("scorenco-widget-" + equipe);
  if (!el) {
    const portal = ensureScorencoPortal();
    el = document.createElement("div");
    el.id = "scorenco-widget-" + equipe;
    el.className = "scorenco-widget";
    el.setAttribute("data-widget-type", "team");
    el.setAttribute("data-widget-id", widgetId);
    el.style.cssText = "background:#F2F5F9; height:500px; display:flex; align-items:center; justify-content:center; flex-direction:column; text-transform:uppercase; font-family:sans-serif; font-weight:bolder; gap:9px; color:#1E457B; border-radius:10px; overflow:hidden;";
    el.innerHTML = "<div class=\"ldsdr\"></div>Score'n'co - " + SCORENCO_CLUB_LABEL;
    portal.appendChild(el);
    ensureScorencoScript();
  }
  return el;
}

function relocateScorencoWidgets() {
  document.querySelectorAll("[data-scorenco-anchor]").forEach(anchor => {
    const equipe = anchor.dataset.scorencoAnchor;
    const widgetId = SCORENCO_WIDGET_IDS[equipe];
    if (!widgetId) return;
    const el = getOrCreateScorencoWidgetEl(equipe, widgetId);
    if (el.parentElement !== anchor) anchor.appendChild(el);
  });
}

// Charge le script Score'n'co une seule fois (il scanne la page pour remplir les
// div .scorenco-widget) — chargé en dehors de #app pour survivre aux reconstructions
// régulières de l'appli, plutôt que d'être rechargé à chaque rendu.
function ensureScorencoScript() {
  if (window.__scorencoScriptLoaded) return;
  window.__scorencoScriptLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.defer = true;
  s.src = "https://widgets.scorenco.com/host/widgets.js";
  document.body.appendChild(s);
}

// Widget "maison" résultats & prochains matchs — utilise directement les événements de type
// Match déjà présents dans l'Agenda (pas de dépendance externe, pas de pub, format fixe :
// les 2 derniers résultats puis les 2 prochains matchs).
function renderResultsWidget(equipe) {
  const now = new Date();
  const matches = evenements.filter(ev => typeClass(ev[3]) === "match" && (eventEquipe(ev) === equipe || eventEquipe(ev) === "Toutes"));
  // Un match est un "résultat" dès qu'un score a été saisi, même si la date n'est pas encore
  // passée (ex: saisi en avance, fuseau horaire) — sinon le score entré n'apparaît jamais.
  const isResult = (ev) => !!ev[7] || eventDateObj(ev) < now;
  const past = matches.filter(isResult).sort((a, b) => eventDateObj(b) - eventDateObj(a)).slice(0, 2).reverse();
  const upcoming = matches.filter(ev => !isResult(ev)).sort((a, b) => eventDateObj(a) - eventDateObj(b)).slice(0, 2);
  if (past.length === 0 && upcoming.length === 0) return "";

  // Le plus récent résultat et le prochain match d'abord (visibles sans avoir à glisser),
  // les éventuels autres juste après dans le même carrousel.
  const ordered = [];
  if (past.length) ordered.push(past[past.length - 1]);
  if (upcoming.length) ordered.push(upcoming[0]);
  past.slice(0, -1).reverse().forEach(ev => ordered.push(ev));
  upcoming.slice(1).forEach(ev => ordered.push(ev));

  const isPastSet = new Set(past.map(ev => ev[0]));
  const cards = ordered.map(ev => renderMatchCard(ev, isPastSet.has(ev[0])));

  const collapseKey = "results_" + equipe;
  const isCollapsed = !!(window.__homeCollapsed && window.__homeCollapsed[collapseKey]);

  return `<div class="matchcard-wrap" style="${isCollapsed ? "background:#11141f; border:1px solid rgba(66,117,212,0.4); border-radius:16px; padding:14px;" : ""}">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:${isCollapsed ? "0" : "8px"};">
      <div class="section-h" style="margin-bottom:0; cursor:pointer;" data-toggle-home-section="${collapseKey}">🤾 Résultats & prochains matchs — ${equipe} ${isCollapsed ? "▾" : "▴"}</div>
      ${!isCollapsed ? `<button class="btn secondary" style="width:auto; padding:6px 12px; font-size:9.5px; margin:0;" data-goto-gallery="${escapeHtml(equipe)}">📷 Photos</button>` : ""}
    </div>
    ${isCollapsed ? "" : `<div class="matchcard-carousel-wrap">
      <button class="carousel-arrow left" data-carousel-scroll="left" aria-label="Précédent">‹</button>
      <div class="matchcard-carousel">${cards.join("")}</div>
      <button class="carousel-arrow right" data-carousel-scroll="right" aria-label="Suivant">›</button>
    </div>
    <div class="carousel-dots">${cards.map((c, i) => `<div class="carousel-dot ${i === 0 ? "active" : ""}"></div>`).join("")}</div>`}
  </div>`;
}

function teamAvatarLabel(name) {
  return (name || "?").trim().slice(0, 3).toUpperCase();
}

function renderMatchCard(ev, isPast) {
  const [, date, heure, , titre, lieu, equipeRaw, score] = ev;
  const d = eventDateObj(ev);
  const dateLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }).replace(".", "").toUpperCase();
  const m = formatMatchDisplay(titre, lieu);
  const showSplit = m.home !== null;
  const homeName = showSplit ? m.home : (titre || "?");
  const awayName = showSplit ? m.away : "";
  const homeIsUs = m.home === CLUB_TEAM_NAME;
  const awayIsUs = m.away === CLUB_TEAM_NAME;
  const photoBtn = `<button class="mc2-photo-btn" data-open-match-photos="${escapeHtml(date)}|||${escapeHtml(titre)}|||${escapeHtml(equipeRaw || "SM1")}" title="Voir les photos">📷</button>`;

  const badge = (name, isUs) => `<div class="mc2-badge ${isUs ? "us" : ""}">${escapeHtml(teamAvatarLabel(name))}</div>`;

  if (isPast && score) {
    const parts = String(score).split("-").map(n => parseInt(n, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const bischoScore = parts[0], advScore = parts[1];
      const leftScore = homeIsUs ? bischoScore : advScore;
      const rightScore = homeIsUs ? advScore : bischoScore;
      let bar = "draw", label = "Match nul";
      if (bischoScore > advScore) { bar = "win"; label = "🏆 Victoire"; }
      else if (bischoScore < advScore) { bar = "loss"; label = "Défaite"; }
      return `<div class="mc2-card ${bar}">
        <div class="mc2-datebar ${bar}">${dateLabel}</div>
        <div class="mc2-teams">
          ${badge(homeName, homeIsUs)}
          <div class="mc2-score ${bar}">${leftScore}<span class="mc2-dash">–</span>${rightScore}</div>
          ${badge(awayName, awayIsUs)}
        </div>
        <div class="mc2-time">${label}</div>
        ${photoBtn}
      </div>`;
    }
  }

  if (isPast) {
    return `<div class="mc2-card">
      <div class="mc2-datebar">${dateLabel}</div>
      <div class="mc2-teams">
        ${badge(homeName, homeIsUs)}
        <div class="mc2-vs">VS</div>
        ${badge(awayName, awayIsUs)}
      </div>
      <div class="mc2-time">⏳ Score à venir</div>
    </div>`;
  }

  const now = new Date();
  const diffDays = Math.round((d - now) / (1000 * 60 * 60 * 24));
  const countdown = diffDays <= 0 ? "Aujourd'hui" : diffDays === 1 ? "Demain" : `Dans ${diffDays}j`;
  return `<div class="mc2-card">
    <div class="mc2-datebar upcoming">${dateLabel}</div>
    <div class="mc2-teams">
      ${badge(homeName, homeIsUs)}
      <div class="mc2-vs">VS</div>
      ${badge(awayName, awayIsUs)}
    </div>
    <div class="mc2-time">${formatHeure(ev) || ""} · ${countdown}</div>
  </div>`;
}

function renderCalendarExportCard() {
  const allowedTeams = myAllowedEquipes();
  if (!window.__calendarExportTeams) window.__calendarExportTeams = allowedTeams.slice();
  const selected = window.__calendarExportTeams;

  const checkboxes = allowedTeams.length > 1 ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
    ${allowedTeams.map(t => `<label style="display:flex; align-items:center; gap:5px; font-size:11px; color:#e4e8f2; font-weight:700;">
      <input type="checkbox" data-export-team-check="${t}" ${selected.includes(t) ? "checked" : ""} style="width:16px; height:16px;" /> ${t}
    </label>`).join("")}
  </div>` : "";

  return `<div class="card">
    <div class="section-h" style="margin-top:0;">Ton calendrier</div>
    <div class="muted" style="font-size:10.5px; margin-bottom:10px; line-height:1.5;">Exporte tes matchs et entraînements pour les ajouter à l'agenda de ton téléphone.${allowedTeams.length > 1 ? " Choisis quelle(s) équipe(s) inclure :" : ""}</div>
    ${checkboxes}
    <button class="btn" id="export-calendar-btn">📅 Exporter mon calendrier (.ics)</button>
  </div>`;
}

// ===================== EXPORT CALENDRIER (.ics) =====================
function pad2(n) { return String(n).padStart(2, "0"); }
function formatICSDate(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}
function escapeICS(text) {
  return String(text || "").replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
}

function exportCalendarICS() {
  const myTeams = (window.__calendarExportTeams && window.__calendarExportTeams.length) ? window.__calendarExportTeams : myAllowedEquipes();
  const relevant = evenements.filter(ev => myTeams.includes(eventEquipe(ev)) || eventEquipe(ev) === "Toutes");
  if (relevant.length === 0) { alert("Aucun événement à exporter pour le moment."); return; }

  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//LustuZone//FR\r\nCALSCALE:GREGORIAN\r\n";
  relevant.forEach(ev => {
    const [id, , , type, titre, lieu] = ev;
    const d = eventDateObj(ev);
    const end = new Date(d.getTime() + 2 * 60 * 60 * 1000); // durée par défaut : 2h
    const displayTitre = typeClass(type) === "match" ? formatMatchDisplay(titre, lieu).label : (titre || type || "Événement");
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${id}@lustuzone\r\n`;
    ics += `DTSTAMP:${formatICSDate(new Date())}\r\n`;
    ics += `DTSTART:${formatICSDate(d)}\r\n`;
    ics += `DTEND:${formatICSDate(end)}\r\n`;
    ics += `SUMMARY:${escapeICS(displayTitre)}\r\n`;
    if (lieu) ics += `LOCATION:${escapeICS(lieu)}\r\n`;
    ics += "END:VEVENT\r\n";
  });
  ics += "END:VCALENDAR\r\n";

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lustuzone-calendrier.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Équipes (SM1/U17/SM2) où ce compte est Joueur ou Coach — la session cumule déjà tous les
// rôles liés automatiquement, plus besoin de recalculer via les comptes/"Personne".
function myScorencoTeams() {
  const teams = new Set();
  (session.roles || []).forEach(r => {
    if ((r.role === "Joueur" || r.role === "Coach") && TEAMS.includes(r.equipe)) teams.add(r.equipe);
    if (r.role === "Parent") {
      const childRow = findCompteRow(r.equipe);
      if (childRow) rowEquipesForRole(childRow, "Joueur").forEach(t => teams.add(t));
    }
  });
  teams.add("SM1"); // équipe première du club : visible pour tout le monde, quelle que soit l'équipe
  return [...teams];
}

function getActiveWeekTrainings() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  let tuesday = new Date(monday); tuesday.setDate(monday.getDate() + 1);
  let thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
  const thursdayEnd = new Date(thursday); thursdayEnd.setHours(23, 59, 59, 999);

  if (now > thursdayEnd) {
    monday.setDate(monday.getDate() + 7);
    tuesday.setDate(tuesday.getDate() + 7);
    thursday.setDate(thursday.getDate() + 7);
  }
  return [tuesday, thursday];
}

function getSeasonWeeks() {
  const weeks = [];
  // trouve le premier mardi >= SEASON_START
  let tuesday = new Date(SEASON_START);
  while (tuesday.getDay() !== 2) tuesday.setDate(tuesday.getDate() + 1);
  while (tuesday <= SEASON_END) {
    const thursday = new Date(tuesday);
    thursday.setDate(tuesday.getDate() + 2);
    weeks.push([new Date(tuesday), thursday]);
    tuesday.setDate(tuesday.getDate() + 7);
  }
  return weeks;
}

function eventDateObj(ev) {
  // ev = [id, date, heure, type, titre, lieu]
  const dateRaw = ev[1] || "";
  const heureRaw = ev[2] || "";
  if (typeof dateRaw === "string" && dateRaw.includes("T")) {
    return new Date(dateRaw); // valeur historique mal formatée, on la parse quand même
  }
  const [y, m, d] = String(dateRaw || "1970-01-01").split("-").map(Number);
  let h = 0, min = 0;
  if (typeof heureRaw === "string" && heureRaw.includes(":")) {
    [h, min] = heureRaw.split(":").map(Number);
  } else if (typeof heureRaw === "string" && heureRaw.includes("T")) {
    const hd = new Date(heureRaw);
    h = hd.getHours(); min = hd.getMinutes();
  }
  return new Date(y || 1970, (m || 1) - 1, d || 1, h || 0, min || 0);
}

function formatHeure(ev) {
  if (!ev[2]) return "";
  const d = eventDateObj(ev);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function sortedEvenements() {
  return evenements.slice().sort((a, b) => eventDateObj(a) - eventDateObj(b));
}

function isEntrainement(ev) {
  return typeClass(ev[3]) === "entrainement";
}

// Un Bénévole ne voit jamais les entraînements, seulement les autres types d'événements.
// Chaque équipe voit ses propres événements + les événements "Toutes" (club-wide, ex: repas/soirée) ;
// l'Admin voit tout. Un Salarié (équipe "Toutes") ne voit que les événements club-wide.
function eventEquipe(ev) {
  return ev[6] || "SM1";
}
function getVisibleEvenements() {
  let list = evenements;
  if (session && !hasRole("Admin") && !hasRole("Ostéo")) {
    const myEquipe = primaryEquipe();
    list = list.filter(ev => {
      const eq = eventEquipe(ev);
      if (myEquipe === "Toutes") return eq === "Toutes";
      return eq === myEquipe || eq === "Toutes";
    });
  }
  if (session && hasRole("Bénévole")) {
    list = list.filter(ev => !isEntrainement(ev));
  }
  return list;
}

function sortedVisibleEvenements() {
  return getVisibleEvenements().slice().sort((a, b) => eventDateObj(a) - eventDateObj(b));
}

function sortedEventsForTeamView(equipeView) {
  let list;
  if (equipeView === "Toutes") {
    list = evenements.filter(ev => eventEquipe(ev) === "Toutes");
  } else {
    list = evenements.filter(ev => { const eq = eventEquipe(ev); return eq === equipeView || eq === "Toutes"; });
  }
  if (hasRole("Bénévole")) list = list.filter(ev => !isEntrainement(ev));
  return list.slice().sort((a, b) => eventDateObj(a) - eventDateObj(b));
}

function nextEvenement() {
  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);
  in7Days.setHours(23, 59, 59, 999);

  const visible = sortedVisibleEvenements();
  // Priorité au prochain match s'il y en a un dans les 7 prochains jours
  const upcomingMatch = visible.find(ev => {
    const d = eventDateObj(ev);
    return d >= now && d <= in7Days && typeClass(ev[3]) === "match";
  });
  if (upcomingMatch) return upcomingMatch;

  // Sinon, l'événement le plus proche, quel que soit son type
  return visible.find(ev => eventDateObj(ev) >= now) || null;
}

function getCurrentWeekEvents() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return sortedVisibleEvenements().filter(ev => {
    const d = eventDateObj(ev);
    return d >= now && d <= end;
  });
}

function formatEventDateFr(ev) {
  return eventDateObj(ev).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function typeClass(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("match")) return "match";
  if (t.includes("entra")) return "entrainement";
  if (t.includes("repas")) return "repas";
  if (t.includes("soir")) return "soiree";
  if (t.includes("benevole") || t.includes("bénévole")) return "benevole";
  return "autre";
}

// Domicile/extérieur : un match est "à domicile" si son lieu correspond à la salle du club.
// Sert à toujours afficher le club à gauche à domicile, à droite à l'extérieur — peu importe
// l'ordre dans lequel le titre a été tapé à la création de l'événement.
function isHomeMatch(lieu) {
  return (lieu || "").toLowerCase().includes(HOME_VENUE_KEYWORD);
}
function extractOpponent(titre) {
  let t = (titre || "").replace(CLUB_FULL_NAME_PATTERN, "").replace(CLUB_SHORT_NAME_PATTERN, "");
  t = t.replace(/\bvs\b|\bcontre\b/gi, " ");
  t = t.replace(/[-–—]/g, " ");
  return t.trim().replace(/\s+/g, " ");
}
function formatMatchDisplay(titre, lieu) {
  const original = titre || "";
  // Comparaison directe (pas de .test() sur CLUB_SHORT_NAME_PATTERN ici) : cette regex partagée
  // porte le flag "g", et .test() sur une regex globale garde un état (lastIndex) entre les
  // appels — ça donnerait un résultat sur deux erroné. .replace() plus bas n'a pas ce problème.
  if (original.toLowerCase().indexOf(CLUB_TEAM_NAME.toLowerCase()) === -1) return { home: null, away: null, label: original };
  const opponent = extractOpponent(original);
  if (!opponent) return { home: null, away: null, label: original };
  const home = isHomeMatch(lieu);
  return home
    ? { home: CLUB_TEAM_NAME, away: opponent, label: `${CLUB_TEAM_NAME} vs ${opponent}` }
    : { home: opponent, away: CLUB_TEAM_NAME, label: `${opponent} vs ${CLUB_TEAM_NAME}` };
}

function weekRangeLabel(d) {
  const monday = new Date(d);
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  monday.setDate(d.getDate() - dow);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt) => dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `du ${fmt(monday)} au ${fmt(sunday)}`;
}

function eventGroupLabel(ev) {
  return `Semaine ${weekRangeLabel(eventDateObj(ev))}`;
}

function renderNextEventCard() {
  const ev = nextEvenement();
  if (!ev) return "";
  const [id, date, heure, type] = ev;
  const presIdentity = myPresenceIdentity();
  const val = presenceEvenements[`${id}_${presIdentity.nom}`];
  const now = new Date();
  const evDate = eventDateObj(ev);
  const diffDays = Math.round((evDate - now) / (1000 * 60 * 60 * 24));
  const countdownLabel = diffDays <= 0 ? "Aujourd'hui" : diffDays === 1 ? "Demain" : `Dans ${diffDays} jours`;

  // Une fois la Sélection publiée pour ce match, on ne redemande plus Présent/Absent : le
  // joueur voit juste s'il a été retenu ou non (voir selectionStatusFor, presence.js).
  const selStatus = selectionStatusFor(ev, presIdentity.nom);
  let actionsHtml = "";
  if (!hasRole("Bénévole")) {
    if (selStatus) {
      actionsHtml = `<div class="nc-actions"><div class="selection-status-badge ${selStatus === 'selected' ? 'selected' : 'not-selected'}">${selStatus === 'selected' ? '✅ Sélectionné' : 'Non sélectionné'}</div></div>`;
    } else if (presIdentity.editable) {
      actionsHtml = `<div class="nc-actions">
        <div class="pres-toggle">
          <button type="button" class="pres-toggle-option ${val === 'Oui' ? 'active' : ''}" data-event-presence="${id}" data-event-val="1">Présent</button>
          <button type="button" class="pres-toggle-option ${val === 'Non' ? 'active' : ''}" data-event-presence="${id}" data-event-val="0">Absent</button>
        </div>
      </div>`;
    } else {
      const statusLabel = val === "Oui" ? "✅ Présent" : val === "Non" ? "❌ Absent" : "⏳ Pas encore répondu";
      actionsHtml = `<div class="nc-actions"><div class="muted" style="font-size:12px;">Présence de ${escapeHtml(presIdentity.nom)} : ${statusLabel}</div></div>`;
    }
  }

  return `<div class="next-card"><div class="nc-inner">
    <div class="nc-glow"></div>
    <div class="sheet-open-zone" data-open-event-detail="${id}">
      <span class="ev-type ${typeClass(type)}">${type || "Événement"}</span>
      <div class="nc-countdown" style="margin-left:6px;">⚡ ${countdownLabel}</div>
      <div class="nc-title">${ev[4] || "Événement"}</div>
      <div class="nc-meta">${formatEventDateFr(ev)} ${ev[2] ? "· " + formatHeure(ev) : ""} ${ev[5] ? "· " + ev[5] : ""}</div>
    </div>
    ${actionsHtml}
  </div></div>`;
}

// ===================== FICHE ÉVÉNEMENT (bottom sheet) =====================
// Ouverte en tapant le corps d'une carte événement (Agenda ou "Prochain événement" de
// l'Accueil) — voir window.__eventDetailId, câblé une seule fois côté core/render.js pour
// fonctionner depuis n'importe quelle page. Le raccourci Présent/Absent reste directement
// sur la carte (voir renderEventCard/renderNextEventCard) : la fiche ne fait que regrouper
// le détail (lieu, présence, composition...), pas remplacer le geste rapide.
function renderEventDetailSheet() {
  const id = window.__eventDetailId;
  if (!id) return "";
  const ev = evenements.find(e => e[0] === id);
  if (!ev) return "";
  const [, date, heure, type, titre, lieu, equipe, score] = ev;
  const displayTitre = typeClass(type) === "match" ? formatMatchDisplay(titre, lieu).label : (titre || "Sans titre");
  const canManage = hasRole("Coach") || hasRole("Admin") || (hasRole("Salarié") && !hasRole("Joueur"));
  const presIdentity = myPresenceIdentity();
  const val = presenceEvenements[`${id}_${presIdentity.nom}`];
  const isPast = eventDateObj(ev) < new Date();
  // Une fois la Sélection publiée pour ce match, on ne redemande plus Présent/Absent : le
  // joueur voit juste s'il a été retenu ou non (voir selectionStatusFor, presence.js).
  const selStatus = selectionStatusFor(ev, presIdentity.nom);

  let presentCount = 0, absentCount = 0;
  const allNames = [...PLAYERS, "Coach", "Admin", "Bénévole"];
  allNames.forEach(n => {
    const v = presenceEvenements[`${id}_${n}`];
    if (v === "Oui") presentCount++;
    else if (v === "Non") absentCount++;
  });

  let html = `<div class="sheet-overlay open" data-close-sheet="eventDetailId">
    <div class="sheet-scrim" data-close-sheet="eventDetailId"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="eventDetailId">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">${escapeHtml(type || "Événement")}${equipe && equipe !== "Toutes" ? " · " + escapeHtml(teamDisplayLabel(equipe)) : ""}</div>
        <h2>${escapeHtml(displayTitre)}</h2>
        <p>${formatEventDateFr(ev)}${heure ? " · " + formatHeure(ev) : ""}</p>
      </div>
      <div class="sheet-body">`;

  if (lieu) {
    html += `<div class="sheet-row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 21s-7-5.2-7-11a7 7 0 0114 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></div>
      <div><b>${escapeHtml(lieu)}</b><span>${typeClass(type) === "match" ? (isHomeMatch(lieu) ? "Match à domicile" : "Match à l'extérieur") : "Lieu du rendez-vous"}</span></div>
    </div>`;
  }

  if (typeClass(type) === "match" && isPast && score) {
    html += `<div class="sheet-row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 2l2.7 6.6L21 9.3l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.9l-5-4.6 6.3-0.7z"/></svg></div>
      <div><b>Score final : ${escapeHtml(score)}</b><span>Match terminé</span></div>
    </div>`;
  }

  if (canManage) {
    html += `<div class="sheet-row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div><b>${presentCount} présent${presentCount > 1 ? "s" : ""} · ${absentCount} absent${absentCount > 1 ? "s" : ""}</b><span>Réponses reçues</span></div>
    </div>`;
  } else if (!hasRole("Bénévole") && selStatus) {
    html += `<div class="sheet-row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div><b>${selStatus === 'selected' ? '✅ Sélectionné' : 'Non sélectionné'}</b><span>Sélection pour ce match</span></div>
    </div>`;
  } else if (!hasRole("Bénévole")) {
    const statusLabel = val === "Oui" ? "✅ Présent" : val === "Non" ? "❌ Absent" : "⏳ Pas encore répondu";
    html += `<div class="sheet-row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>
      <div><b>${statusLabel}</b><span>Ta présence pour cet événement</span></div>
    </div>`;
  }

  const compoButtons = renderCompositionCardButtons(ev);
  if (compoButtons) {
    html += `<div class="sheet-row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></div>
      <div style="flex:1;"><b>Composition</b><span>${compositionIsPublished(id) ? "Publiée" : "Pas encore publiée"}</span></div>
    </div>
    <div style="padding-left:43px; margin-top:-4px;">${compoButtons}</div>`;
  }

  const selectionButton = renderSelectionCardButton(ev);
  if (selectionButton) {
    html += `<div class="sheet-row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div>
      <div style="flex:1;"><b>Sélection</b><span>Publiée aux joueurs</span></div>
    </div>
    <div style="padding-left:43px; margin-top:-4px;">${selectionButton}</div>`;
  }

  if (!isPast && !hasRole("Bénévole") && presIdentity.editable && !selStatus && !compositionNonSelected(ev, presIdentity.nom)) {
    html += `<div style="margin-top:8px;">
      <div class="pres-toggle">
        <button type="button" class="pres-toggle-option ${val === 'Oui' ? 'active' : ''}" data-event-presence="${id}" data-event-val="1">Présent</button>
        <button type="button" class="pres-toggle-option ${val === 'Non' ? 'active' : ''}" data-event-presence="${id}" data-event-val="0">Absent</button>
      </div>
    </div>`;
  }

  html += `</div>
    </div>
  </div>`;
  return html;
}

function renderGenerateTrainingsForm(equipe) {
  let defMardiDate = "", defMardiHeure = "20:00", defMardiLieu = DEFAULT_VENUE_NAME;
  let defJeudiDate = "", defJeudiHeure = "20:00", defJeudiLieu = DEFAULT_VENUE_NAME;
  if (equipe === "SM1") {
    defMardiDate = formatDateKey(SEASON_START);
    defJeudiDate = formatDateKey(SEASON_START);
    defJeudiHeure = "20:15";
  } else if (equipe === "U17M1") {
    defMardiDate = "2026-09-01"; defMardiHeure = "18:30"; defMardiLieu = DEFAULT_VENUE_NAME;
    defJeudiDate = "2026-09-03"; defJeudiHeure = "18:30"; defJeudiLieu = "Gymnase Rosheim";
  }
  return `<div class="add-form">
    <div class="section-h">Mardi</div>
    <label class="field-label">À partir du</label>
    ${dateSelectHtml("gen-mardi-date", defMardiDate)}
    <label class="field-label">Heure</label>
    ${heureSelectHtml("gen-mardi-heure", defMardiHeure)}
    <label class="field-label">Lieu</label>
    <input id="gen-mardi-lieu" type="text" value="${defMardiLieu}" />
    <div class="section-h" style="margin-top:10px;">Jeudi</div>
    <label class="field-label">À partir du</label>
    ${dateSelectHtml("gen-jeudi-date", defJeudiDate)}
    <label class="field-label">Heure</label>
    ${heureSelectHtml("gen-jeudi-heure", defJeudiHeure)}
    <label class="field-label">Lieu</label>
    <input id="gen-jeudi-lieu" type="text" value="${defJeudiLieu}" />
    <button class="btn" id="submit-generate-trainings" style="margin-top:8px;" data-gen-equipe="${equipe}">Générer les entraînements ${equipe}</button>
  </div>`;
}

function renderAgenda() {
  // "Salarié pur" = sans autre rôle lié à une équipe (Joueur/Coach/Admin). Un compte qui cumule
  // Salarié + un autre rôle (ex: Joueur SM1 + Coach U17 + Admin + Salarié) garde son accès complet
  // aux équipes — seul un Salarié sans aucun autre rôle est cantonné à la vue "Toutes équipes".
  const isSalarie = hasRole("Salarié") && !hasRole("Joueur") && !hasRole("Coach") && !hasRole("Admin");
  const canManage = hasRole("Coach") || hasRole("Admin") || isSalarie;
  const switcherTeams = isSalarie ? [] : equipesForSwitcher();
  const defaultTeam = isSalarie ? "Toutes" : (hasRole("Admin") ? (switcherTeams[0] || "SM1") : (primaryEquipe()));
  const activeTeam = isSalarie ? "Toutes" : ((window.__agendaTeamView && switcherTeams.includes(window.__agendaTeamView)) ? window.__agendaTeamView : defaultTeam);
  const equipeLabel = activeTeam === "Toutes" ? "du club (repas, soirées, événements communs)" : `de l'équipe ${activeTeam}`;
  let html = `<div class="page-title">Agenda</div><div class="page-sub">Matchs, entraînements et événements ${equipeLabel}.</div>`;

  if (canManage) {
    html += `<button class="btn add-btn-primary" id="toggle-add-event">+ Ajouter un événement</button>`;
  }

  html += renderTeamSwitcher(switcherTeams, activeTeam, "agenda-team");

  html += renderCalendarExportCard();

  if (hasRole("Admin") && activeTeam !== "Toutes") {
    html += `<button class="add-toggle" id="toggle-generate-trainings" style="border-style:solid; color:#e4e8f2;">📅 ${window.__showGenerateTrainings ? "− Fermer" : "Générer les entraînements (mar/jeu)"}</button>`;
    if (window.__showGenerateTrainings) html += renderGenerateTrainingsForm(activeTeam);
  }

  const sorted = sortedEventsForTeamView(activeTeam);
  const now = new Date();
  const upcoming = sorted.filter(ev => eventDateObj(ev) >= now);
  const past = sorted.filter(ev => eventDateObj(ev) < now).reverse();

  let staggerIndex = 0;

  // "Passés" en premier mais replié par défaut (clic sur le titre pour dérouler) — évite que
  // l'historique ne pousse "À venir" hors de l'écran à chaque ouverture de la page.
  if (past.length > 0) {
    const pastKey = "agenda_passes_" + activeTeam;
    const pastOpen = !!(window.__homeCollapsed && window.__homeCollapsed[pastKey]);
    html += `<div class="section-h" style="cursor:pointer;" data-toggle-home-section="${pastKey}">Passés ${pastOpen ? "▴" : "▾"}</div>`;
    if (pastOpen) {
      past.slice(0, 8).forEach(ev => { html += renderEventCard(ev, canManage, true, staggerIndex++); });
    }
  }

  if (upcoming.length === 0) {
    html += `<div class="section-h">À venir</div><div class="card muted">Aucun événement à venir pour le moment.</div>`;
  } else {
    let lastLabel = null;
    upcoming.forEach(ev => {
      const label = eventGroupLabel(ev);
      if (label !== lastLabel) {
        html += `<div class="section-h">${label}</div>`;
        lastLabel = label;
      }
      html += renderEventCard(ev, canManage, false, staggerIndex++);
    });
  }

  if (window.__compositionMatchId) html += renderCompositionEditor(window.__compositionMatchId);
  if (window.__compositionViewMatchId) html += renderCompositionPlayerView(window.__compositionViewMatchId);

  html += renderAddEventSheet();

  return html;
}

// ===================== FICHE AJOUT ÉVÉNEMENT (bottom sheet) =====================
function renderAddEventSheet() {
  if (!window.__showAddEvent) return "";
  const isSalarie = hasRole("Salarié") && !hasRole("Joueur") && !hasRole("Coach") && !hasRole("Admin");
  const switcherTeams = isSalarie ? [] : equipesForSwitcher();
  const defaultTeam = isSalarie ? "Toutes" : (hasRole("Admin") ? (switcherTeams[0] || "SM1") : (primaryEquipe()));
  const activeTeam = isSalarie ? "Toutes" : ((window.__agendaTeamView && switcherTeams.includes(window.__agendaTeamView)) ? window.__agendaTeamView : defaultTeam);
  const effectiveType = window.__addEventType || (isSalarie ? "Repas" : "Match");
  const isMatchType = effectiveType === "Match";

  const bodyHtml = `
    <label class="field-label">Date</label>
    ${dateSelectHtml("ev-date", "")}
    <label class="field-label">Heure</label>
    ${heureSelectHtml("ev-heure", "")}
    <label class="field-label">Type</label>
    <select id="ev-type">
      ${isSalarie ? "" : `<option value="Match" ${effectiveType === "Match" ? "selected" : ""}>Match</option><option value="Entraînement" ${effectiveType === "Entraînement" ? "selected" : ""}>Entraînement</option>`}
      <option value="Repas" ${effectiveType === "Repas" ? "selected" : ""}>Repas</option>
      <option value="Soirée" ${effectiveType === "Soirée" ? "selected" : ""}>Soirée</option>
      <option value="Bénévole" ${effectiveType === "Bénévole" ? "selected" : ""}>Bénévole</option>
      <option value="Autre" ${effectiveType === "Autre" ? "selected" : ""}>Autre</option>
    </select>
    ${isMatchType ? `
    <label class="field-label">Équipe 1</label>
    <input type="text" value="${CLUB_TEAM_NAME}" disabled style="opacity:0.6;" />
    <label class="field-label">Adversaire</label>
    <input id="ev-adversaire" type="text" placeholder="ex: Illkirch" />
    ` : `
    <label class="field-label">Titre</label>
    <input id="ev-titre" type="text" placeholder="ex: Repas d'équipe" />
    `}
    <label class="field-label">Lieu</label>
    <input id="ev-lieu" type="text" value="${DEFAULT_VENUE_NAME}" />
    ${(hasRole("Admin")) ? `<label class="field-label">Équipe</label>
    <select id="ev-equipe">
      ${TEAMS.map(t => `<option value="${t}" ${activeTeam === t ? "selected" : ""}>${teamDisplayLabel(t)}</option>`).join("")}
      <option value="Toutes" ${activeTeam === "Toutes" ? "selected" : ""}>Toutes (club entier)</option>
    </select>` : ""}
    <button class="btn" id="submit-add-event" style="margin-top:12px;">Enregistrer l'événement</button>`;

  return `<div class="sheet-overlay open" data-close-sheet="showAddEvent">
    <div class="sheet-scrim" data-close-sheet="showAddEvent"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="showAddEvent">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Agenda</div>
        <h2>Ajouter un événement</h2>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

function renderJustifBlock(eventId) {
  const saved = presenceJustifications[`${eventId}_${session.nom}`] || "";
  const editing = !!(window.__justifEditing && window.__justifEditing[eventId]);

  if (saved && !editing) {
    return `<div class="justif-wrap">
      <label class="field-label" style="margin-top:8px;">Motif de l'absence</label>
      <div class="justif-saved">
        <span>${escapeHtml(saved)}</span>
        <button type="button" class="justif-edit-btn" data-justif-edit="${eventId}">Modifier</button>
      </div>
    </div>`;
  }

  return `<div class="justif-wrap">
    <label class="field-label" style="margin-top:8px;">Motif de l'absence</label>
    <input type="text" id="justif-${eventId}" class="justif-input" placeholder="ex : blessure, travail, transport..." value="${escapeHtml(saved)}" />
    <button type="button" class="btn secondary justif-validate-btn" data-justif-validate="${eventId}">Valider le motif</button>
  </div>`;
}

function renderEventCard(ev, canManage, isPast, staggerIndex) {
  const [id, date, heure, type, titre, lieu, equipe, score] = ev;
  const d = eventDateObj(ev);
  const presIdentity = myPresenceIdentity();
  const val = presenceEvenements[`${id}_${presIdentity.nom}`];
  // Une fois la Sélection publiée pour ce match, on ne redemande plus Présent/Absent : le
  // joueur voit juste s'il a été retenu ou non (voir selectionStatusFor, presence.js).
  const selStatus = selectionStatusFor(ev, presIdentity.nom);
  let presentCount = 0, absentCount = 0;
  const allNames = [...PLAYERS, "Coach", "Admin", "Bénévole"];
  allNames.forEach(n => {
    const v = presenceEvenements[`${id}_${n}`];
    if (v === "Oui") presentCount++;
    else if (v === "Non") absentCount++;
  });

  if (canManage && window.__editingEvenementId === id) {
    return `<div class="ev-card" style="display:block;">
      <label class="field-label">Date</label>
      ${dateSelectHtml(`edit-ev-date-${id}`, date || "")}
      <label class="field-label">Heure</label>
      ${heureSelectHtml(`edit-ev-heure-${id}`, heure || "")}
      <label class="field-label">Type</label>
      <select id="edit-ev-type-${id}">
        ${["Match", "Entraînement", "Repas", "Soirée", "Bénévole", "Autre"].map(t => `<option value="${t}" ${type === t ? "selected" : ""}>${t}</option>`).join("")}
      </select>
      <label class="field-label">Titre</label>
      <input id="edit-ev-titre-${id}" type="text" value="${titre || ''}" />
      <label class="field-label">Lieu</label>
      <input id="edit-ev-lieu-${id}" type="text" value="${lieu || ''}" />
      ${(hasRole("Admin") || hasRole("Salarié")) ? `<label class="field-label">Équipe</label>
      <select id="edit-ev-equipe-${id}">
        ${TEAMS.map(t => `<option value="${t}" ${(equipe || "SM1") === t ? "selected" : ""}>${teamDisplayLabel(t)}</option>`).join("")}
        <option value="Toutes" ${equipe === "Toutes" ? "selected" : ""}>Toutes (club entier)</option>
      </select>` : ""}
      ${type === "Match" ? (() => {
        const parts = (score || "").split("-");
        const scoreUs = parts[0] || "";
        const scoreThem = parts[1] || "";
        return `<label class="field-label">Score final (une fois le match joué)</label>
        <div style="display:flex; align-items:center; gap:8px;">
          <input id="edit-ev-score-us-${id}" type="number" min="0" placeholder="${CLUB_TEAM_NAME}" value="${scoreUs}" style="flex:1; text-align:center;" />
          <span class="muted">—</span>
          <input id="edit-ev-score-them-${id}" type="number" min="0" placeholder="Adverse" value="${scoreThem}" style="flex:1; text-align:center;" />
        </div>`;
      })() : ""}
      <div class="row-flex" style="margin-top:10px;">
        <button class="btn" style="flex:1;" data-save-event="${id}">Enregistrer</button>
        <button class="btn secondary" style="flex:1;" data-cancel-edit-event="1">Annuler</button>
      </div>
    </div>`;
  }

  const dateFr = eventDateObj(ev).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const heureFmt = formatHeure(ev);
  const displayTitre = typeClass(type) === "match" ? formatMatchDisplay(titre, lieu).label : (titre || "Sans titre");

  // Résultat du match (si passé et score saisi) : victoire = halo vert animé, défaite = rouge —
  // remplace l'assombrissement générique des événements passés pour ce cas précis.
  let outcomeClass = "";
  if (isPast && typeClass(type) === "match" && score) {
    const parts = String(score).split("-").map(n => parseInt(n, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      if (parts[0] > parts[1]) outcomeClass = "ev-outcome-win";
      else if (parts[0] < parts[1]) outcomeClass = "ev-outcome-loss";
    }
  }

  // Cascade d'entrée uniquement lors d'un vrai changement de page (window.__pageJustChanged,
  // voir render.js) — sinon le rafraîchissement périodique (fetchAll toutes les 8-10s) rejouerait
  // l'animation en boucle sur des cartes identiques.
  const cascadeStyle = (!isPast && window.__pageJustChanged && typeof staggerIndex === "number")
    ? `animation:cardCascadeIn 0.35s ease-out forwards; animation-delay:${Math.min(staggerIndex * 0.06, 0.6)}s;`
    : "";
  return `<div class="ev-card ${outcomeClass} ${canManage ? 'ev-has-kebab' : ''}" style="${isPast && !outcomeClass ? 'opacity:0.55;' : ''} ${cascadeStyle}">    <div class="ev-date"><div class="ev-day">${d.getDate()}</div><div class="ev-month">${d.toLocaleDateString("fr-FR", { month: "short" })}</div></div>
    <div class="ev-divider"></div>
    <div class="ev-info">
      ${canManage ? `<div class="ev-kebab-wrap">
        <span class="ev-kebab" data-toggle-ev-menu="${id}">⋮</span>
        ${window.__evMenuOpen === id ? `<div class="avatar-menu ev-menu">
          <div class="avatar-menu-item" data-edit-event="${id}">✎ Modifier</div>
          <div class="avatar-menu-item danger" data-delete-event="${id}">✕ Supprimer</div>
        </div>` : ""}
      </div>` : ""}
      <div class="sheet-open-zone" data-open-event-detail="${id}">
        <div class="ev-header-row">
          <div class="ev-title-big">${escapeHtml(displayTitre)}</div>
          <span class="ev-type-big ${typeClass(type)}">${type || "Événement"}</span>
        </div>
        <div class="ev-date-full">${dateFr}${heureFmt ? " · " + heureFmt : ""}</div>
        <div class="ev-meta">${lieu || ""}${canManage ? (lieu ? " · " : "") + presentCount + " présents / " + absentCount + " absents" : ""}</div>
      </div>
      ${(!isPast && !hasRole("Bénévole")) ? (
        selStatus
          ? `<div class="selection-status-badge ${selStatus === 'selected' ? 'selected' : 'not-selected'}">${selStatus === 'selected' ? '✅ Sélectionné' : 'Non sélectionné'}</div>`
          : (compositionNonSelected(ev, presIdentity.nom)
            ? `<div class="composition-not-selected-badge">🔒 Non sélectionné</div>`
            : (presIdentity.editable ? `<div class="pres-toggle" style="margin-top:8px;">
        <button type="button" class="pres-toggle-option ${val === 'Oui' ? 'active' : ''}" data-event-presence="${id}" data-event-val="1">Présent</button>
        <button type="button" class="pres-toggle-option ${val === 'Non' ? 'active' : ''}" data-event-presence="${id}" data-event-val="0">Absent</button>
      </div>
      ${val === 'Non' ? renderJustifBlock(id) : ""}` : `<div class="muted" style="margin-top:8px; font-size:11.5px;">Présence de ${escapeHtml(presIdentity.nom)} : ${val === "Oui" ? "✅ Présent" : val === "Non" ? "❌ Absent" : "⏳ Pas encore répondu"}</div>`))
      ) : ""}
      ${renderCompositionCardButtons(ev)}
      ${renderSelectionCardButton(ev)}
    </div>
  </div>`;
}

// ===================== ACTIONS API =====================

async function addEvenementApi(date, heure, type, titre, lieu, equipe) {
  // Optimiste : on ferme le formulaire et on affiche la carte tout de suite (id provisoire),
  // sans attendre l'aller-retour serveur — voir fetchAll() qui remplace ensuite cette liste par
  // la version serveur (id définitif) une fois la réponse arrivée.
  const finalEquipe = equipe || primaryEquipe();
  const tempId = "temp_" + Date.now();
  evenements.push([tempId, date, heure, type, titre, lieu, finalEquipe, ""]);
  window.__showAddEvent = false;
  render();
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=addEvenement&date=${encodeURIComponent(date)}&heure=${encodeURIComponent(heure)}&type=${encodeURIComponent(type)}&titre=${encodeURIComponent(titre)}&lieu=${encodeURIComponent(lieu)}&equipe=${encodeURIComponent(finalEquipe)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    const data = await res.json();
    if (data.ok) {
      await fetchAll();
    } else {
      evenements = evenements.filter(ev => ev[0] !== tempId);
      showToast(`Échec : ${data.error || "erreur"}${data.detail ? " — " + data.detail : ""}`, "error");
      render();
    }
  } catch (err) {
    isOnline = false;
    evenements = evenements.filter(ev => ev[0] !== tempId);
    showToast("Échec de l'ajout", "error");
    render();
  }
}

async function deleteEvenementApi(id) {
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=deleteEvenement&id=${encodeURIComponent(id)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function updateEvenementApi(id, date, heure, type, titre, lieu, equipe, score) {
  try {
    const params = new URLSearchParams({ action: "updateEvenement", id, date, heure, type, titre, lieu, equipe: equipe || "SM1", authNom: session.nom, authCode: session.code });
    if (score !== undefined) params.set("score", score);
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    window.__editingEvenementId = null;
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function generateSeasonTrainingsApi(equipe, startMardi, heureMardi, lieuMardi, startJeudi, heureJeudi, lieuJeudi) {
  const end = formatDateKey(SEASON_END);
  const params = new URLSearchParams({
    action: "generateSeasonTrainings", equipe, end,
    heureMardi: heureMardi || "20:00", heureJeudi: heureJeudi || "20:00",
    lieuMardi: lieuMardi || "", lieuJeudi: lieuJeudi || "",
    authNom: session.nom, authCode: session.code,
  });
  if (startMardi) params.set("startMardi", startMardi);
  if (startJeudi) params.set("startJeudi", startJeudi);
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    window.__showGenerateTrainings = false;
    await fetchAll();
    alert(data.ok ? `${data.created} entraînement(s) ajouté(s) à l'agenda ${equipe}.` : "Une erreur est survenue.");
  } catch (err) { isOnline = false; render(); }
}

function attachAgendaEvents() {
  document.querySelectorAll("[data-open-event-detail]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__eventDetailId = el.dataset.openEventDetail;
      render();
    };
  });

  document.querySelectorAll("[data-event-presence]").forEach(btn => {
    btn.onclick = (e) => {
      vibrate();
      const eventId = e.currentTarget.dataset.eventPresence;
      const wanted = e.currentTarget.dataset.eventVal === "1" ? "Oui" : "Non";
      // Recliquer sur le choix déjà actif le retire (retour à "pas encore répondu") — pas
      // obligé de trancher Présent/Absent si on ne sait pas encore.
      const current = presenceEvenements[`${eventId}_${session.nom}`];
      const newVal = current === wanted ? "" : wanted;
      writePresenceEvenementApi(eventId, session.nom, newVal);
      if (newVal === "Oui" && presenceJustifications[`${eventId}_${session.nom}`]) {
        if (window.__justifEditing) window.__justifEditing[eventId] = false;
        writeJustificationApi(eventId, session.nom, "");
      }
    };
  });

  document.querySelectorAll("[data-justif-validate]").forEach(btn => {
    btn.onclick = (e) => {
      vibrate();
      const eventId = e.currentTarget.dataset.justifValidate;
      const input = document.getElementById(`justif-${eventId}`);
      const texte = input ? input.value.trim() : "";
      window.__justifEditing = window.__justifEditing || {};
      window.__justifEditing[eventId] = false;
      writeJustificationApi(eventId, session.nom, texte);
    };
  });

  document.querySelectorAll("[data-justif-edit]").forEach(btn => {
    btn.onclick = (e) => {
      vibrate();
      const eventId = e.currentTarget.dataset.justifEdit;
      window.__justifEditing = window.__justifEditing || {};
      window.__justifEditing[eventId] = true;
      render();
    };
  });

  document.querySelectorAll(".matchcard-carousel").forEach(track => {
    const dotsWrap = track.closest(".card")?.querySelector(".carousel-dots");
    if (!dotsWrap) return;
    track.addEventListener("scroll", () => {
      const cardWidth = track.querySelector(".mc2-card")?.offsetWidth || 1;
      const idx = Math.round(track.scrollLeft / (cardWidth + 10));
      dotsWrap.querySelectorAll(".carousel-dot").forEach((dot, i) => dot.classList.toggle("active", i === idx));
    }, { passive: true });
  });

  document.querySelectorAll("[data-carousel-scroll]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const wrap = el.closest(".matchcard-carousel-wrap");
      const track = wrap && wrap.querySelector(".matchcard-carousel");
      if (!track) return;
      const card = track.querySelector(".mc2-card");
      const cardWidth = card ? card.offsetWidth + 10 : 200;
      track.scrollBy({ left: el.dataset.carouselScroll === "right" ? cardWidth : -cardWidth, behavior: "smooth" });
    };
  });

  document.querySelectorAll("[data-toggle-home-section]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const key = el.dataset.toggleHomeSection;
      if (!window.__homeCollapsed) window.__homeCollapsed = {};
      window.__homeCollapsed[key] = !window.__homeCollapsed[key];
      render();
    };
  });

  const exportCalendarBtn = document.getElementById("export-calendar-btn");
  if (exportCalendarBtn) exportCalendarBtn.onclick = () => { vibrate(); exportCalendarICS(); };

  document.querySelectorAll("[data-export-team-check]").forEach(el => {
    el.onchange = () => {
      const t = el.dataset.exportTeamCheck;
      if (!window.__calendarExportTeams) window.__calendarExportTeams = [];
      if (el.checked) {
        if (!window.__calendarExportTeams.includes(t)) window.__calendarExportTeams.push(t);
      } else {
        window.__calendarExportTeams = window.__calendarExportTeams.filter(x => x !== t);
      }
    };
  });

  const toggleAddEvent = document.getElementById("toggle-add-event");
  if (toggleAddEvent) toggleAddEvent.onclick = () => {
    vibrate();
    window.__showAddEvent = true;
    window.__addEventType = null;
    render();
  };

  const evTypeSelect = document.getElementById("ev-type");
  if (evTypeSelect) evTypeSelect.onchange = (e) => {
    window.__addEventType = e.target.value;
    render();
  };

  document.querySelectorAll("[data-agenda-team]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__agendaTeamView = el.dataset.agendaTeam;
      window.__showGenerateTrainings = false;
      render();
    };
  });

  const toggleGenerateTrainings = document.getElementById("toggle-generate-trainings");
  if (toggleGenerateTrainings) toggleGenerateTrainings.onclick = () => {
    window.__showGenerateTrainings = !window.__showGenerateTrainings;
    render();
  };

  const submitGenerateTrainings = document.getElementById("submit-generate-trainings");
  if (submitGenerateTrainings) submitGenerateTrainings.onclick = (e) => {
    const equipe = e.currentTarget.dataset.genEquipe;
    const startMardi = readDateSelect("gen-mardi-date");
    const heureMardi = readHeureSelect("gen-mardi-heure");
    const lieuMardi = document.getElementById("gen-mardi-lieu").value;
    const startJeudi = readDateSelect("gen-jeudi-date");
    const heureJeudi = readHeureSelect("gen-jeudi-heure");
    const lieuJeudi = document.getElementById("gen-jeudi-lieu").value;
    if (!startMardi && !startJeudi) { alert("Renseigne au moins une date de départ (mardi ou jeudi)."); return; }
    if (confirm(`Générer les entraînements ${equipe} pour toute la saison ? Les entraînements déjà existants pour cette équipe ne seront pas dupliqués.`)) {
      generateSeasonTrainingsApi(equipe, startMardi, heureMardi, lieuMardi, startJeudi, heureJeudi, lieuJeudi);
    }
  };

  const submitAddEvent = document.getElementById("submit-add-event");
  if (submitAddEvent) submitAddEvent.onclick = () => {
    const date = readDateSelect("ev-date");
    const heure = readHeureSelect("ev-heure");
    const type = document.getElementById("ev-type").value;
    let titre;
    if (type === "Match") {
      const adversaire = (document.getElementById("ev-adversaire").value || "").trim();
      if (!adversaire) { alert("Merci de renseigner l'adversaire."); return; }
      titre = `${CLUB_TEAM_NAME} vs ${adversaire}`;
    } else {
      titre = document.getElementById("ev-titre").value;
    }
    const lieu = document.getElementById("ev-lieu").value;
    const equipeSelect = document.getElementById("ev-equipe");
    const equipe = equipeSelect ? equipeSelect.value : (hasRole("Salarié") ? "Toutes" : primaryEquipe());
    if (!date || !titre) { alert("Merci de renseigner au moins la date complète et le titre."); return; }
    addEvenementApi(date, heure, type, titre, lieu, equipe);
  };

  document.querySelectorAll("[data-toggle-ev-menu]").forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      vibrate();
      const id = el.dataset.toggleEvMenu;
      window.__evMenuOpen = window.__evMenuOpen === id ? null : id;
      render();
    };
  });

  document.querySelectorAll("[data-delete-event]").forEach(el => {
    el.onclick = () => {
      window.__evMenuOpen = null;
      const id = el.dataset.deleteEvent;
      if (confirm("Supprimer cet événement ?")) deleteEvenementApi(id);
    };
  });

  document.querySelectorAll("[data-edit-event]").forEach(el => {
    el.onclick = () => { window.__evMenuOpen = null; window.__editingEvenementId = el.dataset.editEvent; render(); };
  });

  document.querySelectorAll("[data-cancel-edit-event]").forEach(el => {
    el.onclick = () => { window.__editingEvenementId = null; render(); };
  });

  document.querySelectorAll("[data-save-event]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.saveEvent;
      const date = readDateSelect(`edit-ev-date-${id}`);
      const heure = readHeureSelect(`edit-ev-heure-${id}`);
      const type = document.getElementById(`edit-ev-type-${id}`).value;
      const titre = document.getElementById(`edit-ev-titre-${id}`).value;
      const lieu = document.getElementById(`edit-ev-lieu-${id}`).value;
      const equipeSelect = document.getElementById(`edit-ev-equipe-${id}`);
      const existing = evenements.find(ev => ev[0] === id);
      const equipe = equipeSelect ? equipeSelect.value : (existing ? existing[6] : "SM1");
      if (!date || !titre) { alert("Merci de renseigner au moins la date complète et le titre."); return; }
      let score;
      const scoreUsInput = document.getElementById(`edit-ev-score-us-${id}`);
      const scoreThemInput = document.getElementById(`edit-ev-score-them-${id}`);
      if (scoreUsInput && scoreThemInput) {
        score = (scoreUsInput.value !== "" && scoreThemInput.value !== "") ? `${scoreUsInput.value}-${scoreThemInput.value}` : "";
      }
      updateEvenementApi(id, date, heure, type, titre, lieu, equipe, score);
    };
  });
}
