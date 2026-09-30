# Autopolis city-first overhaul

Date: September 29, 2026
Status: written design for review; direction approved in chat
Baseline: main, 6a65ae9

## Purpose and scope
Make the existing autonomous city easier to understand, observe, and influence. Success means a newcomer understands how growth works, can read city decisions, can find and use interventions, and can return to a saved city. Preserve the local-first identity and deterministic simulation. The audience is assumed to include new GitHub users and returning players; no acquisition or retention measurements have been supplied.

This first release redesigns the React client and fixes directly related usability defects. It does not change city-growth timing, engine architecture, AI providers, rendering models, hosting, or introduce accounts. The supplied screenshot and source establish the starting problems; live browser verification is required during implementation.

## Visual direction
Use a restrained observatory aesthetic: dark, legible surfaces, warm amber accents for actions, strong numeric hierarchy, and generous space around the city. Replace internal phase labels with a short product description. Panels use a near-opaque background so contrast does not depend on terrain color. Use existing system fonts and no remote assets. Retain the current Three.js scene and cinematic effects.

## Shell and information hierarchy
App owns a single active panel: Stories, Trends, Intervene, City, or Help; selecting it again closes it. Desktop uses a right drawer approximately 340px wide below the header. Below 768px the panel becomes a bottom sheet, capped to leave the city visible, with its own scroll area. Header and navigation occupy defined layout rows rather than independently positioned blocks. At short viewport heights the panel shrinks and scrolls. No horizontal page scrolling at 390px or 1440px width.

The compact header shows brand and connection state. A second strip shows current population, treasury, power coverage, and water coverage. Missing data displays an unavailable state rather than invented zeroes. Navigation provides Stories, Trends, Intervene, City, and Help with full accessible names. Diagnostics move into City: seed, biome, grid dimensions, FPS, rendered entity counts, and simulation tick.

Tile inspection appears only with a selected tile, in a compact contextual card. Overlays are explicit None, Power, and Water buttons with selected-state semantics. Resource overlays require a connected engine and actual coverage data. When coverage becomes unavailable, avoid displaying stale coverage as current.

## First session and connection states
Help opens on the first visit. Dismissing it records a versioned local preference; failures to access storage must not break the app. Help can always be reopened.

Explain that roads and neighborhoods emerge over minutes, planner turns begin after two minutes of simulation, and the default planner follows a deterministic demonstration policy. A configured language model can replace that planner; the client must not claim a real model is connected because the existing protocol does not report provider mode.

Show camera instructions: drag to orbit, scroll to zoom, select a tile to inspect. Connecting states explain that the engine is starting. A disconnected fresh session explicitly says terrain preview only; after a disconnect from an active city, explain that the last received city is visible and updates are paused in the browser while reconnecting. Do not imply the server simulation has paused. Provide the existing npm run dev setup instruction in Help when needed.

## Stories and trends
Stories display all events available in the existing state payload, newest first. Wrap full text without ellipsis and allow scrolling. Preserve original event text and tick prefixes; do not infer agent reasoning that was not transmitted. Avoid an assertive live region receiving every simulation update.

Before tick 120, the empty state explains that the planner is waiting while the city takes shape. Afterward it says decisions will appear here. Offline empty states explain the connection requirement. Trends use existing history and sparklines, label population and treasury with the latest sample, and distinguish the approximately six-minute history from current statistics. Coverage series have visible textual labels. Empty history has explanatory text.

## Interventions
Group Economy, Construction, Weather, and Disasters. All engine-changing controls are disabled unless connected and authoritative city data is available. Display an explanation beside unavailable controls.

Tax uses a labeled range, a draft value, and an explicit Apply tax button. Keyboard changes update the draft; Apply sends exactly one action. Incoming authoritative tax changes reset the draft, while unrelated world updates preserve it. Applying remains a request until a subsequent state confirms the rate; no optimistic success claim.

Keep existing construction footprints for this release, with full names, clear center-relative target descriptions, and prices: structures 200 currency units, roads 10 per changed tile, zoning 5 per changed tile. State that placement constraints apply and results appear in Stories. Selected-tile construction and brush tools are future work, because they change targeting behavior and require a separate interaction design.

Weather buttons show the authoritative selected weather. Disasters sit in a separated danger section and require confirmation that they damage the current city. Treasury grants explicitly state +1,000. Use current action contracts throughout.

## City lifecycle
Move Save, Load, and New city into City. Save status uses the authoritative lastSavedTick. Do not show successful saving on button press. Save and Load require a connection; Load also requires a known saved snapshot. New city remains available for local terrain preview.

Load and New city show a confirmation explaining they replace the current world and unsaved progress may be lost. Confirm every replacement rather than relying on an inaccurate client dirty heuristic. Cancellation sends no command. A new world clears the selected tile to avoid retaining misleading inspection. The protocol lacks request IDs, so do not introduce a save/load acknowledgment UI that implies precise request correlation.

## Component boundaries and data flow
App owns engine state, active panel, onboarding visibility, replacement confirmations, and overlay selection. HUD becomes the presentation shell and routes panel content. GodPanel remains responsible for intervention drafts and controls. Charts remains a pure history presentation component. Small components for help, city controls, and confirmations may be introduced when they keep responsibilities clear.

useEngine must consume tick values from both tick and world:state messages so onboarding timing and diagnostics advance during growth and after resets/loads. Continue using server snapshots as the authority. No server or core contract changes are needed.

## Accessibility and failure behavior
All controls are native buttons or labeled inputs. Selected tabs and overlays have aria-selected or aria-pressed as appropriate. Visible focus indicators and minimum 44px interactive targets apply across viewports. Panels have accessible headings. Escape closes the active drawer and returns focus to its opener. Confirmation dialogs trap focus, support Escape cancellation, and restore focus. Drawers are nonmodal on desktop; mobile bottom sheets also remain nonmodal unless explicitly implemented as dialogs. Respect reduced motion for added transitions.

Disable actions on connection loss, retain readable last-known data with a clear status, and automatically restore availability on reconnection. Never claim a failed or ignored action succeeded. Keep original server failure messages visible in Stories.

## Verification and acceptance
Meaningful client tests cover missing resources, disabled disconnected interventions, keyboard tax apply and authoritative synchronization, world-state tick updates, latest chart values, confirmation cancellation/acceptance, panel navigation, and reopenable onboarding. Update existing smoke tests to the new labels and structure.

Run client tests, existing core/server tests, workspace typecheck, and production build. Inspect the running application at 390px and 1440px widths with screenshots; verify a live engine city, overlay switching, a valid intervention, saving/loading, keyboard flow, and reconnect behavior. Check browser errors and ensure scene rendering remains usable with the new shell. Report any unavailable validation explicitly.

## Delivery
Implement as one reviewable branch with a local preview and a concise record of changes and verification. Publication and deployment are separate from this local overhaul. After this release, choose setup improvements or a hosted demo based on the actual source of traction.
