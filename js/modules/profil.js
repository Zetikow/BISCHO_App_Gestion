// ===================================================================
// PROFIL — photo, rôles, poste(s), adresse mail de relance, et vue
// Coach (mes joueurs, moyennes de présence de l'équipe).
// ===================================================================

const POSTES = ["ALD", "ARD", "DC", "ARG", "ALG", "PV", "GB", "COACH"];

function currentPostes() {
  const row = findCompteRow(session.nom);
  return row && row[3] ? String(row[3]).split(",").map(s => s.trim()).filter(Boolean) : [];
}

function renderPosteCard(postes, unwrapped) {
  const editingIndex = window.__profilPosteEditIndex;
  const remaining = POSTES.filter(p => !postes.includes(p));
  const showAddRow = postes.length === 0 || (!!window.__profilPosteAdding && remaining.length > 0);

  let html = `<div class="section-h">Poste</div>`;

  postes.forEach((p, i) => {
    if (editingIndex === i) {
      html += `<div class="poste-locked-row">
        <select id="profil-poste-edit-${i}" class="poste-select">${POSTES.map(o => `<option value="${o}" ${o === p ? "selected" : ""}>${o}</option>`).join("")}</select>
        <button class="btn secondary poste-inline-btn" data-poste-save-index="${i}">Valider</button>
      </div>`;
    } else {
      html += `<div class="poste-locked-row">
        <span class="badge poste-badge">${p}</span>
        <div class="poste-actions">
          <button class="poste-icon-btn" data-poste-edit-index="${i}" title="Modifier">✏️</button>
          <button class="poste-icon-btn" data-poste-remove-index="${i}" title="Supprimer">🗑️</button>
        </div>
      </div>`;
    }
  });

  if (showAddRow) {
    html += `<div class="poste-locked-row">
      <select id="profil-poste-new" class="poste-select">
        <option value="">— Choisir —</option>
        ${remaining.map(p => `<option value="${p}">${p}</option>`).join("")}
      </select>
      <button class="btn secondary poste-inline-btn" id="profil-poste-add-submit">Ajouter</button>
    </div>`;
  } else if (remaining.length > 0) {
    html += `<button class="add-toggle" id="profil-poste-add-toggle" style="margin-top:4px;">+ Ajouter un poste</button>`;
  }

  if (unwrapped) return html;
  return `<div class="card">${html}</div>`;
}

function renderStatsRecapCard(postes) {
  const isGardien = postes.includes("GB");
  return `<div class="card">
    <div class="section-h">Tes statistiques de match</div>
    <div class="grid2">
      <div class="stat">
        <div class="stat-label">${isGardien ? "Arrêts (saison)" : "Buts (saison)"}</div>
        <div class="stat-value">—</div>
        <div class="stat-sub">Bientôt disponible</div>
      </div>
      <div class="stat">
        <div class="stat-label">Passes (saison)</div>
        <div class="stat-value">—</div>
        <div class="stat-sub">Bientôt disponible</div>
      </div>
    </div>
    <div class="profil-photo-note">Ces chiffres arriveront avec la page Statistiques (vidéos de match, stats techniques).</div>
  </div>`;
}

function renderEmailCard(myRow) {
  const email = myRow ? (myRow[6] || "") : "";
  const editing = !!window.__profilEmailEditing;
  if (!email || editing) {
    return `<div class="card">
      <div class="section-h">Adresse mail de relance</div>
      <div class="muted" style="font-size:10.5px; margin-bottom:8px; line-height:1.5;">Utilisée pour les rappels par mail (présence à remplir, échéances...) — à définir une fois pour toutes.</div>
      <input id="profil-email-input" type="email" placeholder="ton.email@exemple.com" value="${escapeHtml(email)}" />
      <div class="row-flex" style="margin-top:8px;">
        <button class="btn" style="flex:1;" id="submit-profil-email">Enregistrer</button>
        ${editing ? `<button class="btn secondary" style="flex:1;" id="cancel-profil-email">Annuler</button>` : ""}
      </div>
    </div>`;
  }
  return `<div class="card">
    <div class="section-h">Adresse mail de relance</div>
    <div style="display:flex; align-items:center; gap:8px;">
      <div style="flex:1; font-size:12.5px; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(email)}</div>
      <button class="justif-edit-btn" id="edit-profil-email">Modifier</button>
      <button class="justif-edit-btn" id="delete-profil-email">Supprimer</button>
    </div>
  </div>`;
}

// Carte "Mes matchs en X" (brûlage perso) — voir renderProfilPage.
function renderMesMatchsCard(equipe, brule, bruleMax) {
  const remaining = Math.max(0, bruleMax - brule);
  const bruleColor = brule >= bruleMax ? "#ff5a5a" : (brule >= bruleMax - 2 ? "#ffb43c" : "#33d17a");
  return `<div class="card">
    <div class="section-h" style="margin-top:0;">Mes matchs en ${escapeHtml(teamDisplayLabel(equipe))}</div>
    <div style="display:flex; gap:16px;">
      <div><div class="big-number" style="color:${bruleColor};">${brule}</div><div class="muted" style="font-size:10.5px;">matchs joués en ${escapeHtml(teamDisplayLabel(equipe))}</div></div>
      <div><div class="big-number">${remaining}</div><div class="muted" style="font-size:10.5px;">avant d'être brûlé (max ${bruleMax})</div></div>
    </div>
  </div>`;
}

function renderProfilPage() {
  const myRow = findCompteRow(session.nom);
  const postes = currentPostes();
  const nomComplet = myRow ? (myRow[4] || "") : "";
  const photoUrl = myRow ? (myRow[5] || "") : "";
  const canEditPoste = hasRole("Joueur") || hasRole("Coach") || hasRole("Admin");

  const canViewJoueur = hasRole("Joueur");
  const canViewCoach = hasRole("Coach");
  const showVueToggle = canViewJoueur && canViewCoach;
  const defaultVue = hasRole("Coach") ? "coach" : "joueur";
  const vue = showVueToggle
    ? ((window.__profilVue === "coach" || window.__profilVue === "joueur") ? window.__profilVue : defaultVue)
    : (canViewCoach && !canViewJoueur ? "coach" : "joueur");

  let html = `<div class="page-title">Mon profil joueur</div>`;
  html += `<div class="page-sub">${nomComplet ? escapeHtml(nomComplet) : session.nom}</div>`;

  // Photo
  html += `<div class="card"><div class="profil-photo-zone">
    <div class="profil-photo-frame">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Photo de ${escapeHtml(session.nom)}"/>` : getInitials(session.nom)}</div>
    ${!photoUrl ? `<div class="profil-photo-note">Photo officielle à venir — ajoutée par l'Admin</div>` : ""}
  </div></div>`;


  // Mes matchs + brûlage — carte perso par équipe, affichée seulement si pertinente pour CE
  // compte : Joueur inscrit dans cette équipe précise, ou déjà brûlé au moins un match dedans
  // (cas d'un joueur SM2 appelé en SM1, par ex.) — pas juste "a le rôle Joueur quelque part"
  // (un Coach U17M1 qui joue en SM1 n'a pas besoin de voir sa carte U17M1).
  const mesJoueurTeams = equipesForRole("Joueur");
  const myBruleSM1 = bruleMatchesForSM1(session.nom);
  const myBruleU17M1 = bruleMatchesForU17M1(session.nom);
  let mesMatchsHtml = "";
  if (mesJoueurTeams.includes("SM1") || myBruleSM1 > 0) {
    mesMatchsHtml += renderMesMatchsCard("SM1", myBruleSM1, BRULAGE_MAX_MATCHES_SM1);
  }
  if (mesJoueurTeams.includes("U17M1") || myBruleU17M1 > 0) {
    mesMatchsHtml += renderMesMatchsCard("U17M1", myBruleU17M1, BRULAGE_MAX_MATCHES_U17M1);
  }

  // Rôle dans le club (réduite) + mes matchs empilés dans la colonne de gauche, Poste à droite —
  // les deux colonnes font à peu près la même hauteur au lieu d'un grand vide sous "Rôle".
  html += `<div style="display:flex; gap:10px; align-items:flex-start;">
    <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:10px;">
      <div class="card" style="padding:8px;">
        <div class="section-h" style="margin:0 0 5px; font-size:10.5px;">Rôle dans le club</div>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${(session.roles || []).map(r => {
            const showTeam = r.role === "Joueur" || r.role === "Coach";
            return `<span class="badge">${r.role}${showTeam ? " " + teamDisplayLabel(r.equipe || "SM1") : ""}</span>`;
          }).join("")}
        </div>
      </div>
      ${mesMatchsHtml}
    </div>
    ${canEditPoste ? `<div class="card" style="flex:1; min-width:0;">${renderPosteCard(postes, true)}</div>` : ""}
  </div>`;

  html += EMAIL_REMINDER_UI_VISIBLE ? renderEmailCard(myRow) : "";

  if (showVueToggle) {
    html += `<div class="mode-tabs">
      <button type="button" class="mode-tab-btn ${vue === 'joueur' ? 'active' : ''}" data-profil-vue="joueur">Vue Joueur</button>
      <button type="button" class="mode-tab-btn ${vue === 'coach' ? 'active' : ''}" data-profil-vue="coach">Vue Coach</button>
    </div>`;
  }

  if (vue === "coach") {
    const coachTeams = equipesForRole("Coach");
    const preferredCoachTeam = coachTeams[0] || primaryEquipe();
    const defaultCoachTeam = coachTeams.includes(preferredCoachTeam) ? preferredCoachTeam : (coachTeams[0] || "SM1");
    const chosenCoachTeam = (window.__profilCoachTeamView && coachTeams.includes(window.__profilCoachTeamView)) ? window.__profilCoachTeamView : defaultCoachTeam;

    if (coachTeams.length > 1) {
      html += renderTeamSwitcher(coachTeams, chosenCoachTeam, "profil-coach-team");
    }

    html += renderPtypeCard("Ta présence par type", computePresenceByType(session.nom, chosenCoachTeam));
    html += renderAverageCard(chosenCoachTeam, false);
    html += renderAverageCard(chosenCoachTeam, true);

    const mesJoueurs = comptes.slice(1).filter(c => rowHasRole(c, "Joueur") && rowEquipesForRole(c, "Joueur").indexOf(chosenCoachTeam) !== -1);
    const showAll = !!window.__profilJoueursExpanded;
    const visible = showAll ? mesJoueurs : mesJoueurs.slice(0, 4);
    const bruleFor = chosenCoachTeam === "SM1" ? bruleMatchesForSM1 : (chosenCoachTeam === "U17M1" ? bruleMatchesForU17M1 : null);
    const bruleMax = chosenCoachTeam === "SM1" ? BRULAGE_MAX_MATCHES_SM1 : (chosenCoachTeam === "U17M1" ? BRULAGE_MAX_MATCHES_U17M1 : 0);
    html += `<div class="card">
      <div class="section-h">Mes joueurs (${mesJoueurs.length})</div>
      ${mesJoueurs.length === 0 ? `<div class="muted">Aucun joueur trouvé pour cette équipe.</div>` : visible.map(j => {
        const brule = bruleFor ? bruleFor(j[0]) : null;
        const bruleColor = brule === null ? "" : (brule >= bruleMax ? "#ff5a5a" : (brule >= bruleMax - 2 ? "#ffb43c" : "#33d17a"));
        return `
        <div class="mesjoueurs-row">
          <div class="cn-avatar" style="width:32px; height:32px; font-size:11px;">${getInitials(j[0])}</div>
          <div class="mesjoueurs-name">${j[0]}</div>
          ${brule !== null ? `<span class="badge" style="color:${bruleColor}; border-color:${bruleColor};">${brule}/${bruleMax} en ${teamDisplayLabel(chosenCoachTeam)}</span>` : ""}
          ${j[3] ? `<span class="badge">${String(j[3]).split(",")[0]}</span>` : ""}
        </div>`;
      }).join("")}
      ${mesJoueurs.length > 4 ? `<div class="expand-toggle" data-toggle-profil-joueurs="1">${showAll ? "Réduire ▲" : "Voir les autres ▾"}</div>` : ""}
    </div>`;
  } else {
    const isJoueur = hasRole("Joueur");
    let presenceNom = session.nom, presenceEquipe = equipesForRole("Joueur")[0] || primaryEquipe();
    let presenceLabel = "Présence par type";
    const parentRole = !isJoueur ? (session.roles || []).find(r => r.role === "Parent") : null;
    if (parentRole) {
      presenceNom = parentRole.equipe; // le rôle Parent stocke le nom de l'enfant dans "equipe"
      const childRow = findCompteRow(presenceNom);
      presenceEquipe = childRow ? (rowEquipesForRole(childRow, "Joueur")[0] || presenceEquipe) : presenceEquipe;
      presenceLabel = `Présence de ${presenceNom}`;
    }
    html += renderPtypeCard(presenceLabel, computePresenceByType(presenceNom, presenceEquipe));
    if (isJoueur) html += renderStatsRecapCard(postes);
    if (parentRole) html += renderCovoiturageHistoryCard(presenceNom);
  }

  return html;
}

// ===================== ACTIONS API =====================

async function setPosteApi(nom, poste) {
  const row = findCompteRow(nom);
  if (row) row[3] = poste; // mise à jour optimiste locale
  render();
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=setPoste&nom=${encodeURIComponent(nom)}&poste=${encodeURIComponent(poste)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    isOnline = true;
  } catch (err) { isOnline = false; render(); }
}

async function setEmailApi(nom, email) {
  const row = findCompteRow(nom);
  if (row) row[6] = email; // mise à jour optimiste locale
  window.__profilEmailEditing = false;
  render();
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=setEmail&nom=${encodeURIComponent(nom)}&email=${encodeURIComponent(email)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    isOnline = true;
  } catch (err) { isOnline = false; render(); }
}

function attachProfilEvents() {
  document.querySelectorAll("[data-poste-edit-index]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__profilPosteEditIndex = parseInt(el.dataset.posteEditIndex, 10);
      render();
    };
  });

  document.querySelectorAll("[data-poste-save-index]").forEach(el => {
    el.onclick = () => {
      const i = parseInt(el.dataset.posteSaveIndex, 10);
      const newVal = document.getElementById(`profil-poste-edit-${i}`).value;
      const postes = currentPostes();
      if (newVal) postes[i] = newVal;
      window.__profilPosteEditIndex = null;
      setPosteApi(session.nom, postes.join(","));
    };
  });

  document.querySelectorAll("[data-poste-remove-index]").forEach(el => {
    el.onclick = () => {
      if (!confirm("Supprimer ce poste ?")) return;
      const i = parseInt(el.dataset.posteRemoveIndex, 10);
      const postes = currentPostes();
      postes.splice(i, 1);
      setPosteApi(session.nom, postes.join(","));
    };
  });

  const posteAddToggle = document.getElementById("profil-poste-add-toggle");
  if (posteAddToggle) posteAddToggle.onclick = () => { window.__profilPosteAdding = true; render(); };

  const posteAddSubmit = document.getElementById("profil-poste-add-submit");
  if (posteAddSubmit) posteAddSubmit.onclick = () => {
    const newVal = document.getElementById("profil-poste-new").value;
    window.__profilPosteAdding = false;
    if (!newVal) { render(); return; }
    const postes = currentPostes();
    postes.push(newVal);
    setPosteApi(session.nom, postes.join(","));
  };

  document.querySelectorAll("[data-goto-profil-email]").forEach(el => {
    el.onclick = () => { vibrate(); currentPage = "profil"; render(); };
  });

  const submitProfilEmail = document.getElementById("submit-profil-email");
  if (submitProfilEmail) submitProfilEmail.onclick = () => {
    const val = (document.getElementById("profil-email-input").value || "").trim();
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { alert("Merci de renseigner une adresse mail valide."); return; }
    setEmailApi(session.nom, val);
  };

  const editProfilEmail = document.getElementById("edit-profil-email");
  if (editProfilEmail) editProfilEmail.onclick = () => { window.__profilEmailEditing = true; render(); };

  const cancelProfilEmail = document.getElementById("cancel-profil-email");
  if (cancelProfilEmail) cancelProfilEmail.onclick = () => { window.__profilEmailEditing = false; render(); };

  const deleteProfilEmail = document.getElementById("delete-profil-email");
  if (deleteProfilEmail) deleteProfilEmail.onclick = () => {
    if (!confirm("Supprimer ton adresse mail de relance ?")) return;
    setEmailApi(session.nom, "");
  };

  document.querySelectorAll("[data-profil-vue]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__profilVue = el.dataset.profilVue;
      render();
    };
  });

  document.querySelectorAll("[data-profil-coach-team]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__profilCoachTeamView = el.dataset.profilCoachTeam;
      window.__seasonAvgExpanded = false;
      window.__monthAvgExpanded = false;
      render();
    };
  });

  const toggleProfilJoueurs = document.querySelector("[data-toggle-profil-joueurs]");
  if (toggleProfilJoueurs) toggleProfilJoueurs.onclick = () => {
    window.__profilJoueursExpanded = !window.__profilJoueursExpanded;
    render();
  };
}
