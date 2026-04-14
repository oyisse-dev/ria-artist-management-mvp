import { supabase } from "../lib/db.js";
import { recentTransactions } from "./transactions.js";

export async function getDashboardSummary() {
  // Pending tasks count
  const { count: pendingTasks } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("completed", false);

  // Recent transactions for financial summary
  const recentTx = await recentTransactions(50);
  const totalIncome = recentTx
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = recentTx
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Total artists
  const { count: totalArtists } = await supabase
    .from("artists")
    .select("*", { count: "exact", head: true });

  return {
    pendingTasks: pendingTasks ?? 0,
    totalArtists: totalArtists ?? 0,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    recentTransactions: recentTx.slice(0, 10)
  };
}
