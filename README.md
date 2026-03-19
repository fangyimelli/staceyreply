# Stacey Reply Replay

TypeScript 單頁 web app，定位為 Stacey Burke / Sniper 風格的 Day 3 chart reply / replay 工具，不是靜態 K 線檢視器。

## Confirmed features

- 固定資料夾掃描：`staceyreply/dist/mnt/data`
- 啟動後自動讀取 CSV/JSON 歷史資料，不提供上傳/拖曳 UI
- 自動匯入 MT fixed EST（UTC-5、no DST）tabular CSV，保留原始檔內容不改寫，只在 app 內建立 normalized strategy time
- 策略 session/day bucket 一律使用 `America/New_York`
- 當來源資料為 MT fixed EST 且紐約進入夏令時間時，內部 normalized strategy time 會自動調整 1 小時，讓 session 對齊紐約交易時段
- 1m / 5m / 15m / 1h / 4h / 1D timeframe 切換
- FGD / FRD Day 3 規則驗證
- dataset validation 與三處同步錯誤顯示（狀態列 / Explain Panel / Diagnostics）
- Pause / Auto Replay / Semi Replay
- Explain Panel 提供 timeline + current reasoning + missing conditions + rule trace
- TP30 / TP35 / TP40 / TP50 目標梯級會顯示 unlocked / hit / blocked 狀態，並列出下一個 upgrade gate
- Sample mode 直接展示完整 replay 流程
- 不串 broker API，只讀本機固定資料夾歷史數據

## Startup

```bash
npm install
npm run dev
```

然後打開 Vite 顯示的本機網址。

## Fixed-folder data flow

1. 專案啟動時以 `import.meta.glob` 掃描 `dist/mnt/data/*.{csv,json}`。
2. 每個檔案都被視為已預篩的 FRD/FGD 候選資料來源。
3. UI 只提供 dataset selector，不提供任何 upload / drag-and-drop 流程。
4. parser 會把標準 OHLC CSV/JSON 轉成 1m bars，也會自動辨識 MT fixed EST（`YYYY.MM.DD<TAB>HH:mm<TAB>open<TAB>high<TAB>low<TAB>close<TAB>volume`）格式。
5. 匯入時不修改原始 CSV/JSON 檔案；對 MT fixed EST 資料只在記憶體內建立 `source/raw time` 與 `normalized strategy time` 兩套時間欄位。
6. `source/raw time` 的語義是 MT fixed EST / UTC-5 / no DST；`normalized strategy time` 的語義是 `America/New_York`，供 strategy、session、day bucket 與 replay UI 使用。
7. 若來源時間落在紐約夏令時間期間，normalized strategy time 會比 source/raw time 快 1 小時，以對齊紐約交易時段；若非 DST 期間則兩者維持同一小時。
8. strategy / validation 仍會重新檢查資料是否真的足夠形成 Day 3 模板。

## Dataset switching

- 左上 `Dataset` 下拉選單切換商品 / 檔案
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
