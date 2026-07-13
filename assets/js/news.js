import { smajEnv } from "./env-module.js";
import { supabaseClient } from "./supabase-client.js";

const supabaseConfig = {
    table: smajEnv.SUPABASE_NEWS_TABLE || "news_articles"
};

const defaultImage = "https://smaj.org/assets/images/logo.jpg";
const fallbackArticles = [
    {
        id: "local-smaj-ecosystem-update",
        title: "SMAJ Ecosystem News Is Being Updated",
        slug: "smaj-ecosystem-news-update",
        excerpt: "SMAJ Ecosystem news publishing is active, and the latest official updates will appear here as they are published.",
        content: "SMAJ Ecosystem is preparing official updates, launch notes, community stories, and product announcements. Please check back soon for the latest published news from the team.",
        featured_image: defaultImage,
        category: "Ecosystem",
        author: "SMAJ Team",
        tags: ["SMAJ", "Ecosystem", "Updates"],
        status: "published",
        published_at: new Date().toISOString(),
        seo_title: "SMAJ Ecosystem News",
        seo_description: "Official SMAJ Ecosystem news and updates."
    }
];

document.addEventListener("DOMContentLoaded", function () {
    const page = document.body.dataset.newsPage;
    if (page === "list") loadNewsList();
    if (page === "detail") loadNewsDetail();
});

async function loadNewsList() {
    const status = document.querySelector("[data-news-status]");
    const list = document.querySelector("[data-news-list]");

    setStatus(status, "Loading latest news...", "info");

    try {
        const articles = await fetchPublishedArticles();
        if (!articles.length) {
            setStatus(status, "No published news yet.", "info");
            if (list) list.innerHTML = "";
            return;
        }

        setStatus(status, "", "");
        if (list) list.innerHTML = articles.map(createNewsCard).join("");
    } catch (error) {
        console.error(error);
        const articles = fallbackArticles.map(normalizeArticle);
        setStatus(status, "Showing latest available SMAJ Ecosystem update while live news reconnects.", "info");
        if (list) list.innerHTML = articles.map(createNewsCard).join("");
    }
}

async function loadNewsDetail() {
    const status = document.querySelector("[data-news-status]");
    const articleContainer = document.querySelector("[data-news-article]");
    const relatedContainer = document.querySelector("[data-related-news]");
    const slug = getArticleSlug();

    if (!slug) {
        setStatus(status, "Article slug is missing.", "error");
        return;
    }

    setStatus(status, "Loading article...", "info");

    try {
        const { data, error } = await supabaseClient
            .from(supabaseConfig.table)
            .select("*")
            .eq("slug", slug)
            .eq("status", "published")
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            setStatus(status, "This article is not published or could not be found.", "error");
            return;
        }

        const article = normalizeArticle(data);
        updateArticleMeta(article);
        setStatus(status, "", "");
        if (articleContainer) articleContainer.innerHTML = createArticleDetail(article);

        const related = (await fetchPublishedArticles(4))
            .filter(function (item) {
                return item.slug !== article.slug;
            })
            .filter(function (item) {
                return item.category === article.category || item.tags.some(function (tag) { return article.tags.includes(tag); });
            })
            .slice(0, 3);

        const fallbackRelated = related.length ? related : (await fetchPublishedArticles(4)).filter(function (item) {
            return item.slug !== article.slug;
        }).slice(0, 3);

        if (relatedContainer) {
            relatedContainer.innerHTML = fallbackRelated.length
                ? fallbackRelated.map(createNewsCard).join("")
                : '<p class="news-empty">No related articles yet.</p>';
        }
    } catch (error) {
        console.error(error);
        setStatus(status, "Could not load this article right now. Please try again later.", "error");
    }
}

async function fetchPublishedArticles(limit) {
    let query = supabaseClient
        .from(supabaseConfig.table)
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(normalizeArticle);
}

function createNewsCard(article) {
    return `
        <article class="insight-card news-card animate-on-scroll animated">
            <div class="insight-image">
                <img src="${escapeAttribute(article.featured_image)}" alt="${escapeAttribute(article.title)}" loading="lazy">
            </div>
            <div class="insight-content">
                <div class="insight-meta">
                    <span class="insight-category">${escapeHtml(article.category)}</span>
                    <span>${escapeHtml(formatDate(article.published_at))}</span>
                </div>
                <h3>${escapeHtml(article.title)}</h3>
                <p>${escapeHtml(article.excerpt || shortText(article.content, 140))}</p>
                <div class="news-card-footer">
                    <span>${escapeHtml(article.author)}</span>
                    <a href="${escapeAttribute(createArticleUrl(article.slug))}" class="btn btn-outline">Read More</a>
                </div>
            </div>
        </article>
    `;
}

function createArticleDetail(article) {
    const url = createAbsoluteUrl(createArticleUrl(article.slug));
    return `
        <header class="news-article-hero">
            <div class="container">
                <div class="news-article-hero-content">
                    <div class="news-article-meta">
                        <span class="insight-category">${escapeHtml(article.category)}</span>
                        <span>${escapeHtml(formatDate(article.published_at))}</span>
                        <span>${escapeHtml(article.author)}</span>
                    </div>
                    <h1>${escapeHtml(article.title)}</h1>
                    <p>${escapeHtml(article.excerpt)}</p>
                </div>
            </div>
        </header>
        <section class="news-article-section">
            <div class="container">
                <img class="news-article-image" src="${escapeAttribute(article.featured_image)}" alt="${escapeAttribute(article.title)}">
                <div class="news-article-layout">
                    <aside class="news-share">
                        <span>Share</span>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook"><i class="bx bxl-facebook"></i></a>
                        <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(article.title)}" target="_blank" rel="noopener noreferrer" aria-label="Share on X"><i class="bx bxl-twitter"></i></a>
                        <a href="https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(article.title)}" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn"><i class="bx bxl-linkedin"></i></a>
                        <a href="mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(url)}" aria-label="Share by email"><i class="bx bx-envelope"></i></a>
                    </aside>
                    <div class="news-article">
                        <div class="news-article-body">${formatArticleContent(article.content)}</div>
                        ${article.tags.length ? `<div class="news-tags">${article.tags.map(function (tag) { return `<span>${escapeHtml(tag)}</span>`; }).join("")}</div>` : ""}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function updateArticleMeta(article) {
    const title = article.seo_title || `${article.title} | SMAJ Ecosystem`;
    const description = article.seo_description || article.excerpt || shortText(article.content, 155);
    const url = createAbsoluteUrl(createArticleUrl(article.slug));
    const image = createAbsoluteUrl(article.featured_image);

    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "article");
    setCanonical(url);

    const published = article.published_at ? new Date(article.published_at).toISOString() : "";
    if (published) setMeta("property", "article:published_time", published);
    setMeta("property", "article:author", article.author);
}

function setMeta(attribute, key, value) {
    let tag = document.querySelector(`meta[${attribute}="${key}"]`);
    if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attribute, key);
        document.head.appendChild(tag);
    }
    tag.setAttribute("content", value);
}

function setCanonical(value) {
    let tag = document.querySelector('link[rel="canonical"]');
    if (!tag) {
        tag = document.createElement("link");
        tag.setAttribute("rel", "canonical");
        document.head.appendChild(tag);
    }
    tag.setAttribute("href", value);
}

function getArticleSlug() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("slug")) return params.get("slug");

    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] === "news" && parts[1] && parts[1] !== "article") return decodeURIComponent(parts[1]);
    return "";
}

function normalizeArticle(article) {
    return Object.assign({}, article, {
        featured_image: article.featured_image || defaultImage,
        category: article.category || "News",
        author: article.author || "SMAJ Team",
        tags: Array.isArray(article.tags) ? article.tags : parseTags(article.tags),
        excerpt: article.excerpt || shortText(article.content, 160)
    });
}

function parseTags(value) {
    if (Array.isArray(value)) return value.map(String).map(function (tag) { return tag.trim(); }).filter(Boolean);
    return String(value || "").split(",").map(function (tag) { return tag.trim(); }).filter(Boolean);
}

function formatArticleContent(content) {
    return escapeHtml(content)
        .split(/\n{2,}/)
        .map(function (paragraph) {
            return `<p>${paragraph.replace(/\n/g, "<br>")}</p>`;
        })
        .join("");
}

function createArticleUrl(slug) {
    return `/news/${encodeURIComponent(slug || "")}/`;
}

function createAbsoluteUrl(value) {
    if (/^https?:\/\//i.test(value)) return value;
    return `https://smaj.org${value.startsWith("/") ? value : `/${value}`}`;
}

function shortText(value, maxLength) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trim()}...`;
}

function formatDate(value) {
    if (!value) return "SMAJ News";
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

function setStatus(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.dataset.status = type;
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
