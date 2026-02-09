import TelegramBot from "node-telegram-bot-api";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ TELEGRAM_TOKEN o SUPER_ADMIN mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot avviato");

// =====================
// STATI IN MEMORIA
// =====================
const ADMINS = new Set([SUPER_ADMIN]);
const USERS = new Set();

const userState = new Map();     // ASTA / ORDINE / ASSISTENZA / CANDIDATURA
const sponsorState = new Map();  // sponsor flow
const reviewState = new Map();   // recensioni
const activeChats = new Map();   // user <-> admin

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE =
  "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// UTILS
// =====================
const escape = (t) =>
  t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// /start (chiude ticket)
// =====================
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  userState.delete(userId);
  sponsorState.delete(userId);
  reviewState.delete(userId);

  if (activeChats.has(userId)) {
    const other = activeChats.get(userId);
    activeChats.delete(userId);
    activeChats.delete(other);
  }

  USERS.add(userId);

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei bottoni:`,
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
// CALLBACK
// =====================
bot.on("callback_query", (q) => {
  const userId = q.from.id;
  const chatId = q.message.chat.id;

  // RECENSIONI
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    reviewState.set(userId, rating);
    bot.answerCallbackQuery(q.id);
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nScrivi ora un commento:`);
    return;
  }

  // SPONSOR
  if (q.data === "OPEN_SPONSOR") {
    sponsorState.set(userId, { step: "DURATA" });
    bot.sendMessage(
      chatId,
      "*📢 Prezzi Sponsor*\n\n12h » 500\n24h » 1000\n36h » 1600\n48h » 2100\nPermanente » 3200",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "✅ Continua", callback_data: "SP_CONT" }]]
        }
      }
    );
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (q.data === "SP_CONT") {
    sponsorState.set(userId, { step: "TESTO" });
    bot.sendMessage(chatId, "✍️ Invia ora il testo del messaggio sponsor:");
    bot.answerCallbackQuery(q.id);
    return;
  }

  // MENU
  const menus = {
    OPEN_ASTA: [
      "ASTA",
      "🏷️ *Modulo Asta*\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio"
    ],
    OPEN_ORDINI: [
      "ORDINE",
      "📝 *Modulo Ordine*\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti"
    ],
    OPEN_ASSISTENZA: [
      "ASSISTENZA",
      "🆘 *Assistenza*\nScrivi la tua richiesta"
    ],
    OPEN_CANDIDATURA: [
      "CANDIDATURA",
`📝 *Modulo Candidatura Dipendente*

Compila il tuo curriculum su un libro seguendo questi punti:

1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome, ore settimanali e totali
2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni
3️⃣ *Perché dovremmo sceglierti?*
4️⃣ *Esperienze lavorative*
5️⃣ *Competenze pratiche*
6️⃣ *Pregi e difetti*

📍 *Consegna*: Bancarella 8, coordinate -505 64 22`
    ]
  };

  if (menus[q.data]) {
    userState.set(userId, menus[q.data][0]);
    bot.sendMessage(chatId, menus[q.data][1], { parse_mode: "Markdown" });
  }

  if (q.data === "OPEN_LISTINO") {
    bot.sendMessage(
      chatId,
      "📄 Listino:\nhttps://telegra.ph/Listino-CapyBar-02-07"
    );
  }

  if (q.data === "OPEN_REVIEW") {
    bot.sendMessage(chatId, "⭐ Scegli un voto:", {
      reply_markup: {
        inline_keyboard: [
          [1,2,3,4,5].map(n => ({
            text: `⭐ ${n}`,
            callback_data: `RATE_${n}`
          }))
        ]
      }
    });
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI (CHAT CONTINUA)
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  USERS.add(userId);

  // UTENTE -> ADMIN
  if (activeChats.has(userId) && !ADMINS.has(userId)) {
    const adminId = activeChats.get(userId);
    bot.sendMessage(
      adminId,
      `💬 *Messaggio da UTENTE*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escape(msg.text)}`,
      { parse_mode: "Markdown" }
    );
    bot.sendMessage(chatId, "✅ Messaggio inviato!");
    return;
  }

  // ADMIN -> UTENTE
  if (ADMINS.has(userId) && activeChats.has(userId)) {
    const target = activeChats.get(userId);
    bot.sendMessage(
      target,
      `💬 *Risposta da ADMIN*\n👤 ${msg.from.first_name}\n\n${escape(msg.text)}`,
      { parse_mode: "Markdown" }
    );
    bot.sendMessage(chatId, "✅ Messaggio inviato!");
    return;
  }

  // RECENSIONE COMMENTO
  if (reviewState.has(userId)) {
    const rating = reviewState.get(userId);
    reviewState.delete(userId);
    bot.sendMessage(
      chatId,
      `✅ Recensione inviata!\n⭐ ${rating}/5\n💬 ${escape(msg.text)}`
    );
    return;
  }

  // SPONSOR TESTO
  if (sponsorState.get(userId)?.step === "TESTO") {
    sponsorState.delete(userId);
    const admin = [...ADMINS][0];
    activeChats.set(userId, admin);
    activeChats.set(admin, userId);
    bot.sendMessage(
      admin,
      `📢 *Nuovo Sponsor*\n👤 ${msg.from.first_name}\n\n${escape(msg.text)}`,
      { parse_mode: "Markdown" }
    );
    bot.sendMessage(chatId, "✅ Sponsor inviato!");
    return;
  }

  // MODULI
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);
    const admin = [...ADMINS][0];
    activeChats.set(userId, admin);
    activeChats.set(admin, userId);
    bot.sendMessage(
      admin,
      `📩 *${type}*\n👤 ${msg.from.first_name}\n\n${escape(msg.text)}`,
      { parse_mode: "Markdown" }
    );
    bot.sendMessage(chatId, "✅ Messaggio inviato!");
  }
});

// =====================
// COMANDI ADMIN
// =====================
bot.onText(/\/admin add (\d+)/, (msg, m) => {
  if (msg.from.id !== SUPER_ADMIN) return;
  ADMINS.add(Number(m[1]));
  bot.sendMessage(msg.chat.id, "✅ Admin aggiunto");
});

bot.onText(/\/stats/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📊 Statistiche\n👥 Utenti: ${USERS.size}\n🎫 Chat attive: ${activeChats.size / 2}`
  );
});