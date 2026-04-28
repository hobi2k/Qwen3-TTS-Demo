// VoiceStudio — main app
const { useState } = React;

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "onyx",
  "accentHue": 70,
  "density": "normal",
  "showTimeline": true
}/*EDITMODE-END*/;

function App() {
  const [tab, setTab] = useState("tts");
  const [active, setActive] = useState("mai");
  const [tw, setTw] = (typeof useTweaks === "function")
    ? useTweaks(TWEAKS_DEFAULTS)
    : useState(TWEAKS_DEFAULTS).map ? useState(TWEAKS_DEFAULTS) : [TWEAKS_DEFAULTS, () => {}];

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", tw.theme || "onyx");
    document.documentElement.setAttribute("data-density", tw.density || "normal");
    document.documentElement.style.setProperty("--accent", `oklch(0.78 0.16 ${tw.accentHue})`);
    document.documentElement.style.setProperty("--accent-soft", `oklch(0.78 0.16 ${tw.accentHue} / 0.16)`);
    document.documentElement.style.setProperty("--accent-edge", `oklch(0.78 0.16 ${tw.accentHue} / 0.45)`);
    document.documentElement.style.setProperty("--accent-ink", `oklch(0.18 0.04 ${tw.accentHue})`);
  }, [tw.theme, tw.accentHue, tw.density]);

  return (
    <div className="studio" data-screen-label="TTS Workspace">
      <TopBar />
      <Sidebar current={tab} onSelect={setTab} />
      {tab === "music" ? <MusicCanvas /> :
       tab === "clone" ? <CloneCanvas /> :
       <Canvas active={active} setActive={setActive} />}
      <Inspector />
      <Transport />

      {typeof TweaksPanel === "function" && (
        <TweaksPanel title="Tweaks">
          <TweakSection title="Theme">
            <TweakRadio value={tw.theme} options={[
              { value: "onyx", label: "Onyx" },
              { value: "storm", label: "Storm" },
              { value: "bone", label: "Bone" },
            ]} onChange={(v) => setTw("theme", v)} />
          </TweakSection>
          <TweakSection title="Accent">
            <TweakSlider min={0} max={360} step={5} value={tw.accentHue}
              onChange={(v) => setTw("accentHue", v)} unit="°" label="Hue" />
          </TweakSection>
          <TweakSection title="Density">
            <TweakRadio value={tw.density} options={[
              { value: "compact", label: "Compact" },
              { value: "normal", label: "Normal" },
              { value: "spacious", label: "Spacious" },
            ]} onChange={(v) => setTw("density", v)} />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
