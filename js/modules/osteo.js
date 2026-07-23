// ===================================================================
// RDV OSTÉO — créneaux et réservations (feuilles "OsteoSlots" /
// "OsteoReservations"). Module optionnel : à supprimer avec son fichier
// backend apps-script/Osteo.gs pour un club qui n'a pas ce service.
// ===================================================================

function renderOsteoHomeCard() {
  const myTeams = myAllowedEquipes();
  const now = new Date();
  const reservedSlotIds = new Set(osteoReservations.map(r => r[0]));
  const available = osteoSlots.filter(s => osteoSlotDate(s) >= now && !reservedSlotIds.has(s[0]) && (s[4] === "Toutes" || myTeams.includes(s[4])))
    .sort((a, b) => osteoSlotDate(a) - osteoSlotDate(b));

  let html = `<div class="card">
    <div class="section-h" style="margin-top:0;">🩺 Rendez-vous Ostéo</div>`;

  if (available.length > 0) {
    html += `<div class="osteo-carousel">${available.map(s => renderOsteoSlotCard(s, "reserve")).join("")}</div>`;
  } else {
    html += `<div class="muted" style="margin-bottom:12px;">Aucun créneau disponible pour le moment.</div>`;
  }

  html += `<div style="display:flex; gap:8px; margin-top:10px;">
      <button class="btn" style="margin:0;" data-goto-osteo-tab="dispo">RDV Dispo</button>
      <button class="btn" style="margin:0;" data-goto-osteo-tab="mes">Mes RDV</button>
    </div>
  </div>`;
  return html;
}

function renderOsteoPage() {
  const isManager = hasRole("Ostéo") || hasRole("Admin");
  const tab = (window.__osteoTab === "mes") ? "mes" : "dispo";

  let html = `<div class="page-title">RDV Ostéo</div><div class="page-sub">Avec Eve, ostéopathe du club.</div>`;
  html += `<div class="team-switch-row">
    <button type="button" class="team-switch-btn ${tab === 'dispo' ? 'active' : ''}" data-osteo-tab="dispo">Disponibles</button>
    <button type="button" class="team-switch-btn ${tab === 'mes' ? 'active' : ''}" data-osteo-tab="mes">Mes RDV</button>
  </div>`;

  html += renderOsteoPlayerView(tab);

  if (isManager && tab === "dispo") {
    html += `<div class="section-h" style="margin-top:22px;">Gestion des créneaux</div>`;
    html += renderOsteoManagerView();
  }

  return html;
}

function osteoSlotDate(slot) {
  return new Date(slot[1] + "T" + (slot[2] || "00:00"));
}

function renderOsteoSlotCard(slot, mode, motif) {
  const [id, date, heure, lieu, equipe] = slot;
  const d = osteoSlotDate(slot);
  const dateLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  let tagClass = "", tagLabel = equipe;
  if (mode === "taken") { tagClass = "taken"; tagLabel = "Pris"; }
  if (mode === "cancel") { tagClass = "taken"; tagLabel = "Réservé"; }
  if (mode === "done") { tagClass = "done"; tagLabel = "Terminé"; }

  let action = "";
  if (mode === "reserve") action = `<div class="osteo-mini-btn" data-osteo-reserve="${escapeHtml(id)}">Réserver</div>`;
  if (mode === "cancel") action = `<div class="osteo-mini-btn cancel" data-osteo-cancel="${escapeHtml(id)}">Annuler</div>`;

  return `<div class="osteo-slot-card">
    <div class="osteo-tag ${tagClass}">${escapeHtml(tagLabel)}</div>
    <div class="osteo-slot-date2">${dateLabel}</div>
    <div class="osteo-slot-meta2">${escapeHtml(heure || "")}${lieu ? "<br/>" + escapeHtml(lieu) : ""}</div>
    ${motif ? `<div class="muted" style="font-size:9px; margin-bottom:6px;">Motif : ${escapeHtml(motif)}</div>` : ""}
    ${action}
  </div>`;
}

function renderOsteoPlayerView(tab) {
  const myTeams = myAllowedEquipes();
  const now = new Date();

  let html = "";

  const reservedSlotIds = new Set(osteoReservations.map(r => r[0]));

  if (tab === "dispo") {
    const slots = osteoSlots.filter(s => osteoSlotDate(s) >= now && (s[4] === "Toutes" || myTeams.includes(s[4])))
      .sort((a, b) => osteoSlotDate(a) - osteoSlotDate(b));
    const available = slots.filter(s => !reservedSlotIds.has(s[0]));
    const taken = slots.filter(s => reservedSlotIds.has(s[0]));

    html += `<div class="section-h">Créneaux disponibles</div>`;
    html += available.length === 0
      ? `<div class="card"><div class="muted">Aucun créneau disponible pour le moment.</div></div>`
      : `<div class="osteo-carousel">${available.map(s => renderOsteoSlotCard(s, "reserve")).join("")}</div>`;

    if (taken.length > 0) {
      html += `<div class="section-h">Déjà réservés (par d'autres)</div>`;
      html += `<div class="osteo-carousel">${taken.map(s => renderOsteoSlotCard(s, "taken")).join("")}</div>`;
    }

    if (window.__osteoReserveSlotId) {
      const slot = osteoSlots.find(s => s[0] === window.__osteoReserveSlotId);
      if (slot) {
        html += `<div class="add-form">
          <div class="section-h" style="margin-top:0;">${escapeHtml(slot[1])} · ${escapeHtml(slot[2])}</div>
          <label class="field-label">Décris ta douleur / le motif (optionnel)</label>
          <textarea id="osteo-motif" rows="4" placeholder="Ex: douleur à l'épaule droite..."></textarea>
          <button class="btn" id="osteo-confirm-reserve" style="margin-top:10px;">Confirmer ma réservation</button>
        </div>`;
      }
    }
  } else {
    const mine = osteoReservations.filter(r => r[1] === session.nom).map(r => {
      const slot = osteoSlots.find(s => s[0] === r[0]);
      return slot ? { slot, motif: r[2] } : null;
    }).filter(Boolean);

    const upcoming = mine.filter(x => osteoSlotDate(x.slot) >= now).sort((a, b) => osteoSlotDate(a.slot) - osteoSlotDate(b.slot));
    const past = mine.filter(x => osteoSlotDate(x.slot) < now).sort((a, b) => osteoSlotDate(b.slot) - osteoSlotDate(a.slot));

    html += `<div class="section-h">À venir</div>`;
    html += upcoming.length === 0
      ? `<div class="card"><div class="muted">Aucun RDV à venir.</div></div>`
      : `<div class="osteo-carousel">${upcoming.map(x => renderOsteoSlotCard(x.slot, "cancel", x.motif)).join("")}</div>`;

    html += `<div class="section-h" style="margin-top:16px;">Passés</div>`;
    html += past.length === 0
      ? `<div class="card"><div class="muted">Aucun historique.</div></div>`
      : `<div class="osteo-carousel">${past.slice(0, 8).map(x => renderOsteoSlotCard(x.slot, "done")).join("")}</div>`;
  }

  return html;
}

function renderOsteoManagerView() {
  let html = "";

  html += `<button class="btn add-btn-primary" id="toggle-add-osteo-slot">${window.__showAddOsteoSlot ? "− Fermer" : "+ Nouveau créneau"}</button>`;
  if (window.__showAddOsteoSlot) {
    const recurrent = !!window.__osteoSlotRecurrent;
    html += `<div class="add-form">
      <label class="field-label">Équipe concernée</label>
      <select id="osteo-slot-equipe">
        ${TEAMS.map(t => `<option value="${t}">${t}</option>`).join("")}
        <option value="Toutes">Toutes</option>
      </select>
      <label class="field-label">Date</label>
      ${dateSelectHtml("osteo-slot-date", "")}
      <label class="field-label">Heure</label>
      ${heureSelectHtml("osteo-slot-heure", "")}
      <label class="field-label">Lieu</label>
      <input id="osteo-slot-lieu" type="text" placeholder="Ex: ${DEFAULT_VENUE_NAME}" value="${DEFAULT_VENUE_NAME}" />
      <label style="display:flex; align-items:center; gap:8px; font-size:11px; color:#e4e8f2; font-weight:700; margin-top:10px;">
        <input type="checkbox" id="osteo-slot-recurrent" ${recurrent ? "checked" : ""} style="width:16px; height:16px;"/> Créneau récurrent (chaque semaine)
      </label>
      ${recurrent ? `<label class="field-label" style="margin-top:8px;">Nombre de semaines</label>
      <select id="osteo-slot-weeks">
        <option value="4">4 semaines</option>
        <option value="8" selected>8 semaines</option>
        <option value="12">12 semaines</option>
      </select>` : ""}
      <label style="display:flex; align-items:center; gap:8px; font-size:11px; color:#e4e8f2; font-weight:700; margin-top:10px;">
        <input type="checkbox" id="osteo-slot-actu" checked style="width:16px; height:16px;"/> Publier une actualité pour l'annoncer
      </label>
      <button class="btn" id="osteo-slot-submit" style="margin-top:10px;">Créer le créneau</button>
    </div>`;
  }

  const now = new Date();
  const upcoming = osteoSlots.filter(s => osteoSlotDate(s) >= now).sort((a, b) => osteoSlotDate(a) - osteoSlotDate(b));

  html += `<div class="section-h">Créneaux à venir</div>`;
  if (upcoming.length === 0) {
    html += `<div class="card"><div class="muted">Aucun créneau à venir.</div></div>`;
  } else {
    html += `<div class="osteo-carousel">`;
    upcoming.forEach(s => {
      const [id, date, heure, lieu, equipe] = s;
      const resa = osteoReservations.find(r => r[0] === id);
      const d = osteoSlotDate(s);
      const dateLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
      html += `<div class="osteo-card osteo-card-wide">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div class="osteo-tag ${resa ? "taken" : ""}">${escapeHtml(equipe)}</div>
            <div class="osteo-slot-date2">${dateLabel}</div>
            <div class="osteo-slot-meta2">${escapeHtml(heure)}${lieu ? "<br/>" + escapeHtml(lieu) : ""}</div>
          </div>
          <div class="osteo-tag ${resa ? 'taken' : ''}" style="margin-bottom:0;">${resa ? 'Pris' : 'Libre'}</div>
        </div>
        ${resa ? `
          <div class="muted" style="font-size:11px; margin:6px 0 8px;">Réservé par <span style="color:#fff; font-weight:700;">${escapeHtml(resa[1])}</span>${resa[2] ? " — Motif : " + escapeHtml(resa[2]) : ""}</div>
          ${window.__osteoReassignId === id ? renderOsteoReassignForm(id) : `<button type="button" class="osteo-manage-btn priority" data-osteo-reassign="${escapeHtml(id)}">Réassigner en priorité</button>`}
        ` : ""}
        <button type="button" class="osteo-manage-btn danger" style="margin-top:8px;" data-osteo-delete-slot="${escapeHtml(id)}">Supprimer ce créneau</button>
      </div>`;
    });
    html += `</div>`;
  }
  return html;
}

function renderOsteoReassignForm(slotId) {
  const allPlayers = comptes.slice(1).filter(c => rowHasRole(c, "Joueur")).map(c => c[0]);
  return `<div style="margin-top:8px;">
    <select id="osteo-reassign-select">
      ${allPlayers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
    </select>
    <label class="field-label">Message (envoyé par mail à la personne)</label>
    <textarea id="osteo-reassign-message" rows="3" placeholder="Ex: J'ai besoin de te voir en priorité avant le match, merci de venir à ce créneau."></textarea>
    <div class="row-flex" style="margin-top:6px;">
      <button class="btn secondary" style="flex:1;" data-osteo-reassign-cancel="1">Retour</button>
      <button class="btn" style="flex:1;" data-osteo-reassign-confirm="${escapeHtml(slotId)}">Confirmer la réassignation</button>
    </div>
  </div>`;
}

// ===================== ACTIONS API =====================

async function reserveOsteoSlotApi(slotId, motif) {
  osteoReservations.push([slotId, session.nom, motif]); // optimiste
  window.__osteoReserveSlotId = null;
  render();
  try {
    const params = new URLSearchParams({ action: "reserveOsteoSlot", slotId, motif, authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) { await fetchAll(); if (data.error === "already_taken") alert("Ce créneau vient d'être réservé par quelqu'un d'autre."); }
  } catch (err) { isOnline = false; render(); }
}

async function cancelOsteoReservationApi(slotId) {
  osteoReservations = osteoReservations.filter(r => !(r[0] === slotId && r[1] === session.nom)); // optimiste
  render();
  try {
    const params = new URLSearchParams({ action: "cancelOsteoReservation", slotId, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
  } catch (err) { isOnline = false; render(); }
}

async function addOsteoSlotApi(payload) {
  window.__showAddOsteoSlot = false;
  window.__osteoSlotRecurrent = false;
  render();
  try {
    const params = new URLSearchParams({ action: "addOsteoSlot", authNom: session.nom, authCode: session.code, ...payload });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function reassignOsteoSlotApi(slotId, newNom, message) {
  window.__osteoReassignId = null;
  render();
  try {
    const params = new URLSearchParams({ action: "reassignOsteoSlotPriority", slotId, newNom, message, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function deleteOsteoSlotApi(slotId) {
  osteoSlots = osteoSlots.filter(s => s[0] !== slotId); // optimiste
  render();
  try {
    const params = new URLSearchParams({ action: "deleteOsteoSlot", slotId, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
  } catch (err) { isOnline = false; render(); }
}

function attachOsteoEvents() {
  document.querySelectorAll("[data-osteo-tab]").forEach(el => {
    el.onclick = () => { vibrate(); window.__osteoTab = el.dataset.osteoTab; window.__osteoReserveSlotId = null; render(); };
  });

  document.querySelectorAll("[data-osteo-reserve]").forEach(el => {
    el.onclick = () => {
      vibrate();
      currentPage = "osteo";
      window.__osteoTab = "dispo";
      window.__osteoReserveSlotId = el.dataset.osteoReserve;
      render();
    };
  });

  document.querySelectorAll("[data-goto-osteo-tab]").forEach(el => {
    el.onclick = () => {
      vibrate();
      currentPage = "osteo";
      window.__osteoTab = el.dataset.gotoOsteoTab;
      render();
    };
  });

  const osteoConfirmReserve = document.getElementById("osteo-confirm-reserve");
  if (osteoConfirmReserve) osteoConfirmReserve.onclick = () => {
    const motif = (document.getElementById("osteo-motif").value || "").trim();
    vibrate();
    reserveOsteoSlotApi(window.__osteoReserveSlotId, motif);
  };

  document.querySelectorAll("[data-osteo-cancel]").forEach(el => {
    el.onclick = () => { vibrate(); cancelOsteoReservationApi(el.dataset.osteoCancel); };
  });

  const toggleAddOsteoSlot = document.getElementById("toggle-add-osteo-slot");
  if (toggleAddOsteoSlot) toggleAddOsteoSlot.onclick = () => {
    vibrate();
    window.__showAddOsteoSlot = !window.__showAddOsteoSlot;
    render();
  };

  const osteoSlotRecurrent = document.getElementById("osteo-slot-recurrent");
  if (osteoSlotRecurrent) osteoSlotRecurrent.onchange = (e) => {
    window.__osteoSlotRecurrent = e.target.checked;
    render();
  };

  const osteoSlotSubmit = document.getElementById("osteo-slot-submit");
  if (osteoSlotSubmit) osteoSlotSubmit.onclick = () => {
    const date = readDateSelect("osteo-slot-date");
    const heure = readHeureSelect("osteo-slot-heure");
    const lieu = document.getElementById("osteo-slot-lieu").value;
    const equipe = document.getElementById("osteo-slot-equipe").value;
    if (!date || !heure) { alert("Merci de renseigner au moins la date et l'heure."); return; }
    const weeksEl = document.getElementById("osteo-slot-weeks");
    const semaines = (window.__osteoSlotRecurrent && weeksEl) ? weeksEl.value : "1";
    const actuEl = document.getElementById("osteo-slot-actu");
    const publierActualite = (actuEl && actuEl.checked) ? "1" : "0";
    vibrate();
    addOsteoSlotApi({ date, heure, lieu, equipe, semaines, publierActualite });
  };

  document.querySelectorAll("[data-osteo-reassign]").forEach(el => {
    el.onclick = () => { vibrate(); window.__osteoReassignId = el.dataset.osteoReassign; render(); };
  });

  document.querySelectorAll("[data-osteo-reassign-cancel]").forEach(el => {
    el.onclick = () => { vibrate(); window.__osteoReassignId = null; render(); };
  });

  document.querySelectorAll("[data-osteo-reassign-confirm]").forEach(el => {
    el.onclick = () => {
      const slotId = el.dataset.osteoReassignConfirm;
      const select = document.getElementById("osteo-reassign-select");
      const newNom = select ? select.value : "";
      const messageEl = document.getElementById("osteo-reassign-message");
      const message = messageEl ? messageEl.value.trim() : "";
      if (!newNom) return;
      vibrate();
      reassignOsteoSlotApi(slotId, newNom, message);
    };
  });

  document.querySelectorAll("[data-osteo-delete-slot]").forEach(el => {
    el.onclick = () => {
      if (!confirm("Supprimer ce créneau ?")) return;
      vibrate();
      deleteOsteoSlotApi(el.dataset.osteoDeleteSlot);
    };
  });
}
