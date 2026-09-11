# 使用微軟官方 Playwright 映像檔（已預先安裝 Linux 必要底層套件與 Chromium 瀏覽器）
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# 複製相依性清單
COPY package*.json ./

# 安裝生產環境套件
RUN npm install --omit=dev

# 複製專案程式碼
COPY . .

# 預設 PORT
ENV PORT=3000
EXPOSE 3000

# 啟動應用程式
CMD ["node", "server.js"]
