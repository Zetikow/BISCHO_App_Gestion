// ===================================================================
// PRÉSENCE — pointage par événement (feuille "PresenceEvenements"),
// justifications d'absence, et moyennes de présence par équipe.
//
// Détail par joueur : cliquer une ligne de moyenne (mois ou saison, voir
// renderAverageCard) ouvre une petite fenêtre (pas une page dédiée) listant
// les événements où il a été absent puis présent sur la même période — voir
// renderPresenceDetailModal / computePresenceDetail.
// ===================================================================

function computeAverages(equipe, monthOnly) {
  const roster = rosterForEquipe(equipe);
  let evs = evenements.filter(ev => eventEquipe(ev) === equipe);
  if (monthOnly) {
    const now = new Date();
    evs = evs.filter(ev => {
      const d = eventDateObj(ev);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }
  return roster.map(p => {
    let oui = 0, total = 0;
    evs.forEach(ev => {
      const v = presenceEvenements[`${ev[0]}_${p}`];
      if (v === "Oui" || v === "Non") {
        total++;
        if (v === "Oui") oui++;
      }
    });
    return { p, pct: total > 0 ? (oui / total) * 100 : null, oui, total };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

function renderAverageCard(equipe, monthOnly) {
  const stats = computeAverages(equipe, monthOnly);
  const stateKey = monthOnly ? "__monthAvgExpanded" : "__seasonAvgExpanded";
  const toggleAttr = monthOnly ? "data-toggle-month-avg" : "data-toggle-season-avg";
  const expanded = !!window[stateKey];
  const visible = expanded ? stats : stats.slice(0, 5);
  const monthLabel = new Date().toLocaleDateString("fr-FR", { month: "long" });
  const title = monthOnly ? `Moyenne de présence - ${monthLabel}` : "Moyenne de présence - saison";
  let html = `<div class="card">
    <div class="section-h" style="margin-bottom:8px;">${title}</div>`;
  if (stats.length === 0) {
    html += `<div class="muted">Aucun joueur enregistré pour cette équipe.</div>`;
  } else if (stats.every(s => s.pct === null)) {
    html += `<div class="muted">Pas encore de données de présence.</div>`;
  } else {
    visible.forEach(s => {
      const label = s.pct === null ? "Pas de donnée" : `${fmt(s.pct)} %`;
      const color = s.pct === null ? "#e4e8f2" : (s.pct >= 75 ? "#33d17a" : (s.pct >= 50 ? "#ffb43c" : "#ff5a5a"));
      html += `<div class="presence-row" data-open-presence-detail="1" data-presence-detail-player="${escapeHtml(s.p)}" data-presence-detail-equipe="${escapeHtml(equipe)}" data-presence-detail-month="${monthOnly ? "1" : "0"}">
        <div>${s.p}</div><div style="color:${color}; font-weight:700; font-size:12px;">${label}</div>
      </div>`;
    });
    if (stats.length > 5) {
      html += `<div class="expand-toggle" ${toggleAttr}="1">${expanded ? "Réduire ▲" : `Voir les ${stats.length - 5} autres ▾`}</div>`;
    }
  }
  html += `</div>`;
  return html;
}

// Détail présence/absence d'un joueur pour une équipe donnée, sur la même période (mois en
// cours ou saison) que la ligne de moyenne cliquée — voir renderAverageCard et
// window.__presenceDetailFor (rempli par attachPresenceEvents).
function computePresenceDetail(p, equipe, monthOnly) {
  let evs = evenements.filter(ev => eventEquipe(ev) === equipe);
  if (monthOnly) {
    const now = new Date();
    evs = evs.filter(ev => {
      const d = eventDateObj(ev);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }
  const absences = [], presences = [];
  evs.forEach(ev => {
    const v = presenceEvenements[`${ev[0]}_${p}`];
    if (v === "Oui") presences.push(ev);
    else if (v === "Non") absences.push(ev);
  });
  const byDateDesc = (a, b) => eventDateObj(b) - eventDateObj(a);
  return { absences: absences.sort(byDateDesc), presences: presences.sort(byDateDesc) };
}

function renderPresenceDetailEvRow(ev) {
  const d = eventDateObj(ev);
  const dateLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const titre = typeClass(ev[3]) === "match" ? formatMatchDisplay(ev[4], ev[5]).label : (ev[4] || ev[3] || "Événement");
  return `<div class="presence-detail-ev">
    <span class="presence-detail-ev-date">${dateLabel}</span>
    <span class="presence-detail-ev-title">${escapeHtml(titre)}</span>
  </div>`;
}

// Petite fenêtre (pas une page dédiée) ouverte au clic sur une ligne de moyenne de présence :
// liste les entraînements/matchs où le joueur a été marqué absent, puis présent, sur la même
// période que la ligne cliquée. Fermeture via la croix ou un clic hors de la fenêtre ; bouton
// "agrandir" pour passer en plein cadre (utile sur les périodes avec beaucoup d'événements).
function renderPresenceDetailModal() {
  const ctx = window.__presenceDetailFor;
  if (!ctx) return "";
  const { p, equipe, monthOnly } = ctx;
  const { absences, presences } = computePresenceDetail(p, equipe, monthOnly);
  const expanded = !!window.__presenceDetailExpanded;
  const periodLabel = monthOnly ? new Date().toLocaleDateString("fr-FR", { month: "long" }) : "la saison";

  return `<div class="presence-detail-overlay" data-presence-detail-close-bg="1">
    <div class="presence-detail-sheet ${expanded ? "expanded" : ""}">
      <div class="presence-detail-header">
        <div class="presence-detail-title">${escapeHtml(p)} — ${periodLabel}</div>
        <div class="presence-detail-expand" id="presence-detail-expand-toggle" title="${expanded ? "Réduire" : "Agrandir"}">${expanded ? "⤡" : "⤢"}</div>
        <div class="modal-close" id="presence-detail-close">✕</div>
      </div>
      <div class="presence-detail-body">
        <div class="section-h" style="margin-top:0;">Absences (${absences.length})</div>
        ${absences.length === 0 ? `<div class="muted" style="margin-bottom:14px;">Aucune absence.</div>` : `<div style="margin-bottom:14px;">${absences.map(renderPresenceDetailEvRow).join("")}</div>`}
        <div class="section-h">Présences (${presences.length})</div>
        ${presences.length === 0 ? `<div class="muted">Aucune présence enregistrée.</div>` : presences.map(renderPresenceDetailEvRow).join("")}
      </div>
    </div>
  </div>`;
}

function renderPresencePage() {
  const switcherTeams = equipesForSwitcher().filter(t => t !== "Toutes"); // pas de vue "toutes" pour la présence (roster par équipe)
  const preferredTeam = equipesForRole("Coach")[0] || primaryEquipe();
  const defaultTeam = switcherTeams.includes(preferredTeam) ? preferredTeam : (switcherTeams[0] || "SM1");
  const activeTeam = (window.__presenceTeamView && switcherTeams.includes(window.__presenceTeamView)) ? window.__presenceTeamView : defaultTeam;

  const sorted = sortedEvenements().filter(ev => eventEquipe(ev) === activeTeam);
  const now = new Date();
  const upcoming = sorted.filter(ev => eventDateObj(ev) >= now);
  const past = sorted.filter(ev => eventDateObj(ev) < now).reverse();

  let html = `<div class="page-title">Présence</div><div class="page-sub">Suivi des présences de l'équipe.</div>`;
  html += renderTeamSwitcher(switcherTeams, activeTeam, "presence-team");
  html += renderAverageCard(activeTeam, false);
  html += renderAverageCard(activeTeam, true);

  if (upcoming.length === 0) {
    html += `<div class="section-h">À venir</div><div class="card muted">Aucun événement à venir.</div>`;
  } else {
    let lastLabel = null;
    upcoming.forEach(ev => {
      const label = eventGroupLabel(ev);
      if (label !== lastLabel) {
        html += `<div class="section-h">${label}</div>`;
        lastLabel = label;
      }
      html += renderPresenceEventCard(ev, false, activeTeam);
    });
  }

  if (past.length > 0) {
    html += `<div class="section-h">Passés</div>`;
    past.slice(0, 12).forEach(ev => { html += renderPresenceEventCard(ev, true, activeTeam); });
  }

  html += renderPresenceDetailModal();

  return html;
}

function renderPresenceEventCard(ev, isPast, activeTeam) {
  const [id, date, heure, type, titre, lieu] = ev;
  const d = eventDateObj(ev);
  const expanded = window.__expandedEventId === id;
  const roster = rosterForEquipe(activeTeam || "SM1").map(p => ({ p, val: presenceEvenements[`${id}_${p}`] }));
  const presentCount = roster.filter(r => r.val === "Oui").length;
  const absentCount = roster.filter(r => r.val === "Non").length;
  const pendingCount = roster.length - presentCount - absentCount;
  const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const displayTitre = typeClass(type) === "match" ? formatMatchDisplay(titre, lieu).label : (titre || "Sans titre");

  let html = `<div class="ev-card" style="flex-direction:column; align-items:stretch; ${isPast ? 'opacity:0.6;' : ''}">
    <div style="display:flex; align-items:center; gap:12px; cursor:pointer;" data-toggle-roster="${id}">
      <div class="ev-date"><div class="ev-day">${d.getDate()}</div><div class="ev-month">${d.toLocaleDateString("fr-FR", { month: "short" })}</div></div>
      <div class="ev-divider"></div>
      <div class="ev-info">
        <div class="ev-header-row">
          <div class="ev-title-big">${escapeHtml(displayTitre)}</div>
          <span class="ev-type-big ${typeClass(type)}">${type || "Événement"}</span>
        </div>
        <div class="ev-meta">${dayName} ${formatHeure(ev) ? "· " + formatHeure(ev) : ""}</div>
      </div>
      <div style="color:#e4e8f2; font-size:16px; flex-shrink:0;">${expanded ? "▲" : "▼"}</div>
    </div>`;

  if (expanded) {
    html += `<div style="margin-top:12px; border-top:1px solid #1a2030; padding-top:12px;">
      <div class="stat-bar-row">
        <span style="color:#33d17a; font-weight:800;">${presentCount} présents</span>
        <span style="color:#ff5a5a; font-weight:700;">${absentCount} absents · <span class="muted" style="font-weight:600;">${pendingCount} en attente</span></span>
      </div>
      <div class="section-h" style="margin:14px 0 6px;">Pointer ${dayName}</div>`;
    roster.forEach(r => {
      const justif = presenceJustifications[`${id}_${r.p}`];
      html += `<div class="pres-card">
        <div class="pres-card-row">
          <div class="cn-avatar pres-avatar">${getInitials(r.p)}</div>
          <div class="pres-card-name">${r.p}</div>
          <div class="toggle-group">
            <button class="toggle-btn ${r.val === 'Oui' ? 'present' : ''}" data-mark-presence="${id}" data-mark-player="${r.p}" data-mark-val="1">Oui</button>
            <button class="toggle-btn ${r.val === 'Non' ? 'absent' : ''}" data-mark-presence="${id}" data-mark-player="${r.p}" data-mark-val="0">Non</button>
          </div>
        </div>
        ${r.val === "Non" && justif ? `<div class="justif-note"><b>Motif :</b> ${escapeHtml(justif)}</div>` : ""}
      </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function computePresenceByType(nom, equipe) {
  const relevantEvents = (equipe && equipe !== "Toutes")
    ? evenements.filter(ev => eventEquipe(ev) === equipe)
    : evenements;
  return ["Match", "Entraînement", "Repas"].map(t => {
    const evs = relevantEvents.filter(ev => (ev[3] || "") === t);
    let oui = 0, total = 0;
    evs.forEach(ev => {
      const v = presenceEvenements[`${ev[0]}_${nom}`];
      if (v === "Oui" || v === "Non") {
        total++;
        if (v === "Oui") oui++;
      }
    });
    return { type: t, pct: total > 0 ? Math.round((oui / total) * 100) : null, oui, total };
  });
}

function renderPtypeCard(title, stats) {
  return `<div class="card">
    <div class="section-h">${title}</div>
    ${stats.map(s => `<div class="ptype-row">
      <div class="ptype-label">${s.type === "Entraînement" ? "Entraîn." : s.type}</div>
      <div class="ptype-track"><div class="ptype-fill" style="width:${s.pct ?? 0}%"></div></div>
      <div class="ptype-pct">${s.pct !== null ? s.pct + "%" : "—"}</div>
      <div class="ptype-sub">${s.total > 0 ? `${s.oui}/${s.total}` : "aucune donnée"}</div>
    </div>`).join("")}
  </div>`;
}

// ===================== ACTIONS API =====================

// Présence brute date/joueur (feuille "Presences") : peu utilisée aujourd'hui, gardée pour
// compatibilité (voir data-presence-date dans attachPresenceEvents).
async function writePresence(dateKey, joueur, present) {
  presences[`${dateKey}_${joueur}`] = present ? "Oui" : "Non";
  render();
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=setPresence&date=${dateKey}&joueur=${encodeURIComponent(joueur)}&present=${present ? "Oui" : "Non"}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    const data = await res.json();
    if (!data.ok) { await fetchAll(); return; }
    isOnline = true;
  } catch (err) { isOnline = false; }
  render();
}

async function writePresenceEvenementApi(eventId, nom, present) {
  presenceEvenements[`${eventId}_${nom}`] = present ? "Oui" : "Non";
  render();
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=setPresenceEvenement&eventId=${encodeURIComponent(eventId)}&nom=${encodeURIComponent(nom)}&present=${present ? "Oui" : "Non"}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    isOnline = true;
  } catch (err) { isOnline = false; }
  render();
}

async function writeJustificationApi(eventId, nom, texte) {
  presenceJustifications[`${eventId}_${nom}`] = texte;
  const present = presenceEvenements[`${eventId}_${nom}`] === "Oui" ? "Oui" : "Non";
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=setPresenceEvenement&eventId=${encodeURIComponent(eventId)}&nom=${encodeURIComponent(nom)}&present=${encodeURIComponent(present)}&justification=${encodeURIComponent(texte)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    isOnline = true;
  } catch (err) { isOnline = false; }
  render();
}

function attachPresenceEvents() {
  document.querySelectorAll("[data-toggle-roster]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.toggleRoster;
      window.__expandedEventId = window.__expandedEventId === id ? null : id;
      render();
    };
  });

  document.querySelectorAll("[data-mark-presence]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const eventId = el.dataset.markPresence;
      const player = el.dataset.markPlayer;
      const val = el.dataset.markVal === "1";
      writePresenceEvenementApi(eventId, player, val);
    };
  });

  const toggleNextRoster = document.querySelector("[data-toggle-next-roster]");
  if (toggleNextRoster) toggleNextRoster.onclick = () => {
    window.__nextRosterExpanded = !window.__nextRosterExpanded;
    render();
  };

  const toggleSeasonAvg = document.querySelector("[data-toggle-season-avg]");
  if (toggleSeasonAvg) toggleSeasonAvg.onclick = () => {
    window.__seasonAvgExpanded = !window.__seasonAvgExpanded;
    render();
  };

  const toggleMonthAvg = document.querySelector("[data-toggle-month-avg]");
  if (toggleMonthAvg) toggleMonthAvg.onclick = () => {
    window.__monthAvgExpanded = !window.__monthAvgExpanded;
    render();
  };

  document.querySelectorAll("[data-presence-team]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__presenceTeamView = el.dataset.presenceTeam;
      window.__seasonAvgExpanded = false;
      window.__monthAvgExpanded = false;
      render();
    };
  });

  document.querySelectorAll("[data-presence-date]").forEach(btn => {
    btn.onclick = (e) => {
      vibrate();
      const date = e.target.dataset.presenceDate;
      const val = e.target.dataset.presenceVal === "1";
      writePresence(date, session.nom, val);
    };
  });

  document.querySelectorAll("[data-open-presence-detail]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__presenceDetailFor = {
        p: el.dataset.presenceDetailPlayer,
        equipe: el.dataset.presenceDetailEquipe,
        monthOnly: el.dataset.presenceDetailMonth === "1",
      };
      window.__presenceDetailExpanded = false;
      render();
    };
  });

  const presenceDetailBg = document.querySelector("[data-presence-detail-close-bg]");
  if (presenceDetailBg) presenceDetailBg.onclick = (e) => {
    if (e.target === presenceDetailBg) { window.__presenceDetailFor = null; render(); }
  };

  const presenceDetailClose = document.getElementById("presence-detail-close");
  if (presenceDetailClose) presenceDetailClose.onclick = () => { window.__presenceDetailFor = null; render(); };

  const presenceDetailExpandToggle = document.getElementById("presence-detail-expand-toggle");
  if (presenceDetailExpandToggle) presenceDetailExpandToggle.onclick = () => {
    window.__presenceDetailExpanded = !window.__presenceDetailExpanded;
    render();
  };
}
