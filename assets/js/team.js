import { supabaseClient } from "./supabase-client.js";

const socialIcons = {
    linkedin: "bxl-linkedin", github: "bxl-github", facebook: "bxl-facebook",
    instagram: "bxl-instagram", telegram: "bxl-telegram", tiktok: "bxl-tiktok",
    youtube: "bxl-youtube"
};

document.addEventListener("DOMContentLoaded", loadPublishedTeam);

async function loadPublishedTeam() {
    const container = document.querySelector("[data-team-members]");
    if (!container) return;

    const { data, error } = await supabaseClient
        .from("team_members")
        .select("full_name, job_title, biography, photo_url, email, skills, social_links, display_order")
        .eq("is_published", true)
        .order("display_order", { ascending: true })
        .order("full_name", { ascending: true });

    if (error) {
        console.error("Published team load failed:", error);
        // Keep the server-rendered team cards as a deployment-safe fallback.
        return;
    }

    if (!data?.length) {
        container.innerHTML = '<p class="team-load-message">New team profiles will be published soon.</p>';
        return;
    }

    container.replaceChildren(...data.map(createMemberCard));
}

function createMemberCard(member, index) {
    const card = document.createElement("article");
    card.className = "team-member";

    const imageBox = document.createElement("div");
    imageBox.className = member.photo_url ? "team-image" : "team-image team-image-placeholder";
    if (member.photo_url) {
        const image = document.createElement("img");
        image.src = member.photo_url;
        image.alt = member.full_name;
        image.loading = "lazy";
        imageBox.append(image);
    } else {
        const icon = document.createElement("i");
        icon.className = "bx bx-user";
        imageBox.append(icon);
    }

    const name = document.createElement("h4");
    name.textContent = member.full_name;
    const role = document.createElement("p");
    role.className = "team-role";
    role.textContent = member.job_title;
    const biography = document.createElement("p");
    biography.className = "team-description";
    biography.textContent = member.biography;
    card.append(imageBox, name, role, biography);

    if (member.skills?.length) {
        const skills = document.createElement("div");
        skills.className = "team-focus";
        skills.setAttribute("aria-label", `${member.full_name} skills and focus areas`);
        member.skills.forEach(value => { const tag = document.createElement("span"); tag.textContent = value; skills.append(tag); });
        card.append(skills);
    }

    const socials = createSocialLinks(member);
    if (socials.childElementCount) card.append(socials);
    return card;
}

function createSocialLinks(member) {
    const wrapper = document.createElement("div");
    wrapper.className = "team-social";
    if (member.email) wrapper.append(createLink(`mailto:${member.email}`, "email", member.full_name, "bx-envelope"));
    Object.entries(member.social_links || {}).forEach(([network, url]) => {
        const safeUrl = getSafeExternalUrl(url);
        if (!safeUrl) return;
        wrapper.append(createLink(safeUrl, network, member.full_name, socialIcons[network]));
    });
    return wrapper;
}

function createLink(url, network, name, iconName) {
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("aria-label", `${name} on ${network === "x" ? "X" : network}`);
    if (!url.startsWith("mailto:")) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    if (network === "x") { const mark = document.createElement("span"); mark.className = "social-x-mark"; mark.textContent = "X"; link.append(mark); }
    else { const icon = document.createElement("i"); icon.className = `bx ${iconName || "bx-link-external"}`; link.append(icon); }
    return link;
}

function getSafeExternalUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
}
