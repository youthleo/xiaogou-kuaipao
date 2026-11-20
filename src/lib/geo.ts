import * as turf from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'

export type Pt = { lat: number; lng: number; t: number }
export type PolyFeature = Feature<Polygon | MultiPolygon>

const toCoord = (p: Pt): [number, number] => [p.lng, p.lat]

/** 两点距离（米），turf.distance 返回公里 */
export function distM(a: Pt, b: Pt): number {
  return turf.distance(turf.point(toCoord(a)), turf.point(toCoord(b)), { units: 'kilometers' }) * 1000
}

/** 轨迹总距离（米） */
export function totalDistanceM(points: Pt[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) d += distM(points[i - 1], points[i])
  return d
}

/**
 * 轨迹 -> 平滑闭合多边形。
 * 先用 turf.bezierSpline 平滑闭合线，再转多边形；平滑失败或面积异常时回退原始折线多边形。
 * turf v7 的 difference / intersect 只接受 FeatureCollection，见下方封装。
 */
export function pointsToPolygon(points: Pt[]): PolyFeature | null {
  if (points.length < 3) return null
  const ring: [number, number][] = points.map(toCoord)
  // 首尾闭合
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push(ring[0])
  }
  const raw = turf.polygon([ring]) as PolyFeature
  const rawArea = turf.area(raw)
  if (rawArea < 10) return raw
  try {
    const line = turf.lineString(ring)
    const smooth = turf.bezierSpline(line, { resolution: 10000, sharpness: 0.85 })
    const coords = smooth.geometry.coordinates as [number, number][]
    if (coords.length >= 4) {
      const closed = [...coords]
      closed.push(closed[0])
      const poly = turf.polygon([closed]) as PolyFeature
      const area = turf.area(poly)
      // 平滑后面积应在原始面积的 0.3~3 倍内，否则说明自交/失真，回退原始
      if (area > 10 && area > rawArea * 0.3 && area < rawArea * 3) return poly
    }
  } catch {
    // 回退原始多边形
  }
  return raw
}

/** 多边形面积（平方米），null 计 0 */
export function polygonAreaM2(poly: PolyFeature | null | undefined): number {
  if (!poly) return 0
  try {
    return turf.area(poly as never)
  } catch {
    return 0
  }
}

/** 预计围成面积：当前轨迹首尾闭合后的面积 */
export function estimatedAreaM2(points: Pt[]): number {
  return polygonAreaM2(pointsToPolygon(points))
}

function fc(a: PolyFeature, b: PolyFeature) {
  return turf.featureCollection([a as never, b as never])
}

/** turf.difference（v7：入参 FeatureCollection）的安全封装，失败返回原多边形 */
export function safeDifference(a: PolyFeature, b: PolyFeature): PolyFeature | null {
  try {
    const out = turf.difference(fc(a, b) as never) as PolyFeature | null
    return out
  } catch {
    return a
  }
}

/** turf.intersect（v7：入参 FeatureCollection）的安全封装，无交集返回 null */
export function safeIntersect(a: PolyFeature, b: PolyFeature): PolyFeature | null {
  try {
    return turf.intersect(fc(a, b) as never) as PolyFeature | null
  } catch {
    return null
  }
}

/** 两多边形交集面积（平方米） */
export function intersectAreaM2(a: PolyFeature, b: PolyFeature): number {
  return polygonAreaM2(safeIntersect(a, b))
}

/**
 * AI 幽灵横穿带：以领地中心为基准，随机角度画一条横穿整块领地的直线，
 * turf.buffer 加宽成 30~60 米的“跑道”，与领地求交即为被偷走的部分。
 */
export function makeCrossingStrip(territory: PolyFeature, widthM: number): PolyFeature | null {
  try {
    const bbox = turf.bbox(territory as never)
    const center = turf.center(territory as never)
    const [cx, cy] = center.geometry.coordinates
    const diagKm = Math.max(turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], { units: 'kilometers' }), 0.2)
    const angle = Math.random() * Math.PI
    const half = diagKm / 2 + 0.1
    const dx = Math.cos(angle) * half
    const dy = Math.sin(angle) * half
    // 经纬度近似换算：1° 纬 ~111km，1° 经 ~111km*cos(lat)
    const latScale = 111
    const lngScale = 111 * Math.cos((cy * Math.PI) / 180)
    const p1: [number, number] = [cx - dx / lngScale, cy - dy / latScale]
    const p2: [number, number] = [cx + dx / lngScale, cy + dy / latScale]
    const line = turf.lineString([p1, p2])
    const strip = turf.buffer(line, widthM / 1000, { units: 'kilometers' }) as unknown as PolyFeature
    return strip
  } catch {
    return null
  }
}

export function formatArea(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} 万 m²`
  return `${Math.round(m2)} m²`
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${Math.round(m)} m`
}

/** 配速：秒/公里 -> 5'32" 格式 */
export function formatPace(secPerKm: number | null): string {
  if (!secPerKm || !isFinite(secPerKm) || secPerKm <= 0) return `--'--"`
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
