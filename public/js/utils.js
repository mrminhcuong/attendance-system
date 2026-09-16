const API_BASE = '';

async function apiCall(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json'
    };
    
    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(`${API_BASE}${url}`, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || data.error || 'Có lỗi xảy ra từ máy chủ');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

function showElement(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function hideElement(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    
    container.appendChild(toast);
    
    void toast.offsetWidth; // Trigger reflow
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const utcStr = (dateStr.length === 19 && dateStr.includes(' ')) ? dateStr.replace(' ', 'T') + 'Z' : dateStr;
    const date = new Date(utcStr);
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const utcStr = (timeStr.length === 19 && timeStr.includes(' ')) ? timeStr.replace(' ', 'T') + 'Z' : timeStr;
    const date = new Date(utcStr);
    return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading() {
    showElement('loading-overlay');
}

function hideLoading() {
    hideElement('loading-overlay');
}
