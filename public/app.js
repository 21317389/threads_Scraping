// 快取 DOM 元素
const urlInputsContainer = document.getElementById('urlInputsContainer');
const addInputBtn = document.getElementById('addInputBtn');
const submitBtn = document.getElementById('submitBtn');
const errorMessageDiv = document.getElementById('errorMessage');
const errorTextSpan = document.getElementById('errorText');
const resultContainerDiv = document.getElementById('resultContainer');
const resultsList = document.getElementById('resultsList');

// 儲存所有批次抓取的成功結果數據
let batchResultsData = [];

// 截取貼文內文的第一句話
function getFirstSentence(content) {
    if (!content || typeof content !== 'string') return '（無內文）';
    
    // 取第一行非空白文字
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '（無內文）';
    
    const firstLine = lines[0];
    
    // 依中英文常見標點符號截取第一句話（。！？!?）
    const match = firstLine.match(/^(.*?[。！？!?])/);
    let sentence = match ? match[1] : firstLine;
    
    // 去除換行與 Tab 符號，確保 Excel / PPT 貼上不跳格
    sentence = sentence.replace(/[\t\r\n]+/g, ' ').trim();
    return sentence || '（無內文）';
}

// 轉義 HTML 特殊字元避免破壞表格結構
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 頁面加載時，初始化第一個輸入框
document.addEventListener('DOMContentLoaded', () => {
    createInputRow();
});

// 新增一個輸入框行
function createInputRow(initialValue = '') {
    const rowId = 'row_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    const rowDiv = document.createElement('div');
    rowDiv.className = 'input-row';
    rowDiv.id = rowId;
    
    rowDiv.innerHTML = `
        <div class="input-group">
            <span class="input-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </span>
            <input type="url" class="post-url-input" placeholder="貼上 Threads 貼文網址，例如：https://www.threads.net/@username/post/..." value="${initialValue}" required>
            <button class="clear-button" type="button" aria-label="清除輸入" style="display: ${initialValue ? 'flex' : 'none'};">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <button class="btn-delete-row" type="button" aria-label="刪除此行">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
        </button>
    `;
    
    urlInputsContainer.appendChild(rowDiv);
    
    const input = rowDiv.querySelector('.post-url-input');
    const clearBtn = rowDiv.querySelector('.clear-button');
    const deleteBtn = rowDiv.querySelector('.btn-delete-row');
    
    // 輸入框監聽
    input.addEventListener('input', () => {
        if (input.value.trim().length > 0) {
            clearBtn.style.display = 'flex';
        } else {
            clearBtn.style.display = 'none';
        }
    });
    
    // 清除按鈕點擊
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        input.focus();
    });
    
    // 刪除按鈕點擊
    deleteBtn.addEventListener('click', () => {
        const rows = urlInputsContainer.querySelectorAll('.input-row');
        if (rows.length > 1) {
            rowDiv.remove();
            updateDeleteButtonsVisibility();
        } else {
            input.value = '';
            clearBtn.style.display = 'none';
        }
    });
    
    // 監聽 Enter 鍵自動新增下一行
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const rows = urlInputsContainer.querySelectorAll('.input-row');
            if (rows[rows.length - 1] === rowDiv && input.value.trim().length > 0) {
                createInputRow();
                // 聚焦到新生成的輸入框
                const newRows = urlInputsContainer.querySelectorAll('.input-row');
                newRows[newRows.length - 1].querySelector('.post-url-input').focus();
            }
        }
    });

    updateDeleteButtonsVisibility();
}

// 根據輸入框數量顯示或隱藏刪除按鈕
function updateDeleteButtonsVisibility() {
    const rows = urlInputsContainer.querySelectorAll('.input-row');
    rows.forEach(row => {
        const deleteBtn = row.querySelector('.btn-delete-row');
        if (rows.length === 1) {
            deleteBtn.style.visibility = 'hidden';
        } else {
            deleteBtn.style.visibility = 'visible';
        }
    });
}

// 點擊新增按鈕
addInputBtn.addEventListener('click', () => {
    createInputRow();
    const rows = urlInputsContainer.querySelectorAll('.input-row');
    rows[rows.length - 1].querySelector('.post-url-input').focus();
});

// 全域錯誤顯示
function showError(message) {
    errorTextSpan.innerText = message;
    errorMessageDiv.classList.remove('hidden');
    
    // 震動效果
    errorMessageDiv.style.animation = 'none';
    errorMessageDiv.offsetHeight; // reflow
    errorMessageDiv.style.animation = null;
}

function hideError() {
    errorMessageDiv.classList.add('hidden');
}

// 批次查詢函數
async function queryBatchMetrics() {
    hideError();
    
    // 0. 檢查是否使用了 file:// 協定開啟網頁（常見錯誤）
    if (window.location.protocol === 'file:') {
        showError('偵測到您直接雙擊打開了 HTML 檔案！請在瀏覽器網址列輸入 http://localhost:3000 存取工具，否則網頁無法連線至後端。');
        return;
    }

    // 1. 取得所有輸入框的網址並驗證
    const rows = urlInputsContainer.querySelectorAll('.input-row');
    const urlsToScrape = [];
    
    rows.forEach((row, idx) => {
        const url = row.querySelector('.post-url-input').value.trim();
        if (url) {
            if (url.includes('threads.net') || url.includes('threads.com')) {
                urlsToScrape.push({ url, rowIndex: idx });
            } else {
                row.querySelector('.post-url-input').focus();
            }
        }
    });

    if (urlsToScrape.length === 0) {
        showError('請至少輸入一個有效的 Threads 貼文網址（需包含 threads.net 或 threads.com）！');
        return;
    }

    // 2. 重設與顯示結果容器
    resultsList.innerHTML = '';
    resultContainerDiv.classList.remove('hidden');
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    batchResultsData = [];

    // 平滑捲動到結果區
    resultContainerDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 3. 循序執行批次分析 (避免多執行緒引起防爬蟲機制或過載)
    for (let i = 0; i < urlsToScrape.length; i++) {
        const item = urlsToScrape[i];
        
        // 建立該貼文的骨架屏
        const skeletonId = `skeleton_${i}`;
        appendSkeletonCard(skeletonId, item.url);
        
        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: item.url })
            });

            const result = await response.json();

            // 移除骨架屏
            const skeletonEl = document.getElementById(skeletonId);
            if (skeletonEl) skeletonEl.remove();

            if (response.ok && result.success) {
                // 渲染結果貼文卡片
                appendResultCard(result.data);
                
                // 儲存需要保留的數據：日期、內文、按讚數、留言、轉發、瀏覽
                batchResultsData.push({
                    url: result.data.url,
                    postDate: result.data.postDate || '',
                    postFullDate: result.data.postFullDate || '',
                    content: result.data.content || '',
                    likes: result.data.likes,
                    replies: result.data.replies,
                    reposts: result.data.reposts,
                    views: result.data.views
                });
            } else {
                appendErrorCard(item.url, result.error || '抓取數據時發生未知錯誤。');
            }
        } catch (err) {
            console.error(err);
            const skeletonEl = document.getElementById(skeletonId);
            if (skeletonEl) skeletonEl.remove();
            appendErrorCard(item.url, '無法連線至本地端 API 伺服器，請確保後端 node server.js 已啟動。');
        }
    }

    // 4. 還原按鈕狀態
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
}

// 插入骨架屏卡片
function appendSkeletonCard(id, url) {
    const card = document.createElement('div');
    card.className = 'skeleton-container pulse';
    card.id = id;
    card.innerHTML = `
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ⏳ 正在抓取數據: ${url}
        </div>
        <div class="skeleton-header">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-user-info">
                <div class="skeleton-line title"></div>
                <div class="skeleton-line handle"></div>
            </div>
        </div>
        <div class="skeleton-body">
            <div class="skeleton-line content-1"></div>
            <div class="skeleton-line content-2"></div>
        </div>
        <div class="skeleton-stats-grid">
            <div class="skeleton-stat-card"></div>
            <div class="skeleton-stat-card"></div>
            <div class="skeleton-stat-card"></div>
            <div class="skeleton-stat-card"></div>
        </div>
    `;
    resultsList.appendChild(card);
}

// 插入結果預覽卡片
function appendResultCard(data) {
    const card = document.createElement('div');
    card.className = 'threads-preview-card animate-fade-in';
    card.innerHTML = `
        <div class="card-header">
            <div class="avatar-wrapper">
                <img src="${data.avatarUrl}" alt="用戶頭像" class="user-avatar" onerror="this.src='https://www.threads.net/favicon.ico'">
            </div>
            <div class="user-meta">
                <div class="user-name-wrapper">
                    <span class="user-name">${data.username}</span>
                    <span class="verified-badge" title="認證帳號">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="#0095f6">
                            <path d="M12.002 2.005a9.995 9.995 0 0 0-10 10.002c0 5.522 4.477 10 10 10s10-4.478 10-10a9.994 9.994 0 0 0-10-10.002zm4.492 7.733-5.617 5.784a.796.796 0 0 1-.58.243.79.79 0 0 1-.572-.234L6.96 12.693a.808.808 0 0 1-.035-1.127.79.79 0 0 1 1.118-.035l2.298 2.21 5.068-5.218a.8.8 0 0 1 1.13 0 .802.802 0 0 1-.037 1.134z"/>
                        </svg>
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="user-handle">${data.userHandle}</span>
                    ${data.postDate ? `<span class="post-date-badge" style="font-size: 0.78rem; color: var(--text-secondary); opacity: 0.85; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;" title="發文日期：${data.postFullDate || data.postDate}">📅 ${data.postDate}</span>` : ''}
                </div>
            </div>
            <div class="threads-badge-icon">
                <a href="${data.url}" target="_blank" style="color: inherit;" title="點選跳轉原始貼文">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="threads-card-logo">
                        <path d="M16.792 11.838c-.378-.06-.757-.107-1.14-.14-.265-.957-.75-1.85-1.428-2.613.567-.425 1.258-.696 2.023-.746.216.772.392 1.636.545 2.5zm-5.01-4.887c.22-.016.44-.025.666-.025.753 0 1.48.11 2.164.316-.275.76-.632 1.488-1.05 2.146a4.42 4.42 0 0 0-1.78-2.437zM12.448 17c-.226 0-.447-.01-.667-.026-.807-.052-1.545-.357-2.128-.846.332-.782.784-1.503 1.332-2.14 1.15.228 2.054.673 2.658 1.312a3.844 3.844 0 0 1-1.2 1.7zm1.884.286c-.573.473-1.25.76-1.99.82a8.88 8.88 0 0 1-1.042.06c-1.86 0-3.32-.472-4.34-1.405C7.933 15.827 7.42 14.542 7.42 12.91c0-1.632.513-2.917 1.54-3.85C9.98 8.127 11.44 7.655 13.3 7.655c.742 0 1.41.088 1.99.262.58.175 1.056.44 1.428.8a5.1 5.1 0 0 1 1.037 1.547c.28.66.42 1.42.42 2.277v1.895c0 .736.216 1.104.647 1.104.223 0 .463-.122.716-.367a7.288 7.288 0 0 0 1.257-1.89c.143-.332.32-.395.532-.19l.568.553c.18.174.22.378.12.612a8.47 8.47 0 0 1-1.802 2.637 4.122 4.122 0 0 1-2.946 1.1c-.812 0-1.458-.225-1.936-.675-.478-.45-.717-1.062-.717-1.837v-1.895c0-.62-.1-1.16-.3-1.62-.2-.46-.5-.815-.9-1.065-.4-.25-.9-.375-1.5-.375-.615 0-1.127.126-1.536.377-.41.25-.718.608-.925 1.073-.207.465-.31 1.008-.31 1.63 0 .62.103 1.163.31 1.63.207.465.515.823.925 1.073.41.25.92.377 1.536.377.388 0 .762-.05 1.12-.152-.162.296-.347.58-.553.85a5.55 5.55 0 0 1-1.423.858c-.53.22-1.11.332-1.742.332-1.282 0-2.285-.327-3.007-.98-.723-.655-1.085-1.576-1.085-2.766s.362-2.11 1.085-2.765c.722-.654 1.725-.98 3.007-.98.812 0 1.52.122 2.124.367.604.245 1.087.61 1.45 1.096a6.046 6.046 0 0 1 .904 1.72 6.782 6.782 0 0 1 .288 2.054c0 1.036-.316 1.847-.948 2.433z"/>
                    </svg>
                </a>
            </div>
        </div>
        <div class="card-body">
            <p class="post-content">${data.content || '（無內文）'}</p>
        </div>
        
        <div class="divider"></div>

        <div class="metrics-grid">
            <div class="stat-card">
                <div class="stat-icon-bg icon-likes">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </div>
                <div class="stat-value">${data.likes}</div>
                <div class="stat-label">按讚數</div>
            </div>

            <div class="stat-card">
                <div class="stat-icon-bg icon-replies">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                </div>
                <div class="stat-value">${data.replies}</div>
                <div class="stat-label">留言回覆</div>
            </div>

            <div class="stat-card">
                <div class="stat-icon-bg icon-reposts">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"/>
                    </svg>
                </div>
                <div class="stat-value">${data.reposts}</div>
                <div class="stat-label">轉發/引用</div>
            </div>

            <div class="stat-card">
                <div class="stat-icon-bg icon-views">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                </div>
                <div class="stat-value">${data.views}</div>
                <div class="stat-label">觀看瀏覽數</div>
            </div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 14px; text-align: right; font-family: monospace; word-break: break-all;">
            連結: <a href="${data.url}" target="_blank" style="color: var(--accent-purple); text-decoration: none;">${data.url}</a>
        </div>
    `;
    resultsList.appendChild(card);
}

// 插入失敗提示卡片
function appendErrorCard(url, errorMessage) {
    const card = document.createElement('div');
    card.className = 'threads-preview-card error-card animate-fade-in';
    card.innerHTML = `
        <div class="error-card-body">
            <span style="font-size: 1.25rem;">⚠️</span>
            <div>
                <strong>分析貼文失敗</strong>
                <div style="font-size: 0.85rem; margin-top: 4px; color: rgba(255, 255, 255, 0.7);">${errorMessage}</div>
            </div>
        </div>
        <div class="error-card-url">
            目標連結: <a href="${url}" target="_blank" style="color: var(--text-secondary); text-decoration: underline;">${url}</a>
        </div>
    `;
    resultsList.appendChild(card);
}

// 複製所有結果為 JSON
function copyBatchResultsJSON() {
    if (batchResultsData.length === 0) return;
    
    const exportData = batchResultsData.map(item => ({
        url: item.url,
        postDate: item.postDate || '',
        postFullDate: item.postFullDate || '',
        firstSentence: getFirstSentence(item.content),
        likes: item.likes,
        replies: item.replies,
        reposts: item.reposts,
        views: item.views
    }));

    const jsonString = JSON.stringify(exportData.length === 1 ? exportData[0] : exportData, null, 2);
    
    navigator.clipboard.writeText(jsonString).then(() => {
        const copyBtn = document.getElementById('copyJsonBtn');
        const originalHTML = copyBtn.innerHTML;
        
        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            已複製精簡數據 JSON！
        `;
        copyBtn.style.color = '#10b981';
        copyBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.style.color = '';
            copyBtn.style.borderColor = '';
        }, 2000);
    }).catch(err => {
        console.error('複製失敗:', err);
        alert('複製失敗，瀏覽器可能不支援 Clipboard API。');
    });
}

// 複製為 PPT / Excel 格式表格 (完美符合簡報格式：上線時間、溝通內容、連結、瀏覽數、按讚數、留言數、轉發/分享)
function copyBatchResultsTable() {
    if (batchResultsData.length === 0) return;

    // 格式化日期為 M/D (去除開頭的 0，例如 8/11)
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return dateStr.replace(/^0(\d)/, '$1').replace(/\/0(\d)/, '/$1');
    };

    // 建立純文字 (TSV) 格式，適合 Excel / 記事本貼上
    const tsvHeader = '上線時間\t溝通內容\t連結\t瀏覽數\t按讚數\t留言數\t轉發/分享';
    const tsvRows = batchResultsData.map(item => {
        const dateStr = formatDate(item.postDate);
        const firstSentence = getFirstSentence(item.content);
        return `${dateStr}\t${firstSentence}\t${item.url}\t${item.views}\t${item.likes}\t${item.replies}\t${item.reposts}`;
    });
    const tsvString = [tsvHeader, ...tsvRows].join('\n');

    // 建立 HTML 格式表格，使 PowerPoint / Excel 貼上時完全符合簡報樣式
    const htmlString = `
        <table border="1" style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei', '微軟正黑體', Roboto, Helvetica, Arial, sans-serif; width: 100%; border: 1px solid #d1d5db;">
            <thead>
                <tr style="background-color: #6b7280; color: #ffffff; font-weight: bold; border-bottom: 2px solid #4b5563;">
                    <th style="padding: 10px 12px; border: 1px solid #d1d5db; text-align: center; color: #ffffff; width: 10%; font-size: 14px;">上線時間</th>
                    <th style="padding: 10px 14px; border: 1px solid #d1d5db; text-align: center; color: #ffffff; width: 42%; font-size: 14px;">溝通內容</th>
                    <th style="padding: 10px 12px; border: 1px solid #d1d5db; text-align: center; color: #ffffff; width: 8%; font-size: 14px;">連結</th>
                    <th style="padding: 10px 12px; border: 1px solid #d1d5db; text-align: center; color: #ffffff; width: 10%; font-size: 14px;">瀏覽數</th>
                    <th style="padding: 10px 12px; border: 1px solid #d1d5db; text-align: center; color: #ffffff; width: 10%; font-size: 14px;">按讚數</th>
                    <th style="padding: 10px 12px; border: 1px solid #d1d5db; text-align: center; color: #ffffff; width: 10%; font-size: 14px;">留言數</th>
                    <th style="padding: 10px 12px; border: 1px solid #d1d5db; text-align: center; color: #ffffff; width: 10%; font-size: 14px;">轉發/分享</th>
                </tr>
            </thead>
            <tbody>
                ${batchResultsData.map((item, index) => {
                    const dateStr = formatDate(item.postDate);
                    const firstSentence = getFirstSentence(item.content);
                    const safeContent = escapeHtml(firstSentence);
                    const bg = index % 2 === 1 ? '#f9fafb' : '#ffffff';
                    return `
                        <tr style="background-color: ${bg}; border-bottom: 1px solid #e5e7eb;">
                            <td style="padding: 9px 10px; border: 1px solid #d1d5db; text-align: center; color: #1f2937; white-space: nowrap; font-size: 14px;">${dateStr}</td>
                            <td style="padding: 9px 14px; border: 1px solid #d1d5db; text-align: center; color: #1f2937; font-size: 14px;">${safeContent}</td>
                            <td style="padding: 9px 10px; border: 1px solid #d1d5db; text-align: center; font-size: 14px;"><a href="${item.url}" target="_blank" style="color: #2563eb; text-decoration: underline; font-weight: 500;">連結</a></td>
                            <td style="padding: 9px 10px; border: 1px solid #d1d5db; text-align: center; color: #1f2937; font-size: 14px;">${item.views}</td>
                            <td style="padding: 9px 10px; border: 1px solid #d1d5db; text-align: center; color: #1f2937; font-size: 14px;">${item.likes}</td>
                            <td style="padding: 9px 10px; border: 1px solid #d1d5db; text-align: center; color: #1f2937; font-size: 14px;">${item.replies}</td>
                            <td style="padding: 9px 10px; border: 1px solid #d1d5db; text-align: center; color: #1f2937; font-size: 14px;">${item.reposts}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    try {
        const typeHtml = 'text/html';
        const typePlain = 'text/plain';
        const blobHtml = new Blob([htmlString], { type: typeHtml });
        const blobPlain = new Blob([tsvString], { type: typePlain });
        
        // 使用 ClipboardItem 同時寫入兩種格式
        const data = [new ClipboardItem({
            [typeHtml]: blobHtml,
            [typePlain]: blobPlain
        })];

        navigator.clipboard.write(data).then(() => {
            const copyBtn = document.getElementById('copyTableBtn');
            const originalHTML = copyBtn.innerHTML;
            
            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                已複製超連結表格！
            `;
            copyBtn.style.color = '#10b981';
            copyBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.color = '';
                copyBtn.style.borderColor = '';
            }, 2500);
        }).catch(err => {
            console.error('寫入剪貼簿失敗 (ClipboardItem):', err);
            fallbackWriteText(tsvString);
        });
    } catch (e) {
        console.error('瀏覽器不支援 ClipboardItem API:', e);
        fallbackWriteText(tsvString);
    }
}

function fallbackWriteText(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('已複製 Excel 相容的純文字。您可以在 PowerPoint 中建立空白表格，然後直接貼上即可。');
    }).catch(err => {
        alert('複製失敗，瀏覽器可能不支援 Clipboard API。');
    });
}
