// ============================================
// RiseGo Sürücü Paneli - Leaderboard Module
// ============================================
// Gereksinim: utils.js önce yüklenmiş olmalı

var leaderboardLoaded = false;

// ─── Açma / Kapama ────────────────────────────────────────────────────────
function openLeaderboard() {
    document.getElementById('profilePage').classList.remove('active');
    document.getElementById('leaderboardPage').classList.add('active');

    // Bugünün tarihini default olarak set et
    const today    = new Date();
    const year     = today.getFullYear();
    const month    = String(today.getMonth() + 1).padStart(2, '0');
    const day      = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const startInput = document.getElementById('lbStartDate');
    const endInput   = document.getElementById('lbEndDate');
    if (startInput) startInput.value = todayStr;
    if (endInput)   endInput.value   = todayStr;

    loadLeaderboard(todayStr, todayStr);
}

function closeLeaderboard() {
    document.getElementById('leaderboardPage').classList.remove('active');
    document.getElementById('profilePage').classList.add('active');
}

// ─── API: Veri Yükleme ────────────────────────────────────────────────────
/**
 * Sürücü leaderboard verisini API'den yükler (sadece tarih aralığı ile)
 * @param {string} startDate - ISO YYYY-MM-DD
 * @param {string} endDate   - ISO YYYY-MM-DD
 */
async function loadLeaderboard(startDate, endDate) {
    const content    = document.getElementById('leaderboardContent');
    const periodInfo = document.getElementById('lbPeriodInfoText');

    content.innerHTML = `
        <div class="leaderboard-loading">
            <div class="spinner-large"></div>
            <p>Sıralama tablosu yükleniyor...</p>
            <p class="loading-hint">İlk yükleme biraz zaman alabilir</p>
        </div>
    `;

    try {
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 120000);
        const url        = `${API_BASE}/leaderboard?from=${startDate}&to=${endDate}`;
        const response   = await authenticatedFetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await response.json();

        if (!data.success) {
            content.innerHTML = `<p class="leaderboard-error">${data.message || 'Sıralama tablosu yüklenemedi.'}</p>`;
            if (periodInfo) periodInfo.textContent = 'Veri alınamadı';
            return;
        }

        leaderboardLoaded = true;
        if (periodInfo) periodInfo.textContent = `${data.periodLabel} tarihleri arasında en çok yolculuk yapan sürücüler`;
        renderLeaderboard(data.leaderboard, data.currentUser);
    } catch (error) {
        console.error('Leaderboard error:', error);
        const msg = error.name === 'AbortError' ? 'İstek zaman aşımına uğradı.' : 'Sunucuya bağlanılamadı.';
        content.innerHTML = `<p class="leaderboard-error">${msg}</p><button class="btn-retry" onclick="filterLeaderboard()">Tekrar Dene</button>`;
    }
}

// ─── Filtreleme ───────────────────────────────────────────────────────────
/**
 * Filtrele butonuna basıldığında çalışır. En fazla 1 aylık dönem seçilebilir.
 */
function filterLeaderboard() {
    const startInput = document.getElementById('lbStartDate').value;
    const endInput   = document.getElementById('lbEndDate').value;

    if (!startInput || !endInput) { showLeaderboardToast('error', 'Lütfen hem başlangıç hem de bitiş tarihi seçin.'); return; }

    const startDate = new Date(startInput);
    const endDate   = new Date(endInput);
    if (startDate > endDate) { showLeaderboardToast('error', 'Başlangıç tarihi bitiş tarihinden sonra olamaz.'); return; }

    const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 31) { showLeaderboardToast('error', 'En fazla 1 aylık (31 gün) dönem seçebilirsiniz.'); return; }

    loadLeaderboard(startInput, endInput);
}

// ─── Toast ────────────────────────────────────────────────────────────────
function showLeaderboardToast(type, message) {
    const toast     = document.getElementById('lbToast');
    const toastText = document.getElementById('lbToastText');
    if (!toast || !toastText) return;
    toast.classList.remove('show', 'success', 'error');
    toast.classList.add(type, 'show');
    toastText.textContent = message;
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s var(--ease) forwards';
        setTimeout(() => { toast.classList.remove('show', 'success', 'error'); toast.style.animation = ''; }, 300);
    }, 4000);
}

// ─── Render ───────────────────────────────────────────────────────────────
function renderLeaderboard(list, currentUser) {
    const container = document.getElementById('leaderboardContent');
    const myId      = currentDriverData ? currentDriverData.id : '';
    let html = '';

    if (list.length === 0) {
        html += '<p class="lb-empty">Bu dönemde henüz tamamlanmış yolculuk yok.</p>';
        container.innerHTML = html;
        return;
    }

    html += '<div class="leaderboard-list">';
    list.forEach(entry => {
        const isMe  = entry.id === myId;
        const medal = entry.rank === 1 ? 'gold' : entry.rank === 2 ? 'silver' : entry.rank === 3 ? 'bronze' : '';
        html += `
            <div class="lb-row${isMe ? ' lb-row-me' : ''}">
                <div class="lb-rank${medal ? ' lb-medal-' + medal : ''}">${entry.rank}</div>
                <div class="lb-name">${entry.initials}${isMe ? ' <span class="lb-you">(Sen)</span>' : ''}</div>
                <div class="lb-trips">${entry.tripCount} <span class="lb-trips-label">yolculuk</span></div>
            </div>`;
    });
    html += '</div>';

    if (currentUser) {
        html += `
            <div class="lb-separator"><span>&#8226; &#8226; &#8226;</span></div>
            <div class="lb-row lb-row-me lb-row-bottom">
                <div class="lb-rank">${currentUser.rank}</div>
                <div class="lb-name">${currentUser.initials} <span class="lb-you">(Sen)</span></div>
                <div class="lb-trips">${currentUser.tripCount} <span class="lb-trips-label">yolculuk</span></div>
            </div>`;
    }
    container.innerHTML = html;
}
