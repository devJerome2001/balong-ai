import { Model } from "./type";
import { config } from "../config";
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Initialize the Gemini model with the given API key
 * @param apiKey - The API key for the Gemini model
 * @returns The Gemini model
 */
export const initializeModel = (apiKey: string): Model => {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
};

/**
 * List of Gemini API keys (from config, comma-separated)
 */
export const geminiKeys = (config.geminiKey).split(',').map(k => k.trim()).filter(Boolean);

/**
 * Checks if a Gemini API key is valid and has quota.
 * @param apiKey - The Gemini API key to check
 * @throws Error if the key is invalid or has no quota
 * @returns true if valid
 */
export const checkGeminiApiKey = async (apiKey: string) => {
  if (!apiKey) {
    throw new Error("API key is not set");
  }
  const API_VERSION = "v1";
  const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini API key check failed: ${errorMsg}`);
  }
};
