import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAME } from "../lib/config.js";
import { ddb } from "../lib/db.js";
import { keys } from "../lib/keys.js";
import { recentTransactions } from "./transactions.js";

export async function getDashboardSummary() {
  const openTasksResult = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": keys.gsi2TaskPk }
    })
  );

  const recentTx = await recentTransactions(50);
  const pendingTasks = (openTasksResult.Items ?? []).filter((item) => item.completed !== true).length;
  const totalIncome = recentTx
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = recentTx
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  return {
    pendingTasks,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    recentTransactions: recentTx.slice(0, 10)
  };
}
