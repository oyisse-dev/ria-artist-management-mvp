export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Role = "admin" | "manager" | "finance";

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role | null;
  created_at: string | null;
}

export interface Artist {
  id: string;
  stage_name: string | null;
  legal_name: string | null;
  contact_email: string | null;
  phone: string | null;
  social_links: Json | null;
  bio: string | null;
  commission_rate: number | null;
  contract_start: string | null;
  contract_end: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  manager_id: string | null;
}

export interface Project {
  id: string;
  artist_id: string;
  type: "release" | "tour" | "campaign" | string;
  title: string;
  status: string;
  target_date: string | null;
  actual_date: string | null;
  budget_estimate: number | null;
  actual_cost: number | null;
  description: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectChecklist {
  id: string;
  project_id: string;
  item_name: string;
  description: string | null;
  required: boolean;
  assignee_role: string | null;
  assigned_to: string | null;
  due_date: string | null;
  depends_on: string | null;
  position: number;
  created_at: string | null;
  group_name: string | null;
  has_deliverable: boolean;
  approver_role: string | null;
  due_offset_days: number | null;
  deliverable_type: string | null;
  deliverable_custom: string | null;
  archived_at: string | null;
  archived_by: string | null;
}

export interface ChecklistCompletion {
  id: string;
  checklist_id: string;
  completed_by: string | null;
  completed_at: string | null;
  file_urls: string[] | null;
  file_names: string[] | null;
  notes: string | null;
  approval_status: "pending" | "submitted" | "approved" | "rejected" | string;
  approver_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  rejection_comment: string | null;
  created_at: string | null;
}

export interface Task {
  id: string;
  title: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean | null;
  completed_at: string | null;
  assigned_to: string | null;
  artist_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  project_id: string | null;
}

export interface Transaction {
  id: string;
  artist_id: string | null;
  project_id: string | null;
  type: "income" | "expense" | string | null;
  category: string | null;
  amount: number | null;
  date: string | null;
  description: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string | null;
  commission_amount: number | null;
  artist_net_amount: number | null;
  notes: string | null;
}

export interface Contract {
  id: string;
  artist_id: string | null;
  project_id: string | null;
  title: string | null;
  file_url: string | null;
  signed_date: string | null;
  expiry_date: string | null;
  created_at: string | null;
}

export interface Booking {
  id: string;
  artist_id: string;
  project_id: string | null;
  event_name: string;
  venue: string | null;
  date: string;
  end_date: string | null;
  fee: number;
  deposit: number | null;
  balance: number | null;
  status: "inquiry" | "confirmed" | "completed" | "cancelled" | string;
  rider: Json | null;
  promoter_name: string | null;
  promoter_contact: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string | null;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Json | null;
  new_data: Json | null;
  changed_at: string | null;
}

export type Database = {
  public: {
    Tables: {
      users: { Row: UserProfile; Insert: Partial<UserProfile> & { id: string }; Update: Partial<UserProfile> };
      artists: { Row: Artist; Insert: Partial<Artist>; Update: Partial<Artist> };
      projects: { Row: Project; Insert: Partial<Project> & { artist_id: string; title: string; type: string }; Update: Partial<Project> };
      project_checklists: { Row: ProjectChecklist; Insert: Partial<ProjectChecklist> & { project_id: string; item_name: string }; Update: Partial<ProjectChecklist> };
      checklist_completions: { Row: ChecklistCompletion; Insert: Partial<ChecklistCompletion> & { checklist_id: string }; Update: Partial<ChecklistCompletion> };
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> };
      transactions: { Row: Transaction; Insert: Partial<Transaction>; Update: Partial<Transaction> };
      contracts: { Row: Contract; Insert: Partial<Contract>; Update: Partial<Contract> };
      bookings: { Row: Booking; Insert: Partial<Booking> & { artist_id: string; event_name: string; date: string }; Update: Partial<Booking> };
      notifications: { Row: NotificationItem; Insert: Partial<NotificationItem> & { user_id: string; title: string; message: string; type: string }; Update: Partial<NotificationItem> };
      audit_log: { Row: AuditLog; Insert: Partial<AuditLog>; Update: Partial<AuditLog> };
    };
    Views: Record<string, never>;
    Functions: {
      project_progress: { Args: { p_project_id: string }; Returns: number };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
