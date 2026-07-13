import fs from "node:fs/promises";

const siteUrl = "https://smaj.org";
const sitemapPath = new URL("../sitemap.xml", import.meta.url);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const newsTable = process.env.SUPABASE_NEWS_TABLE || "news_articles";

const staticUrls = [
    "/",
    "/about/",
    "/ventures/",
    "/partnerships/",
    "/insights/",
    "/news/",
    "/contact/",
    "/success/",
    "/legal/",
    "/privacy-policy/",
    "/terms-of-service/",
    "/cookie-policy/",
    "/founder-application/",
    "/builder-application/",
    "/partner-application/",
    "/edit-application/"
];

const response = await fetch(`${supabaseUrl}/rest/v1/${newsTable}?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc`, {
    headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
    }
});

if (!response.ok) {
    throw new Error(`Could not fetch published news for sitemap: ${response.status} ${await response.text()}`);
}

const articles = await response.json();
const seen = new Set();
const rows = [];

for (const path of staticUrls) {
    rows.push(createUrl(siteUrl + path));
    seen.add(siteUrl + path);
}

for (const article of articles) {
    if (!article.slug) continue;
    const loc = `${siteUrl}/news/${encodeURIComponent(article.slug)}/`;
    if (seen.has(loc)) continue;
    rows.push(createUrl(loc, article.updated_at || article.published_at));
    seen.add(loc);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
await fs.writeFile(sitemapPath, xml, "utf8");

console.log(`Generated sitemap.xml with ${rows.length} URLs.`);

function createUrl(loc, lastmod) {
    const lastmodTag = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : "";
    return `  <url><loc>${escapeXml(loc)}</loc>${lastmodTag}</url>`;
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
