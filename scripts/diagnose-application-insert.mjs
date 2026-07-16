/**
 * Test public.application through the same anonymous REST path used by Supabase JS.
 * A successful run creates one diagnostic row and prints its application ID.
 *
 * Usage: node scripts/diagnose-application-insert.mjs
 * Optional: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node ...
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const browserEnvironment = fs.readFileSync(
    path.join(projectDirectory, "assets", "js", "env.js"),
    "utf8"
);

function readBrowserSetting(name) {
    const match = browserEnvironment.match(new RegExp(`${name}:\\s*["']([^"']+)["']`));
    return match?.[1] || "";
}

const supabaseUrl = process.env.SUPABASE_URL || readBrowserSetting("SUPABASE_URL");
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
    || readBrowserSetting("SUPABASE_PUBLISHABLE_KEY");

if (!supabaseUrl || !publishableKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.");
}

const timestamp = new Date().toISOString();
const applicationId = `SMAJ-DIAGNOSTIC-${Date.now()}`;
const editToken = crypto.randomUUID().replaceAll("-", "");
const application = {
    application_id: applicationId,
    application_type: "builder",
    applicant_name: "RLS Diagnostic Test",
    applicant_email: "diagnostic-test@smaj.org",
    phone: "diagnostic-test",
    country: "Diagnostic",
    edit_token: editToken,
    edit_link: `https://smaj.org/edit-application/?id=${encodeURIComponent(applicationId)}&token=${editToken}`,
    status: "pending",
    data: {
        applicant_name: "RLS Diagnostic Test",
        applicant_email: "diagnostic-test@smaj.org",
        submitted_at: timestamp,
        updated_at: timestamp,
        diagnostic: true
    },
    files: []
};

const response = await fetch(`${supabaseUrl}/rest/v1/application`, {
    method: "POST",
    headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
    },
    body: JSON.stringify(application)
});

const responseText = await response.text();
let responseBody = responseText;
try {
    responseBody = responseText ? JSON.parse(responseText) : null;
} catch {
    // Preserve non-JSON error bodies verbatim.
}

const diagnostic = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    applicationId,
    requestTable: "public.application",
    response: responseBody,
    responseHeaders: Object.fromEntries(response.headers.entries())
};

if (!response.ok) {
    console.error("Anonymous application insert failed:", diagnostic);
    process.exitCode = 1;
} else {
    console.log("Anonymous application insert succeeded:", diagnostic);
}
