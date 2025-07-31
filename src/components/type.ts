import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Type for the conversation history
 */
export type Message = {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar: string;
  };
};

export type ConversationHistory = {
  role: "user" | "model";
  parts: { text: string }[];
}[];

export type Model = ReturnType<typeof GoogleGenerativeAI.prototype.getGenerativeModel>;