// Admin functionality

// Authentication
function getToken() {
    return localStorage.getItem('adminToken');
}

function checkAuth() {
    if (!getToken()) {
        window.location.href = 'login.html';
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = 'login.html';
}

// Custom fetch wrapper to include auth token
async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
    
    // Auto add content-type for JSON if body is stringified JSON and not FormData
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            logout();
            throw new Error('Unauthorized');
        }
        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

// UI Utilities
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);
    
    // Trigger reflow to enable transition
    void toast.offsetWidth;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        if (show) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function formatDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('vi-VN');
}

function formatTime(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function renderPagination(currentPage, totalPages, callbackName) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    let html = '';
    
    // Prev
    html += `<li><button ${currentPage === 1 ? 'disabled' : ''} onclick="${callbackName}(${currentPage - 1})">«</button></li>`;
    
    // Pages
    for (let i = 1; i <= totalPages; i++) {
        html += `<li><button class="${i === currentPage ? 'active' : ''}" onclick="${callbackName}(${i})">${i}</button></li>`;
    }
    
    // Next
    html += `<li><button ${currentPage === totalPages ? 'disabled' : ''} onclick="${callbackName}(${currentPage + 1})">»</button></li>`;
    
    pagination.innerHTML = html;
}

/* ================= Dashboard ================= */
async function loadDashboard() {
    showLoading(true);
    try {
        const res = await authFetch('/api/admin/dashboard');
        const data = await res.json();
        
        document.getElementById('stat-students').textContent = data.totalStudents || 0;
        document.getElementById('stat-subjects').textContent = data.totalSubjects || 0;
        document.getElementById('stat-sessions').textContent = data.todaySessions || 0;
        document.getElementById('stat-attendance').textContent = data.todayAttendance || 0;
        
        const tbody = document.getElementById('recent-attendance-body');
        if (data.recentAttendance && data.recentAttendance.length > 0) {
            tbody.innerHTML = data.recentAttendance.map(record => `
                <tr>
                    <td>${record.student_name}</td>
                    <td>${record.student_code}</td>
                    <td>${record.subject_name}</td>
                    <td>${formatTime(record.check_in_time)}</td>
                    <td><span class="badge badge-success">${record.status}</span></td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Chưa có dữ liệu</td></tr>`;
        }
    } catch (e) {
        showToast('Lỗi tải bảng điều khiển', 'error');
    } finally {
        showLoading(false);
    }
}

/* ================= Students ================= */
let currentStudentPage = 1;

async function loadStudents(page = 1) {
    currentStudentPage = page;
    const search = document.getElementById('searchInput')?.value || '';
    
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/students?page=${page}&search=${encodeURIComponent(search)}`);
        const data = await res.json();
        
        const tbody = document.getElementById('students-body');
        if (data.students && data.students.length > 0) {
            tbody.innerHTML = data.students.map((student, index) => `
                <tr>
                    <td>${(page - 1) * 10 + index + 1}</td>
                    <td>${student.student_code}</td>
                    <td>${student.full_name}</td>
                    <td>${student.class_name || ''}</td>
                    <td>${student.email || ''}</td>
                    <td>${student.phone || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="openEditStudentModal(${student.id})">Sửa</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteStudent(${student.id})">Xóa</button>
                    </td>
                </tr>
            `).join('');
            
            renderPagination(data.currentPage, data.totalPages, 'loadStudents');
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Không tìm thấy sinh viên</td></tr>`;
            document.getElementById('pagination').innerHTML = '';
        }
    } catch (e) {
        showToast('Lỗi tải danh sách sinh viên', 'error');
    } finally {
        showLoading(false);
    }
}

function openAddStudentModal() {
    document.getElementById('studentForm').reset();
    document.getElementById('studentId').value = '';
    document.getElementById('studentModalTitle').textContent = 'Thêm sinh viên';
    openModal('studentModal');
}

async function openEditStudentModal(id) {
    showLoading(true);
    try {
        // Fetch student details - assuming API exists or getting from loaded data
        // For simplicity, we can fetch all and filter or have a specific endpoint
        const res = await authFetch(`/api/admin/students`);
        const data = await res.json();
        const student = data.students.find(s => s.id === id);
        
        if (student) {
            document.getElementById('studentId').value = student.id;
            document.getElementById('studentCode').value = student.student_code;
            document.getElementById('fullName').value = student.full_name;
            document.getElementById('className').value = student.class_name || '';
            document.getElementById('email').value = student.email || '';
            document.getElementById('phone').value = student.phone || '';
            
            document.getElementById('studentModalTitle').textContent = 'Sửa sinh viên';
            openModal('studentModal');
        }
    } catch (e) {
        showToast('Lỗi tải thông tin sinh viên', 'error');
    } finally {
        showLoading(false);
    }
}

async function saveStudent() {
    const id = document.getElementById('studentId').value;
    const student = {
        student_code: document.getElementById('studentCode').value,
        full_name: document.getElementById('fullName').value,
        class_name: document.getElementById('className').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value
    };
    
    if(!student.student_code || !student.full_name) {
        showToast('Vui lòng điền các trường bắt buộc', 'warning');
        return;
    }
    
    const url = id ? `/api/admin/students/${id}` : '/api/admin/students';
    const method = id ? 'PUT' : 'POST';
    
    showLoading(true);
    try {
        const res = await authFetch(url, {
            method: method,
            body: JSON.stringify(student)
        });
        
        if (res.ok) {
            showToast(id ? 'Cập nhật thành công' : 'Thêm thành công');
            closeModal('studentModal');
            loadStudents(currentStudentPage);
        } else {
            const data = await res.json();
            showToast(data.message || 'Có lỗi xảy ra', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

function deleteStudent(id) {
    document.getElementById('deleteId').value = id;
    openModal('deleteModal');
}

async function confirmDeleteStudent() {
    const id = document.getElementById('deleteId').value;
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/students/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Đã xóa sinh viên');
            closeModal('deleteModal');
            loadStudents(currentStudentPage);
        } else {
            showToast('Không thể xóa sinh viên', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

function openImportModal() {
    document.getElementById('csvData').value = '';
    openModal('importModal');
}

async function importStudents() {
    const csvData = document.getElementById('csvData').value;
    if (!csvData.trim()) {
        showToast('Vui lòng nhập dữ liệu CSV', 'warning');
        return;
    }
    
    showLoading(true);
    try {
        const res = await authFetch('/api/admin/students/import', {
            method: 'POST',
            body: JSON.stringify({ csv: csvData })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast(`Đã import thành công ${data.count || 0} sinh viên`);
            closeModal('importModal');
            loadStudents(1);
        } else {
            showToast(data.message || 'Lỗi import', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

/* ================= Subjects ================= */
async function loadSubjects() {
    showLoading(true);
    try {
        const res = await authFetch('/api/admin/subjects');
        const data = await res.json();
        
        const tbody = document.getElementById('subjects-body');
        if (data && data.length > 0) {
            tbody.innerHTML = data.map((sub, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${sub.subject_code}</td>
                    <td>${sub.subject_name}</td>
                    <td>${sub.credits || 3}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="openEditSubjectModal(${sub.id})">Sửa</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteSubject(${sub.id})">Xóa</button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Chưa có môn học nào</td></tr>`;
        }
    } catch (e) {
        showToast('Lỗi tải danh sách môn học', 'error');
    } finally {
        showLoading(false);
    }
}

function openAddSubjectModal() {
    document.getElementById('subjectForm').reset();
    document.getElementById('subjectId').value = '';
    document.getElementById('subjectModalTitle').textContent = 'Thêm môn học';
    openModal('subjectModal');
}

async function openEditSubjectModal(id) {
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/subjects`);
        const data = await res.json();
        const sub = data.find(s => s.id === id);
        
        if (sub) {
            document.getElementById('subjectId').value = sub.id;
            document.getElementById('subjectCode').value = sub.subject_code;
            document.getElementById('subjectName').value = sub.subject_name;
            document.getElementById('credits').value = sub.credits || 3;
            
            document.getElementById('subjectModalTitle').textContent = 'Sửa môn học';
            openModal('subjectModal');
        }
    } catch (e) {
        showToast('Lỗi tải thông tin', 'error');
    } finally {
        showLoading(false);
    }
}

async function saveSubject() {
    const id = document.getElementById('subjectId').value;
    const subject = {
        subject_code: document.getElementById('subjectCode').value,
        subject_name: document.getElementById('subjectName').value,
        credits: parseInt(document.getElementById('credits').value) || 3
    };
    
    if(!subject.subject_code || !subject.subject_name) {
        showToast('Vui lòng điền các trường bắt buộc', 'warning');
        return;
    }
    
    const url = id ? `/api/admin/subjects/${id}` : '/api/admin/subjects';
    const method = id ? 'PUT' : 'POST';
    
    showLoading(true);
    try {
        const res = await authFetch(url, {
            method: method,
            body: JSON.stringify(subject)
        });
        
        if (res.ok) {
            showToast(id ? 'Cập nhật thành công' : 'Thêm thành công');
            closeModal('subjectModal');
            loadSubjects();
        } else {
            const data = await res.json();
            showToast(data.message || 'Có lỗi xảy ra', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

function deleteSubject(id) {
    document.getElementById('deleteSubjectId').value = id;
    openModal('deleteSubjectModal');
}

async function confirmDeleteSubject() {
    const id = document.getElementById('deleteSubjectId').value;
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/subjects/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Đã xóa môn học');
            closeModal('deleteSubjectModal');
            loadSubjects();
        } else {
            showToast('Không thể xóa môn học (có thể do đang có dữ liệu liên quan)', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

/* ================= Sessions ================= */
async function populateSubjectSelect(selectId) {
    try {
        const res = await authFetch('/api/admin/subjects');
        const subjects = await res.json();
        const select = document.getElementById(selectId);
        
        // Keep first option if exists
        const firstOpt = select.options[0];
        select.innerHTML = '';
        if(firstOpt && firstOpt.value === "") select.appendChild(firstOpt);
        
        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = `${sub.subject_code} - ${sub.subject_name}`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Error loading subjects for select');
    }
}

async function loadSessions() {
    const subjectId = document.getElementById('filterSubject')?.value || '';
    const date = document.getElementById('filterDate')?.value || '';
    
    let url = '/api/admin/sessions';
    const params = new URLSearchParams();
    if(subjectId) params.append('subject_id', subjectId);
    if(date) params.append('date', date);
    
    if(params.toString()) url += `?${params.toString()}`;
    
    showLoading(true);
    try {
        const res = await authFetch(url);
        const data = await res.json();
        
        const tbody = document.getElementById('sessions-body');
        if (data && data.length > 0) {
            tbody.innerHTML = data.map((sess, index) => {
                const statusBadge = sess.is_active ? 
                    '<span class="badge badge-success">Đang mở</span>' : 
                    '<span class="badge badge-danger">Đã đóng</span>';
                    
                const actionBtns = sess.is_active ? 
                    `<button class="btn btn-sm btn-primary" onclick="showQRCode(${sess.id})">Xem QR</button>
                     <button class="btn btn-sm btn-warning" onclick="closeSession(${sess.id})">Đóng điểm danh</button>` :
                    `<button class="btn btn-sm btn-outline" disabled>Đã đóng</button>`;
                    
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${sess.subject_name}</td>
                        <td>${formatDate(sess.date)}</td>
                        <td>${sess.start_time}</td>
                        <td>${sess.end_time}</td>
                        <td>${statusBadge}</td>
                        <td>${sess.attendance_count || 0}</td>
                        <td>
                            ${actionBtns}
                            <button class="btn btn-sm btn-danger" onclick="deleteSession(${sess.id})">Xóa</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">Chưa có buổi học nào</td></tr>`;
        }
    } catch (e) {
        showToast('Lỗi tải danh sách buổi học', 'error');
    } finally {
        showLoading(false);
    }
}

function openCreateSessionModal() {
    document.getElementById('sessionForm').reset();
    populateSubjectSelect('sessionSubject');
    // Default to today
    document.getElementById('sessionDate').valueAsDate = new Date();
    openModal('sessionModal');
}

async function createSession() {
    const session = {
        subject_id: document.getElementById('sessionSubject').value,
        session_date: document.getElementById('sessionDate').value,
        start_time: document.getElementById('startTime').value,
        end_time: document.getElementById('endTime').value
    };
    
    if(!session.subject_id || !session.session_date || !session.start_time || !session.end_time) {
        showToast('Vui lòng điền đủ thông tin', 'warning');
        return;
    }
    
    showLoading(true);
    try {
        const res = await authFetch('/api/admin/sessions', {
            method: 'POST',
            body: JSON.stringify(session)
        });
        
        if (res.ok) {
            showToast('Tạo buổi học thành công');
            closeModal('sessionModal');
            loadSessions();
        } else {
            const data = await res.json();
            showToast(data.message || 'Có lỗi xảy ra', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

async function closeSession(id) {
    if(!confirm('Bạn có chắc chắn muốn đóng điểm danh cho buổi học này?')) return;
    
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/sessions/${id}/close`, { method: 'PUT' });
        if (res.ok) {
            showToast('Đã đóng buổi học');
            loadSessions();
        } else {
            showToast('Không thể đóng buổi học', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

function deleteSession(id) {
    document.getElementById('deleteSessionId').value = id;
    openModal('deleteSessionModal');
}

async function confirmDeleteSession() {
    const id = document.getElementById('deleteSessionId').value;
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/sessions/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Đã xóa buổi học');
            closeModal('deleteSessionModal');
            loadSessions();
        } else {
            showToast('Không thể xóa buổi học', 'error');
        }
    } catch (e) {
        showToast('Lỗi hệ thống', 'error');
    } finally {
        showLoading(false);
    }
}

async function showQRCode(id) {
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/sessions/${id}/qr`);
        const data = await res.json();
        
        if(res.ok && data.qrCodeUrl) {
            document.getElementById('qrImage').src = data.qrCodeUrl;
            document.getElementById('downloadQR').href = data.qrCodeUrl;
            
            // Try to get session info for display
            try {
                const sessRes = await authFetch('/api/admin/sessions');
                const sessions = await sessRes.json();
                const s = sessions.find(x => x.id == id);
                if(s) {
                    document.getElementById('qrInfo').textContent = `${s.subject_name} | ${formatDate(s.date)} (${s.start_time}-${s.end_time})`;
                }
            } catch(e){}
            
            openModal('qrModal');
        } else {
            showToast('Không thể tải mã QR', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối', 'error');
    } finally {
        showLoading(false);
    }
}

/* ================= Attendance ================= */
async function loadAttendance() {
    const subjectId = document.getElementById('filterSubject')?.value || '';
    const date = document.getElementById('filterDate')?.value || '';
    const student = document.getElementById('searchStudent')?.value || '';
    
    // Switch UI to List view
    document.getElementById('summarySection').style.display = 'none';
    const thead = document.getElementById('tableHeaders');
    thead.innerHTML = `
        <th>STT</th>
        <th>Mã SV</th>
        <th>Họ tên</th>
        <th>Lớp</th>
        <th>Môn học</th>
        <th>Thời gian điểm danh</th>
        <th>Trạng thái</th>
    `;
    
    let url = '/api/admin/attendance';
    const params = new URLSearchParams();
    if(subjectId) params.append('subject_id', subjectId);
    if(date) params.append('date', date);
    if(student) params.append('student', student);
    
    if(params.toString()) url += `?${params.toString()}`;
    
    showLoading(true);
    try {
        const res = await authFetch(url);
        const data = await res.json();
        
        const tbody = document.getElementById('attendance-body');
        if (data && data.length > 0) {
            tbody.innerHTML = data.map((record, index) => {
                const statusClass = record.status === 'Có mặt' ? 'success' : (record.status === 'Vắng' ? 'danger' : 'warning');
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${record.student_code}</td>
                        <td>${record.student_name}</td>
                        <td>${record.class_name || ''}</td>
                        <td>${record.subject_name} (${formatDate(record.session_date)})</td>
                        <td>${record.check_in_time ? formatTime(record.check_in_time) : '-'}</td>
                        <td><span class="badge badge-${statusClass}">${record.status}</span></td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Không có dữ liệu điểm danh</td></tr>`;
        }
    } catch (e) {
        showToast('Lỗi tải dữ liệu điểm danh', 'error');
    } finally {
        showLoading(false);
    }
}

async function loadAttendanceReport() {
    const subjectId = document.getElementById('filterSubject')?.value;
    if(!subjectId) {
        showToast('Vui lòng chọn môn học để xem báo cáo', 'warning');
        return;
    }
    
    // Switch UI to Report view
    document.getElementById('summarySection').style.display = 'block';
    const thead = document.getElementById('tableHeaders');
    thead.innerHTML = `
        <th>STT</th>
        <th>Mã SV</th>
        <th>Họ tên</th>
        <th>Lớp</th>
        <th>Tổng buổi</th>
        <th>Có mặt</th>
        <th>Vắng</th>
        <th>Tỷ lệ đi học</th>
    `;
    
    showLoading(true);
    try {
        const res = await authFetch(`/api/admin/attendance/report?subject_id=${subjectId}`);
        const data = await res.json();
        
        document.getElementById('sumTotalSessions').textContent = data.summary?.totalSessions || 0;
        document.getElementById('sumTotalStudents').textContent = data.students?.length || 0;
        
        const tbody = document.getElementById('attendance-body');
        if (data.students && data.students.length > 0) {
            tbody.innerHTML = data.students.map((record, index) => {
                const rate = ((record.present / record.total) * 100).toFixed(1);
                const rateClass = rate < 70 ? 'danger' : 'success';
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${record.student_code}</td>
                        <td>${record.student_name}</td>
                        <td>${record.class_name || ''}</td>
                        <td>${record.total}</td>
                        <td style="color: var(--success); font-weight: bold;">${record.present}</td>
                        <td style="color: var(--danger); font-weight: bold;">${record.absent}</td>
                        <td><span class="badge badge-${rateClass}">${rate}%</span></td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">Không có dữ liệu báo cáo</td></tr>`;
        }
    } catch (e) {
        showToast('Lỗi tải báo cáo', 'error');
    } finally {
        showLoading(false);
    }
}

function exportCSV() {
    const subjectId = document.getElementById('filterSubject')?.value || '';
    const date = document.getElementById('filterDate')?.value || '';
    
    let url = '/api/admin/attendance/export';
    const params = new URLSearchParams();
    if(subjectId) params.append('subject_id', subjectId);
    if(date) params.append('date', date);
    
    if(params.toString()) url += `?${params.toString()}`;
    
    // Basic way to download with auth header (requires fetch + blob)
    showLoading(true);
    authFetch(url)
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `attendance_export_${new Date().getTime()}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('Xuất file thành công');
        })
        .catch(() => showToast('Lỗi khi xuất file', 'error'))
        .finally(() => showLoading(false));
}

/* ================= Initialization ================= */
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    // Skip auth check only on login page
    if (!path.includes('login.html')) {
        checkAuth();
    }
    
    // Page specific initialization
    if (path.includes('dashboard.html')) {
        loadDashboard();
    } 
    else if (path.includes('students.html')) {
        loadStudents();
    }
    else if (path.includes('subjects.html')) {
        loadSubjects();
    }
    else if (path.includes('sessions.html')) {
        populateSubjectSelect('filterSubject').then(loadSessions);
    }
    else if (path.includes('attendance.html')) {
        populateSubjectSelect('filterSubject').then(loadAttendance);
    }
});
