# Stacey Reply Replay

TypeScript 單頁 web app，定位為 Stacey Burke / Sniper 風格的 Day 3 chart reply / replay 工具，不是靜態 K 線檢視器。

## Confirmed features

- 固定使用 `data/` 原始 CSV 作為資料入口，流程為 raw CSV → 預處理 → structured replay dataset → app 自動載入
- 啟動後先掃描可用 pair / replay dataset，再做 FRD / FGD 候選日期篩選
- Pair 為主要資料切換單位；trade day 選擇建立在 pair 掃描結果之上
- 自動匯入標準 OHLC CSV/JSON，支援 CSV BOM 移除、comma/tab 分隔、`time/date/datetime/timestamp` 時間欄位別名，以及可省略的 `volume/vol`
- 無 offset 的時間字串會依固定規則解析為 `America/New_York` wall-clock，再正規化成帶 offset 的可重現 strategy timestamp
- 自動匯入 MT fixed EST（UTC-5、no DST）tabular CSV，保留原始檔內容不改寫，只在 app 內建立 normalized strategy time
- 策略 session/day bucket 一律使用 `America/New_York`
- 當來源資料為 MT fixed EST 且紐約進入夏令時間時，內部 normalized strategy time 會自動調整 1 小時，讓 session 對齊紐約交易時段
- 1m / 5m / 15m / 1h / 4h / 1D timeframe 切換
- 高週期一律由 1m 原始資料聚合
- pair-level 掃描候選 Day 3 日期，輸出 FGD / FRD / invalid 分類與摘要原因
- Candidate Day 3 selector 會清楚列出偵測到的日期；`Manual Reply` 或啟用 `needs-practice` 篩選時只顯示 `needs-practice` 候選日，否則顯示完整掃描結果
- replay dataset 會保留以前後各 2 天為目標的事件視窗；若資料不足則使用可得區間
- FGD / FRD Day 3 規則驗證與 replay analysis
- dataset validation 與三處同步錯誤顯示（狀態列 / Explain Panel / Diagnostics）
- Pause / Auto Replay / Semi Replay
- Replay mode（Pause / Auto Replay / Semi Replay）與 Reply mode（Auto Reply / Manual Reply）分離，避免把播放方式與交易/練習模式混用
- Auto Reply / Manual Reply 交易模式切換，顯示 current position、last trade result、cumulative PnL
- Candidate list filter 可獨立切換 `Show all scanned days` / `Show needs-practice only`，不再綁定 replay 播放模式
- Manual Reply 明確提供 Enter Long / Enter Short / Exit / Reset Trade，且 entry gate 直接綁定 `analysis.lastReplyEval`
- Manual Reply 的 entry 語義已統一：可明確選擇使用 strategy-confirmed `analysis.entryPrice`、user-specified execution price、或 current bar close；Explain Panel / Trade ledger / Diagnostics 會分開顯示 strategy entry 與 manual execution price，並讓 target ladder / stop distance / cumulative PnL 對齊同一組 entry basis
- Auto Reply 會依策略事件自動建立 entry/exit，並以共用 PnL 計算器更新 realized / cumulative PnL
- Explain Panel 提供 timeline + current reasoning + missing conditions + rule trace
- 新增 Debug Page，集中顯示策略流程參數、stage health、target state 與 needs-debug 清單
- TP30 / TP35 / TP40 / TP50 目標梯級會顯示 unlocked / hit / blocked 狀態，並列出下一個 upgrade gate
- Sample mode 保留作為文件與驗證敘述中的確認案例
- 圖表 X 軸顯示 normalized New York 時間字串，tooltip 同時保留 source/raw time 供對照
- 圖表有 viewport state，預設追蹤右側最新已揭露 bars，支援滑鼠滾輪縮放與拖曳平移
- 不串 broker API，只讀本機 `data/` / sample 歷史數據
- README、sample mode、acceptance checklist generator 持續維護

## Planned / pending

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

## Data source flow

1. 原始資料固定來自 `data/` 目錄中的 CSV。
2. 啟動流程先對 `data/` 內容做預處理，將 raw CSV 轉成可重現的 structured replay dataset。
3. parser 會把標準 OHLC CSV/JSON 轉成 1m bars，也會自動辨識 MT fixed EST（`YYYY.MM.DD<TAB>HH:mm<TAB>open<TAB>high<TAB>low<TAB>close<TAB>volume`）格式。
4. 預處理與載入流程不改寫原始 CSV；對 MT fixed EST 資料只在記憶體內建立 `source/raw time` 與 `normalized strategy time` 兩套時間欄位。
5. `source/raw time` 的語義會明確區分為三類：ISO with offset、MT fixed EST（UTC-5 / no DST）、以及 unqualified local text。
6. `normalized strategy time` 一律正規化成可重現的 `America/New_York` offset timestamp，供 strategy、session、day bucket 與 replay UI 使用。
7. 若來源時間落在紐約夏令時間期間，MT fixed EST 的 normalized strategy time 會比 source/raw time 快 1 小時，以對齊紐約交易時段；若非 DST 期間則兩者維持同一小時。
8. strategy 先做 pair-level 掃描，遍歷每個可形成 Day 3 的日期，輸出候選日期、FGD/FRD/invalid 分類與摘要原因。
9. 系統依掃描結果建立 pair 清單與對應的 structured replay dataset，UI 只提供 pair selector 與候選日期 selector。
10. replay dataset 會以選定 trade day 為中心，盡量保留前 2 天與後 2 天事件視窗，讓 source / stop hunt / entry / management 可連續回放。
11. 非 auto replay 狀態下，候選日期列表只顯示 `needs-practice` 的候選日；auto replay 則顯示完整掃描結果。
12. 選定某個候選日期後，strategy 才執行 selected trade day 分析並建立 replay / explain panel 所需資料。

## Dataset switching

- UI 以 `Pair` 作為主要切換器，而不是檔案或資料夾
- 每個 pair 都來自固定 `data/` 流程預處理後的 structured replay dataset
- `Candidate Day 3` 只列出該 pair 掃描出的候選日期，不把原始檔直接視為單一 trade day
- `sample mode` 僅作為確認案例敘述；正式資料流以固定 `data/` pair 掃描與自動載入為主

## Timeframe switching

- `Timeframe` 可切換 1m / 5m / 15m / 1h / 4h / 1D
- 高週期一律由 1m 原始資料聚合
- 顯示與 session 邏輯使用 `America/New_York`
- 若來源為 MT fixed EST，UI 會同時保留 source/raw time 供對照，並以 normalized strategy time 作為主要策略時間

## Chart navigation

- 主圖 X 軸直接顯示 normalized New York 時間字串，而不是 index label
- tooltip 會保留 normalized time 與 source/raw time，方便檢查 DST 調整前後差異
- chart viewport 由 React state 管理，會隨 replay 新增 bars 自動追蹤右側最新區段；若使用者已平移離開右側，則保留目前視窗大小與位置
- 滑鼠滾輪可縮放可見區間長度
- 滑鼠左鍵拖曳可平移可見區間

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

## Debug Page 怎麼看

- **Current Context**：當前 pair、trade day、reply gate、PnL、當前 replay bar 時間與索引
- **Strategy Parameters**：previous close、HOS/LOS/HOD/LOD、source/stop/entry、recommended target、quality
- **Pipeline Stage Health**：每個策略 stage 的 pass / warn / fail 狀態與最新說明
- **Needs Debug**：集中列出 invalid reasons、missing conditions、target missing gate、失敗 rule trace
- **Event Timeline Debug Table**：逐筆檢查 event log 的 visible index、title、detail、trace 結果
- **Parse / Dataset Diagnostics**：保留 parse diagnostics、candidate 數量、visible events、failed traces

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
- dataset 採用哪一種時間語義，以及 unqualified local text 是否已正規化為 `America/New_York` offset timestamp

## Sample mode

- sample mode 保留作為確認案例與文件驗證敘述
- 內建案例包含 dump/pump 背景、signal day、source、stop hunt、123、20EMA、entry、TP 命中
- 適合驗證 replay/backtest 流程與 explain panel 內容

## Removed/Deprecated Log

- 已移除以手動資料選取為中心的舊 replay 輸入描述
- 不再描述任何已淘汰的手動資料選取流程
- dataset flow 以固定 `data/` 原始 CSV → 預處理 → pair 選擇 → 自動載入為準
