// ============================================
// RiseGo Sürücü Paneli - Car Change Module
// ============================================
// Gereksinim: utils.js önce yüklenmiş olmalı

var pendingPlate = '';
var pendingCar   = null;

// ─── Plaka Değiştirme Modal ───────────────────────────────────────────────
function openEditPlate() {
    if (!currentDriverData) return;
    document.getElementById('plateInput').value           = currentDriverData.carNumber || '';
    document.getElementById('plateError').textContent     = '';
    document.getElementById('editPlateModal').classList.add('active');
    setTimeout(() => document.getElementById('plateInput').focus(), 200);
}

function closeEditPlate() {
    document.getElementById('editPlateModal').classList.remove('active');
    document.getElementById('plateError').textContent = '';
    pendingPlate = '';
    pendingCar   = null;
}

async function checkPlate() {
    const input   = document.getElementById('plateInput');
    const errorEl = document.getElementById('plateError');
    const btn     = document.getElementById('checkPlateBtn');
    if (!input || !errorEl || !btn) return;

    const plate = input.value.trim().toUpperCase();
    if (plate.length < 3) { errorEl.textContent = 'Geçerli bir plaka numarası giriniz.'; return; }

    const btnText   = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    if (btnText)   btnText.style.display   = 'none';
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
        if (btnText)   btnText.style.display   = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

// ─── Araç Onay Modal ──────────────────────────────────────────────────────
function showConfirmCarModal(car) {
    document.getElementById('confirmCarBrand').textContent = car.brand || '-';
    document.getElementById('confirmCarModel').textContent = car.model || '-';
    document.getElementById('confirmCarYear').textContent  = car.year ? String(car.year) : '-';
    document.getElementById('confirmCarModal').classList.add('active');
}

function closeConfirmCar() {
    document.getElementById('confirmCarModal').classList.remove('active');
    pendingPlate = '';
    pendingCar   = null;
}

async function confirmCarChange() {
    if (!pendingCar || !pendingPlate || !currentDriverData) {
        console.error('confirmCarChange: eksik veri', { pendingCar, pendingPlate, currentDriverData: !!currentDriverData });
        alert('Eksik bilgi. Lütfen tekrar deneyin.');
        return;
    }
    const btn       = document.getElementById('confirmCarModal').querySelector('.btn-onayla');
    const btnText   = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    btnText.style.display   = 'none';
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
                year:  pendingCar.year  || ''
            })
        });
        const data = await response.json();
        if (data.success && data.car) {
            updateDriverCarDisplay(data.car);
            closeConfirmCar();
        } else if (data.success) {
            updateDriverCarDisplay({ id: pendingCar.id, brand: pendingCar.brand || '', model: pendingCar.model || '', year: pendingCar.year || '', number: pendingPlate });
            closeConfirmCar();
        } else {
            alert(data.message || 'Araç değiştirilemedi.');
        }
    } catch (error) {
        console.error('Confirm car error:', error);
        alert('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.\n\nHata: ' + error.message);
    } finally {
        btnText.style.display   = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

// ─── Yeni Araç Modal ─────────────────────────────────────────────────────
function showNewCarModal(plate) {
    pendingPlate = plate;
    document.getElementById('newCarPlateDisplay').textContent = `Plaka: ${plate}`;
    document.getElementById('newCarBrand').innerHTML    = '<option value="">Marka seçin...</option>';
    document.getElementById('newCarModel').innerHTML    = '<option value="">Önce marka seçin...</option>';
    document.getElementById('newCarModel').disabled    = true;
    document.getElementById('newCarYear').value         = '';
    document.getElementById('newCarError').textContent  = '';
    loadCarBrandsAndYears();
    document.getElementById('newCarModal').classList.add('active');
}

function closeNewCarModal() {
    document.getElementById('newCarModal').classList.remove('active');
    pendingPlate = '';
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
        opt.value = m; opt.textContent = m;
        modelSelect.appendChild(opt);
    });
}

async function loadCarBrandsAndYears() {
    const brandSelect = document.getElementById('newCarBrand');
    const yearSelect  = document.getElementById('newCarYear');
    // Cache'den yükle
    if (carBrandsWithModels.length > 0 && brandSelect.options.length > 1) {
        const currentYear = new Date().getFullYear();
        if (yearSelect.options.length <= 1) {
            yearSelect.innerHTML = '<option value="">Yıl seçin...</option>';
            for (let y = currentYear; y >= 2000; y--) {
                const opt = document.createElement('option');
                opt.value = y; opt.textContent = y;
                yearSelect.appendChild(opt);
            }
        }
        return;
    }
    const errEl = document.getElementById('newCarError');
    try {
        const res  = await fetch(`${API_BASE}/drivers/car-brands`);
        const data = await res.json();
        if (data.success) {
            if (errEl) errEl.textContent = '';
            carBrandsWithModels = data.brandsWithModels || [];
            const brands = data.brands || carBrandsWithModels.map(b => b.brand) || [];
            brandSelect.innerHTML = '<option value="">Marka seçin...</option>';
            brands.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b; opt.textContent = b;
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
        opt.value = y; opt.textContent = y;
        yearSelect.appendChild(opt);
    }
}

async function saveNewCar() {
    const brand   = document.getElementById('newCarBrand').value.trim();
    const model   = document.getElementById('newCarModel').value?.trim() || '';
    const year    = document.getElementById('newCarYear').value;
    const errorEl = document.getElementById('newCarError');
    const btn     = document.getElementById('saveNewCarBtn');
    const btnText   = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    if (!brand || !model || !year) { errorEl.textContent = 'Marka, model ve yıl alanları zorunludur.'; return; }

    btnText.style.display   = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        const response = await authenticatedFetch(`${API_BASE}/drivers/change-car`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate: pendingPlate, brand, model, year: parseInt(year, 10) })
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
        btnText.style.display   = 'inline';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    }
}

function updateDriverCarDisplay(car) {
    const carText = `${car.brand || ''} ${car.model || ''} (${car.year || ''}) - Plaka: ${car.number || ''}`;
    currentDriverData.car       = carText;
    currentDriverData.carId     = car.id;
    currentDriverData.carNumber = car.number;
    document.getElementById('profileCar').textContent    = carText;
    document.getElementById('editCarBtn').style.display  = 'inline-flex';
}
