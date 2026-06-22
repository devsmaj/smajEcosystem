const supabaseConfig = {
    url: "https://fqfcxitcnseyrunglkqy.supabase.co",
    anonKey: "sb_publishable_SA3t6uGPtSDPofYVa1XGVQ_qOaVZn7Y",
    table: "applications"
};

const emailJsConfig = {
    publicKey: "8P_4KsqS5t0soM0gX",
    serviceId: "service_32losmn",
    userTemplateId: "template_5h069ek",
    adminEmail: "contact@smaj.org"
};

const adminConfig = {
    sessionKey: "smajAdminSession",
    passwordHash: "6681f90ebc88a3b2a18848146be2741244869e37f7dfdb5ae02f838e4e035758"
};

const state = {
    applications: [],
    currentApplication: null
};

document.addEventListener('DOMContentLoaded', function () {
    initAdminLogin();
    initAdminLogout();
    if (!guardAdminPages()) return;
    initDashboard();
    initDetailsPage();
});

function initAdminLogin() {
    const form = document.querySelector('[data-admin-login-form]');

    if (!form) return;

    if (isAdminAuthenticated()) {
        window.location.href = '/admin.html';
        return;
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        const status = document.querySelector('[data-admin-login-status]');
        const password = new FormData(form).get('adminPassword');
        const passwordHash = await sha256(String(password || ''));

        if (passwordHash !== adminConfig.passwordHash) {
            setStatus(status, 'Invalid admin password.', 'error');
            return;
        }

        localStorage.setItem(adminConfig.sessionKey, JSON.stringify({
            authenticated: true,
            logged_in_at: new Date().toISOString()
        }));
        window.location.href = '/admin.html';
    });
}

function initAdminLogout() {
    document.querySelectorAll('[data-admin-logout]').forEach(function (button) {
        button.addEventListener('click', function () {
            localStorage.removeItem(adminConfig.sessionKey);
            window.location.href = '/admin-login.html';
        });
    });
}

function guardAdminPages() {
    const adminPage = document.body.dataset.adminPage;

    if (!adminPage) return true;

    if (!isAdminAuthenticated()) {
        window.location.href = '/admin-login.html';
        return false;
    }

    return true;
}

function initDashboard() {
    if (document.body.dataset.adminPage !== 'dashboard') return;

    document.querySelector('[data-admin-refresh]')?.addEventListener('click', loadApplications);
    document.querySelector('[data-filter-type]')?.addEventListener('change', renderApplications);
    document.querySelector('[data-filter-status]')?.addEventListener('change', renderApplications);

    loadApplications();
}

function initDetailsPage() {
    if (document.body.dataset.adminPage !== 'details') return;

    loadApplicationDetails();

    document.querySelectorAll('[data-status-action]').forEach(function (button) {
        button.addEventListener('click', async function () {
            await updateApplicationStatus(button.dataset.statusAction, true);
        });
    });

    document.querySelector('[data-save-notes]')?.addEventListener('click', async function () {
        const status = document.querySelector('[data-detail-status]').value;
        await updateApplicationStatus(status, false);
    });
}

async function loadApplications() {
    const status = document.querySelector('[data-admin-status]');
    const list = document.querySelector('[data-applications-list]');

    setStatus(status, 'Loading applications...', 'info');

    try {
        state.applications = await fetchApplications();
        renderCounts();
        renderApplications();
        setStatus(status, `Loaded ${state.applications.length} applications.`, 'success');
    } catch (error) {
        console.error(error);
        if (list) {
            list.innerHTML = `<tr><td colspan="6">${escapeHtml(getAdminErrorMessage(error))}</td></tr>`;
        }
        setStatus(status, getAdminErrorMessage(error), 'error');
    }
}

async function loadApplicationDetails() {
    const status = document.querySelector('[data-admin-status]');
    const applicationId = new URLSearchParams(window.location.search).get('id');

    if (!applicationId) {
        setStatus(status, 'Missing application ID.', 'error');
        return;
    }

    setStatus(status, 'Loading application details...', 'info');

    try {
        state.currentApplication = await fetchApplication(applicationId);
        renderApplicationDetails(state.currentApplication);
        setStatus(status, 'Application loaded.', 'success');
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), 'error');
    }
}

async function fetchApplications() {
    const url = `${supabaseConfig.url}/rest/v1/${supabaseConfig.table}?select=*&order=submitted_at.desc`;
    const response = await fetch(url, { headers: getSupabaseHeaders() });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

async function fetchApplication(applicationId) {
    const url = `${supabaseConfig.url}/rest/v1/${supabaseConfig.table}?select=*&application_id=eq.${encodeURIComponent(applicationId)}&limit=1`;
    const response = await fetch(url, { headers: getSupabaseHeaders() });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const records = await response.json();

    if (!records.length) {
        throw new Error('Application not found.');
    }

    return records[0];
}

async function patchApplication(record, nextStatus, notes) {
    const data = Object.assign({}, record.data || {}, {
        admin_notes: notes,
        admin_updated_at: new Date().toISOString()
    });
    const payload = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
        data
    };
    const url = `${supabaseConfig.url}/rest/v1/${supabaseConfig.table}?application_id=eq.${encodeURIComponent(record.application_id)}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: Object.assign({}, getSupabaseHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const updated = await response.json();
    return updated[0] || Object.assign({}, record, payload);
}

async function updateApplicationStatus(nextStatus, sendEmail) {
    if (!state.currentApplication) return;

    const status = document.querySelector('[data-admin-status]');
    const notes = document.querySelector('[data-admin-notes]').value.trim();

    setStatus(status, 'Updating application...', 'info');

    try {
        state.currentApplication = await patchApplication(state.currentApplication, nextStatus, notes);
        renderApplicationDetails(state.currentApplication);

        if (sendEmail && ['interview', 'accepted', 'rejected'].includes(nextStatus)) {
            await sendStatusEmail(state.currentApplication, nextStatus, notes);
            setStatus(status, `Application updated to ${formatStatus(nextStatus)} and email notification sent.`, 'success');
        } else {
            setStatus(status, 'Application notes and status saved.', 'success');
        }
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), 'error');
    }
}

function renderCounts() {
    const counts = state.applications.reduce(function (totals, record) {
        const status = normalizeAdminStatus(record.status);
        totals.total += 1;
        totals[status] = (totals[status] || 0) + 1;
        return totals;
    }, { total: 0, pending: 0, interview: 0, accepted: 0, rejected: 0 });

    setText('[data-count-total]', counts.total);
    setText('[data-count-pending]', counts.pending);
    setText('[data-count-interview]', counts.interview);
    setText('[data-count-accepted]', counts.accepted);
    setText('[data-count-rejected]', counts.rejected);
}

function renderApplications() {
    const list = document.querySelector('[data-applications-list]');

    if (!list) return;

    const typeFilter = document.querySelector('[data-filter-type]').value;
    const statusFilter = document.querySelector('[data-filter-status]').value;
    const filtered = state.applications.filter(function (record) {
        const typeMatches = !typeFilter || record.application_type === typeFilter;
        const statusMatches = !statusFilter || normalizeAdminStatus(record.status) === statusFilter;
        return typeMatches && statusMatches;
    });

    if (!filtered.length) {
        list.innerHTML = '<tr><td colspan="6">No applications match these filters.</td></tr>';
        return;
    }

    list.innerHTML = filtered.map(function (record) {
        const data = record.data || {};
        const name = data.applicant_name || data.project_name || 'Unnamed applicant';

        return `
            <tr>
                <td><strong>${escapeHtml(record.application_id || '')}</strong></td>
                <td>${escapeHtml(name)}<span>${escapeHtml(data.applicant_email || '')}</span></td>
                <td>${escapeHtml(formatApplicationType(record.application_type))}</td>
                <td><span class="admin-status-pill admin-status-${normalizeAdminStatus(record.status)}">${formatStatus(record.status)}</span></td>
                <td>${escapeHtml(formatDate(record.submitted_at))}</td>
                <td><a class="btn btn-outline admin-table-action" href="/application-details.html?id=${encodeURIComponent(record.application_id)}">View</a></td>
            </tr>
        `;
    }).join('');
}

function renderApplicationDetails(record) {
    const data = record.data || {};
    const files = Array.isArray(record.files) ? record.files : [];
    const content = document.querySelector('[data-detail-content]');
    const statusSelect = document.querySelector('[data-detail-status]');
    const notes = document.querySelector('[data-admin-notes]');

    setText('[data-detail-title]', record.application_id || 'Application Details');
    setText('[data-detail-subtitle]', `${formatApplicationType(record.application_type)} | ${formatStatus(record.status)}`);

    if (statusSelect) statusSelect.value = normalizeAdminStatus(record.status);
    if (notes) notes.value = data.admin_notes || '';

    if (!content) return;

    const summary = [
        ['Application ID', record.application_id],
        ['Status', formatStatus(record.status)],
        ['Application Type', formatApplicationType(record.application_type)],
        ['Submitted', formatDate(record.submitted_at)],
        ['Updated', formatDate(record.updated_at)]
    ];

    const dataFields = Object.entries(data)
        .filter(function ([key]) {
            return !['admin_notes', 'admin_updated_at'].includes(key);
        })
        .map(function ([key, value]) {
            return [formatLabel(key), value];
        });

    const fileFields = files.map(function (file) {
        const link = file.downloadUrl
            ? `<a href="${escapeAttribute(file.downloadUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(file.name || 'Uploaded file')}</a>`
            : escapeHtml(file.name || 'Uploaded file');
        return ['File', link, true];
    });

    content.innerHTML = summary.concat(dataFields).map(renderDetailItem).join('') +
        (fileFields.length ? `<div class="admin-detail-section-title">Uploaded Files</div>${fileFields.map(renderDetailItem).join('')}` : '');
}

function renderDetailItem(item) {
    const [label, value, isHtml] = item;
    const displayValue = value === undefined || value === null || value === '' ? 'Not provided' : value;

    return `
        <div class="admin-detail-item">
            <span>${escapeHtml(label)}</span>
            <strong>${isHtml ? displayValue : escapeHtml(displayValue)}</strong>
        </div>
    `;
}

async function sendStatusEmail(record, nextStatus, notes) {
    const data = record.data || {};
    const applicantEmail = data.applicant_email;

    if (!applicantEmail) return;

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            service_id: emailJsConfig.serviceId,
            template_id: emailJsConfig.userTemplateId,
            user_id: emailJsConfig.publicKey,
            template_params: {
                name: data.applicant_name || '',
                email: applicantEmail,
                application_id: record.application_id || '',
                application_type: record.application_type || '',
                application_status: nextStatus,
                status_label: formatStatus(nextStatus),
                admin_notes: notes || '',
                company_name: 'SMAJ Ecosystem',
                reply_to: emailJsConfig.adminEmail
            }
        })
    });

    if (!response.ok) {
        throw new Error(`EmailJS status email failed: ${await response.text()}`);
    }
}

function getSupabaseHeaders() {
    return {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${supabaseConfig.anonKey}`,
        'Content-Type': 'application/json'
    };
}

function isAdminAuthenticated() {
    try {
        const session = JSON.parse(localStorage.getItem(adminConfig.sessionKey) || '{}');
        return Boolean(session.authenticated);
    } catch (error) {
        return false;
    }
}

async function sha256(value) {
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(function (byte) {
        return byte.toString(16).padStart(2, '0');
    }).join('');
}

function normalizeAdminStatus(status) {
    if (['interview', 'accepted', 'rejected'].includes(status)) return status;
    return 'pending';
}

function formatStatus(status) {
    const labels = {
        submitted: 'Pending',
        under_review: 'Pending',
        pending: 'Pending',
        interview: 'Interview',
        accepted: 'Accepted',
        rejected: 'Rejected'
    };

    return labels[status] || 'Pending';
}

function formatApplicationType(value) {
    const labels = {
        'Founder Partnership': 'Founder',
        'Technology Builder': 'Technology Builder',
        'Strategic Partnership': 'Partner / Collaborator'
    };

    return labels[value] || value || 'Application';
}

function formatLabel(value) {
    return String(value || '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, function (letter) {
            return letter.toUpperCase();
        });
}

function formatDate(value) {
    if (!value) return 'Not available';

    try {
        return new Intl.DateTimeFormat('en', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(value));
    } catch (error) {
        return value;
    }
}

function setStatus(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.dataset.status = type;
}

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
}

function getAdminErrorMessage(error) {
    const message = String(error && error.message ? error.message : error);

    if (/row-level security|permission denied|401|403|JWT/i.test(message)) {
        return 'Supabase denied access. Configure authenticated admin RLS policies before using live admin reads and updates.';
    }

    return message || 'Admin request failed.';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
}
