import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RoadRouteResult {
  coordinates: LatLng[];
  distanceKm: number;
  durationMinutes: number;
  isRealRoad: boolean;
}

const memoryCache = new Map<string, RoadRouteResult>();

/**
 * Generates a curved, natural road-like path between two coordinates when offline.
 * Simulates arterial street bends and roundabouts rather than rigid straight or staircase lines.
 */
function generateNaturalCurvedRoute(start: LatLng, end: LatLng): LatLng[] {
  const points: LatLng[] = [];
  const steps = 24;
  const dLat = end.latitude - start.latitude;
  const dLon = end.longitude - start.longitude;

  // Lateral deflection vectors simulating Kigali's hilly road network
  const perpLat = -dLon * 0.16;
  const perpLon = dLat * 0.16;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Harmonic wave curvature
    const primaryBend = Math.sin(t * Math.PI) * 0.65;
    const secondaryBend = Math.sin(t * Math.PI * 2.5) * 0.25;
    const lateralShift = primaryBend + secondaryBend;

    const lat = start.latitude + dLat * t + perpLat * lateralShift;
    const lon = start.longitude + dLon * t + perpLon * lateralShift;

    points.push({ latitude: lat, longitude: lon });
  }

  return points;
}

/**
 * Computes haversine distance in kilometers
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetches real driving road geometry from OpenStreetMap OSRM routing engine.
 * Returns the exact road segments, turns, and roundabouts along Kigali streets.
 * Automatically falls back to natural curved road trajectory if offline or slow.
 */
export async function fetchRealRoadRoute(
  start: LatLng,
  end: LatLng
): Promise<RoadRouteResult> {
  const directDistance = haversineKm(
    start.latitude,
    start.longitude,
    end.latitude,
    end.longitude
  );

  const cacheKey = `${start.latitude.toFixed(4)},${start.longitude.toFixed(
    4
  )}->${end.latitude.toFixed(4)},${end.longitude.toFixed(4)}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  // Check persistent storage
  try {
    const cachedStr = await AsyncStorage.getItem(`@road_route_${cacheKey}`);
    if (cachedStr) {
      const parsed: RoadRouteResult = JSON.parse(cachedStr);
      memoryCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch {}

  const fallbackResult: RoadRouteResult = {
    coordinates: generateNaturalCurvedRoute(start, end),
    distanceKm: Number((directDistance * 1.25).toFixed(1)),
    durationMinutes: Math.max(2, Math.round(directDistance * 2.5)),
    isRealRoad: false,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (
        data.code === "Ok" &&
        data.routes &&
        data.routes.length > 0 &&
        data.routes[0].geometry?.coordinates?.length > 1
      ) {
        const route = data.routes[0];
        const rawCoords: [number, number][] = route.geometry.coordinates;

        const roadCoords: LatLng[] = rawCoords.map(([lon, lat]) => ({
          latitude: lat,
          longitude: lon,
        }));

        const result: RoadRouteResult = {
          coordinates: roadCoords,
          distanceKm: Number((route.distance / 1000).toFixed(1)),
          durationMinutes: Math.max(1, Math.round(route.duration / 60)),
          isRealRoad: true,
        };

        memoryCache.set(cacheKey, result);
        AsyncStorage.setItem(
          `@road_route_${cacheKey}`,
          JSON.stringify(result)
        ).catch(() => {});

        return result;
      }
    }
  } catch {
    // Network or timeout, fallback gracefully
  }

  memoryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

export default function () {
  return null;
}

