// ===================================================================
// PAIEMENTS — cotisations (feuille "Paiements"). Dépend de la Caisse
// noire (playerTotal/resteAPayer) pour la carte "cotisation restante".
// ===================================================================

function renderPaiementsPage() {
  const isPlayer = PLAYERS.map(p => p.trim()).includes((session.nom || "").trim());
  let html = `<div class="page-title">Paiements</div><div class="page-sub">${hasRole("Admin") ? "Suivi de la trésorerie." : "Ta cotisation."}</div>`;

  // Carte personnelle : visible pour toute personne présente dans la caisse noire, qu'elle
  // soit aussi Admin ou non — avant, un compte Admin+Joueur ne voyait jamais son propre bouton payer.
  if (isPlayer) {
    const reste = resteAPayer(session.nom);
    const dejaPaye = totalPaye(session.nom);
    html += `<div class="pay-summary">
      <div class="pay-summary-label">${reste > 0 ? "Ta cotisation restante" : "Cotisation à jour"}</div>
      <div class="pay-summary-val" style="color:${reste > 0 ? '#ffd166' : '#33d17a'};">${fmt(reste)} €</div>
      <div class="cn-hero-sub">${fmt(dejaPaye)} € déjà payé</div>
    </div>`;
    if (reste > 0) {
      if (PAYPAL_ME_USERNAME) {
        html += `<a href="https://paypal.me/${encodeURIComponent(PAYPAL_ME_USERNAME)}/${reste}" target="_blank" rel="noopener" class="btn" style="display:block; text-align:center; background:#ffc439; color:#003087; text-decoration:none; box-sizing:border-box;">Payer via PayPal</a>`;
      }
      html += `<button class="btn secondary" style="margin-top:10px;" id="notify-payment-btn" ${window.__paymentNotifySending ? "disabled" : ""}>${window.__paymentNotifySending ? "Envoi en cours..." : "✓ J'ai payé — prévenir l'Admin"}</button>`;
      if (window.__paymentNotifySent) {
        html += `<div class="muted" style="margin-top:8px; color:#33d17a; font-weight:700;">✓ L'Admin a été prévenu, merci !</div>`;
      }
    }
  }

  if (!hasRole("Admin")) return html;

  const totalDu = grandTotal();
  const totalPayeAll = paiements.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);
  const resteAEncaisser = totalDu - totalPayeAll;

  html += `<div class="pay-summary" style="margin-top:14px;">
    <div class="pay-summary-label">Reste à encaisser (équipe)</div>
    <div class="pay-summary-val">${fmt(resteAEncaisser)} €</div>
    <div class="pay-summary-sub">Sur ${fmt(totalDu)} € dus · ${fmt(totalPayeAll)} € reçus</div>
  </div>`;

  html += `<button class="btn add-btn-primary" id="toggle-add-paiement">+ Ajouter un paiement</button>`;

  html += `<div class="section-h">Reste à payer</div>`;
  const resteSorted = PLAYERS.slice().sort((a, b) => resteAPayer(b) - resteAPayer(a));
  const resteExpanded = !!window.__resteAPayerExpanded;
  const resteVisible = resteExpanded ? resteSorted : resteSorted.slice(0, 6);
  resteVisible.forEach(p => {
    const reste = resteAPayer(p);
    const color = reste > 0 ? "#ff5a5a" : "#33d17a";
    const payBtn = (reste > 0 && PAYPAL_ME_USERNAME)
      ? `<a href="https://paypal.me/${encodeURIComponent(PAYPAL_ME_USERNAME)}/${reste}" target="_blank" rel="noopener" class="paypal-pay-btn">Payer</a>`
      : "";
    html += `<div class="card cn-card">
      <div class="cn-row">
        <div class="cn-avatar">${getInitials(p)}</div>
        <div class="cn-info">
          <div class="cn-name-row">
            <span class="cn-name">${p}</span>
            <span class="cn-amount" style="color:${color};">${fmt(reste)} €</span>
          </div>
          ${payBtn ? `<div style="margin-top:8px;">${payBtn}</div>` : ""}
        </div>
      </div>
    </div>`;
  });
  if (resteSorted.length > 6) {
    html += `<div class="expand-toggle" data-toggle-reste-payer="1">${resteExpanded ? "Réduire ▲" : `Voir les ${resteSorted.length - 6} autres ▾`}</div>`;
  }

  html += `<div class="section-h">Derniers paiements</div>`;
  if (paiements.length === 0) {
    html += `<div class="card muted">Aucun paiement enregistré pour le moment.</div>`;
  } else {
    html += `<div class="card">`;
    paiements.slice().reverse().forEach(r => {
      const [id, joueur, montant, date, commentaire] = r;
      if (window.__editingPaiementId === id) {
        html += `<div class="paiement-row" style="display:block; padding:10px 0;">
          <select id="edit-joueur-${id}" style="margin-bottom:6px;">
            ${PLAYERS.map(p => `<option value="${p}" ${p === joueur ? "selected" : ""}>${p}</option>`).join("")}
          </select>
          <input id="edit-montant-${id}" type="number" step="0.5" value="${montant}" style="margin-bottom:6px;" />
          <input id="edit-commentaire-${id}" type="text" value="${commentaire || ""}" placeholder="Commentaire" style="margin-bottom:8px;" />
          <div class="row-flex">
            <button class="btn" style="flex:1;" data-save-paiement="${id}">Enregistrer</button>
            <button class="btn secondary" style="flex:1;" data-cancel-edit-paiement="1">Annuler</button>
          </div>
        </div>`;
      } else {
        html += `<div class="paiement-row">
          <div>${joueur} ${commentaire ? `<span class="muted">(${commentaire})</span>` : ""}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="muted">${fmt(parseFloat(montant))} € · ${date}</span>
            ${iconBtn(ICON_EDIT, "ev-edit", `data-edit-paiement="${id}"`)}
            ${iconBtn(ICON_CROSS, "ev-del", `data-delete-paiement="${id}"`)}
          </div>
        </div>`;
      }
    });
    html += `</div>`;
  }

  html += renderAddPaiementSheet();

  return html;
}

// ===================== FICHE AJOUT PAIEMENT (bottom sheet) =====================
function renderAddPaiementSheet() {
  if (!window.__showAddPaiement) return "";
  const bodyHtml = `
    <label class="field-label">Joueur</label>
    <select id="paiement-joueur">
      ${PLAYERS.map(p => `<option value="${p}">${p}</option>`).join("")}
    </select>
    <label class="field-label">Montant (€)</label>
    <input id="paiement-montant" type="number" step="0.5" placeholder="Ex: 20" />
    <label class="field-label">Commentaire (optionnel)</label>
    <input id="paiement-commentaire" type="text" placeholder="Ex: virement, espèces..." />
    <button class="btn" id="paiement-add" style="margin-top:12px;">Enregistrer le paiement</button>`;

  return `<div class="sheet-overlay open" data-close-sheet="showAddPaiement">
    <div class="sheet-scrim" data-close-sheet="showAddPaiement"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="showAddPaiement">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Paiements</div>
        <h2>Ajouter un paiement</h2>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

// ===================== ACTIONS API =====================

async function addPaiement(joueur, montant, commentaire) {
  const tempId = "temp_" + Date.now();
  const today = new Date().toISOString().slice(0, 10);
  paiements.push([tempId, joueur, montant, today, commentaire || ""]);
  render();
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=addPaiement&joueur=${encodeURIComponent(joueur)}&montant=${montant}&commentaire=${encodeURIComponent(commentaire || "")}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    const data = await res.json();
    if (data.ok) {
      await fetchAll();
    } else {
      paiements = paiements.filter(p => p[0] !== tempId);
      showToast("Échec de l'ajout", "error");
      render();
    }
  } catch (err) {
    isOnline = false;
    paiements = paiements.filter(p => p[0] !== tempId);
    showToast("Échec de l'ajout", "error");
    render();
  }
}

async function updatePaiementApi(id, joueur, montant, commentaire) {
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=updatePaiement&id=${encodeURIComponent(id)}&joueur=${encodeURIComponent(joueur)}&montant=${montant}&commentaire=${encodeURIComponent(commentaire || "")}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    window.__editingPaiementId = null;
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function deletePaiementApi(id) {
  try {
    await fetch(`${GOOGLE_SCRIPT_URL}?action=deletePaiement&id=${encodeURIComponent(id)}&authNom=${encodeURIComponent(session.nom)}&authCode=${encodeURIComponent(session.code)}`);
    await fetchAll();
  } catch (err) { isOnline = false; render(); }
}

async function notifyPaymentClaimApi(montant) {
  window.__paymentNotifySending = true;
  render();
  try {
    const params = new URLSearchParams({ action: "notifyPaymentClaim", montant, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    window.__paymentNotifySending = false;
    window.__paymentNotifySent = true;
    render();
  } catch (err) {
    window.__paymentNotifySending = false;
    isOnline = false;
    render();
  }
}

function attachPaiementsEvents() {
  const notifyPaymentBtn = document.getElementById("notify-payment-btn");
  if (notifyPaymentBtn) notifyPaymentBtn.onclick = () => {
    vibrate();
    notifyPaymentClaimApi(fmt(resteAPayer(session.nom)));
  };

  const toggleRestePayer = document.querySelector("[data-toggle-reste-payer]");
  if (toggleRestePayer) toggleRestePayer.onclick = () => {
    window.__resteAPayerExpanded = !window.__resteAPayerExpanded;
    render();
  };

  const toggleAddPaiement = document.getElementById("toggle-add-paiement");
  if (toggleAddPaiement) toggleAddPaiement.onclick = () => {
    window.__showAddPaiement = !window.__showAddPaiement;
    render();
  };

  const paiementAdd = document.getElementById("paiement-add");
  if (paiementAdd) paiementAdd.onclick = () => {
    const joueur = document.getElementById("paiement-joueur").value;
    const montant = parseFloat(document.getElementById("paiement-montant").value);
    const commentaire = document.getElementById("paiement-commentaire").value;
    if (!joueur || !montant) return;
    window.__showAddPaiement = false;
    addPaiement(joueur, montant, commentaire);
  };

  document.querySelectorAll("[data-edit-paiement]").forEach(el => {
    el.onclick = () => { window.__editingPaiementId = el.dataset.editPaiement; render(); };
  });

  document.querySelectorAll("[data-cancel-edit-paiement]").forEach(el => {
    el.onclick = () => { window.__editingPaiementId = null; render(); };
  });

  document.querySelectorAll("[data-save-paiement]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.savePaiement;
      const joueur = document.getElementById(`edit-joueur-${id}`).value;
      const montant = parseFloat(document.getElementById(`edit-montant-${id}`).value);
      const commentaire = document.getElementById(`edit-commentaire-${id}`).value;
      if (!joueur || !montant) return;
      updatePaiementApi(id, joueur, montant, commentaire);
    };
  });

  document.querySelectorAll("[data-delete-paiement]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.deletePaiement;
      if (confirm("Supprimer ce paiement ? Cette action est irréversible.")) {
        deletePaiementApi(id);
      }
    };
  });
}
