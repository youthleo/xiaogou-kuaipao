import type { PolyFeature, Pt } from './geo'

export const STORAGE_KEY = 'xiaogou-kuaipao-v1'
export const MY_COLOR = '#E5FF00'

export type BotId = 'ghost-night' | 'hunter-morning' | 'mad-pace'

export interface Bot {
  id: BotId
  name: string
  desc: string
  /** 配速：秒/公里 */
  paceSecPerKm: number
  color: string
  totalStolenM2: number
  /** 该对手被你完全清出地盘的次数 */
  eliminated: number
}

export const BOTS: Bot[] = [
  { id: 'ghost-night', name: '夜跑幽灵', desc: '深夜出没，专挑大块领地横切一刀', paceSecPerKm: 330, color: '#FF453A', totalStolenM2: 0, eliminated: 0 },
  { id: 'hunter-morning', name: '晨光猎手', desc: '清晨 6 点准时开跑，稳稳地蚕食边缘', paceSecPerKm: 375, color: '#FF9F0A', totalStolenM2: 0, eliminated: 0 },
  { id: 'mad-pace', name: '配速狂魔', desc: '4 分 45 配速狂奔，抢完就跑不留痕', paceSecPerKm: 285, color: '#BF5AF2', totalStolenM2: 0, eliminated: 0 },
]

export interface RunRecord {
  id: string
  startedAt: number
  endedAt: number
  durationSec: number
  distanceM: number
  avgPaceSecPerKm: number | null
  areaM2: number
  /** 被裁切掉的面积（与已有领地重叠部分） */
  cutM2: number
  points: Pt[]
  polygon: PolyFeature | null
  source: 'gps' | 'mock'
}

export interface Territory {
  id: string
  runId: string | null
  createdAt: number
  areaM2: number
  polygon: PolyFeature
  owner: 'me' | BotId
  botName?: string
  color: string
}

export interface BattleReport {
  id: string
  at: number
  kind: 'attack' | 'reclaim' | 'win' | 'info'
  botName?: string
  stolenM2?: number
  text: string
}

export interface GameState {
  version: 1
  createdAt: number
  records: RunRecord[]
  territories: Territory[]
  reports: BattleReport[]
  /** 击败 AI 对手次数：夺回地盘 / 完全清掉一块 AI 领地时 +1 */
  beats: number
  bots: Bot[]
}

export function emptyState(): GameState {
  return {
    version: 1,
    createdAt: Date.now(),
    records: [],
    territories: [],
    reports: [
      {
        id: 'welcome',
        at: Date.now(),
        kind: 'info',
        text: '欢迎来到小狗快跑！点“开始跑步”跑一圈，回到起点附近就能圈地。也可以先开右上角“模拟测试”，在地图上点一点试试圈地。',
      },
    ],
    beats: 0,
    bots: BOTS.map((b) => ({ ...b })),
  }
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as GameState
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.records)) return emptyState()
    return {
      ...emptyState(),
      ...parsed,
      records: parsed.records ?? [],
      territories: parsed.territories ?? [],
      reports: parsed.reports ?? [],
      bots: parsed.bots?.length ? parsed.bots : BOTS.map((b) => ({ ...b })),
    }
  } catch {
    return emptyState()
  }
}

export function saveState(s: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // 存储满 / 隐私模式时静默失败，不阻塞游玩
  }
}

export function exportFileName(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `xiaogou-kuaipao-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}

/** 校验导入的 JSON 是否为本应用备份 */
export function parseImported(text: string): GameState | null {
  try {
    const parsed = JSON.parse(text) as GameState
    if (!parsed || parsed.version !== 1) return null
    if (!Array.isArray(parsed.records) || !Array.isArray(parsed.territories) || !Array.isArray(parsed.reports)) return null
    return { ...emptyState(), ...parsed }
  } catch {
    return null
  }
}

export function myTerritories(s: GameState): Territory[] {
  return s.territories.filter((t) => t.owner === 'me')
}

export function totalMyAreaM2(s: GameState): number {
  return myTerritories(s).reduce((sum, t) => sum + t.areaM2, 0)
}

export function totalDistanceM(s: GameState): number {
  return s.records.reduce((sum, r) => sum + r.distanceM, 0)
}

export function levelFor(areaM2: number): { title: string; next: string } {
  if (areaM2 <= 0) return { title: '新手小狗', next: '跑第一圈，占下第一块地' }
  if (areaM2 < 1000) return { title: '圈地新秀', next: '累计占领 1,000 m² 升级' }
  if (areaM2 < 10000) return { title: '街区小霸王', next: '累计占领 10,000 m² 升级' }
  if (areaM2 < 100000) return { title: '领地大亨', next: '累计占领 100,000 m² 升级' }
  if (areaM2 < 1000000) return { title: '城市之王', next: '累计占领 1 km² 升级' }
  return { title: '传说跑者', next: '已是传说，继续扩大版图吧' }
}
