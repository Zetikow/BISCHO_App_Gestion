// ===================================================================
// RENDU PRINCIPAL — écran de connexion, en-tête, navigation, tableau
// de bord d'accueil, et le flux d'authentification (login/changement
// de code). Dispatch vers renderXxxPage() de chaque module selon
// currentPage.
// ===================================================================

function renderTeamSwitcher(teams, active, dataAttr) {
  if (teams.length <= 1) return "";
  return `<div class="team-switch-row">
    ${teams.map(t => `<button type="button" class="team-switch-btn ${t === active ? 'active' : ''}" data-${dataAttr}="${t}">${teamDisplayLabel(t)}</button>`).join("")}
  </div>`;
}

// ---------- Authentification ----------

async function checkAccountStatus(nom) {
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=accountStatus&nom=${encodeURIComponent(nom)}`);
    const data = await res.json();
    loginNeedsSetup = data.ok ? data.needsSetup : false;
  } catch (err) {
    loginNeedsSetup = false;
  }
  render();
}

async function setInitialCode(nom, newCode) {
  loginError = "";
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=setCode&nom=${encodeURIComponent(nom)}&newCode=${encodeURIComponent(newCode)}`);
    const data = await res.json();
    if (data.ok) {
      session = { nom, code: newCode, roles: data.roles || [] };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(LAST_USER_KEY, nom);
      currentPage = "home";
      await fetchAll();
    } else if (data.error === "already_set") {
      loginError = "Un code existe déjà pour ce nom. Entre-le, ou demande à l'Admin de le réinitialiser (vide la case dans Google Sheet).";
      loginNeedsSetup = false;
      render();
    } else {
      loginError = "Le code doit comporter exactement 4 chiffres.";
      render();
    }
  } catch (err) {
    loginError = "Connexion impossible. Réessaie.";
    render();
  }
}

async function tryLogin(nom, code) {
  loginError = "";
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=login&nom=${encodeURIComponent(nom)}&code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (data.ok) {
      session = { nom, code, roles: data.roles || [] };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(LAST_USER_KEY, nom);
      currentPage = "home";
      await fetchAll();
    } else {
      loginError = "Nom ou code incorrect.";
      render();
    }
  } catch (err) {
    loginError = "Connexion impossible. Réessaie.";
    render();
  }
}

async function changeCodeApi(oldCode, newCode) {
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=changeCode&authNom=${encodeURIComponent(session.nom)}&oldCode=${encodeURIComponent(oldCode)}&newCode=${encodeURIComponent(newCode)}`);
    const data = await res.json();
    if (data.ok) {
      session.code = newCode;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      window.__showChangeCode = false;
      window.__changeCodeError = null;
      alert("Code modifié avec succès.");
      render();
    } else {
      window.__changeCodeError = data.error === "auth" ? "Code actuel incorrect." : "Le nouveau code doit comporter 4 chiffres.";
      render();
    }
  } catch (err) {
    window.__changeCodeError = "Connexion impossible. Réessaie.";
    render();
  }
}

function renderLogin() {
  let formHtml = "";
  if (loginSelectedNom && loginNeedsSetup === true) {
    formHtml = `
      <div class="muted" style="margin-top:10px;">Première connexion pour <b>${loginSelectedNom}</b> : choisis ton code.</div>
      <label class="field-label">Nouveau code (4 chiffres)</label>
      <input id="login-newcode" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <label class="field-label">Confirme le code</label>
      <input id="login-newcode2" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <div style="margin-top:16px;"><button class="btn" id="setcode-btn">Définir mon code et me connecter</button></div>
    `;
  } else if (loginSelectedNom && loginNeedsSetup === false) {
    formHtml = `
      <label class="field-label">Code (4 chiffres)</label>
      <input id="login-code" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <div style="margin-top:16px;"><button class="btn" id="login-btn">Se connecter</button></div>
    `;
  } else if (loginSelectedNom && loginNeedsSetup === null) {
    formHtml = `<div class="muted" style="margin-top:10px;">Vérification...</div>`;
  }

  return `<div class="login-wrap"><div class="login-card-outer"><div class="login-card">
    <div class="login-glow"></div>
    <img src="${LOGO_DATA_URI}" alt="Logo"/>
    <div class="login-title">LustuZone</div>
    <div class="login-subtitle">App de Gestion</div>
    <label class="field-label">Ton nom</label>
    <div style="position:relative;">
      <input id="login-nom" type="text" autocomplete="off"
        placeholder="Tape ou choisis ton nom" value="${escapeHtml(loginSelectedNom)}" />
      <div id="login-suggestions" class="login-suggestions"></div>
    </div>
    ${formHtml}
    ${loginPrefilledFromMemory && loginSelectedNom ? `<div class="muted" id="login-change-account" style="margin-top:12px; cursor:pointer; text-decoration:underline;">Ce n'est pas moi — changer de compte</div>` : ""}
    ${loginError ? `<div class="login-error">${loginError}</div>` : ""}
  </div></div></div>`;
}

function currentLoginNomsList() {
  return loginNoms ? loginNoms.map(c => c.nom) : [...PLAYERS, "Coach", "Admin", "Bénévole"];
}

// Liste de suggestions maison (au lieu du <datalist> natif) : le support de datalist sur
// Safari/iOS est connu pour être incohérent selon les versions (suggestions absentes ou
// bugguées) — cette version fonctionne pareil sur tous les navigateurs, et surtout ne
// reconstruit jamais le champ pendant la frappe (voir la note plus bas sur le "lettre par lettre").
function renderLoginSuggestions(query) {
  const box = document.getElementById("login-suggestions");
  if (!box) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) { box.innerHTML = ""; box.style.display = "none"; return; }
  const matches = currentLoginNomsList().filter(n => n.toLowerCase().includes(q) && n.toLowerCase() !== q).slice(0, 6);
  if (matches.length === 0) { box.innerHTML = ""; box.style.display = "none"; return; }
  box.innerHTML = matches.map(n => `<div class="login-suggestion-item" data-suggest-nom="${escapeHtml(n)}">${escapeHtml(n)}</div>`).join("");
  box.style.display = "block";
  box.querySelectorAll("[data-suggest-nom]").forEach(el => {
    el.onmousedown = (ev) => ev.preventDefault(); // évite que le champ perde le focus avant le clic
    el.onclick = () => {
      const nom = el.dataset.suggestNom;
      const input = document.getElementById("login-nom");
      if (input) input.value = nom;
      loginSelectedNom = nom;
      loginPrefilledFromMemory = false;
      loginError = "";
      box.innerHTML = ""; box.style.display = "none";
      loginNeedsSetup = null;
      checkAccountStatus(nom);
    };
  });
}

function attachLoginEvents() {
  const nomInput = document.getElementById("login-nom");
  if (nomInput) nomInput.oninput = (e) => {
    const val = e.target.value;
    loginSelectedNom = val;
    loginPrefilledFromMemory = false;
    loginError = "";
    const allNoms = currentLoginNomsList();
    // Important : ne JAMAIS appeler render() pendant la frappe — ça détruirait et recréerait
    // le champ à chaque lettre, ce qui casse le clavier virtuel sur mobile (effet "lettre par
    // lettre"). On ne redessine que si le nom tapé correspond exactement à un compte connu ;
    // la liste de suggestions, elle, se met à jour par manipulation directe du DOM (pas de render()).
    renderLoginSuggestions(val);
    if (allNoms.includes(val)) {
      loginNeedsSetup = null;
      document.getElementById("login-suggestions").style.display = "none";
      checkAccountStatus(val);
    }
  };
  nomInput && nomInput.addEventListener("blur", () => {
    setTimeout(() => { const box = document.getElementById("login-suggestions"); if (box) box.style.display = "none"; }, 150);
  });

  const changeAccount = document.getElementById("login-change-account");
  if (changeAccount) changeAccount.onclick = () => {
    loginSelectedNom = "";
    loginPrefilledFromMemory = false;
    loginNeedsSetup = null;
    loginError = "";
    localStorage.removeItem(LAST_USER_KEY);
    render();
  };

  const btn = document.getElementById("login-btn");
  if (btn) btn.onclick = () => {
    const code = document.getElementById("login-code").value;
    if (!loginSelectedNom || !code) { loginError = "Choisis ton nom et entre ton code."; render(); return; }
    tryLogin(loginSelectedNom, code);
  };

  const setCodeBtn = document.getElementById("setcode-btn");
  if (setCodeBtn) setCodeBtn.onclick = () => {
    const c1 = document.getElementById("login-newcode").value;
    const c2 = document.getElementById("login-newcode2").value;
    if (!/^\d{4}$/.test(c1)) { loginError = "Le code doit comporter exactement 4 chiffres."; render(); return; }
    if (c1 !== c2) { loginError = "Les deux codes ne correspondent pas."; render(); return; }
    setInitialCode(loginSelectedNom, c1);
  };
}

// ---------- Accueil ----------

function renderHome() {
  const canManage = hasRole("Coach") || hasRole("Admin");
  let html = "";

  const nextEv = nextEvenement();

  // Titre dynamique façon maquette
  if (nextEv) {
    const d = eventDateObj(nextEv);
    const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" });
    const diffDays = Math.round((d - new Date()) / (1000 * 60 * 60 * 24));
    const headline = `Prêt pour ${dayName} ?`;
    const sub = diffDays <= 0 ? "C'est aujourd'hui !" : diffDays === 1 ? "C'est demain !" : `Dans ${diffDays} jours.`;
    html += `<div class="page-title">${headline}</div><div class="page-sub">${sub}</div>`;
  } else {
    html += `<div class="page-title">Salut ${session.nom}</div><div class="page-sub">Aucun événement prévu pour le moment.</div>`;
  }

  // Encart mail de relance mis de côté pour le moment (on garde les données en réserve) au
  // profit des notifications push. Repasser EMAIL_REMINDER_UI_VISIBLE à true pour le remontrer.
  if (EMAIL_REMINDER_UI_VISIBLE) {
    const myRowForEmail = findCompteRow(session.nom);
    const myEmail = myRowForEmail ? (myRowForEmail[6] || "") : "";
    if (!myEmail) {
      html += `<div class="card" style="border-color: rgba(255,180,60,0.4); background: linear-gradient(135deg, rgba(255,180,60,0.12), rgba(17,20,31,0.4));">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-size:20px;">📧</div>
          <div style="flex:1; font-size:11.5px; color:#e8e8ee; line-height:1.5;">Merci de renseigner votre adresse mail pour avoir les relances de présence à remplir.</div>
        </div>
        <button class="btn" style="margin-top:10px; margin-bottom:0;" data-goto-profil-email="1">Renseigner mon adresse mail</button>
      </div>`;
    }
  }

  html += renderNextEventCard();

  // Stats compactes : caisse noire (SM1 uniquement, structure Grid figée) + présence perso
  // (tirée du roster réel de l'équipe, pas de la liste PLAYERS figée — sinon un joueur peut
  // avoir sa présence correcte sur la page Présence mais rien sur l'Accueil).
  const inCaisseNoire = PLAYERS.map(p => p.trim()).includes((session.nom || "").trim()) && (isInTeam("SM1") || hasRole("Admin"));
  const joueurIdentity = myJoueurIdentity();
  const inPresenceRoster = !!joueurIdentity && rosterForEquipe(joueurIdentity.equipe).includes(joueurIdentity.nom);
  if (inCaisseNoire || inPresenceRoster) {
    const total = inCaisseNoire ? playerTotal(session.nom) : 0;
    const rank = PLAYERS.map(p => ({ p, t: playerTotal(p) })).sort((a, b) => b.t - a.t);
    const myRank = rank.findIndex(r => r.p === session.nom) + 1;
    const myStats = inPresenceRoster ? computeAverages(joueurIdentity.equipe, false).find(s => s.p === joueurIdentity.nom) : null;
    const pctDisplay = myStats && myStats.pct !== null ? `${fmt(myStats.pct)}%` : "-";
    const pctSub = myStats && myStats.total > 0 ? `${myStats.oui}/${myStats.total}` : "Pas de donnée";

    html += `<div class="grid2">
      ${inCaisseNoire ? `<div class="stat alt"><div class="stat-bar"></div><div class="stat-label">Caisse noire</div><div class="stat-value warn">${fmt(total)}€</div><div class="stat-sub">${myRank}e / ${PLAYERS.length}</div></div>` : ""}
      ${inPresenceRoster ? `<div class="stat"><div class="stat-bar"></div><div class="stat-label">Présence</div><div class="stat-value">${pctDisplay}</div><div class="stat-sub">${pctSub}</div></div>` : ""}
    </div>`;
  }

  myScorencoTeams().forEach(t => { html += renderResultsWidget(t); });
  html += renderOsteoHomeCard();

  const weekEvents = getCurrentWeekEvents().filter(ev => !nextEv || ev[0] !== nextEv[0]);
  html += `<div class="section-h">Cette semaine</div>`;
  if (weekEvents.length > 0) {
    weekEvents.forEach(ev => {
      const isPast = eventDateObj(ev) < new Date();
      html += renderEventCard(ev, canManage, isPast);
    });
  } else if (!nextEv) {
    html += `<div class="card muted">Aucun événement prévu pour le moment.</div>`;
  } else {
    html += `<div class="card muted">Aucun autre événement dans les 7 prochains jours.</div>`;
  }

  // Fil d'actualité
  html += `<div class="section-h">Fil d'actualité</div>`;
  const homeActus = visibleActualites().filter(a => String(a[1] || "").indexOf("Nouveau(x) créneau(x) RDV Ostéo") !== 0).slice(0, 2);
  if (homeActus.length === 0) {
    html += `<div class="card muted">Aucune actualité pour le moment.</div>`;
  } else {
    homeActus.forEach(a => {
      const [id, titre, scope] = a;
      html += `<div class="card" style="padding:12px;">
        <span class="badge">${scope === "Générale" ? "Générale" : scope}</span>
        <div style="font-size:12.5px; font-weight:700; color:#e8e8ee; margin-top:6px;">${escapeHtml(titre)}</div>
      </div>`;
    });
  }

  if (PLAYERS.map(p => p.trim()).includes((session.nom || "").trim())) {
    html += `<div class="section-h">Caisse noire</div>`;
    const total = playerTotal(session.nom);
    const lines = ACTIONS.map((a, i) => ({ name: a[0], val: a[1], count: (grid[session.nom] && grid[session.nom][i]) || 0 }))
      .filter(l => l.count > 0);

    html += `<div class="card">
      <div class="muted" style="margin-bottom:8px;">Détail des actions enregistrées</div>`;
    if (lines.length === 0) {
      html += `<div class="muted">Aucune action enregistrée pour le moment.</div>`;
    } else {
      lines.forEach(l => { html += `<span class="pill">${l.name} ×${fmt(l.count)} = ${fmt(l.count * l.val)} €</span>`; });
    }
    html += `</div>`;

    html += `<div class="card">
      <div class="muted">Total caisse de l'équipe</div>
      <div class="big-number">${fmt(grandTotal())} €</div>
    </div>`;
  } else {
    html += `<div class="card"><div class="muted">Bienvenue, ${session.nom}.</div></div>`;
  }

  return html;
}

// ---------- Nav / rendu principal ----------

const NAV_ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  agenda: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  entry: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  table: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  presence: '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  paiements: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/>',
  stats: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  more: '<path d="M12 5v14M5 12h14"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  actualites: '<path d="M3 11l18-5v12L3 14v-3z"/><path d="M7 14v5a2 2 0 002 2h1"/>',
  salaries: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>',
  covoiturage: '<path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11M3 11h18v6a1 1 0 01-1 1h-1a1 1 0 01-1-1v-1H6v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>',
  osteo: '<path d="M5 3v5a3 3 0 003 3 3 3 0 003-3V3"/><path d="M8 11v2a6 6 0 006 6 6 6 0 006-6v-2"/><circle cx="20" cy="7" r="2"/><circle cx="14" cy="21" r="2"/>',
};

// Position (en px) de la pastille de nav lors du dernier appel — permet de simuler un glissement
// (FLIP) même si le <div id="nav-pill"> est en réalité recréé à chaque rendu (innerHTML complet) :
// on le pose d'abord instantanément à son ancienne position, puis on anime vers la nouvelle.
let __lastNavPillRect = null;

function positionNavPill() {
  const pill = document.getElementById("nav-pill");
  const activeBtn = document.querySelector(".bottom-nav .nav-btn.active");
  if (!pill || !activeBtn) return;
  const navRect = pill.parentElement.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const targetLeft = btnRect.left - navRect.left;
  const targetWidth = btnRect.width;

  pill.style.transition = "none";
  pill.style.left = (__lastNavPillRect ? __lastNavPillRect.left : targetLeft) + "px";
  pill.style.width = (__lastNavPillRect ? __lastNavPillRect.width : targetWidth) + "px";
  void pill.offsetWidth;
  pill.style.transition = "left 0.28s cubic-bezier(.4,1.3,.4,1), width 0.28s cubic-bezier(.4,1.3,.4,1)";
  pill.style.left = targetLeft + "px";
  pill.style.width = targetWidth + "px";
  __lastNavPillRect = { left: targetLeft, width: targetWidth };
}

function getTabsForRole() {
  const tabs = [
    { id: "home", label: "Accueil", main: true },
    { id: "agenda", label: "Agenda", main: true },
    { id: "actualites", label: "Actualités", main: true },
  ];
  // Caisse noire reste réservée à la SM1 pour le moment (l'Admin garde accès à tout, peu
  // importe son équipe). On l'affiche si l'un des rôles cumulés donne accès à la SM1.
  const isSM1 = isInTeam("SM1") || hasRole("Admin");
  if (isSM1 && (hasRole("Joueur") || hasRole("Coach") || hasRole("Admin"))) {
    tabs.push({ id: "table", label: "Caisse", main: true });
  }

  const extraCandidates = [];
  if (hasRole("Coach") || hasRole("Admin")) extraCandidates.push({ id: "presence", label: "Présence", main: false });
  if (hasRole("Admin") || ((hasRole("Joueur") || hasRole("Coach")) && isInTeam("SM1"))) extraCandidates.push({ id: "paiements", label: "Paiements", main: false });
  if (hasRole("Salarié") || hasRole("Admin")) extraCandidates.push({ id: "salaries", label: "Espace salariés", main: false });
  const hasCovoit = hasRole("Joueur") || hasRole("Coach") || hasRole("Parent") || hasRole("Admin");
  const hasOsteo = true; // accessible à tout le monde (réservation de créneaux)

  // S'il y a la place, tout s'affiche directement dans la barre — Covoiturage juste avant
  // Profil, et Profil toujours tout à droite en dernier.
  const totalIfAllMain = tabs.length + extraCandidates.length + (hasCovoit ? 1 : 0) + (hasOsteo ? 1 : 0) + 1;
  if (totalIfAllMain <= 6) {
    extraCandidates.forEach(e => tabs.push({ ...e, main: true }));
    if (hasCovoit) tabs.push({ id: "covoiturage", label: "Covoiturage", main: true });
    if (hasOsteo) tabs.push({ id: "osteo", label: "Ostéo", main: true });
    tabs.push({ id: "profil", label: "Profil", main: true });
    return tabs;
  }

  // Sinon, trop d'onglets pour tenir : comportement historique avec "Plus".
  if (tabs.filter(t => t.main).length <= 3) {
    tabs.push({ id: "profil", label: "Profil", main: true });
  }

  const extra = extraCandidates.slice();
  if (hasCovoit) extra.push({ id: "covoiturage", label: "Covoiturage", main: false });
  if (hasOsteo) extra.push({ id: "osteo", label: "Ostéo", main: false });

  // Un seul élément dans "Plus" -> inutile de le cacher derrière un clic, on l'affiche directement.
  if (extra.length === 1) {
    tabs.push({ ...extra[0], main: true });
  } else {
    tabs.push(...extra);
  }

  return tabs;
}

let __lastRenderedPage = null;

function render() {
  const app = document.getElementById("app");

  // Mémorise la position de défilement avant de reconstruire la page
  const scrollY = window.scrollY;
  const tableWrap = app.querySelector(".table-wrap");
  const tableScrollLeft = tableWrap ? tableWrap.scrollLeft : 0;
  const tableScrollTop = tableWrap ? tableWrap.scrollTop : 0;

  // Mémorise les valeurs des champs en cours de saisie (formulaires) pour ne pas
  // les effacer lors du rafraîchissement automatique toutes les 8 secondes
  const fieldValues = {};
  app.querySelectorAll("input[id], select[id], textarea[id]").forEach(el => {
    if (el.id === "nav-extra") return; // contrôle de navigation, jamais à restaurer
    fieldValues[el.id] = el.value;
  });
  const active = document.activeElement;
  const activeId = active && active.id && active.id !== "nav-extra" ? active.id : null;
  const activeSelStart = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
  const activeSelEnd = active && typeof active.selectionEnd === "number" ? active.selectionEnd : null;

  if (!session) {
    document.body.classList.add("login-mode");
    app.innerHTML = renderLogin();
    attachLoginEvents();
    return;
  }
  document.body.classList.remove("login-mode");

  let html = `<div class="header ${currentPage === 'home' ? 'home-header' : ''}">
    <img src="${LOGO_DATA_URI}" alt="Logo LustuZone"/>
    <div class="hdr-textwrap"><div class="title">LustuZone</div><div class="subtitle">App de Gestion</div></div>
    <div class="spacer"></div>
    <div class="avatar-wrap">
      <div class="avatar-btn" id="avatar-btn">${getInitials(session.nom)}</div>
      ${window.__avatarMenuOpen ? `<div class="avatar-menu">
        <div class="avatar-menu-name">${session.nom}</div>
        <div class="badge avatar-menu-role">${rolesLabel()}</div>
        <div class="avatar-menu-item" id="menu-profil">Mon profil</div>
        <div class="avatar-menu-item" id="menu-guide">📖 Consignes d'utilisation</div>
        <div class="avatar-menu-item" id="menu-support">💬 Support / une question ?</div>
        <a class="avatar-menu-item" href="${CLUB_WEBSITE_URL}" target="_blank" rel="noopener" style="display:block; text-decoration:none; box-sizing:border-box;">🌐 Site du club</a>
        <div class="avatar-menu-item" id="menu-changecode">Changer le code</div>
        <div class="avatar-menu-item danger" id="menu-logout">Se déconnecter</div>
      </div>` : ""}
    </div>
  </div>`;

  if (window.__showChangeCode) {
    html += `<div class="card">
      <div class="section-h" style="margin-bottom:8px;">Changer mon code</div>
      <label class="field-label">Code actuel</label>
      <input id="cc-old" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <label class="field-label">Nouveau code (4 chiffres)</label>
      <input id="cc-new1" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <label class="field-label">Confirme le nouveau code</label>
      <input id="cc-new2" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      ${window.__changeCodeError ? `<div class="login-error">${window.__changeCodeError}</div>` : ""}
      <div class="row-flex" style="margin-top:10px;">
        <button class="btn" style="flex:1;" id="cc-submit">Valider</button>
        <button class="btn secondary" style="flex:1;" id="cc-cancel">Annuler</button>
      </div>
    </div>`;
  }

  if (!isOnline) {
    html += `<div class="status-bar status-offline">Hors ligne - nouvelle tentative...</div>`;
  }

  // Exposé avant le rendu de la page : permet aux renderXxxPage() de ne jouer une animation
  // d'entrée (cascade de cartes, barres qui se remplissent...) que lors d'un vrai changement de
  // page, jamais lors d'un rafraîchissement périodique (fetchAll toutes les 8-10s) qui rejoue
  // sinon l'animation en boucle sur des données identiques.
  window.__pageJustChanged = session && (__lastRenderedPage === null || __lastRenderedPage !== currentPage);

  const tabs = getTabsForRole();
  const mainTabs = tabs.filter(t => t.main);
  const extraTabs = tabs.filter(t => !t.main);
  const currentIsExtra = extraTabs.some(t => t.id === currentPage);

  if (currentPage === "home") html += renderHome();
  else if (currentPage === "agenda") html += renderAgenda();
  else if (currentPage === "table") html += renderCaisseNoireSummary();
  else if (currentPage === "presence") html += renderPresencePage();
  else if (currentPage === "paiements") html += renderPaiementsPage();
  else if (currentPage === "profil") html += renderProfilPage();
  else if (currentPage === "actualites") html += renderActualitesPage();
  else if (currentPage === "salaries") html += renderSalariesPage();
  else if (currentPage === "covoiturage") html += renderCovoiturageePage();
  else if (currentPage === "gallery") html += renderGalleryPage();
  else if (currentPage === "photoview") html += renderPhotoViewPage();
  else if (currentPage === "guide") html += renderGuidePage();
  else if (currentPage === "support") html += renderSupportPage();
  else if (currentPage === "osteo") html += renderOsteoPage();

  html += `<div class="bottom-nav"><div class="nav-pill" id="nav-pill"></div>`;
  html += mainTabs.map(t => {
    const justActivated = window.__pageJustChanged && currentPage === t.id;
    return `<button data-page="${t.id}" class="nav-btn ${currentPage === t.id ? 'active' : ''}">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="${justActivated ? 'animation:navIconBounce 0.35s ease-out;' : ''}">${NAV_ICONS[t.id] || ""}</svg>
      ${t.label}
    </button>`;
  }).join("");
  if (extraTabs.length > 0) {
    const extraIcon = currentIsExtra ? (NAV_ICONS[currentPage] || NAV_ICONS.more) : NAV_ICONS.more;
    html += `<div class="bn-select-wrap ${currentIsExtra ? 'active' : ''}">
      <button type="button" class="bn-select-trigger" id="nav-extra-trigger">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${extraIcon}</svg>
        <div class="bn-select-label">${currentIsExtra ? tabs.find(t => t.id === currentPage).label : "Plus"}</div>
      </button>
      ${window.__navExtraMenuOpen ? `<div class="bn-extra-menu">
        ${extraTabs.map(t => `<div class="avatar-menu-item ${currentPage === t.id ? 'active' : ''}" data-nav-extra-item="${t.id}">${t.label}</div>`).join("")}
      </div>` : ""}
    </div>`;
  }
  html += `</div>`;

  app.innerHTML = html;
  attachEvents();
  if (session) positionNavPill();

  // Restaure la position de défilement après reconstruction — sauf si on vient de changer
  // de page, auquel cas on repart en haut plutôt que de garder le niveau de défilement précédent.
  const pageChanged = session && __lastRenderedPage !== null && __lastRenderedPage !== currentPage;
  window.scrollTo(0, pageChanged ? 0 : scrollY);
  if (session) __lastRenderedPage = currentPage;
  const newTableWrap = app.querySelector(".table-wrap");
  if (newTableWrap) {
    newTableWrap.scrollLeft = tableScrollLeft;
    newTableWrap.scrollTop = tableScrollTop;
  }

  // Restaure les valeurs de formulaire en cours de saisie
  Object.keys(fieldValues).forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== fieldValues[id]) el.value = fieldValues[id];
  });
  if (activeId && activeId !== "nav-extra") {
    const el = document.getElementById(activeId);
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && typeof el.focus === "function") {
      el.focus();
      if (activeSelStart !== null && typeof el.setSelectionRange === "function") {
        try { el.setSelectionRange(activeSelStart, activeSelEnd); } catch (e) {}
      }
    }
  }

  // Déplace (plutôt que recrée) les widgets Score'n'co déjà chargés dans leur emplacement
  // du rendu courant — sans ça, la reconstruction périodique de la page les ferait recharger
  // sans fin (leur script ne redétecte pas une zone recréée avec le même contenu).
  relocateScorencoWidgets();
}
