# Stacey Reply Replay

TypeScript 單頁 web app，定位為 Stacey Burke / Sniper 風格的 Day 3 chart reply / replay 工具，不是靜態 K 線檢視器。

## Confirmed features

- 固定資料夾掃描：`staceyreply/dist/mnt/data`
- 啟動後自動讀取固定資料夾中的 CSV/JSON 歷史資料，不提供上傳/拖曳 UI
- 內建 `sample mode` dataset，可直接進入完整 replay 範例
- 自動匯入標準 OHLC CSV/JSON，支援 CSV BOM 移除、comma/tab 分隔、`time/date/datetime/timestamp` 時間欄位別名，以及可省略的 `volume/vol`
- 自動匯入 MT fixed EST（UTC-5、no DST）tabular CSV，保留原始檔內容不改寫，只在 app 內建立 normalized strategy time
- 策略 session/day bucket 一律使用 `America/New_York`
- 當來源資料為 MT fixed EST 且紐約進入夏令時間時，內部 normalized strategy time 會自動調整 1 小時，讓 session 對齊紐約交易時段
- 1m / 5m / 15m / 1h / 4h / 1D timeframe 切換
- 高週期一律由 1m 原始資料聚合
- dataset-level 掃描候選 Day 3 日期，輸出 FGD / FRD / invalid 分類與摘要原因
- Candidate Day 3 selector 會清楚列出偵測到的日期；非 auto replay 時只顯示 `needs-practice` 候選日
- FGD / FRD Day 3 規則驗證與 replay analysis
- dataset validation 與三處同步錯誤顯示（狀態列 / Explain Panel / Diagnostics）
- Pause / Auto Replay / Semi Replay
- Auto Reply / Manual Reply 交易模式切換，顯示 current position、last trade result、cumulative PnL
- Manual Reply 明確提供 Enter Long / Enter Short / Exit / Reset Trade，且 entry gate 直接綁定 `analysis.lastReplyEval`
- Auto Reply 會依策略事件自動建立 entry/exit，並以共用 PnL 計算器更新 realized / cumulative PnL
- Explain Panel 提供 timeline + current reasoning + missing conditions + rule trace
- TP30 / TP35 / TP40 / TP50 目標梯級會顯示 unlocked / hit / blocked 狀態，並列出下一個 upgrade gate
- 不串 broker API，只讀本機固定資料夾歷史數據
- README、sample mode、acceptance checklist generator 持續維護

## Planned / pending

- 上傳單一檔案或資料夾的 UI 流程
- 圖表 x 軸直接顯示日期 / 時間刻度
- 類 TradingView 的滑鼠滾輪縮放
- 類 TradingView 的拖曳 / 平移
- candlestick 厚度 / 間距對 TradingView 體驗做精細調校
- replay 起點改為「所選 FRD/FGD 日期的前一天」
- 更完整的擴充說明文件（若未來仍需要）

## Startup

```bash
npm install
npm run dev
```

然後打開 Vite 顯示的本機網址。

## Fixed-folder data flow

1. 專案啟動時以 `import.meta.glob` 掃描 `dist/mnt/data/*.{csv,json}`。
2. parser 會把標準 OHLC CSV/JSON 轉成 1m bars，也會自動辨識 MT fixed EST（`YYYY.MM.DD<TAB>HH:mm<TAB>open<TAB>high<TAB>low<TAB>close<TAB>volume`）格式。
3. 匯入時不修改原始 CSV/JSON 檔案；對 MT fixed EST 資料只在記憶體內建立 `source/raw time` 與 `normalized strategy time` 兩套時間欄位。
4. `source/raw time` 的語義是 MT fixed EST / UTC-5 / no DST；`normalized strategy time` 的語義是 `America/New_York`，供 strategy、session、day bucket 與 replay UI 使用。
5. 若來源時間落在紐約夏令時間期間，normalized strategy time 會比 source/raw time 快 1 小時，以對齊紐約交易時段；若非 DST 期間則兩者維持同一小時。
6. strategy 先做 dataset-level 掃描，遍歷每個可形成 Day 3 的日期，輸出候選日期、FGD/FRD/invalid 分類與摘要原因。
7. UI 先提供 dataset selector，再提供該 dataset 內的候選日期 selector / 清單。
8. 非 auto replay 狀態下，候選日期列表只顯示 `needs-practice` 的候選日；auto replay 則顯示完整掃描結果。
9. 選定某個候選日期後，strategy 才執行 selected trade day 分析並建立 replay / explain panel 所需資料。

## Dataset switching

- 左上 `Dataset` 下拉選單切換商品 / 檔案
- `Candidate Day 3` 會列出該 dataset 掃描出的候選日期，而不是把整個檔案直接當成單一 trade day
- `sample mode` 為內建完整案例
- 固定資料夾中的檔案也會出現在同一個 selector

## Timeframe switching

- `Timeframe` 可切換 1m / 5m / 15m / 1h / 4h / 1D
- 高週期一律由 1m 原始資料聚合
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

## Explain Panel 怎麼看

- **Current Classification**：目前模板、bias、stage、可否回覆/進場，以及當前採用的時間語義
- **Historical Reasoning Timeline**：累積已發生事件與敘事
- **Missing Conditions**：現在缺哪個 gate、為什麼還不能進
- **Rule Trace**：規則名、價格、時間、timeframe、pass/fail 原因，以及 session/day bucket 採用哪種時間語義
- **Diagnostics**：debug / gate state / lastReplyEval / replay bar source vs normalized time / DST adjustment 狀態

## Error messages

當資料不足時，會明確顯示例如：

- `Invalid dataset: missing pump day context`
- `Invalid dataset: missing dump day context`
- `Invalid dataset: insufficient Day 3 intraday candles`
- `Invalid dataset: previous close unavailable`
- `Invalid dataset: unable to validate FRD/FGD template`

這些訊息會同步出現在：

- 圖表上方狀態列
- 右側 Explain Panel
- 下方 Diagnostics

## Accepted parser formats

- CSV 支援 UTF-8 BOM 自動移除。
- CSV 支援逗號或 tab 分隔。
- CSV/JSON 必要欄位：
  - 時間欄位可接受：`time` / `date` / `datetime` / `timestamp`
  - 價格欄位需為：`open` / `high` / `low` / `close`
  - 成交量欄位可省略；可接受：`volume` / `vol`
- 若 `volume` / `vol` 缺席，系統會以 `0` 補入，不阻擋載入。
- 若是 MT fixed EST 表格式資料，仍接受 `YYYY.MM.DD<TAB>HH:mm<TAB>open<TAB>high<TAB>low<TAB>close<TAB>volume`。

## Parser diagnostics

若 dataset 無法載入，dataset 不會直接從 UI 消失；Diagnostics 會保留並顯示失敗原因，例如：

- `CSV is empty.`
- `CSV header is missing required columns: time, open, high, low, close.`
- `Row N: open/high/low/close must be numeric.`
- `JSON parse failed: ...`
- `JSON root must be an array of OHLC objects.`
- `Item N: missing time/date/datetime/timestamp field.`

Diagnostics 也會同步列出：

- 偵測到的分隔符（comma / tab）
- 允許的 header / key 別名
- volume 是否由來源載入，或因為省略而預設為 `0`

## Sample mode

- 直接選 `SAMPLE-REPLAY (sample mode)`
- 內建案例包含 dump/pump 背景、signal day、source、stop hunt、123、20EMA、entry、TP 命中
- 適合驗證 replay/backtest 流程與 explain panel 內容

## Removed/Deprecated Log

- 已移除本機 CSV / JSON upload UI
- 已移除 drag-and-drop upload 流程
- 已移除以 backend upload metadata 為中心的舊 replay 輸入模式
- 現在只保留固定資料夾掃描 + sample mode 單一路徑
