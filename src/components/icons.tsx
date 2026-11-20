// Meta 风格扁平图标：小狗 logo + 三个 Tab 图标 + 海报小图标。
// 全部是内联 SVG，不用 emoji，浅色底上也清晰。

const DOG_INNER = `
  <ellipse cx="13" cy="25" rx="8" ry="13" fill="#C68A3C" transform="rotate(18 13 25)"/>
  <ellipse cx="51" cy="25" rx="8" ry="13" fill="#C68A3C" transform="rotate(-18 51 25)"/>
  <circle cx="32" cy="36" r="19" fill="#F6C453"/>
  <ellipse cx="32" cy="45" rx="10" ry="7" fill="#FFF3D6"/>
  <circle cx="24" cy="33" r="3.2" fill="#1F1F1F"/>
  <circle cx="40" cy="33" r="3.2" fill="#1F1F1F"/>
  <circle cx="25.2" cy="31.8" r="1.1" fill="#FFFFFF"/>
  <circle cx="41.2" cy="31.8" r="1.1" fill="#FFFFFF"/>
  <ellipse cx="32" cy="41" rx="5" ry="3.6" fill="#1F1F1F"/>
  <rect x="29" y="46" width="6" height="9" rx="3" fill="#FF8FA3"/>
  <ellipse cx="19" cy="41" rx="3" ry="2" fill="#FFB3C1" opacity="0.8"/>
  <ellipse cx="45" cy="41" rx="3" ry="2" fill="#FFB3C1" opacity="0.8"/>
`

/** 小狗 logo（圆脸、焦糖垂耳、黑鼻子、粉舌头） */
export function DogIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: DOG_INNER }}
    />
  )
}

/** Leaflet 起点标记用的 HTML：白底圆 + 小狗 SVG */
export function dogMarkerHtml(size = 28): string {
  const s = Math.round(size * 0.86)
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#FFFFFF;border:2px solid #D4D4D4;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25)"><svg viewBox="0 0 64 64" width="${s}" height="${s}">${DOG_INNER}</svg></div>`
}

/** Tab：地图（折叠地图） */
export function MapTabIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M9.5 3.5 3 5.8v14.4l6.5-2.3 5 1.7 6.5-2.3V2.9l-6.5 2.3-5-1.7Z" />
      <path
        d="M9.5 3.5v14.4M14.5 5.2v14.4"
        stroke="#fff"
        strokeWidth="1.3"
        strokeOpacity="0.9"
        fill="none"
      />
    </svg>
  )
}

/** Tab：战报记录（清单） */
export function RecordsTabIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <rect x="8.2" y="7.5" width="7.6" height="1.6" rx="0.8" fill="#fff" />
      <rect x="8.2" y="11.2" width="7.6" height="1.6" rx="0.8" fill="#fff" />
      <rect x="8.2" y="14.9" width="7.6" height="1.6" rx="0.8" fill="#fff" />
      <rect x="8.2" y="18.6" width="4.5" height="1.6" rx="0.8" fill="#fff" />
    </svg>
  )
}

/** Tab：我的护照（证件卡） */
export function PassportTabIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <circle cx="8" cy="11" r="2.4" fill="#fff" />
      <rect x="12" y="9" width="6.5" height="1.6" rx="0.8" fill="#fff" />
      <rect x="12" y="12.2" width="6.5" height="1.6" rx="0.8" fill="#fff" />
      <rect x="5.5" y="15.5" width="13" height="1.4" rx="0.7" fill="#fff" opacity="0.85" />
    </svg>
  )
}

/** 海报等级徽章：奖牌 */
export function MedalIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M9 15.2 7.4 21l3.1-1.5L12 21l1.5-1.5L16.6 21 15 15.2a7 7 0 0 1-6 0Z" />
      <circle cx="12" cy="9.5" r="6.5" />
      <path
        d="M12 6.2l1.1 2.2 2.4.35-1.75 1.7.4 2.4L12 12.7l-2.15 1.15.4-2.4-1.75-1.7 2.4-.35L12 6.2Z"
        fill="#fff"
      />
    </svg>
  )
}

/** 海报：定位针 */
export function PinIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Z" />
      <circle cx="12" cy="9" r="2.6" fill="#fff" />
    </svg>
  )
}

/** 海报：相机 */
export function CameraIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M4 8h3l1.5-2.5h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8Z" />
      <circle cx="12" cy="13.5" r="3.4" fill="#fff" />
      <circle cx="12" cy="13.5" r="1.8" />
    </svg>
  )
}
