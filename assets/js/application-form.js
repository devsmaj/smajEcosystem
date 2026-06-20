const firebaseConfig = {
    apiKey: "AIzaSyDcgvUNr8xwpIh8oLjLDJ6UiVtGbbhANpM",
    authDomain: "smaj-ecosystem.firebaseapp.com",
    projectId: "smaj-ecosystem",
    storageBucket: "smaj-ecosystem.firebasestorage.app",
    messagingSenderId: "196720259518",
    appId: "1:196720259518:web:1dc1aa53d59c4b8987c9ef",
    measurementId: "G-22SBN58WT4"
};

const emailJsConfig = {
    publicKey: "8P_4KsqS5t0soM0gX",
    serviceId: "service_jsd5hom",
    adminTemplateId: "template_onw8b66",
    userTemplateId: "template_5h069ek",
    adminEmail: "officialsmaj@gmail.com"
};

const appState = {
    firebaseReady: false,
    db: null,
    storage: null,
    firebaseModules: null
};

document.addEventListener('DOMContentLoaded', function () {
    initApplicationForms();
    initEditApplication();
});

async function initFirebase() {
    if (appState.firebaseReady) return true;

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        return false;
    }

    try {
        const appModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
        const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
        const storageModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');

        const app = appModule.initializeApp(firebaseConfig);

        appState.db = firestoreModule.getFirestore(app);
        appState.storage = storageModule.getStorage(app);
        appState.firebaseModules = {
            ...firestoreModule,
            ...storageModule
        };
        appState.firebaseReady = true;

        return true;
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        return false;
    }
}

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

    setStatus(status, 'Sending application...', 'info');
    setButtonLoading(submitButton, true);

    try {
        const firebaseReady = await initFirebase();

        if (firebaseReady) {
            record.files = await uploadApplicationFiles(applicationId, files);
            await saveApplicationRecord(applicationId, record);
        } else {
            record.files = files.map(function (file) {
                return {
                    field: file.field,
                    name: file.file.name,
                    size: file.file.size,
                    type: file.file.type,
                    storagePath: 'Firebase Storage not configured'
                };
            });
            saveDemoApplication(record);
        }

        try {
            await sendEmailNotifications(record);
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }
        showApplicationSuccess(record);
        form.reset();
        setStatus(status, 'Application received. Save your application ID and edit link.', 'success');
    } catch (error) {
        console.error(error);
        setStatus(status, 'Something went wrong. Please check the form and try again.', 'error');
    } finally {
        setButtonLoading(submitButton, false);
    }
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

async function uploadApplicationFiles(applicationId, files) {
    const uploaded = [];
    const modules = appState.firebaseModules;

    for (const item of files) {
        const storagePath = `applications/${applicationId}/${item.field}/${Date.now()}-${item.file.name}`;
        const fileRef = modules.ref(appState.storage, storagePath);

        await modules.uploadBytes(fileRef, item.file);

        uploaded.push({
            field: item.field,
            name: item.file.name,
            size: item.file.size,
            type: item.file.type,
            storagePath,
            downloadUrl: await modules.getDownloadURL(fileRef)
        });
    }

    return uploaded;
}

async function saveApplicationRecord(applicationId, record) {
    const modules = appState.firebaseModules;
    const docRef = modules.doc(appState.db, 'applications', applicationId);

    await modules.setDoc(docRef, record);
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

    await Promise.all(emailJobs);
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

    const storageNote = appState.firebaseReady
        ? 'Your application has been securely submitted to SMAJ Ecosystem.'
        : 'Your application was saved locally because the secure submission service could not be reached. Please try again if you do not receive confirmation.';

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
        editPanel.innerHTML = '<p class="form-note">Application not found locally. If Firebase is configured, connect the edit workflow to Firestore rules before enabling public edits.</p>';
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
