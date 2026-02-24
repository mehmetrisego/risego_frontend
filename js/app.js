// ============================================
// RiseGo Sürücü Paneli - Frontend Application
// ============================================
// API Base: localhost'ta geliştirme sunucusu, aksi halde Railway backend kullanılır.
const API_BASE = (function() {
    const isLocal = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isLocal) return 'http://localhost:3000/api';
    return 'https://risegobackend-production.up.railway.app/api';
})();
const SESSION_KEY = 'risego_session';
const CITY_KEY = 'risego_city';
const PHONE_KEY = 'risego_phone';

let selectedCity = '';
let phoneNumber = '';
let otpTimer = null;
let currentDriverData = null;

// Sayfa yüklendiğinde kayıtlı oturumu kontrol et
document.addEventListener('DOMContentLoaded', checkExistingSession);

async function checkExistingSession() {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return;

    const loginPage = document.getElementById('loginPage');
    const loginCard = loginPage.querySelector('.login-card');
    const originalContent = loginCard.innerHTML;

    loginCard.innerHTML = '<div class="session-loading"><div class="spinner-large"></div><p>Oturum kontrol ediliyor...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/auth/session`, {
            headers: { 'X-Session-Token': token }
        });
        const data = await response.json();

        if (data.success && data.driver) {
            currentDriverData = data.driver;
            selectedCity = localStorage.getItem(CITY_KEY) || '';
            phoneNumber = localStorage.getItem(PHONE_KEY) || '';
            showProfilePage();
            return;
        }
    } catch (e) {
        console.error('Session check error:', e);
    }

    // Oturum geçersiz - temizle
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CITY_KEY);
    localStorage.removeItem(PHONE_KEY);
    loginCard.innerHTML = originalContent;
}

// ============================================
// City Selection
// ============================================

function handleCitySelect() {
    const select = document.getElementById('citySelect');
    selectedCity = select.value;

    if (selectedCity) {
        // Show phone step with animation
        document.getElementById('stepCity').classList.remove('active');
        document.getElementById('stepPhone').classList.add('active');
        document.getElementById('selectedCityText').textContent = selectedCity;

        // Focus phone input
        setTimeout(() => {
            document.getElementById('phoneInput').focus();
        }, 300);
    }
}

function changeCity() {
    selectedCity = '';
    document.getElementById('stepPhone').classList.remove('active');
    document.getElementById('stepCity').classList.add('active');
    document.getElementById('citySelect').value = '';
    document.getElementById('phoneInput').value = '';
    document.getElementById('loginBtn').disabled = true;
    document.getElementById('loginError').textContent = '';
}

// ============================================
// Phone Number Formatting
// ============================================

function formatPhone(input) {
    let value = input.value.replace(/\D/g, '');

    // Limit to 10 digits
    if (value.length > 10) {
        value = value.substring(0, 10);
    }

    // Format: 5XX XXX XX XX
    let formatted = '';
    if (value.length > 0) {
        formatted = value.substring(0, 3);
    }
    if (value.length > 3) {
        formatted += ' ' + value.substring(3, 6);
    }
    if (value.length > 6) {
        formatted += ' ' + value.substring(6, 8);
    }
    if (value.length > 8) {
        formatted += ' ' + value.substring(8, 10);
    }

    input.value = formatted;

    // Enable login button if phone is complete
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = value.length < 10;

    // Clear error
    document.getElementById('loginError').textContent = '';
}

// ============================================
// Login Handler
// ============================================

async function handleLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnLoader = loginBtn.querySelector('.btn-loader');
    const errorEl = document.getElementById('loginError');

    // Get phone number (clean)
    const rawPhone = document.getElementById('phoneInput').value.replace(/\D/g, '');
    phoneNumber = '+90' + rawPhone;

    // Show loading
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    loginBtn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phoneNumber,
                city: selectedCity
            })
        });

        const data = await response.json();

        if (data.success) {
            // Show OTP step
            document.getElementById('stepPhone').classList.remove('active');
            document.getElementById('stepOTP').classList.add('active');
            document.getElementById('otpPhoneText').textContent =
                `${formatPhoneDisplay(phoneNumber)} numarasına doğrulama kodu gönderildi`;

            // Start resend timer
            startResendTimer();

            // Focus first OTP input
            setTimeout(() => {
                document.querySelector('.otp-input[data-index="0"]').focus();
            }, 300);
        } else {
            errorEl.textContent = data.message || 'Bir hata oluştu.';
        }
    } catch (error) {
        errorEl.textContent = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
        console.error('Login error:', error);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        loginBtn.disabled = false;
    }
}

function formatPhoneDisplay(phone) {
    // +905XXXXXXXXX -> +90 5XX XXX XX XX
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 12) {
        return `+${digits.substring(0, 2)} ${digits.substring(2, 5)} ${digits.substring(5, 8)} ${digits.substring(8, 10)} ${digits.substring(10, 12)}`;
    }
    return phone;
}

// ============================================
// OTP Handlers
// ============================================

function handleOTPInput(input) {
    const index = parseInt(input.dataset.index);
    const value = input.value.replace(/\D/g, '');

    if (value.length > 0) {
        input.value = value[0];
        input.classList.add('filled');

        // Move to next input
        if (index < 5) {
            const nextInput = document.querySelector(`.otp-input[data-index="${index + 1}"]`);
            if (nextInput) nextInput.focus();
        }
    } else {
        input.classList.remove('filled');
    }

    // Check if all inputs are filled
    checkOTPComplete();
}

function handleOTPKeydown(event, input) {
    const index = parseInt(input.dataset.index);

    if (event.key === 'Backspace' && !input.value && index > 0) {
        const prevInput = document.querySelector(`.otp-input[data-index="${index - 1}"]`);
        if (prevInput) {
            prevInput.value = '';
            prevInput.classList.remove('filled');
            prevInput.focus();
        }
    }
}

function checkOTPComplete() {
    const inputs = document.querySelectorAll('.otp-input');
    let otp = '';
    inputs.forEach(input => { otp += input.value; });

    const verifyBtn = document.getElementById('verifyBtn');
    verifyBtn.disabled = otp.length < 6;
}

function getOTPValue() {
    const inputs = document.querySelectorAll('.otp-input');
    let otp = '';
    inputs.forEach(input => { otp += input.value; });
    return otp;
}

async function handleVerifyOTP() {
    const verifyBtn = document.getElementById('verifyBtn');
    const btnText = verifyBtn.querySelector('.btn-text');
    const btnLoader = verifyBtn.querySelector('.btn-loader');
    const errorEl = document.getElementById('otpError');

    const otp = getOTPValue();

    // Show loading
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    verifyBtn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phoneNumber,
                otp: otp
            })
        });

        const data = await response.json();

        if (data.success) {
            currentDriverData = data.driver;

            if (data.sessionToken) {
                localStorage.setItem(SESSION_KEY, data.sessionToken);
                localStorage.setItem(CITY_KEY, selectedCity);
                localStorage.setItem(PHONE_KEY, phoneNumber);
            }

            showProfilePage();
        } else {
            errorEl.textContent = data.message || 'Geçersiz doğrulama kodu.';
            // Clear OTP inputs
            document.querySelectorAll('.otp-input').forEach(input => {
                input.value = '';
                input.classList.remove('filled');
            });
            document.querySelector('.otp-input[data-index="0"]').focus();
        }
    } catch (error) {
        errorEl.textContent = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
        console.error('Verify error:', error);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        verifyBtn.disabled = false;
    }
}

function backToPhone() {
    document.getElementById('stepOTP').classList.remove('active');
    document.getElementById('stepPhone').classList.add('active');
    clearOTPInputs();
    clearResendTimer();
}

function clearOTPInputs() {
    document.querySelectorAll('.otp-input').forEach(input => {
        input.value = '';
        input.classList.remove('filled');
    });
    document.getElementById('otpError').textContent = '';
    document.getElementById('verifyBtn').disabled = true;
}

// ============================================
// Resend Timer
// ============================================

function startResendTimer() {
    const resendBtn = document.getElementById('resendBtn');
    const timerSpan = document.getElementById('resendTimer');
    let seconds = 60;

    resendBtn.disabled = true;
    timerSpan.textContent = `(${seconds}s)`;

    clearResendTimer();

    otpTimer = setInterval(() => {
        seconds--;
        timerSpan.textContent = `(${seconds}s)`;

        if (seconds <= 0) {
            clearInterval(otpTimer);
            resendBtn.disabled = false;
            timerSpan.textContent = '';
        }
    }, 1000);
}

function clearResendTimer() {
    if (otpTimer) {
        clearInterval(otpTimer);
        otpTimer = null;
    }
}

async function handleResendOTP() {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phoneNumber,
                city: selectedCity
            })
        });

        const data = await response.json();

        if (data.success) {
            startResendTimer();
            document.getElementById('otpError').textContent = '';
        } else {
            document.getElementById('otpError').textContent = data.message || 'Kod gönderilemedi.';
        }
    } catch (error) {
        document.getElementById('otpError').textContent = 'Sunucuya bağlanılamadı.';
    }
}

// ============================================
// Profile Page
// ============================================

let currentPeriod = 'all';
let tripCountCache = {};

function showProfilePage() {
    const driver = currentDriverData;

    const name = driver.name || 'Sürücü';
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileCity').textContent = selectedCity;
    document.getElementById('profilePhone').textContent = formatPhoneDisplay(phoneNumber);
    document.getElementById('profileCar').textContent = driver.car || 'Araç atanmamış';
    document.getElementById('editCarBtn').style.display = driver.carId ? 'inline-flex' : 'none';
    document.getElementById('profileTrips').textContent = driver.tripCount ?? '0';
    document.getElementById('profileBalance').textContent = driver.balance || '-';

    const nameParts = name.split(' ');
    const initials = nameParts.length >= 2
        ? nameParts[0][0] + nameParts[nameParts.length - 1][0]
        : name.substring(0, 2);
    document.getElementById('profileInitials').textContent = initials.toUpperCase();

    // Reset trip cache and period
    tripCountCache = { all: driver.tripCount ?? 0 };
    currentPeriod = 'all';
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.period === 'all');
    });

    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('profilePage').classList.add('active');

    clearResendTimer();
}

// ============================================
// Trip Period Selector
// ============================================

async function changeTripPeriod(period) {
    if (period === currentPeriod) return;
    currentPeriod = period;

    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.period === period);
    });

    // Cache'de varsa direkt göster
    if (tripCountCache[period] !== undefined) {
        document.getElementById('profileTrips').textContent = tripCountCache[period];
        return;
    }

    // API'den çek
    const tripsEl = document.getElementById('profileTrips');
    const loaderEl = document.getElementById('tripLoader');

    tripsEl.style.display = 'none';
    loaderEl.style.display = 'flex';

    try {
        const response = await fetch(`${API_BASE}/drivers/trip-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                driverId: currentDriverData.id,
                period: period
            })
        });

        const data = await response.json();

        if (data.success) {
            tripCountCache[period] = data.tripCount;
            if (currentPeriod === period) {
                tripsEl.textContent = data.tripCount;
            }
        } else {
            if (currentPeriod === period) {
                tripsEl.textContent = '-';
            }
        }
    } catch (error) {
        console.error('Trip count error:', error);
        if (currentPeriod === period) {
            tripsEl.textContent = '-';
        }
    } finally {
        loaderEl.style.display = 'none';
        tripsEl.style.display = 'block';
    }
}

function handleLogout() {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) {
        fetch(`${API_BASE}/auth/session`, {
            method: 'DELETE',
            headers: { 'X-Session-Token': token }
        }).catch(() => {});
    }

    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CITY_KEY);
    localStorage.removeItem(PHONE_KEY);

    currentDriverData = null;
    phoneNumber = '';
    selectedCity = '';
    tripCountCache = {};
    currentPeriod = 'all';
    leaderboardLoaded = false;

    // Reset all forms
    document.getElementById('citySelect').value = '';
    document.getElementById('phoneInput').value = '';
    document.getElementById('loginBtn').disabled = true;
    document.getElementById('loginError').textContent = '';
    clearOTPInputs();

    // Show login page, city step
    document.getElementById('profilePage').classList.remove('active');
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('stepOTP').classList.remove('active');
    document.getElementById('stepPhone').classList.remove('active');
    document.getElementById('stepCity').classList.add('active');
}

// ============================================
// Leaderboard
// ============================================

let leaderboardLoaded = false;

function openLeaderboard() {
    document.getElementById('profilePage').classList.remove('active');
    document.getElementById('leaderboardPage').classList.add('active');

    if (!leaderboardLoaded) {
        fetchLeaderboard();
    }
}

function closeLeaderboard() {
    document.getElementById('leaderboardPage').classList.remove('active');
    document.getElementById('profilePage').classList.add('active');
}

async function fetchLeaderboard() {
    const container = document.getElementById('leaderboardContent');
    container.innerHTML = '<div class="leaderboard-loading"><div class="spinner-large"></div><p>Aylık sıralama yükleniyor...<br><span style="font-size:12px;color:#666">İlk yüklemede biraz zaman alabilir</span></p></div>';

    try {
        const driverId = currentDriverData ? currentDriverData.id : '';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(`${API_BASE}/leaderboard?driverId=${encodeURIComponent(driverId)}`, {
            signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = '<p class="leaderboard-error">Sıralama tablosu yüklenemedi.</p>';
            return;
        }

        leaderboardLoaded = true;
        renderLeaderboard(data.leaderboard, data.currentUser, data.totalDrivers);
    } catch (error) {
        console.error('Leaderboard error:', error);
        const msg = error.name === 'AbortError'
            ? 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.'
            : 'Sunucuya bağlanılamadı.';
        container.innerHTML = `<p class="leaderboard-error">${msg}</p><button class="btn-retry" onclick="leaderboardLoaded=false;fetchLeaderboard()">Tekrar Dene</button>`;
    }
}

function renderLeaderboard(list, currentUser, totalDrivers) {
    const container = document.getElementById('leaderboardContent');
    const myId = currentDriverData ? currentDriverData.id : '';

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const now = new Date();
    const monthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    let html = `<p class="leaderboard-total">${monthLabel} — ${totalDrivers} sürücü arasında</p>`;

    if (list.length === 0) {
        html += '<p class="leaderboard-error">Bu ay henüz tamamlanmış yolculuk yok.</p>';
        container.innerHTML = html;
        return;
    }

    html += '<div class="leaderboard-list">';

    list.forEach(entry => {
        const isMe = entry.id === myId;
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
            <div class="lb-separator">
                <span>&#8226; &#8226; &#8226;</span>
            </div>
            <div class="lb-row lb-row-me lb-row-bottom">
                <div class="lb-rank">${currentUser.rank}</div>
                <div class="lb-name">${currentUser.initials} <span class="lb-you">(Sen)</span></div>
                <div class="lb-trips">${currentUser.tripCount} <span class="lb-trips-label">yolculuk</span></div>
            </div>`;
    }

    container.innerHTML = html;
}

// ============================================
// Car Plate Edit
// ============================================

function openEditPlate() {
    if (!currentDriverData || !currentDriverData.carId) {
        return;
    }
    document.getElementById('plateInput').value = currentDriverData.carNumber || '';
    document.getElementById('plateError').textContent = '';
    document.getElementById('editPlateModal').classList.add('active');
    setTimeout(() => document.getElementById('plateInput').focus(), 200);
}

function closeEditPlate() {
    document.getElementById('editPlateModal').classList.remove('active');
    document.getElementById('plateError').textContent = '';
}

async function savePlate() {
    const input = document.getElementById('plateInput');
    const newPlate = input.value.trim().toUpperCase();
    const errorEl = document.getElementById('plateError');
    const btn = document.getElementById('savePlateBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    if (newPlate.length < 3) {
        errorEl.textContent = 'Geçerli bir plaka numarası giriniz.';
        return;
    }

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/drivers/update-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                carId: currentDriverData.carId,
                newPlate: newPlate
            })
        });

        const data = await response.json();

        if (data.success) {
            currentDriverData.carNumber = data.newPlate;
            const carText = currentDriverData.car.replace(/Plaka: .+$/, `Plaka: ${data.newPlate}`);
            currentDriverData.car = carText;
            document.getElementById('profileCar').textContent = carText;
            closeEditPlate();
        } else {
            errorEl.textContent = data.message || 'Güncelleme başarısız.';
        }
    } catch (error) {
        errorEl.textContent = 'Sunucuya bağlanılamadı.';
        console.error('Plate update error:', error);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

// ============================================
// Enter key handler
// ============================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const activeStep = document.querySelector('.form-step.active');
        if (!activeStep) return;

        if (activeStep.id === 'stepPhone') {
            const loginBtn = document.getElementById('loginBtn');
            if (!loginBtn.disabled) handleLogin();
        } else if (activeStep.id === 'stepOTP') {
            const verifyBtn = document.getElementById('verifyBtn');
            if (!verifyBtn.disabled) handleVerifyOTP();
        }
    }
});

