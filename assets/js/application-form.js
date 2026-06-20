const supabaseConfig = {
    url: "https://fqfcxitcnseyrunglkqy.supabase.co",
    anonKey: "sb_publishable_SA3t6uGPtSDPofYVa1XGVQ_qOaVZn7Y",
    bucket: "applications",
    table: "applications"
};

const emailJsConfig = {
    publicKey: "8P_4KsqS5t0soM0gX",
    serviceId: "service_jsd5hom",
    adminTemplateId: "template_onw8b66",
    userTemplateId: "template_5h069ek",
    adminEmail: "officialsmaj@gmail.com"
};

const appState = {
    supabaseReady: Boolean(supabaseConfig.url && supabaseConfig.anonKey)
};

document.addEventListener('DOMContentLoaded', function () {
    initFileFeedback();
    initApplicationForms();
    initEditApplication();
});

function initApplicationForms() {
    const forms = document.querySelectorAll('[data-application-form]');

    forms.forEach(function (form) {
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
    const applicationId = createApplicationId(prefix);
    const editToken = createToken();
    const submittedAt = new Date().toISOString();
    const editLink = createEditLink(applicationId, editToken);
    const record = {
        application_id: applicationId,
        edit_token: editToken,
        application_type: applicationType,
        edit_link: editLink,
        status: 'received',
        submitted_at: submittedAt,
        updated_at: submittedAt,
        data: payload,
        files: []
    };

    if (!fileValidation.valid) {
        setStatus(status, fileValidation.message, 'error');
        return;
    }

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

        const successUrl = new URL('/success/', window.location.origin);
        successUrl.searchParams.set('id', applicationId);
        window.location.href = successUrl.toString();
        return;
    } catch (error) {
        console.error(error);
        setStatus(status, error.message || 'Something went wrong. Please check the form and try again.', 'error');
    } finally {
        setButtonLoading(submitButton, false);
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
                feedback.textContent = '';
                feedback.dataset.status = '';
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
                feedback.textContent = validation.message;
                feedback.dataset.status = 'error';
                return;
            }

            const imageFiles = files.filter(function (file) {
                return isAllowedImageFile(file);
            });

            if (input.multiple && imageFiles.length > 3) {
                input.value = '';
                feedback.textContent = 'Please select up to 3 images only.';
                feedback.dataset.status = 'error';
                return;
            }

            feedback.textContent = files.length === 1
                ? `${files[0].name} selected.`
                : `${files.length} files selected. Upload will complete when you submit.`;
            feedback.dataset.status = 'info';
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

    for (const item of files) {
        const storagePath = `applications/${folder}/${applicationId}/${Date.now()}-${sanitizeFileName(item.file.name)}`;
        const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${encodeURIComponent(supabaseConfig.bucket)}/${storagePath}`;

        const response = await withTimeout(
            fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    apikey: supabaseConfig.anonKey,
                    Authorization: `Bearer ${supabaseConfig.anonKey}`,
                    'Content-Type': item.file.type || 'application/octet-stream',
                    'x-upsert': 'false'
                },
                body: item.file
            }),
            30000,
            `Upload timed out for ${item.file.name}. Try a smaller file or check Supabase Storage rules.`
        );

        if (!response.ok) {
            const errorText = await response.text().catch(function () {
                return '';
            });
            throw new Error(errorText || `Upload failed for ${item.file.name}.`);
        }

        uploaded.push({
            field: item.field,
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            bucket: supabaseConfig.bucket,
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
        submitted_at: record.submitted_at,
        updated_at: record.updated_at,
        data: record.data,
        files: record.files
    };

    const response = await withTimeout(
        fetch(`${supabaseConfig.url}/rest/v1/${supabaseConfig.table}`, {
            method: 'POST',
            headers: {
                apikey: supabaseConfig.anonKey,
                Authorization: `Bearer ${supabaseConfig.anonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify(row)
        }),
        20000,
        'Saving application timed out. Please check Supabase table policies and try again.'
    );

    if (!response.ok) {
        const errorText = await response.text().catch(function () {
            return '';
        });
        throw new Error(errorText || 'Could not save application in Supabase database.');
    }
}

async function sendEmailNotifications(record) {
    if (!emailJsConfig.publicKey || !emailJsConfig.serviceId) {
        return;
    }

    const baseParams = createEmailTemplateParams(record);
    const applicantEmail = baseParams.applicant_email;

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
        throw new Error('EmailJS request failed');
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

        feedback.textContent = count === 1
            ? 'Upload successful.'
            : `${count} files uploaded successfully.`;
        feedback.dataset.status = 'success';
    });
}

function setFileUploadError(files) {
    const fields = new Set(files.map(function (file) {
        return file.field;
    }));

    fields.forEach(function (field) {
        const feedback = document.querySelector(`[data-file-feedback="${field}"]`);

        if (!feedback) return;

        feedback.textContent = 'Upload failed. Please try again.';
        feedback.dataset.status = 'error';
    });
}

function findFileFeedback(input) {
    return document.querySelector(`[data-file-feedback="${input.name}"]`);
}

function getApplicationFolder(applicationType) {
    const folders = {
        'Founder Partnership': 'founders',
        'Technology Builder': 'builders',
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
    return `${supabaseConfig.url}/storage/v1/object/public/${encodeURIComponent(supabaseConfig.bucket)}/${storagePath}`;
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
    const random = Math.floor(10000 + Math.random() * 90000);
    return `SMAJ-${prefix}-${year}-${random}`;
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
        application_id: record.application_id || '',
        application_type: record.application_type || '',
        applicant_name: data.applicant_name || '',
        applicant_email: data.applicant_email || '',
        phone: data.phone || '',
        country: data.country || '',
        linkedin: data.linkedin || '',
        github: data.github || '',
        portfolio: data.portfolio || '',
        project_name: data.project_name || '',
        project_website: data.project_website || '',
        stage: data.stage || '',
        message: buildEmailMessage(data),
        edit_link: record.edit_link || '',
        submitted_at: record.submitted_at || ''
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
    if (!status) return;
    status.textContent = message;
    status.dataset.status = type;
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
