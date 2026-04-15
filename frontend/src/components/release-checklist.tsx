import { useState } from "react";
import { supabase } from "../lib/supabase";
import {
  submitChecklistCompletion,
  approveChecklistItem,
  updateChecklistItem,
  createChecklistItem,
  archiveChecklistItem,
  restoreChecklistItem,
  type ChecklistItem,
} from "../lib/projects-api";
import { FileUpload } from "./file-upload";
import { useAuthStore } from "../context/auth-store";

interface Props {
  checklist: ChecklistItem[];
  projectId: string;
  artistId: string;
  targetDate?: string;
  teamMembers: Array<{ id: string; full_name: string; role: string }>;
  onRefresh: () => void;
}

type Filter = "all" | "pending" | "submitted" | "approved" | "rejected";
const DELIVERABLE_TYPES = ["audio", "artwork", "document", "video", "link", "none", "custom"] as const;

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

const DELIVERABLE_SPEC: Record<string, { label: string; accept: string; hint: string }> = {
  "Brief & Concept Approval": {
    label: "Upload Written Brief + Mood Board",
    accept: ".pdf,.doc,.docx,.txt",
    hint: "Required: Written brief and mood board (PDF/Doc)"
  },
  "Recording Session Booked": {
    label: "Upload Studio Booking Confirmation",
    accept: ".pdf,.jpg,.jpeg,.png",
    hint: "Required: booking confirmation screenshot/email"
  },
  "Rough Mix Delivered": {
    label: "Upload Rough Mix Audio",
    accept: ".wav,.mp3",
    hint: "Required: rough mix audio file (WAV/MP3)"
  },
  "Final Mix Approved": {
    label: "Upload Final Mix + Notes",
    accept: ".wav,.mp3,.pdf,.doc,.docx",
    hint: "Required: final mix audio + mix notes document"
  },
  "Mastering Complete": {
    label: "Upload Mastered WAV + Metering Report",
    accept: ".wav,.pdf,.doc,.docx",
    hint: "Required: mastered WAV and metering report"
  },
  "Final Master WAV Delivered": {
    label: "Upload Final 24-bit Master WAV",
    accept: ".wav",
    hint: "Required: final 24-bit WAV master"
  },
  "Split Sheets Signed": {
    label: "Upload Signed Split Sheets",
    accept: ".pdf",
    hint: "Required: signed split sheets (PDF)"
  },
  "Publishing Registration": {
    label: "Upload Publishing Registration Proof",
    accept: ".pdf,.jpg,.jpeg,.png",
    hint: "Required: registration confirmation email/screenshot"
  },
  "Front Cover Artwork (3000x3000 300dpi)": {
    label: "Upload Front Cover Artwork",
    accept: ".jpg,.jpeg,.png",
    hint: "Required: 3000x3000 JPG/PNG at 300dpi"
  },
  "Back Cover & Spine": {
    label: "Upload Back Cover + Spine",
    accept: ".pdf,.jpg,.jpeg,.png",
    hint: "Deliverable: back cover and spine design"
  },
  "Artist Bio Updated": {
    label: "Upload Updated Artist Bio",
    accept: ".txt,.doc,.docx,.pdf",
    hint: "Required: updated artist bio text"
  },
  "Metadata Sheet Complete (ISRC, BPM, Key, Genre)": {
    label: "Upload Metadata Sheet",
    accept: ".csv,.xlsx,.xls,.pdf",
    hint: "Required: metadata sheet (ISRC, BPM, Key, Genre)"
  },
  "Lyrics Proofread & Approved": {
    label: "Upload Approved Lyrics",
    accept: ".txt,.doc,.docx,.pdf",
    hint: "Required: proofread lyrics file"
  },
  "Distributor Account Ready": {
    label: "Upload Distributor Account Proof",
    accept: ".jpg,.jpeg,.png,.pdf",
    hint: "Required: screenshot of active distributor account"
  },
  "Distribution Submission": {
    label: "Upload Distribution Confirmation",
    accept: ".pdf,.txt,.doc,.docx,.jpg,.jpeg,.png",
    hint: "Required: distribution confirmation ID/screenshot"
  },
  "Pre-Save Link Created": {
    label: "Upload/Enter Pre-Save Link Proof",
    accept: ".txt,.doc,.docx,.pdf",
    hint: "Required: URL or screenshot of pre-save link"
  },
  "Social Media Content Calendar": {
    label: "Upload Content Calendar",
    accept: ".xlsx,.xls,.csv,.pdf,.txt,.doc,.docx",
    hint: "Required: content calendar (Notion/Sheet export)"
  },
  "Press Release Written": {
    label: "Upload Press Release",
    accept: ".doc,.docx,.pdf",
    hint: "Required: final press release document"
  },
  "Playlist Pitching Submitted": {
    label: "Upload Pitching Evidence",
    accept: ".csv,.xlsx,.xls,.pdf,.txt,.doc,.docx",
    hint: "Required: list of curators pitched"
  },
  "Music Video / Visualizer": {
    label: "Upload Video/Visualizer Link Proof",
    accept: ".txt,.doc,.docx,.pdf,.jpg,.jpeg,.png,.mp4",
    hint: "Deliverable: YouTube link, SupaStorage link, or video file"
  },
  "Post-Release Performance Report": {
    label: "Upload Performance Report",
    accept: ".pdf,.xlsx,.xls,.csv,.doc,.docx",
    hint: "Required: report with streaming and performance stats"
  },
};

const STATUS_CONFIG = {
  pending:   { label: "Not Started",       color: "bg-slate-100 text-slate-500",  dot: "bg-slate-300" },
  submitted: { label: "Pending Approval",  color: "bg-amber-100 text-amber-700",  dot: "bg-amber-400" },
  approved:  { label: "Approved",          color: "bg-green-100 text-green-700",  dot: "bg-green-500" },
  rejected:  { label: "Rejected",          color: "bg-red-100 text-red-600",      dot: "bg-red-400"   },
};

export function ReleaseChecklist({ checklist, projectId, artistId, targetDate, teamMembers, onRefresh }: Props) {
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
  const [showArchived, setShowArchived] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingTask, setEditingTask] = useState<ChecklistItem | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState("");
  const [editForm, setEditForm] = useState({
    item_name: "",
    description: "",
    group_name: "General",
    assignee_role: "",
    assigned_to: "",
    required: true,
    due_offset_days: "",
    deliverable_type: "document",
    deliverable_custom: "",
  });

  const activeChecklist = checklist.filter((i: any) => !i.archived_at);
  const archivedChecklist = checklist.filter((i: any) => !!i.archived_at);

  // Group items
  const groups = activeChecklist.reduce((acc, item) => {
    const g = (item as any).group_name ?? "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const archivedGroups = archivedChecklist.reduce((acc, item) => {
    const g = (item as any).group_name ?? "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const getCompletion = (item: ChecklistItem) => {
    const c: any = (item as any).checklist_completions;
    if (!c) return undefined;
    return Array.isArray(c) ? c[0] : c;
  };

  const getStatus = (item: ChecklistItem) =>
    (getCompletion(item)?.approval_status ?? "pending") as keyof typeof STATUS_CONFIG;

  const filtered = (items: ChecklistItem[]) =>
    filter === "all" ? items : items.filter((i) => getStatus(i) === filter);

  const groupProgress = (items: ChecklistItem[]) => {
    const approved = items.filter((i) => getStatus(i) === "approved").length;
    return { approved, total: items.length, pct: items.length ? Math.round((approved / items.length) * 100) : 0 };
  };

  const totalProgress = groupProgress(activeChecklist);
  const pendingApprovalCount = activeChecklist.filter((i) => getStatus(i) === "submitted").length;
  const rejectedCount = activeChecklist.filter((i) => getStatus(i) === "rejected").length;

  const toggleGroup = (g: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const handleSubmit = async (item: ChecklistItem) => {
    setSubmittingId(item.id);
    let submitOk = false;
    try {
      await submitChecklistCompletion(item.id, {
        notes: submitNotes,
        fileUrls: uploadedFiles.map((f) => f.url),
        fileNames: uploadedFiles.map((f) => f.name),
      });
      submitOk = true;

      // Mirror checklist submission as task update/creation (non-blocking)
      try {
        const { data: existingTask } = await supabase
          .from("tasks")
          .select("id")
          .eq("project_id", projectId)
          .eq("title", item.item_name)
          .maybeSingle();

        const dueDate = dueDateFromOffset((item as any).due_offset_days, targetDate);
        const assignedTo = (item as any).assigned_to || null;

        if (existingTask?.id) {
          await supabase.from("tasks").update({
            due_date: dueDate,
            assigned_to: assignedTo,
            completed: false,
            completed_at: null,
          }).eq("id", existingTask.id);
        } else {
          const { data: currentUser } = await supabase.auth.getUser();
          await supabase.from("tasks").insert({
            project_id: projectId,
            artist_id: artistId,
            title: item.item_name,
            description: item.description || null,
            due_date: dueDate,
            assigned_to: assignedTo,
            completed: false,
            created_by: currentUser.user?.id ?? null,
          });
        }
      } catch (mirrorErr) {
        console.error("Task mirror failed (submission still saved):", mirrorErr);
      }

      setExpandedItem(null);
      setSubmitNotes("");
      setUploadedFiles([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      await onRefresh();
      setSubmittingId(null);
      if (submitOk) {
        alert("Submitted successfully. Status should now show 'Pending Approval'.");
      }
    }
  };

  const handleMarkComplete = async (item: ChecklistItem) => {
    // For items with no deliverable — mark submitted then auto-approve
    await submitChecklistCompletion(item.id, { notes: "Marked complete" });
    const updated = await supabase
      .from("checklist_completions")
      .select("id")
      .eq("checklist_id", item.id)
      .maybeSingle();

    if (updated.data?.id) {
      await approveChecklistItem(updated.data.id, true);
    }

    // Mirror checklist item as a completed task
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("project_id", projectId)
      .eq("title", item.item_name)
      .maybeSingle();

    if (existingTask?.id) {
      await supabase.from("tasks").update({
        completed: true,
        completed_at: new Date().toISOString(),
      }).eq("id", existingTask.id);
    } else {
      const dueDate = dueDateFromOffset((item as any).due_offset_days, targetDate);
      const { data: currentUser } = await supabase.auth.getUser();
      await supabase.from("tasks").insert({
        project_id: projectId,
        artist_id: artistId,
        title: item.item_name,
        due_date: dueDate,
        completed: true,
        completed_at: new Date().toISOString(),
        created_by: currentUser.user?.id ?? null,
      });
    }

    await onRefresh();
    alert("Marked complete.");
  };

  const handleAssignChecklistItem = async (item: ChecklistItem, userId: string) => {
    await updateChecklistAssignment(item, userId || null);

    // Create or update mirrored task
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("project_id", projectId)
      .eq("title", item.item_name)
      .maybeSingle();

    if (existingTask?.id) {
      await supabase.from("tasks").update({
        assigned_to: userId || null,
      }).eq("id", existingTask.id);
    } else {
      const { data: currentUser } = await supabase.auth.getUser();
      const dueDate = dueDateFromOffset((item as any).due_offset_days, targetDate);
      await supabase.from("tasks").insert({
        project_id: projectId,
        artist_id: artistId,
        title: item.item_name,
        description: item.description || null,
        due_date: dueDate,
        assigned_to: userId || null,
        completed: false,
        created_by: currentUser.user?.id,
      });
    }

    onRefresh();
  };

  const updateChecklistAssignment = async (item: ChecklistItem, userId: string | null) => {
    await supabase.from("project_checklists").update({
      assigned_to: userId,
      assignee_role: userId ? (teamMembers.find((u) => u.id === userId)?.role ?? item.assignee_role) : null,
    }).eq("id", item.id);
  };

  const handleApprove = async (item: ChecklistItem) => {
    const completion = getCompletion(item);
    if (!completion) return;
    await approveChecklistItem(completion.id, true);
    onRefresh();
  };

  const handleReject = async (item: ChecklistItem) => {
    const completion = getCompletion(item);
    if (!completion || !rejectReason) return;
    await approveChecklistItem(completion.id, false, rejectReason);
    setRejectingId(null);
    setRejectReason("");
    onRefresh();
  };

  const dueDateFromOffset = (offsetDays?: number | null, target?: string) => {
    if (offsetDays === undefined || offsetDays === null || !target) return null;
    const d = new Date(target);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
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

  const handleArchive = async (item: ChecklistItem) => {
    if (!canSubmit) return;
    if (!confirm(`Archive "${item.item_name}"? You can restore it later from Archive.`)) return;
    await archiveChecklistItem(item.id);
    await onRefresh();
  };

  const handleRestore = async (item: ChecklistItem) => {
    if (!canSubmit) return;
    await restoreChecklistItem(item.id);
    await onRefresh();
  };

  const handleQuickEdit = async (item: ChecklistItem, updates: Partial<ChecklistItem>) => {
    await updateChecklistItem(item.id, updates);
    await onRefresh();
  };

  const openEditModal = (item: ChecklistItem) => {
    setEditingTask(item);
    setEditForm({
      item_name: item.item_name ?? "",
      description: (item as any).description ?? "",
      group_name: (item as any).group_name ?? "General",
      assignee_role: (item as any).assignee_role ?? "",
      assigned_to: String((item as any).assigned_to ?? ""),
      required: Boolean((item as any).required ?? true),
      due_offset_days: (item as any).due_offset_days === null || (item as any).due_offset_days === undefined ? "" : String((item as any).due_offset_days),
      deliverable_type: String((item as any).deliverable_type ?? ((item as any).has_deliverable === false ? "none" : "document")),
      deliverable_custom: String((item as any).deliverable_custom ?? ""),
    });
  };

  const saveEditModal = async () => {
    if (!editingTask) return;
    const name = editForm.item_name.trim();
    if (!name) {
      alert("Task name is required.");
      return;
    }
    if (editForm.deliverable_type === "custom" && !editForm.deliverable_custom.trim()) {
      alert("Please enter a custom deliverable type.");
      return;
    }

    await updateChecklistItem(editingTask.id, {
      item_name: name,
      description: editForm.description.trim() || null,
      group_name: editForm.group_name.trim() || "General",
      assignee_role: editForm.assignee_role.trim() || null,
      assigned_to: editForm.assigned_to || null,
      required: editForm.required,
      due_offset_days: editForm.due_offset_days === "" ? null : Number(editForm.due_offset_days),
      deliverable_type: editForm.deliverable_type,
      deliverable_custom: editForm.deliverable_type === "custom" ? (editForm.deliverable_custom.trim() || null) : null,
      has_deliverable: editForm.deliverable_type !== "none",
    } as any);

    setEditingTask(null);
    await onRefresh();
  };

  const handleCreateTask = async (groupName: string) => {
    const groupItems = groups[groupName] ?? [];
    const maxPos = groupItems.length ? Math.max(...groupItems.map((i: any) => Number(i.position ?? 0))) : 0;
    await createChecklistItem({
      project_id: projectId,
      item_name: "New Checklist Task",
      group_name: groupName,
      required: true,
      has_deliverable: true,
      deliverable_type: "document",
      position: maxPos + 1,
    });
    await onRefresh();
  };

  const handleCreateGroup = async () => {
    const g = newGroupName.trim();
    if (!g) return;
    await createChecklistItem({
      project_id: projectId,
      item_name: "New Checklist Task",
      group_name: g,
      required: true,
      has_deliverable: true,
      deliverable_type: "document",
      position: 0,
    });
    setNewGroupName("");
    await onRefresh();
  };

  const handleRenameGroup = async (from: string, to: string) => {
    const next = to.trim();
    if (!next || next === from) {
      setRenamingGroup(null);
      setRenameGroupValue("");
      return;
    }
    const items = groups[from] ?? [];
    await Promise.all(items.map((it) => updateChecklistItem(it.id, { group_name: next })));
    setRenamingGroup(null);
    setRenameGroupValue("");
    await onRefresh();
  };

  const handleArchiveGroup = async (groupName: string) => {
    if (!canSubmit) return;
    const items = groups[groupName] ?? [];
    if (!items.length) return;
    if (!confirm(`Archive category "${groupName}" and all ${items.length} task(s)? You can restore them from Archive.`)) return;
    await Promise.all(items.map((it) => archiveChecklistItem(it.id)));
    await onRefresh();
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
            {f === "all" ? `All (${activeChecklist.length})` :
             f === "submitted" ? `Pending (${activeChecklist.filter(i => getStatus(i) === "submitted").length})` :
             `${f.charAt(0).toUpperCase() + f.slice(1)} (${activeChecklist.filter(i => getStatus(i) === f).length})`}
          </button>
        ))}
      </div>

      {canSubmit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New category name"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <button onClick={handleCreateGroup} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700">
            + Add Category
          </button>
          <button onClick={() => setShowArchived((v) => !v)} className="rounded-lg border px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
            {showArchived ? "Hide Archive" : `Show Archive (${archivedChecklist.length})`}
          </button>
        </div>
      )}

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
                  {renamingGroup === groupName ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={renameGroupValue}
                        onChange={(e) => setRenameGroupValue(e.target.value)}
                        className="rounded border px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => handleRenameGroup(groupName, renameGroupValue)}
                        className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >Save</button>
                      <button
                        onClick={() => { setRenamingGroup(null); setRenameGroupValue(""); }}
                        className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >Cancel</button>
                    </div>
                  ) : (
                    <p className="font-semibold text-slate-800">{groupName}</p>
                  )}
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
                {canSubmit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCreateTask(groupName); }}
                    className="rounded-lg border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    + Task
                  </button>
                )}
                {canSubmit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenamingGroup(groupName); setRenameGroupValue(groupName); }}
                    className="rounded-lg border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Rename
                  </button>
                )}
                {canSubmit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleArchiveGroup(groupName); }}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Archive List
                  </button>
                )}
                <span className="text-slate-300 text-sm">{isCollapsed ? "▶" : "▾"}</span>
              </div>
            </button>

            {/* Items */}
            {!isCollapsed && (
              <div className="divide-y border-t">
                {(filter === "all" ? items : visibleItems).map((item) => {
                  const status = getStatus(item);
                  const completion = getCompletion(item);
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
                            {(item as any).assigned_to ? (
                              <span className="text-slate-500">👤 {teamMembers.find((u) => u.id === (item as any).assigned_to)?.full_name ?? (item as any).assignee_role}</span>
                            ) : (
                              (item as any).assignee_role && <span className="text-slate-500">👤 {(item as any).assignee_role}</span>
                            )}
                            {(item as any).approver_role && <span className="text-slate-500">✅ Approver: {(item as any).approver_role}</span>}
                            {hasDeliverable ? (
                              <span className="text-indigo-600">📎 {(item as any).deliverable_type ? `${(item as any).deliverable_type}` : "Deliverable required"}{(item as any).deliverable_type === "custom" && (item as any).deliverable_custom ? `: ${(item as any).deliverable_custom}` : ""}</span>
                            ) : (
                              <span className="text-green-600">☑️ Checkbox only (no file)</span>
                            )}
                            {(completion?.file_names?.length ?? 0) > 0 && (
                              <span className="text-emerald-600 font-medium">✅ File uploaded</span>
                            )}
                            {dueDateLabel(dueOffset)}
                            {(completion?.file_names?.length ?? 0) > 0 && (
                              <span className="text-blue-600">📎 {completion!.file_names.length} file{completion!.file_names.length > 1 ? "s" : ""}</span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {/* Assign team member */}
                          {canSubmit && (
                            <select
                              value={String((item as any).assigned_to ?? "")}
                              onChange={(e) => handleAssignChecklistItem(item, e.target.value)}
                              className="rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300">
                              <option value="">Assign…</option>
                              {teamMembers.map((m) => (
                                <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>
                              ))}
                            </select>
                          )}
                          {canSubmit && (
                            <button
                              onClick={() => openEditModal(item)}
                              className="rounded-lg border px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          )}
                          {canSubmit && (
                            <button
                              onClick={() => handleArchive(item)}
                              className="rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                            >
                              Archive
                            </button>
                          )}
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
                                {(completion!.file_names as string[]).map((name: string, i: number) => (
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
                              <FileUpload
                                artistId={artistId}
                                label={DELIVERABLE_SPEC[item.item_name]?.label ?? "Upload Deliverable"}
                                accept={DELIVERABLE_SPEC[item.item_name]?.accept}
                                hint={DELIVERABLE_SPEC[item.item_name]?.hint ?? "Upload the required deliverable for this checklist item"}
                                onUploaded={(url, name) => setUploadedFiles((f) => [...f, { url, name }])}
                              />
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

      {showArchived && (
        <div className="rounded-xl border bg-white p-4">
          <h4 className="mb-2 font-semibold text-slate-800">Archived Tasks</h4>
          {Object.keys(archivedGroups).length === 0 && <p className="text-sm text-slate-400">No archived tasks.</p>}
          <div className="space-y-2">
            {Object.entries(archivedGroups).map(([groupName, items]) => (
              <div key={groupName} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">{groupName}</p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded border px-2 py-1.5">
                      <p className="text-sm text-slate-600">{item.item_name}</p>
                      {canSubmit && (
                        <button onClick={() => handleRestore(item)} className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Restore</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Edit Checklist Task</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Task name</label>
                <input value={editForm.item_name} onChange={(e) => setEditForm((p) => ({ ...p, item_name: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
                <input value={editForm.group_name} onChange={(e) => setEditForm((p) => ({ ...p, group_name: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Assigned user</label>
                <select value={editForm.assigned_to} onChange={(e) => setEditForm((p) => ({ ...p, assigned_to: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Assignee role</label>
                <input value={editForm.assignee_role} onChange={(e) => setEditForm((p) => ({ ...p, assignee_role: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="admin / manager / finance" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Due offset days</label>
                <input type="number" value={editForm.due_offset_days} onChange={(e) => setEditForm((p) => ({ ...p, due_offset_days: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Required</label>
                <select value={editForm.required ? "yes" : "no"} onChange={(e) => setEditForm((p) => ({ ...p, required: e.target.value === "yes" }))} className="w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="yes">Required</option>
                  <option value="no">Optional</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Deliverable type</label>
                <select value={editForm.deliverable_type} onChange={(e) => setEditForm((p) => ({ ...p, deliverable_type: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm">
                  {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {editForm.deliverable_type === "custom" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Custom deliverable</label>
                  <input value={editForm.deliverable_custom} onChange={(e) => setEditForm((p) => ({ ...p, deliverable_custom: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. stem package" />
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditingTask(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveEditModal} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
