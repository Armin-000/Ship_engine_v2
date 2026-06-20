/* ======================================================================
   ENGINE FOCUS (Engine 2.0)
   - Focus / isolate a selected engine part
   - Info panel data through API
   - READ ONLY: title, description, docs, schematics, maintenance
   - Editing is now handled through PostgreSQL / pgAdmin4
====================================================================== */

import * as THREE from 'three';
import { isRenderablePart } from '../utils.js';
import { API_BASE } from '../../../../../config/api.js';

const gsap = window.gsap || null;

const API_BASE_URL = API_BASE;
const API_TIMEOUT_MS = 7000;

let cameraRef = null;
let controlsRef = null;
let rootRef = null;
let labelItemsRef = null;
let externalVisibilityRefresh = null;
let visibilityRef = null;
let onFocusChange = null;
let onExitFocusCb = null;

let focusMode = false;
let focusedRoot = null;

const savedVisibility = new Map();
const savedLabelDisplay = new WeakMap();
const savedCamPos = new THREE.Vector3();
const savedCamTarget = new THREE.Vector3();

let infoPanel = null;
let infoTitleEl = null;
let infoTextEl = null;
let infoCloseBtn = null;
let infoDocBtn = null;
let infoSchematicsBtn = null;
let infoMaintenanceBtn = null;

let currentComponentKey = null;
let currentComponentPayload = null;
let currentMeshOrObj = null;
let infoRequestToken = 0;

function getRenderableRoot(obj) {
  if (!obj) return obj;
  if (isRenderablePart(obj)) return obj;

  let p = obj.parent;
  while (p && p !== rootRef && !isRenderablePart(p)) p = p.parent;

  return isRenderablePart(p) ? p : obj;
}

function collectRenderableSubtree(rootObj) {
  const set = new Set();
  if (!rootObj) return set;

  rootObj.traverse((o) => {
    if (isRenderablePart(o)) set.add(o);
  });

  if (set.size === 0 && isRenderablePart(rootObj)) {
    set.add(rootObj);
  }

  return set;
}

function makeComponentKey(labelText, meshOrObj) {
  if (meshOrObj?.userData?.sfiaId) {
    return meshOrObj.userData.sfiaId;
  }

  if (meshOrObj?.userData?.componentKey) {
    return meshOrObj.userData.componentKey;
  }

  const path =
    meshOrObj?.userData?.breadcrumb ||
    meshOrObj?.userData?.path ||
    meshOrObj?.name ||
    labelText ||
    'component';

  return `path:${path.toString().trim()}`;
}

function getDefaultTitleFromKey(key) {
  return (
    String(key || 'Component')
      .replace(/^path:/, '')
      .replace(/^name:/, '')
      .replace(/^uuid:/, '')
      .split('/')
      .pop()
      .replace(/_/g, ' ')
      .trim() || 'Component'
  );
}

function makeFallbackComponent(labelText, meshOrObj) {
  const key = makeComponentKey(labelText, meshOrObj);

  const title =
    (labelText && labelText.toString().trim()) ||
    meshOrObj?.userData?.displayName ||
    getDefaultTitleFromKey(key);

  return {
    key,
    title,
    description: 'No description available for this component yet.',
    documents: {
      documentation: null,
      schematics: null,
      maintenance: null,
    },
    source: 'fallback',
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function getComponentFromApi(key, candidates = []) {
  const params = new URLSearchParams();

  params.set('key', key);

  candidates
    .filter(Boolean)
    .forEach((candidate) => {
      params.append('candidate', candidate);
    });

  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/components/resolve?${params.toString()}`
  );

  if (!res.ok) {
    throw new Error(`Component API failed: ${res.status}`);
  }

  return await res.json();
}

function normalizeComponentPayload(apiData, fallback) {
  const data = apiData && typeof apiData === 'object' ? apiData : {};

  const documents = data.documents || {
    documentation: data.documentation ?? null,
    schematics: data.schematics ?? null,
    maintenance: data.maintenance ?? null,
  };

  return {
    key: data.key || fallback.key,
    title: data.title || fallback.title || getDefaultTitleFromKey(fallback.key),
    description:
      data.description ||
      fallback.description ||
      'No description available.',
    documents: {
      documentation: documents.documentation || null,
      schematics: documents.schematics || null,
      maintenance: documents.maintenance || null,
    },
    source: data.source || 'api',
  };
}

function ensureInfoPanel() {
  if (infoPanel) return infoPanel;

  const viewer = document.getElementById('viewer');
  if (!viewer) return null;

  const panel = document.createElement('div');
  panel.className = 'engine-info-panel';

  panel.innerHTML = `
    <div class="engine-info-inner">
      <button class="engine-info-close" type="button" aria-label="Close">×</button>

      <div class="engine-info-main">
        <div class="engine-info-view">
          <h4 class="engine-info-title"></h4>
          <p class="engine-info-text"></p>
        </div>

        <div class="engine-info-divider"></div>

        <div class="engine-info-doc-section">
          <div class="engine-info-doc-heading">DOCUMENTATION</div>

          <div class="engine-info-doc-grid">
            <a class="engine-info-doc-action" id="engine-info-schematics" href="#" target="_blank" rel="noopener noreferrer">
              <span class="engine-info-doc-icon">▧</span>
              <span>Schematics</span>
            </a>

            <a class="engine-info-doc-action" id="engine-info-doc" href="#" target="_blank" rel="noopener noreferrer">
              <span class="engine-info-doc-icon">◎</span>
              <span>Documentation</span>
            </a>

            <a class="engine-info-doc-action" id="engine-info-maintenance" href="#" target="_blank" rel="noopener noreferrer">
              <span class="engine-info-doc-icon">▻</span>
              <span>Maintenance</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  viewer.appendChild(panel);

  infoTitleEl = panel.querySelector('.engine-info-title');
  infoTextEl = panel.querySelector('.engine-info-text');

  infoCloseBtn = panel.querySelector('.engine-info-close');

  infoDocBtn = panel.querySelector('#engine-info-doc');
  infoSchematicsBtn = panel.querySelector('#engine-info-schematics');
  infoMaintenanceBtn = panel.querySelector('#engine-info-maintenance');

  infoCloseBtn?.addEventListener('click', () => exitFocusMode());

  panel.style.display = 'none';
  infoPanel = panel;

  return panel;
}

function setDocButton(button, href) {
  if (!button) return;

  if (href) {
    button.href = href;
    button.style.display = 'inline-flex';
    return;
  }

  button.removeAttribute('href');
  button.style.display = 'none';
}

function renderInfoPayload(payload) {
  if (!infoPanel || !infoTitleEl || !infoTextEl) return;

  const docs = payload?.documents || {};

  infoTitleEl.textContent = payload?.title || 'Component';
  infoTextEl.textContent =
    payload?.description || 'No description available.';

  setDocButton(infoDocBtn, docs.documentation);
  setDocButton(infoSchematicsBtn, docs.schematics);
  setDocButton(infoMaintenanceBtn, docs.maintenance);
}

async function showInfoPanel(labelText, meshOrObj) {
  const panel = ensureInfoPanel();
  if (!panel || !infoTitleEl || !infoTextEl) return;

  const requestId = ++infoRequestToken;

  const fallback = makeFallbackComponent(labelText, meshOrObj);
  const key = fallback.key;

  currentMeshOrObj = meshOrObj || null;
  currentComponentKey = key;
  currentComponentPayload = fallback;

  panel.style.display = 'block';

  renderInfoPayload({
    ...fallback,
    description: 'Loading component data...',
  });

  try {
    const candidates = [
      labelText,
      meshOrObj?.name,
      meshOrObj?.userData?.displayName,
      meshOrObj?.userData?.originalDisplayName,
      meshOrObj?.userData?.breadcrumb,
      meshOrObj?.userData?.path,
    ];

    const apiData = await getComponentFromApi(key, candidates);

    if (requestId !== infoRequestToken) return;

    const normalized = normalizeComponentPayload(apiData, fallback);

    currentComponentPayload = {
      ...normalized,
      key,
    };

    renderInfoPayload(currentComponentPayload);
  } catch (err) {
    if (requestId !== infoRequestToken) return;

    console.warn('[INFO API] using fallback component data:', err?.message || err);

    currentComponentPayload = {
      ...fallback,
      key,
      title: fallback.title || getDefaultTitleFromKey(key),
    };

    renderInfoPayload(currentComponentPayload);
  }
}

function hideInfoPanel() {
  if (!infoPanel) return;

  infoPanel.style.display = 'none';

  if (infoDocBtn) infoDocBtn.style.display = 'none';
  if (infoSchematicsBtn) infoSchematicsBtn.style.display = 'none';
  if (infoMaintenanceBtn) infoMaintenanceBtn.style.display = 'none';

  currentComponentKey = null;
  currentComponentPayload = null;
  currentMeshOrObj = null;
}

export function initFocus({
  camera,
  controls,
  root,
  labelItems,
  refreshVisibility,
  visibility = null,
  onFocus = null,
  onExitFocus = null,
}) {
  cameraRef = camera || null;
  controlsRef = controls || null;
  rootRef = root || null;
  labelItemsRef = labelItems || null;

  externalVisibilityRefresh =
    typeof refreshVisibility === 'function' ? refreshVisibility : null;

  visibilityRef = visibility || null;

  onFocusChange = typeof onFocus === 'function' ? onFocus : null;
  onExitFocusCb = typeof onExitFocus === 'function' ? onExitFocus : null;
}

export function isFocusMode() {
  return focusMode;
}

function computeFramedCameraPosition(targetObj) {
  const box = new THREE.Box3().setFromObject(targetObj);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  box.getCenter(center);
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const safeDim = Math.max(maxDim, 0.25);

  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  const radius = Math.max(sphere.radius, safeDim * 0.5);
  const fov = (cameraRef.fov * Math.PI) / 180;
  const fit = radius / Math.tan(fov / 2);
  const distance = Math.max(fit * 1.25, 0.8);

  const dir = new THREE.Vector3()
    .subVectors(cameraRef.position, controlsRef.target)
    .normalize();

  if (!Number.isFinite(dir.x + dir.y + dir.z) || dir.lengthSq() < 1e-6) {
    dir.set(2.5, 1.5, 2.5).normalize();
  }

  const newPos = center.clone().add(dir.multiplyScalar(distance));

  return { center, newPos };
}

export function focusOnPart(meshOrObj, labelText) {
  if (!cameraRef || !controlsRef || !rootRef) return;
  if (!meshOrObj) return;

  visibilityRef?.clearHoverUX?.();

  const targetRoot = getRenderableRoot(meshOrObj);
  if (focusedRoot === targetRoot) return;

  if (focusMode && focusedRoot && focusedRoot !== targetRoot) {
    if (gsap) {
      gsap.killTweensOf(cameraRef.position);
      gsap.killTweensOf(controlsRef.target);
    }

    hideInfoPanel();
  }

  if (!focusedRoot) {
    savedVisibility.clear();

    rootRef.traverse((o) => {
      if (isRenderablePart(o)) savedVisibility.set(o, o.visible);
    });

    savedCamPos.copy(cameraRef.position);
    savedCamTarget.copy(controlsRef.target);

    if (Array.isArray(labelItemsRef)) {
      labelItemsRef.forEach((item) => {
        if (item?.el && !savedLabelDisplay.has(item.el)) {
          savedLabelDisplay.set(item.el, item.el.style.display);
        }
      });
    }
  }

  focusedRoot = targetRoot;
  focusMode = true;

  if (Array.isArray(labelItemsRef)) {
    labelItemsRef.forEach((item) => {
      if (item?.el) item.el.style.display = 'none';
    });
  }

  const allowed = collectRenderableSubtree(targetRoot);

  rootRef.traverse((o) => {
    if (!isRenderablePart(o)) return;
    o.visible = allowed.has(o);
  });

  const { center, newPos } = computeFramedCameraPosition(targetRoot);
  const duration = 0.8;

  if (gsap) {
    gsap.killTweensOf(cameraRef.position);
    gsap.killTweensOf(controlsRef.target);

    gsap.to(cameraRef.position, {
      duration,
      x: newPos.x,
      y: newPos.y,
      z: newPos.z,
      ease: 'power2.out',
      onUpdate: () => controlsRef.update(),
    });

    gsap.to(controlsRef.target, {
      duration,
      x: center.x,
      y: center.y,
      z: center.z,
      ease: 'power2.out',
      onUpdate: () => controlsRef.update(),
    });
  } else {
    cameraRef.position.copy(newPos);
    controlsRef.target.copy(center);
    controlsRef.update();
  }

  const autoLabel =
    (labelText && labelText.toString().trim()) ||
    meshOrObj?.userData?.displayName ||
    targetRoot?.userData?.displayName ||
    meshOrObj?.name ||
    '';

  try {
    onFocusChange?.({
      active: true,
      mesh: meshOrObj,
      label: autoLabel,
      root: targetRoot,
    });
  } catch (_) {}

  showInfoPanel(autoLabel, meshOrObj);
}

export async function refreshFocusedInfoPanel() {
  if (!focusMode || !currentComponentKey || !currentMeshOrObj) return;

  const label =
    currentMeshOrObj?.userData?.displayName ||
    currentMeshOrObj?.userData?.sidebarLabel ||
    currentMeshOrObj?.name ||
    '';

  await showInfoPanel(label, currentMeshOrObj);
}

export function exitFocusMode() {
  visibilityRef?.clearHoverUX?.();

  if (!cameraRef || !controlsRef || !rootRef) {
    hideInfoPanel();
    focusedRoot = null;
    focusMode = false;

    try {
      onFocusChange?.({ active: false, mesh: null, label: '', root: null });
    } catch (_) {}

    try {
      onExitFocusCb?.();
    } catch (_) {}

    return;
  }

  if (!focusedRoot) {
    hideInfoPanel();
    focusMode = false;

    try {
      onFocusChange?.({ active: false, mesh: null, label: '', root: null });
    } catch (_) {}

    try {
      onExitFocusCb?.();
    } catch (_) {}

    return;
  }

  rootRef.traverse((o) => {
    if (!isRenderablePart(o)) return;
    if (savedVisibility.has(o)) o.visible = savedVisibility.get(o);
  });

  focusedRoot = null;
  focusMode = false;
  hideInfoPanel();

  if (Array.isArray(labelItemsRef)) {
    labelItemsRef.forEach((item) => {
      if (!item?.el) return;

      const prev = savedLabelDisplay.get(item.el);
      item.el.style.display = prev ?? '';
    });
  }

  externalVisibilityRefresh?.();

  const duration = 0.8;

  if (gsap) {
    gsap.killTweensOf(cameraRef.position);
    gsap.killTweensOf(controlsRef.target);

    gsap.to(cameraRef.position, {
      duration,
      x: savedCamPos.x,
      y: savedCamPos.y,
      z: savedCamPos.z,
      ease: 'power2.out',
      onUpdate: () => controlsRef.update(),
    });

    gsap.to(controlsRef.target, {
      duration,
      x: savedCamTarget.x,
      y: savedCamTarget.y,
      z: savedCamTarget.z,
      ease: 'power2.out',
      onUpdate: () => controlsRef.update(),
    });
  } else {
    cameraRef.position.copy(savedCamPos);
    controlsRef.target.copy(savedCamTarget);
    controlsRef.update();
  }

  try {
    onFocusChange?.({ active: false, mesh: null, label: '', root: null });
  } catch (_) {}

  try {
    onExitFocusCb?.();
  } catch (_) {}
}