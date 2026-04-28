// Top bar + Transport bar
function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand__mark" />
        <div>
          <div className="brand__name">Voicestudio <span>· KR</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--muted-2)", letterSpacing: "0.06em", marginTop: 1 }}>
            v0.18  ·  workspace ▾
          </div>
        </div>
        <span className="brand__pip"><i />Local · 8190</span>
      </div>

      <div className="crumbs">
        <span>Project</span><span className="sep">/</span>
        <span>The Kettle Room</span><span className="sep">/</span>
        <span>Episode 03</span><span className="sep">/</span>
        <b>Intro narration</b>
      </div>

      <div className="topbar__actions">
        <div className="creditmeter">
          <i />
          <span><b>3,820</b> sec</span>
          <span style={{ color: "var(--muted)" }}>· 62%</span>
        </div>
        <button className="tbtn tbtn--ghost">
          <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/>
          </svg>
          Search <span className="kbd">⌘K</span>
        </button>
        <button className="tbtn">Share</button>
        <button className="tbtn tbtn--accent">
          <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Render
        </button>
        <div className="avatar" />
      </div>
    </header>
  );
}

function Transport() {
  return (
    <footer className="transport">
      <div className="t-meters">
        <div className="t-meter">
          <span className="t-meter__label">L</span>
          <div className="t-meter__bar"></div>
          <span className="t-meter__val">-12.4</span>
        </div>
        <div className="t-meter">
          <span className="t-meter__label">R</span>
          <div className="t-meter__bar r"></div>
          <span className="t-meter__val">-13.1</span>
        </div>
        <div className="t-meter">
          <span className="t-meter__label">LUFS</span>
          <div className="t-meter__bar"></div>
          <span className="t-meter__val">-14.2</span>
        </div>
      </div>

      <div className="t-controls">
        <button className="t-btn" title="Prev">
          <svg className="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM10 12l10-7v14z"/></svg>
        </button>
        <button className="t-btn" title="Skip back">
          <svg className="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M11 5l-9 7 9 7zM21 5l-9 7 9 7z"/></svg>
        </button>
        <button className="t-btn t-btn--main" title="Play">
          <svg className="ico-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button className="t-btn" title="Skip fwd">
          <svg className="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5l9 7-9 7zM13 5l9 7-9 7z"/></svg>
        </button>
        <button className="t-btn" title="Loop">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M16 4l3 3-3 3M8 20l-3-3 3-3"/>
          </svg>
        </button>
        <div className="t-time">
          <b>00:10.642</b><small>/ 00:28.110</small>
        </div>
      </div>

      <div className="t-render">
        <div className="t-queue">
          <i />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <b>Rendering · 2 of 3</b>
            <small>VOICEBOX-1.7B  ·  ETA 00:08</small>
          </div>
          <div className="t-queue__bar" />
        </div>
        <button className="btn-cta">
          <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h4l2 4-3 2a11 11 0 0 0 6 6l2-3 4 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>
          Render scene
          <span className="kbd">⌘ ⏎</span>
        </button>
      </div>
    </footer>
  );
}

window.TopBar = TopBar;
window.Transport = Transport;
