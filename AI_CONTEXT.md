
# AI_CONTEXT.md — SMECO 2.0

## 1. Project Identity

## 2. Architecture Overview

## 3. Golden Rules

## 4. Frontend Ownership Map

### app.entry.js
### viewer.core.js
### engine.model.js
### tree.js
### names.js

## 5. Controllers

### focus.js
### picking.js
### hover.js
### labels.js
### visibility.js
### explode.js
### systemExplode.js
### reset.js

## 6. Sidebar

### engine.sidebar.js
### render.js
### state.js
### dom.js
### panels.js

## 7. Backend Ownership Map

### server.js
### db.js
### initDatabase.js
### auth.js
### events.js
### audit.js

## 8. Route Ownership Map

### auth.routes.js
### components.routes.js
### systems.routes.js
### users.routes.js
### documents.routes.js
### events.routes.js

## 9. Database Tables

systems
components
documents
component_aliases
component_relations
users
audit_logs

## 10. Live Update System

LISTEN / NOTIFY
SSE
refreshData()
refreshFocusedInfoPanel()

## 11. Current Stable Features

## 12. Debug Checklist

## 13. Known Gotchas

## 14. Future Improvements

## 15. Instructions For Future AI Assistants
```

---

# Primjer kako bi izgledao jedan file

## focus.js

```txt
Owner:
Info panel

Responsibilities:
- title
- description
- documentation
- schematics
- maintenance

Current mode:
READ ONLY

Metadata source:
PostgreSQL

Live refresh:
refreshFocusedInfoPanel()

Must not:
- upload PDFs
- save metadata
- delete documents

Important:
Uses component_aliases through /api/components/resolve.
```

---

## render.js

```txt
Owner:
Sidebar renderer

Responsibilities:
- componentsCache
- systemsCache
- system PDF nodes

Current mode:
READ ONLY

Live refresh:
refreshData()

Must not:
- upload PDF
- add PDF
- change PDF
- delete PDF

System PDFs:
componentKey = system sfiaId
```

---

## tree.js

```txt
Owner:
Sidebar hierarchy

Responsibilities:
- build tree
- regroup tree
- makePdfNode()

Important:
componentKey must equal system sfiaId.

Wrong:
3 Plate heat exchanger

Correct:
SFIA_3_PLATE_HEAT_EXCHANGER
```

---

## systems.routes.js

```txt
Owner:
13 main systems

Returns:
- title
- description
- documents

Source:
systems table + documents table
```

---

## events.js

```txt
Owner:
SSE layer

Flow:

PostgreSQL
↓
LISTEN smeco_changes
↓
broadcast database_change
↓
/api/events
```
