// Sidebar (Navigator) component — VoiceStudio
// Product map drawn from the project's Korean tab list, but reorganized
// into a hierarchical product navigator with section labels + counts.

const I = ({ d, fill }) => (
  <svg viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const Icons = {
  home: <I d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  voices: <I d="M8 4v16M16 4v16M4 9v6M20 9v6M12 7v10" />,
  gallery: <I d="M3 5h18v14H3zM3 14l5-5 5 5 3-3 5 5" />,
  mic: <I d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />,
  speech: <I d="M21 12a8 8 0 1 1-3-6.2L21 4v6h-6" />,
  clone: <I d="M9 9h11v11H9zM4 4h11v3M4 4v11h3" />,
  design: <I d="M14 3l7 7-9 9H5v-7zM13 5l6 6" />,
  preset: <I d="M4 6h16M4 12h10M4 18h16M19 10v4" />,
  s2: <I d="M5 12h14M12 5l7 7-7 7" />,
  music: <I d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />,
  sfx: <I d="M3 12h2l3-7v14l3-7h10" />,
  separator: <I d="M3 12h7l2-4 2 8 2-4h6" />,
  rvc: <I d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  data: <I d="M4 7c0-2 4-3 8-3s8 1 8 3-4 3-8 3-8-1-8-3zM4 7v10c0 2 4 3 8 3s8-1 8-3V7M4 12c0 2 4 3 8 3s8-1 8-3" />,
  train: <I d="M4 12l4-4 4 4 4-4 4 4M4 18l4-4 4 4 4-4 4 4" />,
  fuse: <I d="M5 9a4 4 0 1 1 8 0 4 4 0 0 1 8 0M5 15a4 4 0 1 0 8 0 4 4 0 0 0 8 0" />,
  guide: <I d="M4 5a2 2 0 0 1 2-2h11l3 3v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2zM8 8h6M8 12h8M8 16h5" />,
  dot: <I d="M12 12.01" />,
};

function NavItem({ icon, label, k, chip, current, onClick }) {
  const active = current === k;
  return (
    <div className={`nav__item ${active ? "is-active" : ""}`} onClick={() => onClick && onClick(k)}>
      <span className="nav__icon"><svg className="ico" viewBox="0 0 24 24">{icon.props.children || icon}</svg></span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {chip && <span className={`nav__chip ${chip.kind === "new" ? "nav__chip--new" : ""}`}>{chip.text}</span>}
    </div>
  );
}

const NAV_GROUPS = [
  {
    label: "WORKSPACE",
    count: "03",
    items: [
      { k: "home", icon: Icons.home, label: "Home" },
      { k: "voices", icon: Icons.voices, label: "My Voices", chip: { text: "12" } },
      { k: "gallery", icon: Icons.gallery, label: "Generations", chip: { text: "284" } },
    ],
  },
  {
    label: "QWEN  ·  SPEECH",
    count: "04",
    items: [
      { k: "tts", icon: Icons.speech, label: "Text → Speech" },
      { k: "clone", icon: Icons.clone, label: "Voice Clone" },
      { k: "design", icon: Icons.design, label: "Voice Design", chip: { text: "BETA", kind: "new" } },
      { k: "preset", icon: Icons.preset, label: "Preset Generate" },
    ],
  },
  {
    label: "S2-PRO",
    count: "04",
    items: [
      { k: "s2tts", icon: Icons.s2, label: "Tagged TTS" },
      { k: "s2save", icon: Icons.mic, label: "Save Voice" },
      { k: "s2dialog", icon: Icons.s2, label: "Dialogue" },
      { k: "s2multi", icon: Icons.s2, label: "Multilingual" },
    ],
  },
  {
    label: "AUDIO LAB",
    count: "06",
    items: [
      { k: "sfx", icon: Icons.sfx, label: "Sound Effects" },
      { k: "stem", icon: Icons.separator, label: "Stem Separator" },
      { k: "rvctr", icon: Icons.rvc, label: "RVC Train" },
      { k: "rvcone", icon: Icons.rvc, label: "RVC Convert" },
      { k: "rvcbatch", icon: Icons.rvc, label: "RVC Batch" },
      { k: "rvcblend", icon: Icons.rvc, label: "RVC Blend" },
    ],
  },
  {
    label: "MUSIC  ·  ACE-STEP",
    count: "01",
    items: [
      { k: "music", icon: Icons.music, label: "Composer", chip: { text: "10 modes" } },
    ],
  },
  {
    label: "TRAINING",
    count: "03",
    items: [
      { k: "data", icon: Icons.data, label: "Datasets" },
      { k: "run", icon: Icons.train, label: "Run Fine-Tune" },
      { k: "fuse", icon: Icons.fuse, label: "VoiceBox Fuse" },
    ],
  },
  {
    label: "HELP",
    count: "01",
    items: [
      { k: "guide", icon: Icons.guide, label: "Guide" },
    ],
  },
];

function Sidebar({ current, onSelect }) {
  return (
    <nav className="nav">
      {NAV_GROUPS.map((g) => (
        <div className="nav__group" key={g.label}>
          <div className="nav__label"><span>{g.label}</span><small>{g.count}</small></div>
          {g.items.map((it) => (
            <NavItem key={it.k} {...it} current={current} onClick={onSelect} />
          ))}
        </div>
      ))}

      <div className="nav__usage">
        <h5>
          <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 2v6M12 22v-6M4 12H2M22 12h-2M5 5l1.5 1.5M19 19l-1.5-1.5M5 19l1.5-1.5M19 5l-1.5 1.5"/>
          </svg>
          Local GPU
        </h5>
        <p>RTX 5080 · 16 GB · FlashAttention 2 active</p>
        <div className="meter"></div>
        <div className="meta"><span>VRAM 6.1 / 16 GB</span><span>62°C</span></div>
      </div>
    </nav>
  );
}

window.Sidebar = Sidebar;
