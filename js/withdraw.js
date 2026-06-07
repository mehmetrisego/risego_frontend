// ============================================
// RiseGo Sürücü Paneli - Withdraw Module
// ============================================
// Gereksinim: utils.js, bankAccount.js önce yüklenmiş olmalı

var withdrawLoading = false;
const WITHDRAW_FEE  = 4; // TL — sunucuyla senkron

// Modal açıldığında hesaplanan bakiye verileri
var _withdrawData = { total: 0, blocked: 0, withdrawable: 0 };

// ─── Modal: Aç ────────────────────────────────────────────────────────────
/**
 * Bakiye kartına tıklandığında açılır.
 * Modalı hemen açar, veriyi arka planda paralel çeker.
 */
async function openWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    if (!modal) return;
    closeAllModals();

    // Sıfırla
    const errEl     = document.getElementById('withdrawError');
    const sucEl     = document.getElementById('withdrawSuccess');
    const withdrawEl = document.getElementById('withdrawWithdrawable');
    const netEl     = document.getElementById('withdrawNetAmount');
    const btn       = document.getElementById('withdrawBtn');
    const cooldownEl = document.getElementById('withdrawCooldownInfo');
    const amountInput = document.getElementById('withdrawAmountInput');
    if (errEl)     errEl.textContent      = '';
    if (sucEl)     sucEl.textContent      = '';
    if (withdrawEl) withdrawEl.textContent = '...';
    if (netEl)     netEl.textContent      = '';
    if (btn)       btn.disabled           = true;
    if (cooldownEl) cooldownEl.style.display = 'none';
    if (amountInput) amountInput.value    = '';

    // Banka hesabı select'ini — mevcut cache'den doldur (yeni fetch gerekmez)
    const bankSelect = document.getElementById('withdrawBankSelect');
    if (bankSelect) {
        if (driverBankAccounts && driverBankAccounts.length > 0) {
            bankSelect.innerHTML = driverBankAccounts.map(acc => {
                // Kısa format: TR XX ... XX
                let short = acc.iban;
                if (acc.iban.startsWith('TR') && acc.iban.length === 26) {
                    const d = acc.iban.slice(2);
                    short = 'TR' + d.substring(0, 2) + '...' + d.substring(22, 24);
                }
                return `<option value="${acc.id}">${acc.accountHolderName} (${short})</option>`;
            }).join('');
        } else {
            // Cache boşsa API'den çek
            bankSelect.innerHTML = '<option value="">Yükleniyor...</option>';
            try {
                const resp = await authenticatedFetch(`${API_BASE}/drivers/bank-account`);
                const data = await resp.json();
                if (data.success && data.accounts && data.accounts.length > 0) {
                    driverBankAccounts = data.accounts;
                    bankSelect.innerHTML = data.accounts.map(acc => {
                        let short = acc.iban;
                        if (acc.iban.startsWith('TR') && acc.iban.length === 26) {
                            const d = acc.iban.slice(2);
                            short = 'TR' + d.substring(0, 2) + '...' + d.substring(22, 24);
                        }
                        return `<option value="${acc.id}">${acc.accountHolderName} (${short})</option>`;
                    }).join('');
                } else {
                    bankSelect.innerHTML = '<option value="">⚠️ Hesap bulunamadı</option>';
                }
            } catch (e) {
                bankSelect.innerHTML = '<option value="">Hata!</option>';
            }
        }
    }

    modal.classList.add('active');

    // Bakiye + Cooldown paralel çek
    try {
        const [balResp, statusResp] = await Promise.all([
            authenticatedFetch(`${API_BASE}/drivers/balance`, { method: 'POST' }),
            authenticatedFetch(`${API_BASE}/drivers/withdraw-status`)
        ]);
        const balData = await balResp.json();
        const status  = await statusResp.json();

        // Bakiye işle
        if (balData.success) {
            const total       = parseFloat(String(balData.balance || '0').replace(/[^0-9.]/g, '')) || 0;
            const withdrawable = total;
            _withdrawData = { total, blocked: 0, withdrawable };
            const fmt = v => v.toFixed(2).replace('.', ',') + ' ₺';
            if (withdrawEl) withdrawEl.textContent = fmt(withdrawable);

            const amountInput = document.getElementById('withdrawAmountInput');
            if (amountInput) {
                amountInput.value = withdrawable;
                amountInput.max   = withdrawable;
                const updateNetText = () => {
                    const reqAmount = parseFloat(amountInput.value) || 0;
                    if (reqAmount > withdrawable) {
                        if (netEl) { netEl.textContent = `Yetersiz bakiye. Maksimum ${withdrawable.toFixed(2)} TL çekebilirsiniz.`; netEl.style.color = '#ef4444'; }
                        if (btn) btn.disabled = true;
                    } else if (reqAmount > WITHDRAW_FEE) {
                        const net = (reqAmount - WITHDRAW_FEE).toFixed(2).replace('.', ',');
                        if (netEl) { netEl.textContent = `Hesabınıza geçecek tutar: ${net} ₺  (${WITHDRAW_FEE} TL çekim ücreti düşülür)`; netEl.style.color = '#94a3b8'; }
                        if (btn && (!status.cooldownUntil || status.canWithdraw !== false)) btn.disabled = false;
                    } else {
                        if (netEl) { netEl.textContent = `Çekilecek tutar ${WITHDRAW_FEE} TL çekim ücretini karşılamıyor.`; netEl.style.color = '#ef4444'; }
                        if (btn) btn.disabled = true;
                    }
                };
                amountInput.removeEventListener('input', updateNetText);
                amountInput.addEventListener('input', updateNetText);
                updateNetText();
            }
        } else {
            if (withdrawEl) withdrawEl.textContent = '-';
        }

        // Bakım penceresi kontrolü (06:00–07:00)
        if (status.maintenanceWindow) {
            if (cooldownEl) {
                cooldownEl.textContent = '🛠️ Sistem bakımı: Sabah 06:00–07:00 arası para çekimi geçici olarak kapalıdır.';
                cooldownEl.style.display = 'block';
                cooldownEl.style.background = 'rgba(245, 158, 11, 0.1)';
                cooldownEl.style.color = '#f59e0b';
            }
            if (btn) btn.disabled = true;
        }
        // Cooldown kontrolü
        else if (status.canWithdraw === false && status.cooldownUntil) {
            const next = new Date(status.cooldownUntil);
            const hh   = String(next.getHours()).padStart(2, '0');
            const mm   = String(next.getMinutes()).padStart(2, '0');
            const minsLeft = status.minutesLeft || 1;
            if (cooldownEl) {
                cooldownEl.textContent = `⏳ Bir sonraki çekim: ${hh}:${mm} (yaklaşık ${minsLeft} dakika kaldı)`;
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

    // Banka hesabı kontrolü
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

function closeWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    if (modal) modal.classList.remove('active');
    withdrawLoading = false;
}

// ─── Para Çek İşlemi ───────────────────────────────────────────────────────
/**
 * Para Çek: seçilen tutar ve banka hesabıyla gönderilir.
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

    const amountInput = document.getElementById('withdrawAmountInput');
    const amount = parseFloat(amountInput?.value) || 0;
    if (!amount || amount <= 0) { if (errEl) errEl.textContent = 'Lütfen geçerli bir tutar girin.'; return; }
    if (amount > _withdrawData.withdrawable) { if (errEl) errEl.textContent = 'Çekmek istediğiniz tutar mevcut bakiyenizden fazla olamaz.'; return; }
    if (amount <= WITHDRAW_FEE) { if (errEl) errEl.textContent = `Çekilecek tutar ${WITHDRAW_FEE} TL çekim ücretini karşılamıyor.`; return; }

    const bankSelect    = document.getElementById('withdrawBankSelect');
    const bankAccountId = bankSelect?.value;
    if (!bankAccountId) { if (errEl) errEl.textContent = 'Lütfen bir banka hesabı seçin.'; return; }

    withdrawLoading = true;
    if (btn)       btn.disabled           = true;
    if (btnText)   btnText.style.display  = 'none';
    if (btnLoader) btnLoader.style.display = 'flex';

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, bankAccountId })
        });
        const data = await response.json();

        if (data.success) {
            const successMsg = data.message || 'Para çekme talebiniz alındı.';
            if (sucEl) sucEl.textContent = successMsg + ' Banka işlemi birkaç dakika içinde tamamlanacaktır.';
            if (data.warning && errEl) errEl.textContent = '⚠️ ' + data.warning;
            if (data.minutesLeft) {
                const cooldownEl2 = document.getElementById('withdrawCooldownInfo');
                if (cooldownEl2) {
                    cooldownEl2.textContent = `⏳ Bir sonraki çekim için ${data.minutesLeft} dakika beklemeniz gerekmektedir.`;
                    cooldownEl2.style.display = 'block';
                }
            }
            // Bakiye göstergelerini güncelle (çekilen tutarı düş)
            const grossWithdrawn = data.grossAmount || amount;
            const remaining = Math.max(0, (_withdrawData.withdrawable || 0) - grossWithdrawn);
            const fmt = v => v.toFixed(2).replace('.', ',') + ' ₺';
            const profileBalEl = document.getElementById('profileBalance');
            if (profileBalEl) profileBalEl.textContent = fmt(remaining);
            const withdrawEl2 = document.getElementById('withdrawWithdrawable');
            if (withdrawEl2) withdrawEl2.textContent = fmt(remaining);
            _withdrawData = { total: remaining, blocked: 0, withdrawable: remaining };
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
        if (btnText)   btnText.style.display   = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
    }
}

// ─── Çekim Geçmişi Modal ──────────────────────────────────────────────────
async function openWithdrawHistoryModal() {
    closeAllModals();
    const modal = document.getElementById('withdrawHistoryModal');
    if (!modal) return;
    modal.classList.add('active');
    await fetchWithdrawHistory();
}

function closeWithdrawHistoryModal() {
    const modal = document.getElementById('withdrawHistoryModal');
    if (modal) modal.classList.remove('active');
}

async function fetchWithdrawHistory() {
    const contentEl = document.getElementById('withdrawHistoryContent');
    if (!contentEl) return;
    contentEl.innerHTML = `<div class="history-loading"><div class="spinner"></div><p>Yükleniyor...</p></div>`;
    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/withdraw-history`);
        const data = await response.json();
        if (data.success && data.logs) {
            renderWithdrawHistory(data.logs);
        } else {
            contentEl.innerHTML = `<p class="history-error">${data.message || 'Geçmiş yüklenemedi.'}</p>`;
        }
    } catch (error) {
        console.error('Fetch history error:', error);
        contentEl.innerHTML = `<p class="history-error">Bağlantı hatası oluştu.</p>`;
    }
}

function renderWithdrawHistory(logs) {
    const contentEl = document.getElementById('withdrawHistoryContent');
    if (!contentEl) return;
    if (!logs || logs.length === 0) {
        contentEl.innerHTML = `<div class="history-empty"><p>Henüz bir çekim talebiniz bulunmuyor.</p></div>`;
        return;
    }

    let html = '<div class="history-list">';
    logs.forEach(log => {
        const date = new Date(log.created_at).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        let statusClass = 'status-pending', statusText = 'Bekliyor';
        if (log.status === 'success')          { statusClass = 'status-success';      statusText = 'Tamamlandı'; }
        else if (log.status === 'bank_returned' || log.status === 'error' || log.status === 'refunded') {
            statusClass = 'status-error'; statusText = log.status === 'refunded' ? 'İade Edildi' : 'Başarısız';
        } else if (log.status === 'pending_bank') { statusClass = 'status-pending-bank'; statusText = 'Banka Onayında'; }

        const amountStr = parseFloat(log.amount).toFixed(2).replace('.', ',');
        html += `
            <div class="history-item">
                <div class="history-item-header">
                    <span class="history-date">${date}</span>
                    <span class="history-status ${statusClass}">${statusText}</span>
                </div>
                <div class="history-item-body">
                    <div class="history-amount">${amountStr} TL</div>
                    <div class="history-iban">${log.beneficiary_iban}</div>
                </div>
                ${log.error_message && (log.status === 'error' || log.status === 'bank_returned' || log.status === 'refunded')
                    ? `<div class="history-error-msg">${log.error_message}</div>` : ''}
            </div>`;
    });
    html += '</div>';
    contentEl.innerHTML = html;
}
