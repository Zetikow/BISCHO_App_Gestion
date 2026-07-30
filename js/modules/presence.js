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

// Série en cours par joueur (consécutif de "Oui" en partant de l'événement passé le plus
// récent, en remontant) — s'arrête au premier "Non" ; un événement sans réponse est ignoré
// (ni cassé ni compté), comme pour la moyenne (computeAverages) qui exclut déjà ce cas.
function computePresenceStreaks(equipe) {
  const roster = rosterForEquipe(equipe);
  const now = new Date();
  const evs = evenements.filter(ev => eventEquipe(ev) === equipe && eventDateObj(ev) < now)
    .sort((a, b) => eventDateObj(b) - eventDateObj(a));
  return roster.map(p => {
    let streak = 0;
    for (const ev of evs) {
      const v = presenceEvenements[`${ev[0]}_${p}`];
      if (v === "Oui") streak++;
      else if (v === "Non") break;
    }
    return { p, streak };
  }).sort((a, b) => b.streak - a.streak);
}

// Carte "série + classement présence" — sous les moyennes saison/mois, se recalcule à chaque
// affichage (pas de maintenance manuelle). Classement buteur/passeur à ajouter plus tard, une
// fois les stats de match saisies quelque part.
function renderPresenceStreakCard(equipe) {
  const streaks = computePresenceStreaks(equipe);
  if (streaks.length === 0) return "";
  const presIdentity = myPresenceIdentity();
  const mine = streaks.find(s => s.p === presIdentity.nom);
  const top3 = streaks.filter(s => s.streak > 0).slice(0, 3);
  return `<div class="card">
    ${mine && mine.streak > 0 ? `<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
      <span style="font-size:20px;">🔥</span>
      <div><div style="color:#fff; font-weight:800; font-size:13px;">${mine.streak} match${mine.streak > 1 ? "s" : ""} d'affilée</div><div class="muted" style="font-size:10.5px;">sans absence</div></div>
    </div>` : ""}
    <div class="section-h" style="margin-bottom:6px;">Classement présence</div>
    ${top3.length === 0 ? `<div class="muted">Pas encore de série en cours.</div>` : top3.map((s, i) => `<div class="presence-row"><div>${i + 1}. ${escapeHtml(s.p)}</div><div style="color:#ffc94a; font-weight:700; font-size:12px;">${s.streak} d'affilée</div></div>`).join("")}
    <div class="muted" style="font-size:9.5px; margin-top:8px; font-style:italic;">Classement buteur/passeur à venir dès que les stats de match seront saisies.</div>
  </div>`;
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
  const byDateAsc = (a, b) => eventDateObj(a) - eventDateObj(b);
  return { absences: absences.sort(byDateAsc), presences: presences.sort(byDateAsc) };
}

function renderPresenceDetailEvRow(ev, present) {
  const d = eventDateObj(ev);
  const dateLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const titre = typeClass(ev[3]) === "match" ? formatMatchDisplay(ev[4], ev[5]).label : (ev[4] || ev[3] || "Événement");
  const color = present ? "#33d17a" : "#ff5a5a";
  return `<div class="sheet-row">
    <div class="ic" style="background:${present ? "rgba(51,209,122,0.14)" : "rgba(255,90,90,0.14)"};"><svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">${present ? '<path d="M20 6L9 17l-5-5"/>' : '<path d="M6 6l12 12M18 6L6 18"/>'}</svg></div>
    <div><b>${escapeHtml(titre)}</b><span>${dateLabel}</span></div>
  </div>`;
}

// Fiche (bottom sheet, voir css .sheet-*) ouverte au clic sur une ligne de moyenne de présence :
// liste les entraînements/matchs où le joueur a été marqué absent, puis présent, sur la même
// période que la ligne cliquée. Fermeture via la croix ou un clic hors de la fiche.
function renderPresenceDetailModal() {
  const ctx = window.__presenceDetailFor;
  if (!ctx) return "";
  const { p, equipe, monthOnly } = ctx;
  const { absences, presences } = computePresenceDetail(p, equipe, monthOnly);
  const periodLabel = monthOnly ? new Date().toLocaleDateString("fr-FR", { month: "long" }) : "la saison";
  const total = absences.length + presences.length;
  const pct = total > 0 ? Math.round((presences.length / total) * 100) : null;

  return `<div class="sheet-overlay open" data-close-sheet="presenceDetailFor">
    <div class="sheet-scrim" data-close-sheet="presenceDetailFor"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="presenceDetailFor">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">${escapeHtml(equipe)} · ${periodLabel}</div>
        <h2>${escapeHtml(p)}</h2>
        <p>${pct !== null ? `${pct}% de présence · ${presences.length} présence${presences.length > 1 ? "s" : ""} / ${total} réponse${total > 1 ? "s" : ""}` : "Pas encore de données"}</p>
      </div>
      <div class="sheet-body">
        ${total === 0 ? `<div class="muted">Aucune réponse enregistrée sur cette période.</div>` : ""}
        ${absences.length > 0 ? absences.map(ev => renderPresenceDetailEvRow(ev, false)).join("") : ""}
        ${presences.length > 0 ? presences.map(ev => renderPresenceDetailEvRow(ev, true)).join("") : ""}
      </div>
    </div>
  </div>`;
}

function renderPresencePage() {
  const switcherTeams = equipesForSwitcher().filter(t => t !== "Toutes"); // pas de vue "toutes" pour la présence (roster par équipe)
  const preferredTeam = equipesForRole("Coach")[0] || primaryEquipe();
  const defaultTeam = switcherTeams.includes(preferredTeam) ? preferredTeam : (switcherTeams[0] || "SM1");
  const activeTeam = (window.__presenceTeamView && switcherTeams.includes(window.__presenceTeamView)) ? window.__presenceTeamView : defaultTeam;
  const canManage = hasRole("Coach") || hasRole("Admin");
  const view = (canManage && window.__presenceSubView === "selection") ? "selection" : "presence";

  let html = `<div class="page-title">Présence</div><div class="page-sub">Suivi des présences de l'équipe.</div>`;
  html += renderTeamSwitcher(switcherTeams, activeTeam, "presence-team");

  if (canManage) {
    html += `<div class="mode-tabs">
      <button type="button" class="mode-tab-btn ${view === 'presence' ? 'active' : ''}" data-presence-subview="presence">Présence</button>
      <button type="button" class="mode-tab-btn ${view === 'selection' ? 'active' : ''}" data-presence-subview="selection">Sélection</button>
    </div>`;
  }

  if (view === "selection") {
    return html + renderSelectionSection(activeTeam);
  }

  const sorted = sortedEvenements().filter(ev => eventEquipe(ev) === activeTeam);
  const now = new Date();
  const upcoming = sorted.filter(ev => eventDateObj(ev) >= now);
  const past = sorted.filter(ev => eventDateObj(ev) < now).reverse();

  html += renderAverageCard(activeTeam, false);
  html += renderAverageCard(activeTeam, true);
  html += renderPresenceStreakCard(activeTeam);

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
  html += renderPresenceRosterSheet(activeTeam);

  return html;
}

// ===================== SÉLECTION MATCH (SM1 en premier lieu) =====================
// Distinct de la présence : qui est retenu dans les 12 pour le match, pas juste disponible.
// Réservé Coach/Admin (voir canManage dans renderPresencePage) — feuille "Selections".

function selectionEntryFor(eventId, nom) {
  return selections.find(r => r[0] === eventId && r[1] === nom) || null;
}

function selectionCountFor(eventId) {
  return selections.filter(r => r[0] === eventId && r[2] === "Oui").length;
}

function renderSelectionSection(activeTeam) {
  const matches = sortedEvenements().filter(ev => eventEquipe(ev) === activeTeam && typeClass(ev[3]) === "match");
  if (matches.length === 0) {
    return `<div class="card muted">Aucun match enregistré pour cette équipe.</div>`;
  }
  let html = "";
  matches.forEach(ev => { html += renderSelectionEventCard(ev); });
  html += renderPresenceSelectionSheet(activeTeam);
  return html;
}

function renderSelectionEventCard(ev) {
  const [id, , , , titre, lieu] = ev;
  const d = eventDateObj(ev);
  const isPast = d < new Date();
  const displayTitre = formatMatchDisplay(titre, lieu).label || titre || "Match";
  const count = selectionCountFor(id);
  const countColor = count >= SELECTION_MAX_PLAYERS ? "#ff5a5a" : "#33d17a";

  return `<div class="ev-card" style="flex-direction:column; align-items:stretch; ${isPast ? 'opacity:0.6;' : ''}">
    <div class="sheet-open-zone" style="display:flex; align-items:center; gap:12px;" data-open-presence-selection="${id}">
      <div class="ev-date"><div class="ev-day">${d.getDate()}</div><div class="ev-month">${d.toLocaleDateString("fr-FR", { month: "short" })}</div></div>
      <div class="ev-divider"></div>
      <div class="ev-info">
        <div class="ev-header-row">
          <div class="ev-title-big">${escapeHtml(displayTitre)}</div>
          <span style="color:${countColor}; font-weight:800; font-size:13px;">${count}/${SELECTION_MAX_PLAYERS}</span>
        </div>
        <div class="ev-meta">${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}${formatHeure(ev) ? " · " + formatHeure(ev) : ""}</div>
      </div>
    </div>
  </div>`;
}

async function setSelectionApi(eventId, nom, selectionne) {
  const existing = selectionEntryFor(eventId, nom);
  if (selectionne) {
    if (existing) existing[2] = selectionne; else selections.push([eventId, nom, selectionne]);
  } else if (existing) {
    selections = selections.filter(r => r !== existing);
  }
  render();
  try {
    const params = new URLSearchParams({ action: "setSelection", eventId, nom, selectionne, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    isOnline = true;
  } catch (err) { isOnline = false; }
  render();
}

function renderPresenceEventCard(ev, isPast, activeTeam) {
  const [id, date, heure, type, titre, lieu] = ev;
  const d = eventDateObj(ev);
  const roster = rosterForEquipe(activeTeam || "SM1").map(p => ({ p, val: presenceEvenements[`${id}_${p}`] }));
  const presentCount = roster.filter(r => r.val === "Oui").length;
  const absentCount = roster.filter(r => r.val === "Non").length;
  const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const displayTitre = typeClass(type) === "match" ? formatMatchDisplay(titre, lieu).label : (titre || "Sans titre");
  const pointedColor = roster.length > 0 && (presentCount + absentCount) === roster.length ? "#33d17a" : "#e4e8f2";

  return `<div class="ev-card" style="flex-direction:column; align-items:stretch; ${isPast ? 'opacity:0.6;' : ''}">
    <div class="sheet-open-zone" style="display:flex; align-items:center; gap:12px;" data-open-presence-roster="${id}">
      <div class="ev-date"><div class="ev-day">${d.getDate()}</div><div class="ev-month">${d.toLocaleDateString("fr-FR", { month: "short" })}</div></div>
      <div class="ev-divider"></div>
      <div class="ev-info">
        <div class="ev-header-row">
          <div class="ev-title-big">${escapeHtml(displayTitre)}</div>
          <span class="ev-type-big ${typeClass(type)}">${type || "Événement"}</span>
        </div>
        <div class="ev-meta">${dayName} ${formatHeure(ev) ? "· " + formatHeure(ev) : ""}${roster.length ? ` · <span style="color:${pointedColor}; font-weight:700;">${presentCount + absentCount}/${roster.length} pointés</span>` : ""}</div>
      </div>
    </div>
  </div>`;
}

// ===================== FICHE PRÉSENCE PAR ÉVÉNEMENT (bottom sheet) =====================
// Ouverte en tapant le corps d'une carte de la sous-vue "Présence" (voir window.__presRosterFor).
function renderPresenceRosterSheet(activeTeam) {
  const id = window.__presRosterFor;
  if (!id) return "";
  const ev = evenements.find(e => e[0] === id);
  if (!ev) return "";
  const [, , , type, titre, lieu] = ev;
  const d = eventDateObj(ev);
  const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const displayTitre = typeClass(type) === "match" ? formatMatchDisplay(titre, lieu).label : (titre || "Sans titre");
  const roster = rosterForEquipe(activeTeam || "SM1").map(p => ({ p, val: presenceEvenements[`${id}_${p}`] }));
  const presentCount = roster.filter(r => r.val === "Oui").length;
  const absentCount = roster.filter(r => r.val === "Non").length;
  const pendingCount = roster.length - presentCount - absentCount;

  let bodyHtml = `<div class="stat-bar-row">
    <span style="color:#33d17a; font-weight:800;">${presentCount} présents</span>
    <span style="color:#ff5a5a; font-weight:700;">${absentCount} absents · <span class="muted" style="font-weight:600;">${pendingCount} en attente</span></span>
  </div>
  <div class="section-h" style="margin:14px 0 6px;">Pointer ${dayName}</div>`;
  roster.forEach(r => {
    const justif = presenceJustifications[`${id}_${r.p}`];
    bodyHtml += `<div class="pres-card">
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

  return `<div class="sheet-overlay open" data-close-sheet="presRosterFor">
    <div class="sheet-scrim" data-close-sheet="presRosterFor"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="presRosterFor">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">${escapeHtml(type || "Événement")}</div>
        <h2>${escapeHtml(displayTitre)}</h2>
        <p>${dayName}${formatHeure(ev) ? " · " + formatHeure(ev) : ""}${lieu ? " · " + escapeHtml(lieu) : ""}</p>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

// ===================== FICHE SÉLECTION MATCH (bottom sheet) =====================
// Ouverte en tapant le corps d'une carte de la sous-vue "Sélection" (voir window.__presSelectionFor).
function renderPresenceSelectionSheet(activeTeam) {
  const id = window.__presSelectionFor;
  if (!id) return "";
  const ev = evenements.find(e => e[0] === id);
  if (!ev) return "";
  const [, , , , titre, lieu] = ev;
  const d = eventDateObj(ev);
  const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const displayTitre = formatMatchDisplay(titre, lieu).label || titre || "Match";
  const roster = rosterForEquipe(activeTeam || "SM1");
  const count = selectionCountFor(id);
  const countColor = count >= SELECTION_MAX_PLAYERS ? "#ff5a5a" : "#33d17a";

  let bodyHtml = `<div class="stat-bar-row">
    <span style="color:${countColor}; font-weight:800;">${count}/${SELECTION_MAX_PLAYERS} sélectionnés</span>
  </div>`;
  if (roster.length === 0) {
    bodyHtml += `<div class="muted">Aucun joueur enregistré pour cette équipe.</div>`;
  } else {
    roster.forEach(p => {
      const entry = selectionEntryFor(id, p);
      const selected = entry && entry[2] === "Oui";
      bodyHtml += `<div class="pres-card">
        <div class="pres-card-row">
          <div class="cn-avatar pres-avatar">${getInitials(p)}</div>
          <div class="pres-card-name">${p}</div>
          <button type="button" class="toggle-btn ${selected ? 'present' : ''}" data-toggle-selection-player="${id}|||${p}">${selected ? "Sélectionné" : "Sélectionner"}</button>
        </div>
      </div>`;
    });
  }

  return `<div class="sheet-overlay open" data-close-sheet="presSelectionFor">
    <div class="sheet-scrim" data-close-sheet="presSelectionFor"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="presSelectionFor">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Sélection</div>
        <h2>${escapeHtml(displayTitre)}</h2>
        <p>${dayName}${formatHeure(ev) ? " · " + formatHeure(ev) : ""}${lieu ? " · " + escapeHtml(lieu) : ""}</p>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
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
      <div class="ptype-track"><div class="ptype-fill" data-fill-target="${s.pct ?? 0}" style="width:${window.__pageJustChanged ? 0 : (s.pct ?? 0)}%"></div></div>
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

// present = "Oui" | "Non" | "" (vide = retire la réponse, pas encore répondu).
async function writePresenceEvenementApi(eventId, nom, present) {
  presenceEvenements[`${eventId}_${nom}`] = present;
  render();
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=setPresenceEvenement&eventId=${encodeURIComponent(eventId)}&nom=${encodeURIComponent(nom)}&present=${encodeURIComponent(present)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
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
  document.querySelectorAll("[data-open-presence-roster]").forEach(el => {
    el.onclick = () => { vibrate(); window.__presRosterFor = el.dataset.openPresenceRoster; render(); };
  });

  document.querySelectorAll("[data-mark-presence]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const eventId = el.dataset.markPresence;
      const player = el.dataset.markPlayer;
      const wanted = el.dataset.markVal === "1" ? "Oui" : "Non";
      const current = presenceEvenements[`${eventId}_${player}`];
      writePresenceEvenementApi(eventId, player, current === wanted ? "" : wanted);
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

  document.querySelectorAll("[data-presence-subview]").forEach(el => {
    el.onclick = () => { vibrate(); window.__presenceSubView = el.dataset.presenceSubview; render(); };
  });

  document.querySelectorAll("[data-open-presence-selection]").forEach(el => {
    el.onclick = () => { vibrate(); window.__presSelectionFor = el.dataset.openPresenceSelection; render(); };
  });

  document.querySelectorAll("[data-toggle-selection-player]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const [eventId, nom] = el.dataset.toggleSelectionPlayer.split("|||");
      const entry = selectionEntryFor(eventId, nom);
      const selected = entry && entry[2] === "Oui";
      setSelectionApi(eventId, nom, selected ? "" : "Oui");
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
      render();
    };
  });
  // Fermeture (croix, clic hors de la fiche) : voir data-close-sheet, câblé une seule fois
  // pour toutes les fiches de l'appli dans core/events.js.
}
