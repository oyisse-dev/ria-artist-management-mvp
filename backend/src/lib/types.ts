export type Role = "admin" | "manager" | "finance";

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  roles: Role[];
  role?: Role; // primary role
}

export interface Artist {
  artistId: string;
  stageName: string;
  legalName?: string;
  contactEmail?: string;
  phone?: string;
  bio?: string;
  socialLinks?: Record<string, string>;
  commissionRate: number;
  managerId?: string;
  contractStart?: string;
  contractEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  taskId: string;
  artistId: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
  assignedTo?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionItem {
  transactionId: string;
  artistId: string;
  amount: number;
  date: string;
  type: "income" | "expense";
  category?: string;
  notes?: string;
  description?: string;
  receiptUrl?: string;
  commissionAmount: number;
  artistNetAmount: number;
  createdBy: string;
  createdAt: string;
}

export interface ContractItem {
  contractId: string;
  artistId: string;
  title: string;
  fileUrl?: string;
  signedDate?: string;
  expiryDate?: string;
  createdAt: string;
}
