import './App.css'

const navItems = [['▦', 'Overview'], ['◈', 'Flood Map'], ['⌂', 'Predicted Impact'], ['●', 'Safe Places'], ['▣', 'Emergency'], ['♟', 'Alerts']]
const metrics = [
  { icon: '≋', label: 'Flood probability', value: '87%', badge: 'Severe' },
  { icon: '◷', label: 'Expected onset', value: '3:20 PM' },
  { icon: '▰', label: 'Roads at risk', value: '12' },
  { icon: '▥', label: 'Buildings at risk', value: '84' },
]

function App() {
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◒</span><span><strong>FloodSafe AI</strong><small>Coastal Flood Intelligence</small></span></div>
      <nav aria-label="Main navigation">{navItems.map(([icon, label], index) => <button className={index === 0 ? 'nav-item active' : 'nav-item'} key={label} type="button"><span className="nav-icon">{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" type="button"><span className="nav-icon">⚙</span>Settings</button><button className="nav-item" type="button"><span className="nav-icon">●</span>Profile</button></div>
    </aside>
    <section className="dashboard">
      <header className="topbar"><div><h1>Coastal Flood Intelligence</h1><button className="location" type="button">⌖ Mangaluru, Karnataka <span>⌄</span></button></div><div className="top-actions"><span className="live"><i /> AI Prediction Live</span><span className="updated">Last updated: 2 min ago</span><button className="icon-button notification" type="button" aria-label="Notifications">♟<b /></button><button className="profile-button" type="button">AS <span>⌄</span></button></div></header>
      <div className="content">
        <div className="metrics-row">{metrics.map((metric) => <article className="metric-card" key={metric.label}><span className="metric-icon">{metric.icon}</span><div><p>{metric.label}</p><strong>{metric.value}</strong>{metric.badge && <em>{metric.badge}</em>}</div></article>)}</div>
        <div className="workspace">
          <section className="map-panel">
            <div className="map-toolbar"><button className="map-toggle selected" type="button">⚠ Risk Zone</button><button className="map-toggle" type="button">♧ Safe Zone</button></div>
            <div className="map-label sea-label">Arabian<br />Sea</div><div className="map-label city-label">Mangaluru</div>
            <span className="map-place p1">Surathkal</span><span className="map-place p2">Bajpe</span><span className="map-place p3">Moodabidri</span><span className="map-place p4">Ullal</span><span className="map-place p5">Panambur</span><span className="map-place p6">Thokur</span><span className="map-place p7">Konaje</span><span className="map-place p8">Tannirbhavi</span><span className="map-place p9">Vamanjoor</span>
            <div className="river river-one" /><div className="river river-two" /><div className="road road-one" /><div className="road road-two" /><div className="road road-three" />
            <div className="map-marker alert m1">!</div><div className="map-marker alert m2">!</div><div className="map-marker building m3">▥</div><div className="map-marker building m4">▥</div><div className="map-marker safe m5">⌂</div><div className="map-marker safe m6">⌂</div><div className="map-marker safe m7">⌂</div><div className="map-marker emergency m8">+</div><div className="map-marker emergency m9">+</div><div className="map-marker vehicle m10">▣</div><div className="user-location" />
            <div className="map-controls"><button type="button">+</button><button type="button">−</button><button type="button">◉</button><button type="button">▱</button></div>
            <div className="legend"><span><i className="dot severe" />Severe Risk</span><span><i className="dot moderate" />Moderate Risk</span><span><i className="dot low" />Low Risk</span><span><i className="line-key" />Affected Road</span><span>▥ Building at Risk</span><span className="legend-safe">⌂ Safe Place</span><span className="legend-emergency">+ Emergency Facility</span></div>
          </section>
          <aside className="risk-panel"><h2>Current Flood Risk</h2><div className="risk-callout"><span className="risk-symbol">!</span><div><strong>Severe flood risk</strong><small>Immediate action recommended</small></div><b>87%<small>Flood Probability</small></b></div><div className="risk-stats"><div><span className="stat-icon">◷</span><small>Expected Onset</small><strong>3:20 PM</strong></div><div><span className="stat-icon bars">▮▮▮</span><small>Expected Peak</small><strong>5:10 PM</strong></div></div><h3>Why is this area at risk?</h3><div className="risk-bars"><div><span>Heavy Rainfall</span><i><b style={{ width: '83%' }} /></i><em>HIGH</em></div><div><span>Low Elevation</span><i><b style={{ width: '83%' }} /></i><em>HIGH</em></div><div><span>Historical Floods</span><i><b className="amber" style={{ width: '62%' }} /></i><em className="medium">MEDIUM</em></div></div><p className="risk-note">💡 High rainfall combined with low elevation and previous flood patterns is increasing the predicted flood risk.</p><button className="explanation" type="button">View Explanation <span>→</span></button></aside>
        </div>
      </div>
    </section>
  </main>
}

export default App
