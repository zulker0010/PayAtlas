import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import countriesTopoJson50m from 'world-atlas/countries-50m.json';
import countriesTopoJson110m from 'world-atlas/countries-110m.json';

export interface GeoRing {
  coords: Array<[number, number]>; // [lon, lat]
}

export interface GeoPolygon {
  rings: GeoRing[];
}

export interface GeoCountryFeature {
  isoNumeric: string;
  name: string;
  polygons: GeoPolygon[];
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  centroid: { lat: number; lon: number };
}

let cachedRenderFeatures: GeoCountryFeature[] | null = null;
let cachedLookupFeatures: GeoCountryFeature[] | null = null;

function computeCentroidAndBbox(polygons: GeoPolygon[]) {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;

  let bestRing: Array<[number, number]> = [];
  let bestArea = -1;

  for (const poly of polygons) {
    const outer = poly.rings[0]?.coords || [];
    let areaApprox = 0;
    for (let i = 0; i < outer.length; i++) {
      const [lon, lat] = outer[i];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      const next = outer[(i + 1) % outer.length];
      areaApprox += lon * next[1] - next[0] * lat;
    }
    const absArea = Math.abs(areaApprox);
    if (absArea > bestArea) {
      bestArea = absArea;
      bestRing = outer;
    }
  }

  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of bestRing) {
    sumLon += lon;
    sumLat += lat;
  }
  const count = bestRing.length || 1;
  return {
    bbox: { minLon, maxLon, minLat, maxLat },
    centroid: { lat: sumLat / count, lon: sumLon / count },
  };
}

function parseTopo(rawJson: unknown): GeoCountryFeature[] {
  const topology = rawJson as Topology<{
    countries: GeometryCollection<{ name: string }>;
    land: GeometryCollection;
  }>;

  const geo = feature(topology, topology.objects.countries);
  const features: GeoCountryFeature[] = [];

  for (const f of geo.features) {
    if (!f.geometry) continue;
    const isoNumeric = f.id !== undefined ? String(f.id).padStart(3, '0') : '';
    const name = f.properties?.name || 'Unknown Territory';
    const polygons: GeoPolygon[] = [];

    if (f.geometry.type === 'Polygon') {
      polygons.push({
        rings: f.geometry.coordinates.map((ring) => ({
          coords: ring.map(([lon, lat]) => [lon, lat] as [number, number]),
        })),
      });
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) {
        polygons.push({
          rings: poly.map((ring) => ({
            coords: ring.map(([lon, lat]) => [lon, lat] as [number, number]),
          })),
        });
      }
    }

    if (polygons.length === 0) continue;
    const { bbox, centroid } = computeCentroidAndBbox(polygons);
    features.push({
      isoNumeric,
      name,
      polygons,
      bbox,
      centroid,
    });
  }

  return features;
}

/** High-detail 50m coastline & border polygons for realistic Earth textures and 3D outlines */
export function getGeoCountries(): GeoCountryFeature[] {
  if (cachedRenderFeatures) return cachedRenderFeatures;
  cachedRenderFeatures = parseTopo(countriesTopoJson50m);
  return cachedRenderFeatures;
}

/** Lightweight 110m polygons for instant point-in-polygon hover/click picking */
function getLookupCountries(): GeoCountryFeature[] {
  if (cachedLookupFeatures) return cachedLookupFeatures;
  cachedLookupFeatures = parseTopo(countriesTopoJson110m);
  return cachedLookupFeatures;
}

function pointInRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    if (Math.abs(xi - xj) > 180) continue;

    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function findGeoCountryAtLatLon(lat: number, lon: number): GeoCountryFeature | null {
  const countries = getLookupCountries();
  for (const country of countries) {
    const { bbox } = country;
    if (lat < bbox.minLat || lat > bbox.maxLat) continue;
    if (bbox.maxLon - bbox.minLon < 340 && (lon < bbox.minLon || lon > bbox.maxLon)) continue;

    for (const poly of country.polygons) {
      if (poly.rings.length === 0) continue;
      if (pointInRing(lon, lat, poly.rings[0].coords)) {
        let inHole = false;
        for (let h = 1; h < poly.rings.length; h++) {
          if (pointInRing(lon, lat, poly.rings[h].coords)) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return country;
      }
    }
  }
  return null;
}

export function getPrimaryPolygonBbox(country: GeoCountryFeature): {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
} {
  let bestRing: Array<[number, number]> = [];
  let bestArea = -1;
  for (const poly of country.polygons) {
    const outer = poly.rings[0]?.coords || [];
    let areaApprox = 0;
    for (let i = 0; i < outer.length; i++) {
      const [lon, lat] = outer[i];
      const next = outer[(i + 1) % outer.length];
      areaApprox += lon * next[1] - next[0] * lat;
    }
    const absArea = Math.abs(areaApprox);
    if (absArea > bestArea) {
      bestArea = absArea;
      bestRing = outer;
    }
  }
  if (bestRing.length === 0) return country.bbox;

  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const [lon, lat] of bestRing) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

