# `data/` directory contract

正式模式現在使用**固定官方 pair registry / single official config**，不再把任意 `data/pairs/*` 掃描結果當成正式資料來源。

## Official pair universe

正式 pair 固定為：

- `EURUSD` → `dist/mnt/data/DAT_MT_EURUSD_M1_2025.csv`
- `USDCAD` → `dist/mnt/data/DAT_MT_USDCAD_M1_2025.csv`
- `GBPUSD` → `dist/mnt/data/DAT_MT_GBPUSD_M1_2025.csv`
- `AUDUSD` → `dist/mnt/data/DAT_MT_AUDUSD_M1_2025.csv`

預處理腳本只會處理這 4 個官方 CSV，並輸出：

```text
public/
  preprocessed/
    manifest.json
    eurusd/
      index.json
      events/
    usdcad/
      index.json
      events/
    gbpusd/
      index.json
      events/
    audusd/
      index.json
      events/
```

## CSV contract

接受以下 raw CSV 格式：

- 必要欄位：`time|date|datetime|timestamp`、`open`、`high`、`low`、`close`
- 可選欄位：`volume|vol`
- 分隔符：comma 或 tab
- UTF-8 BOM：允許，預處理時會移除
- MT fixed EST 表格式：`YYYY.MM.DD<TAB>HH:mm<TAB>open<TAB>high<TAB>low<TAB>close<TAB>volume`

預處理 parser 會把原始列轉成標準 `1m bars`，並補上統一的 `normalizedTime` / `timeSemantics` 供後續 strategy 使用。

## Preprocessing behavior

執行：

```bash
npm run preprocess:data
```

會：

1. 依 `OFFICIAL_PAIRS` registry 與 single official config 逐一讀取官方 CSV
2. 產生 `manifest.json`
3. 為每個 official pair 產生 `index.json`
4. 為每個候選事件產生 `events/<eventId>.json`
5. 在 diagnostics 內列出 `process.cwd()`、`repoRoot`、`preprocessingInputRoot`、`manifestOutputPath`、`outputRootExists`、`officialPairUniverse`、`manifestPairKeys`、`missingOfficialPairs`，且若某 pair 的 `index.json` 未成功寫出，必須更新 `missingPairFolders` / `failureReasonPerPair`，並不可把該 pair 放入 `manifestPairKeys` 或 `preprocessingSucceededPairs`
6. `indexPath` 與 `datasetPath` 會固定寫成 `/preprocessed/<pair>/...` 對應的 runtime web path；repo 來源目錄固定為 `public/preprocessed/`
7. official manifest 產出後，會驗證 manifest 內列出的 `index.json` 與 index 內宣告的每個 event JSON 都是 preprocessing 實際寫出的可讀靜態檔；若 pair 沒有 candidate，仍必須保留可讀的空 `index.json`
8. 若缺任何 official pair 或完整性檢查失敗，直接報錯，而不是靜默忽略

## Sample mode

`sample-1m` 若保留，只能用於 sample/demo 模式，且必須輸出到 `public/preprocessed-sample/`；不可混入正式 pair selector、`public/preprocessed/manifest.json` 或正式 event 輸出。

## Hosting requirement

`/preprocessed/**` 必須永遠優先走靜態檔，不可進入 SPA fallback。
