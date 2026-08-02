// ===================================================================
// RDV OSTÉO — page externe, script autonome et volontairement séparé du
// reste de l'appli (pas d'import de js/core/*.js ni js/modules/*.js) :
// cette page est destinée à des personnes suivies par l'ostéopathe du
// club qui ne sont PAS membres du club, elles ne doivent jamais voir/
// charger le code de l'appli principale. Elle parle au même backend
// (GOOGLE_SCRIPT_URL, voir config/google-script-config.js) via les
// actions déjà existantes (accountStatus, setCode, login,
// reserveOsteoSlot, cancelOsteoReservation, setEmail, sendSupportMessage,
// getMySupportHistory) plus une action dédiée, minimale et privée,
// getOsteoExterneData (voir apps-script/Osteo.gs).
//
// 4 onglets (nav du bas, voir oeRenderBottomNav) : Ostéo (créneaux/mes RDV,
// contenu historique de cette page), Profil (nom/email/RDV passés), Support
// (contact direct + historique), Consignes (mode d'emploi statique). Pas de
// routage d'URL : un simple "currentView" en mémoire, plus léger que le
// vrai système de pages de l'appli principale (pas besoin ici).
// ===================================================================

const OE_SESSION_KEY = "osteo-externe-session"; // {nom, code} — distinct de "caisse-noire-session"

let oeSession = JSON.parse(localStorage.getItem(OE_SESSION_KEY) || "null");

// ----- État de l'écran de connexion -----
let oeLoginNom = "";
let oeLoginStep = "nom"; // "nom" | "setcode" | "code"
let oeLoginError = "";
let oeLoginBusy = false;

// ----- État après connexion -----
let oeCurrentView = "osteo"; // "osteo" | "profil" | "support" | "consignes"
let oeData = null; // { slots, mesReservations, moi:{nom,email,rdvPasses} }
let oeLoadError = "";
let oeReservingSlotId = null; // slot pour lequel la boîte "motif" est ouverte
let oeBusy = false; // désactive les boutons pendant un appel réseau

// ----- État onglet Profil -----
let oeProfilEmailEditing = false;

// ----- État onglet Support -----
let oeSupportHistoryState = { loading: false, loaded: false, history: [] };
let oeSupportSending = false;
let oeSupportSent = false;

const OE_TABS = [
  { id: "osteo", label: "Ostéo", icon: "🩺" },
  { id: "profil", label: "Profil", icon: "👤" },
  { id: "support", label: "Support", icon: "💬" },
  { id: "consignes", label: "Infos", icon: "📖" },
];

function oeEscapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let oeToastTimeoutId = null;
function oeShowToast(message, type) {
  let el = document.getElementById("oe-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "oe-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `oe-toast ${type === "error" ? "error" : "success"} visible`;
  clearTimeout(oeToastTimeoutId);
  oeToastTimeoutId = setTimeout(() => { el.classList.remove("visible"); }, 3000);
}

// Date+heure d'un créneau -> libellé court en français (ex: "lun. 12 août"), pour affichage.
function oeDateLabel(dateStr, heureStr) {
  const d = new Date(dateStr + "T" + (heureStr || "00:00"));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function oeRender() {
  const root = document.getElementById("oe-shell");
  if (!root) return;
  root.classList.toggle("oe-with-nav", !!oeSession); // laisse la place à la nav du bas une fois connecté
  root.innerHTML = oeSession ? oeRenderMain() : oeRenderLogin();
  if (oeSession) oeAttachMainEvents(); else oeAttachLoginEvents();
}

// ===================== ÉCRAN DE CONNEXION =====================

function oeRenderLogin() {
  let stepHtml = "";
  if (oeLoginStep === "setcode") {
    stepHtml = `
      <div class="oe-muted" style="margin-top:10px;">Première connexion pour <b>${oeEscapeHtml(oeLoginNom)}</b> : choisis ton code.</div>
      <label class="oe-field-label">Nouveau code (4 chiffres)</label>
      <input id="oe-newcode" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <label class="oe-field-label">Confirme le code</label>
      <input id="oe-newcode2" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <div style="margin-top:16px;"><button class="oe-btn" id="oe-setcode-btn" ${oeLoginBusy ? "disabled" : ""}>Définir mon code et me connecter</button></div>
    `;
  } else if (oeLoginStep === "code") {
    stepHtml = `
      <label class="oe-field-label">Code (4 chiffres)</label>
      <input id="oe-code" type="password" inputmode="numeric" maxlength="4" placeholder="••••" />
      <div style="margin-top:16px;"><button class="oe-btn" id="oe-login-btn" ${oeLoginBusy ? "disabled" : ""}>Se connecter</button></div>
      <div class="oe-muted" id="oe-change-nom" style="margin-top:12px; cursor:pointer; text-decoration:underline;">Ce n'est pas moi — changer de nom</div>
    `;
  } else {
    stepHtml = `<div style="margin-top:16px;"><button class="oe-btn" id="oe-continue-btn" ${oeLoginBusy ? "disabled" : ""}>Continuer</button></div>`;
  }

  return `<div class="oe-login-wrap"><div class="oe-login-outer"><div class="oe-login-card">
    <div class="oe-login-glow"></div>
    <div class="oe-login-title">Réservation ostéo</div>
    <div class="oe-login-subtitle">Espace externe</div>
    <label class="oe-field-label">Ton nom</label>
    <input id="oe-nom" type="text" autocomplete="off" placeholder="Tape ton nom" value="${oeEscapeHtml(oeLoginNom)}" ${oeLoginStep !== "nom" ? "disabled" : ""} />
    ${stepHtml}
    ${oeLoginError ? `<div class="oe-login-error">${oeEscapeHtml(oeLoginError)}</div>` : ""}
    <div class="oe-login-hint">Tape ton nom exactement comme convenu avec Eve.</div>
  </div></div></div>`;
}

function oeAttachLoginEvents() {
  const nomInput = document.getElementById("oe-nom");
  if (nomInput) {
    nomInput.oninput = (e) => { oeLoginNom = e.target.value; };
    nomInput.focus();
  }

  const continueBtn = document.getElementById("oe-continue-btn");
  if (continueBtn) continueBtn.onclick = () => {
    const nom = (oeLoginNom || "").trim();
    if (!nom) { oeLoginError = "Merci de renseigner ton nom."; oeRender(); return; }
    oeLoginNom = nom;
    oeCheckAccountStatus(nom);
  };

  const changeNom = document.getElementById("oe-change-nom");
  if (changeNom) changeNom.onclick = () => {
    oeLoginStep = "nom";
    oeLoginError = "";
    oeRender();
  };

  const setCodeBtn = document.getElementById("oe-setcode-btn");
  if (setCodeBtn) setCodeBtn.onclick = () => {
    const c1 = document.getElementById("oe-newcode").value;
    const c2 = document.getElementById("oe-newcode2").value;
    if (!/^\d{4}$/.test(c1)) { oeLoginError = "Le code doit comporter exactement 4 chiffres."; oeRender(); return; }
    if (c1 !== c2) { oeLoginError = "Les deux codes ne correspondent pas."; oeRender(); return; }
    oeSetInitialCode(oeLoginNom, c1);
  };

  const loginBtn = document.getElementById("oe-login-btn");
  if (loginBtn) loginBtn.onclick = () => {
    const code = document.getElementById("oe-code").value;
    if (!/^\d{4}$/.test(code)) { oeLoginError = "Entre ton code à 4 chiffres."; oeRender(); return; }
    oeDoLogin(oeLoginNom, code);
  };
}

async function oeCheckAccountStatus(nom) {
  oeLoginBusy = true; oeLoginError = ""; oeRender();
  try {
    const params = new URLSearchParams({ action: "accountStatus", nom });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    oeLoginBusy = false;
    if (!data.ok) {
      oeLoginError = "Ce nom n'est associé à aucun compte. Vérifie l'orthographe exacte avec Eve.";
      oeRender();
      return;
    }
    oeLoginStep = data.needsSetup ? "setcode" : "code";
    oeRender();
  } catch (err) {
    oeLoginBusy = false;
    oeLoginError = "Connexion impossible pour le moment (hors ligne ?).";
    oeRender();
  }
}

async function oeSetInitialCode(nom, newCode) {
  oeLoginBusy = true; oeLoginError = ""; oeRender();
  try {
    const params = new URLSearchParams({ action: "setCode", nom, newCode });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    oeLoginBusy = false;
    if (!data.ok) {
      oeLoginError = data.error === "already_set" ? "Un code existe déjà pour ce compte — utilise-le pour te connecter." : "Échec de la création du code.";
      if (data.error === "already_set") oeLoginStep = "code";
      oeRender();
      return;
    }
    oeSession = { nom, code: newCode };
    localStorage.setItem(OE_SESSION_KEY, JSON.stringify(oeSession));
    oeLoadMainData();
  } catch (err) {
    oeLoginBusy = false;
    oeLoginError = "Connexion impossible pour le moment (hors ligne ?).";
    oeRender();
  }
}

async function oeDoLogin(nom, code) {
  oeLoginBusy = true; oeLoginError = ""; oeRender();
  try {
    const params = new URLSearchParams({ action: "login", nom, code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    oeLoginBusy = false;
    if (!data.ok) {
      oeLoginError = "Nom ou code incorrect.";
      oeRender();
      return;
    }
    oeSession = { nom, code };
    localStorage.setItem(OE_SESSION_KEY, JSON.stringify(oeSession));
    oeLoadMainData();
  } catch (err) {
    oeLoginBusy = false;
    oeLoginError = "Connexion impossible pour le moment (hors ligne ?).";
    oeRender();
  }
}

// ===================== ÉCRAN PRINCIPAL (4 onglets) =====================
// oeRenderMain() affiche l'en-tête + l'onglet courant (oeCurrentView) + la nav du bas. Chaque
// onglet a son propre oeRenderXxxTab(), attaché depuis oeAttachMainEvents() (un seul point
// d'entrée, comme attachEvents() dans l'appli principale, mais sans le découpage par module —
// cette page reste volontairement plus légère).

function oeRenderMain() {
  let html = `<div class="oe-title">Réservation ostéo</div><div class="oe-sub">Bonjour ${oeEscapeHtml(oeSession.nom)}.</div>`;

  if (oeCurrentView === "consignes") {
    html += oeRenderConsignesTab();
  } else if (oeLoadError) {
    html += `<div class="oe-card"><div class="oe-muted">${oeEscapeHtml(oeLoadError)}</div></div>`;
  } else if (!oeData) {
    html += `<div class="oe-card"><div class="oe-muted">Chargement...</div></div>`;
  } else if (oeCurrentView === "profil") {
    html += oeRenderProfilTab();
  } else if (oeCurrentView === "support") {
    html += oeRenderSupportTab();
  } else {
    html += oeRenderOsteoTab();
  }

  html += oeRenderBottomNav();
  return html;
}

// ----- Onglet Ostéo (créneaux disponibles + mes RDV) -----
function oeRenderOsteoTab() {
  let html = "";
  const reservedIds = new Set(oeData.mesReservations.map(r => r.slotId));
  const available = oeData.slots.filter(s => s.disponible || reservedIds.has(s.id));

  html += `<div class="oe-section-h">Créneaux disponibles</div>`;
  const freeSlots = available.filter(s => s.disponible);
  if (freeSlots.length === 0) {
    html += `<div class="oe-card"><div class="oe-muted">Aucun créneau disponible pour le moment.</div></div>`;
  } else {
    freeSlots.forEach(s => {
      html += `<div class="oe-card">
        <div class="oe-slot-top">
          <div>
            <div class="oe-slot-date">${oeEscapeHtml(oeDateLabel(s.date, s.heure))}</div>
            <div class="oe-slot-meta">${oeEscapeHtml(s.heure || "")}${s.lieu ? " · " + oeEscapeHtml(s.lieu) : ""}</div>
          </div>
          <div class="oe-tag">${oeEscapeHtml(s.equipe)}</div>
        </div>
        ${oeReservingSlotId === s.id ? `
          <div class="oe-motif-box">
            <label class="oe-field-label">Motif (optionnel)</label>
            <textarea id="oe-motif-${oeEscapeHtml(s.id)}" rows="3" placeholder="Ex: douleur à l'épaule droite..."></textarea>
            <div class="oe-motif-actions">
              <button class="oe-btn secondary" data-oe-motif-cancel="${oeEscapeHtml(s.id)}" ${oeBusy ? "disabled" : ""}>Annuler</button>
              <button class="oe-btn" data-oe-motif-confirm="${oeEscapeHtml(s.id)}" ${oeBusy ? "disabled" : ""}>Confirmer</button>
            </div>
          </div>
        ` : `
          <div class="oe-slot-action"><button class="oe-btn" data-oe-reserve="${oeEscapeHtml(s.id)}" ${oeBusy ? "disabled" : ""}>Réserver</button></div>
        `}
      </div>`;
    });
  }

  html += `<div class="oe-section-h">Mes rendez-vous</div>`;
  if (oeData.mesReservations.length === 0) {
    html += `<div class="oe-card"><div class="oe-muted">Aucun rendez-vous réservé.</div></div>`;
  } else {
    oeData.mesReservations
      .slice()
      .sort((a, b) => (a.date + "T" + a.heure).localeCompare(b.date + "T" + b.heure))
      .forEach(r => {
        html += `<div class="oe-card">
          <div class="oe-slot-top">
            <div>
              <div class="oe-slot-date">${oeEscapeHtml(oeDateLabel(r.date, r.heure))}</div>
              <div class="oe-slot-meta">${oeEscapeHtml(r.heure || "")}${r.lieu ? " · " + oeEscapeHtml(r.lieu) : ""}</div>
            </div>
          </div>
          ${r.motif ? `<div class="oe-slot-motif">Motif : ${oeEscapeHtml(r.motif)}</div>` : ""}
          <div class="oe-slot-action"><button class="oe-btn danger" data-oe-cancel="${oeEscapeHtml(r.slotId)}" ${oeBusy ? "disabled" : ""}>Annuler</button></div>
        </div>`;
      });
  }

  return html;
}

// ----- Onglet Profil (nom, email, RDV passés, déconnexion) -----
function oeRenderProfilTab() {
  const moi = oeData.moi || { nom: oeSession.nom, email: "", rdvPasses: 0 };
  let html = `<div class="oe-section-h">Mon profil</div>`;

  html += `<div class="oe-card">
    <label class="oe-field-label" style="margin-top:0;">Nom</label>
    <div style="font-size:15px; font-weight:700; color:#fff;">${oeEscapeHtml(moi.nom)}</div>
  </div>`;

  html += `<div class="oe-card">
    <label class="oe-field-label" style="margin-top:0;">Adresse mail</label>`;
  if (!moi.email || oeProfilEmailEditing) {
    html += `
      <input id="oe-profil-email" type="email" placeholder="ton.email@exemple.com" value="${oeEscapeHtml(moi.email || "")}" />
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="oe-btn" style="flex:1;" id="oe-profil-email-save">Enregistrer</button>
        ${oeProfilEmailEditing ? `<button class="oe-btn secondary" style="flex:1;" id="oe-profil-email-cancel">Annuler</button>` : ""}
      </div>`;
  } else {
    html += `
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="flex:1; font-size:13px; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${oeEscapeHtml(moi.email)}</div>
        <button class="oe-btn secondary" style="width:auto; padding:8px 12px;" id="oe-profil-email-edit">Modifier</button>
      </div>`;
  }
  html += `</div>`;

  html += `<div class="oe-card" style="text-align:center;">
    <div style="font-size:26px; font-weight:800; color:#fff;">${moi.rdvPasses}</div>
    <div class="oe-muted">rendez-vous passé${moi.rdvPasses > 1 ? "s" : ""}</div>
  </div>`;

  html += `<div class="oe-logout" id="oe-logout">Se déconnecter</div>`;
  return html;
}

// ----- Onglet Support (contact direct + historique) -----
function oeRenderSupportTab() {
  let html = `<div class="oe-section-h">Une question pour Eve ?</div>
  <div class="oe-card">
    <label class="oe-field-label" style="margin-top:0;">Ton message</label>
    <textarea id="oe-support-message" rows="5" placeholder="Décris ta question..."></textarea>
    <button class="oe-btn" id="oe-support-submit" style="margin-top:10px;" ${oeSupportSending ? "disabled" : ""}>${oeSupportSending ? "Envoi en cours..." : "Envoyer"}</button>
    ${oeSupportSent ? `<div class="oe-muted" style="margin-top:8px; color:#33d17a; font-weight:700;">Message envoyé, merci !</div>` : ""}
  </div>`;

  html += `<div class="oe-section-h">Historique</div>`;
  if (oeSupportHistoryState.loading && !oeSupportHistoryState.loaded) {
    html += `<div class="oe-card"><div class="oe-muted">Chargement…</div></div>`;
  } else if (oeSupportHistoryState.history.length === 0) {
    html += `<div class="oe-card"><div class="oe-muted">Aucune demande envoyée pour le moment.</div></div>`;
  } else {
    oeSupportHistoryState.history.forEach(h => {
      html += `<div class="oe-card">
        <div class="oe-muted" style="font-size:10.5px; margin-bottom:6px;">${oeEscapeHtml(h.date)}</div>
        <div style="font-size:12.5px; color:#e8e8ee; line-height:1.5;">${oeEscapeHtml(h.message)}</div>
        ${h.reponse ? `
          <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:9.5px; font-weight:800; text-transform:uppercase; color:#33d17a; margin-bottom:4px;">Réponse d'Eve</div>
            <div style="font-size:12px; color:#e4e8f2; line-height:1.5;">${oeEscapeHtml(h.reponse)}</div>
          </div>
        ` : `<div class="oe-muted" style="margin-top:6px; font-size:10.5px; font-style:italic;">En attente de réponse</div>`}
      </div>`;
    });
  }
  return html;
}

// ----- Onglet Consignes (statique, pas d'appel réseau) -----
function oeRenderConsignesTab() {
  return `<div class="oe-section-h">Comment ça marche</div>
  <div class="oe-card">
    <div style="font-size:13px; color:#e8e8ee; line-height:1.7;">
      <p style="margin:0 0 10px;">Bienvenue sur ton espace de réservation avec Eve, ostéopathe. Voici l'essentiel :</p>
      <p style="margin:0 0 8px;">🗓️ <b>Voir les créneaux</b> — l'onglet « Ostéo » liste tous les rendez-vous encore libres, avec le jour, l'heure et le lieu.</p>
      <p style="margin:0 0 8px;">✅ <b>Réserver</b> — touche « Réserver » sur le créneau qui te convient. Tu peux ajouter un mot sur le motif de ta visite si tu le souhaites, ce n'est jamais obligatoire.</p>
      <p style="margin:0 0 8px;">❌ <b>Annuler</b> — dans « Mes rendez-vous », un bouton « Annuler » libère aussitôt le créneau pour quelqu'un d'autre.</p>
      <p style="margin:0;">🔒 <b>Confidentialité</b> — le motif que tu indiques, et toute note qu'Eve prend après ta visite, ne sont jamais visibles par personne d'autre qu'elle.</p>
    </div>
  </div>`;
}

// ----- Nav du bas -----
function oeRenderBottomNav() {
  return `<div class="oe-bottom-nav">
    ${OE_TABS.map(t => `<button type="button" class="oe-nav-btn ${oeCurrentView === t.id ? "active" : ""}" data-oe-view="${t.id}">
      <span class="oe-nav-icon">${t.icon}</span>${t.label}
    </button>`).join("")}
  </div>`;
}

function oeAttachMainEvents() {
  document.querySelectorAll("[data-oe-view]").forEach(el => {
    el.onclick = () => {
      oeCurrentView = el.dataset.oeView;
      if (oeCurrentView === "support" && !oeSupportHistoryState.loaded && !oeSupportHistoryState.loading) oeFetchSupportHistory();
      oeRender();
    };
  });

  document.querySelectorAll("[data-oe-reserve]").forEach(el => {
    el.onclick = () => { oeReservingSlotId = el.dataset.oeReserve; oeRender(); };
  });
  document.querySelectorAll("[data-oe-motif-cancel]").forEach(el => {
    el.onclick = () => { oeReservingSlotId = null; oeRender(); };
  });
  document.querySelectorAll("[data-oe-motif-confirm]").forEach(el => {
    el.onclick = () => {
      const slotId = el.dataset.oeMotifConfirm;
      const motifEl = document.getElementById("oe-motif-" + slotId);
      const motif = motifEl ? motifEl.value.trim() : "";
      oeReserveSlot(slotId, motif);
    };
  });
  document.querySelectorAll("[data-oe-cancel]").forEach(el => {
    el.onclick = () => {
      if (!confirm("Annuler ce rendez-vous ?")) return;
      oeCancelReservation(el.dataset.oeCancel);
    };
  });

  const profilEmailSave = document.getElementById("oe-profil-email-save");
  if (profilEmailSave) profilEmailSave.onclick = () => {
    const val = (document.getElementById("oe-profil-email").value || "").trim();
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { alert("Merci de renseigner une adresse mail valide."); return; }
    oeSaveEmail(val);
  };
  const profilEmailEdit = document.getElementById("oe-profil-email-edit");
  if (profilEmailEdit) profilEmailEdit.onclick = () => { oeProfilEmailEditing = true; oeRender(); };
  const profilEmailCancel = document.getElementById("oe-profil-email-cancel");
  if (profilEmailCancel) profilEmailCancel.onclick = () => { oeProfilEmailEditing = false; oeRender(); };

  const supportSubmit = document.getElementById("oe-support-submit");
  if (supportSubmit) supportSubmit.onclick = () => {
    const msg = (document.getElementById("oe-support-message").value || "").trim();
    if (!msg) { alert("Merci d'écrire un message avant d'envoyer."); return; }
    oeSendSupportMessage(msg);
  };

  const logoutEl = document.getElementById("oe-logout");
  if (logoutEl) logoutEl.onclick = () => {
    localStorage.removeItem(OE_SESSION_KEY);
    oeSession = null;
    oeData = null;
    oeCurrentView = "osteo";
    oeProfilEmailEditing = false;
    oeSupportHistoryState = { loading: false, loaded: false, history: [] };
    oeSupportSending = false;
    oeSupportSent = false;
    oeLoginNom = "";
    oeLoginStep = "nom";
    oeLoginError = "";
    oeRender();
  };
}

async function oeLoadMainData() {
  oeLoadError = "";
  oeRender();
  try {
    const params = new URLSearchParams({ action: "getOsteoExterneData", authNom: oeSession.nom, authCode: oeSession.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) {
      oeLoadError = "Impossible de charger les créneaux pour le moment.";
      oeRender();
      return;
    }
    oeData = { slots: data.slots || [], mesReservations: data.mesReservations || [], moi: data.moi || { nom: oeSession.nom, email: "", rdvPasses: 0 } };
    oeRender();
  } catch (err) {
    oeLoadError = "Connexion impossible pour le moment (hors ligne ?).";
    oeRender();
  }
}

// Enregistre l'adresse mail (action générique "setEmail", Auth.gs — mêmes paramètres que
// js/modules/profil.js côté appli principale : un externe n'édite jamais que sa propre ligne).
async function oeSaveEmail(email) {
  if (oeData && oeData.moi) oeData.moi.email = email; // optimiste
  oeProfilEmailEditing = false;
  oeRender();
  try {
    const params = new URLSearchParams({ action: "setEmail", nom: oeSession.nom, email, authNom: oeSession.nom, authCode: oeSession.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
  } catch (err) {
    oeShowToast("Échec de l'enregistrement (hors ligne ?)", "error");
  }
}

async function oeFetchSupportHistory() {
  oeSupportHistoryState.loading = true;
  oeRender();
  try {
    const params = new URLSearchParams({ action: "getMySupportHistory", authNom: oeSession.nom, authCode: oeSession.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.ok) oeSupportHistoryState = { loading: false, loaded: true, history: data.history || [] };
    else oeSupportHistoryState.loading = false;
  } catch (err) {
    oeSupportHistoryState.loading = false;
  }
  oeRender();
}

async function oeSendSupportMessage(message) {
  oeSupportSending = true;
  oeRender();
  try {
    const params = new URLSearchParams({ action: "sendSupportMessage", message, authNom: oeSession.nom, authCode: oeSession.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    oeSupportSending = false;
    oeSupportSent = true;
    oeFetchSupportHistory();
  } catch (err) {
    oeSupportSending = false;
    oeShowToast("Échec de l'envoi (hors ligne ?)", "error");
    oeRender();
  }
}

async function oeReserveSlot(slotId, motif) {
  oeBusy = true; oeReservingSlotId = null; oeRender();
  try {
    const params = new URLSearchParams({ action: "reserveOsteoSlot", slotId, motif, nom: oeSession.nom, authNom: oeSession.nom, authCode: oeSession.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    oeBusy = false;
    if (!data.ok) {
      oeShowToast(data.error === "already_taken" ? "Ce créneau vient d'être réservé par quelqu'un d'autre." : "Échec de la réservation.", "error");
    } else {
      oeShowToast("Réservation confirmée", "success");
    }
    await oeLoadMainData();
  } catch (err) {
    oeBusy = false;
    oeShowToast("Échec de la réservation (hors ligne ?)", "error");
    oeRender();
  }
}

async function oeCancelReservation(slotId) {
  oeBusy = true; oeRender();
  try {
    const params = new URLSearchParams({ action: "cancelOsteoReservation", slotId, nom: oeSession.nom, authNom: oeSession.nom, authCode: oeSession.code });
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    oeBusy = false;
    oeShowToast(data.ok ? "Rendez-vous annulé" : "Échec de l'annulation", data.ok ? "success" : "error");
    await oeLoadMainData();
  } catch (err) {
    oeBusy = false;
    oeShowToast("Échec de l'annulation (hors ligne ?)", "error");
    oeRender();
  }
}

// ===================== DÉMARRAGE =====================
if (oeSession && (!oeSession.nom || !oeSession.code)) {
  oeSession = null;
  localStorage.removeItem(OE_SESSION_KEY);
}
if (oeSession) {
  oeLoadMainData();
} else {
  oeRender();
}
