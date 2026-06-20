/* ======================================================================
   ENGINE TREE (build + sidebar regrouping)
   - Builds a stable logical tree with unique sibling names + paths
   - Adds displayName + breadcrumb into node.userData
   - Regroups sidebar into GLOBAL + 13 main categories
   - Assigns sidebar group labels to all meshes inside each main category
====================================================================== */

function cleanName(s) {
  const t = (s || "").trim();
  return t || "(unnamed)";
}

function shouldHideNodeName(baseName) {
  return baseName === "Scene_Collection" || baseName === "NamedViews" || baseName === "Layers";
}

/* ===================== AUTO NAME (GENERIC) ===================== */

const BAD_NAME_RE = [
  /^object\s*\d+$/i,
  /^mesh\s*\d+$/i,
  /^node\s*\d+$/i,
  /^group\s*\d+$/i,
  /^cube(\.\d+)?$/i,
  /^sphere(\.\d+)?$/i,
  /^cylinder(\.\d+)?$/i,
  /^plane(\.\d+)?$/i,
  /^\d+$/i,
];

function uiClean(s) {
  return (s || "")
    .toString()
    .trim()
    .replace(/\s#\d+$/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadUiName(name) {
  const n = uiClean(name);
  if (!n) return true;
  return BAD_NAME_RE.some((re) => re.test(n));
}

function bestNameFromPath(path) {
  const parts = (path || "").split("/").map(uiClean).filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!isBadUiName(p)) return p;
  }

  return parts[parts.length - 1] || "Component";
}

function breadcrumbFromPath(path, maxParts = 3) {
  const parts = (path || "")
    .split("/")
    .map(uiClean)
    .filter((p) => p && !isBadUiName(p));

  if (!parts.length) return "";
  return parts.slice(Math.max(0, parts.length - maxParts)).join(" / ");
}

/* =============================================================== */

function makeUniqueSiblingName(uniqueNameCount, parentPath, baseName) {
  const key = `${parentPath}||${baseName}`;
  const c = (uniqueNameCount.get(key) || 0) + 1;

  uniqueNameCount.set(key, c);

  return c === 1 ? baseName : `${baseName} #${c}`;
}

function nodePath(parentPath, nodeNameUnique) {
  return parentPath ? `${parentPath}/${nodeNameUnique}` : nodeNameUnique;
}

function buildTreeInternal({
  node,
  parentPath = "",
  indexByPath,
  meshToPath,
  uniqueNameCount,
}) {
  const base = cleanName(node?.name);

  if (shouldHideNodeName(base)) {
    return {
      node,
      name: base,
      path: parentPath || base,
      children: (node.children || [])
        .map((ch) =>
          buildTreeInternal({
            node: ch,
            parentPath,
            indexByPath,
            meshToPath,
            uniqueNameCount,
          })
        )
        .filter(Boolean),
      _skipRender: true,
    };
  }

  const unique = makeUniqueSiblingName(uniqueNameCount, parentPath, base);
  const path = nodePath(parentPath, unique);

  if (!indexByPath.has(path)) indexByPath.set(path, node);
  if (node?.isMesh) meshToPath.set(node, path);

  const displayName = bestNameFromPath(path);

  node.userData = node.userData || {};

  if (!node.userData.displayName) {
    node.userData.displayName = displayName;
  }

  if (!node.userData.originalDisplayName) {
    node.userData.originalDisplayName = displayName;
  }

  if (!node.userData.breadcrumb) {
    node.userData.breadcrumb = breadcrumbFromPath(path);
  }

  if (!node.userData.path) {
    node.userData.path = path;
  }

  return {
    node,
    name: unique,
    path,
    children: (node.children || [])
      .map((ch) =>
        buildTreeInternal({
          node: ch,
          parentPath: path,
          indexByPath,
          meshToPath,
          uniqueNameCount,
        })
      )
      .filter(Boolean),
  };
}

export function collectMeshesInSubtree(treeNode, out = []) {
  if (!treeNode) return out;

  if (treeNode.node?.isMesh) out.push(treeNode.node);

  for (const ch of treeNode.children || []) {
    collectMeshesInSubtree(ch, out);
  }

  return out;
}

export function buildEngineTree(root) {
  const indexByPath = new Map();
  const meshToPath = new WeakMap();
  const uniqueNameCount = new Map();

  const modelTree = buildTreeInternal({
    node: root,
    parentPath: "",
    indexByPath,
    meshToPath,
    uniqueNameCount,
  });

  return { modelTree, indexByPath, meshToPath };
}

/* ======================================================================
   SIDEBAR GROUPING (ENGINE MAIN CATEGORIES)
====================================================================== */

function foldNorm(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-./\\]+/g, " ")
    .replace(/[^\w\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sidebarTitleOfNode(n) {
  return (
    n?.node?.userData?.displayName ||
    uiClean(n?.name) ||
    uiClean(n?.path?.split("/").pop()) ||
    ""
  );
}

const ENGINE_MAIN_CATEGORIES = [
  { sfiaId: "SFIA_1_STRUCTURE", title: "1. Structure", aliases: ["structure"] },
  { sfiaId: "SFIA_2_EXHAUST_SYSTEM", title: "2. Exhaust system", aliases: ["exhaust system", "exhaust"] },
  { sfiaId: "SFIA_3_PLATE_HEAT_EXCHANGER", title: "3. Plate heat exchanger", aliases: ["plate heat exchanger", "heat exchanger"] },
  { sfiaId: "SFIA_4_PORT_GENERATOR", title: "4. Port Generator", aliases: ["4 port generator", "port generator main", "port generator base", "exhaust insulation"] },
  { sfiaId: "SFIA_5_MAIN_ENGINE_NO_1", title: "5. Main engine No.1", aliases: ["main engine no 1", "main engine no.1", "main engine no1", "main engine #1", "main engine 1", "main engine", "engine no 1", "engine no.1", "engine no1", "me no 1", "me no.1", "me no1"] },
  { sfiaId: "SFIA_6_TRANSMISSION", title: "6. Transmission", aliases: ["transmission", "transmition", "6 transmission", "6 transmition"] },
  { sfiaId: "SFIA_7_PIPES", title: "7. Pipes", aliases: ["pipes", "pipe"] },
  { sfiaId: "SFIA_8_VALVES", title: "8. Valves", aliases: ["valves", "valve"] },
  { sfiaId: "SFIA_9_PROPELLER", title: "9. Propeller", aliases: ["propeller"] },
  { sfiaId: "SFIA_10_FIRE_SYSTEM", title: "10. Fire System", aliases: ["fire system", "fire"] },
  { sfiaId: "SFIA_11_LUBE_OIL_TANK", title: "11. Lube oil tank", aliases: ["lube oil tank", "lub oil tank", "lubricating oil tank"] },
  {
    sfiaId: "SFIA_12_SERVICE_AIR_RECEIVER",
    title: "12. Service Air Receiver",
    aliases: [
      "12 service air receiver",
      "12 service air reciever",
      "service air receiver",
      "service air reciever"
    ]
  },
  { sfiaId: "SFIA_13_DUPLEX_OIL_STRAINER", title: "13. Duplex Oil strainer", aliases: ["duplex oil strainer", "duplex strainer", "oil strainer"] },
];

const ENGINE_SYSTEM_PDFS = {
  "1. Structure": "/docs/main_docs/Body lines STRUKTURA BRODA.pdf",
  "2. Exhaust system": "/docs/main_docs/Ventilacija strojarnice - ENGINE ROOM VENTILATION.pdf",
  "7. Pipes": "/docs/main_docs/Shema goriva - CJEVOVOD GORIVA.pdf",
  "13. Duplex Oil strainer": "/docs/main_docs/Oil filter bench.pdf",
};

function componentKeyFromTitle(title = "") {
  return String(title)
    .trim()
    .replace(/^(\d+)\.\s*/, "$1 ")
    .replace(/\bNo\.(\d+)/gi, "No$1")
    .replace(/\s+/g, " ")
    .trim();
}

function makePdfNode(basePath, title, sfiaId = null) {
  const href = ENGINE_SYSTEM_PDFS[title] || null;

  return {
    node: null,
    name: "Documentation PDF",
    path: `${basePath}__sidebar/pdf/${foldNorm(title)}`,
    children: [],
    _custom: {
      type: "spec:pdf",
      label: "Documentation PDF",
      href,
      componentKey: sfiaId,
    },
  };
}

function makeUiGroupNode(basePath, title, key, sfiaId = null, children = []) {
  return {
    node: {
      userData: {
        sfiaId,
        displayName: title,
        originalDisplayName: title,
        sidebarGroupLabel: title,
      },
    },
    name: title,
    path: `${basePath}__sidebar/group/${key}`,
    children,
    _custom: {
      type: "ui:group",
      key,
      systemSfiaId: sfiaId,
    },
  };
}

function assignSidebarGroupLabel(treeNode, groupTitle) {
  if (!treeNode || !groupTitle) return;

  if (treeNode.node) {
    treeNode.node.userData = treeNode.node.userData || {};
    treeNode.node.userData.sidebarGroupLabel = groupTitle;
    treeNode.node.userData.sidebarLabel = groupTitle;

    if (!treeNode.node.userData.originalDisplayName) {
      treeNode.node.userData.originalDisplayName =
        treeNode.node.userData.displayName ||
        uiClean(treeNode.name) ||
        groupTitle;
    }
  }

  for (const ch of treeNode.children || []) {
    assignSidebarGroupLabel(ch, groupTitle);
  }
}

function findAncestorByLeadingNumber(n, leadingNumber) {
  let current = n;

  while (current) {
    const title = sidebarTitleOfNode(current);
    const path = current.path || "";

    if (
      foldNorm(title).startsWith(`${leadingNumber} `) ||
      foldNorm(path).includes(`${leadingNumber} transmission`)
    ) {
      return current;
    }

    current = current._parentTreeNode || null;
  }

  return n;
}

function collectMainCategoryRoots(originalRoot, maxDepth = 12) {
  const found = new Map();

  function walk(n, depth) {
    if (!n || depth > maxDepth) return;

    const title = foldNorm(sidebarTitleOfNode(n));
    const path = foldNorm(n?.path || "");
    const hay = `${title} ${path}`;

    for (const cat of ENGINE_MAIN_CATEGORIES) {
      if (found.has(cat.title)) continue;

      const catNumber = cat.title.split(".")[0];

      const nodeSfiaId = n?.node?.userData?.sfiaId || null;

      const exactSfiaMatch =
        nodeSfiaId && nodeSfiaId === cat.sfiaId;

      const expectedTitle = foldNorm(
        `${catNumber} ${cat.title.replace(`${catNumber}.`, "")}`
      );

      const exactCategoryMatch =
        exactSfiaMatch ||
        foldNorm(n.name).startsWith(expectedTitle);

      const matched =
        exactSfiaMatch ||
        exactCategoryMatch ||
        cat.aliases.some((alias) => {
          const a = foldNorm(alias);
          return title === a || title.startsWith(a) || hay === a;
        });

      if (matched) {
        if (cat.title === "6. Transmission") {
          found.set(cat.title, findAncestorByLeadingNumber(n, 6));
        } else if (cat.title === "12. Service Air Receiver") {
          found.set(cat.title, findAncestorByLeadingNumber(n, 12));
        } else {
          found.set(cat.title, n);
        }
      }
    }

    for (const ch of n.children || []) {
      ch._parentTreeNode = n;
    }

    for (const ch of n.children || []) {
      walk(ch, depth + 1);
    }
  }

  walk(originalRoot, 0);

  return ENGINE_MAIN_CATEGORIES
    .map((cat) => {
      const node = found.get(cat.title);
      return node ? { cat, node } : null;
    })
    .filter(Boolean);
}

export function regroupTreeForSidebar(originalRoot, opts = {}) {
  if (!originalRoot) return originalRoot;

  const { categoryMaxDepth = 12 } = opts;
  const basePath = originalRoot.path || "root";

  const categoryRoots = collectMainCategoryRoots(originalRoot, categoryMaxDepth);

  if (!categoryRoots.length) return originalRoot;

  const categoryGroups = categoryRoots.map(({ cat, node }) => {
  const title = cat.title;
    assignSidebarGroupLabel(node, title);

    const baseChildren =
      Array.isArray(node.children) && node.children.length
        ? node.children
        : [node];

    const pdfNode = makePdfNode(basePath, title, cat.sfiaId);
    const children = [...baseChildren, pdfNode];

    const group = makeUiGroupNode(
      basePath,
      title,
      foldNorm(title),
      cat.sfiaId,
      children
    );

    group.node = node.node;
    group._sourceTreeNode = node;

    if (group.node) {
      group.node.userData = group.node.userData || {};
      group.node.userData.sidebarGroupLabel = title;
      group.node.userData.sidebarLabel = title;
    }

    return group;
  });

  const globalGroup = makeUiGroupNode(
    basePath,
    "GLOBAL",
    "global",
    categoryGroups.map((g) => ({
      ...g,
      path: `${basePath}__sidebar/global/${g._custom.key}`,
      _custom: {
        ...g._custom,
        key: g._custom.key,
      },
    }))
  );

  return {
    node: originalRoot.node,
    name: originalRoot.name,
    path: basePath,
    children: [globalGroup, ...categoryGroups],
    _skipRender: true,
  };
}