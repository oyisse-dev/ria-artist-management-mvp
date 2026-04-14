export type Role = "Admin" | "Manager" | "Finance";

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  roles: Role[];
}

export interface Artist {
  artistId: string;
  stageName: string;
  legalName?: string;
  commissionRate: number;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  taskId: string;
  artistId: string;
  title: string;
  dueDate?: string;
  completed: boolean;
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
  commissionAmount?: number;
  artistNetAmount?: number;
  createdBy: string;
  createdAt: string;
}
