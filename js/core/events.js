// ===================================================================
// ÉVÉNEMENTS — attachEvents() est rappelée à la fin de chaque render()
// (voir core/render.js) pour rebrancher tous les gestionnaires sur le
// HTML fraîchement recréé. Ce fichier ne gère que la navigation
// générale et le menu d'en-tête (avatar/déconnexion/changement de
// code) ; chaque module gère ses propres éléments dans son
// attachXxxEvents(), appelée ci-dessous.
//
// Pour retirer un module : supprimez simplement son appel dans la
// liste ci-dessous (et son fichier .js / sa balise <script> dans
// index.html).
// ===================================================================

function attachEvents() {
  attachCoreNavEvents();

  attachCaisseNoireEvents();
  attachAgendaEvents();
  attachCompositionEvents();
  attachPresenceEvents();
  attachCovoiturageEvents();
  attachOsteoEvents();
  attachActualitesEvents();
  attachSalariesEvents();
  attachPaiementsEvents();
  attachGalerieEvents();
  attachProfilEvents();
  attachSupportEvents();
  animateFillBars();
}

// Fait passer les barres de progression (.ptype-fill, moyenne de présence par type) de 0 à leur
// valeur réelle — seulement lors d'un vrai changement de page (window.__pageJustChanged, voir
// render.js), jamais lors d'un rafraîchissement périodique où elles sont déjà à la bonne largeur.
function animateFillBars() {
  if (!window.__pageJustChanged) return;
  const bars = document.querySelectorAll(".ptype-fill[data-fill-target]");
  if (bars.length === 0) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bars.forEach(bar => { bar.style.width = bar.dataset.fillTarget + "%"; });
  }));
}

function attachCoreNavEvents() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => { vibrate(); currentPage = btn.dataset.page; window.__avatarMenuOpen = false; render(); };
  });

  const navExtraTrigger = document.getElementById("nav-extra-trigger");
  if (navExtraTrigger) navExtraTrigger.onclick = () => {
    vibrate();
    window.__navExtraMenuOpen = !window.__navExtraMenuOpen;
    render();
  };

  document.querySelectorAll("[data-nav-extra-item]").forEach(el => {
    el.onclick = () => {
      vibrate();
      currentPage = el.dataset.navExtraItem;
      window.__navExtraMenuOpen = false;
      window.__avatarMenuOpen = false;
      render();
    };
  });

  document.querySelectorAll("[data-goto-page]").forEach(el => {
    el.onclick = () => { vibrate(); currentPage = el.dataset.gotoPage; render(); };
  });

  const avatarBtn = document.getElementById("avatar-btn");
  if (avatarBtn) avatarBtn.onclick = () => { window.__avatarMenuOpen = !window.__avatarMenuOpen; render(); };

  const menuProfil = document.getElementById("menu-profil");
  if (menuProfil) menuProfil.onclick = () => {
    window.__avatarMenuOpen = false;
    currentPage = "profil";
    render();
  };

  const menuGuide = document.getElementById("menu-guide");
  if (menuGuide) menuGuide.onclick = () => {
    window.__avatarMenuOpen = false;
    currentPage = "guide";
    render();
  };

  const menuSupport = document.getElementById("menu-support");
  if (menuSupport) menuSupport.onclick = () => {
    window.__avatarMenuOpen = false;
    currentPage = "support";
    if (hasRole("Admin")) fetchAdminSupportRequests();
    else fetchSupportHistory();
    render();
  };

  const menuChangeCode = document.getElementById("menu-changecode");
  if (menuChangeCode) menuChangeCode.onclick = () => {
    window.__avatarMenuOpen = false;
    window.__showChangeCode = true;
    render();
  };

  const menuLogout = document.getElementById("menu-logout");
  if (menuLogout) menuLogout.onclick = logout;

  const ccCancel = document.getElementById("cc-cancel");
  if (ccCancel) ccCancel.onclick = () => {
    window.__showChangeCode = false;
    window.__changeCodeError = null;
    render();
  };

  const ccSubmit = document.getElementById("cc-submit");
  if (ccSubmit) ccSubmit.onclick = () => {
    const oldCode = document.getElementById("cc-old").value;
    const n1 = document.getElementById("cc-new1").value;
    const n2 = document.getElementById("cc-new2").value;
    if (!/^\d{4}$/.test(n1) || n1 !== n2) {
      window.__changeCodeError = "Les nouveaux codes ne correspondent pas ou ne sont pas valides (4 chiffres).";
      render();
      return;
    }
    changeCodeApi(oldCode, n1);
  };
}
