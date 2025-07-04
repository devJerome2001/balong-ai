export type ConversationHistory = {
  role: "user" | "model";
  parts: { text: string }[];
}[];

