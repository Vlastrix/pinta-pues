/** A crowned pencil and laurels, drawn locally to match Pinta Pues. */
export function WinnerEmblem() {
  return <div className="winner-emblem" aria-hidden="true">
    <svg viewBox="0 0 144 144" fill="none">
      <circle cx="72" cy="72" r="53" fill="var(--yellow)" opacity=".16" />
      <circle className="winner-orbit" cx="72" cy="72" r="61" stroke="var(--purple)" strokeWidth="2" strokeDasharray="2 18" strokeLinecap="round" opacity=".45" />
      <g stroke="#d7a334" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M56 119C29 110 22 84 30 62M88 119C115 110 122 84 114 62" />
        <path d="M30 82Q16 81 18 67Q31 67 30 82ZM31 98Q17 99 17 86Q30 84 31 98ZM40 111Q26 116 23 103Q36 98 40 111ZM30 82Q44 78 40 66Q28 69 30 82ZM35 100Q49 94 45 83Q32 87 35 100ZM114 82Q128 81 126 67Q113 67 114 82ZM113 98Q127 99 127 86Q114 84 113 98ZM104 111Q118 116 121 103Q108 98 104 111ZM114 82Q100 78 104 66Q116 69 114 82ZM109 100Q95 94 99 83Q112 87 109 100Z" fill="#f3ca62" strokeWidth="1.5" />
      </g>
      <g className="winner-pencil-float">
        <g transform="rotate(18 72 76)" stroke="var(--deep)" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M61 52H83V98L72 115L61 98Z" fill="var(--purple)" />
          <path d="M61 52V43Q61 38 66 38H78Q83 38 83 43V52Z" fill="#e6a8c3" />
          <path d="M61 52H83V60H61Z" fill="#fff3d6" />
          <path d="M61 98L72 115L83 98" fill="#f7d7a4" />
          <path d="M68 109L72 115L76 109" fill="var(--deep)" />
          <path d="M68 65V94" stroke="#fff" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
        </g>
        <path d="M48 26L59 33L70 17L81 33L94 26L88 46H54Z" fill="#f4c64d" stroke="#b58523" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M56 40H86" stroke="#fff2be" strokeWidth="3" strokeLinecap="round" />
        <circle cx="71" cy="33" r="3" fill="var(--purple)" />
      </g>
      <g className="winner-twinkle" stroke="#d7a334" strokeWidth="2.5" strokeLinecap="round">
        <path d="M111 28V40M105 34H117M31 37V45M27 41H35" />
      </g>
      <g className="winner-twinkle winner-twinkle-late" fill="var(--purple)">
        <path d="M123 99L126 104L131 107L126 110L123 115L120 110L115 107L120 104Z" />
        <circle cx="21" cy="52" r="2.5" /><circle cx="94" cy="124" r="2" />
      </g>
    </svg>
  </div>;
}
