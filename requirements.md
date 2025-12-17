## ThinkPost – Requirements Specification

### 1. Product Overview
- **Goal**: Provide a collaborative workspace combining a block-based text editor and a zen-mode drawing canvas, arranged in draggable split panels.
- **Primary Users**:
  - **Anonymous guest users** who can quickly start using the app without logging in.
  - **Authenticated Supabase users** who can create projects and documents, and collaborate in real time with other existing users.
- **High-Level Features**:
  - Collaborative block-based text editor (BlockNote) with Text/Markdown modes.
  - Excalidraw-powered zen drawing canvas.
  - Draggable, resizable split-panel layout with three display modes: **Notes**, **Drawing**, **Both**.
  - Per-project document list with a collapsible sidebar (hamburger menu).
  - View/Edit collaborative permissions, restricted to authenticated existing users.
  - Real-time multi-user collaboration using Supabase (Postgres + Realtime).
  - Client-side routing via React Router.
  - Export of notes + drawing to **PDF**, with user-controlled ordering (notes above drawing or drawing below notes).
  - Ability to create projects either as native projects or backed by a **GitHub repository**, where documents map to markdown (`.md`) files in a selected branch.

### 2. User Roles & Permissions
- **User Roles (per project/document)**:
  - **Owner**:
    - Full control over project and its documents.
    - Can invite/remove collaborators.
    - Can change permissions (View/Edit).
    - Can delete project/documents.
  - **Editor**:
    - Can view project and documents.
    - Can collaboratively edit notes and drawings in real time.
  - **Viewer**:
    - Read-only access to notes and drawings.
    - Can see remote cursors/changes but cannot modify content.
  - **Guest (anonymous)**:
    - Not tied to a Supabase-auth user record.
    - Can create and edit personal/temporary projects and documents.
    - Cannot be added as a collaborator to shared projects/documents.
    - Cannot participate in multi-user realtime collaboration (solo-only editing).

- **Collaboration Constraints**:
  - Collaboration is only allowed with **existing Supabase-authenticated users**.
  - Invites/permissions are managed by email or user ID resolved via Supabase.
  - Permissions can be configured at least at **project level**, and optionally overridden per document if needed (see Data Model).

### 3. Authentication & Authorization
- **Authentication**:
  - **Anonymous usage (default on first load)**:
    - When a user first loads the app, they are treated as an anonymous guest.
    - Guests can immediately start using the notes and drawing panels without creating an account.
    - Guest work can be:
      - Stored locally (e.g., browser storage) and/or
      - Stored in Postgres keyed by a generated `session_id` (not linked to a user account).
  - **Authenticated usage**:
    - Implement Supabase Auth (email/password or magic link; exact flow to be decided later).
    - After authentication, users gain access to shareable, collaborative projects.
    - Only authenticated users can be collaborators and access shared projects/documents.
    - Optional: allow upgrading/migrating guest data into the authenticated account on login (e.g., attach guest projects/documents to the new `user_id`).

- **Authorization Checks**:
  - For **shared (authenticated) resources**:
    - On every route that exposes project/document data, confirm:
      - The user is authenticated.
      - The user has at least Viewer access to the project or specific document.
    - On write operations (editing notes/drawings, changing layout config, renaming docs, etc.):
      - Confirm the user has Editor or Owner role.
    - Owner-only operations:
      - Grant/revoke collaborators.
      - Delete project or documents.
      - Change default access mode (Viewer/Editor) for invited users.
  - For **guest (anonymous) resources**:
    - Access and write checks are done via the anonymous `session_id` or equivalent client identifier.
    - Guest resources are scoped to a single browser/session and are not shareable or collaboratively editable until associated with an authenticated account.

### 4. Information Architecture & Routing (React Router)
- **Top-Level Routes**:
  - `/login` – Authentication screen.
  - `/` – Home / project list (with "create project" flow).
  - `/:projectId` – Project workspace (projectId is an 8-character alphanumeric string), defaulting to last opened document or empty state.
  - `/:projectId/:docId` – Main collaborative workspace for a specific document (docId is a sequential integer starting at 1).

- **ID Formats**:
  - **projectId**: 8-character alphanumeric (e.g. `a1b2c3d4`).
  - **docId**: Sequential integer per project (1, 2, 3, …).

- **Routing Behavior**:
  - Every “opened link” corresponds to a **project** or **document** route:
    - Direct links like `/projects/:projectId/docs/:docId` should deep-link into that document’s workspace.
  - Unauthorized access:
    - If not authenticated → redirect to `/login`.
    - If authenticated but unauthorized (no access) → show “No access” view with minimal explanation.
  - Navigation:
    - Header logo/title should navigate to `/projects`.
    - Switching documents via the sidebar updates the URL (`docs/:docId`).
    - Creating a project via `/projects/new` redirects to the appropriate `/projects/:projectId` route on success.

- **Project Creation Flow**:
  - When creating a **new project**, user must choose:
    - **New document project** (native):
      - Creates an empty project with no documents or with an initial blank document.
    - **GitHub repo project**:
      - User provides:
        - GitHub repository (e.g. `owner/repo`).
        - Branch to base the project on.
      - App connects to GitHub, fetches the list of markdown (`.md`) files for that branch.
      - The documents sidebar for that project lists these markdown files as documents.

### 5. Layout & UI Requirements

#### 5.1 Global Layout
- **Header Bar (fixed at top)**:
  - **Left**:
    - Hamburger menu icon to toggle the **Documents Sidebar**.
    - App title / current project name.
  - **Center**:
    - **Mode Switch** (3-way toggle):
      - `Notes`
      - `Drawing`
      - `Both`
    - This switch controls the main panel layout (see Panel Behavior).
  - **Right**:
    - User avatar / initials with small account dropdown (profile/logout).
    - (Optional) Collaboration presence indicator (# of users currently active in the document).

- **Main Area (below header)**:
  - Left collapsible **Documents Sidebar** (project’s documents).
  - Central **Workspace** area for notes and drawing panels in a draggable split layout.

#### 5.2 Documents Sidebar (Hamburger Menu)
- **Behavior**:
  - Toggled by the hamburger menu in the header.
  - Slides in/out from the left, overlaying or pushing the workspace depending on viewport.
  - Width should be responsive but not interfere with the central workspace excessively.

- **Contents**:
  - Project title at the top.
  - List of **documents** belonging to the current project:
    - For **native projects**:
      - Each item represents an app-managed document (notes + drawing).
    - For **GitHub-backed projects**:
      - Each item represents a markdown (`.md`) file discovered in the selected repository branch.
      - Show at least filename and relative path; optionally display a folder-like hierarchy.
    - Each item shows document title (or filename), active state.
    - Clicking a document:
      - Navigates to `/projects/:projectId/docs/:docId`.
      - Updates workspace to load that document’s notes and drawing (or the markdown-backed content).
  - Actions:
    - Create new document (for native projects).
    - (Optional) For GitHub-backed projects: refresh file list from the selected branch.
    - Optional: Rename/delete document (respecting permissions).

#### 5.3 Panel Layout & Mode Switch (Notes / Drawing / Both)
- **Workspace Panels**:
  - **Notes Panel** (right side by default).
  - **Drawing Panel** (left side by default, with Excalidraw in zen mode).
  - Panels should be arranged using a **draggable split**:
    - Adjustable divider between left and right panels (when Both mode is active).
    - Split ratio per document may be persisted in the backend or local storage.

- **Mode Switch Behavior**:
  - `Notes`:
    - Only the Notes Panel is visible, occupying full workspace width.
  - `Drawing`:
    - Only the Drawing Panel is visible, occupying full workspace width.
  - `Both`:
    - Both panels visible in a horizontal split.
    - User can drag the splitter to resize; both panels respond accordingly.
  - The selected mode should be:
    - Reflected visually in the switch.
    - Optionally persisted per user + document (so returning users see their last layout choice).

#### 5.4 Block-Based Text Editor (BlockNote)
- **Core Requirements**:
  - Use the **BlockNote** library as the main text editor.
  - Support block-based editing: paragraphs, headings, lists, code blocks, etc.
  - Real-time collaborative editing:
    - Multiple users can edit simultaneously.
    - Show cursors/selections (if supported by integration) and live updates.

- **Text / Markdown Mode Switch**:
  - A toggle/switch within or above the Notes Panel with two options:
    - `Text`
    - `Markdown`
  - Expected behavior:
    - `Text` mode: WYSIWYG/standard rich-text block-based editing.
    - `Markdown` mode: Shows markdown-focused controls or a markdown-flavored editing experience.
    - Conversion rules between Text/Markdown should be consistent; at minimum:
      - Content must not be lost when toggling modes.
  - Mode choice may be persisted per document and/or user.

#### 5.5 Drawing Panel (Excalidraw Zen Mode)
- **Core Requirements**:
  - Integrate **Excalidraw** component in zen mode:
    - Minimal chrome, focus on the canvas.
  - Real-time collaboration:
    - Shape additions, modifications, deletions are synced live among collaborators.
  - Drawing data should be stored per document.

- **UI Expectations**:
  - Basic Excalidraw tools available (selection, shapes, pen, text, eraser, colors).
  - Support undo/redo within the document’s drawing context.

### 6. Collaboration & Realtime Behavior
- **Realtime Technology**:
  - Use Supabase Realtime (backed by Postgres) to broadcast changes:
    - Notes content changes (BlockNote document state).
    - Drawing state changes (Excalidraw scene).
    - Presence information (users online in a given document).

- **Collaboration Scenarios**:
  - **Multiple Editors**:
    - Typing, block changes, and drawing updates are reflected to all connected clients.
    - Merge strategy:
      - Use BlockNote’s collaborative features or CRDT-like syncing for text.
      - Use Excalidraw’s supported realtime syncing pattern or a document-diff approach.
  - **Viewers**:
    - Receive live updates but cannot perform write operations.
  - **Late Joiners**:
    - On joining a document, they receive the current full state of both notes and drawing, then subscribe to live updates.

### 7. Data Model (Conceptual)
- **User** (`users` – via Supabase Auth):
  - `id`
  - `email`
  - `display_name`
  - `avatar_url`
  - Timestamps.

- **GuestSession** (no Auth account, optional table if server-side guest persistence is desired):
  - `id` (session identifier, can also be stored client-side)
  - `created_at`, `expires_at`

- **Project** (`projects`):
  - `id`
  - `owner_id` (FK → users.id, nullable if created as guest and not yet claimed)
  - `name`
  - `guest_session_id` (FK → guest_sessions.id, nullable; used for anonymous-only projects)
  - `source_type` (enum: `native`, `github`)
  - `github_repo` (nullable; e.g. `owner/repo`, used when `source_type = 'github'`)
  - `github_branch` (nullable; the selected branch for markdown file discovery)
  - `created_at`, `updated_at`

- **ProjectMembership** (`project_memberships`):
  - `id`
  - `project_id` (FK → projects.id)
  - `user_id` (FK → users.id)
  - `role` (enum: `owner`, `editor`, `viewer`)
  - `created_at`, `updated_at`

- **Document** (`documents`):
  - `id`
  - `project_id` (FK → projects.id)
  - `title`
  - `created_by` (FK → users.id, nullable for guest-created documents)
  - `external_path` (nullable; for GitHub-backed documents, path to the `.md` file within the repo)
  - `created_at`, `updated_at`

- **DocumentPermissions** (optional, if per-document overrides are needed):
  - `id`
  - `document_id` (FK → documents.id)
  - `user_id` (FK → users.id)
  - `role` (enum: `editor`, `viewer`)

- **DocumentContent** (`document_contents`):
  - `document_id` (PK/FK → documents.id)
  - `notes_state` (JSON – BlockNote document structure)
  - `drawing_state` (JSON – Excalidraw scene)
  - `layout_preference` (JSON – e.g. `{ mode: "both", splitRatio: 0.6 }`)
  - `export_preferences` (JSON – e.g. `{ pdfOrder: "notes_then_drawing" | "drawing_then_notes" }`)
  - `updated_at`

- **Collaboration Presence** (`presence` via Realtime, no long-term storage required):
  - Channel-based presence keyed by `document_id`.
  - User state: `{ userId, displayName, color, cursorPosition?, panelMode? }`.

### 8. Non-Functional Requirements
- **Performance**:
  - Realtime updates should appear within ~200–500ms under normal network conditions.
  - Initial load of a document (notes + drawing) should complete within a reasonable time (< 2–3 seconds under normal conditions).

- **Reliability**:
  - Handle temporary disconnections:
    - Locally buffer edits and sync when connection restores if supported by libraries.
    - Surface a minimal connection status (e.g., small indicator).

- **Security**:
  - Enforce authorization on the backend via Supabase RLS policies for all project/document tables.
  - Ensure only existing authenticated users can be added as collaborators.

- **UX & Accessibility**:
  - Keyboard-accessible controls for major actions (navigation, mode switches).
  - Clear visual states for active mode (Notes/Drawing/Both) and Text/Markdown switch.

### 9. Technical Stack & Integration Notes
- **Frontend**:
  - React (existing Vite setup).
  - React Router for routing.
  - BlockNote for block-based text editing.
  - Excalidraw for drawing canvas (zen mode).
  - Optional UI library (to be decided) for header, switches, sidebar, etc.

- **Backend/Data**:
  - Supabase:
    - Auth for users.
    - Postgres for relational data (projects, documents, permissions, document content).
    - Realtime channels for collaboration.

- **State Management**:
  - Local state via React hooks.
  - Global app state (auth, current project/document, collaboration info) via context or a state library (e.g. Zustand/Redux), to be decided.

### 10. Open Questions / To Be Clarified
- Exact authentication flows (email/password vs. magic links vs. OAuth providers).
- Degree of markdown support and behavior when switching between Text and Markdown in BlockNote.
- Whether per-document permissions are required in v1 or if project-level roles are sufficient.
- How much of the layout preferences (panel mode, split ratio) must be persisted server-side vs. per-device.
 - GitHub integration details:
   - Whether documents from GitHub are read-only or if edits are synced back as commits/PRs.
   - Auth flow and permission scope for accessing private repositories.
 - PDF export implementation details:
   - Exact rendering fidelity requirements for BlockNote content and Excalidraw scenes.
   - Page layout, margins, and any branding or headers/footers needed.

### 11. Delivery Phases

- **Phase 1 – Core Workspace & Anonymous Usage (MVP)**
  - Anonymous guest usage on first load (local or `GuestSession`-based persistence).
  - Core UI layout:
    - Header bar with hamburger menu, mode switch (Notes/Drawing/Both), and basic user area.
    - Documents sidebar for **native projects** (no GitHub yet).
    - Draggable split-panel workspace with:
      - BlockNote-based notes panel (Text/Markdown toggle).
      - Excalidraw drawing panel in zen mode.
  - Basic project/document model for native projects (projects, documents, document_contents).
  - Local-only (or single-user) editing behavior; realtime multi-user collaboration may be stubbed or deferred.

- **Phase 2 – Authentication, Permissions & Realtime Collaboration**
  - Supabase Auth integration for authenticated users.
  - User roles and permissions model (Owner/Editor/Viewer) at project (and optional document) level.
  - Supabase RLS policies for projects, documents, memberships, and contents.
  - Realtime collaboration for authenticated users:
    - Shared notes (BlockNote) with multi-user editing.
    - Shared drawings (Excalidraw) with live updates.
    - Basic presence indicators (who is in the document).
  - Clear separation of capabilities:
    - Guests: solo-only, non-collaborative work.
    - Authenticated users: collaborative projects and invitations restricted to existing users.

- **Phase 3 – GitHub-Backed Projects & PDF Export**
  - Project creation flow update:
    - “New document project” (native).
    - “GitHub repo project”, selecting repo + branch.
  - GitHub-backed project behavior:
    - Discover `.md` files from the selected branch.
    - Populate the documents sidebar from those markdown files.
    - Map GitHub files into the existing document/document_contents model (`source_type`, `github_repo`, `github_branch`, `external_path`).
  - PDF export feature:
    - Export combined notes + drawing to a single PDF.
    - User-selectable ordering (notes above drawing vs. drawing above notes), persisted via `export_preferences`.

- **Phase 4 – Enhancements & Open-Question Resolutions**
  - Decide and implement:
    - Guest-to-authenticated migration of projects/documents.
    - Exact markdown behavior and conversion fidelity between Text/Markdown modes.
    - Final GitHub integration mode (read-only vs. syncing edits back via commits/PRs).
    - PDF layout polish (margins, headers/footers, branding).
    - Any advanced presence or collaboration UX improvements (cursor avatars, per-panel presence, etc.).




