# `data/` directory contract

這個資料夾現在是**唯一**的原始市場資料入口。App 本身不再接受瀏覽器任意檔案 / JSON 匯入；所有 replay pair 都必須先放進 `data/`，再由預處理腳本轉成 app 啟動時讀取的產物。

## 目錄規則

每個 pair 使用固定結構：

```text
data/
  pairs/
    <pair-slug>/
      raw/
        1m.csv
```

- `<pair-slug>`：pair / symbol 的目錄名稱，建議使用小寫加連字號，例如 `eurusd`, `nas100-cfd`, `sample-1m`。
- `raw/1m.csv`：該 pair 的唯一原始 1 分鐘資料來源。
- 一個 pair 只允許一份主原始檔；如果要替換資料，直接覆蓋同一路徑。

## 檔名契約

- 檔名固定為 `1m.csv`。
- 不接受 `5m.csv`、`data.json`、`history.txt` 這類替代主檔名做主流程輸入。
- 高週期資料一律在 app / strategy pipeline 內由 1m bars 聚合，不另外存放於 `data/`。

## CSV 欄位契約

接受以下 raw CSV 格式：

- 必要欄位：`time|date|datetime|timestamp`、`open`、`high`、`low`、`close`
- 可選欄位：`volume|vol`
- 分隔符：comma 或 tab
- UTF-8 BOM：允許，預處理時會移除
- MT fixed EST 表格式：`YYYY.MM.DD<TAB>HH:mm<TAB>open<TAB>high<TAB>low<TAB>close<TAB>volume`

預處理 parser 會把這些原始列轉成標準 `1m bars`，並補上統一的 `normalizedTime` / `timeSemantics` 供後續 strategy 使用。

## 預處理產物

執行：

```bash
npm run preprocess:data
```

會產生：

```text
public/
  preprocessed/
    manifest.json
    <pair-slug>/
      index.json
      events/
        <eventId>.json
```

- `manifest.json`：app 啟動時先讀取的 pair 清單
- `<pair-slug>/index.json`：該 pair 的候選事件摘要與 event 檔案位址
- `<pair-slug>/events/<eventId>.json`：單一候選事件的完整 replay dataset

## 新增 pair 的流程

1. 建立 `data/pairs/<pair-slug>/raw/`
2. 放入 `1m.csv`
3. 執行 `npm run preprocess:data`
4. 啟動 app（`npm run dev` 或 `npm run build`）

如果沒有先跑預處理，app 會提示 manifest / dataset 缺失，而不是回退到瀏覽器上傳流程。
