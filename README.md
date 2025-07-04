# Balong AI

Balong AI is a Discord chatbot powered by Google Gemini (Generative AI) that responds to user mentions in specified channels. It maintains conversation context and leverages advanced AI to generate human-like responses.

## Features
- **Discord Integration:** Listens and responds to messages in specified Discord channels.
- **Google Gemini AI:** Uses Gemini 1.5 Flash model for generating responses.
- **Conversation Context:** Maintains recent message history for contextual replies.
- **Configurable:** Channel IDs and API keys are set via environment variables.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)
- Discord Bot Token
- Google Gemini API Key

### Installation
1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd balong-ai
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```

### Environment Variables
Create a `.env` file in the root directory and add the following:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token
GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key
DISCORD_SERVER_CHANNEL_ID=channel_id_1,channel_id_2
```
- `DISCORD_BOT_TOKEN`: Your Discord bot token from the Discord Developer Portal.
- `GOOGLE_GEMINI_API_KEY`: Your Google Gemini API key.
- `DISCORD_SERVER_CHANNEL_ID`: Comma-separated list of channel IDs where the bot should respond.

### Running the Bot
- **Development mode (with hot reload):**
  ```bash
  npm run dev
  ```
- **Production mode:**
  ```bash
  npm run build
  npm start
  ```

## Usage
- Invite the bot to your Discord server and ensure it has permission to read and send messages in the specified channels.
- Mention the bot in a message (e.g., `@BalongAI your question here`).
- The bot will reply using Google Gemini AI, considering recent conversation history for context.
- Messages starting with `!` are ignored (reserved for commands).

## Project Structure
```
balong-ai/
├── src/
│   ├── constant.ts         # Constants (e.g., system prompt, history limit)
│   ├── index.ts            # Main bot logic
│   └── type.ts             # Type definitions
├── package.json            # Project metadata and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # Project documentation
```

## Dependencies
- [discord.js](https://discord.js.org/): Discord API library
- [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai): Google Gemini API client
- [dotenv](https://www.npmjs.com/package/dotenv): Environment variable loader
- [typescript](https://www.typescriptlang.org/): TypeScript support
- [ts-node-dev](https://www.npmjs.com/package/ts-node-dev): Development tool for TypeScript

## Contributing
Contributions are welcome! Please open issues or submit pull requests for improvements or bug fixes.

## License
This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for details.

## Contact
For questions or support, please contact the project maintainer.
