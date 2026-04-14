import { useState } from "react";
import { supabase } from "../lib/supabase";
import { submitChecklistCompletion, approveChecklistItem, type ChecklistItem } from "../lib/projects-api";
import { FileUpload } from "./file-upload";
import { useAuthStore } from "../context/auth-store";

interface Props {
  checklist: ChecklistItem[];
  projectId: string;
  artistId: string;
  targetDate?: string;
  onRefresh: () => void;
}

type Filter = "all" | "pending" | "submitted" | "approved" | "rejected";

const GROUP_ICONS: Record<string, string> = {
  "Pre-Production": "🎯",
  "Production": "🎛️",
  "Legal & Admin": "📋",
  "Artwork & Assets": "🎨",
  "Metadata": "📝",
  "Distribution": "🚀",
  "Marketing": "📣",
  "Post-Release": "📊",
};

const STATUS_CONFIG = {
  pending:   { label: "Not Started",       color: "bg-slate-100 text-slate-500",  dot: "bg-slate-300" },
  submitted: { label: "Pending Approval",  color: "bg-amber-100 text-amber-700",  dot: "bg-amber-400" },
  approved:  { label: "Approved",          color: "bg-green-100 text-green-700",  dot: "bg-green-500" },
  rejected:  { label: "Rejected",          color: "bg-red-100 text-red-600",      dot: "bg-red-400"   },
};

export function ReleaseChecklist({ checklist, projectId, artistId, targetDate, onRefresh }: Props) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const canSubmit = user?.role === "admin" || user?.role === "manager";

  const [filter, setFilter] = useState<Filter>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [submitNotes, setSubmitNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string }[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // Group items
  const groups = checklist.reduce((acc, item) => {
    const g = (item as any).group_name ?? "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const getStatus = (item: ChecklistItem) =>
    (item.checklist_completions?.[0]?.approval_status ?? "pending") as keyof typeof STATUS_CONFIG;

  const filtered = (items: ChecklistItem[]) =>
    filter === "all" ? items : items.filter((i) => getStatus(i) === filter);

  const groupProgress = (items: ChecklistItem[]) => {
    const approved = items.filter((i) => getStatus(i) === "approved").length;
    return { approved, total: items.length, pct: items.length ? Math.round((approved / items.length) * 100) : 0 };
  };

  const totalProgress = groupProgress(checklist);
  const pendingApprovalCount = checklist.filter((i) => getStatus(i) === "submitted").length;
  const rejectedCount = checklist.filter((i) => getStatus(i) === "rejected").length;

  const toggleGroup = (g: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const handleSubmit = async (item: ChecklistItem) => {
    setSubmittingId(item.id);
    await submitChecklistCompletion(item.id, {
      notes: submitNotes,
      fileUrls: uploadedFiles.map((f) => f.url),
      fileNames: uploadedFiles.map((f) => f.name),
    });
    setSubmittingId(null);
    setExpandedItem(null);
    setSubmitNotes("");
    setUploadedFiles([]);
    onRefresh();
  };

  const handleMarkComplete = async (item: ChecklistItem) => {
    // For items with no deliverable — just mark as submitted then auto-approve
    await submitChecklistCompletion(item.id, { notes: "Marked complete" });
    const updated = await supabase.from("checklist_completions").select("id").eq("checklist_id", item.id).single();
    if (updated.data?.id) await approveChecklistItem(updated.data.id, true);
    onRefresh();
  };

  const handleApprove = async (item: ChecklistItem) => {
    const completion = item.checklist_completions?.[0];
    if (!completion) return;
    await approveChecklistItem(completion.id, true);
    onRefresh();
  };

  const handleReject = async (item: ChecklistItem) => {
    const completion = item.checklist_completions?.[0];
    if (!completion || !rejectReason) return;
    await approveChecklistItem(completion.id, false, rejectReason);
    setRejectingId(null);
    setRejectReason("");
    onRefresh();
  };

  const dueDateLabel = (offsetDays?: number | null) => {
    if (offsetDays === undefined || offsetDays === null || !targetDate) return null;
    const d = new Date(targetDate);
    d.setDate(d.getDate() + offsetDays);
    const diff = Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    if (diff < 0) return <span className="text-red-500 font-medium">⚠️ Overdue ({label})</span>;
    if (diff <= 3) return <span className="text-amber-600 font-medium">🔥 Due {label} ({diff}d)</span>;
    return <span className="text-slate-500">📅 Due {label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-slate-500">Overall Progress</p>
          <p className="mt-1 text-xl font-bold text-slate-800">{totalProgress.pct}%</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${totalProgress.pct}%` }} />
          </div>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-slate-500">Approved</p>
          <p className="mt-1 text-xl font-bold text-green-600">{totalProgress.approved}</p>
        </div>
        <div className={`rounded-xl border p-3 ${pendingApprovalCount > 0 ? "bg-amber-50 border-amber-200" : "bg-white"}`}>
          <p className="text-xs text-slate-500">Pending Approval</p>
          <p className={`mt-1 text-xl font-bold ${pendingApprovalCount > 0 ? "text-amber-600" : "text-slate-400"}`}>{pendingApprovalCount}</p>
        </div>
        <div className={`rounded-xl border p-3 ${rejectedCount > 0 ? "bg-red-50 border-red-200" : "bg-white"}`}>
          <p className="text-xs text-slate-500">Rejected</p>
          <p className={`mt-1 text-xl font-bold ${rejectedCount > 0 ? "text-red-600" : "text-slate-400"}`}>{rejectedCount}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "submitted", "approved", "rejected"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              filter === f ? "bg-slate-900 text-white" : "bg-white border text-slate-500 hover:text-slate-800"
            }`}>
            {f === "all" ? `All (${checklist.length})` :
             f === "submitted" ? `Pending (${checklist.filter(i => getStatus(i) === "submitted").length})` :
             `${f.charAt(0).toUpperCase() + f.slice(1)} (${checklist.filter(i => getStatus(i) === f).length})`}
          </button>
        ))}
      </div>

      {/* Groups */}
      {Object.entries(groups).map(([groupName, items]) => {
        const visibleItems = filtered(items);
        if (visibleItems.length === 0 && filter !== "all") return null;
        const gp = groupProgress(items);
        const isCollapsed = collapsedGroups.has(groupName);
        const pendingInGroup = items.filter((i) => getStatus(i) === "submitted").length;

        return (
          <div key={groupName} className="overflow-hidden rounded-xl border bg-white">
            {/* Group header */}
            <button onClick={() => toggleGroup(groupName)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50 transition">
              <div className="flex items-center gap-3">
                <span className="text-lg">{GROUP_ICONS[groupName] ?? "📌"}</span>
                <div className="text-left">
                  <p className="font-semibold text-slate-800">{groupName}</p>
                  <p className="text-xs text-slate-500">{gp.approved}/{gp.total} completed</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {pendingInGroup > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    ⏳ {pendingInGroup} pending
                  </span>
                )}
                <div className="w-20">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${gp.pct}%` }} />
                  </div>
                  <p className="mt-0.5 text-right text-xs text-slate-400">{gp.pct}%</p>
                </div>
                <span className="text-slate-300 text-sm">{isCollapsed ? "▶" : "▾"}</span>
              </div>
            </button>

            {/* Items */}
            {!isCollapsed && (
              <div className="divide-y border-t">
                {(filter === "all" ? items : visibleItems).map((item) => {
                  const status = getStatus(item);
                  const completion = item.checklist_completions?.[0];
                  const cfg = STATUS_CONFIG[status];
                  const isExpanded = expandedItem === item.id;
                  const isRejecting = rejectingId === item.id;
                  const hasDeliverable = (item as any).has_deliverable !== false;
                  const dueOffset = (item as any).due_offset_days;

                  return (
                    <div key={item.id} className={`transition ${
                      status === "approved" ? "bg-green-50/40" :
                      status === "rejected" ? "bg-red-50/40" :
                      status === "submitted" ? "bg-amber-50/40" : ""
                    }`}>
                      {/* Item row */}
                      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}>
                        {/* Status dot */}
                        <div className={`h-3 w-3 flex-shrink-0 rounded-full ${cfg.dot}`} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-medium text-sm ${status === "approved" ? "line-through text-slate-400" : ""}`}>
                              {item.item_name}
                            </p>
                            {item.required && <span className="text-xs text-red-500 font-medium">Required</span>}
                            {!hasDeliverable && <span className="text-xs text-slate-400 bg-slate-100 rounded px-1.5">No file needed</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-3 text-xs">
                            <span className={`rounded-full px-2 py-0.5 ${cfg.color}`}>{cfg.label}</span>
                            {(item as any).assignee_role && <span className="text-slate-500">👤 {(item as any).assignee_role}</span>}
                            {(item as any).approver_role && <span className="text-slate-500">✅ Approver: {(item as any).approver_role}</span>}
                            {dueDateLabel(dueOffset)}
                            {(completion?.file_names?.length ?? 0) > 0 && (
                              <span className="text-blue-600">📎 {completion!.file_names.length} file{completion!.file_names.length > 1 ? "s" : ""}</span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {/* Mark complete (no deliverable) */}
                          {!hasDeliverable && status === "pending" && canSubmit && (
                            <button onClick={() => handleMarkComplete(item)}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                              ✓ Mark Done
                            </button>
                          )}
                          {/* Submit for approval */}
                          {hasDeliverable && status !== "approved" && status !== "submitted" && canSubmit && (
                            <button onClick={() => setExpandedItem(item.id)}
                              className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">
                              Submit ↑
                            </button>
                          )}
                          {/* Admin approve/reject */}
                          {isAdmin && status === "submitted" && (
                            <>
                              <button onClick={() => handleApprove(item)}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                                ✓ Approve
                              </button>
                              <button onClick={() => { setRejectingId(item.id); setExpandedItem(item.id); }}
                                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600">
                                ✗ Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded panel */}
                      {isExpanded && (
                        <div className="border-t bg-white px-5 py-4 space-y-3">
                          {/* Rejection notice */}
                          {status === "rejected" && completion?.rejection_reason && (
                            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                              <span>❌</span>
                              <div>
                                <p className="font-medium">Rejected</p>
                                <p>{completion.rejection_reason}</p>
                              </div>
                            </div>
                          )}

                          {/* Existing files */}
                          {(completion?.file_names?.length ?? 0) > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-slate-600">Uploaded Files</p>
                              <div className="flex flex-wrap gap-2">
                                {completion!.file_names.map((name, i) => (
                                  <a key={i} href={completion!.file_urls[i]} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 rounded-lg border bg-slate-50 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50">
                                    {name.match(/\.(mp3|wav|flac)$/i) ? "🎵" :
                                     name.match(/\.(jpg|jpeg|png)$/i) ? "🖼️" :
                                     name.match(/\.pdf$/i) ? "📄" : "📎"} {name}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {completion?.notes && (
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                              💬 {completion.notes}
                            </div>
                          )}

                          {/* Submit form */}
                          {canSubmit && status !== "approved" && !isRejecting && hasDeliverable && (
                            <div className="space-y-2 pt-2 border-t">
                              <FileUpload artistId={artistId} onUploaded={(url, name) =>
                                setUploadedFiles((f) => [...f, { url, name }])} />
                              {uploadedFiles.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {uploadedFiles.map((f, i) => (
                                    <div key={i} className="flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700">
                                      ✅ {f.name}
                                      <button onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))} className="ml-1 text-green-500 hover:text-red-500">×</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <textarea value={submitNotes} rows={2}
                                onChange={(e) => setSubmitNotes(e.target.value)}
                                placeholder="Add a note to your submission…"
                                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
                              <button onClick={() => handleSubmit(item)} disabled={submittingId === item.id}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                                {submittingId === item.id ? "Submitting…" : "Request Approval ↑"}
                              </button>
                            </div>
                          )}

                          {/* Reject form */}
                          {isRejecting && isAdmin && (
                            <div className="space-y-2 pt-2 border-t">
                              <p className="text-sm font-medium text-red-600">Reason for rejection:</p>
                              <textarea value={rejectReason} rows={2}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="e.g. Mood board missing. Please add visual direction."
                                className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
                              <div className="flex gap-2">
                                <button onClick={() => handleReject(item)} disabled={!rejectReason}
                                  className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50">
                                  Confirm Rejection
                                </button>
                                <button onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                  className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
