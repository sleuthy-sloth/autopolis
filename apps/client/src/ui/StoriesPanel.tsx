export function StoriesPanel({ events, tick, connected }: { events: string[]; tick: number | null; connected: boolean }) {
  return <div className="stories-panel">
    <p className="panel-intro">The city's decisions, milestones, and unexpected turns.</p>
    {!connected && events.length > 0 && <p className="connection-note">Last received stories. Reconnect for new updates.</p>}
    {events.length === 0 ? <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">◈</span>
      <h3>{!connected ? 'Waiting for the city' : 'A city takes time'}</h3>
      <p>{!connected ? 'Connect to the engine to see city stories.' : (tick ?? 0) < 120
        ? 'Roads and neighborhoods are taking shape. The planner starts making decisions after two minutes of simulation.'
        : 'Planner decisions and city milestones will appear here.'}</p>
    </div> : <ol className="story-list">{events.map((event, index) => {
      const match = /^(t\d+)\s+([\s\S]*)$/.exec(event);
      return <li key={`${event}-${index}`}>
        {match && <span className="story-time">{match[1]}{' '}</span>}
        <p>{match ? match[2] : event}</p>
      </li>;
    })}</ol>}
  </div>;
}
