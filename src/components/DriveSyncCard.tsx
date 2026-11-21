import type { DriveSyncInfo, DriveSyncStatus } from '../lib/driveSync'

function fmtSyncTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function statusText(s: DriveSyncStatus): string {
  switch (s) {
    case 'logged-out':
      return '未登录'
    case 'syncing':
      return '同步中…'
    case 'synced':
      return '已同步'
    case 'failed':
      return '同步失败'
    case 'offline-local':
      return '离线 · 仅本机'
  }
}

function statusDot(s: DriveSyncStatus): string {
  switch (s) {
    case 'synced':
      return 'bg-[#65A30D]'
    case 'syncing':
      return 'bg-amber-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-neutral-400'
  }
}

export default function DriveSyncCard({
  info,
  onLogin,
  onLogout,
  onSyncNow,
}: {
  info: DriveSyncInfo
  onLogin: () => void
  onLogout: () => void
  onSyncNow: () => void
}) {
  const loggedIn = info.status !== 'logged-out' && info.status !== 'offline-local'
  const busy = info.status === 'syncing'
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">☁️ Google Drive 同步</span>
        <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold">
          <span className={`h-2 w-2 rounded-full ${statusDot(info.status)}`} />
          {statusText(info.status)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-500">
        {info.lastSyncAt ? `上次同步：${fmtSyncTime(info.lastSyncAt)}` : '还没有同步过'}
        <br />
        存档存在 Google Drive 的应用空间里，别人看不到；换手机登录同一个 Google 账号就能恢复。离线时只用本机数据。
      </p>
      <div className="mt-3 flex gap-2">
        {loggedIn ? (
          <>
            <button
              onClick={onSyncNow}
              disabled={busy}
              className="h-11 flex-1 rounded-xl bg-[#E5FF00] text-sm font-black text-black disabled:opacity-40 active:scale-[0.98]"
            >
              ↻ 立即同步
            </button>
            <button
              onClick={onLogout}
              disabled={busy}
              className="h-11 rounded-xl bg-white px-4 text-sm font-bold ring-1 ring-neutral-200 disabled:opacity-40 active:scale-95"
            >
              退出登录
            </button>
          </>
        ) : (
          <button
            onClick={onLogin}
            disabled={busy}
            className="h-11 w-full rounded-xl bg-[#E5FF00] text-sm font-black text-black disabled:opacity-40 active:scale-[0.98]"
          >
            用 Google 账号登录并同步
          </button>
        )}
      </div>
      {info.status === 'failed' && (
        <p className="mt-2 text-center text-xs text-red-600">
          同步失败了，数据还在本机没丢；检查网络后点“立即同步”重试。
        </p>
      )}
    </div>
  )
}
