import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import type { GameState } from '../lib/store'
import { levelFor, totalDistanceM, totalMyAreaM2 } from '../lib/store'
import { formatArea, formatDistance } from '../lib/geo'
import { CameraIcon, DogIcon, MedalIcon, PinIcon } from './icons'
import type { PolyFeature } from '../lib/geo'

/**
 * 浅色「跑步护照」海报。
 *
 * 注意：海报节点内部全部用行内样式（hex / rgba），不用 Tailwind class。
 * Tailwind v4 的颜色是 oklch，html2canvas 解析不了会直接报错，
 * 所以这张卡片刻意绕开 Tailwind。
 */

const YELLOW = '#E5FF00'
const BG = '#FFFFFF'
const CARD = '#F5F5F3'
const MUTED = '#6B7280'

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 把全部领地多边形投影到一张 320x170 的 SVG 缩略图上 */
function MiniMap({ territories }: { territories: GameState['territories'] }) {
  const W = 320
  const H = 168
  // 收集所有环的经纬度点
  const rings: [number, number][][] = []
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  const pushRing = (ring: [number, number][]) => {
    if (ring.length < 3) return
    rings.push(ring)
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  for (const t of territories) {
    const poly = t.polygon as PolyFeature
    const g = poly.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates as [number, number][][]) pushRing(ring)
    } else if (g.type === 'MultiPolygon') {
      for (const p of g.coordinates as [number, number][][][]) {
        for (const ring of p) pushRing(ring)
      }
    }
  }
  if (rings.length === 0) {
    return (
      <div
        style={{
          width: W, height: H, background: '#F5F5F3', borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: MUTED, fontSize: 13,
        }}
      >
        还没有领地 · 跑一圈，地图上就会出现你的地盘
      </div>
    )
  }
  //  padding + 经纬度按 cos(lat) 校正，避免图形被拉扁
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const pad = 0.12
  const minLngP = minLng - (maxLng - minLng) * pad
  const maxLngP = maxLng + (maxLng - minLng) * pad
  const minLatP = minLat - (maxLat - minLat) * pad
  const maxLatP = maxLat + (maxLat - minLat) * pad
  const lngSpanP = Math.max((maxLngP - minLngP) * Math.cos(midLat), 1e-9)
  const latSpanP = Math.max(maxLatP - minLatP, 1e-9)
  const scale = Math.min(W / lngSpanP, H / latSpanP)
  const ox = (W - lngSpanP * scale) / 2
  const oy = (H - latSpanP * scale) / 2
  const px = (lng: number) => ox + (lng - minLngP) * Math.cos(midLat) * scale
  const py = (lat: number) => oy + (maxLatP - lat) * scale

  let ri = 0
  const polys: { points: string; mine: boolean; key: string }[] = []
  for (const t of territories) {
    const poly = t.polygon as PolyFeature
    const g = poly.geometry
    if (!g) continue
    const allRings: [number, number][][][] =
      g.type === 'Polygon'
        ? [g.coordinates as [number, number][][]]
        : (g.coordinates as [number, number][][][])
    for (const p of allRings) {
      for (const ring of p) {
        if (ring.length < 3) continue
        polys.push({
          key: `${t.id}-${ri++}`,
          mine: t.owner === 'me',
          points: ring.map(([lng, lat]) => `${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' '),
        })
      }
    }
  }
  // 网格线：营造地图感
  const grid: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (let i = 1; i < 4; i++) grid.push({ x1: (W / 4) * i, y1: 0, x2: (W / 4) * i, y2: H })
  for (let i = 1; i < 3; i++) grid.push({ x1: 0, y1: (H / 3) * i, x2: W, y2: (H / 3) * i })

  return (
    <svg width={W} height={H} style={{ display: 'block', borderRadius: 12, background: '#F5F5F3' }}>
      {grid.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#E5E7EB" strokeWidth={1} />
      ))}
      {polys.map((p) => (
        <polygon
          key={p.key}
          points={p.points}
          fill={p.mine ? '#84CC16' : '#FF453A'}
          fillOpacity={p.mine ? 0.55 : 0.5}
          stroke={p.mine ? '#65A30D' : '#FF453A'}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

export default function PassportPoster({ state }: { state: GameState }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const myArea = totalMyAreaM2(state)
  const totalDist = totalDistanceM(state)
  const level = levelFor(myArea)
  const longest = state.records.reduce<(typeof state.records)[number] | null>(
    (best, r) => (!best || r.areaM2 > best.areaM2 ? r : best),
    null,
  )
  const myCount = state.territories.filter((t) => t.owner === 'me').length
  const serial = `DOG-${String(Math.max(state.records.length, 1)).padStart(4, '0')}`

  const generate = async () => {
    const node = cardRef.current
    if (!node) return
    setGenerating(true)
    setErr(null)
    try {
      // 等一帧，让字体 / 布局稳定后再截图
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const canvas = await html2canvas(node, {
        scale: 3, // 360px 宽 x3 = 1080px 高清图，发朋友圈够清晰
        backgroundColor: BG,
        useCORS: true,
        logging: false,
      })
      const url = canvas.toDataURL('image/png')
      setPosterUrl(url)
      // 桌面端顺手再触发一次下载；手机端以下方预览图长按保存为主
      const a = document.createElement('a')
      a.href = url
      a.download = `xiaogou-passport-${fmtDate(Date.now())}.png`
      a.click()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const cell = (value: string, label: string, accent = false): React.ReactNode => (
    <div
      key={label}
      style={{ background: CARD, borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}
    >
      <div style={{ fontSize: 17, fontWeight: 900, color: accent ? '#65A30D' : '#111111', lineHeight: 1.25 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{label}</div>
    </div>
  )

  return (
    <div>
      <h3 className="mb-2 mt-6 text-xs font-bold tracking-wider text-neutral-500">跑步护照</h3>

      {/* 海报卡片本体：行内样式，专供 html2canvas 截图 */}
      <div ref={cardRef} style={{ width: 360, margin: '0 auto', background: BG, borderRadius: 22, border: `2px solid ${YELLOW}`, padding: 20, color: '#111111', fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: '50%', background: YELLOW,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <DogIcon className="h-11 w-11" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>小狗快跑</div>
            <div style={{ fontSize: 10, color: YELLOW, letterSpacing: 2, marginTop: 2 }}>
              RUNNING PASSPORT · 跑步护照
            </div>
          </div>
          <div style={{ fontSize: 10, color: MUTED, textAlign: 'right', lineHeight: 1.5 }}>
            NO.
            <br />
            <span style={{ color: '#111111', fontSize: 12, fontWeight: 700 }}>{serial}</span>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: YELLOW, color: '#000000', fontSize: 14, fontWeight: 900,
              borderRadius: 999, padding: '5px 14px',
            }}
          >
            <MedalIcon className="mr-1 inline h-4 w-4 align-[-2px]" /> {level.title}
          </span>
          <span style={{ fontSize: 12, color: MUTED }}>{level.next}</span>
        </div>

        <div style={{ marginTop: 14 }}>
          <MiniMap territories={state.territories} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: MUTED }}>
            <span><PinIcon className="mr-0.5 inline h-3 w-3 align-[-1px]" />无锡 · 我的领地缩略图</span>
            <span>
              我的 {myCount} 块 · AI {state.territories.length - myCount} 块
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
          {cell(formatArea(myArea), '累计占领面积', true)}
          {cell(longest ? formatArea(longest.areaM2) : '—', '最长单次圈地', true)}
          {cell(formatDistance(totalDist), '累计里程')}
          {cell(`${state.records.length} 次`, '跑步次数')}
          {cell(`${state.beats} 次`, '击败 AI 对手')}
          {cell(longest ? fmtDate(longest.startedAt) : '—', '最长圈地日期')}
        </div>

        <div
          style={{
            marginTop: 16, paddingTop: 12, borderTop: '1px solid #E5E7EB',
            display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED,
          }}
        >
          <span>小狗快跑 · 个人自玩版</span>
          <span>{fmtDate(Date.now())} 生成</span>
        </div>
      </div>

      <button
        onClick={generate}
        disabled={generating}
        className="mt-3 w-full rounded-2xl bg-[#E5FF00] py-3 text-sm font-black text-black active:scale-[0.98] disabled:opacity-60"
      >
        {generating ? '正在生成高清海报…' : (<><CameraIcon className="mr-1 inline h-4 w-4 align-[-2px]" />生成战报海报（高清 PNG）</>)}
      </button>
      <p className="mt-2 text-center text-xs leading-5 text-neutral-500">
        生成后会弹出预览图，手机上长按图片即可保存到相册发朋友圈；电脑上会自动下载 PNG。
      </p>
      {err && <p className="mt-2 text-center text-xs text-red-600">生成失败：{err}</p>}

      {/* 海报预览弹窗：长按保存 */}
      {posterUrl && (
        <div
          className="fixed inset-0 z-[950] flex items-end justify-center bg-black/50 p-4"
          onClick={() => setPosterUrl(null)}
        >
          <div
            className="w-full max-w-[420px] rounded-3xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center text-base font-black">你的跑步护照海报</h3>
            <p className="mt-1 text-center text-xs text-neutral-500">长按图片保存到相册，再去朋友圈晒一下 🐶</p>
            <img
              src={posterUrl}
              alt="小狗快跑跑步护照海报"
              className="mt-3 w-full rounded-2xl ring-1 ring-neutral-300"
            />
            <div className="mt-3 flex gap-2">
              <a
                href={posterUrl}
                download={`xiaogou-passport-${fmtDate(Date.now())}.png`}
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-[#E5FF00] text-sm font-black text-black active:scale-[0.98]"
              >
                保存图片
              </a>
              <button
                onClick={() => setPosterUrl(null)}
                className="h-12 flex-1 rounded-2xl bg-white text-sm font-bold ring-1 ring-neutral-200 active:scale-[0.98]"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
