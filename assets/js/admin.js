import { supabaseClient, supabaseConfig as sharedSupabaseConfig } from './supabase-client.js';
import { showFeedbackPopup } from './feedback.js';

const adminEnv = window.SMAJ_ENV;
if (!adminEnv) console.error('[SMAJ Admin] assets/js/env.js is missing or did not load before admin.js.');
const supabaseConfig = {
    url: sharedSupabaseConfig.url,
    publishableKey: sharedSupabaseConfig.publishableKey,
    table: "application"
};
if (!supabaseConfig.url) console.error('[SMAJ Admin] window.SMAJ_ENV.SUPABASE_URL is empty.');
if (!supabaseConfig.publishableKey) console.error('[SMAJ Admin] window.SMAJ_ENV.SUPABASE_PUBLISHABLE_KEY is empty.');

const applicationColumns = [
    'application_id',
    'application_type',
    'applicant_name',
    'applicant_email',
    'phone',
    'country',
    'edit_token',
    'edit_link',
    'status',
    'data',
    'files',
    'created_at'
];

const optionalApplicationColumns = [
    'linkedin',
    'github',
    'portfolio',
    'project_name',
    'project_website',
    'stage',
    'message',
    'admin_notes'
];

const emailJsConfig = {
    publicKey: adminEnv?.EMAILJS_PUBLIC_KEY || "8P_4KsqS5t0soM0gX",
    serviceId: adminEnv?.EMAILJS_SERVICE_ID || "service_32losmn",
    userTemplateId: adminEnv?.EMAILJS_USER_TEMPLATE_ID || "template_5h069ek",
    adminEmail: adminEnv?.SMAJ_CONTACT_EMAIL || "contact@smaj.org"
};

const adminConfig = {
    loginPath: "/admin-login.html",
    dashboardPath: "/admin.html"
};

const state = {
    applications: [],
    currentApplication: null,
    filteredApplications: [],
    realtimeChannel: null,
    detailRealtimeChannel: null,
    refreshTimer: null,
    adminUser: null
};

document.addEventListener('DOMContentLoaded', async function () {
    if (!supabaseClient) {
        console.error('[SMAJ Admin] Admin initialization stopped because Supabase configuration is unavailable.');
        const status = document.querySelector('[data-admin-login-status]');
        if (status) status.textContent = 'Admin configuration is unavailable. Check the browser console.';
        return;
    }
    initPasswordToggle();
    await initAdminLogin();
    initAdminLogout();
    if (!(await guardAdminPages())) return;
    initDashboard();
    initDetailsPage();
});

async function initAdminLogin() {
    const form = document.querySelector('[data-admin-login-form]');

    if (!form) return;

    cleanAdminLoginUrl();

    if (await isAdminAuthenticated()) {
        window.location.replace(adminConfig.dashboardPath);
        return;
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        event.stopPropagation();

        const status = document.querySelector('[data-admin-login-status]');
        const email = String(form.querySelector('[data-admin-email]')?.value || '').trim();
        const password = String(form.querySelector('[data-admin-password]')?.value || '');
        const submitButton = form.querySelector('[type="submit"]');

        if (!email || !password) {
            setStatus(status, 'Enter your admin email and password.', 'error');
            return false;
        }

        setStatus(status, 'Signing in...', 'info');
        setButtonLoading(submitButton, true);

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (!data.user) throw new Error('Supabase did not return an authenticated user session.');

            setStatus(status, 'Checking admin access...', 'info');
            const adminUser = await fetchCurrentAdminUser();

            if (!adminUser) {
                await supabaseClient.auth.signOut();
                setStatus(status, 'Unauthorized admin. Add this Auth user ID to public.admin_users.', 'error');
                return;
            }

            cleanAdminLoginUrl();
            window.location.replace(adminConfig.dashboardPath);
        } catch (error) {
            console.error(error);
            setStatus(status, getAdminErrorMessage(error), 'error');
        } finally {
            setButtonLoading(submitButton, false);
        }

        return false;
    });
}

function initPasswordToggle() {
    const input = document.querySelector('#adminPassword');
    const button = document.querySelector('[data-password-toggle]');

    if (!input || !button) return;

    button.addEventListener('click', function () {
        const shouldShow = input.type === 'password';
        input.type = shouldShow ? 'text' : 'password';
        button.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
        button.setAttribute('aria-pressed', String(shouldShow));

        const icon = button.querySelector('i');
        if (icon) {
            icon.className = shouldShow ? 'bx bx-show' : 'bx bx-hide';
        }

        input.focus();
    });
}

function initAdminLogout() {
    document.querySelectorAll('[data-admin-logout]').forEach(function (button) {
        button.addEventListener('click', async function () {
            await supabaseClient.auth.signOut();
            window.location.replace(adminConfig.loginPath);
        });
    });
}

async function guardAdminPages() {
    const adminPage = document.body.dataset.adminPage;

    if (!adminPage) return true;

    if (!(await isAdminAuthenticated())) {
        window.location.replace(adminConfig.loginPath);
        return false;
    }

    return true;
}

function initDashboard() {
    if (document.body.dataset.adminPage !== 'dashboard') return;

    document.querySelector('[data-admin-refresh]')?.addEventListener('click', loadApplications);
    document.querySelector('[data-admin-export]')?.addEventListener('click', exportFilteredApplications);
    document.querySelector('[data-filter-reset]')?.addEventListener('click', resetFilters);
    document.querySelector('[data-filter-search]')?.addEventListener('input', renderApplications);
    document.querySelector('[data-filter-type]')?.addEventListener('change', renderApplications);
    document.querySelector('[data-filter-status]')?.addEventListener('change', renderApplications);
    document.querySelector('[data-applications-list]')?.addEventListener('click', handleApplicationListClick);

    loadApplications();
    subscribeToAdminRealtime();
}

function initDetailsPage() {
    if (document.body.dataset.adminPage !== 'details') return;

    loadApplicationDetails();
    subscribeToDetailRealtime();

    document.querySelectorAll('[data-status-action]').forEach(function (button) {
        button.addEventListener('click', async function () {
            await updateApplicationStatus(button.dataset.statusAction, true);
        });
    });

    document.querySelector('[data-save-notes]')?.addEventListener('click', async function () {
        const status = normalizeAdminStatus(state.currentApplication?.status);
        await updateApplicationStatus(status, false);
    });

    document.querySelector('[data-save-status]')?.addEventListener('click', async function () {
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

function subscribeToAdminRealtime() {
    if (state.realtimeChannel) return;

    state.realtimeChannel = supabaseClient
        .channel('admin-application-realtime')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: supabaseConfig.table
            },
            function () {
                scheduleApplicationsRefresh();
            }
        )
        .subscribe();
}

function scheduleApplicationsRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(function () {
        loadApplications();
    }, 350);
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
        await loadAuditLogs(applicationId);
        setStatus(status, 'Application loaded.', 'success');
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), 'error');
    }
}

function subscribeToDetailRealtime() {
    const applicationId = new URLSearchParams(window.location.search).get('id');

    if (!applicationId || state.detailRealtimeChannel) return;

    state.detailRealtimeChannel = supabaseClient
        .channel(`admin-application-detail-${applicationId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: supabaseConfig.table,
                filter: `application_id=eq.${applicationId}`
            },
            function (payload) {
                if (payload.new) {
                    state.currentApplication = normalizeApplicationRecord(payload.new);
                    renderApplicationDetails(state.currentApplication);
                    loadAuditLogs(state.currentApplication.application_id);
                    setStatus(document.querySelector('[data-admin-status]'), 'Application updated in realtime.', 'success');
                }
            }
        )
        .subscribe();
}

async function fetchApplications() {
    const authUser = await getCurrentAuthUser();
    console.log('[SMAJ Admin] current auth user id:', authUser?.id || null);

    const rows = await selectApplicationRows();
    console.log('[SMAJ Admin] application rows returned:', rows);

    return rows.map(normalizeApplicationRecord).sort(function (a, b) {
        return getRecordTime(b) - getRecordTime(a);
    });
}

async function fetchApplication(applicationId) {
    const authUser = await getCurrentAuthUser();
    console.log('[SMAJ Admin] current auth user id:', authUser?.id || null);

    const selectColumns = applicationColumns.concat(optionalApplicationColumns).join(', ');
    let response = await supabaseClient
        .from(supabaseConfig.table)
        .select(selectColumns)
        .eq('application_id', applicationId)
        .limit(1)
        .maybeSingle();

    if (isMissingOptionalColumnError(response.error)) {
        response = await supabaseClient
            .from(supabaseConfig.table)
            .select(applicationColumns.join(', '))
            .eq('application_id', applicationId)
            .limit(1)
            .maybeSingle();
    }

    const { data, error } = response;

    if (error) {
        console.error('[SMAJ Admin] application fetch error:', error);
        throw error;
    }

    console.log('[SMAJ Admin] application rows returned:', data ? [data] : []);

    if (!data) {
        throw new Error('Application not found.');
    }

    return normalizeApplicationRecord(data);
}

async function selectApplicationRows() {
    const selectColumns = applicationColumns.concat(optionalApplicationColumns).join(', ');
    let response = await supabaseClient
        .from(supabaseConfig.table)
        .select(selectColumns)
        .order('created_at', { ascending: false });

    if (isMissingOptionalColumnError(response.error)) {
        response = await supabaseClient
            .from(supabaseConfig.table)
            .select(applicationColumns.join(', '))
            .order('created_at', { ascending: false });
    }

    if (response.error) {
        console.error('[SMAJ Admin] application fetch error:', response.error);
        throw response.error;
    }

    return response.data || [];
}

async function getCurrentAuthUser() {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error) {
        console.warn('[SMAJ Admin] auth user lookup failed:', error);
        return null;
    }

    return data.user || null;
}

function isMissingOptionalColumnError(error) {
    if (!error) return false;
    const message = String(error.message || error.details || '');
    return /column .* does not exist|could not find .* column|schema cache/i.test(message);
}

async function loadAuditLogs(applicationId) {
    const list = document.querySelector('[data-audit-list]');

    if (!list) return;

    try {
        const { data, error } = await supabaseClient
            .from('audit_logs')
            .select('id, action, old_status, new_status, notes, created_at, admin_users(email, full_name)')
            .eq('application_id', applicationId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        renderAuditLogs(data || []);
    } catch (error) {
        console.error(error);
        list.innerHTML = `<p class="application-status" data-status="error">${escapeHtml(getAdminErrorMessage(error))}</p>`;
    }
}

async function patchApplication(record, nextStatus, notes) {
    const previousStatus = normalizeAdminStatus(record.status);
    const data = Object.assign({}, record.data || {}, {
        admin_notes: notes,
        admin_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
    const payload = {
        status: nextStatus,
        data
    };
    const { data: updated, error } = await supabaseClient
        .from(supabaseConfig.table)
        .update(payload)
        .eq('application_id', record.application_id)
        .select()
        .maybeSingle();

    if (error) {
        throw error;
    }

    const nextRecord = normalizeApplicationRecord(updated || Object.assign({}, record, payload));
    await writeAuditLog(record, nextRecord, previousStatus, nextStatus, notes);

    return nextRecord;
}

async function writeAuditLog(previousRecord, nextRecord, previousStatus, nextStatus, notes) {
    const auditRow = {
        application_id: previousRecord.application_id,
        admin_user_id: state.adminUser?.id || null,
        admin_auth_user_id: state.adminUser?.user_id || null,
        action: previousStatus === nextStatus ? 'notes_updated' : 'status_changed',
        old_status: previousStatus,
        new_status: nextStatus,
        notes: notes || '',
        metadata: {
            application_type: nextRecord.application_type || previousRecord.application_type || '',
            applicant_email: nextRecord.data?.applicant_email || previousRecord.data?.applicant_email || ''
        }
    };
    const { error } = await supabaseClient.from('audit_logs').insert(auditRow);

    if (error) {
        console.warn('Audit log insert failed:', error);
    }
}

async function updateApplicationStatus(nextStatus, sendEmail) {
    if (!state.currentApplication) return;

    const status = document.querySelector('[data-admin-status]');
    const notes = document.querySelector('[data-admin-notes]').value.trim();
    const actionButton = document.querySelector(`[data-status-action="${nextStatus}"]`) || document.querySelector('[data-save-status]');

    if (['accepted', 'rejected'].includes(nextStatus) && sendEmail) {
        const applicantName = state.currentApplication.data?.applicant_name || state.currentApplication.application_id;
        const confirmed = window.confirm(`Confirm ${formatStatus(nextStatus)} for ${applicantName}? This will send an email notification.`);
        if (!confirmed) return;
    }

    setStatus(status, 'Updating application...', 'info');
    setButtonLoading(actionButton, true);

    try {
        state.currentApplication = await patchApplication(state.currentApplication, nextStatus, notes);
        renderApplicationDetails(state.currentApplication);
        await loadAuditLogs(state.currentApplication.application_id);

        if (sendEmail && ['interview', 'accepted', 'rejected'].includes(nextStatus)) {
            await sendStatusEmail(state.currentApplication, nextStatus, notes);
            setStatus(status, `Application updated to ${formatStatus(nextStatus)} and email notification sent.`, 'success');
        } else {
            setStatus(status, 'Application notes and status saved.', 'success');
        }
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), 'error');
    } finally {
        setButtonLoading(actionButton, false);
    }
}

async function updateApplicationFromList(applicationId, nextStatus, sendEmail) {
    const status = document.querySelector('[data-admin-status]');
    const record = state.applications.find(function (item) {
        return item.application_id === applicationId;
    });

    if (!record) return;

    const actionButton = document.querySelector(`[data-row-status-action="${nextStatus}"][data-application-id="${cssEscape(applicationId)}"]`);

    if (['accepted', 'rejected'].includes(nextStatus) && sendEmail) {
        const applicantName = record.data?.applicant_name || record.application_id;
        const confirmed = window.confirm(`Confirm ${formatStatus(nextStatus)} for ${applicantName}? This will send an email notification.`);
        if (!confirmed) return;
    }

    setStatus(status, 'Updating application...', 'info');
    setButtonLoading(actionButton, true);

    try {
        const updated = await patchApplication(record, nextStatus, record.data?.admin_notes || '');
        const index = state.applications.findIndex(function (item) {
            return item.application_id === applicationId;
        });
        if (index >= 0) state.applications[index] = updated;

        if (sendEmail && ['interview', 'accepted', 'rejected'].includes(nextStatus)) {
            await sendStatusEmail(updated, nextStatus, updated.data?.admin_notes || '');
            setStatus(status, `Application updated to ${formatStatus(nextStatus)} and email notification sent.`, 'success');
        } else {
            setStatus(status, `Application updated to ${formatStatus(nextStatus)}.`, 'success');
        }

        renderCounts();
        renderApplications();
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), 'error');
    } finally {
        setButtonLoading(actionButton, false);
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
    const searchFilter = document.querySelector('[data-filter-search]').value.trim().toLowerCase();
    const filtered = state.applications.filter(function (record) {
        const typeMatches = !typeFilter || record.application_type === typeFilter;
        const statusMatches = !statusFilter || normalizeAdminStatus(record.status) === statusFilter;
        const searchMatches = !searchFilter || getSearchText(record).includes(searchFilter);
        return typeMatches && statusMatches && searchMatches;
    });
    state.filteredApplications = filtered;
    setText('[data-visible-count]', filtered.length);

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
                <td>${escapeHtml(formatDate(getSubmittedAt(record)))}</td>
                <td>
                    <div class="admin-row-actions">
                        <a class="btn btn-outline admin-table-action" href="/application-details.html?id=${encodeURIComponent(record.application_id)}">View</a>
                        <button type="button" class="btn btn-outline admin-table-action" data-row-status-action="pending" data-application-id="${escapeAttribute(record.application_id)}">Pending</button>
                        <button type="button" class="btn btn-outline admin-table-action" data-row-status-action="interview" data-application-id="${escapeAttribute(record.application_id)}">Interview</button>
                        <button type="button" class="btn btn-outline admin-table-action" data-row-status-action="accepted" data-application-id="${escapeAttribute(record.application_id)}">Accept</button>
                        <button type="button" class="btn btn-outline admin-table-action admin-danger" data-row-status-action="rejected" data-application-id="${escapeAttribute(record.application_id)}">Reject</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function handleApplicationListClick(event) {
    const button = event.target.closest('[data-row-status-action]');

    if (!button) return;

    updateApplicationFromList(button.dataset.applicationId, button.dataset.rowStatusAction, true);
}

function resetFilters() {
    const search = document.querySelector('[data-filter-search]');
    const type = document.querySelector('[data-filter-type]');
    const status = document.querySelector('[data-filter-status]');

    if (search) search.value = '';
    if (type) type.value = '';
    if (status) status.value = '';
    renderApplications();
}

function exportFilteredApplications() {
    const rows = state.filteredApplications.length ? state.filteredApplications : state.applications;
    const status = document.querySelector('[data-admin-status]');

    if (!rows.length) {
        setStatus(status, 'No applications to export.', 'info');
        return;
    }

    const headers = ['Application ID', 'Name', 'Email', 'Phone', 'Country', 'Type', 'Status', 'Submitted'];
    const csvRows = [headers].concat(rows.map(function (record) {
        const data = record.data || {};

        return [
            record.application_id || '',
            data.applicant_name || data.project_name || '',
            data.applicant_email || '',
            data.phone || '',
            data.country || '',
            formatApplicationType(record.application_type),
            formatStatus(record.status),
            formatDate(getSubmittedAt(record))
        ];
    }));
    const csv = csvRows.map(function (row) {
        return row.map(csvCell).join(',');
    }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smaj-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(status, `Exported ${rows.length} applications.`, 'success');
}

function getSearchText(record) {
    const data = record.data || {};

    return [
        record.application_id,
        record.application_type,
        record.status,
        data.applicant_name,
        data.applicant_email,
        data.project_name,
        data.phone,
        data.country
    ].join(' ').toLowerCase();
}

function normalizeApplicationRecord(record) {
    const data = Object.assign({}, record.data || {});
    const passthroughFields = [
        'applicant_name',
        'applicant_email',
        'phone',
        'country',
        'linkedin',
        'github',
        'portfolio',
        'project_name',
        'project_website',
        'stage',
        'message',
        'admin_notes'
    ];

    passthroughFields.forEach(function (key) {
        if ((data[key] === undefined || data[key] === null || data[key] === '') && record[key] !== undefined && record[key] !== null) {
            data[key] = record[key];
        }
    });

    return Object.assign({}, record, {
        application_type: record.application_type || data.application_type || '',
        status: normalizeAdminStatus(record.status || data.status),
        data,
        files: normalizeFiles(record.files)
    });
}

function normalizeFiles(files) {
    if (Array.isArray(files)) return files;
    if (!files) return [];

    if (typeof files === 'string') {
        try {
            const parsed = JSON.parse(files);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    return [];
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
        ['Submitted', formatDate(getSubmittedAt(record))],
        ['Updated', formatDate(getUpdatedAt(record))]
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

function renderAuditLogs(logs) {
    const list = document.querySelector('[data-audit-list]');

    if (!list) return;

    if (!logs.length) {
        list.innerHTML = '<p class="application-status" data-status="info">No audit history yet.</p>';
        return;
    }

    list.innerHTML = logs.map(function (log) {
        const adminName = log.admin_users?.full_name || log.admin_users?.email || 'SMAJ Admin';
        const statusText = log.old_status === log.new_status
            ? formatStatus(log.new_status)
            : `${formatStatus(log.old_status)} → ${formatStatus(log.new_status)}`;

        return `
            <article class="admin-audit-item">
                <div>
                    <strong>${escapeHtml(formatLabel(log.action))}</strong>
                    <span>${escapeHtml(statusText)} by ${escapeHtml(adminName)}</span>
                </div>
                <time>${escapeHtml(formatDate(log.created_at))}</time>
                ${log.notes ? `<p>${escapeHtml(log.notes)}</p>` : ''}
            </article>
        `;
    }).join('');
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

async function isAdminAuthenticated() {
    const adminUser = await fetchCurrentAdminUser();
    state.adminUser = adminUser;
    return Boolean(adminUser);
}

async function fetchCurrentAdminUser() {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();

    if (sessionError || !sessionData.session?.user) {
        return null;
    }

    const user = sessionData.session.user;
    const { data, error } = await supabaseClient
        .from('admin_users')
        .select('id, user_id, email, role, full_name, created_at')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        return null;
    }

    return data;
}

function cleanAdminLoginUrl() {
    if (!window.location.search && !window.location.hash) return;

    window.history.replaceState({}, document.title, window.location.pathname);
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
        'Collaborator': 'Partner / Collaborator',
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

function getSubmittedAt(record) {
    return record.submitted_at || record.created_at || record.data?.submitted_at || record.data?.created_at || '';
}

function getUpdatedAt(record) {
    return record.updated_at || record.data?.updated_at || record.data?.admin_updated_at || record.created_at || '';
}

function getRecordTime(record) {
    const value = getSubmittedAt(record);
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

function setStatus(element, message, type) {
    showFeedbackPopup(element, message, type);
}

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
}

function setButtonLoading(button, isLoading) {
    if (!button) return;

    if (!button.dataset.defaultText) {
        button.dataset.defaultText = button.textContent;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? 'Working...' : button.dataset.defaultText;
}

function getAdminErrorMessage(error) {
    const message = String(error && error.message ? error.message : error);

    if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return 'Could not connect to Supabase. Check the public Supabase URL/key in assets/js/env.js and confirm this domain is allowed in Supabase Auth URL settings.';
    }

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

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value);
    }

    return String(value || '').replace(/"/g, '\\"');
}

function csvCell(value) {
    const text = String(value || '');

    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}
