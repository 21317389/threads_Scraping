const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const https = require('https');
const fs = require('fs');

// 自動讀取本地 .env (若存在)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (m) {
                const key = m[1];
                let val = (m[2] || '').trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                process.env[key] = val;
            }
        });
    } catch (e) {}
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 遞迴搜尋 JSON 結構中的貼文物件
function findPostObject(obj, code) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.code === code && (obj.like_count !== undefined || obj.text_post_app_info !== undefined)) {
        return obj;
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const result = findPostObject(obj[key], code);
            if (result) return result;
        }
    }
    return null;
}

app.post('/api/scrape', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: '請提供 Threads 貼文網址' });
    }

    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    // 將 .net 轉換成 .com，因 Threads 目前在 .com 底下的公開頁面載入較穩定且不易觸發登入重導向
    let targetUrl = url;
    if (url.includes('threads.net')) {
        targetUrl = url.replace('threads.net', 'threads.com');
    }

    if (!targetUrl.includes('threads.com')) {
        return res.status(400).json({ success: false, error: '請輸入有效的 Threads 貼文網址' });
    }

    // 嘗試提取 Shortcode；若為 /share/ 分享短網址則待頁面跳轉後解析
    let shortcodeMatch = targetUrl.match(/\/post\/([A-Za-z0-9_\-]+)/);
    let shortcode = shortcodeMatch ? shortcodeMatch[1] : '';

    let browser;
    try {
        console.log(`\n---------------- [Scraper Request] ----------------`);
        console.log(`[Scraper Step 1] 收到請求: ${targetUrl} (代碼: ${shortcode || '待轉跳解析'})`);
        console.log(`[Scraper Step 2] 正在啟動 Playwright Chromium 瀏覽器...`);
        
        browser = await chromium.launch({ 
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        
        console.log(`[Scraper Step 3] 瀏覽器啟動成功。正在建立隱私上下文 (Browser Context)...`);
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            locale: 'zh-TW',
            viewport: { width: 1280, height: 800 }
        });

        // 繞過 navigator.webdriver 檢查
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        });

        console.log(`[Scraper Step 4] 上下文建立完成。正在開啟新分頁...`);
        const page = await context.newPage();

        console.log(`[Scraper Step 5] 分頁已開啟。正在載入目標 Threads 網址: ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        console.log(`[Scraper Step 6] 網頁載入完成。等待 4 秒以確保動態渲染完畢...`);
        await page.waitForTimeout(4000);

        // 若為 /share/ 短網址，從轉跳後的實際頁面網址中解析 shortcode
        const currentUrl = page.url();
        if (!shortcode) {
            const redirectMatch = currentUrl.match(/\/post\/([A-Za-z0-9_\-]+)/);
            if (redirectMatch) {
                shortcode = redirectMatch[1];
                console.log(`[Scraper Step 6.5] 成功解析分享短網址跳轉後代碼: ${shortcode}`);
            }
        }

        console.log(`[Scraper Step 7] 開始提取網頁 Metadata JSON 腳本標籤...`);
        const scriptContents = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('script'))
                .map(s => s.innerText)
                .filter(text => text.trim().startsWith('{') && text.trim().endsWith('}'));
        });

        console.log(`[Scraper Step 8] 取得 ${scriptContents.length} 個 JSON 腳本，開始遞迴尋找貼文物件...`);
        let targetPostObj = null;
        for (const rawJson of scriptContents) {
            try {
                const parsed = JSON.parse(rawJson);
                const match = findPostObject(parsed, shortcode);
                if (match) {
                    targetPostObj = match;
                    break;
                }
            } catch (e) {
                // 忽略解析錯誤
            }
        }

        // 初始化基本變數
        let likes = '0';
        let replies = '0';
        let reposts = '0';
        let content = '';
        let username = '';
        let avatarUrl = '';
        let takenAt = null;

        if (targetPostObj) {
            console.log('[Scraper Step 9] 成功在 JSON 中尋找到目標貼文，提取數值中...');
            likes = targetPostObj.like_count !== undefined ? String(targetPostObj.like_count) : '0';
            
            if (targetPostObj.text_post_app_info) {
                const info = targetPostObj.text_post_app_info;
                replies = info.direct_reply_count !== undefined ? String(info.direct_reply_count) : '0';
                reposts = info.repost_count !== undefined ? String(info.repost_count) : '0';
            }
            
            if (targetPostObj.user) {
                username = targetPostObj.user.username || '';
                avatarUrl = targetPostObj.user.profile_pic_url || '';
            }
            
            if (targetPostObj.caption && targetPostObj.caption.text) {
                content = targetPostObj.caption.text;
            }

            if (targetPostObj.taken_at) {
                takenAt = targetPostObj.taken_at;
            }
        } else {
            console.log('[Scraper Step 9] 未能在 JSON 中找到貼文物件，準備啟用 Fallback (備用) 選擇器。');
        }

        // --- 2. Fallback: 如果 JSON 抓取失敗，改用 og 標籤做為備用 ---
        if (!username) {
            const pageTitle = await page.title().catch(() => '');
            const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content').catch(() => '');
            username = ogTitle || pageTitle.split(' on Threads')[0] || 'Threads 用戶';
        }
        if (!content) {
            content = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => '（無內容或抓取失敗）');
        }
        if (!avatarUrl) {
            avatarUrl = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => 'https://www.threads.net/favicon.ico');
        }
        if (!takenAt) {
            const timeDatetime = await page.locator('time[datetime]').first().getAttribute('datetime').catch(() => null);
            if (timeDatetime) {
                const parsedMs = new Date(timeDatetime).getTime();
                if (!isNaN(parsedMs)) {
                    takenAt = Math.floor(parsedMs / 1000);
                }
            }
        }

        // 格式化發文日期為 M/D (例如 8/11) 與完整時間
        let postDate = '';
        let postFullDate = '';
        if (takenAt) {
            const d = new Date(takenAt * 1000);
            if (!isNaN(d.getTime())) {
                const month = d.getMonth() + 1;
                const day = d.getDate();
                postDate = `${month}/${day}`;
                const mm = String(month).padStart(2, '0');
                const dd = String(day).padStart(2, '0');
                const yyyy = d.getFullYear();
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                postFullDate = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
            }
        }

        console.log(`[Scraper Step 10] 開始抓取瀏覽數 (Views)...`);
        let views = '未公開/未抓到';
        
        // 尋找包含特定字眼的文字區塊
        const viewTextLocators = [
            page.locator('text=/\\d+.*(views|view|次瀏覽|次播放|次查看)/i'),
            page.locator('span:has-text("views")'),
            page.locator('span:has-text("次瀏覽")'),
            page.locator('a:has-text("次瀏覽")'),
            page.locator('a:has-text("views")')
        ];

        for (const loc of viewTextLocators) {
            try {
                if (await loc.count() > 0) {
                    const text = await loc.first().innerText();
                    const match = text.match(/(\d+[\d,\.\s]*[kKmM萬億]?)\s*(views|view|次瀏覽|次播放|次查看)/i);
                    if (match) {
                        views = match[1].trim();
                        break;
                    }
                }
            } catch (e) {}
        }
        
        // 如果依然沒抓到，掃描頁面上所有的 Span 標籤
        if (views === '未公開/未抓到') {
            const spans = await page.locator('span').allInnerTexts().catch(() => []);
            for (const text of spans) {
                const match = text.match(/^(\d+[\d,\.\s]*[kKmM萬億]?)\s*(views|view|次瀏覽|次播放|次查看)$/i) || 
                              text.match(/(\d+[\d,\.\s]*[kKmM萬億]?)\s*(views|view|次瀏覽|次播放|次查看)/i);
                if (match) {
                    views = match[1].trim();
                    break;
                }
            }
        }

        const resultData = {
            url,
            username,
            userHandle: `@${username.replace(/\s+/g, '').toLowerCase()}`,
            avatarUrl,
            content,
            likes,
            replies,
            reposts,
            views,
            takenAt,
            postDate,
            postFullDate
        };

        console.log('[Scraper Step 11] 抓取完成，資料封裝成功！');
        res.json({
            success: true,
            data: resultData
        });

    } catch (err) {
        console.error(`[Scraper Error] 伺服器內部錯誤: ${err.message}`);
        res.status(500).json({ success: false, error: `抓取失敗: ${err.message}` });
    } finally {
        if (browser) {
            await browser.close();
            console.log('[Scraper] Headless 瀏覽器實例已正常關閉');
        }
    }
});

// 透過 ScraperAPI 住宅代理通道穿透 Cloudflare 抓取 Dcard 文章
function fetchDcardViaScraperApi(targetUrl, postId, apiKey) {
    return new Promise((resolve) => {
        if (!apiKey) return resolve(null);
        const encoded = encodeURIComponent(targetUrl);
        const apiUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encoded}`;
        
        const req = https.get(apiUrl, { timeout: 25000 }, (res) => {
            if (res.statusCode !== 200) {
                console.log(`[ScraperAPI] 回應狀態碼異常: ${res.statusCode}`);
                return resolve(null);
            }
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
                if (!match) {
                    console.log(`[ScraperAPI] 未在 HTML 中找到 __NEXT_DATA__`);
                    return resolve(null);
                }
                try {
                    const parsed = JSON.parse(match[1]);
                    function findPost(obj, id) {
                        if (!obj || typeof obj !== 'object') return null;
                        if (obj.title && obj.createdAt && (obj.likeCount !== undefined || obj.commentCount !== undefined)) {
                            if (!id || String(obj.id) === String(id)) return obj;
                        }
                        for (const k in obj) {
                            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                                const r = findPost(obj[k], id);
                                if (r) return r;
                            }
                        }
                        return null;
                    }
                    const post = findPost(parsed, postId) || findPost(parsed, null);
                    if (post && post.title) {
                        return resolve(post);
                    }
                } catch (e) {
                    console.log(`[ScraperAPI] JSON 解析失敗: ${e.message}`);
                }
                resolve(null);
            });
        });
        req.on('error', (e) => {
            console.log(`[ScraperAPI] 網路錯誤: ${e.message}`);
            resolve(null);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

// Dcard 貼文爬取 API
app.post('/api/scrape-dcard', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: '請提供 Dcard 貼文網址' });
    }

    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    const postIdMatch = url.match(/\/p\/(\d+)/);
    if (!postIdMatch) {
        return res.status(400).json({ success: false, error: '無法從網址解析 Dcard 文章 ID (需包含 /p/代碼)' });
    }
    const postId = postIdMatch[1];

    // 從網址推斷看板名稱
    const forumSlugMatch = url.match(/\/f\/([a-zA-Z0-9_-]+)/);
    const forumSlug = forumSlugMatch ? forumSlugMatch[1].toLowerCase() : '';
    const FORUM_MAP = {
        'sex': '西斯',
        'mood': '心情',
        'beauty': '美妝',
        'facelift': '醫美',
        'dressup': '穿搭',
        'food': '美食',
        'girl': '女孩',
        'relationship': '感情',
        'funny': '梗圖',
        'talk': '閒聊',
        'trending': '時事',
        'fitness': '健身',
        '3c': '3C',
        'game': '遊戲',
        'pet': '寵物',
        'car': '汽機車',
        'house': '居家生活'
    };
    const detectedForumName = FORUM_MAP[forumSlug] || (forumSlug ? forumSlug.charAt(0).toUpperCase() + forumSlug.slice(1) : '綜合');
    const is18Plus = forumSlug === 'sex';

    // 1. 優先嘗試透過 ScraperAPI 住宅通道穿透 Cloudflare（需於環境變數設定 SCRAPER_API_KEY）
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';
    if (SCRAPER_API_KEY) {
        console.log(`\n---------------- [Dcard Scraper Request] ----------------`);
        console.log(`[Dcard Step 1] 收到請求，解析 Post ID: ${postId}，推測看板: ${detectedForumName} (${forumSlug || '未知'})`);
        console.log(`[Dcard Step 1.5] 啟動 ScraperAPI 住宅通道穿透 Cloudflare...`);
        try {
            const apiPost = await fetchDcardViaScraperApi(url, postId, SCRAPER_API_KEY);
            if (apiPost && apiPost.title) {
                console.log(`[Dcard ScraperAPI] 成功穿透並解析文章:「${apiPost.title}」`);
                let postDate = '-';
                if (apiPost.createdAt) {
                    const d = new Date(apiPost.createdAt);
                    if (!isNaN(d.getTime())) {
                        postDate = `${d.getMonth() + 1}/${d.getDate()}`;
                    }
                }
                let finalForumName = (apiPost.forumName || detectedForumName || '綜合').replace(/(板|forum)$/i, '').trim();

                return res.json({
                    success: true,
                    data: {
                        platform: 'dcard',
                        url,
                        postId,
                        postDate,
                        forum: 'Dcard',
                        forumName: finalForumName,
                        title: apiPost.title,
                        content: apiPost.excerpt || '',
                        views: '-',
                        likes: String(apiPost.likeCount || 0),
                        replies: String(apiPost.commentCount || 0)
                    }
                });
            } else {
                console.log(`[Dcard ScraperAPI] 未能透過住宅通道取得資料，接續嘗試 Playwright 流程...`);
            }
        } catch (err) {
            console.log(`[Dcard ScraperAPI] 發生異常: ${err.message}，接續嘗試 Playwright 流程...`);
        }
    }

    let browser;
    try {
        console.log(`\n---------------- [Dcard Scraper Request] ----------------`);
        console.log(`[Dcard Step 1] 收到請求，解析 Post ID: ${postId}，推測看板: ${detectedForumName} (${forumSlug || '未知'})`);
        console.log(`[Dcard Step 2] 正在啟動 Playwright 瀏覽器...`);

        // 優先嘗試 channel: 'chrome' 避開 Cloudflare 挑戰，若無則啟動標準 chromium
        try {
            browser = await chromium.launch({
                channel: 'chrome',
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
        } catch (e) {
            browser = await chromium.launch({
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
        }

        console.log(`[Dcard Step 3] 建立 Context 與防偵測腳本...`);
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            locale: 'zh-TW',
            timezoneId: 'Asia/Taipei',
            viewport: { width: 1920, height: 1080 }
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        });

        const page = await context.newPage();

        let postApiData = null;
        page.on('response', async (response) => {
            const resUrl = response.url();
            if (resUrl.includes('/api/v2/posts/') && !resUrl.includes('/comments') && !resUrl.includes('/similar')) {
                try {
                    const json = await response.json();
                    if (json && json.title) {
                        postApiData = json;
                    }
                } catch (e) {}
            }
        });

        console.log(`[Dcard Step 4] 載入文章網址: ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

        // 檢查是否觸發 Cloudflare 盾牌或成人驗證頁
        const pageTitle = await page.title().catch(() => '');
        if (pageTitle.includes('Cloudflare') || pageTitle.includes('確認您的連線') || pageTitle.includes('請稍候')) {
            console.error(`[Dcard Error] 觸發 Cloudflare / 安全驗證: ${pageTitle}`);
            const friendlyError = is18Plus
                ? '此文章屬於 Dcard 18+ 限制級看板（西斯板），受官方安全驗證保護無法自動讀取。請使用下方「快速手動補填」直接加入報表！'
                : `此文章受到 Dcard 官方安全防護（Cloudflare 驗證），暫時無法自動讀取。請使用下方「快速手動補填」直接加入報表！`;
            return res.status(403).json({
                success: false,
                isRestricted: true,
                is18Plus,
                postId,
                url,
                forumName: detectedForumName,
                error: friendlyError
            });
        }

        // 1. 優先從頁面中的 __NEXT_DATA__ 提取資料
        let nextDataObj = null;
        try {
            const rawNext = await page.evaluate(() => {
                const el = document.getElementById('__NEXT_DATA__');
                return el ? el.innerText : null;
            });
            if (rawNext) {
                const parsed = JSON.parse(rawNext);
                function findPost(obj, id) {
                    if (!obj || typeof obj !== 'object') return null;
                    if (obj.title && obj.createdAt && (obj.likeCount !== undefined || obj.commentCount !== undefined)) {
                        if (!id || String(obj.id) === String(id)) return obj;
                    }
                    for (const k in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, k)) {
                            const res = findPost(obj[k], id);
                            if (res) return res;
                        }
                    }
                    return null;
                }
                nextDataObj = findPost(parsed, postId) || findPost(parsed, null);
            }
        } catch (e) {}

        // 2. 若未從 __NEXT_DATA__ 找到，則等待網路 API 攔截
        if (!nextDataObj) {
            for (let i = 0; i < 20; i++) {
                if (postApiData) break;
                await page.waitForTimeout(150);
            }
        }

        const targetData = nextDataObj || postApiData;

        let postDate = '-';
        let forumName = '綜合';
        let title = '';
        let excerpt = '';
        let likes = '0';
        let replies = '0';

        if (targetData) {
            console.log(`[Dcard Step 5] 成功解析 Dcard 結構化資料！`);
            if (targetData.createdAt) {
                const d = new Date(targetData.createdAt);
                if (!isNaN(d.getTime())) {
                    postDate = `${d.getMonth() + 1}/${d.getDate()}`;
                }
            }
            forumName = targetData.forumName || '綜合';
            title = targetData.title || '';
            excerpt = targetData.excerpt || '';
            likes = String(targetData.likeCount || 0);
            replies = String(targetData.commentCount || 0);
        } else {
            console.log(`[Dcard Step 5] 未找到 JSON 結構，改由網頁 Title 與 DOM 提取...`);
            const rawTitle = await page.title().catch(() => '');
            const cleanedTitle = rawTitle.replace(/\u00a0/g, ' ').trim();
            const match = cleanedTitle.match(/^(.*?)\s*[-–—]\s*(.*?)(板)?\s*\|\s*Dcard/i);
            if (match) {
                title = match[1].trim();
                forumName = match[2].trim();
            } else {
                title = cleanedTitle.replace(/\s*\|\s*Dcard/i, '').trim();
            }

            const domData = await page.evaluate(() => {
                const timeEl = document.querySelector('time');
                return {
                    timeStr: timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText) : ''
                };
            });
            if (domData.timeStr) {
                const d = new Date(domData.timeStr);
                if (!isNaN(d.getTime())) {
                    postDate = `${d.getMonth() + 1}/${d.getDate()}`;
                }
            }
        }

        // 清理標題後綴，確保不包含「 - 醫美板 | Dcard」
        if (title.includes(' - ') || title.includes(' | Dcard') || title.includes(' - ')) {
            const cleaned = title.replace(/\u00a0/g, ' ').trim();
            const m = cleaned.match(/^(.*?)\s*[-–—]\s*(.*?)(板)?\s*\|\s*Dcard/i);
            if (m) {
                title = m[1].trim();
                if (forumName === '綜合') forumName = m[2].trim();
            }
        }

        // 移除版位後綴「板」，符合簡報格式（如「醫美」而非「醫美板」）
        forumName = forumName.replace(/板$/, '').trim();

        if (!title || title === '找不到頁面' || title.includes('Cloudflare') || title.includes('確認您的連線') || title.includes('請稍候')) {
            console.error(`[Dcard Error] 無法讀取文章或被阻擋: ${title}`);
            const friendlyError = is18Plus
                ? '此文章屬於 Dcard 18+ 限制級看板（西斯板），受官方安全驗證保護無法自動讀取。請使用下方「快速手動補填」直接加入報表！'
                : `此文章受到 Dcard 官方安全防護（Cloudflare 驗證），暫時無法自動讀取。請使用下方「快速手動補填」直接加入報表！`;
            return res.status(403).json({
                success: false,
                isRestricted: true,
                is18Plus,
                postId,
                url,
                forumName: (forumName && forumName !== '綜合') ? forumName : detectedForumName,
                error: friendlyError
            });
        }

        const resultData = {
            platform: 'dcard',
            url,
            postId,
            postDate,
            forum: 'Dcard',
            forumName,
            title,
            content: excerpt,
            views: '-',
            likes,
            replies
        };

        console.log(`[Dcard Step 6] 抓取完成，資料封裝成功！`);
        res.json({
            success: true,
            data: resultData
        });

    } catch (err) {
        console.error(`[Dcard Error] 抓取失敗: ${err.message}`);
        res.status(500).json({ success: false, error: `Dcard 抓取失敗: ${err.message}` });
    } finally {
        if (browser) {
            await browser.close();
            console.log('[Dcard] 瀏覽器實例已關閉');
        }
    }
});

// 動態尋找可用連接埠
const net = require('net');
function startServer(port) {
    const server = net.createServer();
    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[System] 連接埠 ${port} 已被佔用，嘗試下一個連接埠 ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('[System] 啟動失敗:', err);
        }
    });

    server.once('listening', () => {
        server.close(() => {
            app.listen(port, () => {
                console.log(`=================================`);
                console.log(`🚀 Threads 數據查詢工具已啟動！`);
                console.log(`👉 本地端造訪：http://localhost:${port}`);
                console.log(`=================================`);
            });
        });
    });

    server.listen(port);
}

startServer(PORT);
