import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Pt, PolyFeature } from '../lib/geo'
import { formatArea } from '../lib/geo'
import type { RunRecord, Territory } from '../lib/store'

export const DEFAULT_CENTER: [number, number] = [31.615408, 120.249437] // 无锡，Chen 当前位置附近

interface Props {
  territories: Territory[]
  livePoints: Pt[]
  mockMode: boolean
  onMapClick: (lat: number, lng: number) => void
  onLocateRequest: () => void
  centerSignal: number // 每次 +1 即回到当前位置
  userPos: Pt | null
  /** 轨迹回放：当前已播到的轨迹点（App 按 10 倍速推进） */
  replayPoints?: Pt[]
  /** 回放中逐步扩张的领地多边形 */
  replayPolygon?: PolyFeature | null
  /** 回放的记录（变化时地图缩放到整条轨迹） */
  replayRecord?: RunRecord | null
  /** 回放开始信号，每次开始回放 +1（切 Tab 回来也能重新定位） */
  replayFitSignal?: number
}

const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'

function dogIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #0A0A0A;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 10px rgba(0,0,0,.7)">🐶</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export default function MapView({
  territories,
  livePoints,
  mockMode,
  onMapClick,
  centerSignal,
  userPos,
  replayPoints = [],
  replayPolygon = null,
  replayRecord = null,
  replayFitSignal = 0,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const terrLayerRef = useRef<L.LayerGroup | null>(null)
  const liveLayerRef = useRef<L.LayerGroup | null>(null)
  const replayLayerRef = useRef<L.LayerGroup | null>(null)
  const clickRef = useRef(onMapClick)
  clickRef.current = onMapClick
  const mockRef = useRef(mockMode)
  mockRef.current = mockMode

  // 初始化地图（只一次；StrictMode 下注意清理）
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: true,
      zoom: 17,
      center: DEFAULT_CENTER,
    })
    L.tileLayer(TILE_URL, {
      maxZoom: 20,
      maxNativeZoom: 16, // Esri 深灰底图原生只到 16 级，更高级别用 16 级瓦片放大
      attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community',
    }).addTo(map)
    terrLayerRef.current = L.layerGroup().addTo(map)
    liveLayerRef.current = L.layerGroup().addTo(map)
    replayLayerRef.current = L.layerGroup().addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (mockRef.current) clickRef.current(e.latlng.lat, e.latlng.lng)
    })
    mapRef.current = map
    // 首次尝试定位到用户附近（不强制，失败就留在默认中心）
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 17),
        () => undefined,
        { timeout: 8000 },
      )
    }
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 回到当前位置
  useEffect(() => {
    if (centerSignal === 0) return
    const map = mapRef.current
    if (!map) return
    if (userPos) map.setView([userPos.lat, userPos.lng], 17, { animate: true })
    else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 17, { animate: true }),
        () => undefined,
        { timeout: 8000 },
      )
    }
  }, [centerSignal, userPos])

  // 领地多边形
  useEffect(() => {
    const layer = terrLayerRef.current
    const map = mapRef.current
    if (!layer || !map) return
    layer.clearLayers()
    territories.forEach((t) => {
      try {
        const gj = L.geoJSON(t.polygon as never, {
          style: {
            color: t.color,
            weight: 2,
            fillColor: t.color,
            fillOpacity: t.owner === 'me' ? 0.35 : 0.45,
          },
        })
        const label = t.owner === 'me' ? `我的领地 · ${formatArea(t.areaM2)}` : `${t.botName ?? 'AI'} 的领地 · ${formatArea(t.areaM2)}`
        gj.bindTooltip(label, { sticky: true })
        gj.addTo(layer)
      } catch {
        // 单个坏多边形不影响其他领地
      }
    })
  }, [territories])

  // 实时轨迹 + 起点/当前位置
  useEffect(() => {
    const layer = liveLayerRef.current
    const map = mapRef.current
    if (!layer || !map) return
    layer.clearLayers()
    if (livePoints.length >= 2) {
      L.polyline(
        livePoints.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#E5FF00', weight: 4, opacity: 0.95 },
      ).addTo(layer)
      // 预计闭合线（当前位置 -> 起点，虚线）
      L.polyline(
        [
          [livePoints[livePoints.length - 1].lat, livePoints[livePoints.length - 1].lng],
          [livePoints[0].lat, livePoints[0].lng],
        ] as [number, number][],
        { color: '#E5FF00', weight: 2, opacity: 0.5, dashArray: '6 6' },
      ).addTo(layer)
    }
    if (livePoints.length >= 1) {
      L.marker([livePoints[0].lat, livePoints[0].lng], { icon: dogIcon('#E5FF00') })
        .bindTooltip('起点', { direction: 'top' })
        .addTo(layer)
      const last = livePoints[livePoints.length - 1]
      L.circleMarker([last.lat, last.lng], {
        radius: 8, color: '#0A0A0A', weight: 2, fillColor: '#E5FF00', fillOpacity: 1,
      }).addTo(layer)
    }
    // 跟随：跑步时地图中心跟当前点走（仅当点在视野外才平移，避免抖动）
    if (livePoints.length >= 2) {
      const last = livePoints[livePoints.length - 1]
      const bounds = map.getBounds()
      if (!bounds.contains(L.latLng(last.lat, last.lng))) map.panTo([last.lat, last.lng], { animate: true })
    }
  }, [livePoints])

  // 回放开始：缩放到整条轨迹
  useEffect(() => {
    const map = mapRef.current
    if (!map || !replayRecord || replayRecord.points.length < 2) return
    const bounds = L.latLngBounds(replayRecord.points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [44, 44], animate: true })
  }, [replayRecord, replayFitSignal])

  // 回放图层：路线逐步重绘 + 领地逐步扩张 + 小狗沿线跑
  useEffect(() => {
    const layer = replayLayerRef.current
    const map = mapRef.current
    if (!layer || !map) return
    layer.clearLayers()
    if (replayPoints.length >= 2) {
      L.polyline(
        replayPoints.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#E5FF00', weight: 5, opacity: 0.95 },
      ).addTo(layer)
    }
    if (replayPolygon) {
      try {
        L.geoJSON(replayPolygon as never, {
          style: { color: '#E5FF00', weight: 2, fillColor: '#E5FF00', fillOpacity: 0.35 },
        }).addTo(layer)
      } catch {
        // 回放中途的多边形偶尔自交，忽略即可，下一帧会重画
      }
    }
    if (replayPoints.length >= 1) {
      L.marker([replayPoints[0].lat, replayPoints[0].lng], { icon: dogIcon('#E5FF00') })
        .bindTooltip('起点', { direction: 'top' })
        .addTo(layer)
      const last = replayPoints[replayPoints.length - 1]
      L.circleMarker([last.lat, last.lng], {
        radius: 9, color: '#0A0A0A', weight: 2, fillColor: '#E5FF00', fillOpacity: 1,
      }).addTo(layer)
    }
  }, [replayPoints, replayPolygon])

  return (
    <div className="relative h-full w-full">
      <div ref={elRef} className="h-full w-full" />
      {mockMode && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-[#E5FF00] px-3 py-1 text-xs font-bold text-black shadow-lg">
          模拟模式：点地图加路径点
        </div>
      )}
      {replayPoints.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-12 z-[500] rounded-full bg-[#E5FF00] px-3 py-1 text-xs font-bold text-black shadow-lg">
          ▶ 轨迹回放中 · 10 倍速
        </div>
      )}
      {livePoints.length === 0 && territories.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-[400] flex justify-center px-6">
          <div className="rounded-2xl bg-black/70 px-4 py-3 text-center text-xs leading-5 text-neutral-300 backdrop-blur">
            还没有领地。点下方大黄按钮开始跑步，
            <br />
            绕一圈回到起点附近就能圈地 🐶
          </div>
        </div>
      )}
    </div>
  )
}

export type { PolyFeature }
