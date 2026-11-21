import { useCallback, useEffect, useRef, useState} from 'react'
import MapView from './components/MapView'
import { DogIcon, MapTabIcon, PassportTabIcon, RecordsTabIcon } from './components/icons'
import { PassportTab, RecordsTab} from './components/Tabs'
import {
distM,
estimatedAreaM2,
formatArea,
formatDistance,
formatDuration,
formatPace,
intersectAreaM2,
makeCrossingStrip,
pointsToPolygon,
polygonAreaM2,
safeDifference,
safeIntersect,
totalDistanceM,
uid,
} from './lib/geo'
import type { Pt} from './lib/geo'
import {
BOTS,
MY_COLOR,
emptyState,
exportFileName,
loadState,
myTerritories,
parseImported,
saveState,
totalDistanceM as totalGameDistanceM,
totalMyAreaM2 as totalMyAreaM2Store,
} from './lib/store'
import type { BattleReport, GameState, RunRecord, Territory} from './lib/store'
import {
isDriveLinked,
loginDrive,
logoutDrive,
noteLocalChange,
noteRemoteApplied,
silentSyncOnLoad,
syncNow,
useDriveSync,
} from './lib/driveSync'
import type { SyncResult } from './lib/driveSync'

type Tab = 'map' | 'records' | 'passport'

interface Settle {
areaM2: number
cutM2: number
reclaimM2: number
distanceM: number
durationSec: number
}

async function requestWakeLock(): Promise<{ release: () => void} | null> {
try {
const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => void}>}}
if (!nav.wakeLock) return null
const lock = await nav.wakeLock.request('screen')
return lock
} catch {
return null
}
}

export default function App() {
const [game, setGame] = useState<GameState>(() => loadState())
const [tab, setTab] = useState<Tab>('map')
const [mockMode, setMockMode] = useState(false)
const [running, setRunning] = useState(false)
const [runSource, setRunSource] = useState<'gps' | 'mock'>('gps')
const [points, setPoints] = useState<Pt[]>([])
const [startTime, setStartTime] = useState<number | null>(null)
const [elapsed, setElapsed] = useState(0)
const [userPos, setUserPos] = useState<Pt | null>(null)
const [centerSignal, setCenterSignal] = useState(0)
const [toast, setToast] = useState<string | null>(null)
const [lastAttack, setLastAttack] = useState<BattleReport | null>(null)
const [settle, setSettle] = useState<Settle | null>(null)
// 轨迹回放：10 倍速重演某次跑步（progress 0~1）
const [replay, setReplay] = useState<{ record: RunRecord; progress: number } | null>(null)
const [replayPaused, setReplayPaused] = useState(false)
const [replayFitSignal, setReplayFitSignal] = useState(0)

const watchIdRef = useRef<number | null>(null)
const wakeLockRef = useRef<{ release: () => void} | null>(null)
const pointsRef = useRef<Pt[]>([])
pointsRef.current = points
const gameRef = useRef(game)
gameRef.current = game

// 自动持久化：任何记录 / 领地 / AI 数据变化都写 localStorage，
// 变化后（防抖 5 秒）自动同步到 Google Drive（已登录时）
const firstSaveRef = useRef(true)
const skipNextDriveUploadRef = useRef(false)
const driveInfo = useDriveSync()
useEffect(() => {
saveState(game)
if (firstSaveRef.current) {
// 首屏挂载这次只写本地，不记“本地变了”，否则会误判本地比云端新
firstSaveRef.current = false
return
}
if (skipNextDriveUploadRef.current) {
// 刚用云端存档替换了本地：这次只写本地，不再往云端传
skipNextDriveUploadRef.current = false
return
}
noteLocalChange(game)
}, [game])

const showToast = useCallback((msg: string) => {
setToast(msg)
window.setTimeout(() => setToast((t) => (t === msg? null: t)), 3500)
}, [])

// 打开页面时，若之前连过 Drive，后台静默同步一次（云端新就下载恢复）
const driveAutoSyncTriedRef = useRef(false)
useEffect(() => {
if (driveAutoSyncTriedRef.current) return
driveAutoSyncTriedRef.current = true
if (!isDriveLinked() || !navigator.onLine) return
void silentSyncOnLoad(gameRef.current).then((r) => {
if (r.action === 'downloaded') {
skipNextDriveUploadRef.current = true
setGame(r.state)
noteRemoteApplied(r.savedAt)
}
})
}, [])

// Drive 同步结果处理：云端下载的覆盖本地，其余只提示
const handleDriveResult = useCallback(
(r: SyncResult, actionLabel: string) => {
if (r.action === 'downloaded') {
skipNextDriveUploadRef.current = true
setGame(r.state)
noteRemoteApplied(r.savedAt)
showToast('已从 Google Drive 恢复最新存档')
return
}
if (r.action === 'uploaded') showToast('已同步到 Google Drive')
else if (r.action === 'up-to-date') showToast('Google Drive 已是最新')
else showToast(`${actionLabel}失败，请检查网络后重试`)
},
[showToast],
)

const onDriveLogin = useCallback(() => {
void loginDrive(gameRef.current).then((r) => handleDriveResult(r, '登录'))
}, [handleDriveResult])

const onDriveLogout = useCallback(() => {
logoutDrive()
showToast('已退出 Google Drive 同步，数据仍保留在本机')
}, [showToast])

const onDriveSyncNow = useCallback(() => {
void syncNow(gameRef.current).then((r) => handleDriveResult(r, '同步'))
}, [handleDriveResult])

// 跑步计时
useEffect(() => {
if (!running ||!startTime) return
const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
return () => window.clearInterval(id)
}, [running, startTime])

// 屏幕常亮：跑步中切回前台时重新申请
useEffect(() => {
const onVis = () => {
if (document.visibilityState === 'visible' && running &&!wakeLockRef.current) {
void requestWakeLock().then((l) => {
wakeLockRef.current = l
})
}
}
document.addEventListener('visibilitychange', onVis)
return () => document.removeEventListener('visibilitychange', onVis)
}, [running])

const stopWatch = useCallback(() => {
if (watchIdRef.current!== null) {
navigator.geolocation.clearWatch(watchIdRef.current)
watchIdRef.current = null
}
if (wakeLockRef.current) {
try {
wakeLockRef.current.release()
} catch {
/* ignore */
}
wakeLockRef.current = null
}
}, [])

// 轨迹回放计时：10 倍速推进 progress（总时长按原用时 /10，夹在 3~30 秒）
useEffect(() => {
  if (!replay || replayPaused) return
  const totalMs = Math.max(3000, Math.min(30000, replay.record.durationSec * 100))
  const t0 = Date.now() - replay.progress * totalMs
  const id = window.setInterval(() => {
    const p = (Date.now() - t0) / totalMs
    if (p >= 1) {
      setReplay((cur) => (cur ? { ...cur, progress: 1 } : cur))
      setReplayPaused(true)
    } else {
      setReplay((cur) => (cur ? { ...cur, progress: p } : cur))
    }
  }, 100)
  return () => window.clearInterval(id)
}, [replay, replayPaused])

// 开始回放某条历史记录
const startReplay = useCallback(
  (record: RunRecord) => {
    if (running) {
      showToast('正在跑步中，先结束这一跑再看回放')
      return
    }
    if (record.points.length < 2) {
      showToast('这条记录的点太少，回放不了')
      return
    }
    setReplay({ record, progress: 0 })
    setReplayPaused(false)
    setReplayFitSignal((n) => n + 1)
    setTab('map')
  },
  [running, showToast],
)

// ---- 开始跑步 ----
const startRun = useCallback(
(source: 'gps' | 'mock') => {
if (running) return
setReplay(null) // 开始新跑步时退出回放
setRunSource(source)
setPoints([])
pointsRef.current = []
const now = Date.now()
setStartTime(now)
setElapsed(0)
setRunning(true)
setLastAttack(null)
if (source === 'mock') {
showToast('模拟跑已开始：在地图上连续点出你的路线')
return
}
if (!navigator.geolocation) {
showToast('这台设备不支持 GPS 定位，请改用模拟测试')
setRunning(false)
return
}
void requestWakeLock().then((l) => {
wakeLockRef.current = l
})
// 先取一个起点，再高精度持续监听
navigator.geolocation.getCurrentPosition(
(pos) => {
const p: Pt = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now()}
setUserPos(p)
setPoints([p])
pointsRef.current = [p]
},
() => showToast('GPS 定位失败：请确认已允许位置权限，且在室外开阔处'),
{ enableHighAccuracy: true, timeout: 10000, maximumAge: 1000},
)
const id = navigator.geolocation.watchPosition(
(pos) => {
// GPS 精度太差的点直接丢弃，避免轨迹乱飘
if (pos.coords.accuracy > 50) return
const p: Pt = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now()}
setUserPos(p)
const prev = pointsRef.current
if (prev.length > 0) {
const last = prev[prev.length - 1]
if (distM(last, p) < 3) return // 3 米内视为原地抖动
}
const next = [...prev, p]
pointsRef.current = next
setPoints(next)
},
() => showToast('GPS 信号中断，请保持在室外'),
{ enableHighAccuracy: true, timeout: 15000, maximumAge: 1000},
)
watchIdRef.current = id
},
[running, showToast],
)

// ---- 模拟跑：在地图上点一点 ----
const onMapClick = useCallback(
(lat: number, lng: number) => {
if (!mockMode) return
const p: Pt = { lat, lng, t: Date.now()}
if (!running) {
// 没开始也能点：第一下自动开一场模拟跑
setRunSource('mock')
setStartTime(Date.now())
setElapsed(0)
setRunning(true)
setPoints([p])
pointsRef.current = [p]
showToast('模拟跑已开始：继续点出路线，围一圈再点“完成模拟跑”')
return
}
if (runSource!== 'mock') return
const prev = pointsRef.current
if (prev.length > 0 && distM(prev[prev.length - 1], p) < 2) return
const next = [...prev, p]
pointsRef.current = next
setPoints(next)
},
[mockMode, running, runSource, showToast],
)

// ---- 结束并结算：闭合多边形 + turf 裁切 ----
const finishRun = useCallback(() => {
const pts = pointsRef.current
if (pts.length < 3) {
showToast('点太少了，至少要 3 个点才能围成一块地')
return
}
const poly = pointsToPolygon(pts)
if (!poly) {
showToast('这条路线围不成多边形，换个圈再试')
return
}
const rawArea = polygonAreaM2(poly)
if (rawArea < 50) {
showToast(`圈太小了，只有 ${formatArea(rawArea)}，绕大一点再结束`)
return
}
const distanceM = totalDistanceM(pts)
const durationSec =
runSource === 'mock'
? Math.round((distanceM / 1000) * 360) // 模拟跑按 6'00"/km 折算用时
: Math.max(1, Math.floor((Date.now() - (startTime?? Date.now())) / 1000))
const avgPace = distanceM > 0? durationSec / (distanceM / 1000): null

const now = Date.now()
const runId = uid()
let newPoly = poly
let cutM2 = 0
let reclaimM2 = 0
let beatsDelta = 0
const cur = gameRef.current
const nextTerritories: Territory[] = [...cur.territories]
const nextBots = cur.bots.map((b) => ({...b}))

// 1) 与我已有领地重叠的部分裁掉（turf.difference，不重复计面积）
for (const t of myTerritories(cur)) {
const inter = intersectAreaM2(newPoly, t.polygon)
if (inter <= 0) continue
cutM2 += inter
const diff = safeDifference(newPoly, t.polygon)
if (!diff) {
newPoly = poly // 全被盖住时下面会按面积判 0 处理
break
}
newPoly = diff
}
const newArea = polygonAreaM2(newPoly)
if (newArea < 10) {
showToast('这一圈全在你已有的领地里，没有新地可占')
stopWatch()
setRunning(false)
setPoints([])
pointsRef.current = []
return
}

// 2) 压到 AI 领地：把重叠部分从 AI 领地里裁掉（turf.difference），算夺回
for (let i = 0; i < nextTerritories.length; i++) {
const t = nextTerritories[i]
if (t.owner === 'me') continue
const inter = intersectAreaM2(poly, t.polygon)
if (inter <= 0) continue
reclaimM2 += inter
const remaining = safeDifference(t.polygon, poly)
if (!remaining || polygonAreaM2(remaining) < 10) {
// 整块 AI 领地被清掉：击败 +1
nextTerritories.splice(i, 1)
i--
beatsDelta += 1
const bot = nextBots.find((b) => b.id === t.owner)
if (bot) bot.eliminated += 1
} else {
nextTerritories[i] = {...t, polygon: remaining, areaM2: polygonAreaM2(remaining)}
}
}

const record: RunRecord = {
id: runId,
startedAt: startTime?? now,
endedAt: now,
durationSec,
distanceM,
avgPaceSecPerKm: avgPace,
areaM2: newArea,
cutM2,
points: pts,
polygon: newPoly,
source: runSource,
}
const territory: Territory = {
id: uid(),
runId,
createdAt: now,
areaM2: newArea,
polygon: newPoly,
owner: 'me',
color: MY_COLOR,
}
const reports: BattleReport[] = []
if (reclaimM2 > 0) {
reports.push({
id: uid(),
at: now,
kind: beatsDelta > 0? 'win': 'reclaim',
stolenM2: reclaimM2,
text: `你跑穿了 AI 的领地，夺回 ${formatArea(reclaimM2)}${beatsDelta > 0? '，还整块清掉了一块 AI 领地！击败 AI +1': '！'}`,
})
}
reports.push({
id: uid(),
at: now,
kind: 'info',
text: `圈地成功：新占 ${formatArea(newArea)}，跑了 ${formatDistance(distanceM)}，用时 ${formatDuration(durationSec)}。`,
})

stopWatch()
setRunning(false)
setPoints([])
pointsRef.current = []
setGame((g) => ({
...g,
records: [...g.records, record],
territories: [...nextTerritories, territory],
reports: [...g.reports,...reports],
beats: g.beats + beatsDelta,
bots: nextBots,
}))
setSettle({ areaM2: newArea, cutM2, reclaimM2, distanceM, durationSec})
}, [runSource, startTime, showToast, stopWatch])

const cancelRun = useCallback(() => {
stopWatch()
setRunning(false)
setPoints([])
pointsRef.current = []
showToast('这次跑步已取消，轨迹没有保存')
}, [showToast, stopWatch])

// ---- 推进一天：AI 幽灵横穿偷地 ----
const advanceDay = useCallback(() => {
const cur = gameRef.current
const mine = myTerritories(cur)
if (mine.length === 0) {
showToast('你还没有领地，先跑一圈占块地，AI 才有东西可偷')
return
}
const bot = BOTS[Math.floor(Math.random() * BOTS.length)]
const botDef = cur.bots.find((b) => b.id === bot.id)?? bot
const target = mine[Math.floor(Math.random() * mine.length)]
let stolenPoly: ReturnType<typeof safeIntersect> = null
let stolenM2 = 0
for (let attempt = 0; attempt < 6; attempt++) {
const width = 30 + Math.random() * 40 // 30~70 米宽的横穿带
const strip = makeCrossingStrip(target.polygon, width)
if (!strip) continue
const inter = safeIntersect(target.polygon, strip)
const area = polygonAreaM2(inter)
if (area > 80 && area < target.areaM2 * 0.92) {
stolenPoly = inter
stolenM2 = area
break
}
}
if (!stolenPoly || stolenM2 <= 0) {
showToast(`${botDef.name} 今晚在你领地边上转了一圈，没找到下手的机会`)
return
}
const now = Date.now()
const remaining = safeDifference(target.polygon, stolenPoly)
const nextTerritories = cur.territories
.map((t) => {
if (t.id!== target.id) return t
if (!remaining || polygonAreaM2(remaining) < 10) return null
return {...t, polygon: remaining, areaM2: polygonAreaM2(remaining)}
})
.filter((t): t is Territory => t!== null)
const botTerritory: Territory = {
id: uid(),
runId: null,
createdAt: now,
areaM2: stolenM2,
polygon: stolenPoly,
owner: botDef.id,
botName: botDef.name,
color: botDef.color,
}
const report: BattleReport = {
id: uid(),
at: now,
kind: 'attack',
botName: botDef.name,
stolenM2,
text: `你的部分领地已被夺走，快去反击！它以 ${formatPace(botDef.paceSecPerKm)}/km 的配速横穿了你的领地，抢走了 ${formatArea(stolenM2)}。`,
}
setGame((g) => ({
...g,
territories: [...nextTerritories, botTerritory],
reports: [...g.reports, report],
bots: g.bots.map((b) => (b.id === botDef.id? {...b, totalStolenM2: b.totalStolenM2 + stolenM2}: b)),
}))
setLastAttack(report)
}, [showToast])

// ---- 导出 / 导入 / 清空 ----
const onExport = useCallback(() => {
const blob = new Blob([JSON.stringify(gameRef.current, null, 2)], { type: 'application/json'})
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = exportFileName()
a.click()
URL.revokeObjectURL(url)
showToast('备份已导出，记得存好这个 JSON 文件')
}, [showToast])

const onImportFile = useCallback(
(f: File) => {
const reader = new FileReader()
reader.onload = () => {
const parsed = parseImported(String(reader.result?? ''))
if (!parsed) {
showToast('这个文件不是小狗快跑的备份，恢复失败')
return
}
setGame(parsed)
setLastAttack(null)
showToast(`恢复成功：${parsed.records.length} 次跑步，${parsed.territories.length} 块领地`)
}
reader.readAsText(f)
},
[showToast],
)

const onClear = useCallback(() => {
setGame(emptyState())
setLastAttack(null)
showToast('已清空，重新开始圈地吧')
}, [showToast])

// ---- 派生数据 ----
const distanceM = totalDistanceM(points)
const pace = running && elapsed > 0 && distanceM > 0? elapsed / (distanceM / 1000): null
const estArea = estimatedAreaM2(points)
const loopReady = distanceM > 200 && points.length >= 2 && distM(points[0], points[points.length - 1]) < 35
const distToStart = points.length >= 2? distM(points[0], points[points.length - 1]): 0
const myArea = totalMyAreaM2Store(game)
const totalDist = totalGameDistanceM(game)

// 回放派生：已播到的轨迹点 + 逐步扩张的领地
const replayPoints = replay
  ? replay.record.points.slice(0, Math.max(1, Math.ceil(replay.progress * replay.record.points.length)))
  : []
const replayPolygon = replayPoints.length >= 3 ? pointsToPolygon(replayPoints) : null

return (
<div className="mx-auto flex h-[100dvh] w-full max-w-[520px] flex-col bg-[#F2F2EF] text-neutral-900">
{/* 顶部悬浮状态栏 */}
<header className="safe-top shrink-0 border-b border-neutral-200 bg-white/95 px-4 pb-3 pt-3">
<div className="flex items-center justify-between">
<div className="flex items-center gap-2">
<span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E5FF00]"><DogIcon className="h-7 w-7" /></span>
<div>
<h1 className="text-lg font-black leading-5">小狗快跑</h1>
<p className="text-[11px] leading-4 text-neutral-500">跑步圈地 · 个人自玩版</p>
</div>
</div>
<button
onClick={() => setCenterSignal((n) => n + 1)}
className="rounded-full bg-white px-3 py-2 text-xs font-bold ring-1 ring-neutral-200 active:scale-95"
>
◎ 回到我这
</button>
</div>
<div className="mt-3 grid grid-cols-3 gap-2">
<div className="rounded-2xl bg-white px-3 py-2 text-center">
<div className="text-sm font-black text-[#4D7C0F]">{formatArea(myArea)}</div>
<div className="text-[11px] text-neutral-500">累计占领面积</div>
</div>
<div className="rounded-2xl bg-white px-3 py-2 text-center">
<div className="text-sm font-black">{formatDistance(totalDist)}</div>
<div className="text-[11px] text-neutral-500">累计里程</div>
</div>
<div className="rounded-2xl bg-white px-3 py-2 text-center">
<div className="text-sm font-black">{game.beats} 次</div>
<div className="text-[11px] text-neutral-500">击败 AI 对手</div>
</div>
</div>
</header>

{/* 红色战报横幅 */}
{lastAttack && (
<div className="shrink-0 bg-red-600 px-4 py-2.5 text-sm font-bold leading-6 text-neutral-900">
<div className="flex items-start justify-between gap-2">
<span>⚠️ {lastAttack.text}</span>
<button onClick={() => setLastAttack(null)} className="shrink-0 rounded-full bg-black/30 px-2 py-0.5 text-xs">
知道了
</button>
</div>
</div>
)}

{/* 主内容 */}
<main className="flex min-h-0 flex-1 flex-col">
{tab === 'map' && (
<>
<div className="relative min-h-0 flex-1">
<MapView
territories={game.territories}
livePoints={points}
mockMode={mockMode}
onMapClick={onMapClick}
onLocateRequest={() => setCenterSignal((n) => n + 1)}
centerSignal={centerSignal}
userPos={userPos}
replayPoints={replayPoints}
replayPolygon={replayPolygon}
replayRecord={replay?.record ?? null}
replayFitSignal={replayFitSignal}
/>
{/* 地图右上角：模拟测试开关 */}
<div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
<button
onClick={() => {
const next =!mockMode
setMockMode(next)
if (!next && running && runSource === 'mock') cancelRun()
showToast(next? '模拟测试已开启：在地图上点一点就能跑，不用出门': '模拟测试已关闭')
}}
className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold shadow-lg active:scale-95 ${
mockMode? 'bg-[#E5FF00] text-black': 'bg-white/90 text-neutral-900 ring-1 ring-neutral-300 backdrop-blur'
}`}
>
<span className={`inline-block h-2.5 w-2.5 rounded-full ${mockMode? 'bg-black': 'bg-neutral-500'}`} />
模拟测试 {mockMode? '开': '关'}
</button>
{mockMode && running && (
<button
onClick={() => {
const prev = pointsRef.current.slice(0, -1)
pointsRef.current = prev
setPoints(prev)
}}
disabled={points.length === 0}
className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold ring-1 ring-neutral-300 backdrop-blur disabled:opacity-40"
>
↩ 撤销上一点
</button>
)}
</div>
</div>

{/* 轨迹回放控制条 */}
{replay && (
<div className="shrink-0 border-t border-neutral-200 bg-white px-4 pb-2 pt-2.5">
<div className="flex items-center justify-between text-xs">
<span className="font-bold text-[#4D7C0F]">
▶ 回放中 · 10 倍速 · 圈地 {formatArea(replay.record.areaM2)}
</span>
<span className="text-neutral-500">
{formatDuration(Math.round(replay.progress * replay.record.durationSec))} / {formatDuration(replay.record.durationSec)}
</span>
</div>
<div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
<div className="h-full rounded-full bg-[#E5FF00] transition-[width] duration-100" style={{ width: `${Math.round(replay.progress * 100)}%` }} />
</div>
<div className="mt-2 flex gap-2">
<button
onClick={() => {
if (replay.progress >= 1) {
setReplay({ record: replay.record, progress: 0 })
setReplayPaused(false)
} else {
setReplayPaused((p) => !p)
}
}}
className="h-10 flex-1 rounded-xl bg-[#E5FF00] text-sm font-black text-black active:scale-[0.98]"
>
{replay.progress >= 1 ? '↻ 再看一遍' : replayPaused ? '▶ 继续播放' : '⏸ 暂停'}
</button>
<button
onClick={() => {
setReplay({ record: replay.record, progress: 0 })
setReplayPaused(false)
}}
className="h-10 rounded-xl bg-white px-4 text-sm font-bold ring-1 ring-neutral-200 active:scale-95"
>
↻ 从头播
</button>
<button
onClick={() => setReplay(null)}
className="h-10 rounded-xl bg-white px-4 text-sm font-bold text-neutral-600 ring-1 ring-neutral-200 active:scale-95"
>
✕ 关闭
</button>
</div>
{replay.progress >= 1 && (
<p className="mt-2 text-center text-xs font-bold text-[#4D7C0F]">回放完成：领地已完整重现 🎉</p>
)}
</div>
)}

{/* 跑步面板 */}
<div className="safe-bottom shrink-0 border-t border-neutral-200 bg-white px-4 pb-3 pt-3">
{!running? (
<>
<button
onClick={() => startRun(mockMode? 'mock': 'gps')}
className="h-14 w-full rounded-2xl bg-[#E5FF00] text-lg font-black text-black shadow-[0_0_24px_rgba(229,255,0,0.35)] active:scale-[0.98]"
>
▶ 开始跑步{mockMode? '（模拟）': ''}
</button>
<div className="mt-2 flex gap-2">
<button
onClick={advanceDay}
disabled={myArea <= 0}
className="flex-1 rounded-xl bg-[#E5FF00] py-2.5 text-xs font-bold text-black disabled:opacity-40 active:scale-95"
>
⏭ 推进一天 / 模拟对手行动
</button>
<button
onClick={() => setTab('records')}
className="flex-1 rounded-xl bg-white py-2.5 text-xs font-bold ring-1 ring-neutral-200 active:scale-95"
>
📋 看看战报
</button>
</div>
<p className="mt-2 text-center text-[11px] leading-4 text-neutral-500">
{mockMode
? '模拟模式：直接点地图加路径点，围一圈后点“完成模拟跑”即可圈地。'
: '真跑模式：GPS 高精度记录，跑满 200 米后回到起点 35 米内即形成闭环；跑步中屏幕不会锁屏。'}
</p>
</>
): (
<>
<div className="grid grid-cols-4 gap-2 text-center">
<div className="rounded-2xl bg-white px-1 py-2"><div className="text-sm font-black">{formatDuration(elapsed)}</div><div className="text-[10px] text-neutral-500">用时</div></div>
<div className="rounded-2xl bg-white px-1 py-2"><div className="text-sm font-black">{formatDistance(distanceM)}</div><div className="text-[10px] text-neutral-500">距离</div></div>
<div className="rounded-2xl bg-white px-1 py-2"><div className="text-sm font-black">{formatPace(pace)}</div><div className="text-[10px] text-neutral-500">实时配速</div></div>
<div className="rounded-2xl bg-white px-1 py-2"><div className="text-sm font-black text-[#4D7C0F]">{formatArea(estArea)}</div><div className="text-[10px] text-neutral-500">预计围成面积</div></div>
</div>
{loopReady? (
<div className="mt-2 animate-pulse rounded-2xl bg-[#E5FF00] px-3 py-2.5 text-center text-sm font-black text-black">
✅ 已形成闭环，点击结束即可占领领地！
</div>
): (
<p className="mt-2 text-center text-xs text-neutral-500">
{distanceM < 200
? `再跑 ${Math.max(0, Math.round(200 - distanceM))} 米满 200 米，`
: ''}
距起点 {Math.round(distToStart)} 米（&lt; 35 米即闭环）· 已记录 {points.length} 个点
</p>
)}
<div className="mt-2 flex gap-2">
<button
onClick={finishRun}
className="h-12 flex-1 rounded-2xl bg-[#E5FF00] text-base font-black text-black active:scale-[0.98]"
>
{runSource === 'mock'? '完成模拟跑 · 占领': '结束并占领领地'}
</button>
<button onClick={cancelRun} className="h-12 rounded-2xl bg-white px-4 text-sm font-bold text-neutral-600 ring-1 ring-neutral-200 active:scale-95">
取消
</button>
</div>
</>
)}
</div>
</>
)}
{tab === 'records' && (
<RecordsTab state={game} onAdvanceDay={advanceDay} onReplay={startReplay} replayingId={replay?.record.id ?? null} />
)}
{tab === 'passport' && (
<PassportTab
state={game}
onExport={onExport}
onImportFile={onImportFile}
onClear={onClear}
driveInfo={driveInfo}
onDriveLogin={onDriveLogin}
onDriveLogout={onDriveLogout}
onDriveSyncNow={onDriveSyncNow}
/>
)}
</main>

{/* 底部 3 Tab */}
<nav className="safe-bottom shrink-0 border-t border-neutral-200 bg-white px-4 pb-2 pt-2">
<div className="grid grid-cols-3 gap-2">
{(
[
{ id: 'map', label: '地图', Icon: MapTabIcon },
{ id: 'records', label: '战报记录', Icon: RecordsTabIcon },
{ id: 'passport', label: '我的护照', Icon: PassportTabIcon },
] as const
).map((t) => (
<button
key={t.id}
onClick={() => setTab(t.id)}
className={`flex items-center justify-center gap-1.5 rounded-2xl py-2 text-sm font-bold active:scale-95 ${
tab === t.id? 'bg-[#E5FF00] text-black': 'bg-white text-neutral-600'
}`}
>
<t.Icon className="h-5 w-5" /> {t.label}
</button>
))}
</div>
</nav>

{/* Toast */}
{toast && (
<div className="pointer-events-none fixed inset-x-0 bottom-24 z-[1000] flex justify-center px-6">
<div className="rounded-full bg-white px-4 py-2.5 text-center text-sm font-bold text-black shadow-2xl">{toast}</div>
</div>
)}

{/* 结算弹窗 */}
{settle && (
<div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/40 p-4" onClick={() => setSettle(null)}>
<div className="w-full max-w-[480px] rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
<div className="text-center text-4xl">🐶🎉</div>
<h2 className="mt-2 text-center text-xl font-black">圈地成功！</h2>
<div className="mt-4 grid grid-cols-2 gap-2 text-center">
<div className="rounded-2xl bg-neutral-100 p-3"><div className="text-lg font-black text-[#4D7C0F]">{formatArea(settle.areaM2)}</div><div className="text-xs text-neutral-500">新占领面积</div></div>
<div className="rounded-2xl bg-neutral-100 p-3"><div className="text-lg font-black">{formatDistance(settle.distanceM)}</div><div className="text-xs text-neutral-500">跑步距离</div></div>
<div className="rounded-2xl bg-neutral-100 p-3"><div className="text-lg font-black">{formatDuration(settle.durationSec)}</div><div className="text-xs text-neutral-500">用时</div></div>
<div className="rounded-2xl bg-neutral-100 p-3"><div className="text-lg font-black">{settle.cutM2 > 0? formatArea(settle.cutM2): '—'}</div><div className="text-xs text-neutral-500">重叠裁切</div></div>
</div>
{settle.reclaimM2 > 0 && (
<p className="mt-3 rounded-2xl bg-lime-50 px-3 py-2 text-center text-sm font-bold text-[#4D7C0F]">
⚔️ 还从 AI 手里夺回了 {formatArea(settle.reclaimM2)}
</p>
)}
<div className="mt-4 flex gap-2">
<button onClick={() => setSettle(null)} className="h-12 flex-1 rounded-2xl bg-[#E5FF00] font-black text-black active:scale-[0.98]">
去看看领地
</button>
<button
onClick={() => {
setSettle(null)
advanceDay()
}}
disabled={myArea <= 0}
className="h-12 flex-1 rounded-2xl bg-white font-bold ring-1 ring-neutral-300 disabled:opacity-40 active:scale-[0.98]"
>
⏭ 推进一天
</button>
</div>
</div>
</div>
)}
</div>
)
}
