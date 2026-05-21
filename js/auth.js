// ============================================
// RiseGo Sürücü Paneli - Auth Module
// ============================================
// Gereksinim: utils.js önce yüklenmiş olmalı

let selectedCity = '';
let phoneNumber  = '';
let otpTimer     = null;

// Sayfa yüklendiğinde kayıtlı oturumu kontrol et
document.addEventListener('DOMContentLoaded', checkExistingSession);

// ─── Session Check ─────────────────────────────────────────────────────────
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
            phoneNumber  = localStorage.getItem(PHONE_KEY) || '';
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

// ─── City Selection ────────────────────────────────────────────────────────
function handleCitySelect() {
    const select = document.getElementById('citySelect');
    selectedCity = select.value;
    if (selectedCity) {
        document.getElementById('stepCity').classList.remove('active');
        document.getElementById('stepPhone').classList.add('active');
        document.getElementById('selectedCityText').textContent = selectedCity;
        setTimeout(() => { document.getElementById('phoneInput').focus(); }, 300);
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

// ─── Login Handler ─────────────────────────────────────────────────────────
async function handleLogin() {
    const loginBtn  = document.getElementById('loginBtn');
    const btnText   = loginBtn.querySelector('.btn-text');
    const btnLoader = loginBtn.querySelector('.btn-loader');
    const errorEl   = document.getElementById('loginError');

    const rawPhone = document.getElementById('phoneInput').value.replace(/\D/g, '');
    phoneNumber = '+90' + rawPhone;

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    loginBtn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneNumber, city: selectedCity })
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('stepPhone').classList.remove('active');
            document.getElementById('stepOTP').classList.add('active');
            document.getElementById('otpPhoneText').textContent =
                `${formatPhoneDisplay(phoneNumber)} numarasına doğrulama kodu gönderildi`;
            startResendTimer();
            setTimeout(() => { document.querySelector('.otp-input[data-index="0"]').focus(); }, 300);
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

// ─── OTP Handlers ─────────────────────────────────────────────────────────
function handleOTPInput(input) {
    const index = parseInt(input.dataset.index);
    const value = input.value.replace(/\D/g, '');
    if (value.length > 0) {
        input.value = value[0];
        input.classList.add('filled');
        if (index < 5) {
            const next = document.querySelector(`.otp-input[data-index="${index + 1}"]`);
            if (next) next.focus();
        }
    } else {
        input.classList.remove('filled');
    }
    checkOTPComplete();
}

function handleOTPKeydown(event, input) {
    const index = parseInt(input.dataset.index);
    if (event.key === 'Backspace' && !input.value && index > 0) {
        const prev = document.querySelector(`.otp-input[data-index="${index - 1}"]`);
        if (prev) { prev.value = ''; prev.classList.remove('filled'); prev.focus(); }
    }
}

function checkOTPComplete() {
    let otp = '';
    document.querySelectorAll('.otp-input').forEach(i => { otp += i.value; });
    document.getElementById('verifyBtn').disabled = otp.length < 6;
}

function getOTPValue() {
    let otp = '';
    document.querySelectorAll('.otp-input').forEach(i => { otp += i.value; });
    return otp;
}

async function handleVerifyOTP() {
    const verifyBtn = document.getElementById('verifyBtn');
    const btnText   = verifyBtn.querySelector('.btn-text');
    const btnLoader = verifyBtn.querySelector('.btn-loader');
    const errorEl   = document.getElementById('otpError');
    const otp       = getOTPValue();

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    verifyBtn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/auth/verify-otp`, {
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
            showProfilePage();
        } else {
            errorEl.textContent = data.message || 'Geçersiz doğrulama kodu.';
            document.querySelectorAll('.otp-input').forEach(i => { i.value = ''; i.classList.remove('filled'); });
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
    document.querySelectorAll('.otp-input').forEach(i => { i.value = ''; i.classList.remove('filled'); });
    document.getElementById('otpError').textContent = '';
    document.getElementById('verifyBtn').disabled = true;
}

// ─── Resend Timer ──────────────────────────────────────────────────────────
function startResendTimer() {
    const resendBtn  = document.getElementById('resendBtn');
    const timerSpan  = document.getElementById('resendTimer');
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
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
}

async function handleResendOTP() {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneNumber, city: selectedCity })
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

// ─── Registration Flow ─────────────────────────────────────────────────────
function goToRegister() {
    if (!selectedCity) return;
    document.getElementById('stepPhone').classList.remove('active');
    document.getElementById('stepRegister').classList.add('active');
    document.getElementById('registerCityText').textContent = selectedCity;
    document.getElementById('registerError').textContent = '';
    const phoneInput = document.getElementById('phoneInput').value.replace(/\D/g, '');
    if (phoneInput.length === 10) {
        document.getElementById('regPhone').value = formatPhoneForDisplay(phoneInput);
    }
    document.getElementById('regFirstName').focus();
}

function backFromRegister() {
    document.getElementById('stepRegister').classList.remove('active');
    document.getElementById('stepPhone').classList.add('active');
    document.getElementById('registerError').textContent = '';
}

async function handleRegister(event) {
    event.preventDefault();
    const firstName         = document.getElementById('regFirstName').value.trim();
    const lastName          = document.getElementById('regLastName').value.trim();
    const regPhoneRaw       = document.getElementById('regPhone').value.replace(/\D/g, '');
    const tcNo              = document.getElementById('regTcNo').value.trim();
    const licenseNo         = document.getElementById('regLicenseNo').value.trim();
    const licenseIssueDate  = document.getElementById('regLicenseIssueDate').value;
    const licenseExpiryDate = document.getElementById('regLicenseExpiryDate').value;
    const birthDate         = document.getElementById('regBirthDate').value;
    const errorEl           = document.getElementById('registerError');
    const btn               = document.getElementById('registerSubmitBtn');
    const btnText           = btn.querySelector('.btn-text');
    const btnLoader         = btn.querySelector('.btn-loader');

    if (regPhoneRaw.length !== 10) { errorEl.textContent = 'Geçerli bir telefon numarası giriniz (10 hane).'; return; }
    if (tcNo.length !== 11)        { errorEl.textContent = 'TC kimlik numarası 11 haneli olmalıdır.'; return; }

    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        const normalizedPhone = '+90' + regPhoneRaw;
        const response = await fetch(`${API_BASE}/drivers/register/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName, lastName, phone: normalizedPhone, city: selectedCity,
                taxIdentificationNumber: tcNo, driverLicenseNumber: licenseNo,
                driverLicenseIssueDate: licenseIssueDate, driverLicenseExpiryDate: licenseExpiryDate,
                birthDate, country: 'tur'
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

// ─── Register OTP Modal ────────────────────────────────────────────────────
function showRegisterOtpModal(phone) {
    document.getElementById('registerOtpPhoneText').textContent =
        `${formatPhoneDisplay(phone)} numarasına gönderilen kodu giriniz`;
    document.getElementById('registerOtpError').textContent = '';
    document.getElementById('registerOtpVerifyBtn').disabled = true;
    document.querySelectorAll('#registerOtpModal .otp-input').forEach(inp => { inp.value = ''; inp.classList.remove('filled'); });
    document.getElementById('registerOtpModal').classList.add('active');
    setTimeout(() => document.querySelector('#registerOtpModal .otp-input[data-index="0"]')?.focus(), 200);
}

function closeRegisterOtpModal() {
    document.getElementById('registerOtpModal').classList.remove('active');
    document.getElementById('registerOtpError').textContent = '';
}

function handleRegisterOtpInput(input) {
    const val = input.value.replace(/\D/g, '');
    input.value = val ? val[0] : '';
    input.classList.toggle('filled', !!input.value);
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
        if (prev) { prev.value = ''; prev.classList.remove('filled'); prev.focus(); }
    }
}

function handleRegisterOtpPaste(event) {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').substring(0, 6);
    const inputs = document.querySelectorAll('#registerOtpModal .otp-input');
    let i = 0;
    for (const inp of inputs) { inp.value = pasted[i] || ''; inp.classList.toggle('filled', !!inp.value); i++; }
    if (pasted.length > 0) inputs[Math.min(pasted.length, 5)].focus();
    checkRegisterOtpComplete();
}

function checkRegisterOtpComplete() {
    document.getElementById('registerOtpVerifyBtn').disabled = getRegisterOtpValue().length < 6;
}

function getRegisterOtpValue() {
    let otp = '';
    document.querySelectorAll('#registerOtpModal .otp-input').forEach(inp => { otp += inp.value; });
    return otp;
}

async function handleRegisterOtpVerify() {
    const otp = getRegisterOtpValue();
    if (otp.length !== 6) return;
    const btn       = document.getElementById('registerOtpVerifyBtn');
    const btnText   = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    const errorEl   = document.getElementById('registerOtpError');

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
            document.querySelectorAll('#registerOtpModal .otp-input').forEach(inp => { inp.value = ''; inp.classList.remove('filled'); });
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

// ─── Logout ────────────────────────────────────────────────────────────────
function handleLogout() {
    const token = localStorage.getItem(SESSION_KEY);
    if (token) {
        fetch(`${API_BASE}/auth/session`, { method: 'DELETE', headers: { 'X-Session-Token': token } }).catch(() => {});
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CITY_KEY);
    localStorage.removeItem(PHONE_KEY);

    currentDriverData  = null;
    phoneNumber        = '';
    selectedCity       = '';
    tripCountCache     = {};
    currentPeriod      = 'daily';
    currentCampaignText = '';
    leaderboardLoaded  = false;

    document.getElementById('citySelect').value  = '';
    document.getElementById('phoneInput').value  = '';
    document.getElementById('loginBtn').disabled = true;
    document.getElementById('loginError').textContent = '';
    clearOTPInputs();

    document.getElementById('profilePage').classList.remove('active');
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('stepOTP').classList.remove('active');
    document.getElementById('stepPhone').classList.remove('active');
    document.getElementById('stepRegister').classList.remove('active');
    document.getElementById('stepCity').classList.add('active');
    closeRegisterOtpModal();

    const campaignEl = document.getElementById('profileCampaignText');
    if (campaignEl) campaignEl.textContent = 'Yükleniyor...';
    const ibanInput   = document.getElementById('bankIbanInput');
    const holderInput = document.getElementById('bankAccountHolderInput');
    if (ibanInput)   ibanInput.value   = '';
    if (holderInput) holderInput.value = '';
    updateBankAccountPreview('', '');
    setBankAccountMessage('', '');
}
