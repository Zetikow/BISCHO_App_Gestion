// ===================================================================
// ACTUALITÉS — fil d'annonces générales ou par équipe (feuille
// "Actualites").
// ===================================================================

const ACTU_SCOPES = ["Générale", ...TEAMS];

function visibleActualites() {
  let list = actualites;
  if (!hasRole("Admin") && !hasRole("Salarié") && !hasRole("Ostéo")) {
    list = list.filter(a => a[2] === "Générale" || a[2] === (primaryEquipe()));
  }
  return list.slice().sort((a, b) => String(b[5] || "").localeCompare(String(a[5] || "")));
}

function scopesForActuCreation() {
  if (hasRole("Admin")) return ACTU_SCOPES;
  if (hasRole("Coach")) return equipesForRole("Coach").length ? equipesForRole("Coach") : [primaryEquipe()];
  return [];
}

function actuFilterOptions() {
  if (hasRole("Admin") || hasRole("Salarié") || hasRole("Ostéo")) return ["Générale", ...TEAMS];
  return ["Générale", primaryEquipe()];
}

function renderActualitesPage() {
  const canCreate = hasRole("Coach") || hasRole("Admin");
  const creatableScopes = scopesForActuCreation();
  let html = `<div class="page-title">Actualités</div><div class="page-sub">Annonces du club et des équipes.</div>`;

  if (canCreate) {
    html += `<button class="btn add-btn-primary" id="toggle-add-actualite">${window.__showAddActualite ? "− Fermer" : "+ Ajouter une actualité"}</button>`;
    if (window.__showAddActualite) {
      html += `<div class="add-form">
        <label class="field-label">Titre</label>
        <input id="actu-titre" type="text" placeholder="ex: Photo d'équipe le 11 octobre" />
        <label class="field-label">Pour qui</label>
        <select id="actu-scope">
          ${creatableScopes.map(s => `<option value="${s}">${s === "Générale" ? "Actualité générale" : `Actualité ${s}`}</option>`).join("")}
        </select>
        <label class="field-label">Texte</label>
        <textarea id="actu-texte" rows="4" placeholder="Détails de l'actualité..." style="width:100%; background:#11141f; border:1px solid #2a3350; border-radius:9px; padding:10px; color:#e8e8ee; font-family:'DM Sans',sans-serif; font-size:13px; resize:vertical;"></textarea>
        <button class="btn" id="submit-add-actualite" style="margin-top:8px;">Publier l'actualité</button>
      </div>`;
    }
  }

  const filterOptions = actuFilterOptions();
  const activeFilter = (window.__actuFilter && filterOptions.includes(window.__actuFilter)) ? window.__actuFilter : filterOptions[0];
  html += `<div class="team-switch-row">
    ${filterOptions.map(t => `<button type="button" class="team-switch-btn actu-filter-btn ${t === activeFilter ? 'active' : ''}" data-actu-filter="${t}">Actualité<br>${t}</button>`).join("")}
  </div>`;

  let list = visibleActualites().filter(a => a[2] === activeFilter);

  if (list.length === 0) {
    html += `<div class="card muted">Aucune actualité pour le moment.</div>`;
  } else {
    const canManageAny = hasRole("Admin");
    list.forEach(a => {
      const [id, titre, scope, texte, auteur, date] = a;
      const canDelete = canManageAny || (hasRole("Coach") && equipesForRole("Coach").includes(scope));
      const dateLabel = date ? String(date).slice(0, 10).split("-").reverse().join("/") : "";
      const isOsteoActu = String(titre || "").indexOf("Nouveau(x) créneau(x) RDV Ostéo") === 0;
      html += `<div class="news-card" style="${isOsteoActu ? "border-left:3px solid var(--gold);" : ""}">
        <div class="row-flex" style="align-items:flex-start; justify-content:space-between;">
          <span class="badge" style="${isOsteoActu ? "background:rgba(224,166,57,0.15); color:var(--gold); border-color:rgba(224,166,57,0.35);" : ""}">${isOsteoActu ? "🩺 " : ""}${scope === "Générale" ? "Générale" : scope}</span>
          ${canDelete ? iconBtn(ICON_CROSS, "ev-del", `data-delete-actualite="${id}" style="flex-shrink:0;"`) : ""}
        </div>
        <div class="news-title">${escapeHtml(titre)}</div>
        <div class="news-body">${escapeHtml(texte)}</div>
        <div class="ev-meta" style="margin-top:8px;">Par ${escapeHtml(auteur || "?")} ${dateLabel ? "· " + dateLabel : ""}</div>
        ${isOsteoActu ? `<button class="btn" style="margin-top:10px;" data-goto-osteo-tab="dispo">Voir les créneaux</button>` : ""}
      </div>`;
    });
  }

  return html;
}

// ===================== ACTIONS API =====================

async function addActualiteApi(titre, scope, texte) {
  const tempId = "temp_" + Date.now();
  const today = new Date().toISOString().slice(0, 10);
  actualites.push([tempId, titre, scope, texte, session.nom, today]);
  window.__showAddActualite = false;
  render();
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=addActualite&titre=${encodeURIComponent(titre)}&scope=${encodeURIComponent(scope)}&texte=${encodeURIComponent(texte)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    const data = await res.json();
    if (data.ok) {
      await fetchAll();
    } else {
      actualites = actualites.filter(a => a[0] !== tempId);
      showToast("Échec de l'ajout", "error");
      render();
    }
  } catch (err) {
    isOnline = false;
    actualites = actualites.filter(a => a[0] !== tempId);
    showToast("Échec de l'ajout", "error");
    render();
  }
}

async function deleteActualiteApi(id) {
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=deleteActualite&id=${encodeURIComponent(id)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

function attachActualitesEvents() {
  const toggleAddActualite = document.getElementById("toggle-add-actualite");
  if (toggleAddActualite) toggleAddActualite.onclick = () => { window.__showAddActualite = !window.__showAddActualite; render(); };

  document.querySelectorAll("[data-actu-filter]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__actuFilter = el.dataset.actuFilter;
      render();
    };
  });

  const submitAddActualite = document.getElementById("submit-add-actualite");
  if (submitAddActualite) submitAddActualite.onclick = () => {
    const titre = document.getElementById("actu-titre").value.trim();
    const scope = document.getElementById("actu-scope").value;
    const texte = document.getElementById("actu-texte").value.trim();
    if (!titre) { alert("Merci de renseigner au moins un titre."); return; }
    addActualiteApi(titre, scope, texte);
  };

  document.querySelectorAll("[data-delete-actualite]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.deleteActualite;
      if (confirm("Supprimer cette actualité ?")) deleteActualiteApi(id);
    };
  });
}
