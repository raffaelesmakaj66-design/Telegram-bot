import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

console.log("🤖 Bot Telegram avviato");

// ===== ENV =====
const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_IDS = process.env.ADMIN_ID.split(",").map(id => id.trim());

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ TELEGRAM_TOKEN o ADMIN_ID mancanti");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== FILE RECENSIONI =====
const REVIEWS_FILE = "./reviews.json";

if (!fs.existsSync(REVIEWS_FILE)) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));
}

const loadReviews = () =>
  JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));

const saveReview = (rating) => {
  const reviews = loadReviews();
  reviews.push(rating);
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
};

const getAverage = () => {
  const reviews = loadReviews();
  if (reviews.length === 0) return 0;
  return (reviews.reduce((a, b) => a + b, 0) / reviews.length).toFixed(1);
};

// ===== CONFIG =====
const WELCOME_IMAGE =
  "AgACAgQAAxkBAAM1aYRXYd4FNs3LsBgpox5c0av2Ic8AAg8OaxsyrSlQ23YZ-nsoLoABAAMCAAN5AAM4BA";

const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// ===== STATO =====
const assistenzaUsers = new Set();        // utenti in assistenza
const adminReplyMap = {};                 // admin -> utente

// ===== /start =====
bot.onText(/\/start/, (msg) => {
  bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Canale", url: CHANNEL_URL }],
        [
          { text: "⚖️ Aste", callback_data: "OPEN_ASTA" },
          { text: "📄 Listino", callback_data: "OPEN_LISTINO" }
        ],
        [
          { text: "📝 Ordina", callback_data: "OPEN_ORDINI" },
          { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }
        ],
        [{ text: "⭐ Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "⭐ Sponsor", callback_data: "OPEN_SPONSOR" }],
        [{ text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }]
      ]
    }
  });
});

// ===== CALLBACK QUERY =====
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;

  // ===== ⭐ RECENSIONI (FIX CARICAMENTO) =====
  if (q.data.startsWith("RATE_")) {
    const rating = parseInt(q.data.split("_")[1]);
    saveReview(rating);

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(
      chatId,
      `🙏 *Grazie per la recensione!*

⭐ Voto: *${rating}/5*
📊 Media attuale: *${avg}* (${total} voti)`,
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `⭐ *Nuova recensione*

👤 ${q.from.first_name}
⭐ ${rating}/5
📊 Media: ${avg}`,
        { parse_mode: "Markdown" }
      );
    });

    bot.answerCallbackQuery(q.id);
    return; // 🔴 fondamentale
  }

  // ===== ALTRI BOTTONI =====
  switch (q.data) {
    case "OPEN_LISTINO":
    case "OPEN_SPONSOR":
      bot.sendMessage(
        chatId,
        `📄 *Listino Ufficiale*

• Prodotto A → *1k*
• Prodotto B → *2.5k*
• Prodotto C → *5k*
• Prodotto Premium → *10k*

📌 Usa *📝 Ordina* per acquistare`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASTA":
      bot.sendMessage(
        chatId,
        `🏷️ *Modulo Asta*

1️⃣ Oggetto/i  
2️⃣ Nickname  
3️⃣ Prezzo base  
4️⃣ Rilancio`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      bot.sendMessage(
        chatId,
        `📝 *Modulo Ordini*

1️⃣ Nickname  
2️⃣ @ Telegram  
3️⃣ Prodotti desiderati`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASSISTENZA":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId, "🆘 Scrivi il tuo messaggio per l’assistenza.");
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(
        chatId,
        `📝 *Come fare il curriculum*

1️⃣ Dati personali  
2️⃣ Parlaci di te  
3️⃣ Perché sceglierti  
4️⃣ Esperienze lavorative  
5️⃣ Competenze  
6️⃣ Pregi e difetti

📍 *Consegna:*  
Bancarella 8 – coordinate -505 64 22, davanti all’ospedale`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_REVIEW":
      bot.sendMessage(
        chatId,
        `⭐ *Lascia una recensione*

Seleziona un voto da *1 a 5 stelle* ⭐
in base alla tua esperienza.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "⭐ 1", callback_data: "RATE_1" },
              { text: "⭐ 2", callback_data: "RATE_2" },
              { text: "⭐ 3", callback_data: "RATE_3" },
              { text: "⭐ 4", callback_data: "RATE_4" },
              { text: "⭐ 5", callback_data: "RATE_5" }
            ]]
          }
        }
      );
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// ===== MESSAGGI =====
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const user = msg.from;

  // ===== RISPOSTA ADMIN =====
  if (ADMIN_IDS.includes(String(user.id))) {
    const targetUser = adminReplyMap[user.id];
    if (targetUser) {
      bot.sendMessage(
        targetUser,
        `💬 *Risposta assistenza:*

${msg.text}`,
        { parse_mode: "Markdown" }
      );
      delete adminReplyMap[user.id];
    }
    return;
  }

  // ===== ASSISTENZA =====
  if (assistenzaUsers.has(chatId)) {
    bot.sendMessage(chatId, "✅ Messaggio inviato correttamente!");

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `📩 *Nuovo messaggio assistenza*

👤 ${user.first_name} (@${user.username || "nessuno"})
🆔 ${user.id}

${msg.text}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[id] = chatId;
    });
    return;
  }

  // ===== MODULI =====
  bot.sendMessage(chatId, "✅ Modulo inviato correttamente!");
  ADMIN_IDS.forEach(id => {
    bot.sendMessage(
      id,
      `📥 *Nuovo modulo*

👤 ${user.first_name}
🆔 ${user.id}

${msg.text}`,
      { parse_mode: "Markdown" }
    );
  });
});