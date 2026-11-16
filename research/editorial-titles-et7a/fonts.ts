// Pinned fonts for the ET7a pilot. Bytes, licences, source URLs and SHA-256s
// are recorded in assets/editorial-titles/fonts/sources.json; fontAsset reads
// the real bytes and the renderer re-verifies them.
import { fontAsset } from "@still-shift/motion/node";

const here = import.meta.url;
const dir = "../../assets/editorial-titles/fonts/";
type Options = Parameters<typeof fontAsset>[2];
const load = (id: string, file: string, options: Options = {}) =>
  fontAsset(id, dir + file, { relativeTo: here, ...options });

const wght = (min: number, def: number, max: number) => ({
  wght: { min, default: def, max },
});

/** Latin display faces. */
export const latin = {
  playfair: await load("playfair", "playfair-display-var.ttf", {
    variable: wght(400, 400, 900),
  }),
  playfairItalic: await load(
    "playfair-italic",
    "playfair-display-italic-var.ttf",
    { style: "italic", variable: wght(400, 400, 900) },
  ),
  bodoni: await load("bodoni", "bodoni-moda-var.ttf", {
    variable: {
      ...wght(400, 400, 900),
      opsz: { min: 6, default: 11, max: 96 },
    },
  }),
  bodoniItalic: await load("bodoni-italic", "bodoni-moda-italic-var.ttf", {
    style: "italic",
    variable: {
      ...wght(400, 400, 900),
      opsz: { min: 6, default: 11, max: 96 },
    },
  }),
  dmSerifItalic: await load("dm-serif-italic", "dm-serif-display-italic.ttf", {
    style: "italic",
  }),
  abril: await load("abril", "abril-fatface.ttf"),
  pinyon: await load("pinyon", "pinyon-script.ttf"),
  greatVibes: await load("great-vibes", "great-vibes.ttf"),
  anton: await load("anton", "anton.ttf"),
  oswald: await load("oswald", "oswald-var.ttf", {
    variable: wght(200, 400, 700),
  }),
  bebas: await load("bebas", "bebas-neue.ttf"),
  archivo: await load("archivo", "archivo-var.ttf", {
    weight: "600",
    variable: {
      ...wght(100, 600, 900),
      wdth: { min: 62, default: 100, max: 125 },
    },
  }),
  caveatBrush: await load("caveat-brush", "caveat-brush.ttf"),
  marker: await load("marker", "permanent-marker.ttf"),
};

/** Thai faces (each also covers basic Latin). */
export const thai = {
  kanitBlack: await load("kanit-black", "kanit-black.ttf", { weight: "900" }),
  kanitItalic: await load("kanit-italic", "kanit-extrabold-italic.ttf", {
    weight: "800",
    style: "italic",
  }),
  mitr: await load("mitr", "mitr-bold.ttf", { weight: "700" }),
  plexThai: await load("plex-thai", "ibm-plex-sans-thai-bold.ttf", {
    weight: "700",
  }),
  chonburi: await load("chonburi", "chonburi.ttf"),
  sriracha: await load("sriracha", "sriracha.ttf"),
  charm: await load("charm", "charm-bold.ttf", { weight: "700" }),
  itim: await load("itim", "itim.ttf"),
  pattaya: await load("pattaya", "pattaya.ttf"),
  notoSerifThai: await load("noto-serif-thai", "noto-serif-thai-var.ttf", {
    variable: {
      ...wght(100, 400, 900),
      wdth: { min: 62.5, default: 100, max: 100 },
    },
  }),
};

/**
 * Pinned but rejected by `font-metadata` before any render: Prompt Black's
 * name table carries the full licence text (name ID 13, 8,716 bytes), over
 * the 2,048-byte name-string budget. Kept to reproduce the ET7a gap.
 */
export const rejected = {
  promptBlack: await load("prompt-black", "prompt-black.ttf", {
    weight: "900",
  }),
};
