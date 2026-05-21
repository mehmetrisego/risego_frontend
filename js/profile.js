// ============================================
// RiseGo Sürücü Paneli - Profile Module
// ============================================
// Gereksinim: utils.js, bankAccount.js, withdraw.js önce yüklenmiş olmalı

var currentDriverData = null;
var carBrandsWithModels = []; // [{ brand, models: [...] }]
var tripCountCache  = {};
var currentPeriod   = 'daily';
var currentCampaignText = '';

// ─── Profil Sayfası ───────────────────────────────────────────────────────
async function showProfilePage() {
    try {
        const loginPage = document.getElementById('loginPage');
        if (loginPage) loginPage.classList.remove('active');
        
        const profilePage = document.getElementById('profilePage');
        if (profilePage) profilePage.classList.add('active');
        
        const stepOTP = document.getElementById('stepOTP');
        if (stepOTP) stepOTP.classList.remove('active');
        
        const stepPhone = document.getElementById('stepPhone');
        if (stepPhone) stepPhone.classList.remove('active');
        
        const stepReg = document.getElementById('stepRegister');
        if (stepReg) stepReg.classList.remove('active');
        
        const stepCity = document.getElementById('stepCity');
        if (stepCity) stepCity.classList.add('active');

        if (!currentDriverData) {
            console.warn('showProfilePage çağrıldı fakat currentDriverData boş.');
            return;
        }

        // Temel bilgileri doldur
        try {
            const name = currentDriverData.name || 'Sürücü';
            document.getElementById('profileName').textContent = name;
            document.getElementById('profileCity').textContent = selectedCity || currentDriverData.city || '';
            const phoneStr = currentDriverData.phone || phoneNumber || '';
            if (phoneStr && typeof formatPhoneDisplay === 'function') {
                document.getElementById('profilePhone').textContent = formatPhoneDisplay(phoneStr);
            } else {
                document.getElementById('profilePhone').textContent = phoneStr;
            }

            // İnisiyaller
            const nameParts = name.split(' ').filter(Boolean);
            const initials = nameParts.length >= 2 
                ? nameParts[0][0] + nameParts[nameParts.length - 1][0] 
                : (nameParts[0] ? nameParts[0].substring(0, 2) : 'RG');
            document.getElementById('profileInitials').textContent = initials.toUpperCase();
        } catch (e) { console.error('Temel bilgiler doldurulurken hata:', e); }

        // Araç bilgisi
        try {
            const carEl = document.getElementById('profileCar');
            const editCarBtn = document.getElementById('editCarBtn');
            if (currentDriverData.car) {
                carEl.textContent = currentDriverData.car;
                if (editCarBtn) editCarBtn.style.display = 'inline-flex';
            } else {
                carEl.textContent = '-';
                if (editCarBtn) editCarBtn.style.display = 'none';
            }
        } catch (e) { console.error('Araç bilgisi doldurulurken hata:', e); }

        // Bakiye
        try {
            const balEl = document.getElementById('profileBalance');
            if (balEl && currentDriverData.balance) {
                balEl.textContent = currentDriverData.balance;
            }
            loadBalance(); // Yine de güncelini çekmek için asenkron çağrıyı yap
        } catch (e) { console.error('Bakiye yüklenirken hata:', e); }

        // Trip count (daily)
        try { changeTripPeriod('daily'); } catch (e) { console.error('Trip period hatası:', e); }

        // Banka hesabı
        try { loadBankAccount(); } catch (e) { console.error('Banka hesabı yüklenirken hata:', e); }

        // Kampanya
        try { fetchCampaign(); } catch (e) { console.error('Kampanya çekilirken hata:', e); }

    } catch (globalError) {
        console.error('showProfilePage genel hata:', globalError);
    }
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
