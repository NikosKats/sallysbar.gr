const BASE = `https://api.telegram.org/bot${import.meta.env.TELEGRAM_BOT_TOKEN}`;

async function post(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function sendMessage(
  chat_id: string | number,
  text: string,
  extra?: Record<string, unknown>
) {
  return post("sendMessage", { chat_id, text, parse_mode: "HTML", ...extra });
}

export async function editMessageText(
  chat_id: string | number,
  message_id: number,
  text: string,
  extra?: Record<string, unknown>
) {
  return post("editMessageText", {
    chat_id,
    message_id,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

export async function answerCallbackQuery(
  callback_query_id: string,
  text?: string,
  show_alert?: boolean
) {
  return post("answerCallbackQuery", { callback_query_id, text, show_alert });
}

export async function deleteMessage(
  chat_id: string | number,
  message_id: number
) {
  return post("deleteMessage", { chat_id, message_id });
}
