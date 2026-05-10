// ============================================
// RiseGo Sürücü Paneli - Frontend Application
// ============================================
// API: localhost'ta yerel backend; üretimde AWS Lightsail.
const PRODUCTION_API = 'https://api.risegodriver.com/api';
const API_BASE = (function () {
    if (typeof window === 'undefined') return PRODUCTION_API;
    const h = window.location.hostname;
    const isLocalDev = h === 'localhost' || h === '127.0.0.1';
    if (isLocalDev) return 'http://localhost:3000/api';
    return PRODUCTION_API;
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
let carBrandsWithModels = []; // [{ brand, models: [...] }]
let bankAccountLoading = false;

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

let currentPeriod = 'daily';
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
    tripCountCache = {};
    currentPeriod = ''; // Zorla yeniletmek için boş bırakıyoruz
    changeTripPeriod('daily');

    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('profilePage').classList.add('active');

    // Kampanya verisini yükle
    fetchCampaign();
    loadBankAccount();

    clearResendTimer();
}

function openBankAccountModal() {
    closeAllModals();
    const modal = document.getElementById('bankAccountModal');
    if (!modal) return;
    
    hideAddBankAccountForm(); // Liste görünümünü göster
    setBankAccountMessage('', '');
    modal.classList.add('active');
}

function closeBankAccountModal() {
    const modal = document.getElementById('bankAccountModal');
    if (!modal) return;
    modal.classList.remove('active');
}

function formatBankIbanInput(input) {
    // TR prefix'inden sonra gelen 24 haneyi 2-4-4-4-4-4-2 şeklinde grupla
    const digits = String(input.value || '').replace(/\D/g, '').slice(0, 24);
    
    let parts = [];
    if (digits.length > 0) parts.push(digits.substring(0, 2));
    if (digits.length > 2) parts.push(digits.substring(2, 6));
    if (digits.length > 6) parts.push(digits.substring(6, 10));
    if (digits.length > 10) parts.push(digits.substring(10, 14));
    if (digits.length > 14) parts.push(digits.substring(14, 18));
    if (digits.length > 18) parts.push(digits.substring(18, 22));
    if (digits.length > 22) parts.push(digits.substring(22, 24));
    
    input.value = parts.join(' ');
    setBankAccountMessage('', '');
}

function handleIbanKeydown(event, input) {
    // Harf tuşlarını engelle (sadece rakam, kontrol tuşları ve kısayollar)
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End'];
    if (allowed.includes(event.key)) return;
    
    // Kısayollar (Ctrl+V, Ctrl+C, Ctrl+A vb.)
    if (event.ctrlKey || event.metaKey) return;

    if (/^[0-9]$/.test(event.key)) return;
    
    event.preventDefault();
}

function setBankAccountMessage(type, text) {
    const messageEl = document.getElementById('bankAccountMessage');
    if (!messageEl) return;
    messageEl.classList.remove('success', 'error');
    if (type) messageEl.classList.add(type);
    messageEl.textContent = text || '';
}

function updateBankAccountPreview(iban, accountHolderName) {
    const previewEl = document.getElementById('bankAccountPreview');
    if (!previewEl) return;

    const normalizedIban = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!normalizedIban || !accountHolderName) {
        previewEl.textContent = 'IBAN bilgisi eklenmedi';
        return;
    }

    // Tam IBAN'ı (TR dahil) 2-4-4-4-4-4-2 şeklinde formatla
    let fullIbanFormatted = normalizedIban;
    if (normalizedIban.startsWith('TR') && normalizedIban.length === 26) {
        const d = normalizedIban.slice(2);
        fullIbanFormatted = 'TR' + d.substring(0, 2) + ' ' + d.substring(2, 6) + ' ' + d.substring(6, 10) + ' ' + d.substring(10, 14) + ' ' + d.substring(14, 18) + ' ' + d.substring(18, 22) + ' ' + d.substring(22, 24);
    }
    
    previewEl.textContent = `${accountHolderName} - ${fullIbanFormatted}`;
}

// Banka hesapları verisi
let driverBankAccounts = [];

function showAddBankAccountForm() {
    document.getElementById('bankAccountsListView').style.display = 'none';
    document.getElementById('addBankAccountForm').style.display = 'block';
    
    // Formu temizle
    document.getElementById('bankIbanInput').value = '';
    document.getElementById('bankAccountHolderInput').value = '';
    setBankAccountMessage('', '');
}

function hideAddBankAccountForm() {
    document.getElementById('bankAccountsListView').style.display = 'block';
    document.getElementById('addBankAccountForm').style.display = 'none';
}

async function loadBankAccount() {
    const listEl = document.getElementById('bankAccountsList');
    if (!listEl) return;

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/bank-account`);
        const data = await response.json();

        if (data.success && data.accounts) {
            driverBankAccounts = data.accounts;
            renderBankAccountsList();
            
            // Preview kartını güncelle (ilk hesabı göster veya 'IBAN bilgisi eklenmedi' yaz)
            if (driverBankAccounts.length > 0) {
                const first = driverBankAccounts[0];
                updateBankAccountPreview(first.iban, first.accountHolderName);
            } else {
                updateBankAccountPreview('', '');
            }
        }
    } catch (error) {
        console.error('Bank account load error:', error);
        setBankAccountMessage('error', 'Hesap bilgileri yüklenemedi.');
    }
}

function renderBankAccountsList() {
    const listEl = document.getElementById('bankAccountsList');
    if (!listEl) return;

    if (driverBankAccounts.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; padding:20px; font-size:0.85rem; color:var(--text-secondary);">Henüz bir banka hesabı eklemediniz.</p>';
        return;
    }

    listEl.innerHTML = driverBankAccounts.map(acc => {
        // IBAN'ı 2-4-4-4-4-4-2 şeklinde formatla
        let iban = acc.iban;
        let formatted = iban;
        if (iban.startsWith('TR') && iban.length === 26) {
            const d = iban.slice(2);
            formatted = 'TR' + d.substring(0, 2) + ' ' + d.substring(2, 6) + ' ' + d.substring(6, 10) + ' ' + d.substring(10, 14) + ' ' + d.substring(14, 18) + ' ' + d.substring(18, 22) + ' ' + d.substring(22, 24);
        }

        return `
            <div class="bank-account-card">
                <div class="account-info">
                    <span class="account-name">${acc.accountHolderName}</span>
                    <span class="account-iban">${formatted}</span>
                </div>
                <button class="delete-account-btn" onclick="deleteBankAccount(${acc.id})" title="Sil">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

async function deleteBankAccount(id) {
    if (!confirm('Bu banka hesabını silmek istediğinize emin misiniz?')) return;

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/bank-account/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            driverBankAccounts = driverBankAccounts.filter(a => a.id !== id);
            renderBankAccountsList();
            
            // Preview güncelle
            if (driverBankAccounts.length > 0) {
                const first = driverBankAccounts[0];
                updateBankAccountPreview(first.iban, first.accountHolderName);
            } else {
                updateBankAccountPreview('', '');
            }
        } else {
            alert(data.message || 'Hesap silinemedi.');
        }
    } catch (error) {
        console.error('Delete bank account error:', error);
        alert('İşlem sırasında bir hata oluştu.');
    }
}

async function saveBankAccount() {
    if (bankAccountLoading) return;

    const ibanInput = document.getElementById('bankIbanInput');
    const holderInput = document.getElementById('bankAccountHolderInput');
    const saveBtn = document.getElementById('saveBankAccountBtn');
    if (!ibanInput || !holderInput || !saveBtn) return;

    // TR prefix'ini ekleyerek tam IBAN oluştur (kullanıcı sadece 24 rakam giriyor)
    const rawDigits = String(ibanInput.value || '').replace(/\D/g, '');
    const iban = 'TR' + rawDigits;
    const accountHolderName = String(holderInput.value || '').trim();

    if (!/^TR\d{24}$/.test(iban)) {
        setBankAccountMessage('error', 'Gecerli bir TR IBAN giriniz.');
        return;
    }
    if (accountHolderName.length < 3) {
        setBankAccountMessage('error', 'Hesap sahibinin adi soyadi en az 3 karakter olmalidir.');
        return;
    }

    const btnText = saveBtn.querySelector('.btn-text');
    const btnLoader = saveBtn.querySelector('.btn-loader');
    bankAccountLoading = true;
    saveBtn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'flex';
    setBankAccountMessage('', '');

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/bank-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ iban, accountHolderName })
        });
        const data = await response.json();

        if (data.success) {
            // Listeyi yenile ve geri dön
            await loadBankAccount();
            hideAddBankAccountForm();
            setBankAccountMessage('success', 'Hesap bilgileri kaydedildi.');
        } else {
            setBankAccountMessage('error', data.message || 'Kayıt işlemi başarısız oldu.');
        }
    } catch (error) {
        console.error('Bank account save error:', error);
        setBankAccountMessage('error', 'Sunucuya bağlanılamadı. Tekrar deneyin.');
    } finally {
        bankAccountLoading = false;
        saveBtn.disabled = false;
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
    }
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

// ============================================
// Para Çek Modal
// ============================================

let withdrawLoading = false;
const WITHDRAW_FEE = 4; // TL - sunucuyla senkron

// Modal açıldığında hesaplanan bakiye verileri
let _withdrawData = { total: 0, blocked: 0, withdrawable: 0 };

/**
 * Bakiye kartına tıklandığında açılır.
 * API'den total + blocked balance çeker; çekilebilir = total - blocked
 */
async function openWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    if (!modal) return;

    closeAllModals();

    // Mesajları sıfırla
    const errEl = document.getElementById('withdrawError');
    const sucEl = document.getElementById('withdrawSuccess');
    if (errEl) errEl.textContent = '';
    if (sucEl) sucEl.textContent = '';

    const withdrawEl = document.getElementById('withdrawWithdrawable');
    const netEl      = document.getElementById('withdrawNetAmount');
    const btn        = document.getElementById('withdrawBtn');
    const cooldownEl = document.getElementById('withdrawCooldownInfo');

    // Yükleniyor durumu
    if (withdrawEl) withdrawEl.textContent = '...';
    if (netEl)      netEl.textContent      = '';
    if (btn)        btn.disabled           = true;
    if (cooldownEl) cooldownEl.style.display = 'none';

    // Banka hesaplarını yükle
    const bankSelect = document.getElementById('withdrawBankSelect');
    if (bankSelect) {
        bankSelect.innerHTML = '<option value="">Yükleniyor...</option>';
        try {
            const resp = await authenticatedFetch(`${API_BASE}/drivers/bank-account`);
            const data = await resp.json();
            if (data.success && data.accounts && data.accounts.length > 0) {
                bankSelect.innerHTML = data.accounts.map(acc => {
                    let formatted = acc.iban;
                    if (acc.iban.startsWith('TR') && acc.iban.length === 26) {
                        const d = acc.iban.slice(2);
                        formatted = 'TR' + d.substring(0, 2) + '...' + d.substring(22, 24);
                    }
                    return `<option value="${acc.id}">${acc.accountHolderName} (${formatted})</option>`;
                }).join('');
            } else {
                bankSelect.innerHTML = '<option value="">⚠️ Hesap bulunamadı</option>';
            }
        } catch (e) {
            bankSelect.innerHTML = '<option value="">Hata!</option>';
        }
    }

    // ── Modalı hemen aç, veriyi arka planda getir ──────────────
    modal.classList.add('active');

    // ── Bakiye + Cooldown paralel çek (Promise.all) ────────────
    try {
        const [balResp, statusResp] = await Promise.all([
            authenticatedFetch(`${API_BASE}/drivers/balance`, { method: 'POST' }),
            authenticatedFetch(`${API_BASE}/drivers/withdraw-status`)
        ]);
        const balData = await balResp.json();
        const status  = await statusResp.json();

        // Bakiye işle
        if (balData.success) {
            const total      = parseFloat(String(balData.balance || '0').replace(/[^0-9.]/g, '')) || 0;
            const withdrawable = total;
            _withdrawData = { total, blocked: 0, withdrawable };
            const fmt = v => v.toFixed(2).replace('.', ',') + ' ₺';
            if (withdrawEl) withdrawEl.textContent = fmt(withdrawable);
            
            // Input alanını güncelle ve event listener ekle
            const amountInput = document.getElementById('withdrawAmountInput');
            if (amountInput) {
                // Sürücünün tüm bakiyesini varsayılan olarak set et
                amountInput.value = withdrawable;
                amountInput.max = withdrawable;
                
                // Anlık net tutar hesabı
                const updateNetText = () => {
                    const reqAmount = parseFloat(amountInput.value) || 0;
                    if (reqAmount > withdrawable) {
                        if (netEl) {
                            netEl.textContent = `Yetersiz bakiye. Maksimum ${withdrawable.toFixed(2)} TL çekebilirsiniz.`;
                            netEl.style.color = '#ef4444';
                        }
                        if (btn) btn.disabled = true;
                    } else if (reqAmount > WITHDRAW_FEE) {
                        const net = (reqAmount - WITHDRAW_FEE).toFixed(2).replace('.', ',');
                        if (netEl) {
                            netEl.textContent = `Hesabınıza geçecek tutar: ${net} ₺  (${WITHDRAW_FEE} TL çekim ücreti düşülür)`;
                            netEl.style.color = '#94a3b8';
                        }
                        if (btn && (!status.cooldownUntil || status.canWithdraw !== false)) btn.disabled = false;
                    } else {
                        if (netEl) {
                            netEl.textContent = `Çekilecek tutar ${WITHDRAW_FEE} TL çekim ücretini karşılamıyor.`;
                            netEl.style.color = '#ef4444';
                        }
                        if (btn) btn.disabled = true;
                    }
                };
                
                amountInput.removeEventListener('input', updateNetText);
                amountInput.addEventListener('input', updateNetText);
                updateNetText(); // İlk hesaplama
            }
        } else {
            if (withdrawEl) withdrawEl.textContent = '-';
        }

        // Cooldown işle
        if (status.canWithdraw === false && status.cooldownUntil) {
            const next = new Date(status.cooldownUntil);
            const hh   = String(next.getHours()).padStart(2, '0');
            const mm   = String(next.getMinutes()).padStart(2, '0');
            if (cooldownEl) {
                cooldownEl.textContent = `⏳ Bir sonraki çekim: ${hh}:${mm} (yaklaşık ${status.hoursLeft} saat kaldı)`;
                cooldownEl.style.display = 'block';
            }
            if (btn) btn.disabled = true;
        } else {
            if (cooldownEl) cooldownEl.style.display = 'none';
            if (btn) btn.disabled = _withdrawData.withdrawable <= WITHDRAW_FEE;
        }

    } catch (e) {
        console.error('[Withdraw] Bakiye/cooldown hatası:', e);
        if (withdrawEl) withdrawEl.textContent = 'Bağlanamadı';
        if (cooldownEl) cooldownEl.style.display = 'none';
        if (btn) btn.disabled = true;
    }

    // ── Banka Hesabı Kontrolü ──────────────────────────────────────────────────────────
    const bankSelectEl = document.getElementById('withdrawBankSelect');
    const selectedAccountId = bankSelectEl?.value;
    if (!selectedAccountId) {
        if (cooldownEl) {
            cooldownEl.textContent = '⚠️ Lütfen önce bir banka hesabı kaydedin veya seçin.';
            cooldownEl.style.display = 'block';
            cooldownEl.style.background = 'rgba(239, 68, 68, 0.1)';
            cooldownEl.style.color = '#ef4444';
        }
        if (btn) btn.disabled = true;
    }
}

// Tum acik modallari kapatir — yeni bir modal acilmadan once cagrilmali
function closeAllModals() {
    const modalIds = ['withdrawModal', 'bankAccountModal', 'yandexSozlesmeModal', 'campaignModal', 'contactModal'];
    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    withdrawLoading = false;
}

function closeWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    if (modal) modal.classList.remove('active');
    withdrawLoading = false;
}

// Escape tusuyla herhangi bir modali kapat
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
});

/**
 * Para Çek: çekilebilir tutar (total - blocked) gönderilir.
 * 4 TL komisyon sunucu tarafında ayrıca düşülür.
 */
async function handleWithdraw() {
    if (withdrawLoading) return;

    const errEl     = document.getElementById('withdrawError');
    const sucEl     = document.getElementById('withdrawSuccess');
    const btn       = document.getElementById('withdrawBtn');
    const btnText   = btn?.querySelector('.btn-text');
    const btnLoader = btn?.querySelector('.btn-loader');

    if (errEl) errEl.textContent = '';
    if (sucEl) sucEl.textContent = '';

    // Çekilecek tutarı inputtan al
    const amountInput = document.getElementById('withdrawAmountInput');
    const amount = parseFloat(amountInput?.value) || 0;

    if (!amount || amount <= 0) {
        if (errEl) errEl.textContent = 'Lütfen geçerli bir tutar girin.';
        return;
    }
    if (amount > _withdrawData.withdrawable) {
        if (errEl) errEl.textContent = 'Çekmek istediğiniz tutar mevcut bakiyenizden fazla olamaz.';
        return;
    }
    if (amount <= WITHDRAW_FEE) {
        if (errEl) errEl.textContent = `Çekilecek tutar ${WITHDRAW_FEE} TL çekim ücretini karşılamıyor.`;
        return;
    }

    // Seçilen banka hesabı
    const bankSelect = document.getElementById('withdrawBankSelect');
    const bankAccountId = bankSelect?.value;
    
    if (!bankAccountId) {
        if (errEl) errEl.textContent = 'Lütfen bir banka hesabı seçin.';
        return;
    }

    withdrawLoading = true;
    if (btn) btn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'flex';

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, bankAccountId })
        });
        const data = await response.json();

        if (data.success) {
            if (sucEl) sucEl.textContent = data.message || 'Para çekimi başarıyla gerçekleşti.';
            if (data.warning && errEl) errEl.textContent = '⚠️ ' + data.warning;

            // Sonraki çekim saatini göster
            if (data.nextWithdrawAt) {
                const next = new Date(data.nextWithdrawAt);
                const hh   = String(next.getHours()).padStart(2, '0');
                const mm   = String(next.getMinutes()).padStart(2, '0');
                const cooldownEl2 = document.getElementById('withdrawCooldownInfo');
                if (cooldownEl2) {
                    cooldownEl2.textContent = `⏳ Bir sonraki çekim yapabileceğiniz saat: ${hh}:${mm}`;
                    cooldownEl2.style.display = 'block';
                }
            }

            // Bakiye göstergelerini sıfırla
            const profileBalEl = document.getElementById('profileBalance');
            if (profileBalEl) profileBalEl.textContent = '0,00 ₺';
            const withdrawEl2 = document.getElementById('withdrawWithdrawable');
            if (withdrawEl2) withdrawEl2.textContent = '0,00 ₺';
            _withdrawData = { total: 0, blocked: 0, withdrawable: 0 };

        } else {
            if (errEl) errEl.textContent = data.message || 'Para çekimi sırasında hata oluştu.';
            if (btn) btn.disabled = false;
        }
    } catch (error) {
        console.error('[Withdraw] Hata:', error);
        if (errEl) errEl.textContent = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
        if (btn) btn.disabled = false;
    } finally {
        withdrawLoading = false;
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
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
    currentPeriod = 'daily';
    currentCampaignText = '';
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
    const ibanInput = document.getElementById('bankIbanInput');
    const holderInput = document.getElementById('bankAccountHolderInput');
    if (ibanInput) ibanInput.value = '';
    if (holderInput) holderInput.value = '';
    updateBankAccountPreview('', '');
    setBankAccountMessage('', '');
}

// ============================================
// Leaderboard (Tarih aralığı filtreleme - en fazla 1 ay)
// ============================================

let leaderboardLoaded = false;

// ============================================
// Güncel Kampanya
// ============================================

let currentCampaignText = '';

/**
 * API'den aktif kampanyayı çeker ve profil sayfasındaki kartı günceller.
 * Oturumdaki şehir/park ile GET /api/drivers/campaign — public /api/campaign her zaman birincil parka düşerdi.
 */
async function fetchCampaign() {
    const campaignEl = document.getElementById('profileCampaignText');
    if (!campaignEl) return;

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/campaign`);
        const data = await response.json();

        if (data.success && data.campaign && data.campaign.active && data.campaign.text) {
            currentCampaignText = data.campaign.text;
            campaignEl.textContent = data.campaign.text;
            // Aktif kampanya stili
            const card = document.getElementById('campaignCardFrontend');
            if (card) card.classList.add('campaign-active');
        } else {
            currentCampaignText = 'Şu anda aktif kampanya bulunmamaktadır.';
            campaignEl.textContent = currentCampaignText;
            const card = document.getElementById('campaignCardFrontend');
            if (card) card.classList.remove('campaign-active');
        }
    } catch (error) {
        console.error('[Campaign] Kampanya yükleme hatası:', error);
        currentCampaignText = 'Şu anda aktif kampanya bulunmamaktadır.';
        campaignEl.textContent = currentCampaignText;
    }
}

function openYandexSozlesmeModal() {
    closeAllModals();
    const body = document.getElementById('sozlesmeModalBody');
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
    const modal = document.getElementById('campaignModal');
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

function openLeaderboard() {
    document.getElementById('profilePage').classList.remove('active');
    document.getElementById('leaderboardPage').classList.add('active');

    // Default olarak günlük (bugün) verileri göster
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const startInput = document.getElementById('lbStartDate');
    const endInput = document.getElementById('lbEndDate');
    if (startInput) startInput.value = todayStr;
    if (endInput) endInput.value = todayStr;

    // Yükle
    loadLeaderboard(todayStr, todayStr);
}

function closeLeaderboard() {
    document.getElementById('leaderboardPage').classList.remove('active');
    document.getElementById('profilePage').classList.add('active');
}

/**
 * Sürücü leaderboard verisini API'den yükler (sadece tarih aralığı ile)
 * @param {string} startDate - ISO YYYY-MM-DD
 * @param {string} endDate - ISO YYYY-MM-DD
 */
async function loadLeaderboard(startDate, endDate) {
    const content = document.getElementById('leaderboardContent');
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
        const timeout = setTimeout(() => controller.abort(), 120000);

        const url = `${API_BASE}/leaderboard?from=${startDate}&to=${endDate}`;

        const response = await authenticatedFetch(url, {
            signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await response.json();

        if (!data.success) {
            content.innerHTML = '<p class="leaderboard-error">' + (data.message || 'Sıralama tablosu yüklenemedi.') + '</p>';
            if (periodInfo) periodInfo.textContent = 'Veri alınamadı';
            return;
        }

        leaderboardLoaded = true;

        if (periodInfo) periodInfo.textContent = `${data.periodLabel} tarihleri arasında en çok yolculuk yapan sürücüler`;

        renderLeaderboard(data.leaderboard, data.currentUser);
    } catch (error) {
        console.error('Leaderboard error:', error);
        const msg = error.name === 'AbortError'
            ? 'İstek zaman aşımına uğradı.'
            : 'Sunucuya bağlanılamadı.';
        content.innerHTML = `<p class="leaderboard-error">${msg}</p><button class="btn-retry" onclick="filterLeaderboard()">Tekrar Dene</button>`;
    }
}

/**
 * Filtrele butonuna basıldığında çalışır. En fazla 1 aylık dönem seçilebilir.
 */
function filterLeaderboard() {
    const startInput = document.getElementById('lbStartDate').value;
    const endInput = document.getElementById('lbEndDate').value;

    if (!startInput || !endInput) {
        showLeaderboardToast('error', 'Lütfen hem başlangıç hem de bitiş tarihi seçin.');
        return;
    }

    const startDate = new Date(startInput);
    const endDate = new Date(endInput);

    if (startDate > endDate) {
        showLeaderboardToast('error', 'Başlangıç tarihi bitiş tarihinden sonra olamaz.');
        return;
    }

    const diffTime = endDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 31) {
        showLeaderboardToast('error', 'En fazla 1 aylık (31 gün) dönem seçebilirsiniz.');
        return;
    }

    loadLeaderboard(startInput, endInput);
}

/**
 * Leaderboard toast bildirimi (filtre hataları için)
 */
function showLeaderboardToast(type, message) {
    const toast = document.getElementById('lbToast');
    const toastText = document.getElementById('lbToastText');
    if (!toast || !toastText) return;

    toast.classList.remove('show', 'success', 'error');
    toast.classList.add(type, 'show');
    toastText.textContent = message;

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s var(--ease) forwards';
        setTimeout(() => {
            toast.classList.remove('show', 'success', 'error');
            toast.style.animation = '';
        }, 300);
    }, 4000);
}

function renderLeaderboard(list, currentUser) {
    const container = document.getElementById('leaderboardContent');
    const myId = currentDriverData ? currentDriverData.id : '';

    let html = '';

    if (list.length === 0) {
        html += '<p class="lb-empty">Bu dönemde henüz tamamlanmış yolculuk yok.</p>';
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
    document.getElementById('newCarModel').innerHTML = '<option value="">Önce marka seçin...</option>';
    document.getElementById('newCarModel').disabled = true;
    document.getElementById('newCarYear').value = '';
    document.getElementById('newCarError').textContent = '';
    loadCarBrandsAndYears();
    document.getElementById('newCarModal').classList.add('active');
}

function onNewCarBrandChange() {
    const brandSelect = document.getElementById('newCarBrand');
    const modelSelect = document.getElementById('newCarModel');
    const brand = brandSelect.value;

    modelSelect.innerHTML = '<option value="">Model seçin...</option>';
    modelSelect.disabled = !brand;

    if (!brand) return;

    const brandData = carBrandsWithModels.find(b => b.brand === brand);
    const models = (brandData && brandData.models && brandData.models.length > 0) ? brandData.models : ['Diğer'];
    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSelect.appendChild(opt);
    });
}

function closeNewCarModal() {
    document.getElementById('newCarModal').classList.remove('active');
    pendingPlate = '';
}

async function loadCarBrandsAndYears() {
    const brandSelect = document.getElementById('newCarBrand');
    const yearSelect = document.getElementById('newCarYear');

    if (carBrandsWithModels.length > 0 && brandSelect.options.length > 1) {
        const currentYear = new Date().getFullYear();
        if (yearSelect.options.length <= 1) {
            yearSelect.innerHTML = '<option value="">Yıl seçin...</option>';
            for (let y = currentYear; y >= 2000; y--) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                yearSelect.appendChild(opt);
            }
        }
        return;
    }

    const errEl = document.getElementById('newCarError');
    try {
        const res = await fetch(`${API_BASE}/drivers/car-brands`);
        const data = await res.json();
        if (data.success) {
            if (errEl) errEl.textContent = '';
            carBrandsWithModels = data.brandsWithModels || [];
            const brands = data.brands || carBrandsWithModels.map(b => b.brand) || [];

            brandSelect.innerHTML = '<option value="">Marka seçin...</option>';
            brands.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = b;
                brandSelect.appendChild(opt);
            });
        } else {
            carBrandsWithModels = [];
            brandSelect.innerHTML = '<option value="">Liste yüklenemedi</option>';
            if (errEl) errEl.textContent = data.message || 'Marka listesi alınamadı.';
        }
    } catch (e) {
        console.error('Brands load error:', e);
        carBrandsWithModels = [];
        brandSelect.innerHTML = '<option value="">Bağlantı hatası</option>';
        if (errEl) errEl.textContent = 'Marka listesi yüklenirken hata oluştu.';
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
    const model = document.getElementById('newCarModel').value ? document.getElementById('newCarModel').value.trim() : '';
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
    if (e.key === 'Escape') {
        const bankModal = document.getElementById('bankAccountModal');
        if (bankModal && bankModal.classList.contains('active')) {
            closeBankAccountModal();
            return;
        }
        const contactModal = document.getElementById('contactModal');
        if (contactModal && contactModal.classList.contains('active')) {
            closeContactModal();
            return;
        }
        const campaignModal = document.getElementById('campaignModal');
        if (campaignModal && campaignModal.classList.contains('active')) {
            closeCampaignModal();
        }
        return;
    }
    if (e.key === 'Enter') {
        const bankModal = document.getElementById('bankAccountModal');
        if (bankModal && bankModal.classList.contains('active')) {
            const saveBtn = document.getElementById('saveBankAccountBtn');
            if (saveBtn && !saveBtn.disabled) {
                e.preventDefault();
                saveBankAccount();
            }
            return;
        }
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

