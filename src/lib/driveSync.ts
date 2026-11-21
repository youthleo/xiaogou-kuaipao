import { useSyncExternalStore } from 'react'
import type { GameState } from './store'
import { parseImported } from './store'

/**
 * Google Drive 自动同步（小狗快跑独立版 PWA 用）。
 *
 * 原理：用 Google Identity Services（GIS）拿 access token，直接 fetch 调
 * Drive API v3。存档存在 Drive 的 appDataFolder（应用专属隐藏空间，平时
 * 在 Drive 里看不到这个文件），文件名 xiaogou-kuaipao-save-v1.json，
 * 内容是信封 { savedAt, state }，多设备之间按 savedAt 做 last-write-wins。
 *
 * 安全：token 只放内存变量，不写任何持久位置、不打日志；代码里除 Client ID
 *（公开标识）外不放任何凭据；也不用客户端密钥。
 */

// OAuth 客户端 ID（公开标识，可嵌进代码；GCP 项目 xiaogou-kuaipao，
// 同意屏幕为外部 / 测试模式，范围只有 drive.appdata）
export const DRIVE_CLIENT_ID =
  '45574978308-tnn4ei2gqo9qtvlde0tifsu5b7q8sh8i.apps.googleusercontent.com'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const SAVE_FILE_NAME = 'xiaogou-kuaipao-save-v1.json'
const META_KEY = 'xiaogou-kuaipao-drive-v1'
const AUTO_UPLOAD_DELAY_MS = 5000

export type DriveSyncStatus = 'logged-out' | 'syncing' | 'synced' | 'failed' | 'offline-local'

export interface DriveSyncInfo {
  status: DriveSyncStatus
  lastSyncAt: number | null
}

export type SyncResult =
  | { action: 'uploaded' }
  | { action: 'downloaded'; state: GameState; savedAt: number }
  | { action: 'up-to-date' }
  | { action: 'failed' }

interface DriveMeta {
  linked: boolean
  savedAt: number
  fileId: string | null
  lastSyncAt: number | null
}

interface DriveEnvelope {
  savedAt: number
  state: GameState
}

// ---- GIS 类型（只用到的一小部分，不引入新依赖） ----

interface GisTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GisTokenClient {
  requestAccessToken: (options?: { prompt?: '' | 'none' | 'consent' | 'select_account' }) => void
}

interface GisOAuth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (resp: GisTokenResponse) => void
  }) => GisTokenClient
  revoke: (token: string, done?: () => void) => void
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GisOAuth2 } }
  }
}

// ---- 本地元数据（localStorage，只存同步用的时间戳和文件 id，不存 token） ----

function defaultMeta(): DriveMeta {
  return { linked: false, savedAt: 0, fileId: null, lastSyncAt: null }
}

function loadMeta(): DriveMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return defaultMeta()
    const parsed = JSON.parse(raw) as Partial<DriveMeta>
    return {
      linked: parsed.linked === true,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      fileId: typeof parsed.fileId === 'string' ? parsed.fileId : null,
      lastSyncAt: typeof parsed.lastSyncAt === 'number' ? parsed.lastSyncAt : null,
    }
  } catch {
    return defaultMeta()
  }
}

function saveMeta(meta: DriveMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // 写不进也不影响游玩
  }
}

// ---- 同步状态（供界面订阅） ----

function initialStatus(): DriveSyncStatus {
  const meta = loadMeta()
  if (meta.linked && typeof navigator !== 'undefined' && !navigator.onLine) return 'offline-local'
  return 'logged-out'
}

let info: DriveSyncInfo = { status: initialStatus(), lastSyncAt: loadMeta().lastSyncAt }
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function setInfo(patch: Partial<DriveSyncInfo>): void {
  info = { ...info, ...patch }
  emit()
}

export function subscribeDriveSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDriveSyncSnapshot(): DriveSyncInfo {
  return info
}

export function useDriveSync(): DriveSyncInfo {
  return useSyncExternalStore(subscribeDriveSync, getDriveSyncSnapshot, getDriveSyncSnapshot)
}

export function isDriveLinked(): boolean {
  return loadMeta().linked
}

/** 未登录时按在线 / 离线刷新回待机状态（静默失败不显示“同步失败”）。 */
function refreshIdleStatus(): void {
  if (accessToken) return
  const meta = loadMeta()
  if (meta.linked && typeof navigator !== 'undefined' && !navigator.onLine) {
    setInfo({ status: 'offline-local' })
  } else {
    setInfo({ status: 'logged-out' })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', refreshIdleStatus)
  window.addEventListener('offline', refreshIdleStatus)
}

// ---- token（只放内存） ----

let accessToken: string | null = null
let tokenClient: GisTokenClient | null = null
let pendingToken: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
let gisLoadPromise: Promise<void> | null = null
let pendingState: GameState | null = null
let uploadTimer: number | null = null

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisLoadPromise) return gisLoadPromise
  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GSI_SCRIPT_URL
    s.async = true
    s.defer = true
    s.onload = () => {
      if (window.google?.accounts?.oauth2) resolve()
      else reject(new Error('Google 登录组件加载失败'))
    }
    s.onerror = () => reject(new Error('Google 登录组件加载失败'))
    document.head.appendChild(s)
  })
  gisLoadPromise.catch(() => {
    gisLoadPromise = null
  })
  return gisLoadPromise
}

/** prompt: 'none' 静默（有已授权会话时不弹窗）；'consent' 弹授权窗。 */
async function requestToken(prompt: 'none' | 'consent'): Promise<string> {
  await loadGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google 登录组件不可用')
  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        const p = pendingToken
        pendingToken = null
        if (!p) return
        if (resp.access_token) {
          accessToken = resp.access_token
          p.resolve(resp.access_token)
        } else {
          p.reject(new Error(resp.error_description || resp.error || 'Google 授权失败'))
        }
      },
    })
  }
  if (pendingToken) throw new Error('正在请求授权，请稍候')
  return new Promise<string>((resolve, reject) => {
    pendingToken = { resolve, reject }
    try {
      tokenClient?.requestAccessToken({ prompt })
    } catch {
      pendingToken = null
      reject(new Error('Google 授权请求失败'))
    }
  })
}

// ---- Drive API（直接 fetch，不引 SDK） ----

async function authedFetch(input: string, init: RequestInit): Promise<Response> {
  if (!accessToken) throw new Error('未登录 Google Drive')
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${accessToken}`,
  }
  let res = await fetch(input, { ...init, headers })
  if (res.status === 401) {
    // token 过期：静默重新拿一次，再试一次；拿不到就报登录过期
    accessToken = null
    try {
      await requestToken('none')
    } catch {
      throw new Error('Google 登录已过期，请重新登录')
    }
    res = await fetch(input, {
      ...init,
      headers: { ...headers, Authorization: `Bearer ${accessToken}` },
    })
  }
  return res
}

async function findSaveFile(): Promise<string | null> {
  const q = `name = '${SAVE_FILE_NAME}' and 'appDataFolder' in parents and trashed = false`
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    `&spaces=appDataFolder&fields=${encodeURIComponent('files(id)')}&pageSize=10`
  const res = await authedFetch(url, {})
  if (!res.ok) throw new Error('读取 Drive 失败')
  const data = (await res.json()) as { files?: Array<{ id: string }> }
  return data.files?.[0]?.id ?? null
}

async function downloadEnvelope(fileId: string): Promise<DriveEnvelope | null> {
  const res = await authedFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {})
  if (!res.ok) throw new Error('下载存档失败')
  let parsed: unknown
  try {
    parsed = JSON.parse(await res.text())
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const env = parsed as Partial<DriveEnvelope>
  if (typeof env.savedAt !== 'number' || !env.state) return null
  // 校验失败绝不覆盖本地
  const checked = parseImported(JSON.stringify(env.state))
  if (!checked) return null
  return { savedAt: env.savedAt, state: checked }
}

async function uploadEnvelope(state: GameState, savedAt: number, fileId: string | null): Promise<string> {
  const body = JSON.stringify({ savedAt, state } satisfies DriveEnvelope)
  if (fileId) {
    const res = await authedFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
    )
    if (res.status === 404) {
      // 云端文件被删过：改走新建
    } else {
      if (!res.ok) throw new Error('上传存档失败')
      const data = (await res.json()) as { id?: string }
      return data.id ?? fileId
    }
  }
  const boundary = `xiao-gou-kuaipao-${Date.now().toString(36)}`
  const metadata = JSON.stringify({
    name: SAVE_FILE_NAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  })
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
  const res = await authedFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  })
  if (!res.ok) throw new Error('上传存档失败')
  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new Error('上传存档失败')
  return data.id
}

// ---- 同步执行（串行，避免并发上传互相覆盖） ----

let queue: Promise<unknown> = Promise.resolve()

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const task = queue.then(fn, fn)
  queue = task.then(
    () => undefined,
    () => undefined,
  )
  return task
}

async function doSync(state: GameState, interactive: boolean): Promise<SyncResult> {
  setInfo({ status: 'syncing' })
  try {
    if (!accessToken) {
      try {
        await requestToken('none')
      } catch {
        if (!interactive) throw new Error('未登录 Google Drive')
        await requestToken('consent')
      }
    }
    const meta = loadMeta()
    const fileId = meta.fileId ?? (await findSaveFile())
    if (!fileId) {
      // 云端还没有：把本地传上去
      const now = Date.now()
      const id = await uploadEnvelope(state, now, null)
      saveMeta({ ...loadMeta(), linked: true, savedAt: now, fileId: id, lastSyncAt: now })
      setInfo({ status: 'synced', lastSyncAt: now })
      return { action: 'uploaded' }
    }
    const remote = await downloadEnvelope(fileId)
    if (!remote) {
      // 云端文件损坏或校验失败：绝不覆盖本地
      setInfo({ status: 'failed' })
      return { action: 'failed' }
    }
    const localSavedAt = meta.savedAt
    if (remote.savedAt > localSavedAt) {
      const now = Date.now()
      saveMeta({ ...loadMeta(), linked: true, savedAt: remote.savedAt, fileId, lastSyncAt: now })
      setInfo({ status: 'synced', lastSyncAt: now })
      return { action: 'downloaded', state: remote.state, savedAt: remote.savedAt }
    }
    if (localSavedAt > remote.savedAt) {
      const now = Date.now()
      const id = await uploadEnvelope(state, now, fileId)
      saveMeta({ ...loadMeta(), linked: true, savedAt: now, fileId: id, lastSyncAt: now })
      setInfo({ status: 'synced', lastSyncAt: now })
      return { action: 'uploaded' }
    }
    const now = Date.now()
    saveMeta({ ...loadMeta(), linked: true, fileId, lastSyncAt: now })
    setInfo({ status: 'synced', lastSyncAt: now })
    return { action: 'up-to-date' }
  } catch {
    setInfo({ status: 'failed' })
    return { action: 'failed' }
  }
}

async function doAutoUpload(): Promise<void> {
  if (!pendingState) return
  const state = pendingState
  pendingState = null
  if (!accessToken) {
    // 没登录（比如刚打开页面）：静默拿不到就等用户手动登录，首次同步会处理
    try {
      await requestToken('none')
    } catch {
      return
    }
  }
  setInfo({ status: 'syncing' })
  try {
    const meta = loadMeta()
    const fileId = meta.fileId ?? (await findSaveFile())
    const savedAt = meta.savedAt || Date.now()
    const id = await uploadEnvelope(state, savedAt, fileId)
    const now = Date.now()
    saveMeta({ ...loadMeta(), linked: true, savedAt, fileId: id, lastSyncAt: now })
    setInfo({ status: 'synced', lastSyncAt: now })
  } catch {
    // 自动上传失败只记状态，不弹窗、不丢本地数据
    setInfo({ status: 'failed' })
  }
}

// ---- 对外接口 ----

/** 点“登录”：弹 Google 授权窗，同意后做一次完整同步。 */
export async function loginDrive(state: GameState): Promise<SyncResult> {
  setInfo({ status: 'syncing' })
  try {
    await requestToken('consent')
  } catch {
    setInfo({ status: 'failed' })
    return { action: 'failed' }
  }
  return runExclusive(() => doSync(state, false))
}

/** 点“立即同步”：先静默拿 token，拿不到再弹授权窗。 */
export async function syncNow(state: GameState): Promise<SyncResult> {
  return runExclusive(() => doSync(state, true))
}

/** 打开页面时后台静默同步一次；失败不打扰，只回到未登录状态。 */
export async function silentSyncOnLoad(state: GameState): Promise<SyncResult> {
  const r = await runExclusive(() => doSync(state, false))
  if (r.action === 'failed') refreshIdleStatus()
  return r
}

/** 退出登录：吊销 token、清内存、断开关联；本机数据不动。 */
export function logoutDrive(): void {
  if (accessToken) {
    try {
      window.google?.accounts.oauth2.revoke(accessToken)
    } catch {
      // 吊销失败也不影响退出
    }
  }
  accessToken = null
  pendingState = null
  if (uploadTimer !== null) {
    window.clearTimeout(uploadTimer)
    uploadTimer = null
  }
  saveMeta({ ...loadMeta(), linked: false })
  refreshIdleStatus()
}

/**
 * 本地存档变了：记下变化时间，防抖 5 秒后自动上传。
 * 首屏挂载那次不要调（App 里用 ref 跳过），否则会把“本地没动过”误判成最新。
 */
export function noteLocalChange(state: GameState): void {
  saveMeta({ ...loadMeta(), savedAt: Date.now() })
  if (!loadMeta().linked || typeof navigator !== 'undefined' && !navigator.onLine) return
  pendingState = state
  if (uploadTimer !== null) window.clearTimeout(uploadTimer)
  uploadTimer = window.setTimeout(() => {
    uploadTimer = null
    void runExclusive(() => doAutoUpload())
  }, AUTO_UPLOAD_DELAY_MS)
}

/** App 刚用云端存档替换了本地：记下云端时间，并取消待上传的旧本地数据。 */
export function noteRemoteApplied(savedAt: number): void {
  saveMeta({ ...loadMeta(), savedAt })
  pendingState = null
  if (uploadTimer !== null) {
    window.clearTimeout(uploadTimer)
    uploadTimer = null
  }
}
