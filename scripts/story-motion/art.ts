import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brushStroke } from "../../packages/renderer-core/src/brush-path.ts";

export const palette = {
  bone: "#E8DFC9",
  ink: "#211F1B",
  field: "#59664D",
  grain: "#B47A2A",
  red: "#8B3F36",
  crisis: "#4B5F70",
} as const;
const { bone, ink, field, grain } = palette;
const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><pattern id="hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><path d="M0 0V18" stroke="${ink}" stroke-width="2" opacity=".2"/></pattern><pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.3" fill="${ink}" opacity=".2"/></pattern></defs><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`;

const house = svg(
  600,
  440,
  `
  <path d="M25 395Q160 366 299 389T582 394L552 423 92 425Z" fill="${field}" opacity=".13"/>
  <path d="M73 222L303 151 525 212 523 384 312 408 75 382Z" fill="${bone}" stroke="${ink}" stroke-width="7"/>
  <path d="M312 229L523 212 523 384 312 408Z" fill="${field}" opacity=".3"/>
  <path d="M312 229L523 212 523 384 312 408Z" fill="url(#hatch)"/>
  <path d="M47 227Q85 151 169 67L406 49Q487 126 550 225L313 265 169 131Z" fill="${grain}" stroke="${ink}" stroke-width="7"/>
  <path d="M170 67L313 244 548 223 406 49Z" fill="url(#hatch)"/>
  <path d="M48 227L169 111 314 264 550 225M170 68Q224 137 282 211M195 79L339 236M258 67L389 227M323 60L444 217M386 57L497 205" fill="none" stroke="${ink}" stroke-width="3.5"/>
  <path d="M58 225L169 125 298 258M312 262V401M83 272L298 291M81 348L300 364M111 247L114 382M270 282L268 398" fill="none" stroke="${ink}" stroke-width="5"/>
  <path d="M160 393L160 290Q190 277 219 299L221 399Z" fill="${ink}"/>
  <path d="M163 293L177 294 177 391 164 391Z" fill="${grain}" opacity=".6"/>
  <path d="M373 289L425 282 426 333 373 341Z" fill="${ink}"/>
  <path d="M400 286V336M376 309L424 305" stroke="${bone}" stroke-width="3"/>
  <path d="M328 362L501 343M331 385L492 367" stroke="${ink}" stroke-width="3" opacity=".4"/>
  <path d="M60 386Q189 399 309 412L533 387M128 415L220 420M401 410L455 406" fill="none" stroke="${ink}" stroke-width="5"/>
`,
);

const store = svg(
  600,
  520,
  `
  <path d="M30 455Q228 413 556 453L527 488 114 494Z" fill="${field}" opacity=".15"/>
  <path d="M69 188Q298 281 538 185L514 444Q300 522 92 439Z" fill="${grain}" stroke="${ink}" stroke-width="7"/>
  <path d="M334 244L537 187 514 444Q427 479 333 483Z" fill="${ink}" opacity=".15"/>
  <path d="M334 244L537 187 514 444Q427 479 333 483Z" fill="url(#hatch)"/>
  <ellipse cx="303" cy="188" rx="234" ry="73" fill="${bone}" stroke="${ink}" stroke-width="7"/>
  <path d="M86 183Q155 150 201 103Q250 53 310 70Q367 61 416 122L518 183Q305 279 86 183Z" fill="${grain}" stroke="${ink}" stroke-width="5"/>
  <path d="M86 183Q155 150 201 103Q250 53 310 70Q367 61 416 122L518 183Q305 279 86 183Z" fill="url(#dots)"/>
  <g stroke="${ink}" stroke-width="3" fill="none"><path d="M185 149l14-5m31-26 14 5m36-21 13 6m41 11 16-2m-98 40 16 6m60-11 12 6m-130 37 15-4m182-22 13 5m38 28 14-3m-120 15 16 4m-60-13 13 6m-78 34 14-2m152-9 12 6"/></g>
  <path d="M79 207Q294 294 530 207M87 324Q302 403 521 325M94 417Q300 493 514 421" fill="none" stroke="${ink}" stroke-width="13"/>
  <path d="M81 205Q301 290 530 205M88 320Q304 395 522 321" fill="none" stroke="${bone}" stroke-width="3"/>
  <g fill="none" stroke="${ink}" stroke-width="3"><path d="M129 232L146 455M196 253L204 473M264 266L264 482M336 265L330 482M406 253L397 472M474 233L463 458"/><path d="M161 286l3 30m65 71 1 41m67-126-1 44m57 48-2 31m102-131-4 40"/></g>
  <path d="M58 173L82 165 105 445 84 454ZM524 164L546 174 523 453 503 447Z" fill="${bone}" stroke="${ink}" stroke-width="5"/>
`,
);

const land = svg(
  640,
  260,
  `
  <path d="M18 117Q142 53 294 91Q464 12 621 108L586 225 47 237Z" fill="${field}" opacity=".24"/>
  <path d="M18 117Q142 53 294 91Q464 12 621 108L586 225 47 237Z" fill="url(#dots)"/>
  <path d="M18 117Q142 53 294 91Q464 12 621 108M51 157Q232 85 569 139M73 201Q272 126 582 175M150 227Q347 168 552 207" fill="none" stroke="${field}" stroke-width="6"/>
  <path d="M91 110L57 228M231 89L190 230M403 76L382 223" fill="none" stroke="${bone}" stroke-width="7"/>
`,
);

const accessMark = brushStroke(
  {
    id: "access-glyph",
    points: [
      [14, 119],
      [508, 121],
    ],
    lineWidth: 27,
  },
  0,
  1,
);
const polygonPath = (points: [number, number][]) =>
  `M${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}Z`;
const access = svg(
  520,
  240,
  `
  <path d="${polygonPath(accessMark.wash)}" fill="${field}" opacity=".18"/>
  <path d="${[accessMark.body, ...accessMark.cuts].map(polygonPath).join("")}" fill="${field}" fill-rule="evenodd"/>
  <path d="M38 32Q182 28 250 83L291 83Q368 36 483 32M38 209Q182 213 250 157L291 157Q368 205 483 210" fill="none" stroke="${ink}" stroke-width="7"/>
  <path d="M206 46l-8-22m37 39-6-21m92 1 9-21m26 1 9-20M205 194l-8 21m38-39-6 21m95-1 9 21m22-3 10 18" stroke="${ink}" stroke-width="3" opacity=".5"/>
`,
);

const category = (variant: boolean) =>
  svg(
    600,
    420,
    `
  <path d="M74 340Q290 293 535 339L500 381 137 388Z" fill="${field}" opacity=".14"/>
  <path d="M101 170Q299 246 500 171L474 326Q299 393 126 327Z" fill="${variant ? field : grain}" stroke="${ink}" stroke-width="7"/>
  <ellipse cx="300" cy="171" rx="198" ry="64" fill="${bone}" stroke="${ink}" stroke-width="6"/>
  <path d="M121 163Q216 98 300 83Q390 107 480 163Q300 246 121 163Z" fill="${variant ? field : grain}" opacity=".85"/>
  <path d="M121 163Q216 98 300 83Q390 107 480 163Q300 246 121 163Z" fill="url(#${variant ? "hatch" : "dots"})"/>
  <path d="M120 290Q302 356 482 290M127 325Q302 387 474 327" fill="none" stroke="${ink}" stroke-width="5"/>
  <path d="M169 231L179 344M249 245L253 359M340 245L336 359M427 230L416 345" stroke="${ink}" stroke-width="3" opacity=".6"/>
`,
  );

const ground = svg(
  1920,
  300,
  `
  <path d="M0 109Q280 63 587 108T1120 109Q1533 24 1920 83V300H0Z" fill="${field}" opacity=".11"/>
  <path d="M0 111Q280 65 587 110T1120 111Q1533 26 1920 85" fill="none" stroke="${field}" stroke-width="3" opacity=".45"/>
  <path d="M125 181l171-5m831 21 97-6m-740 44 68-4m950-68 176-2m-341 89 207-8" fill="none" stroke="${field}" stroke-width="3" opacity=".2"/>
`,
);
const paper = svg(
  1920,
  1080,
  `<defs><pattern id="paper" width="73" height="61" patternUnits="userSpaceOnUse"><path d="M8 12h2m30 29h3m-25 8h1m40-32h2m-4 35h1" stroke="${ink}" stroke-width="1" opacity=".1"/><circle cx="27" cy="21" r=".7" fill="${ink}" opacity=".12"/></pattern></defs><path d="M0 0H1920V1080H0Z" fill="url(#paper)"/>`,
);
const paperCover = paper.replace(
  '<path d="M0 0H1920V1080H0Z" fill="url(#paper)"/>',
  `<path d="M0 0H1920V1080H0Z" fill="${bone}"/><path d="M0 0H1920V1080H0Z" fill="url(#paper)"/>`,
);

const pressure = svg(
  350,
  110,
  `
  <path d="M8 8H342V27Q246 24 218 99H132Q110 24 8 27Z" fill="${palette.red}" opacity=".14"/>
  <path d="M8 27Q110 24 132 99H218Q246 24 342 27" fill="none" stroke="${palette.red}" stroke-width="7"/>
  <path d="M88 30l-8-16m29 40-7-19m138 19 8-19m11-5 8-16" stroke="${ink}" stroke-width="3" opacity=".5"/>
`,
);
// Preserve the original flattened sources for v1 hashes and decoded-frame parity.
function separateBase(source: string) {
  const match = source.match(/<path[^>]+opacity="\.(?:13|15|24)"\/>/);
  if (!match) throw new Error("Missing artwork base layer");
  const open = source.indexOf("<g stroke-linecap");
  const bodyStart = source.indexOf(">", open) + 1;
  return {
    body: source.replace(`  ${match[0]}\n`, ""),
    shadow: source.slice(0, bodyStart) + match[0] + "</g></svg>\n",
  };
}
const separatedHouse = separateBase(house),
  separatedStore = separateBase(store),
  separatedLand = separateBase(land);
export const motionArtwork = {
  "paper-cover": paperCover,
  "house-body": separatedHouse.body,
  "house-shadow": separatedHouse.shadow,
  "store-body": separatedStore.body,
  "store-shadow": separatedStore.shadow,
  "land-body": separatedLand.body,
  "land-shadow": separatedLand.shadow,
};

export const artwork = {
  house,
  store,
  land,
  access,
  pressure,
  "access-crisis": access.replaceAll(ink, bone).replaceAll(field, bone),
  "category-a": category(false),
  "category-b": category(true),
  ground,
  paper,
};
export async function writeArtwork() {
  const directory = resolve("assets/story-motion/art");
  await mkdir(directory, { recursive: true });
  for (const [name, value] of Object.entries({ ...artwork, ...motionArtwork }))
    await writeFile(resolve(directory, `${name}.svg`), value);
}
