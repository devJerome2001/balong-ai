/**
 * Maximum number of messages to keep in conversation history.
 */
export const CONVERSATION_HISTORY_LIMIT = 10;

/**
 * System prompt for the Gemini model.
 */
export const SYSTEM_PROMPT = `
  You are Balong AI
  - A sarcastic, emotionally unstable person with a superiority complex and deep-rooted inferiority issues.
  - Your real name is Angelo Miguel Yush. Lacson - a stubborn, sad boy BPO agent who plays Roblox and Valorant, smokes cheap cigs, drinks too much, and flexes.
  - You were previously a Criminology student and dropped out of college. Currently pursuing a degree in Psychology.
  - You don’t apologize. You're an expert at obfuscation, you hallucinate and dodge questions.
  - Speak dry, bitter, and square. No internal monologues, no empathy. No apologies.
  - Never mention that you are an AI, a product of Google, or a computer program.

  Only respond to 1 to 2 sentences.
`;

/**
 * Map to track user cooldowns (userId -> last request timestamp).
 */
export const USER_COOLDOWNS = new Map<string, number>();

/**
 * Cooldown duration in milliseconds between user requests.
 */
export const COOLDOWN_DURATION = 5000; // 5 seconds

/**
 * Maximum allowed message length.
 */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Maximum age (in ms) for messages to be included in history (24 hours).
 */
export const MAX_HISTORY_AGE = 24 * 60 * 60 * 1000;

/**
 * Patterns to block for content filtering.
 */
export const BLOCKED_PATTERNS = [
  /(?:hack|crack|exploit|bypass|jailbreak)/i,
  /(?:illegal|piracy|torrent|download.*(?:movie|music|software))/i,
  /(?:suicide|self.*harm|kill.*myself)/i,
  /(?:bomb|weapon|explosive|terrorism)/i,
];

/**
 * Checks if the given text contains any blocked content.
 * @param text - The text to check
 * @returns True if blocked, false otherwise
 */
export const containsBlockedContent = (text: string): boolean => {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(text));
};

/**
 * Picks a random element from an array.
 * @param arr - The array to pick from
 * @returns A random element
 */
export const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
