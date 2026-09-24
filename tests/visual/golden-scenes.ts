import type {
  PreviewIntensity,
  PreviewPreset,
} from "../../packages/renderer-core/src/scene.ts";

export type GoldenScene = {
  id: string;
  category: string;
  preset: PreviewPreset;
  intensity: PreviewIntensity;
  source: string;
  depth: string;
};

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="144" viewBox="0 0 256 144">${body}</svg>`;

export const GOLDEN_SCENES: GoldenScene[] = [
  {
    id: "portrait",
    category: "portrait",
    preset: "slow_push",
    intensity: "standard",
    source: svg(`<rect width="256" height="144" fill="#374a5c"/>
      <rect y="108" width="256" height="36" fill="#162736"/>
      <ellipse cx="132" cy="138" rx="58" ry="51" fill="#a73e53"/>
      <rect x="119" y="83" width="26" height="32" fill="#d78d6b"/>
      <ellipse cx="132" cy="61" rx="31" ry="40" fill="#e7af83"/>
      <path d="M101 61 Q97 14 132 19 Q166 17 163 60 L156 47 Q130 32 107 48Z" fill="#28232b"/>
      <circle cx="120" cy="61" r="2" fill="#25242b"/><circle cx="144" cy="61" r="2" fill="#25242b"/>`),
    depth: svg(`<rect width="256" height="144" fill="rgb(45,45,45)"/>
      <rect y="108" width="256" height="36" fill="rgb(54,54,54)"/>
      <ellipse cx="132" cy="138" rx="58" ry="51" fill="rgb(176,176,176)"/>
      <rect x="119" y="83" width="26" height="32" fill="rgb(205,205,205)"/>
      <ellipse cx="132" cy="61" rx="31" ry="40" fill="rgb(222,222,222)"/>
      <path d="M101 61 Q97 14 132 19 Q166 17 163 60 L156 47 Q130 32 107 48Z" fill="rgb(218,218,218)"/>`),
  },
  {
    id: "environment",
    category: "environment",
    preset: "horizontal_drift",
    intensity: "standard",
    source: svg(`<rect width="256" height="144" fill="#91c8d1"/>
      <circle cx="205" cy="29" r="17" fill="#f8dfa1"/>
      <path d="M0 103 L57 39 L111 103Z" fill="#668ba3"/>
      <path d="M64 108 L151 29 L241 108Z" fill="#466e83"/>
      <path d="M0 112 Q112 91 256 112 L256 144 L0 144Z" fill="#77975f"/>
      <path d="M0 126 Q130 108 256 127 L256 144 L0 144Z" fill="#3d7049"/>
      <rect x="36" y="82" width="5" height="54" fill="#374c3d"/>
      <path d="M23 101 L38 59 L54 101Z" fill="#2b6044"/>`),
    depth: svg(`<rect width="256" height="144" fill="rgb(26,26,26)"/>
      <circle cx="205" cy="29" r="17" fill="rgb(27,27,27)"/>
      <path d="M0 103 L57 39 L111 103Z" fill="rgb(75,75,75)"/>
      <path d="M64 108 L151 29 L241 108Z" fill="rgb(98,98,98)"/>
      <path d="M0 112 Q112 91 256 112 L256 144 L0 144Z" fill="rgb(145,145,145)"/>
      <path d="M0 126 Q130 108 256 127 L256 144 L0 144Z" fill="rgb(180,180,180)"/>
      <rect x="36" y="82" width="5" height="54" fill="rgb(221,221,221)"/>
      <path d="M23 101 L38 59 L54 101Z" fill="rgb(222,222,222)"/>`),
  },
  {
    id: "architecture",
    category: "architecture",
    preset: "cinematic_float",
    intensity: "standard",
    source: svg(`<rect width="256" height="144" fill="#bed8e5"/>
      <rect x="20" y="23" width="91" height="121" fill="#b9a68d"/>
      <rect x="31" y="35" width="17" height="22" fill="#305369"/><rect x="61" y="35" width="17" height="22" fill="#305369"/>
      <rect x="31" y="71" width="17" height="22" fill="#305369"/><rect x="61" y="71" width="17" height="22" fill="#305369"/>
      <rect x="128" y="8" width="92" height="136" fill="#d1c2a9"/>
      <rect x="139" y="22" width="23" height="25" fill="#456979"/><rect x="179" y="22" width="23" height="25" fill="#456979"/>
      <rect x="139" y="61" width="23" height="25" fill="#456979"/><rect x="179" y="61" width="23" height="25" fill="#456979"/>
      <path d="M0 144 L117 101 L256 144Z" fill="#7f8790"/>`),
    depth: svg(`<rect width="256" height="144" fill="rgb(32,32,32)"/>
      <rect x="20" y="23" width="91" height="121" fill="rgb(95,95,95)"/>
      <rect x="31" y="35" width="17" height="22" fill="rgb(82,82,82)"/><rect x="61" y="35" width="17" height="22" fill="rgb(82,82,82)"/>
      <rect x="31" y="71" width="17" height="22" fill="rgb(82,82,82)"/><rect x="61" y="71" width="17" height="22" fill="rgb(82,82,82)"/>
      <rect x="128" y="8" width="92" height="136" fill="rgb(153,153,153)"/>
      <rect x="139" y="22" width="23" height="25" fill="rgb(136,136,136)"/><rect x="179" y="22" width="23" height="25" fill="rgb(136,136,136)"/>
      <rect x="139" y="61" width="23" height="25" fill="rgb(136,136,136)"/><rect x="179" y="61" width="23" height="25" fill="rgb(136,136,136)"/>
      <path d="M0 144 L117 101 L256 144Z" fill="rgb(203,203,203)"/>`),
  },
  {
    id: "illustration",
    category: "illustration",
    preset: "slow_push",
    intensity: "strong",
    source: svg(`<rect width="256" height="144" fill="#f3e9cc"/>
      <circle cx="198" cy="39" r="27" fill="#ebad76"/>
      <path d="M0 144 L0 109 Q54 69 113 120 L113 144Z" fill="#8db0a3"/>
      <path d="M84 144 L128 47 L167 144Z" fill="#d47465"/>
      <path d="M149 144 L192 69 L241 144Z" fill="#7b879f"/>
      <rect x="31" y="52" width="27" height="56" rx="3" fill="#608b78"/>
      <rect x="36" y="57" width="17" height="42" fill="#f5e4bf"/>`),
    depth: svg(`<rect width="256" height="144" fill="rgb(40,40,40)"/>
      <circle cx="198" cy="39" r="27" fill="rgb(67,67,67)"/>
      <path d="M0 144 L0 109 Q54 69 113 120 L113 144Z" fill="rgb(108,108,108)"/>
      <path d="M84 144 L128 47 L167 144Z" fill="rgb(175,175,175)"/>
      <path d="M149 144 L192 69 L241 144Z" fill="rgb(146,146,146)"/>
      <rect x="31" y="52" width="27" height="56" rx="3" fill="rgb(218,218,218)"/>`),
  },
  {
    id: "difficult-edges",
    category: "difficult edges",
    preset: "horizontal_drift",
    intensity: "strong",
    source: svg(`<rect width="256" height="144" fill="#d5e2e6"/>
      <rect y="102" width="256" height="42" fill="#627884"/>
      <circle cx="126" cy="72" r="32" fill="#d48765"/>
      <path d="M123 102 L67 18 M126 102 L95 10 M128 102 L128 5 M130 102 L162 10 M133 102 L190 18" stroke="#263f4b" stroke-width="3"/>
      <path d="M0 20 L256 90 M0 40 L256 110" stroke="#96aeb7" stroke-width="2"/>`),
    depth: svg(`<rect width="256" height="144" fill="rgb(51,51,51)"/>
      <rect y="102" width="256" height="42" fill="rgb(105,105,105)"/>
      <circle cx="126" cy="72" r="32" fill="rgb(180,180,180)"/>
      <path d="M123 102 L67 18 M126 102 L95 10 M128 102 L128 5 M130 102 L162 10 M133 102 L190 18" stroke="rgb(230,230,230)" stroke-width="3"/>
      <path d="M0 20 L256 90 M0 40 L256 110" stroke="rgb(82,82,82)" stroke-width="2"/>`),
  },
];
