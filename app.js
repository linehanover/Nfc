// ====== Firebase Config ======
// این مقادیر رو از Firebase Console بردار
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ====== Imports ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getDatabase, ref, set, get, update, onValue, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ====== Init ======
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ====== Elements ======
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

const adminUid = document.getElementById('adminUid');
const adminAmount = document.getElementById('adminAmount');
const adminSend = document.getElementById('adminSend');
const adminLog = document.getElementById('adminLog');
const adminList = document.getElementById('adminList');

const empScan = document.getElementById('empScan');
const empStop = document.getElementById('empStop');
const empLog = document.getElementById('empLog');

// ====== Tab Switch ======
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// ====== Admin: ثبت مبلغ ======
adminSend.addEventListener('click', async () => {
    const uid = adminUid.value.trim();
    const amount = parseInt(adminAmount.value);

    if (!uid || !amount || amount <= 0) {
        adminLog.textContent = '❌ UID و مبلغ معتبر وارد کن';
        return;
    }

    adminLog.textContent = '⏳ در حال ارسال...';

    try {
        await set(ref(db, 'cards/' + uid), {
            pendingAmount: amount,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        adminLog.textContent = `✅ برای کارت ${uid} مبلغ ${amount} ثبت شد`;
        adminUid.value = '';
        adminAmount.value = '';
    } catch (err) {
        adminLog.textContent = '❌ خطا: ' + err.message;
    }
});

// ====== Admin: نمایش لیست کارت‌ها ======
onValue(ref(db, 'cards'), (snapshot) => {
    adminList.innerHTML = '';
    const data = snapshot.val();

    if (!data) {
        adminList.innerHTML = '<p class="hint">هنوز کارتی ثبت نشده</p>';
        return;
    }

    Object.entries(data)
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .slice(0, 10)
        .forEach(([uid, info]) => {
            const div = document.createElement('div');
            div.className = 'card-item';
            div.innerHTML = `
                <span class="uid">${uid}</span>
                <span>${info.pendingAmount || 0}</span>
                <span class="badge ${info.status}">
                    ${info.status === 'pending' ? 'در انتظار' : 'انجام شد'}
                </span>
            `;
            adminList.appendChild(div);
        });
});

// ====== Employee: NFC Scan ======
let ndefReader = null;

empScan.addEventListener('click', async () => {
    if (!('NDEFReader' in window)) {
        empLog.textContent = '❌ Web NFC پشتیبانی نمیشه (فقط Chrome اندروید)';
        return;
    }

    try {
        ndefReader = new NDEFReader();
        await ndefReader.scan();
        empLog.textContent = '⏳ کارت رو پشت گوشی بگیر...';
        empScan.disabled = true;
        empStop.disabled = false;

        ndefReader.onreading = async (event) => {
            const uid = event.serialNumber;
            if (!uid) {
                empLog.textContent = '❌ UID کارت خوانده نشد';
                return;
            }

            empLog.textContent = `UID: ${uid}\n⏳ چک Firebase...`;

            try {
                const snapshot = await get(ref(db, 'cards/' + uid));
                if (!snapshot.exists()) {
                    empLog.textContent += '\n❌ این کارت در سیستم ثبت نشده';
                    return;
                }

                const data = snapshot.val();
                if (data.status !== 'pending' || !data.pendingAmount) {
                    empLog.textContent += '\nℹ️ دستور جدیدی برای این کارت نیست';
                    return;
                }

                const amount = data.pendingAmount;
                empLog.textContent += `\n📥 دستور: ${amount} بنویس`;

                // نوشتن روی کارت
                const writer = new NDEFReader();
                await writer.write(String(amount), { overwrite: true });
                empLog.textContent += `\n✅ ${amount} روی کارت نوشته شد`;

                // آپدیت Firebase
                await update(ref(db, 'cards/' + uid), {
                    status: 'done',
                    writtenAt: Date.now()
                });
                empLog.textContent += '\n✅ Firebase آپدیت شد';
            } catch (err) {
                empLog.textContent += '\n❌ خطا: ' + err.message;
            }
        };
    } catch (err) {
        empLog.textContent = '❌ خطا: ' + err.message;
    }
});

empStop.addEventListener('click', () => {
    if (ndefReader) {
        try {
            ndefReader.scan = null;
        } catch (e) {}
        ndefReader = null;
    }
    empLog.textContent = '⏹ اسکن متوقف شد';
    empScan.disabled = false;
    empStop.disabled = true;
});

// ====== Service Worker ======
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(() => console.log('SW registered'))
        .catch(err => console.log('SW error:', err));
}
