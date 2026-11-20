// WGS-84 <-> GCJ-02（火星坐标）换算。
// 高德瓦片是 GCJ-02，手机 GPS 是 WGS-84；在无锡两者相差约 486 米，
// 不换算跑出来的轨迹会和路网对不上。算法是公开的标准实现。
// 数据层（localStorage、JSON 导出）一律存 WGS-84，只在地图渲染时换算；
// 模拟模式点地图得到的是 GCJ-02 坐标，入库前再换回 WGS-84。

export interface LatLng {
  lat: number
  lng: number
}

const PI = Math.PI
const A = 6378245.0
const EE = 0.00669342162296594323

export function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

/** WGS-84 -> GCJ-02 */
export function wgs2gcj(lat: number, lng: number): LatLng {
  if (outOfChina(lat, lng)) return { lat, lng }
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { lat: lat + dLat, lng: lng + dLng }
}

/** GCJ-02 -> WGS-84（迭代两次，误差小于 1 毫米） */
export function gcj2wgs(lat: number, lng: number): LatLng {
  if (outOfChina(lat, lng)) return { lat, lng }
  let wgs: LatLng = { lat, lng }
  for (let i = 0; i < 2; i++) {
    const tmp = wgs2gcj(wgs.lat, wgs.lng)
    wgs = { lat: lat - (tmp.lat - wgs.lat), lng: lng - (tmp.lng - wgs.lng) }
  }
  return wgs
}

export function toGCJ(p: { lat: number; lng: number }): { lat: number; lng: number } {
  return wgs2gcj(p.lat, p.lng)
}

export function toWGS(p: { lat: number; lng: number }): { lat: number; lng: number } {
  return gcj2wgs(p.lat, p.lng)
}

/** 把 GeoJSON Polygon / MultiPolygon 的坐标（[lng, lat]）从 WGS-84 换成 GCJ-02，返回新对象 */
export function geoJSONToGCJ<T>(feature: T): T {
  const convertRing = (ring: [number, number][]): [number, number][] =>
    ring.map(([lng, lat]) => {
      const g = wgs2gcj(lat, lng)
      return [g.lng, g.lat]
    })
  const convertPolygon = (coords: [number, number][][]): [number, number][][] =>
    coords.map(convertRing)
  const f = feature as unknown as { geometry?: { type?: string; coordinates?: unknown } }
  if (!f?.geometry) return feature
  const g = f.geometry
  let coordinates: unknown = g.coordinates
  if (g.type === 'Polygon') coordinates = convertPolygon(g.coordinates as [number, number][][])
  else if (g.type === 'MultiPolygon')
    coordinates = (g.coordinates as [number, number][][][]).map(convertPolygon)
  else return feature
  return { ...(feature as object), geometry: { ...g, coordinates } } as T
}
