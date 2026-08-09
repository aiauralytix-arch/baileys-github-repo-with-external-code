import { formatMessagesWebhook } from './webhook-formating.js'

const WHATSAPP_WATCH_WEBHOOK_URL = process.env.WHATSAPP_WATCH_WEBHOOK_URL

export const sendMessagesWebhook = async incomingMessages => {
    const payload = formatMessagesWebhook(incomingMessages)
    if (!payload.messages.length) {
        return
    }

    await fetch(WHATSAPP_WATCH_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
    })
}
