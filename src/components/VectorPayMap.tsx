import { MutableRefObject, useEffect, useMemo, useRef } from 'react';
import {
  findGeoCountryAtLatLon,
  GeoCountryFeature,
  getPrimaryPolygonBbox,
} from '../data/geoIndex';
import {
  computeSnapshotForHour,
  CONTINENTS,
  getAllFlagshipCountries,
  getGeoCountries,
  getMetricBreakdown,
  getOrCreateCountryForGeo,
  GLOBAL_PAYMENT_ARCS,
} from '../data/paymentsDataset';
import {
  ALL_PAYMENT_CHANNELS,
  CHANNEL_META,
  CityNode,
  ComputedPaymentSnapshot,
  ContinentNode,
  CountryNode,
  HierarchyLevel,
  HoverInfo,
  LocalAreaNode,
  MapThemeId,
  PaymentMetric,
} from '../types/payments';
import { DiurnalThemeState } from '../utils/timeTheme';

export interface VectorPayMapControls {
  zoomIn: () => void;
  zoomOut: () => void;
}

interface VectorPayMapProps {
  level: HierarchyLevel;
  continentId: string | null;
  countryId: string | null;
  cityId: string | null;
  localAreaId: string | null;
  activeMetric: PaymentMetric;
  mapTheme: MapThemeId;
  hourFloat: number;
  theme: DiurnalThemeState;
  syntheticCountries: Record<string, CountryNode>;
  controlsRef: MutableRefObject<VectorPayMapControls | null>;
  onSelectContinent: (continentId: string) => void;
  onSelectCountry: (country: CountryNode) => void;
  onSelectCity: (city: CityNode) => void;
  onSelectLocalArea: (area: LocalAreaNode) => void;
  onHoverChange: (hover: HoverInfo | null) => void;
}

const MAX_MERCATOR_LAT = 82;

function clampLat(lat: number): number {
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
}

function lonToU(lon: number): number {
  return (lon + 180) / 360;
}

function latToV(lat: number): number {
  const rad = (clampLat(lat) * Math.PI) / 180;
  const sin = Math.sin(rad);
  const clampedSin = Math.max(-0.9995, Math.min(0.9995, sin));
  return 0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI);
}

function uToLon(u: number): number {
  const wrapped = ((u % 1) + 1) % 1;
  return wrapped * 360 - 180;
}

function vToLat(v: number): number {
  const clampedV = Math.max(0.01, Math.min(0.99, v));
  const n = Math.PI * (1 - 2 * clampedV);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

function normalizeU(u: number): number {
  return ((u % 1) + 1) % 1;
}

function shortestDeltaU(fromU: number, toU: number): number {
  let d = normalizeU(toU) - normalizeU(fromU);
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

interface ProjectedRing {
  points: Array<[number, number]>; // [u, v]
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

interface ProjectedPolygon {
  rings: ProjectedRing[];
}

interface ProjectedCountry {
  isoNumeric: string;
  name: string;
  polygons: ProjectedPolygon[];
  minV: number;
  maxV: number;
}

let cachedProjectedCountries: ProjectedCountry[] | null = null;

function getProjectedCountries(): ProjectedCountry[] {
  if (cachedProjectedCountries) return cachedProjectedCountries;
  const raw = getGeoCountries();
  const result: ProjectedCountry[] = [];

  for (const country of raw) {
    const polygons: ProjectedPolygon[] = [];
    let cMinV = 1;
    let cMaxV = 0;

    for (const poly of country.polygons) {
      const rings: ProjectedRing[] = [];
      for (const ring of poly.rings) {
        if (ring.coords.length < 3) continue;
        const points: Array<[number, number]> = [];
        let prevLon = ring.coords[0][0];
        let minU = Infinity;
        let maxU = -Infinity;
        let minV = Infinity;
        let maxV = -Infinity;

        for (let i = 0; i < ring.coords.length; i++) {
          let lon = ring.coords[i][0];
          const lat = ring.coords[i][1];
          // Unwrap consecutive vertices across the antimeridian so rings stay contiguous
          while (lon - prevLon > 180) lon -= 360;
          while (lon - prevLon < -180) lon += 360;
          prevLon = lon;

          const u = (lon + 180) / 360;
          const v = latToV(lat);
          points.push([u, v]);
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }

        if (minV < cMinV) cMinV = minV;
        if (maxV > cMaxV) cMaxV = maxV;
        rings.push({ points, minU, maxU, minV, maxV });
      }
      if (rings.length > 0) polygons.push({ rings });
    }

    if (polygons.length > 0) {
      result.push({
        isoNumeric: country.isoNumeric,
        name: country.name,
        polygons,
        minV: cMinV,
        maxV: cMaxV,
      });
    }
  }

  cachedProjectedCountries = result;
  return result;
}

interface MapPalette {
  oceanBg: string;
  oceanSubtleTint: string;
  landFill: string;
  landHoverFill: string;
  landSelectedFill: string;
  borderColor: string;
  coastlineColor: string;
  selectedBorderColor: string;
  graticuleColor: string;
  graticuleLabelColor: string;
  labelText: string;
  labelSubText: string;
  labelHalo: string;
  haloRingBg: string;
  beaconCenterFill: string;
  terminatorNightAlpha: number;
  isLightMap: boolean;
}

function getThemePalette(themeId: MapThemeId): MapPalette {
  if (themeId === 'blueprint') {
    return {
      oceanBg: '#061936',
      oceanSubtleTint: '#082045',
      landFill: '#103260',
      landHoverFill: '#17437e',
      landSelectedFill: '#1b5299',
      borderColor: '#1e5c9e',
      coastlineColor: '#3182ce',
      selectedBorderColor: '#22d3ee',
      graticuleColor: 'rgba(56, 189, 248, 0.14)',
      graticuleLabelColor: 'rgba(125, 211, 252, 0.45)',
      labelText: '#e0f2fe',
      labelSubText: '#7dd3fc',
      labelHalo: '#05152e',
      haloRingBg: 'rgba(6, 25, 54, 0.9)',
      beaconCenterFill: '#071d3d',
      terminatorNightAlpha: 0.42,
      isLightMap: false,
    };
  }
  if (themeId === 'atlas') {
    return {
      oceanBg: '#c8d9eb',
      oceanSubtleTint: '#bfd2e6',
      landFill: '#eef3f8',
      landHoverFill: '#ffffff',
      landSelectedFill: '#dbeafe',
      borderColor: '#94a3b8',
      coastlineColor: '#738ea8',
      selectedBorderColor: '#0284c7',
      graticuleColor: 'rgba(71, 85, 105, 0.14)',
      graticuleLabelColor: 'rgba(51, 65, 85, 0.55)',
      labelText: '#0f172a',
      labelSubText: '#334155',
      labelHalo: 'rgba(248, 250, 252, 0.92)',
      haloRingBg: 'rgba(255, 255, 255, 0.94)',
      beaconCenterFill: '#f8fafc',
      terminatorNightAlpha: 0.28,
      isLightMap: true,
    };
  }
  return {
    oceanBg: '#060a13',
    oceanSubtleTint: '#090f1d',
    landFill: '#141e30',
    landHoverFill: '#1e2e4a',
    landSelectedFill: '#1c3558',
    borderColor: '#263854',
    coastlineColor: '#365178',
    selectedBorderColor: '#38bdf8',
    graticuleColor: 'rgba(148, 163, 184, 0.09)',
    graticuleLabelColor: 'rgba(148, 163, 184, 0.35)',
    labelText: '#f1f5f9',
    labelSubText: '#94a3b8',
    labelHalo: '#050912',
    haloRingBg: 'rgba(9, 14, 26, 0.92)',
    beaconCenterFill: '#0b1120',
    terminatorNightAlpha: 0.45,
    isLightMap: false,
  };
}

interface HitBeacon {
  id: string;
  level: HierarchyLevel;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  screenX: number;
  screenY: number;
  radius: number;
  snapshot: ComputedPaymentSnapshot;
  continent?: ContinentNode;
  country?: CountryNode;
  city?: CityNode;
  localArea?: LocalAreaNode;
}

const CONTINENT_SPANS: Record<string, { lat: number; lon: number; lonSpan: number }> = {
  'north-america': { lat: 41, lon: -98, lonSpan: 86 },
  'south-america': { lat: -15, lon: -60, lonSpan: 58 },
  europe: { lat: 50, lon: 13, lonSpan: 48 },
  africa: { lat: 4, lon: 20, lonSpan: 66 },
  asia: { lat: 30, lon: 96, lonSpan: 94 },
  oceania: { lat: -24, lon: 138, lonSpan: 56 },
};

export function VectorPayMap({
  level,
  continentId,
  countryId,
  cityId,
  localAreaId,
  activeMetric,
  mapTheme,
  hourFloat,
  theme,
  syntheticCountries,
  controlsRef,
  onSelectContinent,
  onSelectCountry,
  onSelectCity,
  onSelectLocalArea,
  onHoverChange,
}: VectorPayMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store reactive props in refs for zero-rebind 60fps animation loop
  const propsRef = useRef({
    level,
    continentId,
    countryId,
    cityId,
    localAreaId,
    activeMetric,
    mapTheme,
    hourFloat,
    theme,
    syntheticCountries,
  });
  propsRef.current = {
    level,
    continentId,
    countryId,
    cityId,
    localAreaId,
    activeMetric,
    mapTheme,
    hourFloat,
    theme,
    syntheticCountries,
  };

  const callbacksRef = useRef({
    onSelectContinent,
    onSelectCountry,
    onSelectCity,
    onSelectLocalArea,
    onHoverChange,
  });
  callbacksRef.current = {
    onSelectContinent,
    onSelectCountry,
    onSelectCity,
    onSelectLocalArea,
    onHoverChange,
  };

  // Camera state: normalized Mercator center (u, v) + world pixel width (scalePx)
  const cameraRef = useRef({
    u: lonToU(12),
    v: latToV(18),
    scalePx: 1100,
    targetU: lonToU(12),
    targetV: latToV(18),
    targetScalePx: 1100,
    initialized: false,
  });

  const viewportRef = useRef({ width: 1200, height: 800, dpr: 1 });
  const hitBeaconsRef = useRef<HitBeacon[]>([]);
  const hoveredBeaconIdRef = useRef<string | null>(null);
  const hoveredGeoIsoRef = useRef<string | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const needsDrawRef = useRef(true);

  // Offscreen terminator buffer (180 x 90)
  const terminatorBufferRef = useRef<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    imageData: ImageData;
    lastHour: number;
    lastTheme: MapThemeId | null;
  } | null>(null);

  const geoCountries = useMemo(() => getGeoCountries(), []);
  const projectedCountries = useMemo(() => getProjectedCountries(), []);
  const flagshipCountries = useMemo(() => getAllFlagshipCountries(), []);

  // Resolve current active country/city/localArea objects
  const selectedCountry = useMemo<CountryNode | null>(() => {
    if (!countryId) return null;
    return (
      flagshipCountries.find((c) => c.id === countryId) ||
      syntheticCountries[countryId] ||
      null
    );
  }, [countryId, flagshipCountries, syntheticCountries]);

  const selectedCity = useMemo<CityNode | null>(() => {
    if (!cityId || !selectedCountry) return null;
    return selectedCountry.cities.find((ct) => ct.id === cityId) || null;
  }, [cityId, selectedCountry]);

  const selectedLocalArea = useMemo<LocalAreaNode | null>(() => {
    if (!localAreaId || !selectedCity) return null;
    return selectedCity.localAreas.find((la) => la.id === localAreaId) || null;
  }, [localAreaId, selectedCity]);

  const computeBoundsScale = (minLon: number, maxLon: number, minLat: number, maxLat: number) => {
    const { width, height } = viewportRef.current;
    const minU = lonToU(minLon);
    const maxU = lonToU(maxLon);
    const minV = latToV(maxLat);
    const maxV = latToV(minLat);
    const spanU = Math.max(0.002, maxU - minU);
    const spanV = Math.max(0.002, maxV - minV);
    const padFactor = 0.64;
    const scaleByWidth = (width * padFactor) / spanU;
    const scaleByHeight = (height * padFactor) / spanV;
    return Math.min(scaleByWidth, scaleByHeight);
  };

  // Update camera target whenever hierarchy selection changes
  useEffect(() => {
    const { width, height } = viewportRef.current;
    const minWorldScale = Math.max(width * 0.96, height * 1.15);
    const cam = cameraRef.current;

    let targetLat = 18;
    let targetLon = 12;
    let nextScale = minWorldScale;

    if (level === HierarchyLevel.LOCAL_AREA && selectedLocalArea) {
      targetLat = selectedLocalArea.lat;
      targetLon = selectedLocalArea.lon;
      nextScale = Math.max(minWorldScale * 42, width / 0.012);
    } else if (level === HierarchyLevel.CITY && selectedCity) {
      if (selectedCity.localAreas.length >= 2) {
        let minLat = 90;
        let maxLat = -90;
        let minLon = 180;
        let maxLon = -180;
        for (const area of selectedCity.localAreas) {
          if (area.lat < minLat) minLat = area.lat;
          if (area.lat > maxLat) maxLat = area.lat;
          if (area.lon < minLon) minLon = area.lon;
          if (area.lon > maxLon) maxLon = area.lon;
        }
        targetLat = (minLat + maxLat) / 2;
        targetLon = (minLon + maxLon) / 2;
        const spanLat = Math.max(0.18, maxLat - minLat);
        const spanLon = Math.max(0.24, maxLon - minLon);
        nextScale = computeBoundsScale(
          targetLon - spanLon * 0.85,
          targetLon + spanLon * 0.85,
          targetLat - spanLat * 0.85,
          targetLat + spanLat * 0.85
        );
      } else {
        targetLat = selectedCity.lat;
        targetLon = selectedCity.lon;
        nextScale = Math.max(minWorldScale * 22, width / 0.024);
      }
    } else if (level === HierarchyLevel.COUNTRY && selectedCountry) {
      const geoMatch = geoCountries.find(
        (g) =>
          (selectedCountry.isoNumeric && g.isoNumeric === selectedCountry.isoNumeric) ||
          g.name.toLowerCase() === selectedCountry.name.toLowerCase()
      );
      if (geoMatch) {
        const bbox = getPrimaryPolygonBbox(geoMatch);
        targetLat = (bbox.minLat + bbox.maxLat) / 2;
        targetLon = (bbox.minLon + bbox.maxLon) / 2;
        const padLon = Math.max(2.5, (bbox.maxLon - bbox.minLon) * 0.18);
        const padLat = Math.max(2.0, (bbox.maxLat - bbox.minLat) * 0.18);
        nextScale = computeBoundsScale(
          bbox.minLon - padLon,
          bbox.maxLon + padLon,
          clampLat(bbox.minLat - padLat),
          clampLat(bbox.maxLat + padLat)
        );
      } else {
        targetLat = selectedCountry.lat;
        targetLon = selectedCountry.lon;
        nextScale = minWorldScale * 4.5;
      }
    } else if (level === HierarchyLevel.CONTINENT && continentId) {
      const span = CONTINENT_SPANS[continentId];
      if (span) {
        targetLat = span.lat;
        targetLon = span.lon;
        nextScale = computeBoundsScale(
          span.lon - span.lonSpan / 2,
          span.lon + span.lonSpan / 2,
          clampLat(span.lat - span.lonSpan * 0.34),
          clampLat(span.lat + span.lonSpan * 0.34)
        );
      }
    } else {
      targetLat = 18;
      targetLon = 12;
      nextScale = minWorldScale;
    }

    const clampedScale = Math.max(minWorldScale * 0.88, Math.min(minWorldScale * 180, nextScale));
    cam.targetU = lonToU(targetLon);
    cam.targetV = latToV(targetLat);
    cam.targetScalePx = clampedScale;

    if (!cam.initialized) {
      cam.u = cam.targetU;
      cam.v = cam.targetV;
      cam.scalePx = cam.targetScalePx;
      cam.initialized = true;
    }
    needsDrawRef.current = true;
  }, [
    level,
    continentId,
    selectedCountry,
    selectedCity,
    selectedLocalArea,
    geoCountries,
  ]);

  // Expose imperative zoom controls to BottomDock
  useEffect(() => {
    controlsRef.current = {
      zoomIn: () => {
        const { width, height } = viewportRef.current;
        const minScale = Math.max(width * 0.8, height * 0.95);
        const maxScale = minScale * 180;
        const cam = cameraRef.current;
        cam.targetScalePx = Math.min(maxScale, cam.targetScalePx * 1.55);
        needsDrawRef.current = true;
      },
      zoomOut: () => {
        const { width, height } = viewportRef.current;
        const minScale = Math.max(width * 0.8, height * 0.95);
        const cam = cameraRef.current;
        cam.targetScalePx = Math.max(minScale, cam.targetScalePx / 1.55);
        needsDrawRef.current = true;
      },
    };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef]);

  // Main Canvas Resize, Pointer Interaction, and 60fps Render Loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      viewportRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const cam = cameraRef.current;
      const minScale = Math.max(width * 0.96, height * 1.15);
      if (!cam.initialized) {
        cam.scalePx = minScale;
        cam.targetScalePx = minScale;
        cam.initialized = true;
      } else if (cam.targetScalePx < minScale * 0.85) {
        cam.targetScalePx = minScale * 0.95;
      }
      needsDrawRef.current = true;
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(container);

    // Coordinate helpers
    const screenToWorldUV = (sx: number, sy: number) => {
      const { width, height } = viewportRef.current;
      const cam = cameraRef.current;
      const u = cam.u + (sx - width / 2) / cam.scalePx;
      const v = cam.v + (sy - height / 2) / cam.scalePx;
      return { u, v };
    };

    const projectToScreen = (lat: number, lon: number): { sx: number; sy: number } => {
      const { width, height } = viewportRef.current;
      const cam = cameraRef.current;
      const rawU = lonToU(lon);
      const du = shortestDeltaU(cam.u, rawU);
      const v = latToV(lat);
      return {
        sx: width / 2 + du * cam.scalePx,
        sy: height / 2 + (v - cam.v) * cam.scalePx,
      };
    };

    const clampCameraV = (v: number, scalePx: number) => {
      const { height } = viewportRef.current;
      const halfViewV = height / (2 * scalePx);
      if (halfViewV >= 0.48) return 0.5;
      const minV = 0.04 + halfViewV * 0.55;
      const maxV = 0.96 - halfViewV * 0.55;
      return Math.max(minV, Math.min(maxV, v));
    };

    // Hit-testing & Hover resolution
    const resolveHoverAtPoint = (sx: number, sy: number) => {
      const { level: curLevel, activeMetric: metric, hourFloat: curHour } = propsRef.current;
      const beacons = hitBeaconsRef.current;

      let matchedBeacon: HitBeacon | null = null;
      let bestDist = Infinity;
      for (const b of beacons) {
        const dx = sx - b.screenX;
        const dy = sy - b.screenY;
        const d = Math.hypot(dx, dy);
        if (d <= b.radius + 9 && d < bestDist) {
          bestDist = d;
          matchedBeacon = b;
        }
      }

      if (matchedBeacon) {
        hoveredBeaconIdRef.current = matchedBeacon.id;
        hoveredGeoIsoRef.current = null;
        canvas.style.cursor = 'pointer';
        callbacksRef.current.onHoverChange({
          level: matchedBeacon.level,
          id: matchedBeacon.id,
          name: matchedBeacon.name,
          subtitle: matchedBeacon.subtitle,
          lat: matchedBeacon.lat,
          lon: matchedBeacon.lon,
          screenX: sx,
          screenY: sy,
          snapshot: matchedBeacon.snapshot,
        });
        return;
      }

      hoveredBeaconIdRef.current = null;

      // Zero-dead-click country hover at WORLD & CONTINENT levels
      if (curLevel === HierarchyLevel.WORLD || curLevel === HierarchyLevel.CONTINENT) {
        const { u, v } = screenToWorldUV(sx, sy);
        if (v >= 0.02 && v <= 0.98) {
          const lat = vToLat(v);
          const lon = uToLon(u);
          const geo: GeoCountryFeature | null = findGeoCountryAtLatLon(lat, lon);
          if (geo) {
            hoveredGeoIsoRef.current = geo.isoNumeric || geo.name;
            canvas.style.cursor = 'pointer';
            const countryNode = getOrCreateCountryForGeo(geo);
            const snapshot = computeSnapshotForHour(countryNode.profile, curHour);
            const bd = getMetricBreakdown(snapshot, metric);
            callbacksRef.current.onHoverChange({
              level: HierarchyLevel.COUNTRY,
              id: countryNode.id,
              name: countryNode.name,
              subtitle: `Country · ${bd.totalFormatted} · Click to inspect`,
              lat: countryNode.lat,
              lon: countryNode.lon,
              screenX: sx,
              screenY: sy,
              snapshot,
            });
            return;
          }
        }
      }

      hoveredGeoIsoRef.current = null;
      canvas.style.cursor = 'grab';
      callbacksRef.current.onHoverChange(null);
    };

    // Pointer interaction state
    const activePointers = new Map<number, { x: number; y: number }>();
    let dragState: {
      active: boolean;
      moved: boolean;
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      pinchDist: number | null;
    } = {
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      pinchDist: null,
    };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      activePointers.set(e.pointerId, { x, y });

      if (activePointers.size === 1) {
        dragState = {
          active: true,
          moved: false,
          startX: x,
          startY: y,
          lastX: x,
          lastY: y,
          pinchDist: null,
        };
        canvas.style.cursor = 'grabbing';
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        dragState.pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        dragState.moved = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerPosRef.current = { x, y };

      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x, y });
      }

      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;

        if (dragState.pinchDist && dragState.pinchDist > 8) {
          const factor = dist / dragState.pinchDist;
          const { width, height } = viewportRef.current;
          const minScale = Math.max(width * 0.8, height * 0.95);
          const maxScale = minScale * 180;
          const cam = cameraRef.current;
          const before = screenToWorldUV(midX, midY);
          const nextScale = Math.max(minScale, Math.min(maxScale, cam.scalePx * factor));
          cam.scalePx = nextScale;
          cam.targetScalePx = nextScale;
          cam.u = normalizeU(before.u - (midX - width / 2) / nextScale);
          cam.v = clampCameraV(before.v - (midY - height / 2) / nextScale, nextScale);
          cam.targetU = cam.u;
          cam.targetV = cam.v;
        }
        dragState.pinchDist = dist;
        needsDrawRef.current = true;
        return;
      }

      if (dragState.active) {
        const dx = x - dragState.lastX;
        const dy = y - dragState.lastY;
        if (!dragState.moved && Math.hypot(x - dragState.startX, y - dragState.startY) > 5) {
          dragState.moved = true;
          callbacksRef.current.onHoverChange(null);
        }
        if (dragState.moved) {
          const cam = cameraRef.current;
          cam.u = normalizeU(cam.u - dx / cam.scalePx);
          cam.v = clampCameraV(cam.v - dy / cam.scalePx, cam.scalePx);
          cam.targetU = cam.u;
          cam.targetV = cam.v;
          cam.targetScalePx = cam.scalePx;
          needsDrawRef.current = true;
        }
        dragState.lastX = x;
        dragState.lastY = y;
        return;
      }

      resolveHoverAtPoint(x, y);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      activePointers.delete(e.pointerId);

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragState.active && !dragState.moved && activePointers.size === 0) {
        // Click action!
        const beacons = hitBeaconsRef.current;
        let clickedBeacon: HitBeacon | null = null;
        let bestDist = Infinity;
        for (const b of beacons) {
          const d = Math.hypot(x - b.screenX, y - b.screenY);
          if (d <= b.radius + 10 && d < bestDist) {
            bestDist = d;
            clickedBeacon = b;
          }
        }

        if (clickedBeacon) {
          if (clickedBeacon.level === HierarchyLevel.CONTINENT && clickedBeacon.continent) {
            callbacksRef.current.onSelectContinent(clickedBeacon.continent.id);
          } else if (clickedBeacon.level === HierarchyLevel.COUNTRY && clickedBeacon.country) {
            callbacksRef.current.onSelectCountry(clickedBeacon.country);
          } else if (clickedBeacon.level === HierarchyLevel.CITY && clickedBeacon.city) {
            callbacksRef.current.onSelectCity(clickedBeacon.city);
          } else if (
            clickedBeacon.level === HierarchyLevel.LOCAL_AREA &&
            clickedBeacon.localArea
          ) {
            callbacksRef.current.onSelectLocalArea(clickedBeacon.localArea);
          }
        } else {
          const { level: curLevel } = propsRef.current;
          if (curLevel === HierarchyLevel.WORLD || curLevel === HierarchyLevel.CONTINENT) {
            const { u, v } = screenToWorldUV(x, y);
            if (v >= 0.02 && v <= 0.98) {
              const geo = findGeoCountryAtLatLon(vToLat(v), uToLon(u));
              if (geo) {
                const countryNode = getOrCreateCountryForGeo(geo);
                callbacksRef.current.onSelectCountry(countryNode);
              }
            }
          }
        }
      }

      if (activePointers.size === 0) {
        dragState.active = false;
        dragState.pinchDist = null;
        resolveHoverAtPoint(x, y);
      }
    };

    const onPointerLeave = () => {
      if (!dragState.active) {
        pointerPosRef.current = null;
        hoveredBeaconIdRef.current = null;
        hoveredGeoIsoRef.current = null;
        callbacksRef.current.onHoverChange(null);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { width, height } = viewportRef.current;
      const minScale = Math.max(width * 0.8, height * 0.95);
      const maxScale = minScale * 180;
      const cam = cameraRef.current;

      const zoomFactor = Math.exp(-e.deltaY * 0.0014);
      const before = screenToWorldUV(sx, sy);
      const nextScale = Math.max(minScale, Math.min(maxScale, cam.scalePx * zoomFactor));

      cam.scalePx = nextScale;
      cam.targetScalePx = nextScale;
      cam.u = normalizeU(before.u - (sx - width / 2) / nextScale);
      cam.v = clampCameraV(before.v - (sy - height / 2) / nextScale, nextScale);
      cam.targetU = cam.u;
      cam.targetV = cam.v;
      needsDrawRef.current = true;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Offscreen Solar Terminator Generator
    const updateTerminatorBuffer = (
      hour: number,
      sunLongitudeRad: number,
      sunDeclinationRad: number,
      terminatorHex: number,
      mapThemeId: MapThemeId,
      palette: MapPalette
    ) => {
      if (!terminatorBufferRef.current) {
        const off = document.createElement('canvas');
        off.width = 180;
        off.height = 90;
        const offCtx = off.getContext('2d');
        if (!offCtx) return null;
        terminatorBufferRef.current = {
          canvas: off,
          ctx: offCtx,
          imageData: offCtx.createImageData(180, 90),
          lastHour: -999,
          lastTheme: null,
        };
      }
      const buf = terminatorBufferRef.current;
      if (
        Math.abs(hour - buf.lastHour) < 0.015 &&
        buf.lastTheme === mapThemeId
      ) {
        return buf.canvas;
      }

      buf.lastHour = hour;
      buf.lastTheme = mapThemeId;

      const w = 180;
      const h = 90;
      const data = buf.imageData.data;
      const sunLon = -sunLongitudeRad;
      const sinDec = Math.sin(sunDeclinationRad);
      const cosDec = Math.cos(sunDeclinationRad);

      const termR = (terminatorHex >> 16) & 0xff;
      const termG = (terminatorHex >> 8) & 0xff;
      const termB = terminatorHex & 0xff;

      const nightR = palette.isLightMap ? 15 : 3;
      const nightG = palette.isLightMap ? 28 : 7;
      const nightB = palette.isLightMap ? 58 : 20;

      for (let py = 0; py < h; py++) {
        const v = (py + 0.5) / h;
        const latRad = (vToLat(v) * Math.PI) / 180;
        const sinLat = Math.sin(latRad);
        const cosLat = Math.cos(latRad);

        for (let px = 0; px < w; px++) {
          const u = (px + 0.5) / w;
          const lonRad = (u * 2 - 1) * Math.PI;
          const cosZ = sinLat * sinDec + cosLat * cosDec * Math.cos(lonRad - sunLon);

          const idx = (py * w + px) * 4;
          if (cosZ < -0.1) {
            const depth = Math.min(1, (-cosZ - 0.1) / 0.25);
            data[idx] = nightR;
            data[idx + 1] = nightG;
            data[idx + 2] = nightB;
            data[idx + 3] = Math.round(depth * palette.terminatorNightAlpha * 255);
          } else if (cosZ < 0.11) {
            // Twilight golden/amber rim across terminator boundary
            const tCenter = 1 - Math.abs(cosZ) / 0.11;
            const nightTail = cosZ < 0 ? Math.min(1, -cosZ / 0.1) * 0.5 : 0;
            const twilightAlpha = tCenter * (palette.isLightMap ? 0.16 : 0.24);
            const totalAlpha = Math.min(1, twilightAlpha + nightTail * palette.terminatorNightAlpha);
            const mix = twilightAlpha / (totalAlpha || 1);
            data[idx] = Math.round(nightR * (1 - mix) + termR * mix);
            data[idx + 1] = Math.round(nightG * (1 - mix) + termG * mix);
            data[idx + 2] = Math.round(nightB * (1 - mix) + termB * mix);
            data[idx + 3] = Math.round(totalAlpha * 255);
          } else {
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = 0;
          }
        }
      }

      buf.ctx.putImageData(buf.imageData, 0, 0);
      return buf.canvas;
    };

    // Draw a 7-channel radial spectrum beacon
    const drawSpectrumBeacon = (
      sx: number,
      sy: number,
      radius: number,
      snapshot: ComputedPaymentSnapshot,
      metric: PaymentMetric,
      palette: MapPalette,
      isHovered: boolean,
      isActive: boolean,
      pulseTime: number
    ) => {
      const breakdown = getMetricBreakdown(snapshot, metric);
      const scaleMult = isHovered ? 1.18 : isActive ? 1.1 : 1.0;
      const rOuter = radius * scaleMult;
      const rInner = rOuter * 0.52;

      // Active or hovered soft ring
      if (isHovered || isActive) {
        const pulse = 1 + Math.sin(pulseTime * 4) * 0.08;
        ctx.beginPath();
        ctx.arc(sx, sy, (rOuter + 5) * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = isActive ? '#38bdf8' : 'rgba(56, 189, 248, 0.72)';
        ctx.lineWidth = isActive ? 2.2 : 1.5;
        ctx.stroke();
      }

      // Base ring disc
      ctx.beginPath();
      ctx.arc(sx, sy, rOuter + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = palette.haloRingBg;
      ctx.fill();

      // 7 Radial channel arcs
      let angle = -Math.PI / 2;
      const gap = 0.045;
      for (const ch of ALL_PAYMENT_CHANNELS) {
        const meta = CHANNEL_META[ch];
        const pct = Math.max(0, breakdown.percentages[meta.key] || 0);
        const sweep = (pct / 100) * Math.PI * 2;
        if (sweep > 0.02) {
          const drawSweep = Math.max(0.02, sweep - gap);
          ctx.beginPath();
          ctx.arc(sx, sy, (rOuter + rInner) / 2, angle, angle + drawSweep);
          ctx.strokeStyle = meta.colorHex;
          ctx.lineWidth = rOuter - rInner;
          ctx.lineCap = 'butt';
          ctx.stroke();
        }
        angle += sweep;
      }

      // Inner center core
      const peakColor = CHANNEL_META[snapshot.peakChannel].colorHex;
      ctx.beginPath();
      ctx.arc(sx, sy, rInner - 1, 0, Math.PI * 2);
      ctx.fillStyle = palette.beaconCenterFill;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2.5, rInner * 0.42), 0, Math.PI * 2);
      ctx.fillStyle = peakColor;
      ctx.fill();
    };

    // Draw crisp haloed beacon label with overlap avoidance
    const placedLabelBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const drawBeaconLabel = (
      sx: number,
      sy: number,
      rOuter: number,
      title: string,
      valueText: string,
      palette: MapPalette,
      forceShow: boolean
    ) => {
      ctx.font = '600 11px "DM Sans", sans-serif';
      const titleW = ctx.measureText(title).width;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const valW = ctx.measureText(valueText).width;

      const boxW = Math.max(titleW, valW) + 12;
      const boxH = 28;
      const boxX = sx - boxW / 2;
      const boxY = sy + rOuter + 6;

      if (!forceShow) {
        for (const b of placedLabelBoxes) {
          if (
            boxX < b.x2 &&
            boxX + boxW > b.x1 &&
            boxY < b.y2 &&
            boxY + boxH > b.y1
          ) {
            return;
          }
        }
      }
      placedLabelBoxes.push({ x1: boxX, y1: boxY, x2: boxX + boxW, y2: boxY + boxH });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';

      ctx.font = '600 11px "DM Sans", sans-serif';
      ctx.strokeStyle = palette.labelHalo;
      ctx.lineWidth = 3.5;
      ctx.strokeText(title, sx, boxY);
      ctx.fillStyle = palette.labelText;
      ctx.fillText(title, sx, boxY);

      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.strokeStyle = palette.labelHalo;
      ctx.lineWidth = 3;
      ctx.strokeText(valueText, sx, boxY + 13);
      ctx.fillStyle = palette.labelSubText;
      ctx.fillText(valueText, sx, boxY + 13);
    };

    // Main animation frame render
    let rafId = 0;
    const render = (nowMs: number) => {
      rafId = requestAnimationFrame(render);
      const timeSec = nowMs * 0.001;
      const cam = cameraRef.current;
      const { width, height, dpr } = viewportRef.current;

      // Smooth spring-like interpolation toward target camera
      const du = shortestDeltaU(cam.u, cam.targetU);
      const dv = cam.targetV - cam.v;
      const dScale = cam.targetScalePx - cam.scalePx;
      const isAnimatingCam =
        Math.abs(du) > 1e-5 || Math.abs(dv) > 1e-5 || Math.abs(dScale) > 0.35;

      if (isAnimatingCam) {
        cam.u = normalizeU(cam.u + du * 0.16);
        cam.v = clampCameraV(cam.v + dv * 0.16, cam.scalePx);
        cam.scalePx = cam.scalePx + dScale * 0.16;
      } else {
        cam.u = normalizeU(cam.targetU);
        cam.v = clampCameraV(cam.targetV, cam.targetScalePx);
        cam.scalePx = cam.targetScalePx;
      }

      const {
        level: curLevel,
        continentId: curContId,
        countryId: curCountryId,
        cityId: curCityId,
        localAreaId: curLocalId,
        activeMetric: curMetric,
        mapTheme: curMapTheme,
        hourFloat: curHour,
        theme: curTheme,
        syntheticCountries: curSynth,
      } = propsRef.current;

      const palette = getThemePalette(curMapTheme);

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Ocean Backdrop
      ctx.fillStyle = palette.oceanBg;
      ctx.fillRect(0, 0, width, height);

      // Subtle atmospheric depth gradient
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        Math.min(width, height) * 0.1,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      bgGrad.addColorStop(0, palette.oceanSubtleTint);
      bgGrad.addColorStop(1, palette.oceanBg);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const scale = cam.scalePx;
      const halfW = width / 2;
      const halfH = height / 2;
      const visibleCopies = [-1, 0, 1];

      // 2. Adaptive Cartographic Graticule
      const stepDeg = scale > 6000 ? 5 : scale > 2400 ? 15 : 30;
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.graticuleColor;
      ctx.beginPath();

      for (const copy of visibleCopies) {
        const originX = halfW + (copy - cam.u) * scale;
        if (originX > width + 20 || originX + scale < -20) continue;
        for (let lon = -180; lon < 180; lon += stepDeg) {
          const x = originX + lonToU(lon) * scale;
          if (x < -2 || x > width + 2) continue;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
      }

      for (let lat = -60; lat <= 75; lat += stepDeg) {
        const y = halfH + (latToV(lat) - cam.v) * scale;
        if (y < -2 || y > height + 2) continue;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Subtle Equator line
      const eqY = halfH + (0.5 - cam.v) * scale;
      if (eqY >= 0 && eqY <= height) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = palette.graticuleLabelColor;
        ctx.beginPath();
        ctx.moveTo(0, eqY);
        ctx.lineTo(width, eqY);
        ctx.stroke();
        ctx.restore();
      }

      // 3. Vector Country Polygons (50m TopoJSON across visible horizontal world copies)
      const activeCountryObj = curCountryId
        ? flagshipCountries.find((c) => c.id === curCountryId) || curSynth[curCountryId] || null
        : null;
      const activeCountryIso = activeCountryObj?.isoNumeric || '';
      const activeCountryName = activeCountryObj?.name.toLowerCase() || '';
      const hoveredIso = hoveredGeoIsoRef.current;

      const viewMinV = cam.v - halfH / scale;
      const viewMaxV = cam.v + halfH / scale;

      for (const copy of visibleCopies) {
        const baseX = halfW + (copy - cam.u) * scale;
        if (baseX > width + scale * 0.25 || baseX + scale < -scale * 0.25) continue;

        for (const country of projectedCountries) {
          if (country.maxV < viewMinV || country.minV > viewMaxV) continue;

          const isSelectedCountry =
            Boolean(activeCountryObj) &&
            ((activeCountryIso && country.isoNumeric === activeCountryIso) ||
              (activeCountryName && country.name.toLowerCase() === activeCountryName));

          const isHoveredCountry =
            Boolean(hoveredIso) &&
            (country.isoNumeric === hoveredIso || country.name === hoveredIso);

          ctx.beginPath();
          let hasGeometry = false;

          for (const poly of country.polygons) {
            for (const ring of poly.rings) {
              const rx1 = baseX + ring.minU * scale;
              const rx2 = baseX + ring.maxU * scale;
              if (rx2 < -8 || rx1 > width + 8) continue;
              if (ring.maxV < viewMinV || ring.minV > viewMaxV) continue;

              // Skip tiny subpixel islands when zoomed out
              if (
                (ring.maxU - ring.minU) * scale < 1.1 &&
                (ring.maxV - ring.minV) * scale < 1.1
              ) {
                continue;
              }

              const pts = ring.points;
              ctx.moveTo(baseX + pts[0][0] * scale, halfH + (pts[0][1] - cam.v) * scale);
              for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(baseX + pts[i][0] * scale, halfH + (pts[i][1] - cam.v) * scale);
              }
              ctx.closePath();
              hasGeometry = true;
            }
          }

          if (!hasGeometry) continue;

          if (isSelectedCountry) {
            ctx.fillStyle = palette.landSelectedFill;
            ctx.strokeStyle = palette.selectedBorderColor;
            ctx.lineWidth = 1.6;
          } else if (isHoveredCountry) {
            ctx.fillStyle = palette.landHoverFill;
            ctx.strokeStyle = palette.selectedBorderColor;
            ctx.lineWidth = 1.1;
          } else {
            ctx.fillStyle = palette.landFill;
            ctx.strokeStyle = palette.borderColor;
            ctx.lineWidth = scale > 4000 ? 1.15 : 0.75;
          }

          ctx.fill('evenodd');
          ctx.stroke();
        }
      }

      // 4. Live Diurnal Solar Terminator Overlay
      const termCanvas = updateTerminatorBuffer(
        curHour,
        curTheme.sunLongitudeRad,
        curTheme.sunDeclinationRad,
        curTheme.terminatorHex,
        curMapTheme,
        palette
      );
      if (termCanvas) {
        const topY = halfH + (0 - cam.v) * scale;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        for (const copy of visibleCopies) {
          const baseX = halfW + (copy - cam.u) * scale;
          if (baseX > width || baseX + scale < 0) continue;
          ctx.drawImage(termCanvas, baseX, topY, scale, scale);
        }
        ctx.restore();
      }

      // 5. Animated Global Payment Corridor Arcs (World & Continent levels)
      if (curLevel === HierarchyLevel.WORLD || curLevel === HierarchyLevel.CONTINENT) {
        for (let idx = 0; idx < GLOBAL_PAYMENT_ARCS.length; idx++) {
          const arc = GLOBAL_PAYMENT_ARCS[idx];
          const fromU = lonToU(arc.fromLon);
          const fromV = latToV(arc.fromLat);
          const dU = shortestDeltaU(fromU, lonToU(arc.toLon));
          const toV = latToV(arc.toLat);

          // Align arc start to nearest visible copy relative to camera
          const startDu = shortestDeltaU(cam.u, fromU);
          const x1 = halfW + startDu * scale;
          const y1 = halfH + (fromV - cam.v) * scale;
          const x2 = halfW + (startDu + dU) * scale;
          const y2 = halfH + (toV - cam.v) * scale;

          if (
            Math.max(x1, x2) < -60 ||
            Math.min(x1, x2) > width + 60 ||
            Math.max(y1, y2) < -60 ||
            Math.min(y1, y2) > height + 60
          ) {
            continue;
          }

          const distPx = Math.hypot(x2 - x1, y2 - y1);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2 - Math.min(85, distPx * 0.24);
          const color = CHANNEL_META[arc.channel].colorHex;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(midX, midY, x2, y2);
          ctx.strokeStyle = color;
          ctx.globalAlpha = curLevel === HierarchyLevel.WORLD ? 0.34 : 0.22;
          ctx.lineWidth = 1.4;
          ctx.stroke();

          // Traveling settlement pulse packet
          const t = (timeSec * 0.28 + idx * 0.17) % 1;
          const invT = 1 - t;
          const px = invT * invT * x1 + 2 * invT * t * midX + t * t * x2;
          const py = invT * invT * y1 + 2 * invT * t * midY + t * t * y2;

          ctx.globalAlpha = 0.92;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      const curSelectedCity =
        curCityId && activeCountryObj
          ? activeCountryObj.cities.find((ct) => ct.id === curCityId) || null
          : null;

      // 6. City Metro Grid Rings when inside City / Local Area zoom
      if (
        (curLevel === HierarchyLevel.CITY || curLevel === HierarchyLevel.LOCAL_AREA) &&
        curSelectedCity
      ) {
        const centerPt = projectToScreen(curSelectedCity.lat, curSelectedCity.lon);
        const gridColor =
          curMapTheme === 'atlas'
            ? 'rgba(2, 132, 199, 0.22)'
            : 'rgba(56, 189, 248, 0.22)';
        ctx.save();
        ctx.strokeStyle = gridColor;
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 1;
        for (const r of [64, 128, 210]) {
          ctx.beginPath();
          ctx.arc(centerPt.sx, centerPt.sy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 7. Data Beacons + Hitboxes
      const nextBeacons: HitBeacon[] = [];
      placedLabelBoxes.length = 0;

      if (curLevel === HierarchyLevel.WORLD) {
        // Subtle flagship country anchor dots at World level
        for (const country of flagshipCountries) {
          const { sx, sy } = projectToScreen(country.lat, country.lon);
          if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;
          const snap = computeSnapshotForHour(country.profile, curHour);
          const dotColor = CHANNEL_META[snap.peakChannel].colorHex;
          ctx.beginPath();
          ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.globalAlpha = 0.72;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Primary 6 Continent Spectrum Beacons
        for (const cont of CONTINENTS) {
          const { sx, sy } = projectToScreen(cont.lat, cont.lon);
          const snap = computeSnapshotForHour(cont.profile, curHour);
          const bd = getMetricBreakdown(snap, curMetric);
          const radius = 20;
          const isHovered = hoveredBeaconIdRef.current === cont.id;

          drawSpectrumBeacon(sx, sy, radius, snap, curMetric, palette, isHovered, false, timeSec);
          drawBeaconLabel(sx, sy, radius, cont.name, bd.totalFormatted, palette, true);

          nextBeacons.push({
            id: cont.id,
            level: HierarchyLevel.CONTINENT,
            name: cont.name,
            subtitle: `${cont.countries.length} Major Digital Payment Markets`,
            lat: cont.lat,
            lon: cont.lon,
            screenX: sx,
            screenY: sy,
            radius,
            snapshot: snap,
            continent: cont,
          });
        }
      } else if (curLevel === HierarchyLevel.CONTINENT) {
        const contCountries = flagshipCountries.filter(
          (c) => !curContId || c.continentId === curContId
        );
        for (const country of contCountries) {
          const { sx, sy } = projectToScreen(country.lat, country.lon);
          if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) continue;
          const snap = computeSnapshotForHour(country.profile, curHour);
          const bd = getMetricBreakdown(snap, curMetric);
          const radius = 16;
          const isHovered = hoveredBeaconIdRef.current === country.id;

          drawSpectrumBeacon(sx, sy, radius, snap, curMetric, palette, isHovered, false, timeSec);
          drawBeaconLabel(sx, sy, radius, country.name, bd.totalFormatted, palette, isHovered);

          nextBeacons.push({
            id: country.id,
            level: HierarchyLevel.COUNTRY,
            name: country.name,
            subtitle: `${country.cities.length} Metro Hubs · ${country.currencyCode}`,
            lat: country.lat,
            lon: country.lon,
            screenX: sx,
            screenY: sy,
            radius,
            snapshot: snap,
            country,
          });
        }
      } else if (curLevel === HierarchyLevel.COUNTRY && activeCountryObj) {
        for (const city of activeCountryObj.cities) {
          const { sx, sy } = projectToScreen(city.lat, city.lon);
          const snap = computeSnapshotForHour(city.profile, curHour);
          const bd = getMetricBreakdown(snap, curMetric);
          const radius = 16;
          const isHovered = hoveredBeaconIdRef.current === city.id;

          drawSpectrumBeacon(sx, sy, radius, snap, curMetric, palette, isHovered, false, timeSec);
          drawBeaconLabel(sx, sy, radius, city.name, bd.totalFormatted, palette, true);

          nextBeacons.push({
            id: city.id,
            level: HierarchyLevel.CITY,
            name: city.name,
            subtitle: `${city.populationLabel} · ${city.localAreas.length} Local Districts`,
            lat: city.lat,
            lon: city.lon,
            screenX: sx,
            screenY: sy,
            radius,
            snapshot: snap,
            city,
          });
        }
      } else if (
        (curLevel === HierarchyLevel.CITY || curLevel === HierarchyLevel.LOCAL_AREA) &&
        curSelectedCity
      ) {
        for (const area of curSelectedCity.localAreas) {
          const { sx, sy } = projectToScreen(area.lat, area.lon);
          const snap = computeSnapshotForHour(area.profile, curHour);
          const bd = getMetricBreakdown(snap, curMetric);
          const radius = 15;
          const isHovered = hoveredBeaconIdRef.current === area.id;
          const isSelected = curLevel === HierarchyLevel.LOCAL_AREA && curLocalId === area.id;

          drawSpectrumBeacon(
            sx,
            sy,
            radius,
            snap,
            curMetric,
            palette,
            isHovered,
            isSelected,
            timeSec
          );
          drawBeaconLabel(
            sx,
            sy,
            radius,
            area.name,
            bd.totalFormatted,
            palette,
            isSelected || isHovered || curSelectedCity.localAreas.length <= 5
          );

          nextBeacons.push({
            id: area.id,
            level: HierarchyLevel.LOCAL_AREA,
            name: area.name,
            subtitle: `${area.districtType} · ${curSelectedCity.name}`,
            lat: area.lat,
            lon: area.lon,
            screenX: sx,
            screenY: sy,
            radius,
            snapshot: snap,
            localArea: area,
          });
        }
      }

      hitBeaconsRef.current = nextBeacons;
      needsDrawRef.current = false;
      ctx.restore();
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [flagshipCountries, geoCountries, projectedCountries]);

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-label="Interactive 2D digital payments world map"
      />
    </div>
  );
}
