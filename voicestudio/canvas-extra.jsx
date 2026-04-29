// ACE-Step Composer + Voice Clone screens
// Live in canvas.jsx sibling — switched by App via `tab` prop.

const Im = ({ d, w = 14, fill = "none" }) => (
  <svg className="ico" width={w} height={w} viewBox="0 0 24 24" fill={fill}
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((x, i) => <path key={i} d={x} />)}
  </svg>
);

function rngBars(n, seed = 1, min = 0.18, max = 1) {
  let s = seed;
  return Array.from({ length: n }, (_, i) => {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const env = Math.sin((i / n) * Math.PI) * 0.65 + 0.35;
    return min + (max - min) * (0.4 + 0.6 * r) * env;
  });
}

/* ============================================================
   ACE-STEP MUSIC COMPOSER
   ============================================================ */

const ACE_MODES = [
  { k: "text2music", l: "Text → Music", h: "from prompt + lyrics" },
  { k: "cover",      l: "Cover",        h: "restyle a track" },
  { k: "repaint",    l: "Repaint",      h: "in-paint a section" },
  { k: "extend",     l: "Extend",       h: "continue a track" },
  { k: "extract",    l: "Extract",      h: "stems & melody" },
  { k: "lego",       l: "Lego",         h: "stitch sections" },
  { k: "complete",   l: "Complete",     h: "finish a sketch" },
  { k: "understand", l: "Understand",   h: "tag + analyze" },
  { k: "inspire",    l: "Inspiration",  h: "prompt riffs" },
  { k: "format",     l: "Format",       h: "score / midi" },
];

const GENRES = ["acoustic", "ambient", "downtempo", "house", "trap", "post-rock",
                "k-ballad", "city pop", "lo-fi", "orchestral", "drum & bass", "neo-soul"];
const MOODS = ["nostalgic", "tense", "euphoric", "melancholy", "warm", "minimal"];
const INSTR = ["rhodes", "808", "felt piano", "saxophone", "vinyl crackle", "tape choir", "moog bass"];

function Spectrogram() {
  // procedural spectrogram via grid of cells
  const W = 56, H = 18;
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.max(0,
        Math.sin(x * 0.18 + y * 0.4) * 0.4 +
        Math.cos((x - 30) * 0.12) * 0.3 +
        ((y > H - 6) ? 0.4 : 0) +
        ((Math.sin(x * 0.6 + y) > 0.7) ? 0.3 : 0)
      );
      const a = Math.min(1, v + 0.1);
      const hue = 70 - (y / H) * 30;
      cells.push({ x, y, a, hue });
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {cells.map((c, i) =>
        <rect key={i} x={c.x} y={c.y} width="1" height="1"
              fill={`oklch(0.78 0.16 ${c.hue} / ${c.a})`} />)}
    </svg>
  );
}

function MusicTimeline() {
  const tracks = [
    { name: "DRUMS",    sub: "808 · trap kit",     hue: 50, w: 100, off: 0 },
    { name: "BASS",     sub: "moog · sub",         hue: 30, w: 92,  off: 8 },
    { name: "RHODES",   sub: "felt · wide",        hue: 220, w: 80, off: 16 },
    { name: "VOCAL",    sub: "Mai · clone+sing",   hue: 350, w: 64, off: 28 },
    { name: "TEXTURE",  sub: "tape choir",         hue: 160, w: 88, off: 6 },
  ];
  return (
    <div className="timeline" style={{ marginTop: 0 }}>
      {tracks.map((t, i) => (
        <div className="timeline__lane" key={i}>
          <div className="timeline__label">
            <b><span style={{ width: 8, height: 8, borderRadius: "50%",
                              background: `oklch(0.78 0.14 ${t.hue})`,
                              boxShadow: `0 0 6px oklch(0.78 0.14 ${t.hue})` }} />
              {t.name}</b>
            <small>{t.sub}</small>
          </div>
          <div className="timeline__row">
            <div className="clip" style={{
              width: `${t.w - t.off}%`, marginLeft: `${t.off}%`,
              background: `linear-gradient(180deg, oklch(0.78 0.14 ${t.hue} / 0.3), oklch(0.5 0.14 ${t.hue} / 0.18))`,
              borderColor: `oklch(0.78 0.14 ${t.hue} / 0.45)`,
              color: `oklch(0.95 0.06 ${t.hue})`,
            }}>
              <div className="clip__wave">
                {rngBars(120, i * 19 + 7).map((v, j) => <span key={j} style={{ height: `${v * 100}%` }} />)}
              </div>
              <span className="clip__lbl">{t.name.toLowerCase()}_{(i + 1).toString().padStart(2, "0")}.wav</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChipRow({ items, picked = [] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {items.map((it, i) => {
        const on = picked.includes(it);
        return (
          <span key={i} style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5,
            padding: "3px 9px",
            border: `1px solid ${on ? "var(--accent-edge)" : "var(--line)"}`,
            borderRadius: 999,
            background: on ? "var(--accent-soft)" : "var(--bg-2)",
            color: on ? "var(--ink)" : "var(--muted)",
            letterSpacing: "0.02em",
            cursor: "pointer",
          }}>{it}</span>
        );
      })}
    </div>
  );
}

function MusicCanvas() {
  const [mode, setMode] = React.useState("text2music");
  return (
    <main className="canvas">
      <div className="canvas__inner">
        <div className="page-head">
          <div className="page-head__l">
            <div className="page-head__eyebrow"><i />MUSIC · ACE-STEP-1.5</div>
            <h1 className="page-head__title">
              Music <b>Composer</b>
              <small>DiT-XL · turbo · 4× LoRA</small>
            </h1>
            <p className="page-head__sub">
              Ten generation modes from one DiT backbone. Compose from
              prompt, restyle covers, repaint sections, or stitch lego
              blocks. Vocals route through your VoiceBox cast.
            </p>
          </div>
          <div className="page-head__r">
            <div className="tabstrip">
              <button className="tabstrip__t is-on">Composer</button>
              <button className="tabstrip__t">Library</button>
              <button className="tabstrip__t">Renders <small>· 18</small></button>
            </div>
            <button className="tbtn tbtn--accent">
              <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Generate · 2:24
            </button>
          </div>
        </div>

        {/* Mode picker — pill grid */}
        <div className="cast" style={{ marginBottom: 18 }}>
          <div className="section-h">
            <h3>Mode <small>· {ACE_MODES.find(m => m.k === mode)?.h}</small></h3>
            <a>What's this? →</a>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8,
          }}>
            {ACE_MODES.map((m) => {
              const on = mode === m.k;
              return (
                <button key={m.k} onClick={() => setMode(m.k)}
                  style={{
                    padding: "10px 12px",
                    border: `1px solid ${on ? "var(--accent-edge)" : "var(--line)"}`,
                    borderRadius: 10,
                    background: on
                      ? "linear-gradient(180deg, oklch(0.78 0.16 70 / 0.18), oklch(0.78 0.16 70 / 0.06))"
                      : "var(--panel-soft)",
                    boxShadow: on ? "0 0 0 1px var(--accent-edge), 0 8px 18px -10px oklch(0.78 0.16 70 / 0.5)" : "none",
                    color: on ? "var(--ink)" : "var(--ink-soft)",
                    textAlign: "left", cursor: "pointer",
                    display: "flex", flexDirection: "column", gap: 3,
                  }}>
                  <b style={{ fontSize: 12.5, fontWeight: 500 }}>{m.l}</b>
                  <small style={{ fontFamily: "var(--font-mono)", fontSize: 9.5,
                                  color: on ? "var(--accent)" : "var(--muted)" }}>{m.h}</small>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prompt + Lyrics */}
        <div className="script" style={{ marginBottom: 18 }}>
          <div className="script__hdr">
            <h4>
              <Im d="M4 5h16M4 10h10M4 15h16M4 20h7" w={12} />
              Style prompt + lyrics
              <small>· 02:24 · 130 BPM · A♭ minor</small>
            </h4>
            <div className="spacer" />
            <div className="seg">
              <button className="on">Prompt</button>
              <button>Lyrics</button>
              <button>Structure</button>
            </div>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9.5,
                color: "var(--muted-2)", letterSpacing: "0.12em",
                textTransform: "uppercase", marginBottom: 6,
              }}>Prompt</div>
              <div style={{
                fontSize: 14, lineHeight: 1.65, color: "var(--ink)",
                fontFamily: "var(--font-ui)",
              }}>
                A late-night neo-soul ballad with felt piano,{" "}
                <mark style={{ background: "oklch(0.78 0.16 70 / 0.12)", borderBottom: "1px dashed var(--accent-edge)", padding: "0 2px" }}>warm tape saturation</mark>,
                a soft 808 sub that sits under the verse, brushed snare,
                and a Korean female vocal with intimate phrasing.{" "}
                <mark style={{ background: "oklch(0.85 0.13 200 / 0.12)", borderBottom: "1px dashed oklch(0.85 0.13 200 / 0.4)", padding: "0 2px" }}>The bridge opens up with a wide tape choir</mark>
                and a single sustained Rhodes chord.
                <span style={{
                  display: "inline-block", width: 2, height: 18,
                  background: "var(--accent)", verticalAlign: -3,
                  marginLeft: 1, animation: "blink 1.05s steps(2) infinite",
                  boxShadow: "0 0 6px var(--accent)",
                }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9.5,
                  color: "var(--muted-2)", letterSpacing: "0.12em",
                  textTransform: "uppercase", marginBottom: 8,
                }}>Genre</div>
                <ChipRow items={GENRES} picked={["neo-soul", "lo-fi", "k-ballad"]} />
              </div>
              <div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9.5,
                  color: "var(--muted-2)", letterSpacing: "0.12em",
                  textTransform: "uppercase", marginBottom: 8,
                }}>Mood</div>
                <ChipRow items={MOODS} picked={["nostalgic", "warm"]} />
              </div>
              <div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9.5,
                  color: "var(--muted-2)", letterSpacing: "0.12em",
                  textTransform: "uppercase", marginBottom: 8,
                }}>Instruments</div>
                <ChipRow items={INSTR} picked={["felt piano", "808", "tape choir"]} />
              </div>
            </div>
          </div>
          <div className="script__ftr">
            <span><i className="dot" />DiT-XL · turbo · 4 LoRA layered</span>
            <span style={{ color: "var(--muted-2)" }}>·</span>
            <span>guidance 7.5  ·  seed 0xA1·772D</span>
            <div className="right">
              <span className="pill">⌘ ⏎  generate</span>
              <span className="pill">⌘ R  reroll seed</span>
            </div>
          </div>
        </div>

        {/* Stems timeline */}
        <div className="render" style={{ marginBottom: 18 }}>
          <div className="render__hdr">
            <h4><i />Live arrangement <small style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontWeight: 400, fontSize: 10.5 }}>· run_044  ·  ace-step-1.5-XL</small></h4>
            <div className="right">
              <button className="tbtn">Stems · 5</button>
              <button className="tbtn">MIDI</button>
              <button className="tbtn">Master</button>
            </div>
          </div>
          <div className="render__body">
            <MusicTimeline />

            <div style={{
              marginTop: 14, height: 132,
              border: "1px solid var(--line)", borderRadius: 12,
              background: "var(--bg-1)", overflow: "hidden", position: "relative",
            }}>
              <div style={{ position: "absolute", inset: 0 }}><Spectrogram /></div>
              <div className="canvas-wave__playhead" style={{ left: "44%" }} />
              <div className="canvas-wave__time">
                <b>01:03.220</b><small>/ 02:24.000</small>
              </div>
              <div style={{
                position: "absolute", left: 10, top: 8,
                fontFamily: "var(--font-mono)", fontSize: 9.5,
                color: "var(--muted)", letterSpacing: "0.1em",
                textTransform: "uppercase",
                background: "oklch(0 0 0 / 0.5)", padding: "2px 7px",
                border: "1px solid var(--line-soft)", borderRadius: 4,
              }}>SPECTRUM · MEL · 80 BAND</div>
              <div className="canvas-wave__ruler">
                {["INTRO", "VERSE", "PRE", "CHORUS", "VERSE", "CHORUS", "BRIDGE", "CHORUS", "OUTRO"].map((s, i) => (
                  <span key={i} style={{ fontFamily: "var(--font-mono)" }}>{s}</span>
                ))}
              </div>
            </div>

            <div className="analysis">
              <div className="metric">
                <h6>Tempo</h6>
                <div className="v">130 <small>BPM</small></div>
                <div className="delta">stable ±0.3</div>
              </div>
              <div className="metric">
                <h6>Key</h6>
                <div className="v">A♭m <small>· conf 0.91</small></div>
                <div className="delta">aeolian, modal</div>
              </div>
              <div className="metric">
                <h6>Loudness</h6>
                <div className="v">-9.4 <small>LUFS</small></div>
                <div className="delta">streaming-safe</div>
              </div>
              <div className="metric">
                <h6>Render</h6>
                <div className="v">3.4 <small>×RT</small></div>
                <div className="delta">turbo · A100</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent renders */}
        <div className="gens">
          <div className="gens__hdr">
            <h4>
              <Im d="M3 12a9 9 0 1 0 9-9M12 7v5l3 2" w={12} />
              Renders
              <small style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 400 }}>· 18 in run group</small>
            </h4>
          </div>
          {[
            { t: "kettle_room · v07 · bridge wider", g: "neo-soul · 02:24", h: 50, dur: "2:24.0", ago: "now" },
            { t: "kettle_room · v06 · less 808",    g: "neo-soul · 02:24", h: 30, dur: "2:24.0", ago: "9m" },
            { t: "kettle_room · cover (lo-fi)",     g: "lo-fi · 02:14",    h: 220, dur: "2:14.4", ago: "23m" },
            { t: "kettle_room · extend +0:32",      g: "neo-soul · 02:56", h: 160, dur: "2:56.1", ago: "44m" },
          ].map((g, i) => (
            <div className="genrow" key={i}>
              <button className="play">
                <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <div className="title">
                <b>{g.t}</b>
                <small>{g.g}  ·  44.1 kHz · stereo · -9.4 LUFS</small>
              </div>
              <div className="mini-wave">
                {rngBars(48, i * 17 + 11).map((v, j) => <span key={j} style={{ height: `${v * 100}%` }} />)}
              </div>
              <div className="voice-tag">
                <i style={{ background: `radial-gradient(circle at 30% 30%, oklch(0.78 0.14 ${g.h}), oklch(0.32 0.06 ${g.h + 20}))` }} />
                ACE-Step
              </div>
              <span className="dur">{g.dur}</span>
              <span className="ts">{g.ago}</span>
              <button className="dots">
                <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ============================================================
   VOICE CLONE
   ============================================================ */

function CloneCanvas() {
  return (
    <main className="canvas">
      <div className="canvas__inner">
        <div className="page-head">
          <div className="page-head__l">
            <div className="page-head__eyebrow"><i />QWEN · CLONE</div>
            <h1 className="page-head__title">
              Voice <b>Clone</b>
              <small>BASE-1.7B · clone-prompt</small>
            </h1>
            <p className="page-head__sub">
              Drop 6–60 seconds of a clean reference. We extract a clone
              prompt, save it as a reusable style asset, and let you test
              against held-out lines before committing.
            </p>
          </div>
          <div className="page-head__r">
            <div className="tabstrip">
              <button className="tabstrip__t is-on">From audio</button>
              <button className="tabstrip__t">From preset</button>
              <button className="tabstrip__t">Saved prompts <small>· 7</small></button>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div style={{
          border: "1px dashed var(--line-strong)",
          borderRadius: 18,
          background:
            "linear-gradient(180deg, var(--panel), var(--panel-soft))",
          padding: 22,
          display: "grid", gridTemplateColumns: "320px 1fr",
          gap: 20, alignItems: "center",
          marginBottom: 22,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 30% 0%, oklch(0.78 0.16 70 / 0.08), transparent 60%)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "relative",
            border: "1px solid var(--line)",
            background: "var(--bg-1)", borderRadius: 14,
            padding: "20px 18px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: "linear-gradient(180deg, oklch(0.85 0.16 75 / 0.18), oklch(0.55 0.16 60 / 0.05))",
              border: "1px solid var(--accent-edge)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)",
            }}>
              <Im d={["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"]} w={20} />
            </div>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
              Drop reference audio
            </h4>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              WAV / MP3 / FLAC · 6–60s · single speaker, low room tone.
              We auto-trim silence and EQ-match.
            </p>
            <button className="btn-cta" style={{ height: 32, fontSize: 11.5, padding: "0 12px", marginTop: 6 }}>
              Browse files
            </button>
          </div>

          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "radial-gradient(circle at 35% 30%, oklch(0.78 0.14 50), oklch(0.32 0.06 70))",
                border: "1px solid var(--line)",
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>mai_reference_clean.wav</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>
                  22050 Hz · mono · 0:14.220 · -22.4 LUFS · SNR 41 dB
                </div>
              </div>
              <button className="tbtn">Replace</button>
              <button className="tbtn tbtn--accent">
                <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Preview
              </button>
            </div>
            <div className="canvas-wave" style={{ height: 86, marginTop: 4 }}>
              <svg viewBox="0 0 1100 86" preserveAspectRatio="none">
                {rngBars(280, 7).map((v, i) => {
                  const x = (i / 280) * 1100;
                  const h = v * 56;
                  return <rect key={i} x={x} y={43 - h / 2} width={1100/280 * 0.7} height={h}
                               fill="oklch(0.78 0.16 70 / 0.85)" rx="0.6" />;
                })}
                <line x1="0" y1="43" x2="1100" y2="43" stroke="oklch(1 0 0 / 0.04)" />
              </svg>
              <div className="canvas-wave__playhead" style={{ left: "22%" }} />
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10,
              fontFamily: "var(--font-mono)", fontSize: 10.5,
            }}>
              {[
                ["TIMBRE",     "warm · low-mid"],
                ["F0 mean",    "186 Hz"],
                ["F0 range",   "118 → 268 Hz"],
                ["JITTER",     "0.41 %"],
              ].map(([k, v]) => (
                <div key={k} style={{
                  border: "1px solid var(--line-soft)", borderRadius: 8,
                  padding: "6px 9px", background: "var(--bg-2)",
                }}>
                  <div style={{ color: "var(--muted-2)", fontSize: 9.5, letterSpacing: "0.1em" }}>{k}</div>
                  <div style={{ color: "var(--ink)", fontSize: 12, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side-by-side: Prompt extraction status + A/B test */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
          {/* Extraction pipeline */}
          <div className="render">
            <div className="render__hdr">
              <h4><i />Clone-prompt extraction <small style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontWeight: 400, fontSize: 10.5 }}>· base-1.7b</small></h4>
            </div>
            <div className="render__body">
              {[
                { k: "Resample → 22050 Hz",       s: "done" },
                { k: "Trim silence + RMS norm",   s: "done" },
                { k: "Qwen3-ASR transcribe (KO)", s: "done", v: "「조용한 방에서 사흘 밤을 녹음했어요…」" },
                { k: "Speaker encoder (4096-d)",  s: "done", v: "embedding cosine 0.971 vs Mai-base" },
                { k: "Style probe (12 axes)",     s: "active" },
                { k: "Persist to data/clone-prompts/", s: "queued" },
              ].map((row, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 0",
                  borderBottom: i < 5 ? "1px solid var(--line-soft)" : "none",
                  fontSize: 12.5, color: "var(--ink)",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 5,
                    flexShrink: 0,
                    background:
                      row.s === "done"   ? "oklch(0.78 0.13 165 / 0.18)"
                    : row.s === "active" ? "oklch(0.78 0.16 70 / 0.18)"
                                         : "var(--bg-2)",
                    border: `1px solid ${
                      row.s === "done"   ? "oklch(0.78 0.13 165 / 0.5)"
                    : row.s === "active" ? "var(--accent-edge)"
                                         : "var(--line)"}`,
                    color:
                      row.s === "done"   ? "oklch(0.85 0.13 165)"
                    : row.s === "active" ? "var(--accent)"
                                         : "var(--muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {row.s === "done" ?
                      <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12l5 5 9-11" strokeLinecap="round" strokeLinejoin="round" /></svg> :
                     row.s === "active" ?
                      <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="3" fill="currentColor" /></svg> :
                      <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="6" /></svg>}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <b style={{ fontWeight: 500 }}>{row.k}</b>
                      <small style={{
                        fontFamily: "var(--font-mono)", fontSize: 9.5,
                        color: row.s === "active" ? "var(--accent)" : "var(--muted-2)",
                        textTransform: "uppercase", letterSpacing: "0.1em",
                      }}>{row.s}</small>
                    </div>
                    {row.v && <div style={{
                      fontFamily: row.k.includes("Qwen3-ASR") ? "var(--font-ui)" : "var(--font-mono)",
                      fontSize: 11, color: "var(--muted)",
                      marginTop: 3,
                    }}>{row.v}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* A/B test */}
          <div className="render">
            <div className="render__hdr">
              <h4><i />Held-out A/B test <small style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontWeight: 400, fontSize: 10.5 }}>· text not in reference</small></h4>
              <div className="right">
                <button className="tbtn">Reroll line</button>
              </div>
            </div>
            <div className="render__body">
              <div style={{
                padding: "12px 14px", border: "1px solid var(--line-soft)",
                borderRadius: 10, background: "var(--bg-1)", marginBottom: 12,
                fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)",
              }}>
                "비가 올 때마다 그 카페의 라디오가 더 크게 들렸다."
              </div>

              {[
                { lbl: "A · Reference",  v: 1, sim: "—",     w: 54, on: false },
                { lbl: "B · Clone v1",   v: 2, sim: "0.952", w: 80, on: true  },
                { lbl: "C · Clone v2",   v: 3, sim: "0.961", w: 86, on: false },
              ].map((r) => (
                <div key={r.lbl} style={{
                  display: "grid", gridTemplateColumns: "100px 1fr 80px 36px",
                  alignItems: "center", gap: 12, padding: "8px 4px",
                  borderRadius: 8,
                  background: r.on ? "oklch(0.78 0.16 70 / 0.06)" : "transparent",
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: r.on ? "var(--accent)" : "var(--muted)" }}>
                    {r.lbl}
                  </div>
                  <div style={{ display: "flex", gap: 1.5, height: 28, alignItems: "center" }}>
                    {rngBars(54, r.v * 13).map((v, i) =>
                      <span key={i} style={{
                        flex: 1,
                        height: `${v * 100}%`,
                        background: r.on ? "var(--accent)" : "var(--muted-2)",
                        opacity: r.on ? 0.9 : 0.55,
                        borderRadius: 1,
                      }} />)}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink)" }}>
                    {r.sim}<small style={{ color: "var(--muted)" }}> sim</small>
                  </div>
                  <button className="t-btn" style={{ width: 28, height: 28 }}>
                    <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
              ))}

              <div style={{
                marginTop: 14, display: "flex", gap: 8, alignItems: "center",
                paddingTop: 12, borderTop: "1px solid var(--line-soft)",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", flex: 1 }}>
                  ✓ Speaker similarity passes 0.95 threshold
                </span>
                <button className="tbtn">Discard</button>
                <button className="btn-cta" style={{ height: 32, fontSize: 11.5, padding: "0 14px" }}>
                  Save as preset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Saved prompts gallery */}
        <div className="gens">
          <div className="gens__hdr">
            <h4>
              <Im d={["M5 5h14v14H5z", "M5 11l4-4 4 4 3-3 3 3"]} w={12} />
              Saved clone prompts
              <small style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 400 }}>· data/clone-prompts/</small>
            </h4>
          </div>
          {[
            { t: "mai_kettle_warm",       v: "Mai", h: 50,  dur: "0:14.2", ago: "now",    sim: "0.961" },
            { t: "siwon_documentary_low", v: "Si-won", h: 220, dur: "0:22.0", ago: "2d",  sim: "0.948" },
            { t: "akari_bright_jp",       v: "Akari", h: 340, dur: "0:18.7", ago: "5d",  sim: "0.972" },
          ].map((g, i) => (
            <div className="genrow" key={i}>
              <button className="play">
                <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <div className="title">
                <b>{g.t}</b>
                <small>BASE-1.7B  ·  speaker_encoder embedded  ·  sim {g.sim}</small>
              </div>
              <div className="mini-wave">
                {rngBars(48, i * 23 + 5).map((v, j) => <span key={j} style={{ height: `${v * 100}%` }} />)}
              </div>
              <div className="voice-tag">
                <i style={{ background: `radial-gradient(circle at 30% 30%, oklch(0.78 0.14 ${g.h}), oklch(0.32 0.06 ${g.h + 20}))` }} />
                {g.v}
              </div>
              <span className="dur">{g.dur}</span>
              <span className="ts">{g.ago}</span>
              <button className="dots">
                <svg className="ico-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

window.MusicCanvas = MusicCanvas;
window.CloneCanvas = CloneCanvas;
