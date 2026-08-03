// ===================================================================
// GESTION DES MATCHS — covoiturage (extérieur), goûter d'après match
// (domicile), disponibilité table de marque (domicile + extérieur) et
// suivi des maillots (qui les prend à laver, domicile + extérieur).
// Une sous-section à la fois (window.__gestionMatchsSection), même
// sélecteur d'équipe que le reste (feuilles Covoiturage/Gouter/
// TableMarque/Maillots côté backend). Concerne les 3 équipes du club
// (SM1, SM2, U17M1) — pas de restriction par équipe, contrairement à
// ASHS/Balancier où l'équipe senior principale a son propre système
// "Cartes" séparé (repas/apéro), qui n'existe pas chez Bischo.
// ===================================================================

const GESTION_MATCHS_SECTIONS = [
  { id: "covoiturage", label: "Covoiturage" },
  { id: "gouter", label: "Goûter" },
  { id: "tablemarque", label: "Table de marque" },
  { id: "maillots", label: "Maillots" },
  { id: "repas", label: "Repas" },
];

// Suivi du repas d'après-match : réservé Admin/Coach/Salarié, pas un onglet joueur/parent.
function canManageRepas() {
  return hasRole("Admin") || hasRole("Coach") || hasRole("Salarié");
}

// SM1 et SM2 ne gèrent pas le goûter/la table de marque/les maillots/le repas d'après-match —
// seul le covoiturage les concerne (demande club, ne s'applique pas à U17M1).
const GESTION_MATCHS_TEAM_EXCLUDED_SECTIONS = {
  SM1: ["gouter", "tablemarque", "maillots", "repas"],
  SM2: ["gouter", "tablemarque", "maillots", "repas"],
};

function gestionMatchsSectionsForRole(activeTeam) {
  const excluded = GESTION_MATCHS_TEAM_EXCLUDED_SECTIONS[activeTeam] || [];
  return GESTION_MATCHS_SECTIONS.filter(s => (s.id !== "repas" || canManageRepas()) && !excluded.includes(s.id));
}

const GESTION_MATCHS_USAGE_KEY = "bischo-gestion-matchs-usage";

// Fréquence d'usage par section, propre à cet appareil (localStorage) — pas de notion de
// compte serveur ici, juste une préférence locale qui fait remonter ce que CE téléphone
// utilise le plus, pour réduire le nombre de sections visibles d'un coup sur mobile.
function gestionMatchsUsageCounts() {
  try { return JSON.parse(localStorage.getItem(GESTION_MATCHS_USAGE_KEY) || "{}"); }
  catch (err) { return {}; }
}

function bumpGestionMatchsUsage(id) {
  const counts = gestionMatchsUsageCounts();
  counts[id] = (counts[id] || 0) + 1;
  try { localStorage.setItem(GESTION_MATCHS_USAGE_KEY, JSON.stringify(counts)); } catch (err) {}
}

// Sections triées par usage décroissant (les plus cliquées en premier) — tri stable, donc à
// usage égal (ex: 0 clic, première visite) on garde l'ordre par défaut de GESTION_MATCHS_SECTIONS.
function gestionMatchsSectionsSorted(activeTeam) {
  const counts = gestionMatchsUsageCounts();
  return gestionMatchsSectionsForRole(activeTeam)
    .map((s, i) => ({ s, i, n: counts[s.id] || 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(x => x.s);
}

function covoitEntryFor(eventId, nom) {
  return covoiturage.find(r => r[0] === eventId && r[1] === nom) || null;
}
// Goûter façon "apero" : liste de choix extensible par match (voir gouterOptionsFor), chaque
// personne coche ce qu'elle apporte — une ligne par item coché (gouterSignupsFor), remplace
// l'ancien champ texte libre unique par personne.
function gouterOptionsFor(eventId) {
  const row = gouterOptions.find(r => r[0] === eventId);
  if (!row) return [];
  try { return JSON.parse(row[1] || "[]"); } catch (err) { return []; }
}
function gouterSignupsFor(eventId) {
  return gouter.filter(r => r[0] === eventId);
}
function gouterHasItem(eventId, nom, item) {
  return gouter.some(r => r[0] === eventId && r[1] === nom && r[2] === item);
}
function tableMarqueEntryFor(eventId, nom) {
  return tableMarque.find(r => r[0] === eventId && r[1] === nom) || null;
}
function maillotsEntryFor(eventId, nom) {
  return maillots.find(r => r[0] === eventId && r[1] === nom) || null;
}
// Nombre de fois où cette personne a pris les maillots sur la saison.
function maillotsCountFor(nom) {
  return maillots.filter(r => r[1] === nom && r[2] === "Oui").length;
}

async function setCovoiturageApi(nom, eventId, jeConduit, places, besoinPlace) {
  const existing = covoitEntryFor(eventId, nom);
  if (existing) { existing[2] = jeConduit; existing[3] = places; existing[4] = besoinPlace; }
  else covoiturage.push([eventId, nom, jeConduit, places, besoinPlace]);
  render();
  try {
    const params = new URLSearchParams({ action: "setCovoiturage", nom, eventId, jeConduit, places, besoinPlace, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
  } catch (err) { isOnline = false; render(); }
}

async function setGouterItemApi(nom, eventId, item, checked) {
  const already = gouterHasItem(eventId, nom, item);
  if (checked && !already) gouter.push([eventId, nom, item]);
  else if (!checked && already) gouter = gouter.filter(r => !(r[0] === eventId && r[1] === nom && r[2] === item));
  render();
  try {
    const params = new URLSearchParams({ action: "setGouter", nom, eventId, item, valeur: checked ? "Oui" : "", authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
  } catch (err) { isOnline = false; render(); }
}

async function addGouterOptionApi(eventId, option) {
  const row = gouterOptions.find(r => r[0] === eventId);
  if (row) {
    const opts = gouterOptionsFor(eventId);
    if (opts.indexOf(option) === -1) { opts.push(option); row[1] = JSON.stringify(opts); }
  } else {
    gouterOptions.push([eventId, JSON.stringify([option])]);
  }
  render();
  try {
    const params = new URLSearchParams({ action: "addGouterOption", eventId, option, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function removeGouterOptionApi(eventId, option) {
  if (!confirm(`Retirer "${option}" de la liste ?`)) return;
  const row = gouterOptions.find(r => r[0] === eventId);
  if (row) row[1] = JSON.stringify(gouterOptionsFor(eventId).filter(o => o !== option));
  render();
  try {
    const params = new URLSearchParams({ action: "removeGouterOption", eventId, option, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function setTableMarqueApi(nom, eventId, disponible) {
  const existing = tableMarqueEntryFor(eventId, nom);
  if (disponible) {
    if (existing) existing[2] = disponible; else tableMarque.push([eventId, nom, disponible]);
  } else if (existing) {
    tableMarque = tableMarque.filter(r => r !== existing);
  }
  render();
  try {
    const params = new URLSearchParams({ action: "setTableMarque", nom, eventId, disponible, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
  } catch (err) { isOnline = false; render(); }
}

async function setMaillotsApi(nom, eventId, pris) {
  const existing = maillotsEntryFor(eventId, nom);
  if (pris) {
    if (existing) existing[2] = pris; else maillots.push([eventId, nom, pris]);
  } else if (existing) {
    maillots = maillots.filter(r => r !== existing);
  }
  render();
  try {
    const params = new URLSearchParams({ action: "setMaillots", nom, eventId, pris, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
  } catch (err) { isOnline = false; render(); }
}

function gestionMatchsUpcoming(activeTeam, homeFilter) {
  const now = new Date();
  return evenements.filter(ev => {
    if (typeClass(ev[3]) !== "match" || eventEquipe(ev) !== activeTeam || eventDateObj(ev) < now) return false;
    if (homeFilter === "home") return isHomeMatch(ev[5]);
    if (homeFilter === "away") return !isHomeMatch(ev[5]);
    return true; // "both"
  }).sort((a, b) => eventDateObj(a) - eventDateObj(b));
}

// section identifie quelle liste ouvrir dans la fiche (voir renderGestionMatchsDetailSheet) au
// tap sur l'en-tête — le raccourci personnel (cp-edit-box, juste en dessous) reste lui toujours
// directement sur la carte, jamais caché dans la fiche.
function matchCardHeader(ev, badges, section) {
  const [id, , , , titre, lieu] = ev;
  const d = eventDateObj(ev);
  const dateLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }).replace(".", "").toUpperCase();
  return `<div class="cp-match-head sheet-open-zone" data-open-gm-detail="${section}|||${escapeHtml(id)}">
    <div><div class="cp-match-title">${escapeHtml(titre || "Match")}</div><div class="cp-match-sub">${dateLabel} · ${formatHeure(ev) || ""} · ${escapeHtml(lieu || "")}</div></div>
    <div style="display:flex; gap:6px;">${badges}</div>
  </div>`;
}

// Fiche (bottom sheet) listant qui fait quoi pour un match, sur l'une des 4 sections
// Covoiturage/Goûter/Table de marque/Maillots — ouverte au tap sur l'en-tête d'une carte.
function renderGestionMatchsDetailSheet() {
  const ctx = window.__gmDetailFor;
  if (!ctx) return "";
  const [section, matchId] = ctx.split("|||");
  const ev = evenements.find(e => e[0] === matchId);
  if (!ev) return "";
  const [, , , , titre, lieu] = ev;
  const displayTitre = typeClass(ev[3]) === "match" ? formatMatchDisplay(titre, lieu).label : (titre || "Événement");

  const emptyRow = `<div class="cp-empty">Personne pour l'instant</div>`;
  const personRow = (nom, extra) => `<div class="cp-row"><span>${escapeHtml(nom)}</span>${extra ? `<span class="places">${escapeHtml(extra)}</span>` : ""}</div>`;

  let sectionLabel = "", bodyHtml = "";
  if (section === "covoiturage") {
    sectionLabel = "Covoiturage";
    const entries = covoiturage.filter(r => r[0] === matchId);
    const drivers = entries.filter(r => r[2] === "Oui");
    const needers = entries.filter(r => r[4] === "Oui");
    bodyHtml = `<div class="cp-col-h driver">🚗 Conducteurs (${drivers.length})</div>
      ${drivers.length === 0 ? emptyRow : drivers.map(r => personRow(r[1], (r[3] || "?") + " places")).join("")}
      <div class="cp-col-h need" style="margin-top:12px;">🙋 Cherchent une place (${needers.length})</div>
      ${needers.length === 0 ? emptyRow : needers.map(r => personRow(r[1])).join("")}`;
  } else if (section === "gouter") {
    sectionLabel = "Goûter";
    const entries = gouterSignupsFor(matchId);
    bodyHtml = `<div class="cp-col-h" style="color:#c98cf0;">🍪 Choses apportées (${entries.length})</div>
      ${entries.length === 0 ? emptyRow : entries.map(r => personRow(r[1], r[2])).join("")}`;
  } else if (section === "tablemarque") {
    sectionLabel = "Table de marque";
    const entries = tableMarque.filter(r => r[0] === matchId);
    bodyHtml = `<div class="cp-col-h driver">📋 Disponibles (${entries.length})</div>
      ${entries.length === 0 ? emptyRow : entries.map(r => personRow(r[1])).join("")}`;
  } else if (section === "maillots") {
    sectionLabel = "Maillots";
    const entries = maillots.filter(r => r[0] === matchId && r[2] === "Oui");
    bodyHtml = `<div class="cp-col-h" style="color:#E8B84B;">👕 Prennent les maillots (${entries.length})</div>
      ${entries.length === 0 ? emptyRow : entries.map(r => personRow(r[1])).join("")}`;
  } else {
    return "";
  }

  return `<div class="sheet-overlay open" data-close-sheet="gmDetailFor">
    <div class="sheet-scrim" data-close-sheet="gmDetailFor"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="gmDetailFor">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">${escapeHtml(sectionLabel)}</div>
        <h2>${escapeHtml(displayTitre)}</h2>
        <p>${formatEventDateFr(ev)}${lieu ? " · " + escapeHtml(lieu) : ""}</p>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

function renderCovoiturageSection(activeTeam) {
  const matches = gestionMatchsUpcoming(activeTeam, "away");
  if (matches.length === 0) return `<div class="card"><div class="muted">Aucun match à l'extérieur à venir pour cette équipe.</div></div>`;
  const identities = myCarpoolIdentitiesForTeam(activeTeam);
  let html = "";
  matches.forEach(ev => {
    const id = ev[0];
    const entries = covoiturage.filter(r => r[0] === id);
    const drivers = entries.filter(r => r[2] === "Oui");
    const needers = entries.filter(r => r[4] === "Oui");
    const totalPlaces = drivers.reduce((s, r) => s + (parseInt(r[3], 10) || 0), 0);
    html += `<div class="cp-match-card">` + matchCardHeader(ev, `
      <div class="cp-summary-badge"><div class="num" style="color:#33d17a;">${totalPlaces}</div><div class="lbl">Places</div></div>
      <div class="cp-summary-badge"><div class="num" style="color:#ffb43c;">${needers.length}</div><div class="lbl">Demandes</div></div>
    `, "covoiturage");

    if (identities.length === 0) {
      html += `<div class="muted" style="font-size:9.5px; margin-top:10px; text-align:center;">Seul ton parent peut modifier cette page pour toi.</div>`;
    } else {
      identities.forEach(idt => {
        const entry = covoitEntryFor(id, idt.nom);
        const jeConduit = entry ? entry[2] : "";
        const places = entry ? entry[3] : "3";
        const besoinPlace = entry ? entry[4] : "";
        html += `<div class="cp-edit-box">
          <div class="cp-edit-label">${idt.isChild ? `Pour ${escapeHtml(idt.nom)} <span class="cp-for-child">ton enfant</span>` : "Toi"}</div>
          <div class="cp-toggle-row">
            <button type="button" class="cp-toggle-btn ${jeConduit === "Oui" ? "active-yes" : ""}" data-cp-conduit="${escapeHtml(id)}|||${escapeHtml(idt.nom)}">Je conduis</button>
            <button type="button" class="cp-toggle-btn ${besoinPlace === "Oui" ? "active-need" : ""}" data-cp-besoin="${escapeHtml(id)}|||${escapeHtml(idt.nom)}">J'ai besoin d'une place</button>
          </div>
          ${jeConduit === "Oui" ? `<div class="cp-edit-label">Nombre de places disponibles</div>
          <select data-cp-places="${escapeHtml(id)}|||${escapeHtml(idt.nom)}">
            ${[1,2,3,4,5].map(n => `<option value="${n}" ${String(places) === String(n) ? "selected" : ""}>${n}</option>`).join("")}
          </select>` : ""}
        </div>`;
      });
    }
    html += `</div>`;
  });
  return html;
}

function renderGouterSection(activeTeam) {
  const matches = gestionMatchsUpcoming(activeTeam, "home");
  if (matches.length === 0) return `<div class="card"><div class="muted">Aucun match à domicile à venir pour cette équipe.</div></div>`;
  const identities = myCarpoolIdentitiesForTeam(activeTeam);
  const isAdmin = hasRole("Admin");
  let html = "";
  matches.forEach(ev => {
    const id = ev[0];
    const signups = gouterSignupsFor(id);
    const options = gouterOptionsFor(id);
    html += `<div class="cp-match-card">` + matchCardHeader(ev, `
      <div class="cp-summary-badge"><div class="num" style="color:#c98cf0;">${signups.length}</div><div class="lbl">Inscrits</div></div>
    `, "gouter");

    html += `<div class="cp-col-h" style="color:#c98cf0;">Qui amène quoi</div>`;
    if (signups.length === 0) {
      html += `<div class="cp-empty">Personne pour l'instant</div>`;
    } else {
      signups.forEach(s => { html += `<div class="cp-row"><span>${escapeHtml(s[1])}</span><span class="places">${escapeHtml(s[2])}</span></div>`; });
    }

    if (identities.length === 0) {
      html += `<div class="muted" style="font-size:9.5px; margin-top:10px; text-align:center;">Seul ton parent peut modifier cette page pour toi.</div>`;
    } else {
      identities.forEach(idt => {
        html += `<div class="cp-edit-box">
          <div class="cp-edit-label">${idt.isChild ? `Pour ${escapeHtml(idt.nom)} <span class="cp-for-child">ton enfant</span>` : "Toi"}</div>
          ${options.map(o => {
            const checked = gouterHasItem(id, idt.nom, o);
            return `<label style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:12.5px; color:#e8e8ee;">
              <input type="checkbox" data-gouter-item="${escapeHtml(id)}|||${escapeHtml(idt.nom)}|||${escapeHtml(o)}" ${checked ? "checked" : ""} style="width:17px; height:17px; flex-shrink:0;" />
              ${escapeHtml(o)}
            </label>`;
          }).join("")}
          ${options.length === 0 ? `<div class="muted" style="font-size:10.5px; margin-bottom:6px;">Aucun choix proposé pour l'instant — sois le premier à en ajouter un.</div>` : ""}
          <div class="carte-propose" style="margin-top:6px;"><input type="text" placeholder="Ajouter un nouveau choix..." id="gouter-propose-${id}-${idt.nom}" /><button type="button" class="btn secondary" style="width:auto; padding:8px 12px;" data-gouter-propose="${escapeHtml(id)}|||${escapeHtml(idt.nom)}">Ajouter</button></div>
          ${isAdmin && options.length > 0 ? `<div class="muted" style="font-size:9.5px; margin-top:6px;">Retirer un choix : ${options.map(o => `<span class="cp-for-child" style="cursor:pointer;" data-gouter-remove-option="${escapeHtml(id)}|||${escapeHtml(o)}">${escapeHtml(o)} ✕</span>`).join(" ")}</div>` : ""}
        </div>`;
      });
    }
    html += `</div>`;
  });
  return html;
}

function renderTableMarqueSection(activeTeam) {
  const matches = gestionMatchsUpcoming(activeTeam, "both");
  if (matches.length === 0) return `<div class="card"><div class="muted">Aucun match à venir pour cette équipe.</div></div>`;
  const identities = myCarpoolIdentitiesForTeam(activeTeam);
  let html = "";
  matches.forEach(ev => {
    const id = ev[0];
    const entries = tableMarque.filter(r => r[0] === id);
    html += `<div class="cp-match-card">` + matchCardHeader(ev, `
      <div class="cp-summary-badge"><div class="num" style="color:#33d17a;">${entries.length}</div><div class="lbl">Disponibles</div></div>
    `, "tablemarque");

    if (identities.length === 0) {
      html += `<div class="muted" style="font-size:9.5px; margin-top:10px; text-align:center;">Seul ton parent peut modifier cette page pour toi.</div>`;
    } else {
      identities.forEach(idt => {
        const entry = tableMarqueEntryFor(id, idt.nom);
        const dispo = entry ? entry[2] : "";
        html += `<div class="cp-edit-box">
          <div class="cp-edit-label">${idt.isChild ? `Pour ${escapeHtml(idt.nom)} <span class="cp-for-child">ton enfant</span>` : "Toi"}</div>
          <button type="button" class="cp-toggle-btn ${dispo === "Oui" ? "active-yes" : ""}" style="width:100%;" data-tm-dispo="${escapeHtml(id)}|||${escapeHtml(idt.nom)}">Je suis disponible</button>
        </div>`;
      });
    }
    html += `</div>`;
  });
  return html;
}

function renderMaillotsSection(activeTeam) {
  const matches = gestionMatchsUpcoming(activeTeam, "both");
  const identities = myCarpoolIdentitiesForTeam(activeTeam);

  const roster = activeTeam === "U17M1" ? compositionRoster() : rosterForEquipe(activeTeam);
  const counts = roster.map(nom => ({ nom, n: maillotsCountFor(nom) })).sort((a, b) => b.n - a.n);
  let html = `<div class="card">
    <div class="section-h" style="margin-top:0;">Compteur saison</div>
    ${counts.length === 0 ? `<div class="muted">Aucun joueur enregistré pour cette équipe.</div>` : counts.map(c => `<div class="cp-row"><span>${escapeHtml(c.nom)}</span><span class="places">${c.n} fois</span></div>`).join("")}
  </div>`;

  if (matches.length === 0) return html + `<div class="card"><div class="muted">Aucun match à venir pour cette équipe.</div></div>`;

  matches.forEach(ev => {
    const id = ev[0];
    const entries = maillots.filter(r => r[0] === id && r[2] === "Oui");
    html += `<div class="cp-match-card">` + matchCardHeader(ev, `
      <div class="cp-summary-badge"><div class="num" style="color:#E8B84B;">${entries.length}</div><div class="lbl">Pris</div></div>
    `, "maillots");

    if (identities.length === 0) {
      html += `<div class="muted" style="font-size:9.5px; margin-top:10px; text-align:center;">Seul ton parent peut modifier cette page pour toi.</div>`;
    } else {
      identities.forEach(idt => {
        const entry = maillotsEntryFor(id, idt.nom);
        const pris = entry ? entry[2] : "";
        html += `<div class="cp-edit-box">
          <div class="cp-edit-label">${idt.isChild ? `Pour ${escapeHtml(idt.nom)} <span class="cp-for-child">ton enfant</span>` : "Toi"}</div>
          <button type="button" class="cp-toggle-btn ${pris === "Oui" ? "active-yes" : ""}" style="width:100%;" data-maillots-pris="${escapeHtml(id)}|||${escapeHtml(idt.nom)}">Je prends les maillots</button>
        </div>`;
      });
    }
    html += `</div>`;
  });
  return html;
}

function renderGestionMatchsPage() {
  const teams = myCarpoolTeams();
  if (teams.length === 0) {
    return `<div class="page-title">Gestion des matchs</div><div class="card"><div class="muted">Aucune équipe concernée pour ce compte.</div></div>`;
  }
  const activeTeam = (window.__covoitTeamView && teams.includes(window.__covoitTeamView)) ? window.__covoitTeamView : teams[0];
  const sortedSections = gestionMatchsSectionsSorted(activeTeam);
  const section = sortedSections.some(s => s.id === window.__gestionMatchsSection) ? window.__gestionMatchsSection : (sortedSections[0] ? sortedSections[0].id : "covoiturage");
  const needsTeam = section !== "repas"; // le repas d'après-match ne concerne aucune équipe en particulier

  let html = `<div class="page-title">Gestion des matchs</div><div class="page-sub">Covoiturage, goûter, table de marque et maillots${needsTeam ? " — équipe " + escapeHtml(activeTeam) : ""}</div>`;
  if (needsTeam) html += renderTeamSwitcher(teams, activeTeam, "covoit-team");
  html += `<div class="gm-section-grid">
    ${sortedSections.map(s => `<button type="button" class="gm-section-chip ${section === s.id ? 'active' : ''}" data-gestion-matchs-section="${s.id}">${s.label}</button>`).join("")}
  </div>`;

  if (section === "covoiturage") html += renderCovoiturageSection(activeTeam);
  else if (section === "gouter") html += renderGouterSection(activeTeam);
  else if (section === "tablemarque") html += renderTableMarqueSection(activeTeam);
  else if (section === "maillots") html += renderMaillotsSection(activeTeam);
  else if (section === "repas" && canManageRepas()) html += renderRepasSection();

  if (window.__gmDetailFor) html += renderGestionMatchsDetailSheet();
  if (window.__repasDetailFor) html += renderRepasDetailSheet();

  return html;
}

// ===================== REPAS D'APRÈS-MATCH =====================
// Remplace le suivi des foodtrucks : un menu réutilisable d'un match à l'autre (RepasMenu), ce
// qui est prévu pour un match donné (RepasPrevu, coché/décoché par plat), et le suivi financier
// de l'organisation du match — pas un coût par plat, mais des dépenses/recettes globales pour
// l'événement (RepasFinances) — le rendement (recette - dépense) est calculé ici, pas stocké.

function repasHomeMatches() {
  const teams = myCarpoolTeams();
  return evenements.filter(ev => typeClass(ev[3]) === "match" && teams.includes(eventEquipe(ev)) && isHomeMatch(ev[5]))
    .sort((a, b) => eventDateObj(b) - eventDateObj(a));
}

function repasPrevuFor(eventId, menuId) {
  return repasPrevu.some(r => r[0] === eventId && r[1] === menuId);
}

function repasFinancesFor(eventId) {
  return repasFinances.filter(r => r[1] === eventId);
}

function repasRendementFor(eventId) {
  const entries = repasFinancesFor(eventId);
  const recette = entries.filter(r => r[2] === "recette").reduce((s, r) => s + (parseFloat(r[4]) || 0), 0);
  const depense = entries.filter(r => r[2] === "depense").reduce((s, r) => s + (parseFloat(r[4]) || 0), 0);
  return { recette, depense, rendement: recette - depense };
}

function renderRepasSection() {
  let html = `<div class="section-h" style="margin-top:0;">Menu (réutilisable)</div>`;
  html += `<div class="card">`;
  if (repasMenu.length === 0) {
    html += `<div class="muted">Aucun plat dans le menu pour le moment.</div>`;
  } else {
    repasMenu.forEach(m => {
      const [id, nom] = m;
      html += `<div class="paiement-row">
        <span style="color:#e8e8ee; font-weight:600;">${escapeHtml(nom)}</span>
        ${iconBtn(ICON_CROSS, "ev-del", `data-delete-repas-menu-item="${escapeHtml(id)}"`)}
      </div>`;
    });
  }
  html += `</div>`;
  html += `<button class="btn add-btn-primary" id="toggle-add-repas-menu-item">+ Ajouter un plat au menu</button>`;

  html += `<div class="section-h">Tarifs (réutilisable)</div>`;
  html += `<div class="card">`;
  if (repasTarifs.length === 0) {
    html += `<div class="muted">Aucun tarif enregistré pour le moment.</div>`;
  } else {
    repasTarifs.forEach(t => {
      const [id, label, prix] = t;
      html += `<div class="paiement-row">
        <span style="color:#e8e8ee; font-weight:600;">${escapeHtml(label)}</span>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="color:var(--accent2); font-weight:800;">${fmt(parseFloat(prix) || 0)} €</span>
          ${iconBtn(ICON_CROSS, "ev-del", `data-delete-repas-tarif="${escapeHtml(id)}"`)}
        </div>
      </div>`;
    });
  }
  html += `</div>`;
  html += `<button class="btn add-btn-primary" id="toggle-add-repas-tarif">+ Ajouter un tarif</button>`;

  html += `<div class="section-h">Matchs à domicile</div>`;
  const matches = repasHomeMatches();
  if (matches.length === 0) {
    html += `<div class="card muted">Aucun match à domicile enregistré pour l'instant.</div>`;
  } else {
    matches.forEach(ev => {
      const [id, , , , titre, lieu] = ev;
      const { rendement } = repasRendementFor(id);
      const prevuCount = repasMenu.filter(m => repasPrevuFor(id, m[0])).length;
      const rendementColor = rendement > 0 ? "#78c850" : (rendement < 0 ? "#ff5a5a" : "#8a92a8");
      html += `<div class="card cn-card">
        <div class="sheet-open-zone" data-open-repas-detail="${escapeHtml(id)}">
          <div class="cn-name-row">
            <span class="cn-name">${eventDateObj(ev).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} — ${escapeHtml(eventEquipe(ev))} — ${escapeHtml(formatMatchDisplay(titre, lieu).label || titre || "Match")}</span>
            <span class="cn-amount" style="color:${rendementColor};">${rendement > 0 ? "+" : ""}${fmt(rendement)} €</span>
          </div>
          <div class="cn-hero-sub" style="margin-bottom:0;">${prevuCount} plat${prevuCount > 1 ? "s" : ""} prévu${prevuCount > 1 ? "s" : ""}</div>
        </div>
      </div>`;
    });
  }

  html += renderRepasMenuAddSheet();
  html += renderRepasTarifAddSheet();

  return html;
}

function renderRepasMenuAddSheet() {
  if (!window.__showAddRepasMenuItem) return "";
  const bodyHtml = `
    <label class="field-label">Nom du plat</label>
    <input id="repas-menu-nom" type="text" placeholder="Ex: Merguez frites" />
    <button class="btn" id="repas-menu-add" style="margin-top:12px;">Ajouter au menu</button>`;

  return `<div class="sheet-overlay open" data-close-sheet="showAddRepasMenuItem">
    <div class="sheet-scrim" data-close-sheet="showAddRepasMenuItem"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="showAddRepasMenuItem">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Menu</div>
        <h2>Ajouter un plat</h2>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

function renderRepasTarifAddSheet() {
  if (!window.__showAddRepasTarif) return "";
  const bodyHtml = `
    <label class="field-label">Libellé</label>
    <input id="repas-tarif-label" type="text" placeholder="Ex: Repas adulte" />
    <label class="field-label">Prix (€)</label>
    <input id="repas-tarif-prix" type="number" step="0.5" placeholder="Ex: 8" />
    <button class="btn" id="repas-tarif-add" style="margin-top:12px;">Ajouter le tarif</button>`;

  return `<div class="sheet-overlay open" data-close-sheet="showAddRepasTarif">
    <div class="sheet-scrim" data-close-sheet="showAddRepasTarif"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="showAddRepasTarif">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Tarifs</div>
        <h2>Ajouter un tarif</h2>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

// ===================== FICHE MATCH (bottom sheet) — prévu + finances =====================
function renderRepasDetailSheet() {
  const eventId = window.__repasDetailFor;
  if (!eventId) return "";
  const ev = evenements.find(e => e[0] === eventId);
  if (!ev) return "";
  const [, , , , titre, lieu] = ev;
  const displayTitre = formatMatchDisplay(titre, lieu).label || titre || "Match";
  const entries = repasFinancesFor(eventId);
  const { recette, depense, rendement } = repasRendementFor(eventId);
  const rendementColor = rendement > 0 ? "#78c850" : (rendement < 0 ? "#ff5a5a" : "#fff");

  const menuHtml = repasMenu.length === 0
    ? `<div class="muted" style="font-size:12px;">Aucun plat dans le menu — ajoute-en depuis la liste principale.</div>`
    : repasMenu.map(m => {
        const [id, nom] = m;
        const prevu = repasPrevuFor(eventId, id);
        return `<button type="button" class="toggle-btn ${prevu ? "present" : ""}" style="width:100%; margin-bottom:6px; text-align:left; padding-left:12px;" data-toggle-repas-prevu="${escapeHtml(eventId)}|||${escapeHtml(id)}">${prevu ? "✓ " : ""}${escapeHtml(nom)}</button>`;
      }).join("");

  const financeRows = entries.length === 0
    ? `<div class="muted" style="font-size:12px;">Aucune dépense ni recette enregistrée.</div>`
    : entries.map(r => {
        const [id, , type, label, montant] = r;
        const isRecette = type === "recette";
        return `<div class="paiement-row">
          <div>
            <span style="color:#e8e8ee; font-weight:600;">${escapeHtml(label || (isRecette ? "Recette" : "Dépense"))}</span>
            <span class="badge" style="margin-left:6px; ${isRecette ? "color:#78c850; border-color:rgba(120,200,80,0.35);" : "color:#ff5a5a; border-color:rgba(255,90,90,0.35);"}">${isRecette ? "Recette" : "Dépense"}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:${isRecette ? "#78c850" : "#ff5a5a"}; font-weight:800;">${isRecette ? "+" : "−"}${fmt(Math.abs(parseFloat(montant) || 0))} €</span>
            ${iconBtn(ICON_CROSS, "ev-del", `data-delete-repas-finance="${escapeHtml(id)}"`)}
          </div>
        </div>`;
      }).join("");

  const bodyHtml = `
    <div class="pay-summary" style="margin-top:0;">
      <div class="pay-summary-label">Rendement</div>
      <div class="pay-summary-val" style="color:${rendementColor};">${rendement > 0 ? "+" : ""}${fmt(rendement)} €</div>
      <div class="pay-summary-sub">${fmt(recette)} € de recette · ${fmt(depense)} € de dépense</div>
    </div>

    <div class="section-h">Ce qui est prévu</div>
    ${menuHtml}
    <button type="button" class="btn secondary" style="margin-top:4px;" data-publish-repas-actu="${escapeHtml(eventId)}">📣 Publier une actualité (+ mail à tous)</button>

    <div class="section-h">Finances</div>
    ${financeRows}

    <div class="add-form" style="margin-top:10px;">
      ${repasTarifs.length > 0 ? `
      <label class="field-label">Depuis un tarif (optionnel — pré-remplit description et montant)</label>
      <select id="repas-finance-tarif">
        <option value="">— Libre —</option>
        ${repasTarifs.map(t => `<option value="${escapeHtml(t[0])}" data-prix="${parseFloat(t[2]) || 0}" data-label="${escapeHtml(t[1])}">${escapeHtml(t[1])} (${fmt(parseFloat(t[2]) || 0)} €)</option>`).join("")}
      </select>
      <label class="field-label">Quantité</label>
      <input id="repas-finance-qty" type="number" min="1" value="1" />
      ` : ""}
      <label class="field-label">Type</label>
      <select id="repas-finance-type">
        <option value="depense">Dépense</option>
        <option value="recette">Recette</option>
      </select>
      <label class="field-label">Description</label>
      <input id="repas-finance-label" type="text" placeholder="Ex: Achat merguez / Vente repas" />
      <label class="field-label">Montant (€)</label>
      <input id="repas-finance-montant" type="number" step="0.5" placeholder="Ex: 45" />
      <button class="btn" id="repas-finance-add" style="margin-top:8px;" data-repas-finance-event="${escapeHtml(eventId)}">Ajouter</button>
    </div>`;

  return `<div class="sheet-overlay open" data-close-sheet="repasDetailFor">
    <div class="sheet-scrim" data-close-sheet="repasDetailFor"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="repasDetailFor">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Repas d'après-match</div>
        <h2>${escapeHtml(displayTitre)}</h2>
        <p>${formatEventDateFr(ev)}${lieu ? " · " + escapeHtml(lieu) : ""}</p>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

// ===================== ACTIONS API : REPAS D'APRÈS-MATCH =====================

async function addRepasMenuItemApi(nom) {
  const tempId = "temp_" + Date.now();
  repasMenu.push([tempId, nom]);
  window.__showAddRepasMenuItem = false;
  render();
  try {
    const params = new URLSearchParams({ action: "addRepasMenuItem", nom, authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.ok) { await fetchAll(); }
    else { repasMenu = repasMenu.filter(r => r[0] !== tempId); showToast("Échec de l'ajout", "error"); render(); }
  } catch (err) {
    isOnline = false;
    repasMenu = repasMenu.filter(r => r[0] !== tempId);
    showToast("Échec de l'ajout", "error");
    render();
  }
}

async function deleteRepasMenuItemApi(id) {
  repasMenu = repasMenu.filter(r => r[0] !== id); // optimiste
  render();
  try {
    const params = new URLSearchParams({ action: "deleteRepasMenuItem", id, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function addRepasTarifApi(label, prix) {
  const tempId = "temp_" + Date.now();
  repasTarifs.push([tempId, label, prix]);
  window.__showAddRepasTarif = false;
  render();
  try {
    const params = new URLSearchParams({ action: "addRepasTarif", label, prix, authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.ok) { await fetchAll(); }
    else { repasTarifs = repasTarifs.filter(r => r[0] !== tempId); showToast("Échec de l'ajout", "error"); render(); }
  } catch (err) {
    isOnline = false;
    repasTarifs = repasTarifs.filter(r => r[0] !== tempId);
    showToast("Échec de l'ajout", "error");
    render();
  }
}

async function deleteRepasTarifApi(id) {
  repasTarifs = repasTarifs.filter(r => r[0] !== id); // optimiste
  render();
  try {
    const params = new URLSearchParams({ action: "deleteRepasTarif", id, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function setRepasPrevuApi(eventId, menuId, prevu) {
  if (prevu) repasPrevu.push([eventId, menuId]);
  else repasPrevu = repasPrevu.filter(r => !(r[0] === eventId && r[1] === menuId));
  render();
  try {
    const params = new URLSearchParams({ action: "setRepasPrevu", eventId, menuId, prevu: prevu ? "1" : "0", authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    isOnline = true;
  } catch (err) { isOnline = false; }
  render();
}

async function addRepasFinanceApi(eventId, type, label, montant) {
  const tempId = "temp_" + Date.now();
  repasFinances.push([tempId, eventId, type, label, montant]);
  render();
  try {
    const params = new URLSearchParams({ action: "addRepasFinance", eventId, type, label, montant, authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.ok) { await fetchAll(); }
    else { repasFinances = repasFinances.filter(r => r[0] !== tempId); showToast("Échec de l'ajout", "error"); render(); }
  } catch (err) {
    isOnline = false;
    repasFinances = repasFinances.filter(r => r[0] !== tempId);
    showToast("Échec de l'ajout", "error");
    render();
  }
}

async function deleteRepasFinanceApi(id) {
  repasFinances = repasFinances.filter(r => r[0] !== id); // optimiste
  render();
  try {
    const params = new URLSearchParams({ action: "deleteRepasFinance", id, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function publishRepasActualiteApi(eventId, titre, texte) {
  try {
    const params = new URLSearchParams({ action: "publishRepasActualite", eventId, titre, texte, authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      showToast(`Actualité publiée, mail envoyé à ${data.sent} personne${data.sent > 1 ? "s" : ""}`, "success");
      await fetchAll();
    } else {
      showToast("Échec de la publication", "error");
    }
  } catch (err) {
    isOnline = false;
    showToast("Échec de la publication", "error");
  }
}

// Historique du covoiturage (matchs passés) pour une personne donnée — utilisé notamment sur
// le Profil des parents, pour voir ce qui a été renseigné pour leur enfant au fil de la saison.
function renderCovoiturageHistoryCard(nom) {
  const now = new Date();
  const entries = covoiturage.filter(r => r[1] === nom).map(r => {
    const ev = evenements.find(e => e[0] === r[0]);
    return ev ? { ev, jeConduit: r[2], besoinPlace: r[4] } : null;
  }).filter(Boolean).filter(x => eventDateObj(x.ev) < now).sort((a, b) => eventDateObj(b.ev) - eventDateObj(a.ev));

  let html = `<div class="card"><div class="section-h" style="margin-top:0;">Historique covoiturage</div>`;
  if (entries.length === 0) {
    html += `<div class="muted">Aucun historique pour le moment.</div>`;
  } else {
    entries.slice(0, 8).forEach(({ ev, jeConduit, besoinPlace }) => {
      const d = eventDateObj(ev);
      const dateLabel = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }).replace(".", "").toUpperCase();
      const statut = jeConduit === "Oui" ? "🚗 A conduit" : (besoinPlace === "Oui" ? "🙋 A eu besoin d'une place" : "—");
      html += `<div class="paiement-row"><div>${dateLabel} — ${escapeHtml(ev[4] || "Match")}</div><div class="muted" style="font-size:11px;">${statut}</div></div>`;
    });
  }
  html += `</div>`;
  return html;
}

function attachGestionMatchsEvents() {
  document.querySelectorAll("[data-open-gm-detail]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__gmDetailFor = el.dataset.openGmDetail;
      render();
    };
  });

  document.querySelectorAll("[data-gestion-matchs-section]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const id = el.dataset.gestionMatchsSection;
      window.__gestionMatchsSection = id;
      bumpGestionMatchsUsage(id);
      render();
    };
  });

  document.querySelectorAll("[data-covoit-team]").forEach(el => {
    el.onclick = () => { vibrate(); window.__covoitTeamView = el.dataset.covoitTeam; render(); };
  });

  document.querySelectorAll("[data-cp-conduit]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const [eventId, nom] = el.dataset.cpConduit.split("|||");
      const entry = covoitEntryFor(eventId, nom);
      const newVal = (entry && entry[2] === "Oui") ? "" : "Oui";
      const places = (entry && entry[3]) || "3";
      const besoin = newVal === "Oui" ? "" : (entry ? entry[4] : "");
      setCovoiturageApi(nom, eventId, newVal, places, besoin);
    };
  });

  document.querySelectorAll("[data-cp-besoin]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const [eventId, nom] = el.dataset.cpBesoin.split("|||");
      const entry = covoitEntryFor(eventId, nom);
      const newVal = (entry && entry[4] === "Oui") ? "" : "Oui";
      const jeConduit = newVal === "Oui" ? "" : (entry ? entry[2] : "");
      const places = (entry && entry[3]) || "";
      setCovoiturageApi(nom, eventId, jeConduit, places, newVal);
    };
  });

  document.querySelectorAll("[data-cp-places]").forEach(el => {
    el.onchange = () => {
      const [eventId, nom] = el.dataset.cpPlaces.split("|||");
      const entry = covoitEntryFor(eventId, nom);
      setCovoiturageApi(nom, eventId, "Oui", el.value, entry ? entry[4] : "");
    };
  });

  document.querySelectorAll("[data-gouter-item]").forEach(el => {
    el.onchange = () => {
      vibrate();
      const [eventId, nom, item] = el.dataset.gouterItem.split("|||");
      setGouterItemApi(nom, eventId, item, el.checked);
    };
  });

  document.querySelectorAll("[data-gouter-propose]").forEach(el => {
    el.onclick = () => {
      const [eventId, nom] = el.dataset.gouterPropose.split("|||");
      const input = document.getElementById(`gouter-propose-${eventId}-${nom}`);
      const val = input ? input.value.trim() : "";
      if (val) {
        addGouterOptionApi(eventId, val).then(() => setGouterItemApi(nom, eventId, val, true));
      }
    };
  });

  document.querySelectorAll("[data-gouter-remove-option]").forEach(el => {
    el.onclick = () => {
      const [eventId, option] = el.dataset.gouterRemoveOption.split("|||");
      removeGouterOptionApi(eventId, option);
    };
  });

  document.querySelectorAll("[data-tm-dispo]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const [eventId, nom] = el.dataset.tmDispo.split("|||");
      const entry = tableMarqueEntryFor(eventId, nom);
      const newVal = (entry && entry[2] === "Oui") ? "" : "Oui";
      setTableMarqueApi(nom, eventId, newVal);
    };
  });

  document.querySelectorAll("[data-maillots-pris]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const [eventId, nom] = el.dataset.maillotsPris.split("|||");
      const entry = maillotsEntryFor(eventId, nom);
      const newVal = (entry && entry[2] === "Oui") ? "" : "Oui";
      setMaillotsApi(nom, eventId, newVal);
    };
  });

  const toggleAddRepasMenuItem = document.getElementById("toggle-add-repas-menu-item");
  if (toggleAddRepasMenuItem) toggleAddRepasMenuItem.onclick = () => {
    vibrate();
    window.__showAddRepasMenuItem = true;
    render();
  };

  const repasMenuAdd = document.getElementById("repas-menu-add");
  if (repasMenuAdd) repasMenuAdd.onclick = () => {
    const nom = document.getElementById("repas-menu-nom").value.trim();
    if (!nom) return;
    addRepasMenuItemApi(nom);
  };

  document.querySelectorAll("[data-delete-repas-menu-item]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.deleteRepasMenuItem;
      if (confirm("Retirer ce plat du menu ?")) deleteRepasMenuItemApi(id);
    };
  });

  const toggleAddRepasTarif = document.getElementById("toggle-add-repas-tarif");
  if (toggleAddRepasTarif) toggleAddRepasTarif.onclick = () => {
    vibrate();
    window.__showAddRepasTarif = true;
    render();
  };

  const repasTarifAdd = document.getElementById("repas-tarif-add");
  if (repasTarifAdd) repasTarifAdd.onclick = () => {
    const label = document.getElementById("repas-tarif-label").value.trim();
    const prix = parseFloat(document.getElementById("repas-tarif-prix").value) || 0;
    if (!label || !prix) return;
    addRepasTarifApi(label, prix);
  };

  document.querySelectorAll("[data-delete-repas-tarif]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.deleteRepasTarif;
      if (confirm("Supprimer ce tarif ?")) deleteRepasTarifApi(id);
    };
  });

  document.querySelectorAll("[data-open-repas-detail]").forEach(el => {
    el.onclick = () => { vibrate(); window.__repasDetailFor = el.dataset.openRepasDetail; render(); };
  });

  document.querySelectorAll("[data-toggle-repas-prevu]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const [eventId, menuId] = el.dataset.toggleRepasPrevu.split("|||");
      setRepasPrevuApi(eventId, menuId, !repasPrevuFor(eventId, menuId));
    };
  });

  // Aide à la saisie d'une recette : choisir un tarif + une quantité pré-remplit la description
  // et le montant (prix × quantité), sans passer par render() — juste un raccourci de saisie,
  // les deux champs restent modifiables avant validation.
  const repasFinanceTarifSelect = document.getElementById("repas-finance-tarif");
  const repasFinanceQtyInput = document.getElementById("repas-finance-qty");
  const fillRepasFinanceFromTarif = () => {
    if (!repasFinanceTarifSelect || !repasFinanceTarifSelect.value) return;
    const opt = repasFinanceTarifSelect.options[repasFinanceTarifSelect.selectedIndex];
    const prix = parseFloat(opt.dataset.prix) || 0;
    const qty = parseInt(repasFinanceQtyInput.value, 10) || 1;
    document.getElementById("repas-finance-label").value = `${qty} × ${opt.dataset.label}`;
    document.getElementById("repas-finance-montant").value = (prix * qty).toFixed(2);
    document.getElementById("repas-finance-type").value = "recette";
  };
  if (repasFinanceTarifSelect) repasFinanceTarifSelect.onchange = fillRepasFinanceFromTarif;
  if (repasFinanceQtyInput) repasFinanceQtyInput.onchange = fillRepasFinanceFromTarif;

  const repasFinanceAdd = document.getElementById("repas-finance-add");
  if (repasFinanceAdd) repasFinanceAdd.onclick = () => {
    const eventId = repasFinanceAdd.dataset.repasFinanceEvent;
    const type = document.getElementById("repas-finance-type").value;
    const label = document.getElementById("repas-finance-label").value.trim();
    const montant = parseFloat(document.getElementById("repas-finance-montant").value) || 0;
    if (!label || !montant) return;
    addRepasFinanceApi(eventId, type, label, montant);
  };

  document.querySelectorAll("[data-delete-repas-finance]").forEach(el => {
    el.onclick = () => { deleteRepasFinanceApi(el.dataset.deleteRepasFinance); };
  });

  document.querySelectorAll("[data-publish-repas-actu]").forEach(el => {
    el.onclick = () => {
      const eventId = el.dataset.publishRepasActu;
      const ev = evenements.find(e => e[0] === eventId);
      const displayTitre = ev ? (formatMatchDisplay(ev[4], ev[5]).label || ev[4] || "Match") : "Match";
      const dateLabel = ev ? formatEventDateFr(ev) : "";
      const prevuNames = repasMenu.filter(m => repasPrevuFor(eventId, m[0])).map(m => m[1]);
      const titre = "Repas d'après-match — " + displayTitre;
      const texte = prevuNames.length > 0
        ? `Au menu pour le repas après ${displayTitre}${dateLabel ? " (" + dateLabel + ")" : ""} : ${prevuNames.join(", ")}. À vos fourchettes !`
        : `Un repas est prévu après ${displayTitre}${dateLabel ? " (" + dateLabel + ")" : ""}. Plus de détails à venir !`;
      if (confirm(`Publier cette actualité et envoyer un mail à tous les comptes ?\n\n"${titre}"\n${texte}`)) {
        publishRepasActualiteApi(eventId, titre, texte);
      }
    };
  });
}
