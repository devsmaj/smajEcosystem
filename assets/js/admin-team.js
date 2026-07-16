import { supabaseClient } from "./supabase-client.js";
import { showFeedbackPopup } from "./feedback.js";

const tableName = "team_members";
const bucketName = "team-photos";
const state = { members: [], adminUser: null, previewUrl: "" };

document.addEventListener("DOMContentLoaded", async function () {
    initLogout();
    if (!(await guardAdmin())) return;
    bindEvents();
    await loadMembers();
});

function bindEvents() {
    document.querySelector("[data-team-refresh]")?.addEventListener("click", loadMembers);
    document.querySelector("[data-team-new]")?.addEventListener("click", () => openForm());
    document.querySelector("[data-team-close]")?.addEventListener("click", closeForm);
    document.querySelector("[data-team-cancel]")?.addEventListener("click", closeForm);
    document.querySelector("[data-team-form]")?.addEventListener("submit", saveMember);
    document.querySelector("[data-team-list]")?.addEventListener("click", handleListAction);
    document.querySelector("[name='photo_file']")?.addEventListener("change", previewSelectedPhoto);
}

async function guardAdmin() {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    const user = sessionData?.session?.user;
    if (sessionError || !user) {
        window.location.replace("/admin-login.html");
        return false;
    }

    const { data, error } = await supabaseClient
        .from("admin_users")
        .select("id, user_id, email, role, full_name")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error || !data) {
        console.error("Team admin authorization failed:", error);
        await supabaseClient.auth.signOut();
        window.location.replace("/admin-login.html");
        return false;
    }

    state.adminUser = data;
    return true;
}

function initLogout() {
    document.querySelectorAll("[data-admin-logout]").forEach(function (button) {
        button.addEventListener("click", async function () {
            await supabaseClient.auth.signOut();
            window.location.replace("/admin-login.html");
        });
    });
}

async function loadMembers() {
    const status = document.querySelector("[data-team-status]");
    setStatus(status, "Loading team members...", "info");

    const { data, error } = await supabaseClient
        .from(tableName)
        .select("*")
        .order("display_order", { ascending: true })
        .order("full_name", { ascending: true });

    if (error) {
        console.error("Team members load failed:", error);
        setStatus(status, formatError(error), "error");
        renderError(formatError(error));
        return;
    }

    state.members = data || [];
    renderMembers();
    updateCounts();
    setStatus(status, `Loaded ${state.members.length} team members.`, "success");
}

function renderMembers() {
    const list = document.querySelector("[data-team-list]");
    if (!list) return;

    if (!state.members.length) {
        list.innerHTML = '<div class="admin-team-empty"><i class="bx bx-group"></i><h3>No team members yet</h3><p>Use Add Member to create the first profile.</p></div>';
        return;
    }

    list.innerHTML = state.members.map(function (member) {
        const photo = member.photo_url
            ? `<img src="${escapeAttribute(member.photo_url)}" alt="${escapeAttribute(member.full_name)}">`
            : '<i class="bx bx-user"></i>';
        return `<article class="admin-team-card">
            <div class="admin-team-card-photo">${photo}</div>
            <div class="admin-team-card-body">
                <div class="admin-team-card-heading"><div><h3>${escapeHtml(member.full_name)}</h3><p>${escapeHtml(member.job_title)}</p></div><span class="admin-status-pill ${member.is_published ? "admin-status-published" : "admin-status-draft"}">${member.is_published ? "Published" : "Draft"}</span></div>
                <p class="admin-team-card-bio">${escapeHtml(member.biography)}</p>
                <span class="admin-team-order">Display order: ${Number(member.display_order) || 0}</span>
                <div class="admin-row-actions admin-team-actions"><button class="btn btn-outline admin-table-action" type="button" data-team-edit="${member.id}"><i class="bx bx-edit"></i>Edit</button><button class="btn btn-outline admin-table-action admin-danger" type="button" data-team-delete="${member.id}"><i class="bx bx-trash"></i>Delete</button></div>
            </div>
        </article>`;
    }).join("");
}

function renderError(message) {
    const list = document.querySelector("[data-team-list]");
    if (list) list.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function updateCounts() {
    setText("[data-team-count-all]", state.members.length);
    setText("[data-team-count-published]", state.members.filter(member => member.is_published).length);
    setText("[data-team-count-draft]", state.members.filter(member => !member.is_published).length);
}

function handleListAction(event) {
    const editButton = event.target.closest("[data-team-edit]");
    const deleteButton = event.target.closest("[data-team-delete]");
    if (editButton) openForm(state.members.find(member => member.id === editButton.dataset.teamEdit));
    if (deleteButton) deleteMember(deleteButton.dataset.teamDelete);
}

function openForm(member = null) {
    const form = document.querySelector("[data-team-form]");
    const panel = document.querySelector("[data-team-form-panel]");
    if (!form || !panel) return;

    resetPhotoPreview();
    setStatus(document.querySelector("[data-team-form-status]"), "", "");
    form.reset();
    form.elements.id.value = member?.id || "";
    form.elements.photo_url.value = member?.photo_url || "";
    form.elements.photo_path.value = member?.photo_path || "";
    form.elements.full_name.value = member?.full_name || "";
    form.elements.job_title.value = member?.job_title || "";
    form.elements.biography.value = member?.biography || "";
    form.elements.email.value = member?.email || "";
    form.elements.display_order.value = member?.display_order ?? state.members.length + 1;
    form.elements.skills.value = (member?.skills || []).join("\n");
    form.elements.is_published.checked = member?.is_published || false;

    const links = member?.social_links || {};
    ["linkedin", "github", "x", "facebook", "instagram", "telegram", "tiktok", "youtube"].forEach(name => {
        form.elements[name].value = links[name] || "";
    });

    renderPhotoPreview(member?.photo_url || "");
    setText("[data-team-form-title]", member ? "Edit Team Member" : "Add Team Member");
    panel.hidden = false;
    document.querySelector("[data-team-list-panel]").hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeForm() {
    resetPhotoPreview();
    document.querySelector("[data-team-form-panel]").hidden = true;
    document.querySelector("[data-team-list-panel]").hidden = false;
}

function previewSelectedPhoto(event) {
    const file = event.target.files?.[0];
    const feedback = document.querySelector("[data-team-photo-feedback]");
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
        event.target.value = "";
        setStatus(feedback, "Choose a PNG, JPG or WebP image smaller than 5 MB.", "error");
        return;
    }
    resetPhotoPreview();
    state.previewUrl = URL.createObjectURL(file);
    renderPhotoPreview(state.previewUrl);
    setStatus(feedback, `${file.name} selected.`, "success");
}

function renderPhotoPreview(url) {
    const preview = document.querySelector("[data-team-photo-preview]");
    if (preview) preview.innerHTML = url ? `<img src="${escapeAttribute(url)}" alt="Selected team member">` : '<i class="bx bx-user"></i>';
}

function resetPhotoPreview() {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = "";
}

async function saveMember(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("[data-team-save]");
    const status = document.querySelector("[data-team-form-status]");
    const id = form.elements.id.value;
    const previousPhotoPath = form.elements.photo_path.value;
    let uploadedPhotoPath = "";

    setButtonLoading(button, true);
    try {
        let photoUrl = form.elements.photo_url.value;
        let photoPath = previousPhotoPath;
        const photoFile = form.elements.photo_file.files?.[0];
        if (photoFile) {
            const upload = await uploadPhoto(photoFile, form.elements.full_name.value);
            photoUrl = upload.url;
            photoPath = upload.path;
            uploadedPhotoPath = upload.path;
        }

        const payload = buildPayload(form, photoUrl, photoPath);
        let result;
        if (id) {
            result = await supabaseClient.from(tableName).update(payload).eq("id", id).select().single();
        } else {
            payload.created_by = state.adminUser.user_id;
            result = await supabaseClient.from(tableName).insert(payload).select().single();
        }
        if (result.error) throw result.error;

        if (uploadedPhotoPath && previousPhotoPath && previousPhotoPath !== uploadedPhotoPath) {
            const { error: removeError } = await supabaseClient.storage.from(bucketName).remove([previousPhotoPath]);
            if (removeError) console.warn("Old team photo cleanup failed:", removeError);
        }

        setStatus(status, `${payload.full_name} saved successfully.`, "success");
        closeForm();
        await loadMembers();
    } catch (error) {
        console.error("Team member save failed:", error);
        if (uploadedPhotoPath) await supabaseClient.storage.from(bucketName).remove([uploadedPhotoPath]);
        setStatus(status, formatError(error), "error");
    } finally {
        setButtonLoading(button, false);
    }
}

function buildPayload(form, photoUrl, photoPath) {
    const socialLinks = {};
    ["linkedin", "github", "x", "facebook", "instagram", "telegram", "tiktok", "youtube"].forEach(name => {
        const value = form.elements[name].value.trim();
        if (value) socialLinks[name] = value;
    });
    return {
        slug: slugify(form.elements.full_name.value),
        full_name: form.elements.full_name.value.trim(),
        job_title: form.elements.job_title.value.trim(),
        biography: form.elements.biography.value.trim(),
        photo_url: photoUrl || null,
        photo_path: photoPath || null,
        email: form.elements.email.value.trim() || null,
        skills: form.elements.skills.value.split(/\n|,/).map(value => value.trim()).filter(Boolean),
        social_links: socialLinks,
        display_order: Number(form.elements.display_order.value) || 0,
        is_published: form.elements.is_published.checked
    };
}

async function uploadPhoto(file, fullName) {
    const extension = file.name.split(".").pop().toLowerCase();
    const path = `members/${slugify(fullName)}-${Date.now()}.${extension}`;
    const { error } = await supabaseClient.storage.from(bucketName).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = supabaseClient.storage.from(bucketName).getPublicUrl(path);
    return { path, url: data.publicUrl };
}

async function deleteMember(id) {
    const member = state.members.find(item => item.id === id);
    if (!member || !window.confirm(`Delete ${member.full_name}? This cannot be undone.`)) return;
    const status = document.querySelector("[data-team-status]");
    const { error } = await supabaseClient.from(tableName).delete().eq("id", id);
    if (error) {
        console.error("Team member delete failed:", error);
        setStatus(status, formatError(error), "error");
        return;
    }
    if (member.photo_path) {
        const { error: photoError } = await supabaseClient.storage.from(bucketName).remove([member.photo_path]);
        if (photoError) console.warn("Deleted member photo cleanup failed:", photoError);
    }
    setStatus(status, `${member.full_name} deleted.`, "success");
    await loadMembers();
}

function slugify(value) { return String(value || "member").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `member-${Date.now()}`; }
function formatError(error) { return [error?.message, error?.details, error?.hint, error?.code && `Code: ${error.code}`].filter(Boolean).join(" — ") || "Team request failed."; }
function setStatus(element, message, type) { showFeedbackPopup(element, message, type); }
function setText(selector, value) { const element = document.querySelector(selector); if (element) element.textContent = value; }
function setButtonLoading(button, loading) { if (!button) return; if (!button.dataset.label) button.dataset.label = button.innerHTML; button.disabled = loading; button.innerHTML = loading ? "Saving..." : button.dataset.label; }
function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
