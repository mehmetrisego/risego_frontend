// ============================================
// RiseGo Sürücü Paneli - Profile Module
// ============================================
// Gereksinim: utils.js, bankAccount.js, withdraw.js önce yüklenmiş olmalı

let currentDriverData = null;
let carBrandsWithModels = []; // [{ brand, models: [...] }]
let tripCountCache  = {};
let currentPeriod   = 'daily';
let currentCampaignText = '';

// ─── Profil Sayfası ───────────────────────────────────────────────────────
async function showProfilePage() {
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('profilePage').classList.add('active');
    document.getElementById('stepOTP').classList.remove('active');
    document.getElementById('stepPhone').classList.remove('active');
    document.getElementById('stepRegister').classList.remove('active');
    document.getElementById('stepCity').classList.add('active');

    if (!currentDriverData) return;

    // Temel bilgileri doldur
    const fullName = `${currentDriverData.firstName || ''} ${currentDriverData.lastName || ''}`.trim();
    document.getElementById('profileName').textContent = fullName || 'Sürücü';
    document.getElementById('profileCity').textContent = selectedCity || currentDriverData.city || '';
    document.getElementById('profilePhone').textContent = formatPhoneDisplay(currentDriverData.phone || phoneNumber || '');

    // İnisiyaller
    const parts    = fullName.split(' ').filter(Boolean);
    const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ? parts[0].substring(0, 2) : 'RG');
    document.getElementById('profileInitials').textContent = initials.toUpperCase();

    // Araç bilgisi
    const carEl     = document.getElementById('profileCar');
    const editCarBtn = document.getElementById('editCarBtn');
    if (currentDriverData.car) {
        carEl.textContent = currentDriverData.car;
        if (editCarBtn) editCarBtn.style.display = 'inline-flex';
    } else {
        carEl.textContent = '-';
        if (editCarBtn) editCarBtn.style.display = 'none';
    }

    // Bakiye
    loadBalance();

    // Trip count (daily)
    changeTripPeriod('daily');

    // Banka hesabı
    loadBankAccount();

    // Kampanya
    fetchCampaign();
}

// ─── Bakiye ───────────────────────────────────────────────────────────────
async function loadBalance() {
    const balEl = document.getElementById('profileBalance');
    if (!balEl) return;
    balEl.textContent = '...';
    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/balance`, { method: 'POST' });
        const data     = await response.json();
        if (data.success) {
            const amount = parseFloat(String(data.balance || '0').replace(/[^0-9.]/g, '')) || 0;
            balEl.textContent = amount.toFixed(2).replace('.', ',') + ' ₺';
        } else {
            balEl.textContent = '-';
        }
    } catch (e) {
        console.error('[Balance] Hata:', e);
        balEl.textContent = '-';
    }
}

// ─── Yolculuk Sayısı Dönemi ───────────────────────────────────────────────
async function changeTripPeriod(period) {
    if (period === currentPeriod && tripCountCache[period] !== undefined) {
        document.getElementById('profileTrips').textContent = tripCountCache[period];
        return;
    }
    currentPeriod = period;
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.period === period);
    });

    // Cache'de varsa direkt göster
    if (tripCountCache[period] !== undefined) {
        document.getElementById('profileTrips').textContent = tripCountCache[period];
        return;
    }

    const tripsEl  = document.getElementById('profileTrips');
    const loaderEl = document.getElementById('tripLoader');
    tripsEl.style.display  = 'none';
    loaderEl.style.display = 'flex';

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/trip-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ period })
        });
        const data = await response.json();
        if (data.success) {
            tripCountCache[period] = data.tripCount;
            if (currentPeriod === period) tripsEl.textContent = data.tripCount;
        } else {
            if (currentPeriod === period) tripsEl.textContent = '-';
        }
    } catch (error) {
        console.error('Trip count error:', error);
        if (currentPeriod === period) tripsEl.textContent = '-';
    } finally {
        loaderEl.style.display = 'none';
        tripsEl.style.display  = 'block';
    }
}

// ─── Kampanya ─────────────────────────────────────────────────────────────
async function fetchCampaign() {
    const campaignEl = document.getElementById('profileCampaignText');
    if (!campaignEl) return;
    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/campaign`);
        const data     = await response.json();
        if (data.success && data.campaign && data.campaign.active && data.campaign.text) {
            currentCampaignText      = data.campaign.text;
            campaignEl.textContent   = data.campaign.text;
            const card = document.getElementById('campaignCardFrontend');
            if (card) card.classList.add('campaign-active');
        } else {
            currentCampaignText    = 'Şu anda aktif kampanya bulunmamaktadır.';
            campaignEl.textContent = currentCampaignText;
            const card = document.getElementById('campaignCardFrontend');
            if (card) card.classList.remove('campaign-active');
        }
    } catch (error) {
        console.error('[Campaign] Kampanya yükleme hatası:', error);
        currentCampaignText    = 'Şu anda aktif kampanya bulunmamaktadır.';
        campaignEl.textContent = currentCampaignText;
    }
}

// ─── Modal Açıcılar ────────────────────────────────────────────────────────
function openYandexSozlesmeModal() {
    closeAllModals();
    const body  = document.getElementById('sozlesmeModalBody');
    const modal = document.getElementById('yandexSozlesmeModal');
    if (!body || !modal) return;
    body.innerHTML = typeof YANDEX_SOZLESME_HTML !== 'undefined' ? YANDEX_SOZLESME_HTML : '<p>İçerik yüklenemedi.</p>';
    modal.classList.add('active');
}

function closeYandexSozlesmeModal() {
    const modal = document.getElementById('yandexSozlesmeModal');
    if (modal) modal.classList.remove('active');
}

function openCampaignModal() {
    closeAllModals();
    const modal  = document.getElementById('campaignModal');
    const textEl = document.getElementById('campaignModalText');
    if (!modal || !textEl) return;
    textEl.textContent = currentCampaignText || 'Yükleniyor...';
    modal.classList.add('active');
}

function closeCampaignModal() {
    const modal = document.getElementById('campaignModal');
    if (modal) modal.classList.remove('active');
}

function openContactModal() {
    closeAllModals();
    const modal = document.getElementById('contactModal');
    if (modal) modal.classList.add('active');
}

function closeContactModal() {
    const modal = document.getElementById('contactModal');
    if (modal) modal.classList.remove('active');
}

// ─── Tüm Modalleri Kapat ──────────────────────────────────────────────────
function closeAllModals() {
    const modalIds = ['withdrawModal', 'bankAccountModal', 'yandexSozlesmeModal', 'campaignModal', 'contactModal', 'withdrawHistoryModal'];
    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    withdrawLoading = false;
}

// ─── Klavye Olayları ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const bankModal = document.getElementById('bankAccountModal');
        if (bankModal && bankModal.classList.contains('active')) { closeBankAccountModal(); return; }
        const contactModal = document.getElementById('contactModal');
        if (contactModal && contactModal.classList.contains('active')) { closeContactModal(); return; }
        const campaignModal = document.getElementById('campaignModal');
        if (campaignModal && campaignModal.classList.contains('active')) { closeCampaignModal(); return; }
        const historyModal = document.getElementById('withdrawHistoryModal');
        if (historyModal && historyModal.classList.contains('active')) { closeWithdrawHistoryModal(); return; }
        closeAllModals();
        return;
    }
    if (e.key === 'Enter') {
        const bankModal = document.getElementById('bankAccountModal');
        if (bankModal && bankModal.classList.contains('active')) {
            const saveBtn = document.getElementById('saveBankAccountBtn');
            if (saveBtn && !saveBtn.disabled) { e.preventDefault(); saveBankAccount(); }
            return;
        }
        const editPlateModal = document.getElementById('editPlateModal');
        if (editPlateModal && editPlateModal.classList.contains('active')) {
            e.preventDefault();
            const checkBtn = document.getElementById('checkPlateBtn');
            if (checkBtn && !checkBtn.disabled) checkPlate();
            return;
        }
        const registerOtpModal = document.getElementById('registerOtpModal');
        if (registerOtpModal && registerOtpModal.classList.contains('active')) {
            e.preventDefault();
            const btn = document.getElementById('registerOtpVerifyBtn');
            if (btn && !btn.disabled) handleRegisterOtpVerify();
            return;
        }
    }
});

// Withdraw modalında Escape tuşu
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
});
