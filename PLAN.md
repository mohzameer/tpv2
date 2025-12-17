# ThinkPost – Project Plan & Task Tracker

> Phases aligned with `requirements.md` Section 11.

---

## Phase 1 – Core Workspace & Anonymous Usage (MVP)

| # | Task | Status |
|---|------|--------|
| 1.1 | Set up React Router with route structure (`/`, `/:projectId`, `/:projectId/:docId`) | ✅ |
| 1.2 | Create Header component with hamburger menu, mode switch (Notes/Drawing/Both), placeholder user area | ✅ |
| 1.3 | Implement collapsible Documents Sidebar (list placeholder documents) | ✅ |
| 1.4 | Integrate draggable split-panel layout (e.g. `react-resizable-panels`) | ✅ |
| 1.5 | Integrate BlockNote editor in Notes panel with Text/Markdown toggle | ✅ |
| 1.6 | Integrate Excalidraw in Drawing panel (zen mode enabled) | ✅ |
| 1.7 | Wire mode switch to show/hide panels appropriately | ✅ |
| 1.8 | Set up Supabase client & Postgres schema for `projects`, `documents`, `document_contents` | ✅ |
| 1.9 | Implement anonymous guest session ID generation & local/server storage of guest data | ✅ |
| 1.10 | CRUD operations for native projects & documents (single-user, no auth) | ✅ |

---

## Phase 2 – Authentication, Permissions & Realtime Collaboration

| # | Task | Status |
|---|------|--------|
| 2.1 | Implement Supabase Auth (email/password or magic link) with login/logout UI | ⬜ |
| 2.2 | Protect routes: redirect unauthenticated users to `/login` | ⬜ |
| 2.3 | Create `project_memberships` table & RLS policies for Owner/Editor/Viewer roles | ⬜ |
| 2.4 | Build invite collaborator flow (search existing users, assign role) | ⬜ |
| 2.5 | Enforce permission checks on frontend & via RLS | ⬜ |
| 2.6 | Set up Supabase Realtime channel per document | ⬜ |
| 2.7 | Integrate realtime sync for BlockNote content (broadcast + merge) | ⬜ |
| 2.8 | Integrate realtime sync for Excalidraw scene | ⬜ |
| 2.9 | Add presence indicators (avatars/cursors for active collaborators) | ⬜ |
| 2.10 | Handle viewer-only mode (disable editing, show live updates) | ⬜ |

---

## Phase 3 – GitHub-Backed Projects & PDF Export

| # | Task | Status |
|---|------|--------|
| 3.1 | Add "New Project" modal with Native vs GitHub repo choice | ⬜ |
| 3.2 | GitHub OAuth or PAT flow for repo access | ⬜ |
| 3.3 | Fetch `.md` files from selected branch via GitHub API | ⬜ |
| 3.4 | Map repo markdown files to documents list in sidebar | ⬜ |
| 3.5 | Load markdown file content into BlockNote on selection | ⬜ |
| 3.6 | Implement PDF export feature (notes + drawing) | ⬜ |
| 3.7 | Add export order picker (notes first / drawing first) and persist preference | ⬜ |

---

## Phase 4 – Enhancements & Polish

| # | Task | Status |
|---|------|--------|
| 4.1 | Guest-to-authenticated data migration flow | ⬜ |
| 4.2 | Refine Text ↔ Markdown mode behavior in BlockNote | ⬜ |
| 4.3 | Decide & implement GitHub sync-back strategy (if any) | ⬜ |
| 4.4 | PDF export styling & edge-case handling | ⬜ |
| 4.5 | Reconnection handling & offline buffering | ⬜ |
| 4.6 | Accessibility & keyboard navigation audit | ⬜ |
| 4.7 | Performance profiling & optimization | ⬜ |

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | To Do |
| 🔄 | In Progress |
| ✅ | Done |
| ❌ | Blocked / Cancelled |

---

_Update this file as tasks are started/completed._

