// ===================================================================
// COMPOSITION D'ÉQUIPE — placement glisser-déposer des joueurs U17 sur
// le terrain (feuille "Compositions" côté backend, voir apps-script/
// Compositions.gs). Édition réservée à Coach/Admin ; vue lecture seule
// pour joueurs/parents une fois publiée (voir compositionIsPublished).
//
// Le drag-and-drop ne passe JAMAIS par render() pendant le geste (ça
// détruirait l'élément en cours de glissement, vu que render() reconstruit
// #app.innerHTML en entier) : un fantôme est posé directement sur
// document.body et suivi à la souris/au doigt via des styles manipulés
// à la main, jusqu'au relâchement — seul le résultat final déclenche un
// render() classique via l'appel API. window.__compositionDragActive
// bloque aussi le rafraîchissement périodique (fetchAll toutes les 10s)
// pendant le geste, voir isFormOpen() dans state.js.
// ===================================================================

// Zone libre (placement défensif) : un joueur déjà sur un poste fixe (terrain ou banc) peut en
// plus être placé n'importe où dans cette zone, pour avoir à la fois son poste offensif et son
// poste défensif affichés — voir api_setCompositionFreePos (Compositions.gs) qui l'exige déjà.
const COMPOSITION_FREE_ZONE_ENABLED = true;

const COMPOSITION_FIELD_SLOTS = ["GB", "AiG", "AiD", "PV", "ArG", "ArD", "DC"];
const COMPOSITION_BENCH_SLOTS = ["Banc1", "Banc2", "Banc3", "Banc4", "Banc5"];
const COMPOSITION_ALL_SLOTS = [...COMPOSITION_FIELD_SLOTS, ...COMPOSITION_BENCH_SLOTS];
// Position en % (left, top) dans le cadre du terrain — calées sur les lignes réelles du terrain
// (ligne des 6m pour ailiers/pivot, ligne des 9m pour la ligne arrière, cage pour le gardien).
const COMPOSITION_SLOT_POS = {
  GB: [50, 7.5], AiG: [8.75, 6.7], AiD: [91.25, 6.7],
  PV: [50, 28.3], ArG: [13, 35.8], ArD: [87, 35.8], DC: [49.5, 42],
};
const COMPOSITION_SLOT_LABELS = {
  GB: "GB", AiG: "AiG", AiD: "AiD", PV: "PV", ArG: "ArG", ArD: "ArD", DC: "DC",
};

function compositionRoster() {
  return rosterForEquipe("U17");
}

function compositionSlotsFor(matchId) {
  const map = {};
  compositions.forEach(r => { if (r[0] === matchId && COMPOSITION_ALL_SLOTS.includes(r[2])) map[r[2]] = r[1]; });
  return map;
}

function compositionFreePosFor(matchId) {
  return compositions.filter(r => r[0] === matchId && r[2] === "Libre")
    .map(r => ({ nom: r[1], x: parseFloat(r[3]) || 0, y: parseFloat(r[4]) || 0 }));
}

function compositionIsPublished(matchId) {
  const row = compositionsMeta.find(r => r[0] === matchId);
  return !!(row && row[1] === "1");
}

// Un joueur qui a répondu Présent mais n'a été retenu sur aucun des 12 postes une fois la
// composition publiée voit un badge verrouillé "Non sélectionné" à la place du toggle
// Présent/Absent habituel — voir renderEventCard (agenda.js).
function compositionNonSelected(ev, nom) {
  if (eventEquipe(ev) !== "U17" || typeClass(ev[3]) !== "match") return false;
  const matchId = ev[0];
  if (!compositionIsPublished(matchId)) return false;
  if (presenceEvenements[`${matchId}_${nom}`] !== "Oui") return false;
  const slots = compositionSlotsFor(matchId);
  return !Object.values(slots).includes(nom);
}

function compositionPlayerAvatar(nom, cls) {
  const row = findCompteRow(nom);
  const photo = row ? row[5] : "";
  return photo
    ? `<img src="${escapeHtml(photo)}" class="${cls}" alt="${escapeHtml(nom)}"/>`
    : `<div class="${cls} composition-initials">${getInitials(nom)}</div>`;
}

// ===================== BOUTONS SUR LA CARTE MATCH =====================

// À appeler depuis renderEventCard (agenda.js) pour un événement de type Match. Coach/Admin
// voient toujours le bouton d'édition ; joueurs/parents ne voient un bouton (lecture seule) que
// si le coach a explicitement publié la composition.
function renderCompositionCardButtons(ev) {
  if (eventEquipe(ev) !== "U17" || typeClass(ev[3]) !== "match") return "";
  const matchId = ev[0];
  const canManage = hasRole("Coach") || hasRole("Admin");
  const published = compositionIsPublished(matchId);
  let html = "";
  if (canManage) {
    html += `<button type="button" class="composition-card-btn" data-open-composition="${escapeHtml(matchId)}">🧩 Composition</button>`;
  } else if (published) {
    html += `<button type="button" class="composition-card-btn view" data-open-composition-view="${escapeHtml(matchId)}">🧩 Voir la composition</button>`;
  }
  return html;
}

// ===================== ÉDITEUR (COACH/ADMIN) =====================

function renderCompositionSlotEl(matchId, code, nom, isBench) {
  const [left, top] = isBench ? [0, 0] : COMPOSITION_SLOT_POS[code];
  const style = isBench ? "" : `style="left:${left}%; top:${top}%;"`;
  const cls = isBench ? "composition-bench-slot" : "composition-slot";
  if (nom) {
    return `<div class="${cls} filled" ${style} data-comp-slot="${code}" data-comp-drag-nom="${escapeHtml(nom)}" data-comp-drag-from="${code}">
      ${compositionPlayerAvatar(nom, "composition-avatar-sm")}
    </div>`;
  }
  return `<div class="${cls} empty" ${style} data-comp-slot="${code}">
    ${isBench ? "" : `<span class="composition-slot-label">${COMPOSITION_SLOT_LABELS[code]}</span>`}
  </div>`;
}

function renderCompositionCourt(matchId, readonly) {
  const slots = compositionSlotsFor(matchId);
  const fieldHtml = COMPOSITION_FIELD_SLOTS.map(code => renderCompositionSlotEl(matchId, code, slots[code], false)).join("");

  let freeZoneHtml = "";
  if (COMPOSITION_FREE_ZONE_ENABLED) {
    const freeTokens = compositionFreePosFor(matchId).map(f => `<div class="composition-free-token" style="left:${f.x}%; top:${f.y}%;" ${readonly ? "" : `data-comp-drag-nom="${escapeHtml(f.nom)}" data-comp-drag-from="Libre"`}>
      ${compositionPlayerAvatar(f.nom, "composition-avatar-sm")}
    </div>`).join("");
    freeZoneHtml = `<div class="composition-free-zone" ${readonly ? "" : 'data-comp-free-zone="1"'}>${freeTokens}</div>`;
  }

  return `<div class="composition-court-wrap">
    <svg viewBox="0 0 400 600" class="composition-court-svg">
      <rect x="20" y="20" width="360" height="560" fill="none" stroke="#0c0e16" stroke-width="4"/>
      <line x1="20" y1="300" x2="380" y2="300" stroke="#0c0e16" stroke-width="4"/>
      <rect x="170" y="8" width="60" height="12" fill="none" stroke="#0c0e16" stroke-width="3"/>
      <path d="M 60 20 A 140 140 0 0 0 340 20" fill="none" stroke="#0c0e16" stroke-width="3"/>
      <path d="M 20 70 A 190 190 0 0 0 380 70" fill="none" stroke="#0c0e16" stroke-width="2.5" stroke-dasharray="9 7"/>
      <rect x="170" y="580" width="60" height="12" fill="none" stroke="#0c0e16" stroke-width="3"/>
      <path d="M 60 580 A 140 140 0 0 1 340 580" fill="none" stroke="#0c0e16" stroke-width="3"/>
      <path d="M 20 530 A 190 190 0 0 1 380 530" fill="none" stroke="#0c0e16" stroke-width="2.5" stroke-dasharray="9 7"/>
    </svg>
    ${fieldHtml}
    ${freeZoneHtml}
  </div>`;
}

function renderCompositionEditor(matchId) {
  const ev = evenements.find(e => e[0] === matchId);
  if (!ev) return "";
  const slots = compositionSlotsFor(matchId);
  const roster = compositionRoster();
  const placedNoms = new Set(Object.values(slots));
  const occupiedCount = Object.keys(slots).length;
  const published = compositionIsPublished(matchId);

  const present = roster.filter(p => presenceEvenements[`${matchId}_${p}`] === "Oui" && !placedNoms.has(p));
  const others = roster.filter(p => presenceEvenements[`${matchId}_${p}`] !== "Oui" && !placedNoms.has(p));

  const rosterRow = (p, greyed) => `<div class="composition-roster-item ${greyed ? "greyed" : ""}" data-comp-drag-nom="${escapeHtml(p)}" data-comp-drag-from="roster">
    ${compositionPlayerAvatar(p, "composition-avatar-sm")}
    <div class="composition-roster-name">${escapeHtml(p)}</div>
  </div>`;

  const benchHtml = COMPOSITION_BENCH_SLOTS.map(code => renderCompositionSlotEl(matchId, code, slots[code], true)).join("");

  return `<div class="modal-overlay composition-overlay">
    <div class="modal-header">
      <div class="modal-close" id="composition-close">✕</div>
      <div class="modal-title">Composition ${escapeHtml(ev[4] || "U17")}</div>
      <div class="composition-cap">${occupiedCount} / 12 places</div>
    </div>
    <div class="composition-body">
      <div class="composition-court-col">
        ${renderCompositionCourt(matchId, false)}
        <div class="composition-bench-row">
          <div class="composition-col-label">Banc (5)</div>
          <div class="composition-bench-row-slots">${benchHtml}</div>
        </div>
      </div>
      <div class="composition-roster-col" data-comp-roster-drop="1">
        <div class="composition-col-label">Présents</div>
        ${present.length === 0 ? `<div class="muted composition-empty-note">Aucun joueur disponible.</div>` : present.map(p => rosterRow(p, false)).join("")}
        <div class="composition-col-label muted-label">Absents / pas répondu</div>
        ${others.map(p => rosterRow(p, true)).join("")}
      </div>
    </div>
    <div class="composition-footer" data-comp-roster-drop="1">
      <button class="btn secondary" id="composition-save">Enregistrer le brouillon</button>
      <button class="btn ${published ? "danger" : ""}" id="composition-publish-toggle" data-comp-published="${published ? "1" : "0"}">
        ${published ? "Masquer aux joueurs" : "Rendre visible aux joueurs"}
      </button>
    </div>
  </div>`;
}

// ===================== VUE LECTURE SEULE (JOUEURS/PARENTS) =====================

function renderCompositionPlayerView(matchId) {
  const ev = evenements.find(e => e[0] === matchId);
  if (!ev) return "";
  const slots = compositionSlotsFor(matchId);
  const benchNoms = COMPOSITION_BENCH_SLOTS.map(c => slots[c]).filter(Boolean);

  return `<div class="modal-overlay composition-overlay">
    <div class="modal-header">
      <div class="modal-close" id="composition-view-close">✕</div>
      <div class="modal-title">Composition ${escapeHtml(ev[4] || "U17")}</div>
    </div>
    <div class="composition-body">
      <div class="composition-court-col">
        ${renderCompositionCourt(matchId, true)}
        ${benchNoms.length === 0 ? "" : `<div class="composition-bench-row">
          <div class="composition-col-label">Banc</div>
          <div class="composition-bench-row-slots">${benchNoms.map(nom => `<div class="composition-bench-slot filled readonly">${compositionPlayerAvatar(nom, "composition-avatar-sm")}</div>`).join("")}</div>
        </div>`}
      </div>
    </div>
  </div>`;
}

// ===================== ACTIONS API =====================

// Optimiste : applique tout de suite en local (l'avatar apparaît sans attendre le
// aller-retour réseau, souvent 2-6s sur Apps Script) — resynchronise via fetchAll()
// seulement si le serveur refuse, pour annuler proprement l'optimisme.
async function compositionSetSlotApi(matchId, nom, zone) {
  for (let i = compositions.length - 1; i >= 0; i--) {
    const r = compositions[i];
    if (r[0] !== matchId || !COMPOSITION_ALL_SLOTS.includes(r[2])) continue;
    if (r[1] === nom || (zone && r[2] === zone)) compositions.splice(i, 1);
  }
  if (zone) compositions.push([matchId, nom, zone, "", ""]);
  render();
  try {
    const params = new URLSearchParams({ action: "setCompositionSlot", matchId, nom, zone, authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) { showToast(data.error === "team_full" ? "Équipe complète" : "Échec de l'action", "error"); await fetchAll(); }
  } catch (err) { isOnline = false; showToast("Échec de l'action", "error"); await fetchAll(); }
}

async function compositionSetFreePosApi(matchId, nom, x, y) {
  for (let i = compositions.length - 1; i >= 0; i--) {
    const r = compositions[i];
    if (r[0] === matchId && r[1] === nom && r[2] === "Libre") compositions.splice(i, 1);
  }
  if (x !== "") compositions.push([matchId, nom, "Libre", String(x), String(y)]);
  render();
  try {
    const params = new URLSearchParams({ action: "setCompositionFreePos", matchId, nom, x: String(x), y: String(y), authNom: session.nom, authCode: session.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) { showToast("Échec de l'action", "error"); await fetchAll(); }
  } catch (err) { isOnline = false; showToast("Échec de l'action", "error"); await fetchAll(); }
}

async function compositionPublishApi(matchId, publie) {
  try {
    const params = new URLSearchParams({ action: "publishComposition", matchId, publie: publie ? "1" : "0", authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    showToast(publie ? "Composition visible aux joueurs" : "Composition masquée", "success");
    await fetchAll();
  } catch (err) { isOnline = false; showToast("Échec de l'action", "error"); render(); }
}

// ===================== GLISSER-DÉPOSER (pointer events) =====================

let compDragState = null;

function compositionOnDragStart(e) {
  const el = e.currentTarget;
  const nom = el.dataset.compDragNom;
  if (!nom) return;
  e.preventDefault();
  vibrate();
  const ghost = document.createElement("div");
  ghost.className = "composition-ghost";
  ghost.innerHTML = compositionPlayerAvatar(nom, "composition-avatar-md");
  document.body.appendChild(ghost);
  window.__compositionDragActive = true;
  compDragState = { nom, fromZone: el.dataset.compDragFrom || "" };
  compDragState.ghostEl = ghost;
  compositionMoveGhost(e.clientX, e.clientY);
  document.addEventListener("pointermove", compositionOnDragMove);
  document.addEventListener("pointerup", compositionOnDragEnd);
  document.addEventListener("pointercancel", compositionOnDragCancel);
}

function compositionMoveGhost(x, y) {
  if (!compDragState) return;
  compDragState.ghostEl.style.left = x + "px";
  compDragState.ghostEl.style.top = y + "px";
}

function compositionDropTargetAt(x, y) {
  compDragState.ghostEl.style.display = "none";
  const el = document.elementFromPoint(x, y);
  compDragState.ghostEl.style.display = "";
  if (!el) return null;
  return el.closest("[data-comp-slot], [data-comp-free-zone], [data-comp-roster-drop]");
}

function compositionOnDragMove(e) {
  if (!compDragState) return;
  compositionMoveGhost(e.clientX, e.clientY);
  document.querySelectorAll(".composition-drop-hover").forEach(el => el.classList.remove("composition-drop-hover"));
  const target = compositionDropTargetAt(e.clientX, e.clientY);
  if (target) target.classList.add("composition-drop-hover");
}

function compositionOnDragEnd(e) {
  if (!compDragState) return;
  const { nom, fromZone } = compDragState;
  const target = compositionDropTargetAt(e.clientX, e.clientY);
  const matchId = window.__compositionMatchId;
  compositionCleanupDrag();
  if (!target || !matchId) return;

  if (target.dataset.compSlot) {
    compositionSetSlotApi(matchId, nom, target.dataset.compSlot);
  } else if (target.dataset.compFreeZone) {
    const rect = target.getBoundingClientRect();
    const pctX = Math.min(98, Math.max(2, Math.round((e.clientX - rect.left) / rect.width * 100)));
    const pctY = Math.min(98, Math.max(2, Math.round((e.clientY - rect.top) / rect.height * 100)));
    compositionSetFreePosApi(matchId, nom, pctX, pctY);
  } else if (target.dataset.compRosterDrop) {
    if (fromZone === "Libre") compositionSetFreePosApi(matchId, nom, "", "");
    else if (fromZone && fromZone !== "roster") compositionSetSlotApi(matchId, nom, "");
  }
}

function compositionOnDragCancel() { compositionCleanupDrag(); }

function compositionCleanupDrag() {
  if (!compDragState) return;
  compDragState.ghostEl.remove();
  document.querySelectorAll(".composition-drop-hover").forEach(el => el.classList.remove("composition-drop-hover"));
  document.removeEventListener("pointermove", compositionOnDragMove);
  document.removeEventListener("pointerup", compositionOnDragEnd);
  document.removeEventListener("pointercancel", compositionOnDragCancel);
  window.__compositionDragActive = false;
  compDragState = null;
}

// ===================== ÉVÉNEMENTS =====================

function attachCompositionEvents() {
  document.querySelectorAll("[data-open-composition]").forEach(el => {
    el.onclick = () => { vibrate(); window.__compositionMatchId = el.dataset.openComposition; render(); };
  });
  document.querySelectorAll("[data-open-composition-view]").forEach(el => {
    el.onclick = () => { vibrate(); window.__compositionViewMatchId = el.dataset.openCompositionView; render(); };
  });

  const closeBtn = document.getElementById("composition-close");
  if (closeBtn) closeBtn.onclick = () => { window.__compositionMatchId = null; render(); };
  const viewCloseBtn = document.getElementById("composition-view-close");
  if (viewCloseBtn) viewCloseBtn.onclick = () => { window.__compositionViewMatchId = null; render(); };

  const saveBtn = document.getElementById("composition-save");
  if (saveBtn) saveBtn.onclick = () => { vibrate(); window.__compositionMatchId = null; render(); };

  const publishBtn = document.getElementById("composition-publish-toggle");
  if (publishBtn) publishBtn.onclick = () => {
    vibrate();
    const matchId = window.__compositionMatchId;
    const currentlyPublished = publishBtn.dataset.compPublished === "1";
    compositionPublishApi(matchId, !currentlyPublished);
  };

  document.querySelectorAll("[data-comp-drag-nom]").forEach(el => {
    el.addEventListener("pointerdown", compositionOnDragStart);
  });
}
