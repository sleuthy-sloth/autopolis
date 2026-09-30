import type { ServerStatus } from '../useEngine';
const HELP_KEY = 'autopolis.help.v1';
export function readHelpPreference(): boolean {
  try { return localStorage.getItem(HELP_KEY) !== 'dismissed'; } catch { return true; }
}
export function dismissHelpPreference(): void {
  try { localStorage.setItem(HELP_KEY, 'dismissed'); } catch { /* Help stays usable when storage is unavailable. */ }
}
export function HelpPanel({ status, hasWorld, onDismiss }: { status: ServerStatus; hasWorld: boolean; onDismiss: () => void }) {
  return <div className="help-panel">
    <div className="welcome-title"><span aria-hidden="true">◈</span><h3>A city with a mind of its own.</h3></div>
    <p>Watch a landscape become a living city. Roads arrive first, neighborhoods follow, and the planner makes its own decisions.</p>
    {status !== 'connected' && <div className="connection-note">
      <strong>{hasWorld ? 'Showing the last received city.' : 'Terrain preview only.'}</strong>
      <p>{status === 'connecting' ? 'Connecting to the city engine.' : 'Reconnecting to the city engine.'} Browser updates and interventions are unavailable until connected.</p>
      <p>To start the local engine and viewport, run <code>npm run dev</code> in your Autopolis folder.</p>
    </div>}
    <section><h3>Give it a little time</h3><p>Growth unfolds over minutes. The planner begins after two minutes of simulation, then decides every 15 ticks. Stories explain what happens.</p></section>
    <section><h3>Look around</h3><dl className="camera-guide"><dt>Drag</dt><dd>Orbit the city</dd><dt>Scroll</dt><dd>Zoom in or out</dd><dt>Select a tile</dt><dd>Inspect its terrain</dd></dl></section>
    <section><h3>Influence the outcome</h3><p>Open Intervene to change taxes, build infrastructure, or change the weather. Power and Water views show service coverage. Save a snapshot from City to return to this world.</p></section>
    <details><summary>How the planner works</summary><p>The default planner follows a deterministic demonstration policy. A configured language model can replace it. This interface does not report which provider your engine is using.</p></details>
    <button className="btn primary" onClick={onDismiss}>Explore the city</button>
    <p className="muted">You can reopen this guide from Help at any time.</p>
  </div>;
}
