// ===================================================================
// RDV OSTÉO — page externe, script autonome et volontairement séparé du
// reste de l'appli (pas d'import de js/core/*.js ni js/modules/*.js) :
// cette page est destinée à des personnes suivies par l'ostéopathe du
// club qui ne sont PAS membres du club, elles ne doivent jamais voir/
// charger le code de l'appli principale. Elle parle au même backend
// (GOOGLE_SCRIPT_URL, voir config/google-script-config.js) via les
// actions déjà existantes (accountStatus, setCode, login,
// reserveOsteoSlot, cancelOsteoReservation) plus une action dédiée,
// minimale et privée, getOsteoExterneData (voir apps-script/Osteo.gs).
// ===================================================================

const OE_SESSION_KEY = "osteo-externe-session"; // {nom, code} — distinct de "caisse-noire-session"

let oeSession = JSON.parse(localStorage.getItem(OE_SESSION_KEY) || "null");

// ----- État de l'écran de connexion -----
let oeLoginNom = "";
let oeLoginStep = "nom"; // "nom" | "setcode" | "code"
let oeLoginError = "";
let oeLoginBusy = false;

// ----- État après connexion -----
let oeData = null; // { slots, mesReservations }
let oeLoadError = "";
let oeReservingSlotId = null; // slot pour lequel la boîte "motif" est ouverte
let oeBusy = false; // désactive les boutons pendant un appel réseau

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

// ===================== ÉCRAN PRINCIPAL (créneaux + mes RDV) =====================

function oeRenderMain() {
  let html = `<div class="oe-title">Réservation ostéo</div><div class="oe-sub">Bonjour ${oeEscapeHtml(oeSession.nom)}.</div>`;

  if (oeLoadError) {
    html += `<div class="oe-card"><div class="oe-muted">${oeEscapeHtml(oeLoadError)}</div></div>`;
  } else if (!oeData) {
    html += `<div class="oe-card"><div class="oe-muted">Chargement...</div></div>`;
  } else {
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
  }

  html += `<div class="oe-logout" id="oe-logout">Se déconnecter</div>`;
  return html;
}

function oeAttachMainEvents() {
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
  const logoutEl = document.getElementById("oe-logout");
  if (logoutEl) logoutEl.onclick = () => {
    localStorage.removeItem(OE_SESSION_KEY);
    oeSession = null;
    oeData = null;
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
    oeData = { slots: data.slots || [], mesReservations: data.mesReservations || [] };
    oeRender();
  } catch (err) {
    oeLoadError = "Connexion impossible pour le moment (hors ligne ?).";
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
