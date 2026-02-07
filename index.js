import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN); // solo super admin può aggiungere/rimuovere admin
const ADMINS_FILE = path.join(process.cwd(), "admins.json");

// =====================
// BOT INIT
// =====================
if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ Config mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// MEMO
// =====================
let ADMINS = new Set([SUPER_ADMIN]);
if (fs.existsSync(ADMINS_FILE)) {
  const savedAdmins = JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
  savedAdmins.forEach(id => ADMINS.add(id));
}

const saveAdmins = () => {
  fs.writeFileSync(ADMINS_FILE, JSON.stringify([...ADMINS]));
};

const userState = new Map(); // userId -> tipo modulo ("ASSISTENZA", "ORDINE", etc.)
const adminReplyMap = {}; // adminId -> userId
const escape = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// BENVENUTO
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

bot.onText(/\/start/, (msg) => {
  bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
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
// CALLBACK QUERY (menu)
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;
  const userId = q.from.id;

  switch(q.data){
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, `⭐ *Lascia una recensione*\nSeleziona un voto da 1 a 5 stelle:`, {
        parse_mode:"Markdown",
        reply_markup:{ inline_keyboard:[
          [{ text:"⭐ 1", callback_data:"RATE_1" },{ text:"⭐ 2", callback_data:"RATE_2" },
           { text:"⭐ 3", callback_data:"RATE_3" },{ text:"⭐ 4", callback_data:"RATE_4" },
           { text:"⭐ 5", callback_data:"RATE_5" }]
        ]}
      });
      break;
    case "OPEN_LISTINO":
      bot.sendMessage(chatId, `📄 *Listino CapyBar*\n🔗 [Visualizza Listino](https://telegra.ph/Listino-CapyBar-02-07)`, { parse_mode:"Markdown"});
      break;
    case "OPEN_ASTA":
      userState.set(userId,"ASTA");
      bot.sendMessage(chatId, `🏷️ *Modulo Asta*\nScrivi in un unico messaggio:\n1️⃣ *Nickname*\n2️⃣ *Oggetto/i*\n3️⃣ *Prezzo base*\n4️⃣ *Rilancio`, { parse_mode:"Markdown"});
      break;
    case "OPEN_ORDINI":
      userState.set(userId,"ORDINE");
      bot.sendMessage(chatId, `📝 *Modulo Ordinazioni*\nScrivi in un unico messaggio:\n1️⃣ *Nickname*\n2️⃣ *@Telegram*\n3️⃣ *Prodotti desiderati`, { parse_mode:"Markdown"});
      break;
    case "OPEN_ASSISTENZA":
      userState.set(userId,"ASSISTENZA");
      bot.sendMessage(chatId, `🆘 *Assistenza*\nSe hai bisogno di aiuto contatta un admin o scrivi qui la tua richiesta.`, { parse_mode:"Markdown"});
      break;
    case "OPEN_SPONSOR":
      userState.set(userId,"SPONSOR");
      bot.sendMessage(chatId, `📢 *Richiesta Sponsor*\nScrivi tipo, durata, dettagli aggiuntivi`, { parse_mode:"Markdown"});
      break;
    case "OPEN_CANDIDATURA":
      userState.set(userId,"CANDIDATURA");
      bot.sendMessage(chatId, `📝 *Modulo Candidatura Dipendente*\n\n1️⃣ *Dati personali*: @Telegram, Discord, telefono, nome e ore disponibili\n2️⃣ *Parlaci di te*: passioni, motivazioni\n3️⃣ *Perché dovremmo sceglierti?*\n4️⃣ *Esperienze lavorative*\n5️⃣ *Competenze pratiche*\n6️⃣ *Pregi e difetti\n\n📍 *Consegna*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`, { parse_mode:"Markdown"});
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI UTENTE E MODULI
bot.on("message", (msg) => {
  if(!msg.text) return;
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // comandi /admin add/remove
  if(msg.text.startsWith("/admin")){
    if(userId !== SUPER_ADMIN){
      bot.sendMessage(chatId,"❌ Solo il super admin può usare questo comando.");
      return;
    }
    const parts = msg.text.split(" ");
    if(parts.length<3){ bot.sendMessage(chatId,"❌ Usa /admin add|remove ID"); return;}
    const action = parts[1];
    const target = Number(parts[2]);
    if(action==="add"){ ADMINS.add(target); saveAdmins(); bot.sendMessage(chatId,"✅ Admin aggiunto!"); }
    else if(action==="remove"){ ADMINS.delete(target); saveAdmins(); bot.sendMessage(chatId,"✅ Admin rimosso!"); }
    else bot.sendMessage(chatId,"❌ Azione non valida.");
    return;
  }

  // MODULI / ASSISTENZA
  if(userState.has(userId)){
    const tipo = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(chatId, tipo==="ASSISTENZA" ? "✅ Messaggio inviato correttamente!" : "✅ Modulo inviato con successo!");

    ADMINS.forEach(adminId=>{
      bot.sendMessage(adminId, `📩 *${tipo}*\n👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})\n🆔 ${userId}\n\n${escape(msg.text)}`, {parse_mode:"Markdown"});
      adminReplyMap[adminId]=userId;
    });
    return;
  }

  // RISPOSTE ADMIN → utente
  if(ADMINS.has(userId) && adminReplyMap[userId]){
    const targetUser = adminReplyMap[userId];
    bot.sendMessage(targetUser, `💬 *Risposta da admin ${msg.from.first_name}:*\n\n${escape(msg.text)}`, {parse_mode:"Markdown"});
    bot.sendMessage(chatId,"✅ Messaggio inviato correttamente!");
    // tutti gli altri admin vedono la risposta
    ADMINS.forEach(adminId=>{
      if(adminId!==userId){
        bot.sendMessage(adminId, `💬 Admin ${msg.from.first_name} ha risposto a ${targetUser}: ${escape(msg.text)}`, {parse_mode:"Markdown"});
      }
    });
    delete adminReplyMap[userId];
    return;
  }
});