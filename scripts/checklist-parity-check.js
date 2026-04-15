#!/usr/bin/env node
/*
  Checklist parity verifier (legacy vs aligned model)
  Usage:
    node scripts/checklist-parity-check.js
  Requires env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
*/

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function fetchCount(table) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function run() {
  const legacyChecklist = await fetchCount("project_checklists");
  const newChecklist = await fetchCount("checklist_items");
  const legacyCompletions = await fetchCount("checklist_completions");
  const newSubmissions = await fetchCount("checklist_submissions");

  const checklistDelta = legacyChecklist - newChecklist;
  const completionDelta = legacyCompletions - newSubmissions;

  const report = {
    legacyChecklist,
    newChecklist,
    checklistDelta,
    legacyCompletions,
    newSubmissions,
    completionDelta,
    ok: checklistDelta === 0 && completionDelta === 0,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) process.exit(2);
}

run().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
