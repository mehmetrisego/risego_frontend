// ============================================
// RiseGo Sürücü Paneli - Bank Account Module
// ============================================
// Gereksinim: utils.js önce yüklenmiş olmalı

var driverBankAccounts = [];
var bankAccountLoading = false;

// ─── Modal Yönetimi ────────────────────────────────────────────────────────
function openBankAccountModal() {
    closeAllModals();
    const modal = document.getElementById('bankAccountModal');
    if (!modal) return;
    hideAddBankAccountForm();
    setBankAccountMessage('', '');
    modal.classList.add('active');
}

function closeBankAccountModal() {
    const modal = document.getElementById('bankAccountModal');
    if (modal) modal.classList.remove('active');
}

function showAddBankAccountForm() {
    document.getElementById('bankAccountsListView').style.display = 'none';
    document.getElementById('addBankAccountForm').style.display = 'block';
    document.getElementById('bankIbanInput').value = '';
    document.getElementById('bankAccountHolderInput').value = '';
    setBankAccountMessage('', '');
}

function hideAddBankAccountForm() {
    document.getElementById('bankAccountsListView').style.display = 'block';
    document.getElementById('addBankAccountForm').style.display = 'none';
}

// ─── Mesaj & Preview ──────────────────────────────────────────────────────
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
    const normalized = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!normalized || !accountHolderName) {
        previewEl.textContent = 'IBAN bilgisi eklenmedi';
        return;
    }
    previewEl.textContent = `${accountHolderName} - ${formatIban(normalized)}`;
}

// ─── API: Yükleme & Render ─────────────────────────────────────────────────
async function loadBankAccount() {
    const listEl = document.getElementById('bankAccountsList');
    if (!listEl) return;
    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/bank-account`);
        const data = await response.json();
        if (data.success && data.accounts) {
            driverBankAccounts = data.accounts;
            renderBankAccountsList();
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
    listEl.innerHTML = driverBankAccounts.map(acc => `
        <div class="bank-account-card">
            <div class="account-info">
                <span class="account-name">${acc.accountHolderName}</span>
                <span class="account-iban">${formatIban(acc.iban)}</span>
            </div>
            <button class="delete-account-btn" onclick="deleteBankAccount(${acc.id})" title="Sil">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                </svg>
            </button>
        </div>
    `).join('');
}

// ─── API: Ekle / Sil ──────────────────────────────────────────────────────
async function deleteBankAccount(id) {
    if (!confirm('Bu banka hesabını silmek istediğinize emin misiniz?')) return;
    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/bank-account/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            driverBankAccounts = driverBankAccounts.filter(a => a.id !== id);
            renderBankAccountsList();
            if (driverBankAccounts.length > 0) {
                updateBankAccountPreview(driverBankAccounts[0].iban, driverBankAccounts[0].accountHolderName);
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
    const ibanInput   = document.getElementById('bankIbanInput');
    const holderInput = document.getElementById('bankAccountHolderInput');
    const saveBtn     = document.getElementById('saveBankAccountBtn');
    if (!ibanInput || !holderInput || !saveBtn) return;

    const rawDigits       = String(ibanInput.value || '').replace(/\D/g, '');
    const iban            = 'TR' + rawDigits;
    const accountHolderName = String(holderInput.value || '').trim();

    if (!/^TR\d{24}$/.test(iban)) {
        setBankAccountMessage('error', 'Geçerli bir TR IBAN giriniz.');
        return;
    }
    if (accountHolderName.length < 3) {
        setBankAccountMessage('error', 'Hesap sahibinin adı soyadı en az 3 karakter olmalıdır.');
        return;
    }

    const btnText   = saveBtn.querySelector('.btn-text');
    const btnLoader = saveBtn.querySelector('.btn-loader');
    bankAccountLoading = true;
    saveBtn.disabled = true;
    if (btnText)   btnText.style.display   = 'none';
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
        if (btnText)   btnText.style.display   = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
    }
}
