let html5QrcodeScanner;
let currentQrToken = null;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
        processCheckInToken(tokenFromUrl);
    } else {
        initScanner();
    }

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentCode = document.getElementById('student_code').value.trim();
        const fullName = document.getElementById('full_name').value.trim();
        const email = document.getElementById('email').value.trim();

        if (!studentCode || !fullName || !email) {
            showToast('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }

        try {
            showLoading();
            const fingerprint = await window.DeviceIdentity.getFingerprint();
            const deviceInfo = window.DeviceIdentity.getDeviceInfo();

            // Register device
            await apiCall('/api/register-device', {
                method: 'POST',
                body: JSON.stringify({ 
                    deviceFingerprint: fingerprint, 
                    studentCode, 
                    full_name: fullName, 
                    email: email,
                    deviceInfo 
                })
            });

            // Perform check-in immediately after registration
            await performCheckIn(fingerprint, currentQrToken);
        } catch (error) {
            hideLoading();
            showToast(error.message, 'error');
        }
    });
});

function initScanner() {
    hideElement('result-section');
    hideElement('register-section');
    showElement('qr-reader');
    
    // Check if URL has token to avoid starting camera unnecessarily
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('token')) return;

    html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        false
    );
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

async function processCheckInToken(token) {
    try {
        currentQrToken = token;
        hideElement('qr-reader');
        showLoading();

        const fingerprint = await window.DeviceIdentity.getFingerprint();
        
        const deviceCheck = await apiCall('/api/check-device', {
            method: 'POST',
            body: JSON.stringify({ deviceFingerprint: fingerprint })
        });

        if (deviceCheck.isRegistered) {
            await performCheckIn(fingerprint, currentQrToken);
        } else {
            hideLoading();
            showElement('register-section');
            document.getElementById('student_code').focus();
        }
    } catch (error) {
        console.error(error);
        hideLoading();
        showToast(error.message || 'Lỗi hệ thống', 'error');
        setTimeout(() => {
            window.history.replaceState({}, document.title, window.location.pathname); // clear token from url
            initScanner();
        }, 2000);
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    try {
        let token = null;
        if (decodedText.startsWith('http')) {
            const url = new URL(decodedText);
            token = url.searchParams.get('token');
        } else {
            const qrData = JSON.parse(decodedText);
            token = qrData.token;
        }

        if (!token) {
            throw new Error("Mã QR không hợp lệ");
        }
        
        if (html5QrcodeScanner) {
            await html5QrcodeScanner.clear();
        }
        
        await processCheckInToken(token);
    } catch (error) {
        console.error(error);
        if (html5QrcodeScanner) {
            await html5QrcodeScanner.clear();
        }
        hideLoading();
        showToast(error.message || 'Lỗi khi đọc mã QR', 'error');
        setTimeout(initScanner, 2000);
    }
}

function onScanFailure(error) {
    // Ignore routine scan failures
}

async function performCheckIn(fingerprint, qrToken) {
    try {
        const result = await apiCall('/api/attendance/check-in', {
            method: 'POST',
            body: JSON.stringify({ deviceFingerprint: fingerprint, qrToken })
        });

        hideLoading();
        hideElement('register-section');
        showElement('result-section');
        
        const infoDisplay = document.getElementById('student-info-display');
        infoDisplay.innerHTML = `
            <p><strong>Họ Tên:</strong> ${result.student?.full_name || 'Không rõ'}</p>
            <p><strong>Mã SV:</strong> ${result.student?.student_code || 'Không rõ'}</p>
            <p><strong>Lớp:</strong> ${result.student?.class_name || 'Không rõ'}</p>
            <p><strong>Thời gian:</strong> ${formatDateTime(result.checkInTime || new Date().toISOString())}</p>
        `;
        
        showToast('Điểm danh thành công!', 'success');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
        setTimeout(initScanner, 2000);
    }
}

function resetScanner() {
    currentQrToken = null;
    document.getElementById('student_code').value = '';
    initScanner();
}
