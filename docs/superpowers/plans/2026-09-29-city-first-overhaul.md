# Autopolis City-First Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the autonomous city understandable on first use and usable on desktop, mobile, and keyboard.

**Architecture:** Keep Three.js and the server protocol intact. App owns engine and navigation state; HUD presents a responsive shell, with focused components for help, stories, city controls, confirmation, and interventions. Every displayed world value remains server-authoritative.

**Tech Stack:** Existing React 19, TypeScript, Vite, Three.js, Vitest, jsdom; no new runtime dependencies.

**Spec:** docs/superpowers/specs/2026-09-29-city-first-overhaul-design.md

## Global Constraints
- Preserve the local-first identity and deterministic simulation.
- Use existing system fonts and no remote assets.
- No server or core contract changes are needed.
- No horizontal page scrolling at 390px or 1440px width.
- Visible focus indicators and minimum 44px interactive targets apply across viewports.
- Respect reduced motion for added transitions.
- Publication and deployment are separate from this local overhaul.

## Review Focus
- World resets deliver tick zero in world:state: timing and inspection must reset, rather than show the previous city's age.
- Browser storage can throw: onboarding must remain dismissible and the city must render.
- A socket may disconnect after authoritative data arrived: stale city data stays readable but actions become unavailable.
- An agent can change taxes while the player edits: an authoritative tax change replaces the draft; unrelated updates preserve it.
- Confirmation can lose its opener during responsive navigation: focus must return to an existing control without throwing.

## File map
Modify App.tsx for state orchestration and HUD.tsx for shell composition. Modify GodPanel.tsx for intervention state and Charts.tsx for current values and chart accessibility. Replace styles.css layout rules. Modify useEngine.ts for snapshot ticks. Create ui/HelpPanel.tsx, ui/StoriesPanel.tsx, ui/CityControls.tsx, and ui/ConfirmDialog.tsx. Keep files under apps/client/src. Extend existing tests and create targeted component tests under apps/client/src/__tests__. Update README.md interface instructions. No renderer changes are planned.

## Task 1: Authoritative clock and intervention reliability

**Files:** Modify src/useEngine.ts, src/ui/GodPanel.tsx; extend __tests__/useEngine.test.tsx; create __tests__/GodPanel.test.tsx (all under apps/client).

**Interfaces:** Keep useEngine return type unchanged. Add `disabled: boolean` to GodPanelProps. Preserve GodActionInput and callback signatures.

- [ ] Add a failing snapshot-clock test inside the existing hook describe, using its mountHarness and socket driver:
```tsx
it('accepts snapshot tick zero after a reset', () => {
  const h = mountHarness('ws://localhost:8788');
  act(() => h.ws().message({ type: 'tick', tick: 150 }));
  act(() => h.ws().message({ type: 'world:state', tick: 0, grid: {} }));
  expect(h.tickText()).toBe('0');
  act(() => h.root.unmount());
});
```
- [ ] Run `npx vitest run apps/client/src/__tests__/useEngine.test.tsx`; confirm the new assertion fails.
- [ ] Update message handling to consume finite numeric ticks from either supported message type, then dispatch state snapshots:
```ts
if ((msg.type === 'tick' || msg.type === 'world:state') &&
    typeof msg.tick === 'number' && Number.isFinite(msg.tick)) setTick(msg.tick);
if (msg.type === 'world:state') onStateRef.current(msg);
```
- [ ] Add component tests using createRoot/act and callback spies: disconnected controls emit no actions, range change alone emits none, Apply emits one tax action, taxRate 9→12 resets draft, a same-tax rerender preserves draft. Assert via native input value and callback arguments, not CSS classes.
- [ ] Implement tax draft synchronization and explicit Apply:
```tsx
useEffect(() => setTax(taxRate ?? 9), [taxRate]);
<button disabled={disabled || taxRate === null || tax === taxRate}
  onClick={() => send('ADJUST_TAX_RATE', [0, 0], [0, 0], { tax_rate: tax })}>
  Apply tax
</button>
```
Remove mouse/touch release submission. Wrap interventions in a disabled fieldset. Guard callbacks with disabled as well. Label Economy, Construction, Weather, and Disasters. Use full construction names, center-relative coordinates, structure price 200, road price 10 per changed tile, and zoning price 5 per changed tile. Display the result-in-Stories explanation. Keep placement footprints unchanged.
- [ ] Run hook and GodPanel tests, then workspace typecheck. Update App's invocation with `disabled={status !== 'connected' || !serverWorld?.city}`.
- [ ] Commit `fix: synchronize city clock and intervention controls`.

## Task 2: Accessible confirmations and city lifecycle

**Files:** Create ui/ConfirmDialog.tsx and ui/CityControls.tsx; modify App.tsx; create __tests__/ConfirmDialog.test.tsx and __tests__/CityControls.test.tsx.

**Interfaces:** ConfirmDialog props: `title: string; description: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void`. CityControls props: `connected: boolean; lastSavedTick: number | null; onSave: () => void; onLoad: () => void; onNewCity: () => void; diagnostics: React.ReactNode`. App owns confirmation kind `'new-city' | 'load' | 'disaster' | null` and pending disaster string.

- [ ] Write failing tests for Cancel and Escape emitting no replacement callback, confirmation emitting once, save disabled offline, load disabled with no known snapshot, and native dialog focus restoration when opener is removed. Mount/unmount with act. Stub dialog showModal/close only in jsdom; verify actual native dialog behavior in the browser later.
- [ ] Run the new tests and confirm failure from missing components.
- [ ] Implement native dialog with showModal in useEffect, Cancel initially focused, onCancel event prevented and forwarded. On teardown close and return focus when the opener remains connected:
```tsx
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
dialogRef.current?.showModal();
return () => {
  dialogRef.current?.close();
  if (opener?.isConnected) opener.focus();
};
```
When opener disappeared, focus a persistent City navigation button via a fallback callback in App. Browser native modal supplies focus containment. Dialog controls call only their named callbacks.
- [ ] Implement CityControls with native Save, Load, and New city buttons. Show lastSavedTick from authoritative state; no success message on send. Wire App to confirmation state and existing command/reset callbacks. New city and Load confirm every replacement. Clear selection on accepted replacement and on authoritative seed change. Intercept GodPanel disaster callbacks to open a damage confirmation before issuing command.
```tsx
<button disabled={!connected} onClick={onSave}>Save city</button>
<button disabled={!connected || lastSavedTick === null} onClick={onLoad}>Load saved city</button>
<button onClick={onNewCity}>New city</button>
```
- [ ] Run both component suites and App smoke tests; assert offline changes cannot be sent if connection drops while a dialog is open. Confirmation descriptions say unsaved progress may be lost or a disaster damages the city; avoid unsupportable guarantees about server pause or request acknowledgment.
- [ ] Commit `feat: add safe city lifecycle controls`.

## Task 3: Readable stories, useful trends, and first-use help

**Files:** Create ui/StoriesPanel.tsx and ui/HelpPanel.tsx; modify ui/Charts.tsx; create __tests__/StoriesPanel.test.tsx, __tests__/HelpPanel.test.tsx, __tests__/Charts.test.tsx.

**Interfaces:** StoriesPanel props: `events: string[]; tick: number | null; connected: boolean`. HelpPanel props: `status: ServerStatus; hasWorld: boolean; onDismiss: () => void`. Charts retains `history: HistoryPoint[]`. Export `readHelpPreference(): boolean` and `dismissHelpPreference(): void` from HelpPanel, with true meaning help should open.

- [ ] Add failing tests for a long full event string, eight supplied events, waiting text before tick 120, unavailable text offline, declining treasury with current 500 after peak 1000, and storage getItem/setItem exceptions. Use real render with createRoot/act and spies that throw; restore spies after each test.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement StoriesPanel with an ordered list of all supplied events. Wrap text via stylesheet rather than rewriting messages. Empty text chooses connection explanation first, then pre-120 growth guidance, then future decisions guidance.
- [ ] Change chart displayed values to latest samples; retain maximum solely for scale and remove unused minima. Give each SVG an accessible name and visible labels for Power and Water:
```tsx
const latest = history.at(-1)!;
<Panel label="POPULATION" right={latest.population.toLocaleString()}>
  {sparkline(pop, 0, Math.max(popMax, 1), '#6fae4f', true)}
</Panel>
```
- [ ] Implement guarded local preference with a versioned key:
```ts
export function readHelpPreference(): boolean {
  try { return localStorage.getItem('autopolis.help.v1') !== 'dismissed'; }
  catch { return true; }
}
export function dismissHelpPreference(): void {
  try { localStorage.setItem('autopolis.help.v1', 'dismissed'); } catch {}
}
```
Help explains gradual growth, planner starts after two minutes, deterministic default planner and optional configured model, camera controls, and reopenable Help. Fresh disconnected state says terrain preview; disconnected existing state says last received city, updates unavailable in the browser, reconnecting. Show `npm run dev` where setup guidance is needed.
- [ ] Run new component suites. Assert provider copy does not report an active real LLM, and disconnected empty stories never claim ongoing live decisions.
- [ ] Commit `feat: explain city growth and surface readable stories`.

## Task 4: Responsive observatory shell

**Files:** Modify App.tsx, ui/HUD.tsx, ui/styles.css; update __tests__/HUD.test.tsx and __tests__/app.smoke.test.tsx.

**Interfaces:** App owns `activePanel: 'stories' | 'trends' | 'intervene' | 'city' | 'help' | null`. HUD receives `activePanel`, `onPanelChange`, and `panelContent: React.ReactNode`, plus current world/stats fields. Replace `onCycleOverlay` with `onOverlayChange: (mode: OverlayMode) => void`. Overlay availability is `status === 'connected' && serverWorld?.resources != null`.

- [ ] Update HUD tests to assert unavailable metrics display an em dash, selected nav/overlay state, panel toggle behavior, closed inspection without selection, and disabled overlays with absent resources. Add App tests using existing WebSocket mock for connection loss after a populated snapshot: content stays readable but controls disable. Assert Help opens on first use and can reopen after dismissal.
- [ ] Run targeted tests, expecting old markup/props to fail.
- [ ] Assemble HUD header, metric strip, nav, overlay tools, selected-tile card, and exactly one drawer. Compose HelpPanel, CityControls, StoriesPanel, Charts, or GodPanel from App according to activePanel. Move diagnostics into CityControls. Remove the old persistence bar and phase badge. Add optional drawer close button and Escape behavior with opener focus restoration.
```tsx
const togglePanel = (panel: Exclude<typeof activePanel, null>) =>
  setActivePanel(current => current === panel ? null : panel);
const hasResources = status === 'connected' && serverWorld?.resources != null;
```
If resources become unavailable, reset overlay to none. Missing metrics render em dash; stale metrics are accompanied by disconnected status, rather than presented as live.
- [ ] Replace absolute panel collisions with one shell grid above the viewport. Use pointer-events none on empty shell areas and auto on actual controls; make drawers scrollable and nonmodal. Minimum touch targets and focus rules:
```css
button, input[type='range'] { min-height: 44px; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.shell { position: absolute; inset: 0; display: grid; grid-template-rows: auto auto 1fr auto; pointer-events: none; }
.shell button, .drawer { pointer-events: auto; }
.drawer { min-height: 0; overflow: auto; width: min(340px, 100%); }
@media (max-width: 767px) {
  .drawer { width: 100%; max-height: 55dvh; align-self: end; }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .drawer, button { transition: none; }
}
```
Use near-opaque surfaces, amber accent, system typography, readable secondary text. Lay out contextual inspection and overlays within available shell space; reserve bottom-sheet space so they cannot collide. Constrain long text with min-width:0 and overflow-wrap:anywhere. Avoid horizontal clipping of actions.
- [ ] Run client tests and typecheck. Update README controls and first-session explanation to match the implemented UI.
- [ ] Commit `feat: introduce responsive city-first observatory`.

## Task 5: End-to-end verification and review

**Files:** Fix only affected client files; create a user-facing verification record in outputs and screenshots during execution.

**Interfaces:** All earlier component and engine interfaces are integrated; existing server contracts must remain unchanged.

- [ ] Run `npx vitest run`, `npm test`, `npm run typecheck`, and `npm run build` once after integration. Save concise results and resolve failures before browser verification.
- [ ] Start `npm run dev` in a persistent terminal. Inspect a live city in the browser at 1440px and 390px widths. Capture screenshots of empty/first-use, grown city with Stories, and narrow Intervene panel. Check overflow, overlap, browser errors, and touch target reachability.
- [ ] Use keyboard to open drawers, adjust/apply tax, cancel/confirm a replacement, and restore focus. Test opening a dialog, then removing the original opener; closing must remain safe. Verify the native dialog actually traps focus.
- [ ] Verify power/water overlays, one valid intervention, authoritative save status, Load, and New city. Observe sufficient growth to verify planner timing guidance and wrapped decisions. Test loss and restoration of engine connection with a previously received city. Do not infer the server paused.
- [ ] Review the complete diff against every spec section. With the chosen execution method, arrange its required independent review and resolve actionable findings. Avoid deploying or changing remote main.
- [ ] Commit any verified fixes, then report changed behavior, checks, preview, and limitations with links to output screenshots. A final successful completion claim requires actual test and browser evidence.

## Execution choice
Native execution is recommended: the five tasks share client state and presentation interfaces, and one implementer can keep those transitions coherent. Subagent-driven execution is available if the user prefers per-task independent reviews. Review this plan and select a method before implementation, as required by the writing-plans workflow.
