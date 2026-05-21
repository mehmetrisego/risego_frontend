// ============================================
// RiseGo Sürücü Paneli - Shared Utilities
// ============================================

// ─── API Config ────────────────────────────────────────────────────────────
const PRODUCTION_API = 'https://api.risegodriver.com/api';
const API_BASE = (function () {
    if (typeof window === 'undefined') return PRODUCTION_API;
    const h = window.location.hostname;
    const isLocalDev = h === 'localhost' || h === '127.0.0.1' || h === '192.168.1.102';
    if (isLocalDev) return `http://${h}:3000/api`;
    return PRODUCTION_API;
})();

const SESSION_KEY = 'risego_session';
const CITY_KEY    = 'risego_city';
const PHONE_KEY   = 'risego_phone';

// ─── Authenticated Fetch ───────────────────────────────────────────────────
/**
 * Oturum token'ı ile API isteği yapar.
 * 401 alırsa oturumu temizleyip login sayfasına yönlendirir.
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

// ─── IBAN Formatting ────────────────────────────────────────────────────────
/**
 * 26 haneli TR IBAN stringini TR XX XXXX XXXX XXXX XXXX XXXX XX formatında döner.
 * @param {string} iban - Tam IBAN (TR + 24 hane) veya sadece 24 hane
 * @returns {string} Formatlanmış IBAN
 */
function formatIban(iban) {
    if (!iban) return '';
    const normalized = String(iban).replace(/\s+/g, '').toUpperCase();
    // TR ile başlıyorsa direkt formatla
    if (normalized.startsWith('TR') && normalized.length === 26) {
        const d = normalized.slice(2);
        return 'TR' + d.substring(0, 2) + ' ' + d.substring(2, 6) + ' ' +
               d.substring(6, 10) + ' ' + d.substring(10, 14) + ' ' +
               d.substring(14, 18) + ' ' + d.substring(18, 22) + ' ' + d.substring(22, 24);
    }
    return normalized;
}

/**
 * IBAN input alanını gerçek zamanlı formatlayan handler.
 * Kullanıcı sadece 24 rakam girer (TR prefix görsel olarak ayrı gösterilir).
 */
function formatBankIbanInput(input) {
    const digits = String(input.value || '').replace(/\D/g, '').slice(0, 24);
    let parts = [];
    if (digits.length > 0)  parts.push(digits.substring(0, 2));
    if (digits.length > 2)  parts.push(digits.substring(2, 6));
    if (digits.length > 6)  parts.push(digits.substring(6, 10));
    if (digits.length > 10) parts.push(digits.substring(10, 14));
    if (digits.length > 14) parts.push(digits.substring(14, 18));
    if (digits.length > 18) parts.push(digits.substring(18, 22));
    if (digits.length > 22) parts.push(digits.substring(22, 24));
    input.value = parts.join(' ');
    setBankAccountMessage('', '');
}

/**
 * IBAN input'a yapıştırma handler'ı.
 */
function handleIbanPaste(event, input) {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/^TR/i, '').replace(/\D/g, '').slice(0, 24);
    let parts = [];
    if (digits.length > 0)  parts.push(digits.substring(0, 2));
    if (digits.length > 2)  parts.push(digits.substring(2, 6));
    if (digits.length > 6)  parts.push(digits.substring(6, 10));
    if (digits.length > 10) parts.push(digits.substring(10, 14));
    if (digits.length > 14) parts.push(digits.substring(14, 18));
    if (digits.length > 18) parts.push(digits.substring(18, 22));
    if (digits.length > 22) parts.push(digits.substring(22, 24));
    input.value = parts.join(' ');
    setBankAccountMessage('', '');
}

/**
 * IBAN input klavye handler'ı — sadece rakam, kontrol tuşları ve kısayollara izin verir.
 */
function handleIbanKeydown(event, input) {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'];
    if (allowed.includes(event.key)) return;
    if (event.ctrlKey || event.metaKey) return;
    if (/^[0-9]$/.test(event.key)) return;
    event.preventDefault();
}

// ─── Phone Formatting ───────────────────────────────────────────────────────
/**
 * Telefon numarası görüntüleme formatı: +90 5XX XXX XX XX
 */
function formatPhoneDisplay(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 12) {
        return `+${digits.substring(0, 2)} ${digits.substring(2, 5)} ${digits.substring(5, 8)} ${digits.substring(8, 10)} ${digits.substring(10, 12)}`;
    }
    return phone;
}

/**
 * Telefon input formatter (5XX XXX XX XX)
 */
function formatPhone(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 10) value = value.substring(0, 10);
    let formatted = '';
    if (value.length > 0) formatted = value.substring(0, 3);
    if (value.length > 3) formatted += ' ' + value.substring(3, 6);
    if (value.length > 6) formatted += ' ' + value.substring(6, 8);
    if (value.length > 8) formatted += ' ' + value.substring(8, 10);
    input.value = formatted;
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.disabled = value.length < 10;
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.textContent = '';
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
