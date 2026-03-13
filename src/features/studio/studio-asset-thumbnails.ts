import type { LibraryItem, StudioModelDefinition } from "./types";

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickAudioPalette(seed: string) {
  const palettes = [
    ["#38bdf8", "#0f172a"],
    ["#60a5fa", "#1e1b4b"],
    ["#22d3ee", "#0f172a"],
    ["#93c5fd", "#172554"],
  ] as const;

  return palettes[hashString(seed) % palettes.length];
}

function createWaveBars(seed: string) {
  const hash = hashString(seed);

  return Array.from({ length: 12 }, (_, index) => {
    const normalized = ((hash >> ((index % 6) * 4)) & 0xf) / 15;
    const height = 28 + Math.round(normalized * 86);
    const x = 112 + index * 38;
    const y = 178 - height / 2;

    return `<rect x="${x}" y="${y}" width="18" height="${height}" rx="9" fill="rgba(255,255,255,0.88)" />`;
  }).join("");
}

export function createAudioThumbnailUrl(params: {
  title: string;
  subtitle: string;
  accentSeed: string;
}) {
  const [startColor, endColor] = pickAudioPalette(params.accentSeed);
  const waveBars = createWaveBars(params.accentSeed);
  const safeTitle = escapeSvgText(params.title);
  const safeSubtitle = escapeSvgText(params.subtitle);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" rx="48" />
      <rect x="52" y="52" width="1096" height="796" rx="40" fill="rgba(7,12,21,0.42)" stroke="rgba(255,255,255,0.16)" />
      <text x="96" y="138" fill="rgba(255,255,255,0.72)" font-size="30" font-family="Arial, Helvetica, sans-serif" letter-spacing="6">AUDIO</text>
      <text x="96" y="256" fill="#ffffff" font-size="70" font-weight="700" font-family="Arial, Helvetica, sans-serif">${safeTitle}</text>
      <foreignObject x="96" y="292" width="820" height="170">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, Helvetica, sans-serif; font-size: 32px; line-height: 1.45; color: rgba(255,255,255,0.76);">
          ${safeSubtitle}
        </div>
      </foreignObject>
      <g transform="translate(0, 120)">
        <rect x="86" y="98" width="580" height="160" rx="28" fill="rgba(255,255,255,0.07)" />
        ${waveBars}
      </g>
      <circle cx="1018" cy="610" r="96" fill="rgba(255,255,255,0.12)" />
      <path d="M982 610c22-10 36-32 36-58v-26h36v168h-36v-26c0-26-14-48-36-58Zm92-84h28c30 0 54 24 54 54s-24 54-54 54h-28v-108Z" fill="#ffffff" />
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getLibraryItemThumbnailUrl(
  item: Pick<LibraryItem, "thumbnailUrl" | "previewUrl">
) {
  return item.thumbnailUrl ?? item.previewUrl;
}

export function isTransparentImageItem(
  item: Pick<LibraryItem, "kind" | "hasAlpha">
) {
  return item.kind === "image" && item.hasAlpha;
}

export function createAudioThumbnailForModel(params: {
  model: StudioModelDefinition;
  title: string;
  subtitle: string;
}) {
  return createAudioThumbnailUrl({
    title: params.title,
    subtitle: params.subtitle,
    accentSeed: `${params.model.id}:${params.title}`,
  });
}
