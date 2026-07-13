import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { smajEnv } from "./env-module.js";

export const newsImagesBucket = "news-images";
export const supabaseConfig = {
    url: smajEnv.SUPABASE_URL,
    publishableKey: smajEnv.SUPABASE_PUBLISHABLE_KEY,
    applicationTable: smajEnv.SUPABASE_APPLICATION_TABLE || "application",
    newsTable: smajEnv.SUPABASE_NEWS_TABLE || "news_articles"
};

if (!supabaseConfig.url || !supabaseConfig.publishableKey) {
    throw new Error("Supabase configuration is missing. Check assets/js/env.js.");
}

export const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.publishableKey);

let projectReference = "unknown";
try {
    projectReference = new URL(supabaseConfig.url).hostname.split(".")[0] || "unknown";
} catch (error) {
    console.error("[SMAJ Supabase] Invalid SUPABASE_URL.", error);
}

console.info("[SMAJ Supabase] SUPABASE_URL:", supabaseConfig.url);
console.info("[SMAJ Supabase] Project reference:", projectReference);
console.info("[SMAJ Supabase] Upload bucket:", newsImagesBucket);
