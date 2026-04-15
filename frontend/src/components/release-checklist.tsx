import { useEffect, useMemo, useState } from "react";
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
  focusStatus?: Filter | null;
}

type Filter = "all" | "pending" | "submitted" | "approved" | "rejected";
type DisplayMode = "detailed" | "table" | "board";
type QuickFilter = "mine" | "overdue" | "requires_file" | "waiting_approval";
const DELIVERABLE_TYPES = ["audio", "artwork", "document", "video", "link", "none", "custom"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const PRIORITY_SCORE: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
const PRIORITY_PILL: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-red-100 text-red-700",
  urgent: "bg-fuchsia-100 text-fuchsia-700",
};

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

export function ReleaseChecklist({ checklist, projectId, artistId, targetDate, teamMembers, onRefresh, focusStatus }: Props) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const canSubmit = user?.role === "admin" || user?.role === "manager";

  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (focusStatus && ["all", "pending", "submitted", "approved", "rejected"].includes(focusStatus)) {
      setFilter(focusStatus as Filter);
    }
  }, [focusStatus]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [submitNotes, setSubmitNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string }[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("detailed");
  const [search, setSearch] = useState("");
  const [prioritySort, setPrioritySort] = useState(false);
  const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(new Set());
  const [editingTask, setEditingTask] = useState<ChecklistItem | null>(null);
  const [creatingGroupName, setCreatingGroupName] = useState<string | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [showSubmitModalFor, setShowSubmitModalFor] = useState<string | null>(null);
  const [showReviewModalFor, setShowReviewModalFor] = useState<string | null>(null);
  const [bulkCandidateMap, setBulkCandidateMap] = useState<Record<string, string>>({});
  const [digestSending, setDigestSending] = useState(false);
  const [digestMsg, setDigestMsg] = useState<string | null>(null);
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

  const matchesSearch = (item: ChecklistItem) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const completion = getCompletion(item);
    const title = String(item.item_name ?? "").toLowerCase();
    const notes = String(completion?.notes ?? "").toLowerCase();
    const files = (completion?.file_names ?? []).join(" ").toLowerCase();
    return title.includes(q) || notes.includes(q) || files.includes(q);
  };

  const isOverdue = (item: ChecklistItem) => {
    const dueOffset = (item as any).due_offset_days;
    if (dueOffset === undefined || dueOffset === null || !targetDate) return false;
    const d = new Date(targetDate);
    d.setDate(d.getDate() + dueOffset);
    return d.getTime() < Date.now() && getStatus(item) !== "approved";
  };

  const withQuickFilters = (item: ChecklistItem) => {
    if (quickFilters.size === 0) return true;
    const assignedToMe = quickFilters.has("mine") ? String((item as any).assigned_to ?? "") === String(user?.id ?? "") : true;
    const overdue = quickFilters.has("overdue") ? isOverdue(item) : true;
    const requiresFile = quickFilters.has("requires_file") ? (item as any).has_deliverable !== false : true;
    const waitingApproval = quickFilters.has("waiting_approval") ? getStatus(item) === "submitted" : true;
    return assignedToMe && overdue && requiresFile && waitingApproval;
  };

  const filtered = (items: ChecklistItem[]) => {
    const base = (filter === "all" ? items : items.filter((i) => getStatus(i) === filter))
      .filter(matchesSearch)
      .filter(withQuickFilters);

    if (!prioritySort) return base;
    return [...base].sort((a: any, b: any) => (PRIORITY_SCORE[String(b.priority ?? "low")] ?? 1) - (PRIORITY_SCORE[String(a.priority ?? "low")] ?? 1));
  };

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

  const moveBoardItem = async (item: ChecklistItem, target: "pending" | "submitted" | "approved" | "rejected") => {
    const completion = getCompletion(item);
    if (target === "pending") {
      await submitChecklistCompletion(item.id, { notes: completion?.notes ?? "Moved to To Do" });
      const updated = await supabase.from("checklist_completions").update({ approval_status: "pending", approver_id: null, approved_at: null, rejection_reason: null }).eq("checklist_id", item.id);
      if (updated.error) throw updated.error;
      await onRefresh();
      return;
    }

    if (target === "submitted") {
      await submitChecklistCompletion(item.id, {
        notes: completion?.notes ?? "Moved to Pending Approval",
        fileUrls: completion?.file_urls ?? [],
        fileNames: completion?.file_names ?? [],
      });
      await onRefresh();
      return;
    }

    if (!completion?.id) {
      await submitChecklistCompletion(item.id, { notes: "Auto-created before board move" });
      await onRefresh();
      return;
    }

    if (target === "approved") {
      await approveChecklistItem(completion.id, true);
    } else if (target === "rejected") {
      await approveChecklistItem(completion.id, false, "Rejected from board");
    }
    await onRefresh();
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

  const getNextPendingRequired = () => {
    const pending = activeChecklist.find((i: any) => i.required && getStatus(i) !== "approved");
    return pending ?? null;
  };

  const bulkMatchFilesToItems = (files: Array<{ url: string; name: string }>) => {
    const map: Record<string, string> = {};
    const normalizedItems = activeChecklist.map((i: any) => ({
      id: String(i.id),
      title: String(i.item_name ?? "").toLowerCase(),
    }));

    for (const f of files) {
      const name = f.name.toLowerCase();
      let best: { id: string; score: number } | null = null;
      for (const it of normalizedItems) {
        let score = 0;
        const words = it.title.split(/[^a-z0-9]+/).filter((w: string) => w.length > 3);
        for (const w of words) if (name.includes(w)) score += 1;
        if (!best || score > best.score) best = { id: it.id, score };
      }
      if (best && best.score > 0) map[f.name] = best.id;
    }
    setBulkCandidateMap(map);
  };

  const triggerDigest = async (kind: "pending_approval" | "assigned_digest") => {
    try {
      setDigestSending(true);
      setDigestMsg(null);
      const { data, error } = await supabase.functions.invoke("checklist-digest", { body: { kind } });
      if (error) throw error;
      setDigestMsg(`Digest queued: ${data?.count ?? 0} items (${kind})`);
    } catch (e) {
      setDigestMsg(`Digest failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setDigestSending(false);
    }
  };

  const applyBulkMatches = async () => {
    const entries = Object.entries(bulkCandidateMap);
    if (!entries.length) return;
    for (const [fname, itemId] of entries) {
      const file = uploadedFiles.find((f) => f.name === fname);
      if (!file) continue;
      const target = activeChecklist.find((i) => i.id === itemId);
      if (!target) continue;
      const completion = getCompletion(target);
      const existingUrls = completion?.file_urls ?? [];
      const existingNames = completion?.file_names ?? [];
      const nextUrls = [...existingUrls, file.url];
      const nextNames = [...existingNames, file.name];
      await submitChecklistCompletion(target.id, {
        notes: completion?.notes ?? "Bulk matched upload",
        fileUrls: nextUrls,
        fileNames: nextNames,
      });
    }
    setBulkCandidateMap({});
    await onRefresh();
    alert("Bulk auto-match applied.");
  };

  const jumpToItem = (itemId: string) => {
    const el = typeof document !== "undefined" ? document.getElementById(`check-item-${itemId}`) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightItemId(itemId);
      setTimeout(() => setHighlightItemId((prev) => (prev === itemId ? null : prev)), 1800);
    } else {
      setDetailItemId(itemId);
    }
  };

  const dueDateLabel = (offsetDays?: number | null) => {
    if (offsetDays === undefined || offsetDays === null || !targetDate) return <span className="text-slate-400">No due date</span>;
    const d = new Date(targetDate);
    d.setDate(d.getDate() + offsetDays);
    const diff = Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const abs = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    if (diff < 0) return <span className="text-red-500 font-medium">Overdue {Math.abs(diff)}d ({abs})</span>;
    if (diff === 0) return <span className="text-amber-600 font-medium">Today ({abs})</span>;
    if (diff === 1) return <span className="text-amber-600 font-medium">Tomorrow ({abs})</span>;
    if (diff <= 3) return <span className="text-amber-600 font-medium">Due in {diff}d ({abs})</span>;
    return <span className="text-slate-500">{abs}</span>;
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

  const saveInlineComment = async (item: ChecklistItem) => {
    const text = (commentDrafts[item.id] ?? "").trim();
    if (!text) return;
    const completion = getCompletion(item);
    if (!completion?.id) {
      await submitChecklistCompletion(item.id, { notes: text });
    } else {
      const { error } = await supabase
        .from("checklist_completions")
        .update({ notes: text })
        .eq("id", completion.id);
      if (error) throw error;
    }
    setCommentDrafts((prev) => ({ ...prev, [item.id]: "" }));
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
      priority: String((item as any).priority ?? "medium"),
    } as any);
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

    try {
      const payload: any = {
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
        priority: (editForm as any).priority ?? "medium",
      };

      if (editingTask.id === "__new__") {
        const groupName = creatingGroupName ?? editForm.group_name ?? "General";
        const groupItems = groups[groupName] ?? [];
        const maxPos = groupItems.length ? Math.max(...groupItems.map((i: any) => Number(i.position ?? 0))) : 0;
        await createChecklistItem({
          project_id: projectId,
          item_name: payload.item_name,
          description: payload.description,
          group_name: payload.group_name,
          assignee_role: payload.assignee_role,
          assigned_to: payload.assigned_to,
          required: payload.required,
          due_offset_days: payload.due_offset_days,
          has_deliverable: payload.has_deliverable,
          deliverable_type: payload.deliverable_type,
          deliverable_custom: payload.deliverable_custom,
          position: maxPos + 1,
          priority: payload.priority,
        } as any);
      } else {
        await updateChecklistItem(editingTask.id, payload);
      }

      setEditingTask(null);
      setCreatingGroupName(null);
      await onRefresh();
      alert("Task saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save task";
      alert(`Could not save task: ${msg}`);
    }
  };

  const handleCreateTask = async (groupName: string) => {
    setCreatingGroupName(groupName);
    setEditingTask({
      id: "__new__",
      project_id: projectId,
      item_name: "",
      required: true,
      position: 0,
      group_name: groupName,
      has_deliverable: true,
      deliverable_type: "document",
      deliverable_custom: null,
      due_offset_days: null,
      assignee_role: "",
      assigned_to: "",
      description: "",
      checklist_completions: [],
    } as any);
    setEditForm({
      item_name: "",
      description: "",
      group_name: groupName,
      assignee_role: "",
      assigned_to: "",
      required: true,
      due_offset_days: "",
      deliverable_type: "document",
      deliverable_custom: "",
      priority: "medium",
    } as any);
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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <p className="text-xs font-medium text-slate-600">Reminder Digests</p>
        <button onClick={() => triggerDigest("pending_approval")} disabled={digestSending}
          className="rounded border px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Send Pending Approval Digest
        </button>
        <button onClick={() => triggerDigest("assigned_digest")} disabled={digestSending}
          className="rounded border px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Send Assigned Items Digest
        </button>
        {digestMsg && <span className="text-xs text-slate-500">{digestMsg}</span>}
      </div>

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

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            const next = getNextPendingRequired();
            if (next) {
              if (displayMode === "board") setDetailItemId(next.id);
              else jumpToItem(next.id);
            }
          }}
          className="rounded-lg border px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          Next pending item
        </button>
        <p className="text-xs text-slate-400">Opens the first required item that is not approved.</p>
      </div>

      {/* Filter/Search/View bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDisplayMode("detailed")} className={`rounded-lg px-3 py-1.5 text-xs ${displayMode === "detailed" ? "bg-slate-900 text-white" : "border bg-white text-slate-600"}`}>Detailed</button>
          <button onClick={() => setDisplayMode("table")} className={`rounded-lg px-3 py-1.5 text-xs ${displayMode === "table" ? "bg-slate-900 text-white" : "border bg-white text-slate-600"}`}>Compact Table</button>
          <button onClick={() => setDisplayMode("board")} className={`rounded-lg px-3 py-1.5 text-xs ${displayMode === "board" ? "bg-slate-900 text-white" : "border bg-white text-slate-600"}`}>Board</button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, notes, files" className="min-w-[220px] rounded-lg border px-3 py-1.5 text-xs" />
          <button onClick={() => setPrioritySort((v) => !v)} className={`rounded-lg px-3 py-1.5 text-xs ${prioritySort ? "bg-indigo-100 text-indigo-700" : "border bg-white text-slate-600"}`}>Sort by Priority</button>
        </div>
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
          {([
            ["mine", "My items"],
            ["overdue", "Overdue"],
            ["requires_file", "Requires file upload"],
            ["waiting_approval", "Waiting for approval"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setQuickFilters((prev) => {
                const next = new Set(prev);
                next.has(key as QuickFilter) ? next.delete(key as QuickFilter) : next.add(key as QuickFilter);
                return next;
              })}
              className={`rounded-full px-3 py-1 text-xs ${quickFilters.has(key as QuickFilter) ? "bg-cyan-100 text-cyan-700" : "border bg-white text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
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

      <div className="text-xs text-slate-400">
        Visible items in current filter: {filtered(activeChecklist).length} / {activeChecklist.length}
      </div>

      {displayMode === "board" ? (
        <div className="grid gap-3 lg:grid-cols-4">
          {([
            ["pending", "To Do"],
            ["submitted", "Pending Approval"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
          ] as const).map(([statusKey, title]) => {
            const colItems = filtered(activeChecklist).filter((i) => getStatus(i) === statusKey);
            return (
              <div
                key={statusKey}
                className={`rounded-xl border bg-white transition ${dropTargetStatus === statusKey ? "ring-2 ring-cyan-300 border-cyan-300" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDropTargetStatus(statusKey); }}
                onDragLeave={() => setDropTargetStatus((prev) => (prev === statusKey ? null : prev))}
                onDrop={async (e) => {
                  e.preventDefault();
                  if (!dragItemId) return;
                  const dragging = activeChecklist.find((i) => i.id === dragItemId);
                  if (!dragging) return;
                  await moveBoardItem(dragging, statusKey);
                  setDragItemId(null);
                  setDropTargetStatus(null);
                }}
              >
                <div className="border-b px-3 py-2">
                  <p className="text-sm font-semibold text-slate-700">{title} <span className="text-xs text-slate-400">({colItems.length})</span></p>
                </div>
                <div className="space-y-2 p-2">
                  {colItems.map((item: any) => {
                    const completion = getCompletion(item);
                    const priority = String(item.priority ?? "medium");
                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg border p-2 ${dragItemId === item.id ? "opacity-60" : ""} ${highlightItemId === item.id ? "ring-2 ring-amber-300" : ""}`}
                        draggable
                        onDragStart={() => setDragItemId(item.id)}
                        onDragEnd={() => setDragItemId(null)}
                      >
                        <button onClick={() => setDetailItemId(item.id)} className="w-full text-left">
                          <p className="text-sm font-medium text-slate-800">{item.item_name}</p>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs">
                            <span className={`rounded-full px-2 py-0.5 ${PRIORITY_PILL[priority] ?? PRIORITY_PILL.medium}`}>{priority}</span>
                            {item.required && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600">Required</span>}
                            {(completion?.file_names?.length ?? 0) > 0 && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">📎 {completion.file_names.length}</span>}
                          </div>
                        </button>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(["pending", "submitted", "approved", "rejected"] as const).filter((s) => s !== statusKey).map((s) => (
                            <button key={s} onClick={() => moveBoardItem(item, s)} className="rounded border px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">→ {s}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {colItems.length === 0 && <div className="rounded-lg border border-dashed p-3 text-center text-xs text-slate-400">No items</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : displayMode === "table" ? (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Item Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered(activeChecklist).map((item: any) => {
                const status = getStatus(item);
                const completion = getCompletion(item);
                const priority = String(item.priority ?? "medium");
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">
                      <input
                        defaultValue={item.item_name}
                        onBlur={(e) => e.target.value.trim() && handleQuickEdit(item, { item_name: e.target.value.trim() })}
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CONFIG[status].color}`}>{STATUS_CONFIG[status].label}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{item.assigned_to ? (teamMembers.find((u) => u.id === item.assigned_to)?.full_name ?? item.assignee_role) : (item.assignee_role ?? "—")}</td>
                    <td className="px-4 py-3 text-xs">{dueDateLabel(item.due_offset_days)}</td>
                    <td className="px-4 py-3">
                      <select value={priority} onChange={(e) => handleQuickEdit(item, { priority: e.target.value as any })}
                        className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_PILL[priority] ?? PRIORITY_PILL.medium}`}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {isAdmin && status === "submitted" && <button onClick={() => handleApprove(item)} className="rounded border px-2 py-1 text-xs text-green-700">Approve</button>}
                        {isAdmin && status === "submitted" && <button onClick={() => { setRejectingId(item.id); setExpandedItem(item.id); }} className="rounded border px-2 py-1 text-xs text-red-700">Reject</button>}
                        {(item.has_deliverable !== false) && status !== "approved" && status !== "submitted" && canSubmit && <button onClick={() => setExpandedItem(item.id)} className="rounded border px-2 py-1 text-xs text-blue-700">Add file</button>}
                        <button onClick={() => openEditModal(item)} className="rounded border px-2 py-1 text-xs text-slate-600">Comment/Edit</button>
                      </div>
                      <div className="mt-1 flex gap-1">
                        <input
                          value={commentDrafts[item.id] ?? ""}
                          onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Quick comment"
                          className="w-40 rounded border px-2 py-1 text-xs"
                        />
                        <button onClick={() => saveInlineComment(item)} className="rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Save</button>
                      </div>
                      {(completion?.file_names?.length ?? 0) > 0 && (
                        <p className="mt-1 text-xs text-slate-500">📎 {completion.file_names[0]}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
      /* Groups */
      Object.entries(groups).map(([groupName, items]) => {
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
                    <div id={`check-item-${item.id}`} key={item.id} className={`transition ${highlightItemId === item.id ? "ring-2 ring-amber-300" : ""} ${
                      status === "approved" ? "bg-green-50/40" :
                      status === "rejected" ? "bg-red-50/40" :
                      status === "submitted" ? "bg-amber-50/40" : ""
                    }`}>
                      {/* Item row */}
                      <div className="group flex items-center gap-3 px-4 py-3 cursor-pointer"
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
                        <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
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
                            <button onClick={() => setShowSubmitModalFor(item.id)}
                              className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">
                              Submit ↑
                            </button>
                          )}
                          {/* Admin approve/reject */}
                          {isAdmin && status === "submitted" && (
                            <>
                              <button onClick={() => setShowReviewModalFor(item.id)}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                                ✓ Approve/Reject
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
                                multiple
                                label={DELIVERABLE_SPEC[item.item_name]?.label ?? "Upload Deliverable"}
                                accept={DELIVERABLE_SPEC[item.item_name]?.accept}
                                hint={DELIVERABLE_SPEC[item.item_name]?.hint ?? "Upload the required deliverable for this checklist item"}
                                onUploaded={(url, name) => setUploadedFiles((f) => [...f, { url, name }])}
                                onUploadedMany={(files) => {
                                  bulkMatchFilesToItems(files);
                                  // still add files for current item by default
                                  setUploadedFiles((f) => [...f, ...files]);
                                }}
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

                          {Object.keys(bulkCandidateMap).length > 0 && (
                            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs">
                              <p className="mb-1 font-medium text-cyan-800">Bulk upload auto-match suggestions</p>
                              <div className="space-y-1 text-cyan-700">
                                {Object.entries(bulkCandidateMap).slice(0, 10).map(([fname, itemId]) => {
                                  const target = activeChecklist.find((i) => i.id === itemId) as any;
                                  return (
                                    <div key={fname} className="flex items-center justify-between gap-2">
                                      <span>📎 {fname}</span>
                                      <select
                                        value={itemId}
                                        onChange={(e) => setBulkCandidateMap((prev) => ({ ...prev, [fname]: e.target.value }))}
                                        className="rounded border px-1 py-0.5 text-[11px]"
                                      >
                                        {activeChecklist.map((i: any) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-2 flex justify-end">
                                <button onClick={applyBulkMatches} className="rounded border px-2 py-1 text-xs text-cyan-800 hover:bg-cyan-100">Apply matches</button>
                              </div>
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
      })
      )}

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

      {detailItemId && (() => {
        const item = activeChecklist.find((i) => i.id === detailItemId) as any;
        const completion = item ? getCompletion(item) : null;
        if (!item) return null;
        const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
        return (
          <div className={isMobile ? "fixed inset-x-0 bottom-0 z-50 w-full max-h-[75vh] overflow-y-auto rounded-t-2xl border-t bg-white shadow-2xl" : "fixed inset-y-0 right-0 z-50 w-full max-w-md border-l bg-white shadow-2xl"}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="font-semibold text-slate-800">Checklist Details</h4>
              <button onClick={() => setDetailItemId(null)} className="rounded border px-2 py-1 text-xs text-slate-600">Close</button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Title</p>
                <p className="font-medium text-slate-800">{item.item_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Description</p>
                <p className="text-slate-700">{item.description || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CONFIG[getStatus(item)].color}`}>{STATUS_CONFIG[getStatus(item)].label}</span>
              </div>
              <div>
                <p className="text-xs text-slate-500">Due</p>
                <div>{dueDateLabel(item.due_offset_days)}</div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Comments/Notes</p>
                <p className="text-slate-700">{completion?.notes || "No notes yet."}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Files</p>
                <div className="space-y-1">
                  {(completion?.file_names ?? []).length === 0 && <p className="text-slate-400">No files uploaded.</p>}
                  {(completion?.file_names ?? []).map((n: string, i: number) => (
                    <a key={i} href={completion.file_urls?.[i]} target="_blank" rel="noopener noreferrer" className="block rounded border px-2 py-1 text-blue-600 hover:bg-blue-50">📎 {n}</a>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Approval History</p>
                <ul className="list-disc pl-5 text-slate-600">
                  <li>Status: {getStatus(item)}</li>
                  <li>Submitted: {completion?.completed_at ? new Date(completion.completed_at).toLocaleString() : "—"}</li>
                  <li>Approved: {completion?.approved_at ? new Date(completion.approved_at).toLocaleString() : "—"}</li>
                </ul>
              </div>
              <div>
                <p className="text-xs text-slate-500">Activity timeline</p>
                <div className="mt-1 space-y-1 text-xs text-slate-600">
                  <div className="rounded bg-slate-50 px-2 py-1">Created checklist item</div>
                  {completion?.completed_at && <div className="rounded bg-amber-50 px-2 py-1">Submitted: {new Date(completion.completed_at).toLocaleString()}</div>}
                  {completion?.approved_at && <div className="rounded bg-green-50 px-2 py-1">Approved: {new Date(completion.approved_at).toLocaleString()}</div>}
                  {completion?.rejection_reason && <div className="rounded bg-red-50 px-2 py-1">Rejected: {completion.rejection_reason}</div>}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Global recent activity</p>
                <div className="mt-1 space-y-1 text-xs text-slate-600">
                  {activeChecklist.slice(0, 8).map((it: any) => {
                    const c = getCompletion(it);
                    if (!c) return null;
                    return (
                      <div key={it.id} className="rounded border px-2 py-1">
                        <p className="font-medium text-slate-700">{it.item_name}</p>
                        <p className="text-slate-500">{(c.approval_status ?? "pending").toUpperCase()} · {c.completed_at ? new Date(c.completed_at).toLocaleString() : "—"}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Quick Actions</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {isAdmin && getStatus(item) === "submitted" && <button onClick={() => handleApprove(item)} className="rounded border px-2 py-1 text-xs text-green-700">Approve</button>}
                  {isAdmin && getStatus(item) === "submitted" && <button onClick={() => { setRejectingId(item.id); setExpandedItem(item.id); }} className="rounded border px-2 py-1 text-xs text-red-700">Reject</button>}
                  {canSubmit && <button onClick={() => openEditModal(item)} className="rounded border px-2 py-1 text-xs text-slate-600">Edit</button>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showSubmitModalFor && (() => {
        const item = activeChecklist.find((i) => i.id === showSubmitModalFor) as any;
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="mb-3 text-lg font-semibold">Submit for Approval</h3>
              <p className="mb-2 text-sm text-slate-600">{item.item_name}</p>
              <p className="mb-3 text-xs text-slate-500">Files selected: {uploadedFiles.length}</p>
              <textarea value={submitNotes} rows={3} onChange={(e) => setSubmitNotes(e.target.value)} placeholder="Optional note to approver" className="w-full rounded-lg border px-3 py-2 text-sm" />
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowSubmitModalFor(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-600">Cancel</button>
                <button
                  onClick={async () => {
                    await handleSubmit(item);
                    try {
                      await triggerDigest("pending_approval");
                    } catch {
                      // non-blocking reminder hook
                    }
                    setShowSubmitModalFor(null);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Request Approval
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showReviewModalFor && (() => {
        const item = activeChecklist.find((i) => i.id === showReviewModalFor) as any;
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="mb-3 text-lg font-semibold">Review Submission</h3>
              <p className="mb-2 text-sm text-slate-600">{item.item_name}</p>
              <textarea value={rejectReason} rows={3} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (required for reject)" className="w-full rounded-lg border px-3 py-2 text-sm" />
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowReviewModalFor(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-600">Cancel</button>
                <button onClick={async () => { await handleApprove(item); setShowReviewModalFor(null); }} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">Approve</button>
                <button onClick={async () => { if (!rejectReason.trim()) return alert("Enter rejection reason"); await handleReject(item); setShowReviewModalFor(null); }} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white">Reject</button>
              </div>
            </div>
          </div>
        );
      })()}

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
                <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
                <select value={String((editForm as any).priority ?? "medium")} onChange={(e) => setEditForm((p: any) => ({ ...p, priority: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
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
              <button onClick={() => { setEditingTask(null); setCreatingGroupName(null); }} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveEditModal} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
