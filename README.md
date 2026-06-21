<div align="center">

<img src="./public/images/github_logo.png" alt="Ship Engine v2 Logo" width="180"/>

# Ship Engine v2

Interactive 3D ship engine platform built with Three.js, Express and PostgreSQL, featuring JWT authentication and real-time metadata synchronization via Server-Sent Events.

[![Three.js](https://img.shields.io/badge/Three.js-0.160.0-black?logo=three.js&logoColor=white)](https://threejs.org)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?logo=postgresql&logoColor=white)](https://postgresql.org)
[![License](https://img.shields.io/badge/License-ISC-blue)](LICENSE)

</div>

---

# Overview

Ship Engine v2 is a browser-based interactive 3D platform designed for inspection and exploration of complex marine propulsion systems.

The application allows engineers and technical personnel to:

- navigate a complete engine room hierarchy,
- inspect assemblies and individual components,
- access technical documentation,
- isolate and explode systems,
- synchronize metadata in real time,
- and manage engineering information through PostgreSQL.

The platform follows a layered architecture:

```text
PostgreSQL
        ↓
Express REST API
        ↓
Server-Sent Events
        ↓
Three.js Viewer
```

Metadata is stored in PostgreSQL and synchronized automatically with the frontend without requiring page refreshes.

---

# Features

## Real-Time 3D Rendering

- Three.js WebGL renderer
- DRACO-compressed GLB model
- Light and dark themes
- Responsive camera controls
- Adaptive pixel ratio

---

## Interactive Component Inspection

- Raycaster picking
- Focus mode
- Component isolation
- Automatic camera framing
- Hover highlighting
- Floating labels

---

## Hierarchical Navigation

- Sidebar tree rebuilt from GLB hierarchy
- 13 independent ship systems
- Unlimited depth
- Visibility control
- Group expansion and collapse

---

## Exploded Views

### Global Explode

Separates the complete engine room model.

### System Explode

Separates only the selected system.

Supported systems:

- Structure
- Exhaust System
- Plate Heat Exchanger
- Port Generator
- Main Engine No.1
- Transmission
- Pipes
- Valves
- Propeller
- Fire System
- Lube Oil Tank
- Service Air Receiver
- Duplex Oil Strainer

---

## Documentation System

Each component may contain:

### Documentation

Technical manuals and specifications.

### Schematics

Drawings and engineering diagrams.

### Maintenance

Maintenance instructions and procedures.

---

## Authentication

- JWT login
- Token persistence
- Session validation
- Role-based access

Roles:

- admin
- editor
- viewer

---

## Real-Time Synchronization

Metadata updates propagate automatically:

```text
PostgreSQL
↓
Trigger
↓
pg_notify()
↓
events.js
↓
SSE
↓
Sidebar refresh
↓
Info panel refresh
```

No page reloads are required.

---

## PostgreSQL Source of Truth

Ship Engine v2 follows one important rule:

```text
PostgreSQL owns metadata.
```

The frontend viewer is intentionally:

```text
READ ONLY
```

Metadata editing is performed through PostgreSQL.

---

# Architecture

```text
                    ┌──────────────────┐
                    │    PostgreSQL    │
                    └────────┬─────────┘
                             │
                      LISTEN / NOTIFY
                             │
                             ▼
                    ┌──────────────────┐
                    │     Express       │
                    │      REST API     │
                    └────────┬─────────┘
                             │
                   Server-Sent Events
                             │
                             ▼
                    ┌──────────────────┐
                    │  Three.js Viewer  │
                    └────────┬─────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
     Sidebar            Focus Panel         Controllers
```

---

# Tech Stack

| Layer | Technology |
|---------|-----------|
| Frontend | Vanilla JavaScript |
| 3D Engine | Three.js |
| Backend | Express |
| Database | PostgreSQL |
| Authentication | JWT |
| Realtime Updates | Server-Sent Events |
| Notifications | LISTEN / NOTIFY |
| Animation | GSAP |
| Compression | DRACO |
| Build Tool | Vite |
| Runtime | Node.js |

---

# Table of Contents

- Overview
- Features
- Architecture
- Tech Stack
- Project Structure
- Database Architecture
- Live Update System
- Installation
- Quick Start
- API Reference
- Ship Systems
- Current Capabilities
- Design Decisions
- Roadmap
- License

---

# Project Structure

```text
Ship_engine_v2/
│
├── index.html
├── package.json
├── vite.config.js
├── start.sh
├── .env
├── AI_CONTEXT.md
│
├── config/
│   └── api.js
│
├── viewer/
│   ├── auth.js
│   ├── preloader.js
│   │
│   ├── app/
│   │   └── app.entry.js
│   │
│   ├── engine/
│   │   ├── core/
│   │   │   └── viewer.core.js
│   │   │
│   │   └── models/
│   │       └── engine/
│   │           ├── engine.model.js
│   │           ├── tree.js
│   │           ├── names.js
│   │           ├── utils.js
│   │           │
│   │           ├── controllers/
│   │           │   ├── focus.js
│   │           │   ├── picking.js
│   │           │   ├── hover.js
│   │           │   ├── labels.js
│   │           │   ├── visibility.js
│   │           │   ├── explode.js
│   │           │   ├── explode.config.js
│   │           │   ├── systemExplode.js
│   │           │   ├── system-explode.config.js
│   │           │   └── reset.js
│   │           │
│   │           └── ui/
│   │               └── sidebar/
│   │                   └── engine.sidebar.js
│   │
│   └── ui/
│       └── sidebar/
│           ├── render.js
│           ├── state.js
│           ├── dom.js
│           ├── panels.js
│           ├── events.js
│           ├── icons.js
│           └── api.js
│
├── css/
│   ├── viewer-base.css
│   ├── viewer-ui.css
│   ├── viewer-sidebar.css
│   ├── viewer-preloader.css
│   └── viewer-login.css
│
├── public/
│   ├── glb/
│   ├── docs/
│   ├── images/
│   └── draco/
│
└── backend/
    ├── server.js
    ├── db.js
    ├── auth.js
    ├── audit.js
    ├── events.js
    ├── initDatabase.js
    ├── utils.js
    │
    └── routes/
        ├── auth.routes.js
        ├── components.routes.js
        ├── systems.routes.js
        ├── users.routes.js
        ├── documents.routes.js
        ├── status.routes.js
        ├── audit.routes.js
        └── events.routes.js
```

---

# Database Architecture

Ship Engine v2 uses PostgreSQL as the primary source of truth.

---

## systems

Contains the 13 top-level ship systems.

Examples:

```text
SFIA_1_STRUCTURE
SFIA_2_EXHAUST_SYSTEM
SFIA_3_PLATE_HEAT_EXCHANGER
...
SFIA_13_DUPLEX_OIL_STRAINER
```

Responsibilities:

- system title
- system description
- system documentation

---

## components

Contains:

- subassemblies
- components
- individual parts

Examples:

```text
SFIA_5_2_GEARBOX

SFIA_6_0_1_1_1_0_ENGINE_662

SFIA_8_1_1_1_7_2_MAIN_NUT_2
```

---

## documents

Stores PDF documents.

Supported types:

```text
documentation
schematics
maintenance
```

Documents may belong to:

- systems
- components

---

## component_aliases

Provides alias resolution between GLB names and SFIA IDs.

Example:

```text
601110 Engine 662
↓
SFIA_6_0_1_1_1_0_ENGINE_662
↓
Diesel engine
```

---

## component_relations

Stores logical relations between components.

Examples:

```text
belongs_to

connected_to

drives

supported_by
```

---

## users

Stores application users.

Supported roles:

```text
admin

editor

viewer
```

---

## audit_logs

Stores:

- metadata changes
- user actions
- document updates

---

# Live Update System

Ship Engine v2 uses PostgreSQL LISTEN / NOTIFY together with Server-Sent Events.

---

## Update Flow

```text
pgAdmin4
↓
PostgreSQL
↓
Trigger
↓
pg_notify()
↓
events.js
↓
SSE
↓
engine.model.js
↓
Sidebar refresh
↓
Info panel refresh
```

---

## Why SSE?

Using Server-Sent Events eliminates the need for:

```text
window.location.reload()

manual refresh

polling
```

Changes become visible immediately.

---

## Sidebar Refresh

```text
database_change
↓
engine.model.js
↓
refreshData()
↓
render.js
↓
componentsCache
↓
systemsCache
↓
sidebar update
```

---

## Focus Panel Refresh

```text
database_change
↓
engine.model.js
↓
refreshFocusedInfoPanel()
↓
focus.js
↓
updated metadata
```

Updates include:

- title
- description
- documentation
- schematics
- maintenance

---

# Installation

## Prerequisites

- Node.js 18+
- npm
- PostgreSQL
- Git

---

## Clone Repository

```bash
git clone https://github.com/Armin-000/Ship_engine_v2.git

cd Ship_engine_v2
```

---

## Install Dependencies

Frontend:

```bash
npm install
```

Backend:

```bash
cd backend

npm install
```

---

## Configure Environment Variables

Frontend:

```env
VITE_API_BASE_URL=http://localhost:3001
```

Backend:

```env
DATABASE_URL=postgres://...

JWT_SECRET=your_secret
```

---

# Quick Start

The easiest way to run the project is:

```bash
chmod +x start.sh

./start.sh
```

The startup script automatically:

- verifies Node.js
- checks ports
- installs missing packages
- creates required directories
- validates `.env`
- starts backend
- starts frontend
- performs health checks
- opens the browser

---

## Default URLs

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:3001
```

Health:

```text
http://localhost:3001/api/health
```

Status:

```text
http://localhost:3001/api/status
```

SSE:

```text
http://localhost:3001/api/events
```

---

# Manual Startup

## Backend

```bash
cd backend

npm start
```

---

## Frontend

```bash
npm run dev
```

---

# Production Build

```bash
npm run build
```

The optimized bundle will be generated inside:

```text
dist/
```

---

# Health Check

```bash
curl http://localhost:3001/api/health
```

---

# Status Endpoint

```bash
curl http://localhost:3001/api/status
```

---

# SSE Endpoint

Open:

```text
http://localhost:3001/api/events
```

Expected:

```text
data: {"type":"connected"}

data: {"type":"database_change", ...}
```

---

# API Reference

Base URL:

```text
http://localhost:3001
```

---

## Health

### GET /api/health

Returns service health information.

Example:

```json
{
  "status": "ok"
}
```

---

## Status

### GET /api/status

Returns platform statistics.

Example:

```json
{
  "online": true,
  "systemsReady": 13,
  "components": 246,
  "pdfDocuments": 18
}
```

---

## Authentication

### POST /api/auth/login

Authenticates the user.

---

### GET /api/auth/me

Validates the JWT token.

---

## Systems

### GET /api/systems

Returns all top-level systems.

Includes:

- title
- description
- documentation
- schematics
- maintenance

---

## Components

### GET /api/components

Returns all component metadata.

---

### GET /api/components/:key

Returns a single component.

---

### GET /api/components/resolve

Resolves component aliases.

Used by:

```text
focus.js
```

Example:

```text
601110 Engine 662
↓
SFIA_6_0_1_1_1_0_ENGINE_662
↓
Diesel engine
```

---

### GET /api/components/:key/relations

Returns logical relations.

---

## Events

### GET /api/events

Opens Server-Sent Events connection.

Used by:

```text
engine.model.js
```

---

## Users

Admin only.

Examples:

```text
GET /api/users

PUT /api/users/:username

DELETE /api/users/:username
```

---

## Audit

Admin only.

```text
GET /api/audit-logs
```

---

# Ship Systems

The engine room model currently contains 13 independent systems.

| # | System |
|---|---------|
| 1 | Structure |
| 2 | Exhaust System |
| 3 | Plate Heat Exchanger |
| 4 | Port Generator |
| 5 | Main Engine No.1 |
| 6 | Transmission |
| 7 | Pipes |
| 8 | Valves |
| 9 | Propeller |
| 10 | Fire System |
| 11 | Lube Oil Tank |
| 12 | Service Air Receiver |
| 13 | Duplex Oil Strainer |

Every system supports:

- hierarchical navigation
- focus mode
- visibility control
- documentation
- exploded views

---

# Current Capabilities

## 3D Engine

- Three.js runtime
- DRACO compression
- dark and light themes
- adaptive rendering

---

## Navigation

- hierarchical tree
- unlimited depth
- visibility toggles
- group expansion

---

## Interaction

- raycaster picking
- hover highlighting
- focus mode
- automatic camera framing
- floating labels

---

## Exploded Views

- global explode
- system explode

---

## Documentation

Supports:

- documentation PDFs
- schematics PDFs
- maintenance PDFs

---

## Authentication

- JWT login
- role-based access
- session persistence

---

## Backend

- Express REST API
- modular routes
- audit logs
- PostgreSQL

---

## Real-Time Updates

- PostgreSQL triggers
- LISTEN / NOTIFY
- Server-Sent Events

---

## Database

- systems
- components
- documents
- component_aliases
- component_relations
- users
- audit_logs

---

# Design Decisions

---

## PostgreSQL as Source of Truth

Ship Engine v2 follows one rule:

```text
PostgreSQL owns metadata.
```

Titles, descriptions and documents are stored inside PostgreSQL.

---

## Read-Only Frontend

The Three.js viewer intentionally does not edit metadata.

Metadata management is performed through:

```text
PostgreSQL
```

instead of:

```text
frontend forms
```

---

## Server-Sent Events

SSE was selected because:

- simpler than WebSockets
- lightweight
- efficient
- ideal for one-way updates

---

## Layered Architecture

```text
PostgreSQL
↓
Express API
↓
SSE
↓
Three.js Viewer
```

This keeps responsibilities separated.

---

## Systems vs Components

The database separates:

```text
systems
```

from:

```text
components
```

The 13 top-level systems belong to:

```text
systems
```

Everything else belongs to:

```text
components
```

---

## GLOBAL Is UI Only

GLOBAL exists only inside the frontend tree.

It does not exist inside PostgreSQL.

---

## Alias Resolution

GLB names are not always identical to SFIA IDs.

The platform uses:

```text
component_aliases
```

to resolve mismatches.

---

## No Page Reloads

Metadata changes should never require:

```text
window.location.reload()
```

Synchronization is performed through:

```text
LISTEN
↓
NOTIFY
↓
SSE
```

---

# Roadmap

## Near Future

### Component Relations UI

Visual representation of:

- belongs_to
- drives
- connected_to
- supported_by

---

### Bill of Materials

BOM generation and hierarchy export.

---

### Search Engine

Advanced search for:

- systems
- components
- documents

---

### TypeScript Migration

Incremental migration of JavaScript modules.

---

### History and Versioning

Track metadata evolution over time.

---

### Admin Panel

Web-based metadata editor.

Potential replacement for pgAdmin4.

---

## Long-Term

### Multiple Vessel Support

Support for multiple ship models.

---

### AI Assistant

Semantic search and engineering assistant.

---

### RAG Integration

Document-aware AI system.

---

### Unreal Engine Integration

Real-time synchronization between web viewer and Unreal.

---

### Digital Twin Extensions

Additional monitoring and engineering capabilities.

---

# License

ISC License

See:

```text
LICENSE
```

for details.

---

# Acknowledgements

Built with:

- Three.js
- Vite
- Node.js
- Express
- PostgreSQL
- GSAP

---

<div align="center">

# Ship Engine v2

Interactive 3D ship engine platform powered by Three.js, Express and PostgreSQL.

Built with ❤️ for marine engineering and digital twin applications.

</div>