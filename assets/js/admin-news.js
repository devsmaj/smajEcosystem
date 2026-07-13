import { smajEnv } from "./env-module.js";
import { newsImagesBucket, supabaseClient, verifyUploadBucket } from "./supabase-client.js";
import { showFeedbackPopup } from "./feedback.js";

const supabaseConfig = {
    table: smajEnv.SUPABASE_NEWS_TABLE || "news_articles"
};

const adminConfig = {
    loginPath: "/admin-login.html",
    dashboardPath: "/admin-news.html"
};
const createNewsDraftStorageKey = "smaj-admin-create-news-draft";

const state = {
    articles: [],
    filtered: [],
    activeView: "all",
    editingId: "",
    slugTouched: false,
    realtimeChannel: null,
    refreshTimer: null,
    adminUser: null
};

document.addEventListener("DOMContentLoaded", async function () {
    initAdminLogout();
    if (!(await guardAdminPage())) return;
    initNewsAdmin();
});

async function guardAdminPage() {
    if (!(await isAdminAuthenticated())) {
        window.location.replace(adminConfig.loginPath);
        return false;
    }

    return true;
}

function initAdminLogout() {
    document.querySelectorAll("[data-admin-logout]").forEach(function (button) {
        button.addEventListener("click", async function () {
            await supabaseClient.auth.signOut();
            window.location.replace(adminConfig.loginPath);
        });
    });
}

function initNewsAdmin() {
    const newsForm = document.querySelector("[data-news-form]");
    document.querySelector("[data-news-refresh]")?.addEventListener("click", loadNews);
    document.querySelector("[data-news-new]")?.addEventListener("click", startCreateNews);
    document.querySelector("[data-news-close-form]")?.addEventListener("click", closeNewsForm);
    document.querySelector("[data-news-reset]")?.addEventListener("click", resetFilters);
    document.querySelector("[data-news-search]")?.addEventListener("input", renderNews);
    document.querySelector("[data-news-status-filter]")?.addEventListener("change", renderNews);
    document.querySelector("[data-news-list]")?.addEventListener("click", handleNewsAction);
    newsForm?.addEventListener("submit", saveNewsArticle);
    newsForm?.addEventListener("input", saveCreateNewsFormDraft);
    newsForm?.addEventListener("change", saveCreateNewsFormDraft);
    document.querySelector("[data-news-save-draft]")?.addEventListener("click", saveDraftArticle);
    document.querySelector("[data-news-preview]")?.addEventListener("click", showNewsPreview);
    document.querySelector("[data-news-close-preview]")?.addEventListener("click", closeNewsPreview);
    document.querySelector("[data-news-title]")?.addEventListener("input", handleTitleInput);
    document.querySelector("[data-news-slug]")?.addEventListener("input", function () {
        state.slugTouched = true;
        this.value = slugify(this.value);
    });
    document.querySelector("[data-news-image-file]")?.addEventListener("change", handleImageSelection);

    document.querySelectorAll("[data-news-view]").forEach(function (button) {
        button.addEventListener("click", function () {
            setNewsView(button.dataset.newsView);
        });
    });

    loadNews();
    subscribeToNewsRealtime();
    restoreCreateNewsFormDraft();
}

async function loadNews() {
    const status = document.querySelector("[data-news-status]");
    setStatus(status, "Loading news...", "info");

    try {
        const { data, error } = await supabaseClient
            .from(supabaseConfig.table)
            .select("*")
            .order("updated_at", { ascending: false });

        if (error) throw error;

        state.articles = (data || []).map(normalizeArticle);
        renderCounts();
        renderNews();
        setStatus(status, `Loaded ${state.articles.length} news articles.`, "success");
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), "error");
        const list = document.querySelector("[data-news-list]");
        if (list) list.innerHTML = `<tr><td colspan="6">${escapeHtml(getAdminErrorMessage(error))}</td></tr>`;
    }
}

function subscribeToNewsRealtime() {
    if (state.realtimeChannel) return;

    state.realtimeChannel = supabaseClient
        .channel("admin-news-realtime")
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: supabaseConfig.table
        }, function () {
            window.clearTimeout(state.refreshTimer);
            state.refreshTimer = window.setTimeout(loadNews, 350);
        })
        .subscribe();
}

function setNewsView(view) {
    state.activeView = view || "all";
    document.querySelectorAll("[data-news-view]").forEach(function (button) {
        button.classList.toggle("active", button.dataset.newsView === state.activeView);
    });

    if (state.activeView === "create") {
        startCreateNews();
        return;
    }

    closeNewsForm();
    const filter = document.querySelector("[data-news-status-filter]");
    if (filter) filter.value = ["draft", "published"].includes(state.activeView) ? state.activeView : "";
    renderNews();
}

function renderCounts() {
    const categories = new Set();
    const authors = new Set();
    const counts = state.articles.reduce(function (totals, article) {
        totals[article.status] = (totals[article.status] || 0) + 1;
        if (article.category) categories.add(article.category.toLowerCase());
        if (article.author) authors.add(article.author.toLowerCase());
        return totals;
    }, { draft: 0, published: 0 });

    setText("[data-news-count-all]", state.articles.length);
    setText("[data-news-count-draft]", counts.draft || 0);
    setText("[data-news-count-published]", counts.published || 0);
    setText("[data-news-count-categories]", categories.size);
    setText("[data-news-count-authors]", authors.size);
}

function renderNews() {
    const list = document.querySelector("[data-news-list]");
    if (!list) return;

    const search = document.querySelector("[data-news-search]")?.value.trim().toLowerCase() || "";
    const statusFilter = document.querySelector("[data-news-status-filter]")?.value || "";
    const title = state.activeView === "draft" ? "Drafts" : state.activeView === "published" ? "Published" : "All News";

    setText("[data-news-list-title]", title);

    state.filtered = state.articles.filter(function (article) {
        const statusMatches = !statusFilter || article.status === statusFilter;
        const viewMatches = !["draft", "published"].includes(state.activeView) || article.status === state.activeView;
        const searchMatches = !search || [
            article.title,
            article.slug,
            article.excerpt,
            article.category,
            article.author,
            article.tags.join(" ")
        ].join(" ").toLowerCase().includes(search);

        return statusMatches && viewMatches && searchMatches;
    });

    setText("[data-news-visible-count]", state.filtered.length);

    if (!state.filtered.length) {
        list.innerHTML = '<tr><td colspan="6">No news articles match this view.</td></tr>';
        return;
    }

    list.innerHTML = state.filtered.map(function (article) {
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(article.title || "Untitled")}</strong>
                    <span>${escapeHtml(article.slug || "")}</span>
                </td>
                <td><span class="admin-status-pill admin-status-${article.status}">${formatNewsStatus(article.status)}</span></td>
                <td>${escapeHtml(article.category || "News")}</td>
                <td>${escapeHtml(formatDate(article.published_at || article.updated_at))}</td>
                <td>${escapeHtml(article.author || "SMAJ Team")}</td>
                <td>
                    <div class="admin-row-actions admin-news-actions">
                        <button type="button" class="btn btn-outline admin-table-action" data-news-action="edit" data-news-id="${escapeAttribute(article.id)}">Edit</button>
                        <button type="button" class="btn btn-outline admin-table-action" data-news-action="preview" data-news-id="${escapeAttribute(article.id)}">Preview</button>
                        <button type="button" class="btn btn-outline admin-table-action" data-news-action="${article.status === "published" ? "draft" : "publish"}" data-news-id="${escapeAttribute(article.id)}">${article.status === "published" ? "Unpublish" : "Publish"}</button>
                        <button type="button" class="btn btn-outline admin-table-action admin-danger" data-news-action="delete" data-news-id="${escapeAttribute(article.id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function startCreateNews() {
    state.editingId = "";
    state.slugTouched = false;
    const form = document.querySelector("[data-news-form]");
    form?.reset();
    setText("[data-news-form-heading]", "Create News");
    if (!restoreCreateNewsFormDraft()) setDefaultPublishedDate();
    showFormPanel();
}

function editNewsArticle(id) {
    const article = state.articles.find(function (item) {
        return String(item.id) === String(id);
    });

    if (!article) return;

    state.editingId = article.id;
    state.slugTouched = true;
    setText("[data-news-form-heading]", "Edit News");
    showFormPanel();

    const form = document.querySelector("[data-news-form]");
    form.elements.id.value = article.id || "";
    form.elements.title.value = article.title || "";
    form.elements.slug.value = article.slug || "";
    form.elements.excerpt.value = article.excerpt || "";
    form.elements.content.value = article.content || "";
    form.elements.featured_image.value = article.featured_image || "";
    form.elements.category.value = article.category || "";
    form.elements.tags.value = article.tags.join(", ");
    form.elements.author.value = article.author || "";
    form.elements.status.value = article.status || "draft";
    form.elements.seo_title.value = article.seo_title || "";
    form.elements.seo_description.value = article.seo_description || "";
    form.elements.published_at.value = toDatetimeLocal(article.published_at || new Date().toISOString());
}

function showFormPanel() {
    const panel = document.querySelector("[data-news-form-panel]");
    if (panel) panel.hidden = false;
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeNewsForm() {
    const panel = document.querySelector("[data-news-form-panel]");
    if (panel) panel.hidden = true;
}

async function saveDraftArticle() {
    const form = document.querySelector("[data-news-form]");
    if (form) form.elements.status.value = "draft";
    await upsertNewsArticle(document.querySelector("[data-news-save-draft]"));
}

async function saveNewsArticle(event) {
    event.preventDefault();
    await upsertNewsArticle(document.querySelector("[data-news-publish]"));
}

async function upsertNewsArticle(actionButton) {
    const form = document.querySelector("[data-news-form]");
    const status = document.querySelector("[data-news-status]");

    if (!form.reportValidity()) return;

    setStatus(status, "Saving news article...", "info");
    setButtonLoading(actionButton, true);

    try {
        const payload = collectArticlePayload(form);
        payload.featured_image = await uploadFeaturedImage(payload.featured_image);

        const query = state.editingId
            ? supabaseClient.from(supabaseConfig.table).update(payload).eq("id", state.editingId).select().maybeSingle()
            : supabaseClient.from(supabaseConfig.table).insert(payload).select().maybeSingle();

        const { data, error } = await query;
        if (error) throw error;

        const saved = normalizeArticle(data || Object.assign({ id: state.editingId }, payload));
        clearCreateNewsFormDraft();
        state.editingId = saved.id;
        state.slugTouched = true;
        setStatus(status, `${saved.status === "published" ? "Published" : "Draft saved"}: ${saved.title}`, "success");
        await loadNews();
        editNewsArticle(saved.id);
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), "error");
    } finally {
        setButtonLoading(actionButton, false);
    }
}

async function uploadFeaturedImage(existingUrl) {
    const input = document.querySelector("[data-news-image-file]");
    const feedback = document.querySelector("[data-news-image-feedback]");
    const file = input?.files?.[0];

    if (!file) return existingUrl || "";

    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        throw new Error("Featured image must be PNG, JPG, or WEBP.");
    }

    if (file.size > 8 * 1024 * 1024) {
        throw new Error("Featured image must be 8MB or smaller.");
    }

    setStatus(feedback, "Uploading image...", "info");
    await verifyUploadBucket();
    const slug = document.querySelector("[data-news-slug]")?.value || "news";
    const storagePath = `news/${slug}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { error } = await supabaseClient.storage.from('news-images').upload(storagePath, file, {
        contentType: file.type,
        upsert: false
    });

    if (error) throw error;

    const { data } = supabaseClient.storage.from('news-images').getPublicUrl(storagePath);
    setStatus(feedback, "Image uploaded.", "success");
    if (input) input.value = "";

    return data.publicUrl;
}

function collectArticlePayload(form) {
    const formData = new FormData(form);
    const now = new Date().toISOString();
    const title = String(formData.get("title") || "").trim();
    const slug = slugify(formData.get("slug") || title);
    const status = normalizeNewsStatus(formData.get("status"));
    const publishedAt = fromDatetimeLocal(formData.get("published_at")) || now;

    return {
        title,
        slug,
        excerpt: String(formData.get("excerpt") || "").trim(),
        content: String(formData.get("content") || "").trim(),
        featured_image: String(formData.get("featured_image") || "").trim(),
        category: String(formData.get("category") || "News").trim(),
        tags: parseTags(formData.get("tags")),
        author: String(formData.get("author") || "SMAJ Team").trim(),
        status,
        seo_title: String(formData.get("seo_title") || title).trim(),
        seo_description: String(formData.get("seo_description") || formData.get("excerpt") || "").trim(),
        published_at: status === "published" ? publishedAt : null,
        updated_at: now,
        created_by: state.adminUser?.id || null
    };
}

function saveCreateNewsFormDraft() {
    if (state.editingId) return;

    const form = document.querySelector("[data-news-form]");
    if (!form) return;

    const fields = {};
    Array.from(form.elements).forEach(function (element) {
        if (!element.name || element.type === "file" || element.type === "button" || element.type === "submit" || element.name === "id") return;
        fields[element.name] = element.value;
    });

    try {
        window.localStorage.setItem(createNewsDraftStorageKey, JSON.stringify(fields));
    } catch (error) {
        console.warn("[SMAJ News] Could not save the create-news form locally.", error);
    }
}

function restoreCreateNewsFormDraft() {
    const form = document.querySelector("[data-news-form]");
    if (!form || state.editingId) return false;

    try {
        const savedDraft = window.localStorage.getItem(createNewsDraftStorageKey);
        if (!savedDraft) return false;

        const fields = JSON.parse(savedDraft);
        Object.entries(fields).forEach(function ([name, value]) {
            const field = form.elements.namedItem(name);
            if (field && field.type !== "file") field.value = String(value ?? "");
        });

        state.slugTouched = Boolean(fields.slug);
        setText("[data-news-form-heading]", "Create News");
        showFormPanel();
        setStatus(document.querySelector("[data-news-status]"), "Unsaved create-news input restored after refresh.", "info");
        return true;
    } catch (error) {
        console.warn("[SMAJ News] Could not restore the locally saved create-news form.", error);
        return false;
    }
}

function clearCreateNewsFormDraft() {
    try {
        window.localStorage.removeItem(createNewsDraftStorageKey);
    } catch (error) {
        console.warn("[SMAJ News] Could not clear the locally saved create-news form.", error);
    }
}

function handleNewsAction(event) {
    const target = event.target.closest("[data-news-action]");
    if (!target) return;

    const id = target.dataset.newsId;
    const action = target.dataset.newsAction;

    if (action === "edit") editNewsArticle(id);
    if (action === "preview") previewExistingNews(id);
    if (action === "publish") updateNewsStatus(id, "published", target);
    if (action === "draft") updateNewsStatus(id, "draft", target);
    if (action === "delete") deleteNewsArticle(id, target);
}

async function updateNewsStatus(id, nextStatus, button) {
    const article = state.articles.find(function (item) {
        return String(item.id) === String(id);
    });
    const status = document.querySelector("[data-news-status]");

    if (!article) return;

    setButtonLoading(button, true);
    setStatus(status, "Updating article status...", "info");

    try {
        const payload = {
            status: nextStatus,
            published_at: nextStatus === "published" ? article.published_at || new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        };
        const { error } = await supabaseClient.from(supabaseConfig.table).update(payload).eq("id", id);
        if (error) throw error;
        setStatus(status, `Article moved to ${formatNewsStatus(nextStatus)}.`, "success");
        await loadNews();
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), "error");
    } finally {
        setButtonLoading(button, false);
    }
}

async function deleteNewsArticle(id, button) {
    const article = state.articles.find(function (item) {
        return String(item.id) === String(id);
    });

    if (!article || !window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return;

    const status = document.querySelector("[data-news-status]");
    setButtonLoading(button, true);
    setStatus(status, "Deleting article...", "info");

    try {
        const { error } = await supabaseClient.from(supabaseConfig.table).delete().eq("id", id);
        if (error) throw error;
        setStatus(status, "Article deleted.", "success");
        await loadNews();
    } catch (error) {
        console.error(error);
        setStatus(status, getAdminErrorMessage(error), "error");
    } finally {
        setButtonLoading(button, false);
    }
}

function showNewsPreview() {
    const form = document.querySelector("[data-news-form]");
    if (!form) return;

    const payload = collectArticlePayload(form);
    const modal = document.querySelector("[data-news-preview-modal]");
    const content = document.querySelector("[data-news-preview-content]");

    if (!modal || !content) return;

    content.innerHTML = `
        <article class="news-article">
            ${payload.featured_image ? `<img class="news-article-image" src="${escapeAttribute(payload.featured_image)}" alt="${escapeAttribute(payload.title)}">` : ""}
            <div class="news-article-meta">
                <span class="insight-category">${escapeHtml(payload.category)}</span>
                <span>${escapeHtml(formatDate(payload.published_at || new Date().toISOString()))}</span>
                <span>${escapeHtml(payload.author)}</span>
            </div>
            <h1>${escapeHtml(payload.title)}</h1>
            <p class="news-article-excerpt">${escapeHtml(payload.excerpt)}</p>
            <div class="news-article-body">${formatArticleContent(payload.content)}</div>
        </article>
    `;
    modal.hidden = false;
    document.body.classList.add("no-scroll");
}

function previewExistingNews(id) {
    const article = state.articles.find(function (item) {
        return String(item.id) === String(id);
    });
    const modal = document.querySelector("[data-news-preview-modal]");
    const content = document.querySelector("[data-news-preview-content]");

    if (!article || !modal || !content) return;

    content.innerHTML = `
        <article class="news-article">
            ${article.featured_image ? `<img class="news-article-image" src="${escapeAttribute(article.featured_image)}" alt="${escapeAttribute(article.title)}">` : ""}
            <div class="news-article-meta">
                <span class="insight-category">${escapeHtml(article.category)}</span>
                <span>${escapeHtml(formatDate(article.published_at || article.updated_at))}</span>
                <span>${escapeHtml(article.author)}</span>
                <span>${escapeHtml(formatNewsStatus(article.status))}</span>
            </div>
            <h1>${escapeHtml(article.title)}</h1>
            <p class="news-article-excerpt">${escapeHtml(article.excerpt)}</p>
            <div class="news-article-body">${formatArticleContent(article.content)}</div>
        </article>
    `;
    modal.hidden = false;
    document.body.classList.add("no-scroll");
}

function closeNewsPreview() {
    const modal = document.querySelector("[data-news-preview-modal]");
    if (modal) modal.hidden = true;
    document.body.classList.remove("no-scroll");
}

function resetFilters() {
    const search = document.querySelector("[data-news-search]");
    const status = document.querySelector("[data-news-status-filter]");
    if (search) search.value = "";
    if (status) status.value = "";
    state.activeView = "all";
    document.querySelectorAll("[data-news-view]").forEach(function (button) {
        button.classList.toggle("active", button.dataset.newsView === "all");
    });
    renderNews();
}

function handleTitleInput(event) {
    const slugInput = document.querySelector("[data-news-slug]");
    if (!slugInput || state.slugTouched) return;
    slugInput.value = slugify(event.target.value);
}

function handleImageSelection(event) {
    const feedback = document.querySelector("[data-news-image-feedback]");
    const file = event.target.files?.[0];

    if (!file) {
        setStatus(feedback, "", "");
        return;
    }

    setStatus(feedback, `${file.name} selected. Upload completes when saved.`, "info");
}

async function isAdminAuthenticated() {
    state.adminUser = await fetchCurrentAdminUser();
    return Boolean(state.adminUser);
}

async function fetchCurrentAdminUser() {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData.session?.user) return null;

    const { data, error } = await supabaseClient
        .from("admin_users")
        .select("id, user_id, email, role, full_name, created_at")
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        return null;
    }

    return data;
}

function normalizeArticle(article) {
    return Object.assign({}, article, {
        status: normalizeNewsStatus(article.status),
        tags: Array.isArray(article.tags) ? article.tags : parseTags(article.tags),
        featured_image: article.featured_image || "/assets/images/logo.jpg",
        author: article.author || "SMAJ Team",
        category: article.category || "News"
    });
}

function normalizeNewsStatus(status) {
    return status === "published" ? "published" : "draft";
}

function parseTags(value) {
    if (Array.isArray(value)) return value.map(String).map(function (tag) { return tag.trim(); }).filter(Boolean);
    return String(value || "").split(",").map(function (tag) { return tag.trim(); }).filter(Boolean);
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90);
}

function sanitizeFileName(fileName) {
    const parts = String(fileName || "image").split(".");
    const extension = parts.length > 1 ? parts.pop().toLowerCase() : "jpg";
    const baseName = slugify(parts.join("-")) || "image";
    return `${baseName}.${extension}`;
}

function formatArticleContent(content) {
    return escapeHtml(content)
        .split(/\n{2,}/)
        .map(function (paragraph) {
            return `<p>${paragraph.replace(/\n/g, "<br>")}</p>`;
        })
        .join("");
}

function formatNewsStatus(status) {
    return status === "published" ? "Published" : "Draft";
}

function formatDate(value) {
    if (!value) return "Not scheduled";
    try {
        return new Intl.DateTimeFormat("en", {
            year: "numeric",
            month: "short",
            day: "2-digit"
        }).format(new Date(value));
    } catch (error) {
        return value;
    }
}

function toDatetimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromDatetimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function setDefaultPublishedDate() {
    const input = document.querySelector("[name='published_at']");
    if (input) input.value = toDatetimeLocal(new Date().toISOString());
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
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
    button.disabled = isLoading;
    button.textContent = isLoading ? "Working..." : button.dataset.defaultText;
}

function getAdminErrorMessage(error) {
    const message = String(error && error.message ? error.message : error);
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return "Could not connect to Supabase. Check the public Supabase URL/key in assets/js/env.js and confirm this domain is allowed in Supabase Auth URL settings.";
    }
    if (/row-level security|permission denied|401|403|JWT/i.test(message)) {
        return "Supabase denied access. Configure admin news RLS policies before using news publishing.";
    }
    return message || "News request failed.";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
}
