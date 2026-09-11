# 🧵 Threads 貼文數據查詢與監控工具 (Threads Web Tool)

一個輕量、美觀且實用的本機/雲端 Web 工具，專門用來批次爬取並分析 **Threads 貼文的公開數據與互動成效**。

---

## ✨ 核心特色

- 📊 **完整指標抓取**：瀏覽次數 (Views)、按讚數 (Likes)、回覆數 (Replies)、轉發數 (Reposts)。
- 📅 **貼文時間解析**：自動提取發布時間與日期 (`MM/DD`)。
- 📋 **一鍵複製為 PPT / Excel 表格**：
  - 欄位包含：`日期 (MM/DD)`、`內文第一句話`、`瀏覽`、`按讚`、`留言`、`轉發`。
  - 內文第一句話自帶原貼文超連結，貼入 PowerPoint 或 Excel 即為可點擊的表格。
- 🚀 **批次處理**：支援一次輸入多組 Threads 貼文網址同步分析。
- 🐳 **雲端一鍵部署**：已預先設定好 Dockerfile（基於微軟官方 Playwright 映像檔），可無縫部署至 Render 等雲端平台。

---

## 🛠️ 本地啟動方式

1. 安裝套件：
   ```bash
   npm install
   npx playwright install chromium
   ```

2. 啟動伺服器：
   ```bash
   npm start
   ```

3. 開啟瀏覽器訪問：
   `http://localhost:3000`

---

## ☁️ 部署至 Render

本專案內建 `Dockerfile`，直接在 Render 建立 Web Service 並連結 GitHub 儲存庫即可自動建置完成！
