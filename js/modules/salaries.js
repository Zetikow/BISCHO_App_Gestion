// ===================================================================
// ESPACE SALARIÉS — navigateur de fichiers/dossiers Google Drive
// (voir apps-script/Salaries.gs). Module optionnel : à supprimer avec
// son fichier backend pour un club sans salarié.
// ===================================================================

let salariesState = { loading: false, loaded: false, error: null, currentFolder: null, folders: [], files: [], breadcrumb: [] };
let salariesCache = {}; // folderId -> {folders, files, currentFolder} — permet un affichage instantané en revenant sur un dossier déjà visité

function salariesFileIconPath(type) {
  const paths = {
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5-5 5-3-3-5 5"/>',
    link: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
  };
  return paths[type] || '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>';
}

function renderSalariesPage() {
  const canManage = hasRole("Salarié") || hasRole("Admin");
  let html = `<div class="page-title">Espace salariés</div><div class="page-sub">Documents, vidéos et liens du club.</div>`;

  if (!salariesState.loaded && !salariesState.loading && !salariesState.error) {
    setTimeout(() => fetchSalariesFolder(null), 0);
  }

  if (salariesState.error) {
    html += `<div class="card muted">${escapeHtml(salariesState.error)}</div>`;
    return html;
  }
  if (salariesState.loading || !salariesState.loaded) {
    html += `<div class="card muted">Chargement du dossier...</div>`;
    return html;
  }

  const currentFolderId = salariesState.currentFolder ? salariesState.currentFolder.id : null;

  if (canManage) {
    html += `<button class="btn add-btn-primary" id="toggle-add-salaries">+ Ajouter</button>`;
  }

  html += `<div class="breadcrumb">${salariesState.breadcrumb.map((b, i) => {
    const isLast = i === salariesState.breadcrumb.length - 1;
    return `${i > 0 ? '<span class="sep">›</span>' : ''}<span class="crumb ${isLast ? 'active' : ''}" ${isLast ? '' : `data-salaries-goto="${b.id}"`}>${escapeHtml(b.name)}</span>`;
  }).join("")}<span class="spacer"></span><span class="crumb" id="salaries-refresh" style="color:var(--accent2);">↻ Actualiser</span></div>`;

  if (salariesState.folders.length > 0) {
    html += `<div class="section-h">Dossiers</div><div class="folder-grid">`;
    salariesState.folders.forEach(f => {
      html += `<div class="folder-card">
        <div data-salaries-open-folder="${f.id}" data-salaries-open-folder-name="${escapeHtml(f.name)}" style="display:flex; flex-direction:column; gap:8px;">
          <div class="folder-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${NAV_ICONS.salaries}</svg></div>
          <div class="folder-name">${escapeHtml(f.name)}</div>
        </div>
        ${canManage ? `<div class="justif-edit-btn" style="align-self:flex-start;" data-salaries-delete="${f.id}" data-salaries-delete-type="folder">Supprimer</div>` : ""}
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="section-h">${salariesState.folders.length > 0 ? "Fichiers" : "Fichiers et liens"}</div>`;
  if (salariesState.files.length === 0) {
    html += `<div class="card muted">Aucun fichier pour le moment.</div>`;
  } else {
    salariesState.files.forEach(f => {
      const badge = f.isLink
        ? `<span class="file-badge">Lien</span>`
        : (f.previewUrl ? `<span class="file-badge inline">${f.iconType === 'video' ? 'Lecture' : 'Aperçu'}</span>` : `<span class="file-badge">Ouvrir</span>`);
      html += `<div class="file-row">
        <div class="file-icon ${f.iconType}"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${salariesFileIconPath(f.iconType)}</svg></div>
        <div class="file-info"
          data-salaries-open-file="${f.id}"
          data-salaries-file-preview="${f.previewUrl ? escapeHtml(f.previewUrl) : ''}"
          data-salaries-file-image="${f.imageUrl ? escapeHtml(f.imageUrl) : ''}"
          data-salaries-file-view="${f.viewUrl ? escapeHtml(f.viewUrl) : ''}"
          data-salaries-file-islink="${f.isLink ? '1' : '0'}"
          data-salaries-file-linkurl="${f.linkUrl ? escapeHtml(f.linkUrl) : ''}"
          data-salaries-file-name="${escapeHtml(f.name)}">
          <div class="file-title">${escapeHtml(f.name)}</div>
          <div class="file-meta">${f.date || ""}${f.sizeLabel ? " · " + f.sizeLabel : ""}</div>
        </div>
        ${badge}
        ${canManage ? iconBtn(ICON_CROSS, "ev-del", `data-salaries-delete="${f.id}" data-salaries-delete-type="file"`) : ""}
      </div>`;
    });
  }

  if (window.__salariesPreviewFile) {
    const pf = window.__salariesPreviewFile;
    html += `<div class="modal-overlay">
      <div class="modal-header">
        <div class="modal-close" id="salaries-modal-close">✕</div>
        <div class="modal-title">${escapeHtml(pf.name)}</div>
      </div>
      <div class="modal-preview">${pf.imageUrl
        ? `<img src="${escapeHtml(pf.imageUrl)}" alt="${escapeHtml(pf.name)}" style="width:100%; height:100%; object-fit:contain;" />`
        : `<iframe src="${escapeHtml(pf.previewUrl)}" allow="autoplay; fullscreen"></iframe>`}</div>
      ${pf.viewUrl ? `<div class="modal-footer" style="text-align:center; margin-top:10px;"><a href="${escapeHtml(pf.viewUrl)}" target="_blank" rel="noopener" style="color:var(--accent2); font-size:11.5px; font-weight:700; text-decoration:underline;">Ça ne s'affiche pas ? Ouvrir dans Google Drive</a></div>` : ""}
    </div>`;
  }

  html += renderAddSalariesSheet();

  return html;
}

// ===================== FICHE AJOUT (bottom sheet) =====================
function renderAddSalariesSheet() {
  if (!window.__showSalariesAdd) return "";
  const type = window.__salariesAddType || "dossier";
  const bodyHtml = `
    <div class="salaries-type-row">
      <button type="button" class="salaries-type-btn ${type === 'dossier' ? 'active' : ''}" data-salaries-add-type="dossier">Dossier</button>
      <button type="button" class="salaries-type-btn ${type === 'fichier' ? 'active' : ''}" data-salaries-add-type="fichier">Uploader</button>
      <button type="button" class="salaries-type-btn ${type === 'lien' ? 'active' : ''}" data-salaries-add-type="lien">Lien externe</button>
    </div>
    ${type === 'dossier' ? `
      <label class="field-label">Nom du dossier</label>
      <input id="salaries-folder-name" type="text" placeholder="ex: Communication" />
      <button class="btn" id="submit-salaries-folder" style="margin-top:8px;">Créer le dossier</button>
    ` : ""}
    ${type === 'fichier' ? `
      <label class="field-label">Fichier (image ou document)</label>
      <input id="salaries-file-input" type="file" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" style="width:100%; color:#e4e8f2; font-size:11px;" />
      <div class="profil-photo-note" style="text-align:left; margin-top:8px;">Vidéos et gros fichiers : dépose-les directement dans ce dossier depuis l'appli Google Drive — ils apparaîtront ici automatiquement.</div>
      <button class="btn" id="submit-salaries-file" style="margin-top:8px;" ${window.__salariesUploading ? "disabled" : ""}>${window.__salariesUploading ? (window.__salariesUploadStage || "Envoi en cours...") : "Envoyer"}</button>
    ` : ""}
    ${type === 'lien' ? `
      <label class="field-label">Titre</label>
      <input id="salaries-link-titre" type="text" placeholder="ex: Planning partagé" />
      <label class="field-label">Lien (URL)</label>
      <input id="salaries-link-url" type="text" placeholder="https://..." />
      <button class="btn" id="submit-salaries-link" style="margin-top:8px;">Ajouter le lien</button>
    ` : ""}`;

  return `<div class="sheet-overlay open" data-close-sheet="showSalariesAdd">
    <div class="sheet-scrim" data-close-sheet="showSalariesAdd"></div>
    <div class="sheet">
      <div class="sheet-close" data-close-sheet="showSalariesAdd">✕</div>
      <div class="sheet-grab"></div>
      <div class="sheet-hero">
        <div class="sheet-hero-eyebrow">Espace salariés</div>
        <h2>Ajouter</h2>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

// ===================== ACTIONS API =====================

async function fetchSalariesFolder(folderId, newBreadcrumb) {
  const cacheKey = folderId || "__root__";
  const cached = salariesCache[cacheKey];

  if (cached) {
    // Affichage instantané depuis le cache pendant qu'on rafraîchit en arrière-plan
    const bc = newBreadcrumb || (salariesState.breadcrumb.length ? salariesState.breadcrumb : [{ id: cached.currentFolder.id, name: "Racine" }]);
    salariesState = { loading: false, loaded: true, error: null, currentFolder: cached.currentFolder, folders: cached.folders, files: cached.files, breadcrumb: bc };
    render();
  } else {
    salariesState.loading = true;
    salariesState.error = null;
    if (newBreadcrumb) salariesState.breadcrumb = newBreadcrumb;
    render();
  }

  try {
    const params = new URLSearchParams({ action: "salariesList", authNom: session.nom, authCode: session.code });
    if (folderId) params.set("folderId", folderId);
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      salariesCache[cacheKey] = { folders: data.folders, files: data.files, currentFolder: data.currentFolder };
      let bc = newBreadcrumb || salariesState.breadcrumb;
      if (!bc || bc.length === 0) bc = [{ id: data.currentFolder.id, name: "Racine" }];
      else if (bc[0].id === null) bc[0].id = data.currentFolder.id;
      salariesState = { loading: false, loaded: true, error: null, currentFolder: data.currentFolder, folders: data.folders, files: data.files, breadcrumb: bc };
      isOnline = true;
    } else if (!cached) {
      salariesState.loading = false;
      salariesState.error = "Impossible d'ouvrir ce dossier.";
    }
  } catch (err) {
    isOnline = false;
    if (!cached) {
      salariesState.loading = false;
      salariesState.error = "Connexion impossible.";
    }
  }
  render();
}

function invalidateSalariesCache(folderId) {
  delete salariesCache[folderId || "__root__"];
}

async function salariesCreateFolderApi(parentId, name) {
  try {
    const params = new URLSearchParams({ action: "salariesCreateFolder", parentId: parentId || "", name, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    window.__showSalariesAddFolder = false;
    invalidateSalariesCache(parentId);
    await fetchSalariesFolder(parentId);
  } catch (err) { isOnline = false; render(); }
}

async function salariesAddLinkApi(parentId, titre, url) {
  try {
    const params = new URLSearchParams({ action: "salariesAddLink", parentId: parentId || "", titre, url, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    window.__showSalariesAdd = false;
    invalidateSalariesCache(parentId);
    await fetchSalariesFolder(parentId);
  } catch (err) { isOnline = false; render(); }
}

async function salariesUploadFileApi(parentId, filename, mimeType, base64) {
  try {
    const body = JSON.stringify({ action: "salariesUploadFile", parentId: parentId || "", filename, mimeType, base64, authNom: session.nom, authCode: session.code });
    await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
    window.__showSalariesAdd = false;
    window.__salariesUploading = false;
    window.__salariesUploadStage = null;
    invalidateSalariesCache(parentId);
    await fetchSalariesFolder(parentId);
  } catch (err) {
    isOnline = false;
    window.__salariesUploading = false;
    window.__salariesUploadStage = null;
    render();
  }
}

async function salariesDeleteApi(id, type, parentId) {
  try {
    const params = new URLSearchParams({ action: "salariesDelete", id, type, authNom: session.nom, authCode: session.code });
    await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`);
    invalidateSalariesCache(parentId);
    await fetchSalariesFolder(parentId);
  } catch (err) { isOnline = false; render(); }
}

function attachSalariesEvents() {
  const toggleAddSalaries = document.getElementById("toggle-add-salaries");
  if (toggleAddSalaries) toggleAddSalaries.onclick = () => {
    window.__showSalariesAdd = !window.__showSalariesAdd;
    render();
  };

  document.querySelectorAll("[data-salaries-add-type]").forEach(el => {
    el.onclick = () => { window.__salariesAddType = el.dataset.salariesAddType; render(); };
  });

  const submitSalariesFolder = document.getElementById("submit-salaries-folder");
  if (submitSalariesFolder) submitSalariesFolder.onclick = () => {
    const name = document.getElementById("salaries-folder-name").value.trim();
    if (!name) { alert("Donne un nom au dossier."); return; }
    const parentId = salariesState.currentFolder ? salariesState.currentFolder.id : null;
    salariesCreateFolderApi(parentId, name);
  };

  const submitSalariesLink = document.getElementById("submit-salaries-link");
  if (submitSalariesLink) submitSalariesLink.onclick = () => {
    const titre = document.getElementById("salaries-link-titre").value.trim();
    const url = document.getElementById("salaries-link-url").value.trim();
    if (!titre || !url) { alert("Renseigne un titre et un lien."); return; }
    const parentId = salariesState.currentFolder ? salariesState.currentFolder.id : null;
    salariesAddLinkApi(parentId, titre, url);
  };

  const submitSalariesFile = document.getElementById("submit-salaries-file");
  if (submitSalariesFile) submitSalariesFile.onclick = async () => {
    const input = document.getElementById("salaries-file-input");
    const file = input && input.files && input.files[0];
    if (!file) { alert("Choisis un fichier."); return; }
    if (file.size > 15 * 1024 * 1024) {
      alert("Ce fichier dépasse 15 Mo : dépose-le plutôt directement dans le dossier via Google Drive, il apparaîtra ici automatiquement.");
      return;
    }
    window.__salariesUploading = true;
    window.__salariesUploadStage = "Préparation...";
    render();

    let uploadBlob = file;
    let uploadName = file.name;
    let uploadType = file.type || "application/octet-stream";

    // Les photos de téléphone (souvent 3-8 Mo) sont compressées avant envoi — nettement plus
    // rapide et fiable que d'envoyer le fichier original tel quel.
    if (uploadType.indexOf("image/") === 0 && file.size > 400 * 1024) {
      window.__salariesUploadStage = "Compression de l'image...";
      render();
      try {
        uploadBlob = await compressImageFile(file);
        uploadType = "image/jpeg";
        uploadName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      } catch (err) {
        uploadBlob = file; // repli sur le fichier original si la compression échoue
      }
    }

    window.__salariesUploadStage = "Envoi en cours...";
    render();

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      const parentId = salariesState.currentFolder ? salariesState.currentFolder.id : null;
      salariesUploadFileApi(parentId, uploadName, uploadType, base64);
    };
    reader.readAsDataURL(uploadBlob);
  };

  document.querySelectorAll("[data-salaries-goto]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__showSalariesAdd = false;
      const targetId = el.dataset.salariesGoto;
      const idx = salariesState.breadcrumb.findIndex(b => b.id === targetId);
      const newBc = idx >= 0 ? salariesState.breadcrumb.slice(0, idx + 1) : salariesState.breadcrumb;
      fetchSalariesFolder(targetId, newBc);
    };
  });

  document.querySelectorAll("[data-salaries-open-folder]").forEach(el => {
    el.onclick = () => {
      vibrate();
      window.__showSalariesAdd = false;
      const id = el.dataset.salariesOpenFolder;
      const name = el.dataset.salariesOpenFolderName;
      const newBc = [...salariesState.breadcrumb, { id, name }];
      fetchSalariesFolder(id, newBc);
    };
  });

  document.querySelectorAll("[data-salaries-delete]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.salariesDelete;
      const type = el.dataset.salariesDeleteType;
      if (!confirm("Supprimer définitivement cet élément ?")) return;
      const parentId = salariesState.currentFolder ? salariesState.currentFolder.id : null;
      salariesDeleteApi(id, type, parentId);
    };
  });

  document.querySelectorAll("[data-salaries-open-file]").forEach(el => {
    el.onclick = () => {
      vibrate();
      const isLink = el.dataset.salariesFileIslink === "1";
      if (isLink) {
        window.open(el.dataset.salariesFileLinkurl, "_blank");
        return;
      }
      const previewUrl = el.dataset.salariesFilePreview;
      const imageUrl = el.dataset.salariesFileImage;
      const viewUrl = el.dataset.salariesFileView;
      if (!previewUrl && !imageUrl) {
        if (viewUrl) window.open(viewUrl, "_blank");
        return;
      }
      window.__salariesPreviewFile = { id: el.dataset.salariesOpenFile, name: el.dataset.salariesFileName, previewUrl, imageUrl, viewUrl };
      render();
    };
  });

  const salariesModalClose = document.getElementById("salaries-modal-close");
  if (salariesModalClose) salariesModalClose.onclick = () => { window.__salariesPreviewFile = null; render(); };

  const salariesRefresh = document.getElementById("salaries-refresh");
  if (salariesRefresh) salariesRefresh.onclick = () => {
    vibrate();
    const fid = salariesState.currentFolder ? salariesState.currentFolder.id : null;
    invalidateSalariesCache(fid);
    fetchSalariesFolder(fid);
  };
}
