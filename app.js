// ====== Firebase Config ======
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
};

// ====== Imports ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getDatabase, ref, set, get, update, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ====== Elements ======
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

const adminUid = document.getElementById('adminUid');
const adminName = document.getElementById('adminName');
const adminNationalId = document.getElementById('adminNationalId');
const adminCardName = document.getElementById('adminCardName');
const adminCardNumber = document.getElementById('adminCardNumber');
const adminAccountNumber = document.getElementById('adminAccountNumber');
const adminSheba = document.getElementById('adminSheba');
const adminExpiry = document.getElementById('adminExpiry');
const adminCvv2 = document.getElementById('adminCvv2');
const adminPin = document.getElementById('adminPin');
const adminAmount = document.getElementById('adminAmount');
const adminSend = document.getElementById('adminSend');
const adminLog = document.getElementById('adminLog');
const adminList = document.getElementById('adminList');

const empScan = document.getElementById('empScan');
const empStop = document.getElementById('empStop');
const empLog = document.getElementById('empLog');
const empPinBox = document.getElementById('empPinBox');
const empPinInput = document.getElementById('empPinInput');
const empPinBtn = document.getElementById('empPinBtn');
const empResult = document.getElementById('empResult');

// ====== Tab Switch ======
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// ====== Hash ساده برای PIN (SHA-256) ======
async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + "_SALT_123");
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// ====== Admin: ثبت کارت جدید ======
adminSend.addEventListener('click', async () => {
    const uid = adminUid.value.trim();
    const pin = adminPin.value.trim();

    if (!uid || pin.length !== 4) {
        adminLog.textContent = '❌ UID و PIN ۴ رقمی لازمه';
        return;
    }

    adminLog.textContent = '⏳ در حال ذخیره...';

    try {
        const pinHash = await hashPin(pin);
        const amount = parseInt(adminAmount.value) || 0;

        await set(ref(db, 'cards/' + uid), {
            status: amount > 0 ? 'pending' : 'active',
            pendingAmount: amount,
            balance: amount,
            pinHash: pinHash,
            owner: {
                name: adminName.value.trim(),
                nationalId: adminNationalId.value.trim(),
                cardName: adminCardName.value.trim(),
                cardNumber: adminCardNumber.value.trim(),
                accountNumber: adminAccountNumber.value.trim(),
                sheba: adminSheba.value.trim(),
                expiry: adminExpiry.value.trim(),
                cvv2: adminCvv2.value.trim(),
            },
            updatedAt: Date.now()
        });

        adminLog.textContent = `✅ کارت ${uid} ذخیره شد`;
    } catch (err) {
        adminLog.textContent = '❌ خطا: ' + err.message;
    }
});

// ====== Admin: نمایش لیست ======
onValue(ref(db, 'cards'), (snapshot) => {
    adminList.innerHTML = '';
    const data = snapshot.val();
    if (!data) {
        adminList.innerHTML = '<p class="hint">هنوز کارتی ثبت نشده</p>';
        return;
    }
    Object.entries(data).forEach(([uid, info]) => {
        const div = document.createElement('div');
        div.className = 'card-item';
        div.innerHTML = `
            <span class="uid">${uid}</span>
            <span>${info.owner?.name || '—'}</span>
            <span class="badge ${info.status}">
                ${info.status === 'pending' ? 'در انتظار' : 'فعال'}
            </span>
        `;
        adminList.appendChild(div);
    });
});

// ====== Employee: NFC Scan ======
let ndefReader = null;
let currentUid = null;
let currentCardData = null;

empScan.addEventListener('click', async () => {
    if (!('NDEFReader' in window)) {
        empLog.textContent = '❌ Web NFC پشتیبانی نمیشه';
        return;
    }

    try {
        ndefReader = new NDEFReader();
        await ndefReader.scan();
        empLog.textContent = '⏳ کارت رو بچسبون...';
        empScan.disabled = true;
        empStop.disabled = false;
        empPinBox.style.display = 'none';
        empResult.innerHTML = '';

        ndefReader.onreading = async (event) => {
            const uid = event.serialNumber;
            if (!uid) return;

            currentUid = uid;
            empLog.textContent = `🔍 در حال بررسی...`;

            const snapshot = await get(ref(db, 'cards/' + uid));
            if (!snapshot.exists()) {
                empLog.textContent = '❌ این کارت در سیستم ثبت نشده';
                return;
            }

            currentCardData = snapshot.val();

            // اگه pending هست، اول بنویس
            if (currentCardData.status === 'pending' && currentCardData.pendingAmount) {
                try {
                    const writer = new NDEFReader();
                    await writer.write(String(currentCardData.pendingAmount), { overwrite: true });
                    await update(ref(db, 'cards/' + uid), {
                        status: 'active',
                        balance: currentCardData.pendingAmount,
                        writtenAt: Date.now()
                    });
                    currentCardData.balance = currentCardData.pendingAmount;
                } catch (e) {
                    empLog.textContent = '❌ خطا در نوشتن: ' + e.message;
                    return;
                }
            }

            // نمایش ۴ رقم آخر شماره کارت + درخواست PIN
            const cardNum = currentCardData.owner?.cardNumber || '';
            const last4 = cardNum.slice(-4);
            empLog.textContent = `💳 کارت: **** **** **** ${last4}`;

            empPinBox.style.display = 'block';
            empPinInput.value = '';
            empPinInput.focus();
        };
    } catch (err) {
        empLog.textContent = '❌ خطا: ' + err.message;
    }
});

// ====== Employee: بررسی PIN و نمایش اطلاعات ======
empPinBtn.addEventListener('click', async () => {
    const pin = empPinInput.value.trim();
    if (pin.length !== 4) {
        alert('PIN باید ۴ رقم باشه');
        return;
    }

    const pinHash = await hashPin(pin);

    if (pinHash !== currentCardData.pinHash) {
        empLog.textContent = '❌ PIN اشتباهه';
        empPinInput.value = '';
        return;
    }

    // PIN درسته → نمایش اطلاعات
    const o = currentCardData.owner || {};
    empPinBox.style.display = 'none';
    empResult.innerHTML = `
        <div class="info-row"><span>نام:</span><b>${o.name || '—'}</b></div>
        <div class="info-row"><span>کد ملی:</span><b>${o.nationalId || '—'}</b></div>
        <div class="info-row"><span>نام کارت:</span><b>${o.cardName || '—'}</b></div>
        <div class="info-row"><span>شماره کارت:</span><b>${o.cardNumber || '—'}</b></div>
        <div class="info-row"><span>شماره حساب:</span><b>${o.accountNumber || '—'}</b></div>
        <div class="info-row"><span>شبا:</span><b>${o.sheba || '—'}</b></div>
        <div class="info-row"><span>تاریخ انقضا:</span><b>${o.expiry || '—'}</b></div>
        <div class="info-row"><span>CVV2:</span><b>${o.cvv2 || '—'}</b></div>
        <div class="info-row big"><span>موجودی:</span><b>${currentCardData.balance || 0} تومان</b></div>
    `;
    empLog.textContent = '✅ PIN درست بود';
});

empStop.addEventListener('click', () => {
    ndefReader = null;
    empLog.textContent = '⏹ اسکن متوقف شد';
    empScan.disabled = false;
    empStop.disabled = true;
    empPinBox.style.display = 'none';
});
