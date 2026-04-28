// Canvas — Text-to-Speech main workspace
// VoiceStudio · dark cinematic studio aesthetic

const Ico = ({ d, w = 14, fill = "none" }) => (
  <svg className="ico" width={w} height={w} viewBox="0 0 24 24" fill={fill}
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
);

// Procedural waveform generators ------------------------------------
function bars(n, seed = 1, min = 0.18, max = 1) {
  let s = seed;
  return Array.from({ length: n }, (_, i) => {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const env = Math.sin((i / n) * Math.PI) * 0.65 + 0.35;
    return min + (max - min) * (0.4 + 0.6 * r) * env;
  });
}

function MiniWave({ n = 36, seed = 7 }) {
  const data = bars(n, seed);
  return (
    <div className="voice__wave">
      {data.map((v, i) => <span key={i} style={{ height: `${v * 100}%` }} />)}
    </div>
  );
}

// Voice avatar — gradient + scanline + initials
function VoiceAvatar({ hue = 70, label = "MK", small = false }) {
  const sz = small ? 38 : 56;
  return (
    <div className={small ? "voice__pic" : "voicebig__pic"}
         style={{
           width: sz, height: sz,
           background: `radial-gradient(circle at 35% 30%, oklch(0.78 0.14 ${hue}), oklch(0.32 0.06 ${hue + 20}))`,
         }}>
      <span style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontFamily: "var(--font-mono)",
        fontSize: small ? 11 : 16, fontWeight: 600, color: "oklch(0.97 0 0)",
        letterSpacing: "0.04em", zIndex: 1,
        textShadow: "0 1px 2px oklch(0 0 0 / 0.5)",
      }}>{label}</span>
    </div>
  );
}

// Hero waveform SVG ------------------------------------------------
function HeroWave() {
  const W = 1100, H = 116;
  const N = 320;
  const arr = bars(N, 42, 0.05, 1);
  const cx = W / N;
  const mid = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="wg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.85 0.16 80)" stopOpacity="1"/>
          <stop offset="100%" stopColor="oklch(0.55 0.16 60)" stopOpacity="0.7"/>
        </linearGradient>
        <linearGradient id="wgsoft" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.5 0.02 240)" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="oklch(0.4 0.02 240)" stopOpacity="0.4"/>
        </linearGradient>
      </defs>
      {arr.map((v, i) => {
        const x = i * cx;
        const h = v * (H - 30);
        const playedRatio = 0.38;
        const fill = (i / N) < playedRatio ? "url(#wg)" : "url(#wgsoft)";
        return <rect key={i} x={x} y={mid - h/2} width={cx * 0.7} height={h}
                     fill={fill} rx={cx * 0.3} />;
      })}
      {/* baseline */}
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="oklch(1 0 0 / 0.04)" />
    </svg>
  );
}

// Sparkline
function Spark({ seed = 3, up = true }) {
  const N = 18;
  const arr = bars(N, seed, 0.1, 1);
  const W = 60, H = 24;
  const pts = arr.map((v, i) => `${(i/(N-1))*W},${H - v*H*0.85 - 1}`).join(" ");
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none"
                stroke={up ? "oklch(0.78 0.13 165)" : "oklch(0.78 0.14 50)"}
                strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Voice cards row
const VOICES = [
  { id: "mai", name: "Mai · 매이", lang: "KO · F · 27y", hue: 50, tags: ["Warm", "Narrator"], on: true, fav: true, model: "VOICEBOX" },
  { id: "siwon", name: "Si-won", lang: "KO · M · 33y", hue: 220, tags: ["Calm", "Doc"], fav: false, model: "VOICEBOX" },
  { id: "akari", name: "Akari", lang: "JP · F · 24y", hue: 340, tags: ["Bright"], fav: true, model: "S2-PRO" },
  { id: "noah", name: "Noah", lang: "EN · M · 41y", hue: 160, tags: ["Gravelly"], fav: false, model: "BASE 1.7B" },
  { id: "lucia", name: "Lucia", lang: "ES · F · 29y", hue: 30, tags: ["Soft"], fav: false, model: "CV 1.7B" },
];

function VoiceCast({ active, setActive }) {
  return (
    <div className="cast">
      <div className="section-h">
        <h3>Cast <small>· 5 voices in scene</small></h3>
        <a>Browse library →</a>
      </div>
      <div className="cast__row">
        {VOICES.map((v, i) => (
          <div key={v.id} className={`voice ${active === v.id ? "is-on" : ""}`}
               onClick={() => setActive(v.id)}>
            <div className="voice__top">
              <VoiceAvatar hue={v.hue} small label={v.name.slice(0, 2).toUpperCase()} />
              <div style={{ minWidth: 0 }}>
                <h6 className="voice__name">{v.name}</h6>
                <div className="voice__meta">{v.lang} · {v.model}</div>
              </div>
            </div>
            <MiniWave n={42} seed={i * 13 + 3} />
            <div className="voice__tags">
              {v.tags.map(t => <span key={t}>{t}</span>)}
            </div>
            <div className={`voice__star ${v.fav ? "on" : ""}`}>
              <svg className="ico-sm" viewBox="0 0 24 24" fill={v.fav ? "currentColor" : "none"}
                   stroke="currentColor" strokeWidth="1.6">
                <path d="M12 3l2.6 5.7 6.2.7-4.6 4.3 1.3 6.1L12 16.9 6.5 19.8l1.3-6.1L3.2 9.4l6.2-.7z"/>
              </svg>
            </div>
          </div>
        ))}
        <div className="voice" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 6, color: "var(--muted)",
          borderStyle: "dashed", background: "transparent", minHeight: 130,
        }}>
          <svg className="ico-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <small style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>ADD VOICE</small>
        </div>
      </div>
    </div>
  );
}

// Script editor body --------------------------------------------------
function Script() {
  const lines = 8;
  return (
    <div className="script">
      <div className="script__hdr">
        <h4>
          <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 5h16M4 10h10M4 15h16M4 20h7"/>
          </svg>
          Script
          <small>· episode_03_intro.txt</small>
        </h4>
        <div className="spacer" />
        <div className="seg">
          <button className="on">Plain</button>
          <button>SSML</button>
          <button>Dialog</button>
        </div>
        <div className="seg" style={{ marginLeft: 6 }}>
          <button>한</button>
          <button className="on">EN</button>
          <button>JP</button>
          <button>+</button>
        </div>
      </div>
      <div className="script__body">
        <div className="script__nums">
          {Array.from({ length: lines }, (_, i) => <div key={i}>{String(i + 1).padStart(2, "0")}</div>)}
        </div>
        <div className="script__text" contentEditable suppressContentEditableWarning>
          <div>
            <span className="speaker">MAI</span>
            We've been recording this in a quiet room for three nights.{" "}
            <span className="tag">⏱ <b>0.4s</b></span>{" "}
            And every time the train passes,{" "}
            <span className="pause" />
            the floor remembers.
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="speaker">MAI</span>
            <mark>The microphone is unforgiving</mark> — it hears the radiator,
            the dog two doors down,{" "}
            <span className="tag">😌 <b>warm</b></span>{" "}
            the way I breathe before I lie.
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="speaker b">SIWON</span>
            But that's the point, isn't it?{" "}
            <span className="tag">🎚 <b>+2 dB</b></span>{" "}
            The artifacts are the proof of life.
            <span className="cursor" />
          </div>
          <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13.5 }}>
            <span className="tag" style={{ color: "var(--muted)" }}>// scene</span>{" "}
            <i>A long pause. The kettle clicks off.</i>
          </div>
        </div>
      </div>
      <div className="script__ftr">
        <span><i className="dot" />Auto-saved <b style={{ color: "var(--ink-soft)" }}>2s ago</b></span>
        <span style={{ color: "var(--muted-2)" }}>·</span>
        <span>1,284 chars</span>
        <span style={{ color: "var(--muted-2)" }}>·</span>
        <span>≈ 47s render @ 22 kHz</span>
        <div className="right">
          <span className="pill">⌘ K  insert tag</span>
          <span className="pill">⌘ ⏎  render selection</span>
        </div>
      </div>
    </div>
  );
}

// Render preview / timeline + waveform + metrics
function RenderPreview() {
  return (
    <div className="render">
      <div className="render__hdr">
        <h4><i />Live preview <small style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontWeight: 400, fontSize: 10.5 }}>· take_018  ·  voicebox-1.7B-mai-extra1</small></h4>
        <div className="right">
          <button className="tbtn"><svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12h14M12 5l7 7-7 7"/></svg>A/B</button>
          <button className="tbtn"><svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5v14M5 12l7 7 7-7"/></svg>WAV</button>
          <button className="tbtn"><svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 12h16M12 4v16"/></svg>Add to scene</button>
        </div>
      </div>
      <div className="render__body">
        <div className="timeline">
          <div className="timeline__lane">
            <div className="timeline__label">
              <b><span style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.78 0.14 50)", boxShadow: "0 0 6px oklch(0.78 0.14 50)" }} />MAI</b>
              <small>VOICEBOX · -3 LUFS</small>
            </div>
            <div className="timeline__row" style={{ background: "linear-gradient(to right, transparent 0, oklch(1 0 0 / 0.01) 50%, transparent 100%)" }}>
              <div className="clip" style={{ width: "42%", marginLeft: 0 }}>
                <div className="clip__wave">
                  {bars(60, 11).map((v, i) => <span key={i} style={{ height: `${v * 100}%` }} />)}
                </div>
                <span className="clip__lbl">01 · 12.4s</span>
              </div>
              <div className="clip" style={{ width: "30%", marginLeft: 8 }}>
                <div className="clip__wave">
                  {bars(40, 23).map((v, i) => <span key={i} style={{ height: `${v * 100}%` }} />)}
                </div>
                <span className="clip__lbl">02 · 8.7s</span>
              </div>
            </div>
          </div>
          <div className="timeline__lane">
            <div className="timeline__label">
              <b><span style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.85 0.13 200)", boxShadow: "0 0 6px oklch(0.85 0.13 200)" }} />SIWON</b>
              <small>VOICEBOX · -3 LUFS</small>
            </div>
            <div className="timeline__row">
              <div className="clip clip--alt" style={{ width: "26%", marginLeft: "44%" }}>
                <div className="clip__wave">
                  {bars(34, 51).map((v, i) => <span key={i} style={{ height: `${v * 100}%` }} />)}
                </div>
                <span className="clip__lbl">03 · 6.9s</span>
              </div>
            </div>
          </div>
          <div className="timeline__lane">
            <div className="timeline__label">
              <b><span style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.6 0.04 240)" }} />ROOM</b>
              <small>MMAUDIO · -22 LUFS</small>
            </div>
            <div className="timeline__row">
              <div className="clip" style={{
                width: "92%", marginLeft: 0,
                background: "linear-gradient(180deg, oklch(0.6 0.02 240 / 0.18), oklch(0.4 0.02 240 / 0.1))",
                borderColor: "oklch(0.6 0.02 240 / 0.4)", color: "oklch(0.85 0.02 240)"
              }}>
                <div className="clip__wave">
                  {bars(120, 91, 0.1, 0.5).map((v, i) => <span key={i} style={{ height: `${v * 100}%` }} />)}
                </div>
                <span className="clip__lbl">kettle_room_tone.wav · 28.0s</span>
              </div>
            </div>
          </div>
        </div>

        <div className="canvas-wave">
          <HeroWave />
          <div className="canvas-wave__playhead" />
          <div className="canvas-wave__time">
            <b>00:10.642</b><small>/ 00:28.110</small>
          </div>
          <div className="canvas-wave__ruler">
            {Array.from({ length: 12 }, (_, i) => <span key={i}>{String(i * 2).padStart(2, "0")}s</span>)}
          </div>
        </div>

        <div className="analysis">
          <div className="metric">
            <h6>Loudness</h6>
            <div className="v">-14.2 <small>LUFS</small></div>
            <div className="delta">+0.4 vs broadcast</div>
            <Spark seed={3} up />
          </div>
          <div className="metric">
            <h6>Speaker similarity</h6>
            <div className="v">0.963 <small>cos</small></div>
            <div className="delta">+0.018 vs base</div>
            <Spark seed={9} up />
          </div>
          <div className="metric">
            <h6>Word-error rate</h6>
            <div className="v">1.4 <small>%</small></div>
            <div className="delta dn">+0.2 since v17</div>
            <Spark seed={17} up={false} />
          </div>
          <div className="metric">
            <h6>Render</h6>
            <div className="v">2.1 <small>×RT</small></div>
            <div className="delta">FA-2 · adafactor</div>
            <Spark seed={31} up />
          </div>
        </div>
      </div>
    </div>
  );
}

// Generations list (recent takes)
const GENS = [
  { on: true,  title: "Episode 03 · Intro narration",      voiceLabel: "Mai", hue: 50,  dur: "0:28.1", ago: "just now",   model: "VOICEBOX-1.7B"  },
  { on: false, title: "Cold open — kettle scene",          voiceLabel: "Mai", hue: 50,  dur: "0:18.4", ago: "12m ago",    model: "VOICEBOX-1.7B"  },
  { on: false, title: "Si-won pickup, take 4",             voiceLabel: "Siwon", hue: 220, dur: "0:09.7", ago: "26m ago",   model: "VOICEBOX-1.7B"  },
  { on: false, title: "ES localization — Lucia v2",        voiceLabel: "Lucia", hue: 30,  dur: "0:42.0", ago: "1h ago",    model: "CV-1.7B"        },
  { on: false, title: "Akari · multilingual smoke test",   voiceLabel: "Akari", hue: 340, dur: "0:11.2", ago: "3h ago",    model: "S2-PRO"         },
];

function Generations() {
  return (
    <div className="gens">
      <div className="gens__hdr">
        <h4>
          <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 12a9 9 0 1 0 9-9M12 7v5l3 2"/>
          </svg>
          Recent takes
          <small style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 400 }}>· 284 in gallery</small>
        </h4>
        <div className="right">
          <div className="seg2">
            <button className="on">Mine</button>
            <button>Starred</button>
            <button>Shared</button>
          </div>
          <button className="tbtn"><svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filter</button>
        </div>
      </div>
      {GENS.map((g, i) => (
        <div className={`genrow ${g.on ? "is-on" : ""}`} key={i}>
          <button className="play">
            {g.on ? (
              <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="3.5" height="12" rx="1"/><rect x="13.5" y="6" width="3.5" height="12" rx="1"/></svg>
            ) : (
              <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <div className="title">
            <b>{g.title}</b>
            <small>{g.model} · 22050 Hz · 16-bit · -14 LUFS</small>
          </div>
          <div className="mini-wave">
            {bars(48, i * 7 + 3).map((v, j) => <span key={j} style={{ height: `${v * 100}%` }} />)}
          </div>
          <div className="voice-tag">
            <i style={{ background: `radial-gradient(circle at 30% 30%, oklch(0.78 0.14 ${g.hue}), oklch(0.32 0.06 ${g.hue + 20}))` }} />
            {g.voiceLabel}
          </div>
          <span className="dur">{g.dur}</span>
          <span className="ts">{g.ago}</span>
          <button className="dots">
            <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function Canvas({ active, setActive }) {
  return (
    <main className="canvas">
      <div className="canvas__inner">
        <div className="page-head">
          <div className="page-head__l">
            <div className="page-head__eyebrow"><i />QWEN · SPEECH</div>
            <h1 className="page-head__title">
              Text → <b>Speech</b>
              <small>VOICEBOX-1.7B · MAI / KO</small>
            </h1>
            <p className="page-head__sub">
              Compose multi-voice scripts with style direction, room tone,
              and inline expression tags. Renders ship to your gallery
              with full provenance.
            </p>
          </div>
          <div className="page-head__r">
            <div className="tabstrip">
              <button className="tabstrip__t is-on">Compose <small>⌘ 1</small></button>
              <button className="tabstrip__t">Direct <small>⌘ 2</small></button>
              <button className="tabstrip__t">Batch <small>⌘ 3</small></button>
              <button className="tabstrip__t">Provenance</button>
            </div>
            <button className="tbtn">Open in Studio →</button>
          </div>
        </div>

        <Script />
        <VoiceCast active={active} setActive={setActive} />
        <RenderPreview />
        <Generations />
      </div>
    </main>
  );
}

window.Canvas = Canvas;
