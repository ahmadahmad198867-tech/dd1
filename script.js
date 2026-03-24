import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCxi8zbwAIaTi8ngaIv0goV6h1imM8MLAM",
    authDomain: "jghg-b1fc0.firebaseapp.com",
    projectId: "jghg-b1fc0",
    storageBucket: "jghg-b1fc0.firebasestorage.app",
    messagingSenderId: "185126616319",
    appId: "1:185126616319:web:1cd3230303fbaa714960ca"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

localforage.config({ name: 'CarContractsApp' });

let merchants = [];
let currentMerchantId = null;
let currentTransactionId = null;
let qrcodeInstance = null;

async function initApp() {
    const storedMerchants = await localforage.getItem('carContractsMerchants');
    if (storedMerchants) {
        merchants = storedMerchants;
    } else {
        const legacyData = localStorage.getItem('carContractsMerchants');
        if (legacyData) {
            merchants = JSON.parse(legacyData);
            await localforage.setItem('carContractsMerchants', merchants);
        }
    }

    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-btn').innerText = '☀️';
    }

    setupEditableFields();
    setupAutoExpand();
    setupQrGenerator();
    syncSignatureNames();

    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
    }
}

document.addEventListener('DOMContentLoaded', initApp);

function updateConnectionStatus() {
    const statusDiv = document.getElementById('connection-status');
    if (navigator.onLine) {
        statusDiv.className = 'connection-status status-online';
        statusDiv.innerText = 'Online';
        syncData();
    } else {
        statusDiv.className = 'connection-status status-offline';
        statusDiv.innerText = 'Offline';
    }
}

async function syncData() {
    if (!navigator.onLine) return;
    
    const statusDiv = document.getElementById('connection-status');
    statusDiv.className = 'connection-status status-syncing';
    statusDiv.innerText = 'Syncing...';

    try {
        const querySnapshot = await getDocs(collection(db, "merchants"));
        let serverMerchants = [];
        querySnapshot.forEach((docSnap) => {
            serverMerchants.push(docSnap.data());
        });

        let merged = [...serverMerchants];
        merchants.forEach(localM => {
            let serverMIndex = merged.findIndex(sm => sm.id === localM.id);
            if (serverMIndex > -1) {
                let serverM = merged[serverMIndex];
                localM.transactions.forEach(localT => {
                    let tIndex = serverM.transactions.findIndex(st => st.id === localT.id);
                    if (tIndex === -1) {
                        serverM.transactions.push(localT);
                    } else {
                        serverM.transactions[tIndex] = localT;
                    }
                });
                serverM.name = localM.name;
                serverM.phone = localM.phone;
                serverM.date = localM.date;
                serverM.notes = localM.notes;
            } else {
                merged.push(localM);
            }
        });

        merchants = merged;
        await localforage.setItem('carContractsMerchants', merchants);

        for (let m of merchants) {
            await setDoc(doc(db, "merchants", m.id.toString()), m);
        }

        await localforage.setItem('syncQueue', []);

        const msg = document.getElementById('prayer-msg');
        const login = document.getElementById('login-overlay');
        if (msg.style.display === 'none' && !login.classList.contains('active-view')) {
            if (document.getElementById('merchants-list').style.display !== 'none') {
                renderMerchants();
            }
            if (currentMerchantId) {
                const m = merchants.find(x => x.id === currentMerchantId);
                if(m) renderTransactions(m);
            }
        }

        statusDiv.className = 'connection-status status-online';
        statusDiv.innerText = 'Online';
    } catch (error) {
        console.error("Sync error:", error);
        statusDiv.className = 'connection-status status-offline';
        statusDiv.innerText = 'Sync Failed (Offline)';
    }
}

async function saveData() {
    await localforage.setItem('carContractsMerchants', merchants);
    let syncQueue = await localforage.getItem('syncQueue') || [];
    syncQueue.push(Date.now());
    await localforage.setItem('syncQueue', syncQueue);
    
    if (navigator.onLine) {
        syncData();
    }
}

function setupEditableFields() {
    const editableFields = getEditableFields();
    editableFields.forEach((field, index) => {
        field.dataset.fieldKey = `field_${index}`;
        field.dataset.baseFontSize = window.getComputedStyle(field).fontSize;
        field.addEventListener('keydown', preventLineBreaks);
        field.addEventListener('paste', handleSingleLinePaste);
        field.addEventListener('input', () => fitTextToField(field));
        fitTextToField(field);
    });
}

function getEditableFields() {
    return Array.from(document.querySelectorAll('#contract-form .auto-expand[contenteditable="true"]'));
}

function preventLineBreaks(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
    }
}

function handleSingleLinePaste(event) {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text.replace(/[\r\n]+/g, ' ').trim());
}

function fitTextToField(field) {
    const baseFontSize = parseFloat(field.dataset.baseFontSize || 13);
    const minFontSize = 8;
    field.style.fontSize = `${baseFontSize}px`;

    while (field.scrollWidth > field.clientWidth && parseFloat(field.style.fontSize) > minFontSize) {
        field.style.fontSize = `${parseFloat(field.style.fontSize) - 0.5}px`;
    }
}

function syncSignatureNames() {
    const sellerName = document.getElementById('seller-name');
    const buyerName = document.getElementById('buyer-name');
    const sellerSig = document.getElementById('seller-signature-name');
    const buyerSig = document.getElementById('buyer-signature-name');

    if (sellerName && sellerSig) {
        sellerName.addEventListener('input', () => {
            sellerSig.innerText = sellerName.innerText;
            fitTextToField(sellerSig);
        });
    }

    if (buyerName && buyerSig) {
        buyerName.addEventListener('input', () => {
            buyerSig.innerText = buyerName.innerText;
            fitTextToField(buyerSig);
        });
    }
}

window.checkPassword = function() {
    const password = document.getElementById('login-password').value;
    if (password === '1001') {
        document.getElementById('login-overlay').classList.remove('active-view');
        showPrayerMsg();
    } else {
        alert('الرمز غير صحيح، يرجى المحاولة مرة أخرى.');
        document.getElementById('login-password').value = '';
    }
};

function showPrayerMsg() {
    const msg = document.getElementById('prayer-msg');
    msg.style.display = 'block';

    setTimeout(() => {
        msg.style.display = 'none';
        renderMerchants();
        showView('main-view');
    }, 3000);
}

document.getElementById('login-password').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        window.checkPassword();
    }
});

window.toggleDarkMode = function() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-btn').innerText = isDark ? '☀️' : '🌙';
};

window.showView = function(viewId) {
    document.querySelectorAll('.app-view').forEach(view => {
        view.classList.remove('active-view');
    });
    document.getElementById(viewId).classList.add('active-view');
};

window.addMerchant = async function() {
    const name = document.getElementById('merchant-name').value;
    const phone = document.getElementById('merchant-phone').value;
    const date = document.getElementById('merchant-date').value;
    const notes = document.getElementById('merchant-notes').value;

    if (!name) {
        alert('يرجى إدخال اسم التاجر على الأقل!');
        return;
    }

    const newMerchant = {
        id: Date.now(),
        name,
        phone,
        date,
        notes,
        transactions: []
    };

    merchants.push(newMerchant);
    await saveData();
    renderMerchants();

    document.getElementById('merchant-name').value = '';
    document.getElementById('merchant-phone').value = '';
    document.getElementById('merchant-date').value = '';
    document.getElementById('merchant-notes').value = '';
};

function renderMerchants() {
    const list = document.getElementById('merchants-list');
    list.innerHTML = '';

    merchants.forEach(m => {
        const div = document.createElement('div');
        div.className = 'list-item fade-in';
        div.innerHTML = `
            <div>
                <h3 style="margin: 0;">${m.name}</h3>
                <small>الرقم: ${m.phone} | التاريخ: ${m.date}</small>
            </div>
            <button class="btn btn-primary" onclick="openMerchantDetails(${m.id})">عرض المعاملات</button>
        `;
        list.appendChild(div);
    });
}

window.searchAllTransactions = function() {
    const text = document.getElementById('search-transactions').value.trim();
    const merchantsList = document.getElementById('merchants-list');
    const resultsList = document.getElementById('search-results');

    if (!text) {
        merchantsList.style.display = 'block';
        resultsList.style.display = 'none';
        return;
    }

    let advancedResults = [];
    merchants.forEach(m => {
        const nameMatch = m.name.includes(text);

        m.transactions.forEach(t => {
            const transactionPayload = normalizeTransactionData(t.data || {});
            const carNumber = transactionPayload.field_2 || '';
            const buyerName = transactionPayload.field_13 || '';
            const chassisNumber = transactionPayload.field_26 || '';
            
            const carNumberMatch = carNumber.includes(text);
            const buyerMatch = buyerName.includes(text);
            const chassisMatch = chassisNumber.includes(text);

            if (nameMatch || carNumberMatch || buyerMatch || chassisMatch) {
                advancedResults.push({
                    merchantId: m.id,
                    merchantName: m.name,
                    transaction: t,
                    carNumber
                });
            }
        });
    });

    renderSearchResults(advancedResults);
    merchantsList.style.display = 'none';
    resultsList.style.display = 'block';
};

function renderSearchResults(results) {
    const list = document.getElementById('search-results');
    list.innerHTML = '';

    if (results.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding: 20px;">لا توجد معاملات تطابق بحثك.</p>';
        return;
    }

    results.forEach(r => {
        const div = document.createElement('div');
        div.className = 'list-item pop-in';
        div.innerHTML = `
            <div>
                <h3 style="margin: 0; color: #0056b3;">${r.merchantName}</h3>
                <small>تاريخ المعاملة: ${r.transaction.date} | رقم السيارة: ${r.carNumber || 'غير متوفر'}</small>
            </div>
            <div>
                <button class="btn btn-primary" onclick="openTransactionFromSearch(${r.merchantId}, ${r.transaction.id})">عرض العقد</button>
            </div>
        `;
        list.appendChild(div);
    });
}

window.openTransactionFromSearch = function(merchantId, transactionId) {
    currentMerchantId = merchantId;
    window.editTransaction(transactionId);
};

window.openMerchantDetails = function(merchantId) {
    currentMerchantId = merchantId;
    const merchant = merchants.find(m => m.id === merchantId);
    document.getElementById('current-merchant-title').innerText = `معاملات التاجر: ${merchant.name}`;

    renderTransactions(merchant);
    window.showView('merchant-details-view');
};

function renderTransactions(merchant) {
    const list = document.getElementById('transactions-list');
    list.innerHTML = '';

    if (merchant.transactions.length === 0) {
        list.innerHTML = '<p>لا توجد معاملات سابقة لهذا التاجر.</p>';
        return;
    }

    merchant.transactions.forEach((t, index) => {
        const transactionPayload = normalizeTransactionData(t.data || {});
        const div = document.createElement('div');
        div.className = 'list-item pop-in';
        div.innerHTML = `
            <div>
                <strong>معاملة رقم #${index + 1}</strong> <br>
                <small>التاريخ: ${t.date} | المركبة: ${transactionPayload.field_2 || ''}</small>
            </div>
            <div>
                <button class="btn btn-primary" onclick="editTransaction(${t.id})">✏️ فتح وتعديل</button>
                <button class="btn btn-danger" onclick="deleteTransaction(${t.id})">🗑️ حذف</button>
            </div>
        `;
        list.appendChild(div);
    });
}

window.openNewTransaction = function() {
    currentTransactionId = null;
    clearContractForm();
    window.showView('contract-view');
};

window.editTransaction = function(transactionId) {
    currentTransactionId = transactionId;
    const merchant = merchants.find(m => m.id === currentMerchantId);
    const transaction = merchant.transactions.find(t => t.id === transactionId);
    const payload = normalizeTransactionData(transaction.data || {});
    const fields = getEditableFields();

    fields.forEach(field => {
        const value = payload[field.dataset.fieldKey] || '';
        field.innerText = value;
        fitTextToField(field);
        field.dispatchEvent(new Event('input', { bubbles: true }));
    });

    generateQr.call(document.getElementById('chassis-input'));
    window.showView('contract-view');
};

window.deleteTransaction = async function(transactionId) {
    if (confirm('هل أنت متأكد من حذف هذه المعاملة بشكل نهائي؟')) {
        const merchant = merchants.find(m => m.id === currentMerchantId);
        merchant.transactions = merchant.transactions.filter(t => t.id !== transactionId);
        await saveData();
        renderTransactions(merchant);
    }
};

window.saveTransaction = async function() {
    const merchant = merchants.find(m => m.id === currentMerchantId);
    const contractData = collectContractData();

    if (currentTransactionId) {
        const transaction = merchant.transactions.find(t => t.id === currentTransactionId);
        transaction.data = contractData;
    } else {
        merchant.transactions.push({
            id: Date.now(),
            date: new Date().toLocaleDateString('ar-IQ'),
            data: contractData
        });
    }

    await saveData();
    alert('تم حفظ المعاملة بنجاح!');
    window.openMerchantDetails(currentMerchantId);
};

function clearContractForm() {
    getEditableFields().forEach(field => {
        field.innerText = '';
        field.style.fontSize = field.dataset.baseFontSize || '13px';
        fitTextToField(field);
    });

    document.getElementById('seller-signature-name').innerText = '';
    document.getElementById('buyer-signature-name').innerText = '';
    generateQr.call(document.getElementById('chassis-input'));
}

function collectContractData() {
    const data = {};
    getEditableFields().forEach(field => {
        data[field.dataset.fieldKey] = field.innerText.trim();
    });
    return data;
}

function normalizeTransactionData(rawData) {
    if (!Array.isArray(rawData)) {
        return rawData;
    }

    const normalized = {};
    const fields = getEditableFields();
    const oldTrailingCount = 4;
    const newTrailingCount = 6;

    if (rawData.length + 2 === fields.length) {
        const prefixCount = rawData.length - oldTrailingCount;

        for (let i = 0; i < prefixCount; i += 1) {
            normalized[`field_${i}`] = rawData[i] || '';
        }

        const oldDateValue = rawData[prefixCount] || '';
        const dateParts = oldDateValue.split('/').map(part => part.trim()).filter(Boolean);
        normalized[`field_${prefixCount}`] = dateParts[0] || '';
        normalized[`field_${prefixCount + 1}`] = dateParts[1] || '';
        normalized[`field_${prefixCount + 2}`] = dateParts[2] || '';

        normalized[`field_${fields.length - 3}`] = rawData[prefixCount + 1] || '';
        normalized[`field_${fields.length - 2}`] = rawData[prefixCount + 2] || '';
        normalized[`field_${fields.length - 1}`] = rawData[prefixCount + 3] || '';
        return normalized;
    }

    fields.forEach((field, index) => {
        normalized[field.dataset.fieldKey] = rawData[index] || '';
    });

    return normalized;
}

function setupAutoExpand() {
    getEditableFields().forEach(field => {
        fitTextToField(field);
    });
}

function setupQrGenerator() {
    const chassisInput = document.getElementById('chassis-input');
    chassisInput.addEventListener('input', generateQr);
}

function generateQr() {
    const value = (this.innerText || '').trim();
    const qrContainer = document.getElementById('chassis-qrcode-container');
    const qrDiv = document.getElementById('chassis-qrcode');
    const textDiv = document.getElementById('qr-chassis-text');

    if (!value) {
        qrContainer.style.display = 'none';
        qrContainer.classList.remove('pop-in');
        qrDiv.innerHTML = '';
        textDiv.innerText = '';
        qrcodeInstance = null;
        return;
    }

    if (qrContainer.style.display === 'none') {
        qrContainer.style.display = 'inline-flex';
        qrContainer.classList.add('pop-in');
    }

    textDiv.innerText = value;

    if (!qrcodeInstance) {
        qrcodeInstance = new QRCode(qrDiv, {
            text: value,
            width: 84,
            height: 84,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    } else {
        qrcodeInstance.clear();
        qrcodeInstance.makeCode(value);
    }
}
