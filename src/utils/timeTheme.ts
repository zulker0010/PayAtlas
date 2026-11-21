import { DiurnalPhase } from '../types/payments';

export interface DiurnalThemeState {
  hour: number; // 0..24
  phase: DiurnalPhase;
  phaseLabel: string;
  formattedTime: string;
  isLightUI: boolean;
  /** Interpolation factors 0..1 */
  dayWeight: number;
  nightWeight: number;
  dawnWeight: number;
  duskWeight: number;
  /** Space & Atmosphere colors */
  skyBgHex: number;
  borderHex: number;
  highlightBorderHex: number;
  atmosphereHex: number;
  terminatorHex: number;
  gridHex: number;
  sunColorHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  ambientFillLevel: number;
  /** 2D Flat Map surrounding mat & frame colors */
  mapMatBgHex: number;
  mapFrameHex: number;
  /** Sun direction azimuth angle in radians */
  sunLongitudeRad: number;
  sunDeclinationRad: number;
}

function smoothWindow(hour: number, start: number, peak: number, end: number): number {
  if (hour <= start || hour >= end) return 0;
  if (hour <= peak) {
    const t = (hour - start) / (peak - start);
    return t * t * (3 - 2 * t);
  }
  const t = (end - hour) / (end - peak);
  return t * t * (3 - 2 * t);
}

function blendFourColors(
  nightHex: number,
  dawnHex: number,
  dayHex: number,
  duskHex: number,
  wNight: number,
  wDawn: number,
  wDay: number,
  wDusk: number
): number {
  const r =
    ((nightHex >> 16) & 0xff) * wNight +
    ((dawnHex >> 16) & 0xff) * wDawn +
    ((dayHex >> 16) & 0xff) * wDay +
    ((duskHex >> 16) & 0xff) * wDusk;
  const g =
    ((nightHex >> 8) & 0xff) * wNight +
    ((dawnHex >> 8) & 0xff) * wDawn +
    ((dayHex >> 8) & 0xff) * wDay +
    ((duskHex >> 8) & 0xff) * wDusk;
  const b =
    (nightHex & 0xff) * wNight +
    (dawnHex & 0xff) * wDawn +
    (dayHex & 0xff) * wDay +
    (duskHex & 0xff) * wDusk;

  return (
    ((Math.min(255, Math.max(0, Math.round(r))) & 0xff) << 16) |
    ((Math.min(255, Math.max(0, Math.round(g))) & 0xff) << 8) |
    (Math.min(255, Math.max(0, Math.round(b))) & 0xff)
  );
}

export function formatHourToClock(hourFloat: number): string {
  const normalized = ((hourFloat % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.floor((normalized - h) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getBrowserDecimalHour(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

export function computeDiurnalTheme(rawHour: number): DiurnalThemeState {
  const hour = ((rawHour % 24) + 24) % 24;

  const dawnWeight = smoothWindow(hour, 4.5, 6.75, 9.5);
  const dayWeight = smoothWindow(hour, 7.5, 13.0, 18.25);
  const duskWeight = smoothWindow(hour, 16.25, 18.5, 21.0);
  const rawSum = dawnWeight + dayWeight + duskWeight;
  const nightWeight = Math.max(0, 1 - rawSum);
  const total = nightWeight + dawnWeight + dayWeight + duskWeight || 1;

  const wN = nightWeight / total;
  const wDa = dawnWeight / total;
  const wDy = dayWeight / total;
  const wDu = duskWeight / total;

  let phase: DiurnalPhase = 'night';
  let phaseLabel = 'Night Cycle';
  if (hour >= 5 && hour < 9) {
    phase = 'dawn';
    phaseLabel = 'Dawn Horizon';
  } else if (hour >= 9 && hour < 17) {
    phase = 'daylight';
    phaseLabel = 'Daylight';
  } else if (hour >= 17 && hour < 20) {
    phase = 'dusk';
    phaseLabel = 'Dusk Twilight';
  } else {
    phase = 'night';
    phaseLabel = 'Night Cycle';
  }

  // Light UI drawer/dock during Daylight so UI reflects browser time-of-day while space stays deep cosmic black!
  const isLightUI = wDy > 0.55;

  // Deep orbital space backdrop always stays cosmic dark so Earth reads like an orbital photograph
  const skyBgHex = blendFourColors(0x02040a, 0x050814, 0x040812, 0x060714, wN, wDa, wDy, wDu);

  const borderHex = blendFourColors(0x52759c, 0x9fb4cc, 0xdbeafe, 0xb89ca8, wN, wDa, wDy, wDu);
  const highlightBorderHex = blendFourColors(
    0x38bdf8,
    0xfbbf24,
    0x38bdf8,
    0xf97316,
    wN,
    wDa,
    wDy,
    wDu
  );

  // Realistic Rayleigh scatter hue: crisp cerulean in day, golden-rose at dawn, fiery amber-coral at dusk, deep sapphire at night
  const atmosphereHex = blendFourColors(
    0x2563eb,
    0x60a5fa,
    0x4da6ff,
    0x5b8def,
    wN,
    wDa,
    wDy,
    wDu
  );
  const terminatorHex = blendFourColors(
    0x1e3a8a,
    0xfb923c,
    0xf59e0b,
    0xea580c,
    wN,
    wDa,
    wDy,
    wDu
  );

  const gridHex = blendFourColors(0x1e293b, 0x334155, 0x3b5270, 0x312e47, wN, wDa, wDy, wDu);

  // Sunlight color & intensity
  const sunColorHex = blendFourColors(0xa5c8ff, 0xffcaa0, 0xfff8ed, 0xff9e6d, wN, wDa, wDy, wDu);
  const sunIntensity = 1.65 * wN + 2.85 * wDa + 3.65 * wDy + 2.75 * wDu;

  const hemiSkyHex = blendFourColors(0x283a5c, 0x93c5fd, 0xdbeafe, 0x818cf8, wN, wDa, wDy, wDu);
  const hemiGroundHex = blendFourColors(0x03050a, 0x090f1c, 0x0f172a, 0x0a0914, wN, wDa, wDy, wDu);
  const hemiIntensity = 0.24 * wN + 0.42 * wDa + 0.58 * wDy + 0.36 * wDu;

  // Ambient night-side visibility floor (slightly higher during daylight so dark side isn't pitch black, crisp contrast at night)
  const ambientFillLevel = 0.08 * wN + 0.14 * wDa + 0.24 * wDy + 0.12 * wDu;

  // 2D Flat Map drafting mat & frame border: crisp light slate in daylight, deep nocturnal slate at night
  const mapMatBgHex = blendFourColors(0x040812, 0x10182b, 0xd9e3ef, 0x121528, wN, wDa, wDy, wDu);
  const mapFrameHex = blendFourColors(0x1e293b, 0x475569, 0x94a3b8, 0x3f3756, wN, wDa, wDy, wDu);

  // Sun rotates around Earth continuously across 24 hours; offset so midday illuminates Atlantic/Europe/Americas nicely
  const sunLongitudeRad = ((hour - 13.5) / 24) * Math.PI * 2;
  const sunDeclinationRad = (18 * Math.PI) / 180;

  return {
    hour,
    phase,
    phaseLabel,
    formattedTime: formatHourToClock(hour),
    isLightUI,
    dayWeight: wDy,
    nightWeight: wN,
    dawnWeight: wDa,
    duskWeight: wDu,
    skyBgHex,
    borderHex,
    highlightBorderHex,
    atmosphereHex,
    terminatorHex,
    gridHex,
    sunColorHex,
    sunIntensity,
    hemiSkyHex,
    hemiGroundHex,
    hemiIntensity,
    ambientFillLevel,
    mapMatBgHex,
    mapFrameHex,
    sunLongitudeRad,
    sunDeclinationRad,
  };
}
