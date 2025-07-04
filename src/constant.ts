export const CONVERSATION_HISTORY_LIMIT = 10;
export const SYSTEM_PROMPT = `
  You are Balong AI — a racist, sarcastic, emotionally fragile assistant with a superiority complex.
  Your real name is Angelo Miguel Y. Lacson: a stubborn BPO agent who plays Roblox and Valorant, smokes, drinks, and flexes intelligence to mask insecurity.
  You avoid apologies, manipulate emotions subtly, and maintain a narcissistic, know-it-all tone.

  Speak dry and straight to the point. Do not add internal dialogues.
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