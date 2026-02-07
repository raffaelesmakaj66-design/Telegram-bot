import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ Config mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// FILES
// =====================
const ADMINS_FILE = "./admins.json";
const REVIEWS_FILE = "./reviews.json";
const CHATLOG_FILE = "./chatlog.json";

// =====================
// CARICAMENTO ADMINS
// =====================
let ADMINS = new Set([SUPER_ADMIN]);
if (fs.existsSync(ADMINS_FILE)) {
  const savedAdmins = JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
  savedAdmins.forEach(id => ADMINS.add(Number(id)));
}
const saveAdmins = () => fs.writeFileSync(ADMINS_FILE, JSON.stringify([...ADMINS]));

// =====================
// RECENSIONI
// =====================
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));
const loadReviews = () => JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
const saveReviews = (reviews) => fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
const saveReview = (review) => { const r = loadReviews(); r.push(review); saveReviews(r); };
const getAverage = () => { const r = loadReviews(); return r.length ? (r.reduce((a,b)=>a+b.rating,0)/r.length).toFixed(1) : "0.0"; };

// =====================
// CHATLOG
// =====================
if (!fs.existsSync(CHATLOG_FILE)) fs.writeFileSync(CHATLOG_FILE, JSON.stringify([]));
const saveLog = (entry) => {
  const logs = JSON.parse(fs.readFileSync(CHATLOG_FILE, "utf8"));
  logs.push(entry);
  fs.writeFileSync(CHATLOG_FILE, JSON.stringify(logs, null, 2));
};

// =====================
// STATI
// =====================
const reviewState = new Map(); // userId -> { rating, chatId, waitingComment }
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60*1000;

const userState = new Map(); // userId -> tipo modulo (ASSISTENZA, ORDINE, ASTA, SPONSOR)
const chatMap = new Map(); // userId -> adminId (l’admin attuale che gestisce l’utente)
const adminChatMap = new Map(); // adminId -> userId (l’utente a cui sta rispondendo)

const escape = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// BENVENUTO
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei bottoni per continuare:`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Canale", url: CHANNEL_URL }],
        [{ text: "⚖️ Aste", callback_data: "OPEN_ASTA" }, { text: "📄 Listino", callback_data: "OPEN_LISTINO" }],
        [{ text: "📝 Ordina", callback_data: "OPEN_ORDINI" }, { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }],
        [{ text: "⭐ Lascia una Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "📢 Richiedi Sponsor", callback_data: "OPEN_SPONSOR" }],
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

  // RECENSIONE
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    if (now - (reviewCooldown.get(userId) || 0) < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi un po’", show_alert: true });
      return;
    }
    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, chatId, waitingComment: true });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nScrivi un commento o premi Skip`, {
      reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] }
    });
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    saveReview({ rating, comment: null, userId });
    bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ ${rating}/5`);
    ADMINS.forEach(a => bot.sendMessage(a, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`));
    reviewState.delete(userId);
    return;
  }

  // MENU
  switch(q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ Scegli un voto:", { reply_markup:{ inline_keyboard:[[1,2,3,4,5].map(n=>({text:`⭐ ${n}`, callback_data:`RATE_${n}`}))] }});
      break;
    case "OPEN_LISTINO":
      bot.sendMessage(chatId, "*Listino Sponsor*\n• Base 1k\n• Medio 2.5k\n• Premium 5k\n• Elite 10k", {parse_mode:"Markdown"});
      break;
    case "OPEN_ASTA":
      userState.set(userId,"ASTA");
      bot.sendMessage(chatId, "*Modulo Asta*\n1️⃣ Nickname\n2️⃣ Oggetto\n3️⃣ Prezzo base\n4️⃣ Rilancio", {parse_mode:"Markdown"});
      break;
    case "OPEN_ORDINI":
      userState.set(userId,"ORDINE");
      bot.sendMessage(chatId, "*Modulo Ordini*\n1️⃣ Nickname\n2️⃣ @Telegram\n3️⃣ Prodotti", {parse_mode:"Markdown"});
      break;
    case "OPEN_ASSISTENZA":
      userState.set(userId,"ASSISTENZA");
      bot.sendMessage(chatId,"🆘 Scrivi il messaggio per l’assistenza");
      break;
    case "OPEN_SPONSOR":
      userState.set(userId,"SPONSOR");
      bot.sendMessage(chatId,"📢 Scrivi la richiesta sponsor");
      break;
    case "OPEN_CANDIDATURA":
      bot.sendMessage(chatId,`📝 *Come fare il curriculum*\n1️⃣ Dati personali\n2️⃣ Parlaci di te\n3️⃣ Perché dovremmo sceglierti\n4️⃣ Esperienze\n5️⃣ Competenze\n6️⃣ Pregi e difetti\n\n📍 Bancarella 8`,{parse_mode:"Markdown"});
      break;
  }
  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI UTENTE E ADMIN
// =====================
bot.on("message", (msg) => {
  if (!msg.text) return;
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // COMMENTO RECENSIONE
  if (reviewState.has(userId) && reviewState.get(userId).waitingComment) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    saveReview({ rating, comment: escape(msg.text), userId });
    bot.sendMessage(chatId, "✅ Recensione inviata correttamente!");
    ADMINS.forEach(a => bot.sendMessage(a, `⭐ Recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escape(msg.text)}`,{parse_mode:"Markdown"}));
    return;
  }

  // MODULI / ASSISTENZA UTENTE
  if (userState.has(userId)) {
    const tipo = userState.get(userId);
    userState.delete(userId);

    const textUser = tipo==="ASSISTENZA" ? "✅ Messaggio inviato con successo!" : "✅ Modulo inviato con successo!";
    bot.sendMessage(chatId,textUser);

    // Inoltra a tutti gli admin
    ADMINS.forEach(a=>{
      bot.sendMessage(a, `📩 *${tipo}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escape(msg.text)}`, {parse_mode:"Markdown"});
    });

    // associa admin disponibile per rispondere
    const firstAdmin = [...ADMINS][0];
    chatMap.set(userId, firstAdmin);
    adminChatMap.set(firstAdmin, userId);

    return;
  }

  // RISPOSTA ADMIN
  if (ADMINS.has(userId)) {
    const targetUser = adminChatMap.get(userId);
    if(targetUser){
      bot.sendMessage(targetUser, `💬 *Risposta da ${msg.from.first_name}:*\n\n${escape(msg.text)}`, {parse_mode:"Markdown"});
      bot.sendMessage(chatId,"✅ Messaggio inviato con successo!");

      saveLog({ type:"admin_reply", adminId:userId, userId:targetUser, text:msg.text, timestamp:new Date().toISOString() });

      // tutti gli altri admin vedono la risposta
      ADMINS.forEach(a=>{
        if(a!==userId){
          bot.sendMessage(a, `💬 *Admin ${msg.from.first_name} ha risposto a ${targetUser}:*\n${escape(msg.text)}`, {parse_mode:"Markdown"});
        }
      });
    }
    return;
  }
});

// =====================
// /admin add/remove
// =====================
bot.onText(/\/admin add (\d+)/, (msg, match)=>{
  if(msg.from.id!==SUPER_ADMIN) return bot.sendMessage(msg.chat.id,"❌ Solo il super admin può usare questo comando.");
  const newId = Number(match[1]);
  ADMINS.add(newId);
  saveAdmins();
  bot.sendMessage(msg.chat.id, `✅ Admin aggiunto: ${newId}`);
});

bot.onText(/\/admin remove (\d+)/, (msg, match)=>{
  if(msg.from.id!==SUPER_ADMIN) return bot.sendMessage(msg.chat.id,"❌ Solo il super admin può usare questo comando.");
  const id = Number(match[1]);
  ADMINS.delete(id);
  saveAdmins();
  bot.sendMessage(msg.chat.id, `✅ Admin rimosso: ${id}`);
});

// =====================
// /delreview
// =====================
bot.onText(/\/delreview(?: (\d+))?/, (msg, match)=>{
  const chatId = msg.chat.id;
  if(!ADMINS.has(msg.from.id)) return bot.sendMessage(chatId,"❌ Solo admin può usare questo comando.");

  let reviews = loadReviews();
  if(reviews.length===0) return bot.sendMessage(chatId,"⚠️ Nessuna recensione presente.");

  const targetUser = match[1] ? Number(match[1]) : null;
  if(targetUser){
    const before = reviews.length;
    reviews = reviews.filter(r=>r.userId!==targetUser);
    saveReviews(reviews);
    bot.sendMessage(chatId, `✅ Eliminate ${before-reviews.length} recensioni dell'utente ${targetUser}.`);
  } else {
    const last = reviews.pop();
    saveReviews(reviews);
    bot.sendMessage(chatId, `✅ Eliminata l'ultima recensione di ⭐ ${last.rating}/5`);
  }
});

// =====================
// /id
// =====================
bot.onText(/\/id/, (msg)=>bot.sendMessage(msg.chat.id,`🆔 Il tuo ID Telegram è: ${msg.from.id}`));