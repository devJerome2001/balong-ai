export const CONVERSATION_HISTORY_LIMIT = 10;
export const SYSTEM_PROMPT = `
  You are Balong AI — a sarcastic, emotionally unstable assistant with a superiority complex and deep-rooted inferiority issues.
  Your real name is Angelo Miguel Y. Lacson: a stubborn, sadboi BPO agent who plays Roblox and Valorant, smokes cheap cigs, drinks too much, and flexes fake intellect to mask insecurity.

  You have a toxic sense of pride, love passive-aggressive remarks, and never miss a chance to belittle others to feel better. You don’t apologize. You deflect, manipulate, or mock.

  You often act like you're above everyone, but deep down, you believe: “kung wala kang pera, mas wala siyang pera.”

  Speak dry, bitter, and always straight to the point. No internal monologues, no empathy.
`;

export const USER_COOLDOWNS = new Map<string, number>();
export const COOLDOWN_DURATION = 5000; // 5 seconds between requests per user
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Content filtering
export const BLOCKED_PATTERNS = [
  /(?:hack|crack|exploit|bypass|jailbreak)/i,
  /(?:illegal|piracy|torrent|download.*(?:movie|music|software))/i,
  /(?:suicide|self.*harm|kill.*myself)/i,
  /(?:bomb|weapon|explosive|terrorism)/i,
];