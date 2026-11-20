import { useRef } from 'react'
import type { GameState, RunRecord } from '../lib/store'
import { formatArea, formatDistance, formatDuration, formatPace } from '../lib/geo'
import { exportFileName, levelFor, totalDistanceM, totalMyAreaM2 } from '../lib/store'
import PassportPoster from './PassportPoster'

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function kindLabel(kind: string): string {
  if (kind === 'attack') return '⚠️ 被偷家'
  if (kind === 'reclaim') return '⚔️ 夺回'
  if (kind === 'win') return '🏆 胜利'
  return 'ℹ️ 提示'
}

export function RecordsTab({
  state,
  onAdvanceDay,
  onReplay,
  replayingId,
}: {
  state: GameState
  onAdvanceDay: () => void
  onReplay: (r: RunRecord) => void
  replayingId: string | null
}) {
  const myArea = totalMyAreaM2(state)
  return (
    <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">战报记录</h2>
        <button
          onClick={onAdvanceDay}
          disabled={myArea <= 0}
          className="rounded-full bg-[#161618] px-3 py-2 text-xs font-bold text-[#E5FF00] ring-1 ring-[#E5FF00]/40 disabled:opacity-40 active:scale-95"
        >
          ⏭ 推进一天 · 对手行动
        </button>
      </div>

      <h3 className="mb-2 text-xs font-bold tracking-wider text-neutral-400">AI 战报</h3>
      {state.reports.length === 0 && <p className="text-sm text-neutral-500">暂无战报。</p>}
      <div className="space-y-2">
        {[...state.reports].reverse().map((r) => (
          <div
            key={r.id}
            className={`rounded-2xl p-3 text-sm leading-6 ${
              r.kind === 'attack' ? 'bg-red-500/15 ring-1 ring-red-500/50' : 'bg-[#161618]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className={r.kind === 'attack' ? 'font-bold text-red-400' : 'text-neutral-300'}>{kindLabel(r.kind)}</span>
              <span>{fmtDate(r.at)}</span>
            </div>
            <p className="mt-1 text-neutral-100">{r.text}</p>
            {r.stolenM2 ? <p className="text-xs text-red-300">被夺走 {formatArea(r.stolenM2)}</p> : null}
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-xs font-bold tracking-wider text-neutral-400">跑步记录（{state.records.length} 次）</h3>
      {state.records.length === 0 && (
        <div className="rounded-2xl bg-[#161618] p-4 text-sm leading-6 text-neutral-400">
          还没有跑步记录。先去地图跑一圈，或者开“模拟测试”在地图上点一点，完成一次模拟跑。
        </div>
      )}
      <div className="space-y-2">
        {[...state.records].reverse().map((r) => (
          <div key={r.id} className="rounded-2xl bg-[#161618] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{fmtDate(r.startedAt)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.source === 'mock' ? 'bg-purple-500/20 text-purple-300' : 'bg-[#E5FF00]/15 text-[#E5FF00]'}`}>
                {r.source === 'mock' ? '模拟跑' : 'GPS 跑'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              <div><div className="text-sm font-bold">{formatDistance(r.distanceM)}</div><div className="text-[10px] text-neutral-500">距离</div></div>
              <div><div className="text-sm font-bold">{formatDuration(r.durationSec)}</div><div className="text-[10px] text-neutral-500">用时</div></div>
              <div><div className="text-sm font-bold">{formatPace(r.avgPaceSecPerKm)}</div><div className="text-[10px] text-neutral-500">平均配速</div></div>
              <div><div className="text-sm font-bold text-[#E5FF00]">{formatArea(r.areaM2)}</div><div className="text-[10px] text-neutral-500">圈地面积</div></div>
            </div>
            {r.cutM2 > 0 && <p className="mt-2 text-xs text-neutral-400">与已有领地重叠，被裁切掉 {formatArea(r.cutM2)}（不重复计面积）。</p>}
            <button
              onClick={() => onReplay(r)}
              disabled={r.points.length < 2}
              className={`mt-2 w-full rounded-xl py-2 text-xs font-bold active:scale-[0.98] disabled:opacity-40 ${
                replayingId === r.id
                  ? 'bg-[#E5FF00] text-black'
                  : 'bg-[#0A0A0A] text-[#E5FF00] ring-1 ring-[#E5FF00]/40'
              }`}
            >
              {replayingId === r.id ? '▶ 正在回放中，点击可重播' : '▶ 轨迹回放（10 倍速）'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PassportTab({
  state,
  onExport,
  onImportFile,
  onClear,
}: {
  state: GameState
  onExport: () => void
  onImportFile: (f: File) => void
  onClear: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const myArea = totalMyAreaM2(state)
  const totalDist = totalDistanceM(state)
  const level = levelFor(myArea)
  const botTerrArea = state.territories.filter((t) => t.owner !== 'me').reduce((s, t) => s + t.areaM2, 0)

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6 pt-4">
      <div className="rounded-3xl bg-[#161618] p-5 text-center ring-1 ring-[#E5FF00]/25">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#E5FF00] text-4xl">🐶</div>
        <h2 className="mt-3 text-xl font-black">小狗快跑 · 我的护照</h2>
        <p className="mt-1 text-sm text-neutral-400">个人自玩版 · 数据只存在这台手机的浏览器里</p>
        <div className="mt-3 inline-block rounded-full bg-[#E5FF00] px-4 py-1 text-sm font-black text-black">{level.title}</div>
        <p className="mt-2 text-xs text-neutral-400">{level.next}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-[#161618] p-3 text-center"><div className="text-base font-bold text-[#E5FF00]">{formatArea(myArea)}</div><div className="text-[11px] text-neutral-500">累计占领</div></div>
        <div className="rounded-2xl bg-[#161618] p-3 text-center"><div className="text-base font-bold">{formatDistance(totalDist)}</div><div className="text-[11px] text-neutral-500">累计里程</div></div>
        <div className="rounded-2xl bg-[#161618] p-3 text-center"><div className="text-base font-bold">{state.beats} 次</div><div className="text-[11px] text-neutral-500">击败 AI</div></div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-[#161618] p-3 text-center"><div className="text-base font-bold">{state.records.length}</div><div className="text-[11px] text-neutral-500">跑步次数</div></div>
        <div className="rounded-2xl bg-[#161618] p-3 text-center"><div className="text-base font-bold">{state.territories.filter((t) => t.owner === 'me').length}</div><div className="text-[11px] text-neutral-500">我的领地块数</div></div>
        <div className="rounded-2xl bg-[#161618] p-3 text-center"><div className="text-base font-bold text-red-400">{formatArea(botTerrArea)}</div><div className="text-[11px] text-neutral-500">AI 占的地</div></div>
      </div>

      {/* 暗黑金卡跑步护照海报 */}
      <PassportPoster state={state} />

      <h3 className="mb-2 mt-6 text-xs font-bold tracking-wider text-neutral-400">AI 幽灵对手</h3>
      <div className="space-y-2">
        {state.bots.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-2xl bg-[#161618] p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold" style={{ backgroundColor: `${b.color}33`, color: b.color }}>
              👻
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{b.name} <span className="ml-1 text-xs font-normal text-neutral-400">{formatPace(b.paceSecPerKm)} /km</span></div>
              <div className="truncate text-xs text-neutral-400">{b.desc}</div>
              <div className="text-xs text-neutral-500">累计偷走 {formatArea(b.totalStolenM2)} · 被清出 {b.eliminated} 次</div>
            </div>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-xs font-bold tracking-wider text-neutral-400">数据备份</h3>
      <div className="space-y-2">
        <button onClick={onExport} className="w-full rounded-2xl bg-[#E5FF00] py-3 text-sm font-black text-black active:scale-[0.98]">
          导出 JSON 备份（{exportFileName()}）
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-2xl bg-[#161618] py-3 text-sm font-bold ring-1 ring-neutral-700 active:scale-[0.98]"
        >
          导入恢复（选择之前导出的 JSON）
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImportFile(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => {
            if (window.confirm('确定清空全部跑步记录、领地和战报吗？建议先导出备份。')) onClear()
          }}
          className="w-full rounded-2xl bg-[#161618] py-3 text-sm font-bold text-red-400 ring-1 ring-red-500/40 active:scale-[0.98]"
        >
          清空全部数据
        </button>
        <p className="text-center text-xs leading-5 text-neutral-500">
          所有数据自动保存在本机 localStorage，无需账号、无需付费 Key。
          <br />
          换手机 / 清浏览器数据前，先导出一份 JSON。
        </p>
      </div>

      <h3 className="mb-2 mt-6 text-xs font-bold tracking-wider text-neutral-400">玩法提示</h3>
      <div className="space-y-2 rounded-2xl bg-[#161618] p-4 text-sm leading-7 text-neutral-300">
        <p>1. 真跑：点“开始跑步”，GPS 高精度记录轨迹，跑满 200 米后回到起点 35 米内即形成闭环。</p>
        <p>2. 模拟：在家点右上角“模拟测试”，手指在地图上点出路线，再点“完成模拟跑”即可圈地。</p>
        <p>3. 抢地：新圈的地若压到别人的领地，重叠部分会被 turf.difference 自动裁掉；压到 AI 的地还能把它夺回来。</p>
        <p>4. 偷家：每次圈地后点“推进一天”，AI 会随机横穿你的领地偷走一块，记得去反击。</p>
        <p>5. 手机上用：Safari / Chrome 打开后点“添加到主屏幕”，就是一个 PWA 应用；跑步时屏幕不会自动锁屏。</p>
      </div>
    </div>
  )
}
