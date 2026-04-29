// Inspector panel — voice / style / advanced
const Iv = ({ d, w = 14 }) => (
  <svg className="ico" width={w} height={w} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((x, i) => <path key={i} d={x} />)}
  </svg>
);

function Slider({ value, min = 0, max = 100, ticks = ["MIN", "MID", "MAX"], unit = "" }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider__track" />
      <div className="slider__fill" style={{ width: `${pct}%` }} />
      <div className="slider__thumb" style={{ left: `${pct}%` }} />
      <div className="slider__ticks">
        {ticks.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  );
}

function Knob({ label, hint, value, unit, min, max, ticks }) {
  return (
    <div className="knob">
      <div className="knob__row">
        <label>{hint && <i title={hint}>i</i>}{label}</label>
        <span className="knob__val">{value}<small>{unit}</small></span>
      </div>
      <Slider value={value} min={min} max={max} ticks={ticks} />
    </div>
  );
}

function Toggle({ label, sub, on }) {
  return (
    <div className="toggle">
      <div>
        <b>{label}</b>
        <small>{sub}</small>
      </div>
      <div className={`toggle__switch ${on ? "on" : ""}`} />
    </div>
  );
}

const STYLES = [
  { k: "narr",  l: "Narrator",   d: "warm, even" },
  { k: "doc",   l: "Documentary", d: "calm, low" },
  { k: "intim", l: "Intimate",   d: "close mic" },
  { k: "broad", l: "Broadcast",  d: "+ presence" },
  { k: "cine",  l: "Cinematic",  d: "wide, slow" },
  { k: "char",  l: "Character",  d: "playful" },
];

function Inspector() {
  const [tab, setTab] = React.useState("voice");
  const [style, setStyle] = React.useState("narr");

  return (
    <aside className="inspector">
      <div className="insp-tabs">
        <button className={tab === "voice" ? "on" : ""} onClick={() => setTab("voice")}>Voice <small>·V</small></button>
        <button className={tab === "style" ? "on" : ""} onClick={() => setTab("style")}>Style</button>
        <button className={tab === "adv"   ? "on" : ""} onClick={() => setTab("adv")}>Advanced</button>
      </div>

      <div className="insp__sec">
        <h5>Active voice <small>VOICEBOX</small></h5>
        <div className="voicebig">
          <div className="voicebig__top">
            <div className="voicebig__pic" style={{ background: "radial-gradient(circle at 35% 30%, oklch(0.78 0.14 50), oklch(0.32 0.06 70))" }}>
              <span style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", fontFamily: "var(--font-mono)",
                fontSize: 16, fontWeight: 600, color: "oklch(0.97 0 0)", zIndex: 1,
                textShadow: "0 1px 2px oklch(0 0 0 / 0.6)",
              }}>MA</span>
            </div>
            <div>
              <h4 className="voicebig__name">Mai · 매이</h4>
              <div className="voicebig__sub">KO · Female · 27y · ID 0x4A·MAI</div>
            </div>
          </div>
          <div className="voicebig__chips">
            <span>warm</span><span>narrator</span><span>低音 +2</span><span>self-contained</span>
          </div>
          <div className="voicebig__strip">
            {Array.from({ length: 56 }, (_, i) => {
              const v = (Math.sin(i * 0.4) * 0.5 + 0.5) * 0.7 + 0.3;
              return <span key={i} style={{ height: `${v * 100}%` }} />;
            })}
          </div>
        </div>
      </div>

      <div className="insp__sec">
        <h5>Direction <small>preset</small></h5>
        <div className="styles">
          {STYLES.map(s => (
            <button key={s.k} className={`style ${style === s.k ? "on" : ""}`}
                    onClick={() => setStyle(s.k)}>
              <Iv d={[
                s.k === "narr"  ? "M12 4v16M4 8h16M4 16h16"
                : s.k === "doc"  ? "M5 5h14v14H5zM9 9h6v6H9z"
                : s.k === "intim"? "M12 12m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0M12 8v8M8 12h8"
                : s.k === "broad"? "M3 12h2l4-9 4 18 4-9h4"
                : s.k === "cine" ? "M4 6h16v12H4zM4 10h16M4 14h16"
                : "M8 8a4 4 0 1 1 8 0v8a4 4 0 1 1-8 0z"
              ]} w={16}/>
              <b>{s.l}</b>
              <small>{s.d}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="insp__sec">
        <h5>Performance</h5>
        <Knob label="Pace"     value={104} unit=" %"  min={50} max={150}
              ticks={["0.5×","1×","1.5×"]} />
        <Knob label="Energy"   value={62}  unit=""    min={0}  max={100}
              ticks={["soft","spoken","shout"]} />
        <Knob label="Pitch"    value={-2}  unit=" st" min={-12} max={12}
              ticks={["-12","0","+12"]} />
        <Knob label="Stability" value={78}  unit=" %" min={0}  max={100}
              ticks={["loose","balanced","tight"]} />
      </div>

      <div className="insp__sec">
        <h5>Acoustics</h5>
        <div className="advanced">
          <div className="fld">
            <label>Room</label>
            <div className="input">Small studio <small>▾</small></div>
          </div>
          <div className="fld">
            <label>Mic</label>
            <div className="input">U87 · 18cm <small>▾</small></div>
          </div>
          <div className="fld">
            <label>Compression</label>
            <div className="input">Soft 3:1 <small>▾</small></div>
          </div>
          <div className="fld">
            <label>De-ess</label>
            <div className="input">−4.0 dB <small>▾</small></div>
          </div>
        </div>
      </div>

      <div className="insp__sec">
        <h5>Output</h5>
        <Toggle label="Apply mastering chain" sub="EBU R128 · target -14 LUFS, -1 dBTP" on />
        <Toggle label="Embed provenance" sub="C2PA + waveform fingerprint" on />
        <Toggle label="Auto-translate scene" sub="EN·KO·JP via Qwen" on={false} />
      </div>

      <div className="insp__sec" style={{ paddingBottom: 24 }}>
        <h5>Sampling <small>(advanced)</small></h5>
        <div className="advanced">
          <div className="fld"><label>Seed</label><div className="input">0x9F2A·1184<small>⟳</small></div></div>
          <div className="fld"><label>Top-p</label><div className="input">0.92<small>▾</small></div></div>
          <div className="fld"><label>Top-k</label><div className="input">50<small>▾</small></div></div>
          <div className="fld"><label>Temp</label><div className="input">0.7<small>▾</small></div></div>
          <div className="fld"><label>CFG</label><div className="input">3.2<small>▾</small></div></div>
          <div className="fld"><label>Sample rate</label><div className="input">22050<small>Hz</small></div></div>
        </div>
      </div>
    </aside>
  );
}

window.Inspector = Inspector;
