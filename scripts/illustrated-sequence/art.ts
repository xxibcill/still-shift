const ink = "#211F1B",
  field = "#59664D",
  bone = "#E8DFC9",
  red = "#8B3F36";
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240">${body}</svg>\n`;

/** The endpoints stay registered; only the available space at the center changes. */
export function accessArtwork(restricted: boolean) {
  const upper = restricted ? 109 : 78;
  const lower = restricted ? 131 : 162;
  return svg(`
    <path d="M12 76 Q175 66 300 ${upper} L500 ${upper} Q625 66 788 76 L788 164 Q625 174 500 ${lower} L300 ${lower} Q175 174 12 164Z" fill="${field}" opacity=".19"/>
    <path d="M12 76 Q175 66 300 ${upper} L500 ${upper} Q625 66 788 76 M12 164 Q175 174 300 ${lower} L500 ${lower} Q625 174 788 164" fill="none" stroke="${field}" stroke-width="7" stroke-linecap="round"/>
    <path d="M25 120H775" fill="none" stroke="${field}" stroke-width="3" stroke-dasharray="12 15" opacity=".55"/>
    <path d="M765 110L783 120 765 130" fill="none" stroke="${field}" stroke-width="4"/>
    ${restricted ? `<path d="M322 90L478 90M322 150L478 150" stroke="${red}" stroke-width="8" stroke-linecap="round"/>` : ""}
  `);
}

export function pressureArtwork() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
    <path d="M10 12L229 18 210 113 122 148 27 110Z" fill="${red}" stroke="${ink}" stroke-width="5"/>
    <path d="M34 35L51 100M67 31L84 114M104 32L120 128M146 35L156 117M186 37L190 101" stroke="${bone}" stroke-width="3" opacity=".45"/>
  </svg>\n`;
}
