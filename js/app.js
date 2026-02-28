// ============================================
// RiseGo Sürücü Paneli - Frontend Application
// ============================================
// API Base: localhost'ta veya file:// ile açıldığında local sunucu, aksi halde Railway backend.
const API_BASE = (function () {
    if (typeof window === 'undefined') return 'http://localhost:3000/api';
    const h = window.location.hostname;
    const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '' || window.location.protocol === 'file:';
    if (isLocal) return 'http://localhost:3000/api';
    return 'https://risegobackend-production-57e5.up.railway.app/api';
})();
const SESSION_KEY = 'risego_session';
const CITY_KEY = 'risego_city';
const PHONE_KEY = 'risego_phone';

/**
 * Oturum token'ı ile API isteği yapar. 401 alırsa oturumu temizleyip login sayfasına yönlendirir.
 */
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem(SESSION_KEY);
    const headers = { ...(options.headers || {}) };
    if (token) headers['X-Session-Token'] = token;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        handleLogout();
        throw new Error('Oturum süresi doldu. Lütfen tekrar giriş yapın.');
    }
    return res;
}

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
    document.getElementById('stepRegister').classList.remove('active');
    document.getElementById('stepCity').classList.add('active');
    document.getElementById('citySelect').value = '';
    document.getElementById('phoneInput').value = '';
    document.getElementById('loginBtn').disabled = true;
    document.getElementById('loginError').textContent = '';
}

// ============================================
// Registration Flow
// ============================================

function goToRegister() {
    if (!selectedCity) return;
    document.getElementById('stepPhone').classList.remove('active');
    document.getElementById('stepRegister').classList.add('active');
    document.getElementById('registerCityText').textContent = selectedCity;
    document.getElementById('registerError').textContent = '';
    // Pre-fill phone from stepPhone if user already entered it
    const phoneInput = document.getElementById('phoneInput').value.replace(/\D/g, '');
    if (phoneInput.length === 10) {
        const regPhone = document.getElementById('regPhone');
        regPhone.value = formatPhoneForDisplay(phoneInput);
    }
    document.getElementById('regFirstName').focus();
}

function backFromRegister() {
    document.getElementById('stepRegister').classList.remove('active');
    document.getElementById('stepPhone').classList.add('active');
    document.getElementById('registerError').textContent = '';
}

function formatPhoneForDisplay(val) {
    if (val.length <= 3) return val;
    if (val.length <= 6) return val.substring(0, 3) + ' ' + val.substring(3, 6);
    if (val.length <= 8) return val.substring(0, 3) + ' ' + val.substring(3, 6) + ' ' + val.substring(6, 8);
    return val.substring(0, 3) + ' ' + val.substring(3, 6) + ' ' + val.substring(6, 8) + ' ' + val.substring(8, 10);
}

function formatRegPhone(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 10) value = value.substring(0, 10);
    let formatted = '';
    if (value.length > 0) formatted = value.substring(0, 3);
    if (value.length > 3) formatted += ' ' + value.substring(3, 6);
    if (value.length > 6) formatted += ' ' + value.substring(6, 8);
    if (value.length > 8) formatted += ' ' + value.substring(8, 10);
    input.value = formatted;
}

async function handleRegister(event) {
    event.preventDefault();

    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const regPhoneRaw = document.getElementById('regPhone').value.replace(/\D/g, '');
    const phone = '+90' + regPhoneRaw;
    const tcNo = document.getElementById('regTcNo').value.trim();
    const licenseNo = document.getElementById('regLicenseNo').value.trim();
    const licenseIssueDate = document.getElementById('regLicenseIssueDate').value;
    const licenseExpiryDate = document.getElementById('regLicenseExpiryDate').value;
    const birthDate = document.getElementById('regBirthDate').value;

    const errorEl = document.getElementById('registerError');
    const btn = document.getElementById('registerSubmitBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    if (regPhoneRaw.length !== 10) {
        errorEl.textContent = 'Geçerli bir telefon numarası giriniz (10 hane).';
        return;
    }
    if (tcNo.length !== 11) {
        errorEl.textContent = 'TC kimlik numarası 11 haneli olmalıdır.';
        return;
    }

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        // Önce OTP gönder (sürücü henüz oluşturulmaz - telefon doğrulaması)
        const normalizedPhone = '+90' + regPhoneRaw;
        const response = await fetch(`${API_BASE}/drivers/register/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName,
                lastName,
                phone: normalizedPhone,
                city: selectedCity,
                taxIdentificationNumber: tcNo,
                driverLicenseNumber: licenseNo,
                driverLicenseIssueDate: licenseIssueDate,
                driverLicenseExpiryDate: licenseExpiryDate,
                birthDate,
                country: 'tur'
            })
        });

        const data = await response.json();

        if (data.success) {
            phoneNumber = normalizedPhone;
            showRegisterOtpModal(normalizedPhone);
            backFromRegister();
        } else {
            errorEl.textContent = data.message || 'Kod gönderilemedi. Lütfen tekrar deneyin.';
        }
    } catch (error) {
        errorEl.textContent = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
        console.error('Register error:', error);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

// ============================================
// Kayıt OTP Modal (sadece rakam, doğruysa profile yönlendir)
// ============================================

function showRegisterOtpModal(phone) {
    document.getElementById('registerOtpPhoneText').textContent =
        `${formatPhoneDisplay(phone)} numarasına gönderilen kodu giriniz`;
    document.getElementById('registerOtpError').textContent = '';
    document.getElementById('registerOtpVerifyBtn').disabled = true;
    document.querySelectorAll('#registerOtpModal .otp-input').forEach(inp => {
        inp.value = '';
        inp.classList.remove('filled');
    });
    document.getElementById('registerOtpModal').classList.add('active');
    setTimeout(() => document.querySelector('#registerOtpModal .otp-input[data-index="0"]')?.focus(), 200);
}

function closeRegisterOtpModal() {
    document.getElementById('registerOtpModal').classList.remove('active');
    document.getElementById('registerOtpError').textContent = '';
}

function handleRegisterOtpInput(input) {
    // Sadece rakam kabul et - harf girişini engelle
    const val = input.value.replace(/\D/g, '');
    input.value = val ? val[0] : '';
    if (input.value) input.classList.add('filled');
    else input.classList.remove('filled');

    const index = parseInt(input.dataset.index);
    if (input.value && index < 5) {
        const next = document.querySelector(`#registerOtpModal .otp-input[data-index="${index + 1}"]`);
        if (next) next.focus();
    }
    checkRegisterOtpComplete();
}

function handleRegisterOtpKeydown(event, input) {
    const index = parseInt(input.dataset.index);
    if (event.key === 'Backspace' && !input.value && index > 0) {
        const prev = document.querySelector(`#registerOtpModal .otp-input[data-index="${index - 1}"]`);
        if (prev) {
            prev.value = '';
            prev.classList.remove('filled');
            prev.focus();
        }
    }
}

function handleRegisterOtpPaste(event) {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').substring(0, 6);
    const inputs = document.querySelectorAll('#registerOtpModal .otp-input');
    let i = 0;
    for (const inp of inputs) {
        inp.value = pasted[i] || '';
        inp.classList.toggle('filled', !!inp.value);
        i++;
    }
    if (pasted.length > 0) inputs[Math.min(pasted.length, 5)].focus();
    checkRegisterOtpComplete();
}

function checkRegisterOtpComplete() {
    const otp = getRegisterOtpValue();
    document.getElementById('registerOtpVerifyBtn').disabled = otp.length < 6;
}

function getRegisterOtpValue() {
    let otp = '';
    document.querySelectorAll('#registerOtpModal .otp-input').forEach(inp => { otp += inp.value; });
    return otp;
}

async function handleRegisterOtpVerify() {
    const otp = getRegisterOtpValue();
    if (otp.length !== 6) return;

    const btn = document.getElementById('registerOtpVerifyBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    const errorEl = document.getElementById('registerOtpError');

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/drivers/register/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneNumber, otp })
        });
        const data = await response.json();

        if (data.success) {
            currentDriverData = data.driver;
            if (data.sessionToken) {
                localStorage.setItem(SESSION_KEY, data.sessionToken);
                localStorage.setItem(CITY_KEY, selectedCity);
                localStorage.setItem(PHONE_KEY, phoneNumber);
            }
            closeRegisterOtpModal();
            showProfilePage();
        } else {
            errorEl.textContent = data.message || 'Geçersiz doğrulama kodu.';
            document.querySelectorAll('#registerOtpModal .otp-input').forEach(inp => {
                inp.value = '';
                inp.classList.remove('filled');
            });
            document.querySelector('#registerOtpModal .otp-input[data-index="0"]')?.focus();
            btn.disabled = false;
        }
    } catch (error) {
        errorEl.textContent = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
        btn.disabled = false;
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
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
    document.getElementById('editCarBtn').style.display = 'inline-flex';
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

    // Kampanya verisini yükle
    fetchCampaign();

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
        const response = await authenticatedFetch(`${API_BASE}/drivers/trip-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ period })
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
        }).catch(() => { });
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
    document.getElementById('stepRegister').classList.remove('active');
    document.getElementById('stepCity').classList.add('active');
    closeRegisterOtpModal();

    // Kampanya metnini sıfırla
    const campaignEl = document.getElementById('profileCampaignText');
    if (campaignEl) campaignEl.textContent = 'Yükleniyor...';
}

// ============================================
// Leaderboard
// ============================================

let leaderboardLoaded = false;

// ============================================
// Güncel Kampanya
// ============================================

/**
 * API'den aktif kampanyayı çeker ve profil sayfasındaki kartı günceller.
 * Aktif kampanya yoksa varsayılan mesaj gösterilir.
 */
async function fetchCampaign() {
    const campaignEl = document.getElementById('profileCampaignText');
    if (!campaignEl) return;

    try {
        const response = await fetch(`${API_BASE}/campaign`);
        const data = await response.json();

        if (data.success && data.campaign && data.campaign.active && data.campaign.text) {
            campaignEl.textContent = data.campaign.text;
            // Aktif kampanya stili
            const card = document.getElementById('campaignCardFrontend');
            if (card) card.classList.add('campaign-active');
        } else {
            campaignEl.textContent = 'Şu anda aktif kampanya bulunmamaktadır.';
            const card = document.getElementById('campaignCardFrontend');
            if (card) card.classList.remove('campaign-active');
        }
    } catch (error) {
        console.error('[Campaign] Kampanya yükleme hatası:', error);
        campaignEl.textContent = 'Şu anda aktif kampanya bulunmamaktadır.';
    }
}

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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        const response = await authenticatedFetch(`${API_BASE}/leaderboard`, {
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

    let html = `<p class="leaderboard-total">${monthLabel}</p>`;

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
// Car Change Flow - Plaka kontrolü, onay, yeni kayıt
// ============================================

let pendingPlate = '';
let pendingCar = null;

function openEditPlate() {
    if (!currentDriverData) return;
    document.getElementById('plateInput').value = currentDriverData.carNumber || '';
    document.getElementById('plateError').textContent = '';
    document.getElementById('editPlateModal').classList.add('active');
    setTimeout(() => document.getElementById('plateInput').focus(), 200);
}

function closeEditPlate() {
    document.getElementById('editPlateModal').classList.remove('active');
    document.getElementById('plateError').textContent = '';
    pendingPlate = '';
    pendingCar = null;
}

async function checkPlate() {
    const input = document.getElementById('plateInput');
    const errorEl = document.getElementById('plateError');
    const btn = document.getElementById('checkPlateBtn');
    if (!input || !errorEl || !btn) return;

    const plate = input.value.trim().toUpperCase();

    if (plate.length < 3) {
        errorEl.textContent = 'Geçerli bir plaka numarası giriniz.';
        return;
    }

    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'flex';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/check-plate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate })
        });

        const data = await response.json();

        if (data.success) {
            pendingPlate = plate;
            if (data.found && data.car) {
                pendingCar = data.car;
                document.getElementById('editPlateModal').classList.remove('active');
                document.getElementById('plateError').textContent = '';
                showConfirmCarModal(data.car);
            } else {
                pendingCar = null;
                document.getElementById('editPlateModal').classList.remove('active');
                document.getElementById('plateError').textContent = '';
                showNewCarModal(plate);
            }
        } else {
            errorEl.textContent = data.message || 'Plaka kontrol edilemedi.';
        }
    } catch (error) {
        errorEl.textContent = 'Sunucuya bağlanılamadı.';
        console.error('Check plate error:', error);
    } finally {
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

function showConfirmCarModal(car) {
    document.getElementById('confirmCarBrand').textContent = car.brand || '-';
    document.getElementById('confirmCarModel').textContent = car.model || '-';
    document.getElementById('confirmCarYear').textContent = car.year ? String(car.year) : '-';
    document.getElementById('confirmCarModal').classList.add('active');
}

function closeConfirmCar() {
    document.getElementById('confirmCarModal').classList.remove('active');
    pendingPlate = '';
    pendingCar = null;
}

async function confirmCarChange() {
    if (!pendingCar || !pendingPlate || !currentDriverData) {
        console.error('confirmCarChange: eksik veri', { pendingCar, pendingPlate, currentDriverData: !!currentDriverData });
        alert('Eksik bilgi. Lütfen tekrar deneyin.');
        return;
    }

    const btn = document.getElementById('confirmCarModal').querySelector('.btn-onayla');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/change-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plate: pendingPlate,
                carId: pendingCar.id,
                brand: pendingCar.brand || '',
                model: pendingCar.model || '',
                year: pendingCar.year || ''
            })
        });

        const data = await response.json();

        if (data.success && data.car) {
            updateDriverCarDisplay(data.car);
            closeConfirmCar();
        } else if (data.success) {
            // Başarılı ama car bilgisi yok - pendingCar ile güncelle
            updateDriverCarDisplay({
                id: pendingCar.id,
                brand: pendingCar.brand || '',
                model: pendingCar.model || '',
                year: pendingCar.year || '',
                number: pendingPlate
            });
            closeConfirmCar();
        } else {
            alert(data.message || 'Araç değiştirilemedi.');
        }
    } catch (error) {
        console.error('Confirm car error:', error);
        alert('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.\n\nHata: ' + error.message);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

function showNewCarModal(plate) {
    pendingPlate = plate;
    document.getElementById('newCarPlateDisplay').textContent = `Plaka: ${plate}`;
    document.getElementById('newCarBrand').value = '';
    document.getElementById('newCarModel').value = '';
    document.getElementById('newCarYear').value = '';
    document.getElementById('newCarError').textContent = '';
    loadCarBrandsAndYears();
    document.getElementById('newCarModal').classList.add('active');
}

function closeNewCarModal() {
    document.getElementById('newCarModal').classList.remove('active');
    pendingPlate = '';
}

async function loadCarBrandsAndYears() {
    const brandSelect = document.getElementById('newCarBrand');
    const yearSelect = document.getElementById('newCarYear');

    if (brandSelect.options.length > 1) return;

    try {
        const res = await fetch(`${API_BASE}/drivers/car-brands`);
        const data = await res.json();
        if (data.success && data.brands) {
            brandSelect.innerHTML = '<option value="">Marka seçin...</option>';
            data.brands.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = b;
                brandSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Brands load error:', e);
    }

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '<option value="">Yıl seçin...</option>';
    for (let y = currentYear; y >= 2000; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
}

async function saveNewCar() {
    const brand = document.getElementById('newCarBrand').value.trim();
    const model = document.getElementById('newCarModel').value.trim();
    const year = document.getElementById('newCarYear').value;
    const errorEl = document.getElementById('newCarError');
    const btn = document.getElementById('saveNewCarBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    if (!brand || !model || !year) {
        errorEl.textContent = 'Marka, model ve yıl alanları zorunludur.';
        return;
    }

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/change-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plate: pendingPlate,
                brand,
                model,
                year: parseInt(year, 10)
            })
        });

        const data = await response.json();

        if (data.success && data.car) {
            updateDriverCarDisplay(data.car);
            closeNewCarModal();
        } else {
            errorEl.textContent = data.message || 'Araç kaydedilemedi.';
        }
    } catch (error) {
        errorEl.textContent = 'Sunucuya bağlanılamadı.';
        console.error('Save new car error:', error);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

function updateDriverCarDisplay(car) {
    const carText = `${car.brand || ''} ${car.model || ''} (${car.year || ''}) - Plaka: ${car.number || ''}`;
    currentDriverData.car = carText;
    currentDriverData.carId = car.id;
    currentDriverData.carNumber = car.number;
    document.getElementById('profileCar').textContent = carText;
    document.getElementById('editCarBtn').style.display = 'inline-flex';
}

// ============================================
// Enter key handler
// ============================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        // Araç değiştir modalı açıksa önce onu işle (Enter = Ara)
        const editPlateModal = document.getElementById('editPlateModal');
        if (editPlateModal && editPlateModal.classList.contains('active')) {
            e.preventDefault();
            const checkBtn = document.getElementById('checkPlateBtn');
            if (checkBtn && !checkBtn.disabled) checkPlate();
            return;
        }
        // Kayıt OTP modalı açıksa
        const registerOtpModal = document.getElementById('registerOtpModal');
        if (registerOtpModal && registerOtpModal.classList.contains('active')) {
            const verifyBtn = document.getElementById('registerOtpVerifyBtn');
            if (verifyBtn && !verifyBtn.disabled && getRegisterOtpValue().length === 6) {
                e.preventDefault();
                handleRegisterOtpVerify();
            }
            return;
        }
        // Login sayfasındaysa form-step handler
        const loginPage = document.getElementById('loginPage');
        if (loginPage && loginPage.classList.contains('active')) {
            const activeStep = document.querySelector('.form-step.active');
            if (activeStep) {
                if (activeStep.id === 'stepPhone') {
                    const loginBtn = document.getElementById('loginBtn');
                    if (loginBtn && !loginBtn.disabled) handleLogin();
                } else if (activeStep.id === 'stepOTP') {
                    const verifyBtn = document.getElementById('verifyBtn');
                    if (verifyBtn && !verifyBtn.disabled) handleVerifyOTP();
                }
            }
        }
    }
});

