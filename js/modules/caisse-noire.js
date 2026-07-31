// ===================================================================
// CAISSE NOIRE — barème de sanctions par joueur (feuille "Grid").
// Module optionnel : réservé à la SM1 dans ce club (voir getTabsForRole
// dans core/render.js), à retirer avec sa condition pour un autre club.
// ===================================================================

// Barème du retard, calculé à la minute — le résultat est ajouté directement au compteur
// (dont la valeur unitaire vaut 1, donc le compteur = le montant cumulé en euros).
// Barème progressif par palier (comme un barème d'impôt) : chaque tranche de minutes a son
// propre taux, appliqué uniquement aux minutes DANS cette tranche, en s'additionnant aux
// tranches précédentes déjà comptées. Ex (entraînement) : 6 min = 4€ (palier 2-5) + 2€ (1 min
// à 2€/min dans le palier 6-10) = 6€. Barème propre à ce club — à adapter librement.
function calculRetard(minutes, estMatch) {
  const m = Math.max(0, parseInt(minutes, 10) || 0);
  if (m <= 1) return 0;
  const base = estMatch ? 2 : 1;
  let total = 0;
  const tierA = Math.max(0, Math.min(m, 5) - 1); // minutes dans la tranche 2-5, taux simple
  total += tierA * base;
  if (m >= 6) {
    const tierB = Math.min(m, 10) - 5; // minutes dans la tranche 6-10, taux double
    total += tierB * base * 2;
  }
  if (m >= 11) {
    const tierC = m - 10; // minutes dans la tranche 11+, taux triple
    total += tierC * base * 3;
  }
  return total;
}

function playerTotal(p) {
  let total = 0;
  ACTIONS.forEach((a, i) => { total += (grid[p] && grid[p][i] || 0) * a[1]; });
  return total;
}

function actionRowTotal(i) {
  let total = 0;
  PLAYERS.forEach(p => { total += (grid[p] && grid[p][i] || 0) * ACTIONS[i][1]; });
  return total;
}

function grandTotal() {
  let total = 0;
  PLAYERS.forEach(p => { total += playerTotal(p); });
  return total;
}

function totalPaye(joueur) {
  return paiements.filter(r => r[1] === joueur).reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);
}

function resteAPayer(joueur) {
  return playerTotal(joueur) - totalPaye(joueur);
}

async function writeCell(player, actionIndex, value) {
  grid[player][actionIndex] = value;
  render();
  const playerIndex = PLAYERS.indexOf(player);
  const row = parseInt(actionIndex, 10) + 2;
  const col = playerIndex + 3;
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=set&row=${row}&col=${col}&value=${value}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    const data = await res.json();
    showToast(data.ok ? "Ajout réussi" : "Échec de l'ajout", data.ok ? "success" : "error");
    isOnline = true; // la requête a bien atteint le serveur, qu'elle ait réussi ou non côté métier
  } catch (err) { isOnline = false; showToast("Échec de l'ajout", "error"); }
  render();
}

function renderQuickAddSheet() {
  if (!window.__showQuickAdd) return "";
  const target = window.__qaPlayer || (PLAYERS.includes(session.nom) ? session.nom : PLAYERS[0]);
  const actionIdx = window.__qaAction != null ? window.__qaAction : 0;
  const actionLabel = ACTIONS[actionIdx] ? ACTIONS[actionIdx][0] : "";
  const isRetard = actionLabel === "Retard entraînement" || actionLabel === "Retard match";
  const qty = window.__qaQty || 1;

  let quantityBlock;
  if (isRetard) {
    const minutes = window.__qaMinutes || 0;
    const montant = calculRetard(minutes, actionLabel === "Retard match");
    quantityBlock = `
      <label class="field-label">Minutes de retard</label>
      <input type="number" min="0" id="qa-minutes" value="${minutes}" />
      <div class="muted" style="font-size:11px; margin-top:6px;">Montant calculé automatiquement : <span style="color:#fff; font-weight:800;">${fmt(montant)} €</span></div>
    `;
  } else {
    quantityBlock = `<label class="field-label">Nombre</label>
    <div class="qty-stepper">
      <button type="button" class="qty-btn" data-qty-delta="-1">−</button>
      <div class="qty-value">${qty}</div>
      <button type="button" class="qty-btn" data-qty-delta="1">+</button>
    </div>`;
  }

  const bodyHtml = `
    <label class="field-label">Joueur</label>
    <select id="qa-player">
      ${PLAYERS.map(p => `<option value="${p}" ${p === target ? "selected" : ""}>${p}</option>`).join("")}
    </select>
    <label class="field-label">Action</label>
    <select id="qa-action">
      ${ACTIONS.map((a, i) => `<option value="${i}" ${i == actionIdx ? "selected" : ""}>${a[0]}${isRetard && i == actionIdx ? "" : ` (${fmt(a[1])} €)`}</option>`).join("")}
    </select>
    ${quantityBlock}
    <button class="btn" id="qa-submit" style="margin-top:12px;">Ajouter</button>`;

  return `<div class="sheet-overlay open" data-close-sheet="showQuickAdd">
    <div class="sheet-scrim" data-close-sheet="showQuickAdd"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="showQuickAdd">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Caisse noire</div>
        <h2>Saisir une action</h2>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

function renderCaisseNoireSummary() {
  const sortedPlayers = [...PLAYERS].sort((a, b) => playerTotal(b) - playerTotal(a));
  const TOP_COUNT = 5;
  const showAll = !!window.__showAllPlayers;
  const visiblePlayers = showAll ? sortedPlayers : sortedPlayers.slice(0, TOP_COUNT);
  const hasMore = sortedPlayers.length > TOP_COUNT;
  const expanded = window.__expandedPlayers || {};

  let html = `<div class="page-title">Caisse noire</div><div class="page-sub">Total et détail des actions de chaque joueur.</div>`;

  const totalPayeEquipe = paiements.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);
  const resteEquipe = grandTotal() - totalPayeEquipe;

  html += `<div class="cn-hero">
    <div class="cn-hero-label">Total équipe</div>
    <div class="cn-hero-value">${fmt(grandTotal())} €</div>
    <div class="cn-hero-sub">${fmt(totalPayeEquipe)} € déjà payé · ${fmt(resteEquipe)} € restant</div>
  </div>`;

  html += `<button class="btn add-btn-primary" id="cn-add-action">+ Saisir une action</button>`;

  const isAdmin = hasRole("Admin");
  const FROZEN_ACTIONS = ["participation mensuelle"];

  const renderPlayerCard = (p) => {
    const total = playerTotal(p);
    const items = [];
    ACTIONS.forEach((a, i) => {
      const count = (grid[p] && grid[p][i]) || 0;
      if (count > 0) items.push({ label: a[0], count, value: count * a[1], index: i, frozen: FROZEN_ACTIONS.includes(a[0]) });
    });
    const isExpanded = !!expanded[p];
    const visibleItems = isExpanded ? items : items.slice(0, 3);
    const hiddenCount = items.length - visibleItems.length;
    const editingThis = isAdmin && window.__cnEditPlayer === p;

    let bubbles = visibleItems.map(it => {
      const isRetard = it.label === "Retard entraînement" || it.label === "Retard match";
      return isRetard
        ? `<span class="cn-bubble">${it.label} <span class="cn-bubble-val">${fmt(it.value)}€</span></span>`
        : `<span class="cn-bubble">${it.label} ×${it.count} <span class="cn-bubble-val">${fmt(it.value)}€</span></span>`;
    }).join("");
    if (hiddenCount > 0) {
      bubbles += `<span class="cn-bubble cn-bubble-more" data-expand-player="${p}">+${hiddenCount} autre${hiddenCount > 1 ? "s" : ""}</span>`;
    } else if (isExpanded && items.length > 3) {
      bubbles += `<span class="cn-bubble cn-bubble-more" data-collapse-player="${p}">Réduire</span>`;
    }

    const payePlayer = totalPaye(p);
    const restePlayer = total - payePlayer;
    return `<div class="card cn-card">
      <div class="cn-row">
        <div class="cn-avatar">${getInitials(p)}</div>
        <div class="cn-info">
          <div class="cn-name-row">
            <span class="cn-name">${p}</span>
            <span class="cn-amount">${fmt(total)} €</span>
          </div>
          <div class="cn-hero-sub" style="margin-bottom:6px;">${fmt(payePlayer)} € déjà payé · ${fmt(restePlayer)} € restant</div>
          ${items.length ? `<div class="cn-bubbles">${bubbles}</div>` : `<div class="cn-actions muted">Aucune action enregistrée</div>`}
          ${isAdmin && items.length > 0 ? `<div class="justif-edit-btn cn-modifier-btn" data-cn-toggle-edit="${p}">${editingThis ? "Fermer" : "Modifier"}</div>` : ""}
        </div>
      </div>
    </div>`;
  };

  if (sortedPlayers.length === 0) {
    html += `<div class="card"><div class="muted">Aucun joueur pour le moment.</div></div>`;
  } else {
    visiblePlayers.forEach(p => { html += renderPlayerCard(p); });
    if (hasMore) {
      html += `<div class="expand-toggle" data-toggle-players="1">${showAll ? "Réduire ▲" : "Voir les autres joueurs ▾"}</div>`;
    }
  }

  if (isAdmin) {
    html += `<div class="cn-toggle-detail" id="cn-toggle-detail">${window.__showDetailTable ? "Masquer le tableau détaillé ▲" : "Voir le tableau détaillé ▾"}</div>`;

    if (window.__showDetailTable) {
      html += renderDetailTable();
    }
  }

  if (isAdmin && window.__cnEditPlayer) {
    html += renderCaisseNoireEditSheet();
  }

  html += renderQuickAddSheet();

  return html;
}

function renderCaisseNoireEditSheet() {
  const p = window.__cnEditPlayer;
  if (!p) return "";
  const FROZEN_ACTIONS = ["participation mensuelle"];
  const total = playerTotal(p);
  const payePlayer = totalPaye(p);
  const restePlayer = total - payePlayer;
  const items = [];
  ACTIONS.forEach((a, i) => {
    const count = (grid[p] && grid[p][i]) || 0;
    if (count > 0) items.push({ label: a[0], count, value: count * a[1], index: i, frozen: FROZEN_ACTIONS.includes(a[0]) });
  });
  const editableItems = items.filter(it => !it.frozen);

  let bodyHtml;
  if (window.__cnEditActionIndex === null || window.__cnEditActionIndex === undefined) {
    bodyHtml = editableItems.length === 0
      ? `<div class="muted" style="font-size:13px;">Aucune action modifiable pour ce joueur.</div>`
      : editableItems.map(it => `<div class="cn-edit-pick-row" data-cn-pick-action="${it.index}" data-cn-pick-player="${p}">
          <span>${it.label} ×${it.count}</span><span class="cn-bubble-val">${fmt(it.value)}€</span>
        </div>`).join("");
  } else {
    const idx = window.__cnEditActionIndex;
    const currentCount = (grid[p] && grid[p][idx]) || 0;
    const qty = window.__cnEditQty !== null && window.__cnEditQty !== undefined ? window.__cnEditQty : currentCount;
    bodyHtml = `<div class="field-label">${ACTIONS[idx][0]}</div>
      <div class="qty-stepper">
        <button type="button" class="qty-btn" data-cn-edit-delta="-1">−</button>
        <div class="qty-value">${qty}</div>
        <button type="button" class="qty-btn" data-cn-edit-delta="1">+</button>
      </div>
      <div class="row-flex" style="margin-top:12px;">
        <button class="btn" style="flex:1;" data-cn-edit-save="${idx}" data-cn-edit-save-player="${p}">Enregistrer</button>
        <button class="btn secondary" style="flex:1;" data-cn-edit-cancel="1">Annuler</button>
      </div>`;
  }

  return `<div class="sheet-overlay open" data-cn-edit-cancel="1">
    <div class="sheet-scrim" data-cn-edit-cancel="1"></div>
    <div class="sheet">
      <div class="sheet-close" data-cn-edit-cancel="1">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Modifier</div>
        <h2>${escapeHtml(p)}</h2>
        <p>${fmt(total)} € · ${fmt(payePlayer)} € déjà payé · ${fmt(restePlayer)} € restant</p>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

function renderDetailTable() {
  let html = `<div class="row-flex" style="margin-top:10px;">
    <button class="btn secondary" id="export-csv">Exporter CSV</button>
  </div>`;
  html += `<div class="table-wrap"><table>
    <thead><tr>
      <th class="action-name">Action</th>
      <th>Val.</th>
      ${PLAYERS.map(p => `<th>${p}</th>`).join("")}
      <th>Total</th>
    </tr></thead><tbody>`;

  ACTIONS.forEach((a, i) => {
    const rowTotal = actionRowTotal(i);
    html += `<tr>
      <td class="action-name">${a[0]}</td>
      <td>${fmt(a[1])}€</td>
      ${PLAYERS.map(p => {
        const count = (grid[p] && grid[p][i]) || 0;
        const cellValue = count * a[1];
        return `<td>
          <select data-player="${p}" data-action="${i}" class="cell-select" style="width:54px; padding:3px; font-size:11px;">
            ${Array.from({length: 51}, (_, v) => `<option value="${v}" ${count === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
          <div class="cell-euro">${fmt(cellValue)}€</div>
        </td>`;
      }).join("")}
      <td>${fmt(rowTotal)}€</td>
    </tr>`;
  });

  html += `<tr class="total-row">
    <td class="action-name">TOTAL</td>
    <td></td>
    ${PLAYERS.map(p => `<td>${fmt(playerTotal(p))}€</td>`).join("")}
    <td>${fmt(grandTotal())}€</td>
  </tr>`;

  html += `</tbody></table></div>`;
  return html;
}

const BOM_UTF8 = "﻿"; // force Excel à détecter l'UTF-8 (sinon les accents s'affichent mal)

function exportCSV() {
  let rows = [["Action", "Valeur (€)", ...PLAYERS, "TOTAL Action (€)"]];
  ACTIONS.forEach((a, i) => {
    rows.push([a[0], a[1], ...PLAYERS.map(p => (grid[p] && grid[p][i]) || 0), actionRowTotal(i)]);
  });
  rows.push(["TOTAL Joueur (€)", "", ...PLAYERS.map(p => playerTotal(p)), grandTotal()]);
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob([BOM_UTF8 + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "caisse_noire_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function attachCaisseNoireEvents() {
  document.querySelectorAll(".cell-select").forEach(sel => {
    sel.onchange = (e) => {
      const p = e.target.dataset.player;
      const i = e.target.dataset.action;
      writeCell(p, i, parseInt(e.target.value, 10));
    };
  });

  const exportBtn = document.getElementById("export-csv");
  if (exportBtn) exportBtn.onclick = exportCSV;

  const cnAddBtn = document.getElementById("cn-add-action");
  if (cnAddBtn) cnAddBtn.onclick = () => {
    vibrate();
    const opening = !window.__showQuickAdd;
    window.__showQuickAdd = opening;
    if (opening) {
      window.__qaQty = 1;
    }
    render();
  };

  document.querySelectorAll("[data-qty-delta]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const delta = parseInt(el.dataset.qtyDelta, 10);
      const current = window.__qaQty || 1;
      window.__qaQty = Math.min(50, Math.max(1, current + delta));
      render();
    };
  });

  const qaActionSelect = document.getElementById("qa-action");
  if (qaActionSelect) qaActionSelect.onchange = (e) => {
    window.__qaAction = parseInt(e.target.value, 10);
    render();
  };

  const qaMinutesInput = document.getElementById("qa-minutes");
  if (qaMinutesInput) qaMinutesInput.oninput = (e) => {
    window.__qaMinutes = parseInt(e.target.value, 10) || 0;
    // Pas de render() ici : on ne redessine pas à chaque frappe (ça casserait le clavier
    // mobile) — seul le montant affiché en dessous a besoin d'être mis à jour, en direct.
    const actionIdx = window.__qaAction != null ? window.__qaAction : 0;
    const actionLabel = ACTIONS[actionIdx] ? ACTIONS[actionIdx][0] : "";
    const montant = calculRetard(window.__qaMinutes, actionLabel === "Retard match");
    const preview = qaMinutesInput.parentElement.querySelector(".muted span");
    if (preview) preview.textContent = fmt(montant) + " €";
  };

  const qaSubmit = document.getElementById("qa-submit");
  if (qaSubmit) qaSubmit.onclick = () => {
    const player = document.getElementById("qa-player").value;
    const actionIdx = parseInt(document.getElementById("qa-action").value, 10);
    const actionLabel = ACTIONS[actionIdx] ? ACTIONS[actionIdx][0] : "";
    const isRetard = actionLabel === "Retard entraînement" || actionLabel === "Retard match";
    const qty = isRetard ? calculRetard(window.__qaMinutes || 0, actionLabel === "Retard match") : (window.__qaQty || 1);
    window.__qaPlayer = player;
    window.__qaAction = actionIdx;
    const current = (grid[player] && grid[player][actionIdx]) || 0;
    window.__showQuickAdd = false;
    window.__qaMinutes = 0;
    writeCell(player, actionIdx, current + qty);
  };

  const cnToggleDetail = document.getElementById("cn-toggle-detail");
  if (cnToggleDetail) cnToggleDetail.onclick = () => {
    window.__showDetailTable = !window.__showDetailTable;
    render();
  };

  document.querySelectorAll("[data-toggle-players]").forEach(el => {
    el.onclick = () => {
      window.__showAllPlayers = !window.__showAllPlayers;
      render();
    };
  });

  document.querySelectorAll("[data-expand-player]").forEach(el => {
    el.onclick = () => {
      window.__expandedPlayers = window.__expandedPlayers || {};
      window.__expandedPlayers[el.dataset.expandPlayer] = true;
      render();
    };
  });

  document.querySelectorAll("[data-collapse-player]").forEach(el => {
    el.onclick = () => {
      window.__expandedPlayers = window.__expandedPlayers || {};
      window.__expandedPlayers[el.dataset.collapsePlayer] = false;
      render();
    };
  });

  document.querySelectorAll("[data-cn-toggle-edit]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const p = el.dataset.cnToggleEdit;
      window.__cnEditPlayer = window.__cnEditPlayer === p ? null : p;
      window.__cnEditActionIndex = null;
      window.__cnEditQty = null;
      render();
    };
  });

  document.querySelectorAll("[data-cn-pick-action]").forEach(el => {
    el.onclick = () => {
      window.__cnEditActionIndex = parseInt(el.dataset.cnPickAction, 10);
      window.__cnEditQty = null;
      render();
    };
  });

  document.querySelectorAll("[data-cn-edit-cancel]").forEach(el => {
    el.onclick = (e) => {
      if (e.target !== e.currentTarget) return;
      const overlay = el.closest(".sheet-overlay");
      const doClose = () => {
        window.__cnEditPlayer = null;
        window.__cnEditActionIndex = null;
        window.__cnEditQty = null;
        render();
      };
      if (overlay) closeSheetAnimated(overlay, doClose); else doClose();
    };
  });

  document.querySelectorAll("[data-cn-edit-delta]").forEach(el => {
    el.onclick = () => {
      const idx = window.__cnEditActionIndex;
      const player = window.__cnEditPlayer;
      const current = window.__cnEditQty !== null && window.__cnEditQty !== undefined
        ? window.__cnEditQty
        : ((grid[player] && grid[player][idx]) || 0);
      const delta = parseInt(el.dataset.cnEditDelta, 10);
      window.__cnEditQty = Math.max(0, current + delta);
      render();
    };
  });

  document.querySelectorAll("[data-cn-edit-save]").forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.cnEditSave, 10);
      const player = el.dataset.cnEditSavePlayer;
      const qty = window.__cnEditQty !== null && window.__cnEditQty !== undefined
        ? window.__cnEditQty
        : ((grid[player] && grid[player][idx]) || 0);
      window.__cnEditPlayer = null;
      window.__cnEditActionIndex = null;
      window.__cnEditQty = null;
      writeCell(player, idx, qty);
    };
  });
}
