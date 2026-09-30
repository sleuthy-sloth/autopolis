import type { ReactNode } from 'react';
interface CityControlsProps {
  connected: boolean;
  lastSavedTick: number | null;
  onSave: () => void;
  onLoad: () => void;
  onNewCity: () => void;
  diagnostics: ReactNode;
}
export function CityControls({ connected, lastSavedTick, onSave, onLoad, onNewCity, diagnostics }: CityControlsProps) {
  return <div className="city-controls">
    <section>
      <h3>Your city</h3>
      <p>{lastSavedTick === null ? 'No saved snapshot for this city yet.' : `Last saved at tick ${lastSavedTick.toLocaleString()}.`}</p>
      {!connected && <p className="connection-note">Connect to the engine to save or load a city.</p>}
      <div className="city-actions">
        <button className="btn primary" disabled={!connected} onClick={onSave}>Save city</button>
        <button className="btn" disabled={!connected || lastSavedTick === null} onClick={onLoad}>Load saved city</button>
      </div>
      <p className="muted">Snapshots stay on the machine running your engine. Saving is confirmed when the saved tick updates.</p>
    </section>
    <section>
      <h3>A fresh beginning</h3>
      <p>Generate a new landscape and watch another city take shape.</p>
      <button className="btn" onClick={onNewCity}>New city</button>
    </section>
    <details className="diagnostics"><summary>World details & diagnostics</summary>{diagnostics}</details>
  </div>;
}
