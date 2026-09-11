const { chromium } = require('playwright');
const fs = require('fs');

async function run() {
    const url = 'https://www.threads.net/@mosseri/post/DaxpWl5gJjx';
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'zh-TW'
    });
    
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    console.log('--- Inspecting script tags ---');
    
    const scripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script'))
            .map(s => s.innerText)
            .filter(text => text.trim().length > 0);
    });
    
    console.log(`Found ${scripts.length} script tags with content.`);
    
    // 尋找包含特定字眼的 JSON 或 JS 變數
    let foundCount = 0;
    scripts.forEach((scriptText, idx) => {
        const hasLikes = scriptText.includes('like_count');
        const hasReplies = scriptText.includes('reply_count');
        const hasReposts = scriptText.includes('repost_count');
        const hasViews = scriptText.includes('view_count') || scriptText.includes('views');
        
        if (hasLikes || hasReplies || hasReposts || hasViews) {
            foundCount++;
            console.log(`Script[${idx}] contains matches! HasLikes: ${hasLikes}, HasReplies: ${hasReplies}, HasReposts: ${hasReposts}`);
            // 寫出部分內容分析
            fs.writeFileSync(`script_${idx}.json`, scriptText);
            console.log(`Saved script_${idx}.json`);
        }
    });
    
    console.log(`Total matching scripts saved: ${foundCount}`);
    await browser.close();
}

run();
