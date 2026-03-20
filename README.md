# Stacey Reply Replay

TypeScript 單頁 web app，定位為 Stacey Burke / Sniper 風格的 Day 3 chart reply / replay 工具，不是靜態 K 線檢視器。

## Confirmed features

- 正式 pair universe 固定為 `EURUSD` / `USDCAD` / `GBPUSD` / `AUDUSD`；正式模式只接受這 4 個 pair，並從 `dist/mnt/data/*.csv` 對應檔案預處理
- 提供明確的預處理入口 `npm run preprocess:data`，從 `data/` 讀 raw CSV、轉成標準 1m bars，並為每個候選事件預先輸出 5m / 15m / 1h / 4h / 1D bars 到單一 event replay dataset 產物
- app 啟動時只讀 `public/preprocessed/manifest.json`，選 pair 時只讀對應 `index.json`，選中候選事件後才讀單一 event dataset，不再依賴瀏覽器任意檔案 / JSON 匯入主流程
- `index.json` 僅保留候選事件摘要欄位：`eventId`、`candidateDate`、`template`、`shortSummary`、`practiceStatus`、`datasetPath`；完整 `bars` / annotations / trace 只存在單一 event dataset 檔案
- parser 主責任為讀取 raw CSV 並正規化為 strategy 可用的標準 1m bars
- CSV 支援 BOM 移除、comma/tab 分隔、`time/date/datetime/timestamp` 時間欄位別名，以及可省略的 `volume/vol`
- 自動辨識 MT fixed EST（UTC-5、no DST）tabular CSV，保留原始檔內容不改寫，只在預處理結果內建立 normalized strategy time
- 無 offset 的時間字串會依固定規則解析為 `America/New_York` wall-clock，再正規化成帶 offset 的可重現 strategy timestamp
- 策略 session/day bucket 一律使用 `America/New_York`
- 1m / 5m / 15m / 1h / 4h / 1D timeframe 切換
- 高週期以 1m 原始資料為唯一來源；預處理階段會先為每個候選事件寫入已預算的 5m / 15m / 1h / 4h / 1D bars，前端切換 timeframe 時優先讀取，缺資料時才回退到 runtime aggregation
- pair-level 掃描候選 Day 3 日期，輸出 FGD / FRD / invalid 分類與摘要原因；manifest diagnostics 會明確列出 official pair universe、manifest pair keys、以及 missing official pairs
- Candidate Day 3 selector 會清楚列出偵測到的日期；`Manual Reply` 或啟用 `needs-practice` 篩選時只顯示 `needs-practice` 候選日，否則顯示完整掃描結果
- replay dataset 會保留以前後各 2 天為目標的事件視窗；若資料不足則使用可得區間
- FGD / FRD Day 3 規則驗證與 replay analysis
- FGD / FRD / FRD_INSIDE 已重構為單一 `Unified Signal-Day Scoring Engine`：共用 hard gates、weighted features、0-100 score、score band，以及 `score >= 75` 才允許 strategy entry 的規則
- pair validation 與三處同步錯誤顯示（狀態列 / Explain Panel / Diagnostics）
- Pause / Auto Replay / Semi Replay
- Replay mode（Pause / Auto Replay / Semi Replay）與 Reply mode（Auto Reply / Manual Reply）分離，避免把播放方式與交易/練習模式混用
- Auto Reply / Manual Reply 交易模式切換，顯示 current position、last trade result、cumulative PnL
- Candidate list filter 可獨立切換 `Show all scanned days` / `Show needs-practice only`，不再綁定 replay 播放模式
- Manual Reply 明確提供 Enter Long / Enter Short / Exit / Reset Trade，且 entry gate 直接綁定 `analysis.lastReplyEval`
- Manual Reply 的 entry 語義已統一：可明確選擇使用 strategy `candidateEntryPrice` / `confirmedEntryPrice`、user-specified execution price、或 current bar close；當 hard gate 未通過時 UI 只顯示 candidate entry only / blocked entry basis，不再誤顯示 strategy-confirmed entry；Explain Panel / Trade ledger / Diagnostics 會分開顯示 candidate entry、confirmed entry 與 manual execution price，並讓 target ladder / stop distance / cumulative PnL 對齊同一組 entry basis
- Auto Reply 會依策略事件自動建立 entry/exit，並以共用 PnL 計算器更新 realized / cumulative PnL
- Explain Panel 提供 timeline + current reasoning + missing conditions + rule trace
- Chart / Debug Page 會即時顯示 current score、score band、hard gates、category breakdown、top positive features、missing high-value features、以及 entry blocked 原因
- TP30 / TP35 / TP40 / TP50 目標梯級會依 actual trade mode 或 blocked/hypothetical 狀態顯示；若 entry blocked，不再把 target 標成真實 hit，並會列出下一個 upgrade gate
- sample-1m 若保留，只能屬於 sample/demo 流程，並固定輸出到 `public/preprocessed-sample/`；正式 pair selector 與正式資料載入流程不再 fallback 到 sample-1m
- 圖表 X 軸顯示 normalized New York 時間字串，tooltip 同時保留 source/raw time 供對照
- 圖表有 viewport state，預設追蹤右側最新已揭露 bars，支援滑鼠滾輪縮放與拖曳平移
- 不串 broker API，只讀本機 `data/` 預處理產物
- README、sample mode、acceptance checklist generator 持續維護

## Startup

```bash
npm install
npm run dev
```

`npm run dev` 會先自動執行 `npm run preprocess:data`，再啟動 Vite。

## Data contract

詳細規格請看：[`data/README.md`](data/README.md)

重點如下：

1. 正式原始資料固定來自 `dist/mnt/data/DAT_MT_EURUSD_M1_2025.csv`、`DAT_MT_USDCAD_M1_2025.csv`、`DAT_MT_GBPUSD_M1_2025.csv`、`DAT_MT_AUDUSD_M1_2025.csv`
2. 預處理腳本只處理這 4 個官方 CSV，不再依賴資料夾掃描
3. 輸出 `public/preprocessed/manifest.json`、`public/preprocessed/<pair>/index.json` 與 `public/preprocessed/<pair>/events/<eventId>.json`
4. app 依序 lazy-load 預處理結果，正式模式不會 fallback 到 sample-1m

## Preprocessing flow

```bash
npm run preprocess:data
```

流程：

1. 依 `OFFICIAL_PAIRS` registry 固定處理 `eurusd` / `usdcad` / `gbpusd` / `audusd` 4 個 CSV
2. parser 讀取 raw CSV 並轉成標準 1m bars
3. 寫出 `public/preprocessed/manifest.json`，其中包含 official pair universe / manifest pair keys / missing official pairs / skipped pair folders diagnostics
4. 針對每個 official pair 寫出 `public/preprocessed/<pair-slug>/index.json`
5. 針對每個候選事件寫出 `public/preprocessed/<pair-slug>/events/<eventId>.json`，其中包含 1m 與預先計算的 5m / 15m / 1h / 4h / 1D bars
6. 若缺任何 official pair，preprocessing 會報錯；app 會阻止 official replay，且不會 fallback 到 sample-1m
7. sample mode 若保留，必須維持獨立資料來源，並使用 `public/preprocessed-sample/manifest.json` 與對應 event 輸出，不可混入 official manifest
8. app 再用 manifest → pair index → explicit candidate selection → single event dataset 的順序載入

## Pair switching

- 左上 `Pair` 下拉選單只顯示 `EURUSD` / `USDCAD` / `GBPUSD` / `AUDUSD`
- `Candidate Day 3` 會列出該 pair 掃描出的候選日期，而不是把整個 replay payload 直接當成單一 trade day
- 正式流程不再使用 sample-1m；若未來保留 sample mode，必須使用 `public/preprocessed-sample/` 並與正式 pair selector 分離
- 不再顯示單檔 / 資料夾 / JSON 上傳流程；可用 pair 完全由預處理 manifest 決定，而候選事件由 pair index 驅動；pair 切換本身不會預先把全部 bars 載入

## Timeframe switching

- `Timeframe` 可切換 1m / 5m / 15m / 1h / 4h / 1D
- 高週期以 1m 原始資料為唯一來源；預處理階段會先為每個候選事件寫入已預算的 5m / 15m / 1h / 4h / 1D bars，前端切換 timeframe 時優先讀取，缺資料時才回退到 runtime aggregation
- 顯示與 session 邏輯使用 `America/New_York`
- 若來源為 MT fixed EST，UI 會同時保留 source/raw time 供對照，並以 normalized strategy time 作為主要策略時間

## Replay controls

### Auto Replay

- 從 Day 3 replay 起點自動播放
- 仍會在關鍵事件對應的 stage banner 更新
- 用來驗證整段流程是否能走到 entry / TP / stop / dataset end

### Semi Replay

- 不是每根 K 棒停，而是每個策略 stage 停
- 按 `Continue / Next step` 只跳到下一個 stage stop
- 用來檢查 background → signal → source → stop hunt → 123 → 20EMA → entry → management 的順序

### Pause

- 停止播放並保留目前 `lastReplyEval`

## Error messages

當資料不足時，會明確顯示例如：

- `Invalid dataset: missing pump day context`
- `Invalid dataset: missing dump day context`
- `Invalid dataset: insufficient Day 3 intraday candles`
- `Invalid dataset: previous close unavailable`
- `Invalid dataset: unable to validate FRD/FGD template`
- `Unable to read replay manifest (...). Run npm run preprocess:data first.`

這些訊息會同步出現在：

- 圖表上方狀態列
- 右側 Explain Panel
- 下方 Diagnostics

## Accepted parser formats

- raw source 主路徑只接受 CSV。
- CSV 支援 UTF-8 BOM 自動移除。
- CSV 支援逗號或 tab 分隔。
- CSV 必要欄位：
  - 時間欄位可接受：`time` / `date` / `datetime` / `timestamp`
  - 價格欄位需為：`open` / `high` / `low` / `close`
- 成交量欄位可省略；可接受：`volume` / `vol`
- 若 `volume` / `vol` 缺席，系統會以 `0` 補入，不阻擋預處理。
- 若是 MT fixed EST 表格式資料，仍接受 `YYYY.MM.DD<TAB>HH:mm<TAB>open<TAB>high<TAB>low<TAB>close<TAB>volume`。

## Parser diagnostics

若 dataset 無法預處理，會明確顯示失敗原因，例如：

- `CSV is empty.`
- `CSV header is missing required columns: time, open, high, low, close.`
- `Row N: open/high/low/close must be numeric.`
- `Row N: volume must be numeric when provided.`

Diagnostics 也會同步列出：

- 偵測到的分隔符（comma / tab）
- 允許的 header 別名
- volume 是否由來源載入，或因為省略而預設為 `0`
- dataset 採用哪一種時間語義，以及 unqualified local text 是否已正規化為 `America/New_York` offset timestamp

## Removed / Deprecated log

- 已移除面向瀏覽器任意檔案匯入的主路徑依賴
- 不再依賴 `File`、`file.text()`、`webkitRelativePath`、JSON root array 匯入流程
- 不再顯示單檔 / 資料夾上傳；現在改為 `data/` + 預處理 manifest/index 驅動的 pair 載入
