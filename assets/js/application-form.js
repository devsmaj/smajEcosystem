import { smajEnv } from "./env-module.js";
import { newsImagesBucket, supabaseClient, supabaseConfig as sharedSupabaseConfig, verifyUploadBucket } from "./supabase-client.js";
import { showFeedbackPopup } from "./feedback.js";

const supabaseConfig = {
    table: "application"
};

const missingNewsImagesBucketMessage = "Storage bucket 'news-images' not found. Please create it in Supabase Storage.";

const emailJsConfig = {
    publicKey: smajEnv.EMAILJS_PUBLIC_KEY,
    serviceId: smajEnv.EMAILJS_SERVICE_ID,
    adminTemplateId: smajEnv.EMAILJS_ADMIN_TEMPLATE_ID,
    userTemplateId: smajEnv.EMAILJS_USER_TEMPLATE_ID,
    adminEmail: smajEnv.SMAJ_CONTACT_EMAIL
};

const appState = {
    supabaseReady: Boolean(sharedSupabaseConfig.url && sharedSupabaseConfig.publishableKey)
};

const applicationRealtimeChannels = new Map();
const applicationStatusPollers = new Map();

const applicationStatusSteps = [
    { status: 'submitted', label: 'Application Submitted' },
    { status: 'under_review', label: 'Application Review' },
    { status: 'interview', label: 'Founder / Team Interview' },
    { status: 'accepted', label: 'Final Decision' },
    { status: 'accepted', label: 'Join SMAJ Ecosystem Team' }
];

document.addEventListener('DOMContentLoaded', function () {
    initFileFeedback();
    initApplicationForms();
    initEditApplication();
});

function initApplicationForms() {
    const forms = document.querySelectorAll('[data-application-form]');

    forms.forEach(function (form) {
        const savedRecord = getSavedApplicationForForm(form);

        if (savedRecord) {
            showApplicationDashboard(form, savedRecord, false);
            refreshApplicationDashboard(form, savedRecord);
            subscribeToApplicationUpdates(form, savedRecord.application_id);
            startApplicationStatusPolling(form, savedRecord);
            return;
        }

        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            await handleApplicationSubmit(form);
        });
    });
}

async function handleApplicationSubmit(form) {
    const submitButton = form.querySelector('[type="submit"]');
    const status = document.querySelector('[data-application-status]');
    const applicationType = form.dataset.applicationForm;
    const prefix = form.dataset.applicationPrefix || 'APP';
    const payload = collectFormPayload(form);
    const files = collectFiles(form);
    const fileValidation = validateSelectedFiles(files);

    if (!fileValidation.valid) {
        setStatus(status, fileValidation.message, 'error');
        return;
    }

    const applicationId = createApplicationId(prefix);
    const editToken = createToken();
    const submittedAt = new Date().toISOString();
    const editLink = createEditLink(applicationId, editToken);
    const record = {
        application_id: applicationId,
        edit_token: editToken,
        application_type: applicationType,
        edit_link: editLink,
        status: 'pending',
        submitted_at: submittedAt,
        updated_at: submittedAt,
        data: payload,
        files: []
    };

    setStatus(status, 'Submitting application...', 'info');
    setButtonLoading(submitButton, true);

    try {
        if (!appState.supabaseReady) {
            throw new Error('Supabase is not configured. Add the project URL and anon public key.');
        }

        setStatus(status, files.length ? 'Uploading files...' : 'Saving application...', 'info');
        record.files = await uploadApplicationFiles(applicationId, applicationType, files);
        setFileUploadSuccess(record.files);

        setStatus(status, 'Saving application...', 'info');
        await saveApplicationRecord(applicationId, record);
        saveDemoApplication(record);

        setStatus(status, 'Sending confirmation emails...', 'info');
        await sendEmailNotifications(record);

        form.reset();
        if (window.clearSmajPersistedForm) {
            window.clearSmajPersistedForm(form);
        }

        setStatus(status, 'Application submitted successfully.', 'success');
        showApplicationDashboard(form, record, true);
        subscribeToApplicationUpdates(form, record.application_id);
        startApplicationStatusPolling(form, record);
        return;
    } catch (error) {
        console.error(error);
        setStatus(status, error.message || 'Something went wrong. Please check the form and try again.', 'error');
    } finally {
        if (!form.hidden) {
            setButtonLoading(submitButton, false);
        }
    }
}

function initFileFeedback() {
    const fileInputs = document.querySelectorAll('input[type="file"]');

    fileInputs.forEach(function (input) {
        input.addEventListener('change', function () {
            const feedback = findFileFeedback(input);
            const files = Array.from(input.files || []);

            if (!feedback) return;

            if (!files.length) {
                showFeedbackPopup(feedback, '', '');
                return;
            }

            const validation = validateSelectedFiles(files.map(function (file) {
                return {
                    field: input.name,
                    file
                };
            }));

            if (!validation.valid) {
                input.value = '';
                showFeedbackPopup(feedback, validation.message, 'error');
                return;
            }

            const imageFiles = files.filter(function (file) {
                return isAllowedImageFile(file);
            });

            if (input.multiple && imageFiles.length > 3) {
                input.value = '';
                showFeedbackPopup(feedback, 'Please select up to 3 images only.', 'error');
                return;
            }

            showFeedbackPopup(
                feedback,
                files.length === 1
                    ? `${files[0].name} selected.`
                    : `${files.length} files selected. Upload will complete when you submit.`,
                'info'
            );
        });
    });
}

function collectFormPayload(form) {
    const formData = new FormData(form);
    const payload = {};

    formData.forEach(function (value, key) {
        if (value instanceof File) return;

        if (payload[key]) {
            payload[key] = Array.isArray(payload[key])
                ? payload[key].concat(value)
                : [payload[key], value];
        } else {
            payload[key] = value;
        }
    });

    return payload;
}

function collectFiles(form) {
    const fileInputs = form.querySelectorAll('input[type="file"]');
    const files = [];

    fileInputs.forEach(function (input) {
        Array.from(input.files || []).forEach(function (file) {
            files.push({
                field: input.name,
                file
            });
        });
    });

    return files;
}

function validateSelectedFiles(files) {
    const groupedImages = {};
    const maxFileSize = 20 * 1024 * 1024;
    const allowedExtensions = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'];

    for (const item of files) {
        const extension = getFileExtension(item.file.name);

        if (item.file.size > maxFileSize) {
            return {
                valid: false,
                message: 'File is too large. Maximum allowed size is 20MB.'
            };
        }

        if (!allowedExtensions.includes(extension)) {
            return {
                valid: false,
                message: 'File type not allowed. Upload PDF, DOC, DOCX, PNG, JPG, JPEG, or WEBP files only.'
            };
        }

        if (isAllowedImageFile(item.file)) {
            groupedImages[item.field] = (groupedImages[item.field] || 0) + 1;
        }
    }

    const tooManyImages = Object.keys(groupedImages).find(function (field) {
        return groupedImages[field] > 3;
    });

    if (tooManyImages) {
        return {
            valid: false,
            message: 'Please upload no more than 3 images in each image upload field.'
        };
    }

    return { valid: true, message: '' };
}

async function uploadApplicationFiles(applicationId, applicationType, files) {
    const uploaded = [];
    const folder = getApplicationFolder(applicationType);
    await verifyUploadBucket();

    for (const item of files) {
        const storagePath = `applications/${folder}/${applicationId}/${Date.now()}-${sanitizeFileName(item.file.name)}`;
        const uploadResult = await withTimeout(
            supabaseClient.storage.from('news-images').upload(storagePath, item.file, {
                contentType: item.file.type || 'application/octet-stream',
                upsert: false
            }),
            30000,
            `Upload timed out for ${item.file.name}. Try a smaller file or check Supabase Storage rules.`
        );

        if (uploadResult.error) {
            throw new Error(parseSupabaseClientError(uploadResult.error) || `Upload failed for ${item.file.name}.`);
        }

        uploaded.push({
            field: item.field,
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            bucket: newsImagesBucket,
            storagePath,
            downloadUrl: getSupabasePublicUrl(storagePath)
        });
    }

    return uploaded;
}

async function saveApplicationRecord(applicationId, record) {
    const row = {
        application_id: applicationId,
        application_type: record.application_type,
        applicant_name: record.data.applicant_name || '',
        applicant_email: record.data.applicant_email || '',
        phone: record.data.phone || '',
        country: record.data.country || '',
        edit_token: record.edit_token,
        edit_link: record.edit_link,
        status: record.status,
        data: Object.assign({}, record.data, {
            submitted_at: record.submitted_at,
            updated_at: record.updated_at
        }),
        files: record.files
    };

    const saveResult = await withTimeout(
        supabaseClient.from(supabaseConfig.table).insert(row),
        20000,
        'Saving application timed out. Please check Supabase table policies and try again.'
    );

    if (saveResult.error) {
        throw new Error(parseSupabaseClientError(saveResult.error) || 'Could not save application in Supabase database.');
    }
}

async function sendEmailNotifications(record) {
    if (!emailJsConfig.publicKey || !emailJsConfig.serviceId) {
        return;
    }

    const baseParams = createEmailTemplateParams(record);
    const applicantEmail = baseParams.email;

    const emailJobs = [];

    if (emailJsConfig.adminTemplateId) {
        emailJobs.push(sendEmailJs(emailJsConfig.adminTemplateId, baseParams));
    }

    if (emailJsConfig.userTemplateId && applicantEmail) {
        emailJobs.push(sendEmailJs(emailJsConfig.userTemplateId, baseParams));
    }

    await withTimeout(
        Promise.all(emailJobs),
        15000,
        'Application saved, but email confirmation timed out.'
    );
}

async function sendEmailJs(templateId, templateParams) {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            service_id: emailJsConfig.serviceId,
            template_id: templateId,
            user_id: emailJsConfig.publicKey,
            template_params: templateParams
        })
    });

    if (!response.ok) {
        const errorText = await response.text().catch(function () {
            return '';
        });
        throw new Error(`EmailJS request failed for ${templateId}${errorText ? `: ${errorText}` : ''}`);
    }
}

function setFileUploadSuccess(files) {
    const uploadedByField = {};

    files.forEach(function (file) {
        uploadedByField[file.field] = (uploadedByField[file.field] || 0) + 1;
    });

    Object.keys(uploadedByField).forEach(function (field) {
        const feedback = document.querySelector(`[data-file-feedback="${field}"]`);
        const count = uploadedByField[field];

        if (!feedback) return;

        showFeedbackPopup(
            feedback,
            count === 1 ? 'Upload successful.' : `${count} files uploaded successfully.`,
            'success'
        );
    });
}

function setFileUploadError(files) {
    const fields = new Set(files.map(function (file) {
        return file.field;
    }));

    fields.forEach(function (field) {
        const feedback = document.querySelector(`[data-file-feedback="${field}"]`);

        if (!feedback) return;

        showFeedbackPopup(feedback, 'Upload failed. Please try again.', 'error');
    });
}

function findFileFeedback(input) {
    return document.querySelector(`[data-file-feedback="${input.name}"]`);
}

function getApplicationFolder(applicationType) {
    const folders = {
        'Founder Partnership': 'founders',
        'Technology Builder': 'builders',
        'Collaborator': 'collaborators',
        'Strategic Partnership': 'partners'
    };

    return folders[applicationType] || 'partners';
}

function getFileExtension(fileName) {
    return String(fileName || '').split('.').pop().toLowerCase();
}

function isAllowedImageFile(file) {
    return ['png', 'jpg', 'jpeg', 'webp'].includes(getFileExtension(file.name));
}

function sanitizeFileName(fileName) {
    const extension = getFileExtension(fileName);
    const baseName = String(fileName || 'upload')
        .replace(/\.[^/.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'upload';

    return extension ? `${baseName}.${extension}` : baseName;
}

function getSupabasePublicUrl(storagePath) {
    return `${sharedSupabaseConfig.url}/storage/v1/object/public/news-images/${storagePath}`;
}

async function parseSupabaseError(response) {
    const text = await response.text().catch(function () {
        return '';
    });

    if (!text) return '';

    try {
        const error = JSON.parse(text);

        if (error.message === 'Bucket not found') {
            return missingNewsImagesBucketMessage;
        }

        if (/row-level security/i.test(error.message || error.error || text)) {
            return 'Supabase database insert is blocked by Row Level Security. Add an anon insert policy for the application table.';
        }

        return error.message || error.error || text;
    } catch (parseError) {
        return text;
    }
}

function parseSupabaseClientError(error) {
    const message = error && (error.message || error.error_description || error.details || error.hint);

    if (!message) return '';

    if (message === 'Bucket not found') {
        return missingNewsImagesBucketMessage;
    }

    if (/row-level security/i.test(message)) {
        return `Supabase ${supabaseConfig.table} insert is blocked by Row Level Security. Add an anon insert policy for the application table.`;
    }

    return message;
}

function withTimeout(promise, timeoutMs, message) {
    let timeoutId;
    const timeout = new Promise(function (_, reject) {
        timeoutId = setTimeout(function () {
            reject(new Error(message));
        }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(function () {
        clearTimeout(timeoutId);
    });
}

function saveDemoApplication(record) {
    const existing = JSON.parse(localStorage.getItem('smajApplications') || '{}');
    existing[record.application_id] = record;
    localStorage.setItem('smajApplications', JSON.stringify(existing));
}

function createApplicationId(prefix) {
    const year = new Date().getFullYear();
    const counterKey = `smajApplicationCounter:${prefix}:${year}`;
    const nextNumber = Number(localStorage.getItem(counterKey) || '0') + 1;
    localStorage.setItem(counterKey, String(nextNumber));
    return `SMAJ-${prefix}-${year}-${String(nextNumber).padStart(4, '0')}`;
}

function createToken() {
    if (window.crypto && window.crypto.getRandomValues) {
        const values = new Uint32Array(4);
        window.crypto.getRandomValues(values);
        return Array.from(values).map(function (value) {
            return value.toString(36);
        }).join('');
    }

    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createEditLink(applicationId, editToken) {
    const origin = window.location.origin || '';

    return `${origin}/edit-application/?id=${encodeURIComponent(applicationId)}&token=${encodeURIComponent(editToken)}`;
}

function createEmailTemplateParams(record) {
    const data = record.data || {};

    return {
        name: data.applicant_name || '',
        email: data.applicant_email || '',
        phone: data.phone || '',
        country: data.country || '',
        linkedin: data.linkedin || '',
        github: data.github || '',
        portfolio: data.portfolio || '',
        project_name: data.project_name || '',
        project_website: data.project_website || '',
        stage: data.stage || '',
        message: data.message || buildEmailMessage(data),
        skills: data.skills || '',
        projects_built: data.projects_built || '',
        availability: data.availability || '',
        application_type: record.application_type || '',
        application_id: record.application_id || '',
        application_status: record.status || 'pending',
        submitted_at: record.submitted_at || '',
        edit_link: record.edit_link || ''
    };
}

function buildEmailMessage(data) {
    const parts = [];

    if (data.message) parts.push(data.message);
    if (data.project_description) parts.push(`Project description: ${data.project_description}`);
    if (data.problem_solved) parts.push(`Problem solved: ${data.problem_solved}`);
    if (data.skills) parts.push(`Skills: ${data.skills}`);
    if (data.projects_built) parts.push(`Projects built: ${data.projects_built}`);
    if (data.availability) parts.push(`Availability: ${data.availability}`);
    if (data.partnership_goal) parts.push(`Partnership goal: ${data.partnership_goal}`);
    if (data.company_description) parts.push(`Company description: ${data.company_description}`);
    if (data.team_size) parts.push(`Team size: ${data.team_size}`);

    return parts.join('\n\n');
}

function showApplicationSuccess(record) {
    const result = document.querySelector('[data-application-result]');

    if (!result) return;

    const storageNote = appState.supabaseReady
        ? 'Your application has been securely submitted to SMAJ Ecosystem.'
        : 'Your application could not reach the secure submission service. Please try again.';

    result.hidden = false;
    result.innerHTML = `
        <h3>Application Received</h3>
        <p>${storageNote}</p>
        <div class="application-result-grid">
            <div>
                <span>Application ID</span>
                <strong>${record.application_id}</strong>
            </div>
            <div>
                <span>Edit Link</span>
                <a href="${record.edit_link}">${record.edit_link}</a>
            </div>
        </div>
    `;
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showApplicationDashboard(form, record, isFreshSubmission) {
    const result = form.parentElement.querySelector('[data-application-result]');
    const submitButton = form.querySelector('[type="submit"]');

    record = normalizeApplicationRecord(record);
    record.updated_at = record.updated_at || record.submitted_at || new Date().toISOString();
    saveDemoApplication(record);
    saveApplicationForForm(form, record);

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Application Submitted ✓';
        submitButton.classList.add('btn-submitted');
    }

    form.hidden = true;

    if (!result) return;

    result.hidden = false;
    result.innerHTML = createApplicationDashboardHtml(record, isFreshSubmission);

    if (isFreshSubmission) {
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function refreshApplicationDashboard(form, fallbackRecord) {
    if (!fallbackRecord || !fallbackRecord.application_id) return;

    try {
        const latestRecord = await fetchApplicationRecord(fallbackRecord.application_id, fallbackRecord.edit_token);

        if (!latestRecord) return;

        showApplicationDashboard(form, normalizeApplicationRecord(mergeApplicationRecords(fallbackRecord, latestRecord)), false);
    } catch (error) {
        console.warn('Could not refresh application status:', error);
    }
}

async function fetchApplicationRecord(applicationId, editToken) {
    if (!editToken || !appState.supabaseReady) return null;

    const { data, error } = await supabaseClient.rpc('get_application_status', {
        p_application_id: applicationId,
        p_edit_token: editToken
    });

    if (error) throw error;

    const record = Array.isArray(data) ? data[0] : data;
    return record ? normalizeApplicationRecord(record) : null;
}

function startApplicationStatusPolling(form, record) {
    if (!record || !record.application_id || applicationStatusPollers.has(record.application_id)) return;

    const poller = window.setInterval(function () {
        const latestSavedRecord = getSavedApplicationForForm(form) || record;
        refreshApplicationDashboard(form, latestSavedRecord);
    }, 15000);

    applicationStatusPollers.set(record.application_id, poller);
}

function subscribeToApplicationUpdates(form, applicationId) {
    if (!applicationId || applicationRealtimeChannels.has(applicationId)) return;

    const channel = supabaseClient
        .channel(`application-status-${applicationId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: supabaseConfig.table,
                filter: `application_id=eq.${applicationId}`
            },
            function (payload) {
                const currentRecord = getSavedApplicationForForm(form);

                if (currentRecord?.edit_token) {
                    refreshApplicationDashboard(form, currentRecord);
                    return;
                }

                const nextRecord = payload.new
                    ? mergeApplicationRecords(currentRecord, payload.new)
                    : currentRecord;

                if (nextRecord) {
                    showApplicationDashboard(form, normalizeApplicationRecord(nextRecord), false);
                }
            }
        )
        .subscribe();

    applicationRealtimeChannels.set(applicationId, channel);
}

function mergeApplicationRecords(currentRecord, databaseRecord) {
    const current = currentRecord || {};
    const databaseData = databaseRecord.data || {};
    const submittedAt = databaseRecord.submitted_at || databaseRecord.created_at || databaseData.submitted_at || current.submitted_at;
    const updatedAt = databaseRecord.updated_at || databaseData.updated_at || databaseData.admin_updated_at || current.updated_at || submittedAt;

    return Object.assign({}, current, databaseRecord, {
        edit_token: databaseRecord.edit_token || current.edit_token || '',
        edit_link: databaseRecord.edit_link || current.edit_link || '',
        submitted_at: submittedAt,
        updated_at: updatedAt,
        data: Object.assign({}, current.data || {}, databaseData),
        files: Array.isArray(databaseRecord.files) ? databaseRecord.files : current.files || []
    });
}

function normalizeApplicationRecord(record) {
    const data = Object.assign({}, record.data || {});
    const status = normalizeApplicationStatus(record.status || data.status);
    const submittedAt = record.submitted_at || record.created_at || data.submitted_at || '';

    ['applicant_name', 'applicant_email', 'phone', 'country', 'project_name', 'message'].forEach(function (key) {
        if ((data[key] === undefined || data[key] === null || data[key] === '') && record[key] !== undefined && record[key] !== null) {
            data[key] = record[key];
        }
    });

    return Object.assign({}, record, {
        status,
        submitted_at: submittedAt,
        updated_at: record.updated_at || data.updated_at || data.admin_updated_at || submittedAt,
        data,
        files: Array.isArray(record.files) ? record.files : []
    });
}

function createApplicationDashboardHtml(record, isFreshSubmission) {
    const status = normalizeApplicationStatus(record.status);
    const submittedDate = record.submitted_at ? formatDate(record.submitted_at) : 'Submitted';
    const projectName = record.data && record.data.project_name ? record.data.project_name : record.application_type;
    const rejectedMessage = status === 'rejected'
        ? `<div class="application-decision-card application-decision-rejected">
            <strong>Application Not Selected</strong>
            <p>Thank you for applying to SMAJ Ecosystem. After review, this application was not selected for the next stage. You may contact contact@smaj.org if you need support.</p>
        </div>`
        : '';

    return `
        <div class="application-success-panel">
            <span class="application-kicker">${isFreshSubmission ? 'Submission Complete' : 'Application Dashboard'}</span>
            <h3>Your application has been received successfully.</h3>
            <p>Our team will review your information. If your profile matches SMAJ Ecosystem requirements, we will contact you for an interview.</p>
            <button type="button" class="btn btn-primary btn-submitted" disabled>Application Submitted ✓</button>
        </div>

        <div class="application-summary-grid">
            <div>
                <span>Application ID</span>
                <strong>${escapeHtml(record.application_id)}</strong>
            </div>
            <div>
                <span>Status</span>
                <strong>${formatStatus(status)}</strong>
            </div>
            <div>
                <span>Application Type</span>
                <strong>${escapeHtml(record.application_type || '')}</strong>
            </div>
            <div>
                <span>Submitted</span>
                <strong>${escapeHtml(submittedDate)}</strong>
            </div>
            <div class="application-summary-wide">
                <span>Profile / Project</span>
                <strong>${escapeHtml(projectName || 'SMAJ Ecosystem Application')}</strong>
            </div>
        </div>

        ${rejectedMessage}

        <div class="application-progress-card">
            <div class="application-progress-header">
                <h3>Application Progress</h3>
                <span>${getCompletedStepCount(status)}/5</span>
            </div>
            <ol class="application-progress-list">
                ${applicationStatusSteps.map(function (step, index) {
                    return createProgressStepHtml(step, index, status);
                }).join('')}
            </ol>
        </div>

        <div class="application-support-card">
            <strong>Need help?</strong>
            <a href="mailto:contact@smaj.org">contact@smaj.org</a>
        </div>
    `;
}

function createProgressStepHtml(step, index, currentStatus) {
    const state = getProgressStepState(index, currentStatus);
    const icons = {
        complete: '✓',
        active: '⏳',
        rejected: '✕',
        locked: '🔒'
    };

    return `
        <li class="application-progress-step application-progress-${state}">
            <span class="application-progress-icon">${icons[state]}</span>
            <span>${index + 1}. ${escapeHtml(step.label)}</span>
        </li>
    `;
}

function getProgressStepState(index, currentStatus) {
    if (currentStatus === 'rejected') {
        if (index < 2) return 'complete';
        if (index === 3) return 'rejected';
        return 'locked';
    }

    const progressCount = getProgressCount(currentStatus);

    if (index + 1 < progressCount) return 'complete';
    if (index + 1 === progressCount) {
        return currentStatus === 'accepted' ? 'complete' : 'active';
    }
    return 'locked';
}

function getProgressCount(status) {
    const counts = {
        pending: 2,
        submitted: 2,
        under_review: 2,
        interview: 3,
        accepted: 5,
        rejected: 4
    };

    return counts[normalizeApplicationStatus(status)] || 2;
}

function getCompletedStepCount(status) {
    const counts = {
        pending: 2,
        submitted: 1,
        under_review: 2,
        interview: 3,
        accepted: 5,
        rejected: 4
    };

    return counts[normalizeApplicationStatus(status)] || 1;
}

function normalizeApplicationStatus(status) {
    return ['pending', 'submitted', 'under_review', 'interview', 'accepted', 'rejected'].includes(status)
        ? status
        : 'pending';
}

function formatStatus(status) {
    const labels = {
        pending: 'Application Review',
        submitted: 'Application Submitted',
        under_review: 'Application Review',
        interview: 'Founder / Team Interview',
        accepted: 'Accepted - Join SMAJ Ecosystem Team',
        rejected: 'Not Selected'
    };

    return labels[normalizeApplicationStatus(status)];
}

function getApplicationStorageKey(form) {
    return `smajApplicationSubmission:${form.dataset.persistForm || form.dataset.applicationPrefix || form.dataset.applicationForm}`;
}

function saveApplicationForForm(form, record) {
    localStorage.setItem(getApplicationStorageKey(form), JSON.stringify(record));
}

function getSavedApplicationForForm(form) {
    try {
        const rawRecord = localStorage.getItem(getApplicationStorageKey(form));
        return rawRecord ? JSON.parse(rawRecord) : null;
    } catch (error) {
        return null;
    }
}

function formatDate(value) {
    try {
        return new Intl.DateTimeFormat('en', {
            year: 'numeric',
            month: 'short',
            day: '2-digit'
        }).format(new Date(value));
    } catch (error) {
        return value;
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function initEditApplication() {
    const editPanel = document.querySelector('[data-edit-application]');

    if (!editPanel) return;

    const params = new URLSearchParams(window.location.search);
    const applicationId = params.get('id');
    const token = params.get('token');

    if (!applicationId || !token) {
        editPanel.innerHTML = '<p class="form-note">Enter through the secure edit link sent after submitting an application.</p>';
        return;
    }

    const applications = JSON.parse(localStorage.getItem('smajApplications') || '{}');
    const record = applications[applicationId];

    if (!record || record.edit_token !== token) {
        editPanel.innerHTML = '<p class="form-note">Application not found locally. Connect the edit workflow to Supabase policies before enabling public edits.</p>';
        return;
    }

    const fields = Object.entries(record.data).map(function ([key, value]) {
        return `<li><strong>${formatLabel(key)}:</strong> ${String(value || '')}</li>`;
    }).join('');

    editPanel.innerHTML = `
        <h2>${record.application_id}</h2>
        <p class="form-note">Application record loaded. Secure online editing will be enabled after the review workflow is finalized.</p>
        <ul class="application-review-list">${fields}</ul>
    `;
}

function setStatus(status, message, type) {
    showFeedbackPopup(status, message, type);
}

function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (!button.dataset.defaultText) {
        button.dataset.defaultText = button.textContent;
    }
    button.disabled = isLoading;
    button.textContent = isLoading ? 'Submitting...' : button.dataset.defaultText || button.textContent;
}

function formatLabel(value) {
    return value
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, function (letter) {
            return letter.toUpperCase();
        });
}
