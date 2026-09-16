let html5QrcodeScanner;
let currentQrToken = null;

document.addEventListener('DOMContentLoaded', () => {
    initScanner();

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentCode = document.getElementById('student_code').value.trim();
        if (!studentCode) {
            showToast('Vui lòng nhập mã sinh viên', 'error');
            return;
        }

        try {
            showLoading();
            const fingerprint = await window.DeviceIdentity.getFingerprint();
            const deviceInfo = window.DeviceIdentity.getDeviceInfo();

            // Register device
            await apiCall('/api/register-device', {
                method: 'POST',
                body: JSON.stringify({ deviceFingerprint: fingerprint, studentCode, deviceInfo })
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
    
    html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        false
    );
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

async function onScanSuccess(decodedText, decodedResult) {
    try {
        const qrData = JSON.parse(decodedText);
        if (!qrData.token) {
            throw new Error("Mã QR không hợp lệ");
        }
        
        if (html5QrcodeScanner) {
            await html5QrcodeScanner.clear();
        }
        
        currentQrToken = qrData.token;
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
            <p><strong>Họ Tên:</strong> ${result.studentName || 'Không rõ'}</p>
            <p><strong>Mã SV:</strong> ${result.studentCode || 'Không rõ'}</p>
            <p><strong>Lớp:</strong> ${result.className || 'Không rõ'}</p>
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
