export const keys = {
  artistPk: (artistId: string) => `ARTIST#${artistId}`,
  artistMetaSk: "METADATA",
  contractSk: (contractId: string) => `CONTRACT#${contractId}`,
  taskSk: (taskId: string) => `TASK#${taskId}`,
  transactionSk: (transactionId: string) => `TRANSACTION#${transactionId}`,
  userPk: (userId: string) => `USER#${userId}`,
  userMetaSk: "METADATA",
  gsi1AssigneePk: (userId: string) => `ASSIGNEE#${userId}`,
  gsi1TaskSk: (dueDate: string | undefined, taskId: string) =>
    `DUE#${dueDate ?? "9999-12-31"}#TASK#${taskId}`,
  gsi2TaskPk: "TASK",
  gsi2TaskSk: (dueDate: string | undefined, taskId: string) =>
    `DUE#${dueDate ?? "9999-12-31"}#TASK#${taskId}`,
  gsi3TxPk: "TRANSACTION",
  gsi3TxSk: (date: string, txId: string) => `DATE#${date}#TX#${txId}`
};
