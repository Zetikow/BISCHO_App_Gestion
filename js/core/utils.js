// ===================================================================
// UTILITAIRES GÉNÉRIQUES — formatage, échappement HTML, sélecteurs
// date/heure maison, retour tactile, notification toast succès/échec,
// compression d'image, tirer-pour-rafraîchir. Rien ici ne dépend d'un
// module métier en particulier.
// ===================================================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n) {
  n = Math.round(n * 10) / 10;
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

function formatDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function getInitials(nom) {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nom.slice(0, 2).toUpperCase();
}

// ---------- Sélecteurs Date/Heure compacts (remplacent les <input type=date/time>
// natifs, dont le rendu déborde sur certains téléphones) ----------
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function dateSelectHtml(prefix, isoDate) {
  let day = "", month = "", year = new Date().getFullYear();
  if (isoDate) {
    const [y, m, d] = isoDate.split("-");
    year = parseInt(y, 10); month = parseInt(m, 10); day = parseInt(d, 10);
  }
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const years = [SEASON_START.getFullYear(), SEASON_START.getFullYear() + 1, SEASON_START.getFullYear() + 2];
  return `<div class="date-select-row">
    <select id="${prefix}-day">
      <option value="">Jour</option>
      ${days.map(d => `<option value="${String(d).padStart(2, "0")}" ${d === day ? "selected" : ""}>${d}</option>`).join("")}
    </select>
    <select id="${prefix}-month">
      <option value="">Mois</option>
      ${MONTHS_FR.map((m, i) => `<option value="${String(i + 1).padStart(2, "0")}" ${(i + 1) === month ? "selected" : ""}>${m}</option>`).join("")}
    </select>
    <select id="${prefix}-year">
      ${years.map(y => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}
    </select>
  </div>`;
}

function heureSelectHtml(prefix, isoHeure) {
  let h = "", m = "00";
  if (isoHeure) {
    const [hh, mm] = isoHeure.split(":");
    h = parseInt(hh, 10); m = mm;
  }
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = ["00", "15", "30", "45"];
  return `<div class="date-select-row">
    <select id="${prefix}-h">
      <option value="">Heure</option>
      ${hours.map(v => `<option value="${String(v).padStart(2, "0")}" ${v === h ? "selected" : ""}>${String(v).padStart(2, "0")}h</option>`).join("")}
    </select>
    <select id="${prefix}-m">
      ${minutes.map(v => `<option value="${v}" ${v === m ? "selected" : ""}>${v}</option>`).join("")}
    </select>
  </div>`;
}

function readDateSelect(prefix) {
  const day = document.getElementById(`${prefix}-day`).value;
  const month = document.getElementById(`${prefix}-month`).value;
  const year = document.getElementById(`${prefix}-year`).value;
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
}

function readHeureSelect(prefix) {
  const h = document.getElementById(`${prefix}-h`).value;
  const m = document.getElementById(`${prefix}-m`).value;
  if (!h) return "";
  return `${h}:${m}`;
}

function formatDateFr(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatDateShort(d) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// ---------- Petites icônes SVG partagées (édition / suppression) ----------
const ICON_EDIT = '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>';
const ICON_CROSS = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

function iconBtn(pathHtml, cls, attrsHtml) {
  return `<span class="${cls}" ${attrsHtml}><svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24">${pathHtml}</svg></span>`;
}

// ---------- Retour tactile ----------

function vibrate() {
  if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
}

// ---------- Notification (toast) succès/échec ----------
// Retour visuel de 3s après une action de création (créneau ostéo, événement, actualité,
// paiement, action caisse noire...) — vert "Ajout réussi" / rouge "Échec de l'ajout". Posé
// directement sur document.body (comme #ptr-indicator plus haut) pour survivre à la
// reconstruction complète de #app par render().
let toastHideTimeoutId = null;
function showToast(message, type) {
  let el = document.getElementById("app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `app-toast ${type === "error" ? "error" : "success"} visible`;
  clearTimeout(toastHideTimeoutId);
  toastHideTimeoutId = setTimeout(() => { el.classList.remove("visible"); }, 3000);
}

// Retour visuel immédiat au toucher, indépendant du rafraîchissement de la page
// (le CSS :active seul n'a pas toujours le temps de s'afficher avant le re-rendu)
const TAP_SELECTOR = ".btn, .nav-btn, .toggle-btn, .ev-edit, .ev-del, .bottom-nav button, .expand-toggle, .avatar-btn, .avatar-menu-item, .qty-btn, .add-toggle, .justif-edit-btn, .team-switch-btn, .mode-tab-btn, .gm-section-chip, .cn-edit-pick-row, .cn-edit-cancel, .folder-card, .salaries-type-btn";
document.addEventListener("touchstart", (e) => {
  const el = e.target.closest(TAP_SELECTOR);
  if (el) el.classList.add("tap-active");
}, { passive: true });
["touchend", "touchcancel"].forEach(evt => {
  document.addEventListener(evt, () => {
    document.querySelectorAll(".tap-active").forEach(el => el.classList.remove("tap-active"));
  }, { passive: true });
});

// Capture la position/taille de la carte tapée juste avant qu'un clic n'ouvre une fiche (bottom
// sheet), pour que playSheetOpenAnimation() (core/render.js) puisse la faire "grandir" depuis
// cet endroit plutôt que glisser depuis le bas de l'écran. Capture phase : s'exécute avant les
// gestionnaires onclick spécifiques à chaque module qui, eux, déclenchent le render() d'ouverture.
const SHEET_OPEN_TRIGGER_SELECTOR = ".sheet-open-zone, .add-btn-primary, [data-cn-toggle-edit], [data-open-presence-detail]";
document.addEventListener("click", (e) => {
  const el = e.target.closest(SHEET_OPEN_TRIGGER_SELECTOR);
  if (!el) return;
  const r = el.getBoundingClientRect();
  window.__sheetOriginRect = { left: r.left, top: r.top, width: r.width, height: r.height };
}, true);

// ---------- Compression d'image avant upload ----------
// Réduit une photo prise depuis un téléphone (souvent plusieurs Mo) à une taille raisonnable
// avant envoi — c'est ce qui évite la sensation de "chargement dans le vide" lors de l'upload :
// sans ça, une photo de 5-8 Mo doit être encodée en base64 (+33% de taille) puis transmise
// intégralement au script, ce qui peut prendre un long moment sur une connexion mobile.
function compressImageFile(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (blob) resolve(blob); else reject(new Error("compression_failed"));
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image_load_failed")); };
    img.src = url;
  });
}

// ===================== TIRER POUR RAFRAÎCHIR (pull-to-refresh) =====================
let ptrStartY = null, ptrDiff = 0, ptrActive = false, ptrRefreshing = false;
const PTR_THRESHOLD = 65;

function initPullToRefresh() {
  const indicator = document.createElement("div");
  indicator.id = "ptr-indicator";
  indicator.className = "ptr-indicator";
  indicator.innerHTML = '<div class="ptr-spinner"></div>';
  document.body.appendChild(indicator);

  document.addEventListener("touchstart", (e) => {
    if (ptrRefreshing) return;
    if (window.scrollY <= 0 && !isFormOpen()) {
      ptrStartY = e.touches[0].clientY;
      ptrActive = true;
    } else {
      ptrActive = false;
    }
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!ptrActive || ptrStartY === null || ptrRefreshing) return;
    ptrDiff = e.touches[0].clientY - ptrStartY;
    if (ptrDiff > 0 && window.scrollY <= 0) {
      const pull = Math.min(ptrDiff, 100);
      indicator.style.opacity = String(Math.min(pull / PTR_THRESHOLD, 1));
      indicator.style.transform = `translateX(-50%) translateY(${Math.min(pull, PTR_THRESHOLD)}px)`;
      if (pull > 8 && e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!ptrActive) return;
    ptrActive = false;
    if (ptrDiff > PTR_THRESHOLD && !ptrRefreshing) {
      ptrRefreshing = true;
      indicator.classList.add("ptr-spinning");
      indicator.style.opacity = "1";
      indicator.style.transform = "translateX(-50%) translateY(65px)";
      Promise.resolve(fetchAll()).finally(() => {
        ptrRefreshing = false;
        indicator.classList.remove("ptr-spinning");
        indicator.style.opacity = "0";
        indicator.style.transform = "translateX(-50%) translateY(0px)";
      });
    } else {
      indicator.style.opacity = "0";
      indicator.style.transform = "translateX(-50%) translateY(0px)";
    }
    ptrDiff = 0;
  });
}
