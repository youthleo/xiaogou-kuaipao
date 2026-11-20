# 小狗快跑 🐶 — 个人自玩版 LBS 跑步圈地

React + Vite + TypeScript + Tailwind CSS 4 + Leaflet + @turf/turf，前端本地计算、无付费 Key、数据只存本机 localStorage。

## 玩法
- **真跑圈地**：点「开始跑步」，GPS 高精度（`watchPosition`）+ 屏幕防休眠（`wakeLock`），跑满 200 米后回到起点 35 米内即形成闭环，结束自动闭合为平滑多边形（荧光黄 #E5FF00 半透明），与已有领地重叠部分用 `turf.difference` 自动裁切。
- **模拟测试**：地图右上角开关，开启后手指点地图生成路径点，第一下自动开跑，点「完成模拟跑」即可测试圈地 / 抢地。
- **AI 幽灵对手**：夜跑幽灵（5'30"/km）、晨光猎手（6'15"/km）、配速狂魔（4'45"/km）。圈地后点「推进一天 / 模拟对手行动」，AI 用 `turf.buffer` 生成横穿带、`turf.intersect` 抢走一块地，顶部弹红色战报；跑穿 AI 的地可夺回，整块清掉计击败 +1。
- **数据**：跑步记录、领地、AI 数据自动存 localStorage；「我的护照」里可导出 JSON 备份 / 导入恢复 / 清空。
- **跑步护照海报**：「我的护照」里的暗黑金卡，含领地缩略图、累计占领面积、最长单次圈地、称号徽章；点「生成战报海报」用 html2canvas 渲染为 1080px 高清 PNG，手机长按可存相册发朋友圈（海报节点用行内样式，避开 Tailwind v4 的 oklch 颜色导致 html2canvas 报错）。
- **轨迹回放**：「战报记录」里点任意一条跑步的「轨迹回放（10 倍速）」，地图自动缩放到整条轨迹，小狗沿线重跑，路线逐步重绘、领地逐步扩张，可暂停 / 从头播 / 关闭；原用时 /10，夹在 3~30 秒。
- **PWA 安装**：manifest 含 192 / 512 PNG 图标 + 512 maskable 图标，`display: standalone`，Service Worker 预缓存应用壳 + Carto 瓦片缓存 7 天；手机 Safari / Chrome 打开后「添加到主屏幕」，再打开即全屏、无地址栏，离线也能开。

## 启动
```bash
npm install
npm run dev      # http://localhost:5173，手机与电脑同一 Wi-Fi 时用电脑局域网 IP:5173 打开
npm run build    # 构建 + PWA（Service Worker / manifest）
npm run preview  # 预览构建产物
```

## 注意
- 地图底图：CartoDB Dark Matter（`basemaps.cartocdn.com/dark_all`），免 Key。
- 真跑需在手机浏览器打开并允许位置权限，HTTPS 或 localhost 下 GPS / wakeLock 才可用；局域网 IP 打开时浏览器可能要求 HTTPS，如遇定位被拒请用 `npm run preview` 后走本机代理或直接用 localhost 测试模拟模式。
- 默认中心：无锡（31.615408, 120.249437）。
