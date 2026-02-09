const TelegramBot = require("node-telegram-bot-api");

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ TELEGRAM_TOKEN o SUPER_ADMIN mancante!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot avviato");

// =====================
// STATI IN MEMORIA
// =====================
const ADMINS = new Set([SUPER_ADMIN]);
const USERS = new Set();

const userState = new Map();     // ASTA | ORDINE | ASSISTENZA | CANDIDATURA
const sponsorState = new Map();  // step, duration
const reviewState = new Map();   // rating
const activeChats = new Map();   // user <-> admin

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE =
  "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";

const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  userState.delete(userId);
  sponsorState.delete(userId);
  reviewState.delete(userId);

  if (activeChats.has(userId)) {
    const admin = activeChats.get(userId);
    activeChats.delete(userId);
    activeChats.delete(admin);
  }

  USERS.add(userId);

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: "👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni:",
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
        [{ text: "⭐ Lascia una Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "📢 Richiedi uno Sponsor", callback_data: "OPEN_SPONSOR" }],
        [{ text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }]
      ]
    }
  });
});

// =====================
// CALLBACK QUERY
// =====================
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;
  const userId = q.from.id;

  // ===== RECENSIONI =====
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    reviewState.set(userId, rating);
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`, {
      reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: "REVIEW_SKIP" }]] }
    });
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (q.data === "REVIEW_SKIP") {
    reviewState.delete(userId);
    bot.sendMessage(chatId, "✅ Recensione inviata senza commento.");
    bot.answerCallbackQuery(q.id);
    return;
  }

  // ===== SPONSOR =====
  if (q.data === "OPEN_SPONSOR") {
    sponsorState.set(userId, { step: "SHOW_INFO" });
    bot.sendMessage(chatId,
      "*📢 Prezzi Sponsor:*\n\n" +
      "**12h** » 500\n" +
      "**24h** » 1000\n" +
      "**36h** » 1600\n" +
      "**48h** » 2100\n" +
      "**Permanente** » 3200",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "✅ Continua", callback_data: "SPONSOR_CONTINUA" }]] }
      }
    );
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (q.data === "SPONSOR_CONTINUA") {
    sponsorState.set(userId, { step: "SELECT_DURATION" });
    bot.sendMessage(chatId, "Seleziona la durata:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "12h", callback_data: "SP_12h" }],
          [{ text: "24h", callback_data: "SP_24h" }],
          [{ text: "36h", callback_data: "SP_36h" }],
          [{ text: "48h", callback_data: "SP_48h" }],
          [{ text: "Permanente", callback_data: "SP_PERM" }]
        ]
      }
    });
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (q.data.startsWith("SP_")) {
    sponsorState.set(userId, { step: "WRITE_TEXT", duration: q.data.replace("SP_", "") });
    bot.sendMessage(chatId, "Ora invia il testo del messaggio sponsor:");
    bot.answerCallbackQuery(q.id);
    return;
  }

  // ===== MENU =====
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ *Lascia una recensione*\nSeleziona un voto:", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[1,2,3,4,5].map(n => ({ text:`⭐ ${n}`, callback_data:`RATE_${n}` }))]
        }
      });
      break;

    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId,
        "🏷️ *Modulo Asta*\n\n" +
        "1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio",
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId,
        "📄 *Listino CapyBar*\nhttps://telegra.ph/Listino-CapyBar-02-07",
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId,
        "📝 *Modulo Ordinazioni*\n\n" +
        "1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati",
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId, "🆘 *Assistenza*\nScrivi qui la tua richiesta.", { parse_mode: "Markdown" });
      break;

    case "OPEN_CANDIDATURA":
      userState.set(userId, "CANDIDATURA");
      bot.sendMessage(chatId,
        "📝 *Modulo Candidatura Dipendente*\n\n" +
        "1️⃣ Dati personali\n2️⃣ Parlaci di te\n3️⃣ Perché dovremmo sceglierti?\n" +
        "4️⃣ Esperienze lavorative\n5️⃣ Competenze pratiche\n6️⃣ Pregi e difetti",
        { parse_mode: "Markdown" }
      );
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // CHAT CONTINUA
  if (activeChats.has(userId)) {
    const target = activeChats.get(userId);
    bot.sendMessage(target, msg.text);
    return;
  }

  // COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const rating = reviewState.get(userId);
    reviewState.delete(userId);
    ADMINS.forEach(a =>
      bot.sendMessage(a, `⭐ Recensione\n⭐ ${rating}/5\n💬 ${msg.text}`)
    );
    bot.sendMessage(chatId, "✅ Recensione inviata!");
    return;
  }

  // SPONSOR TESTO
  if (sponsorState.has(userId)) {
    const data = sponsorState.get(userId);
    if (data.step === "WRITE_TEXT") {
      sponsorState.delete(userId);
      const admin = [...ADMINS][0];
      activeChats.set(userId, admin);
      activeChats.set(admin, userId);
      bot.sendMessage(admin, `📢 Sponsor (${data.duration})\n\n${msg.text}`);
      bot.sendMessage(chatId, "✅ Sponsor inviato!");
      return;
    }
  }

  // MODULI
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);
    const admin = [...ADMINS][0];
    activeChats.set(userId, admin);
    activeChats.set(admin, userId);
    bot.sendMessage(admin, `📩 ${type}\n\n${msg.text}`);
    bot.sendMessage(chatId, "✅ Messaggio inviato!");
  }
});

// =====================
// COMANDI
// =====================
bot.onText(/\/id/, (msg) =>
  bot.sendMessage(msg.chat.id, `🆔 ID: ${msg.from.id}`)
);

bot.onText(/\/stats/, (msg) =>
  bot.sendMessage(msg.chat.id, `📊 Utenti totali: ${USERS.size}`)
);