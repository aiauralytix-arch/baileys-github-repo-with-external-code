import { getMessageKey, getSocket, isBotConnected } from '../webhook-bot.js'
import { formatGroup, normalizeJid, requireSocket } from '../helper-functions/misc.js'

/**
 * Whapi-compatible actions backed by the live Baileys socket.
 *
 * WhatsAppWatch already calls Whapi-style endpoints for three moderation flows:
 *
 * - POST /messages/text for phone verification OTPs
 * - GET /groups for dashboard group verification
 * - DELETE /messages/:id when moderation decides a message is spam
 *
 * The HTTP server layer receives those requests, then calls these functions.
 * Keeping them here keeps the app-specific Whapi behavior separate from the
 * lower-level socket lifecycle in `webhook-bot.js`.
 */

/**
 * Sends the same kind of text message Whapi's /messages/text endpoint sends.
 * `to` can be a plain phone number or a full WhatsApp JID.
 */
export const sendTextMessage = async (to, body) => {
	if (!body || typeof body !== 'string') {
		throw new Error('Message body is required')
	}

	return requireSocket(getSocket(), isBotConnected()).sendMessage(normalizeJid(to), { text: body })
}

/**
 * Returns group metadata in the small Whapi-like shape expected by
 * whatsappwatch.com/app/api/whapi/groups/route.ts.
 */
export const getGroups = async () => {
	const groups = await requireSocket(getSocket(), isBotConnected()).groupFetchAllParticipating()
	return {
		groups: Object.values(groups).map(formatGroup)
	}
}

/**
 * Revokes a WhatsApp message by Whapi-style message id.
 *
 * Baileys needs the original message key to delete/revoke a message, so
 * `webhook-bot.js` stores keys in memory when inbound webhooks are received.
 * This means deletion works for messages seen since the current process started.
 */
export const deleteMessage = async messageId => {
	const key = getMessageKey(messageId)
	if (!key) {
		const error = new Error('Message key not found')
		error.statusCode = 404
		throw error
	}

	await requireSocket(getSocket(), isBotConnected()).sendMessage(key.remoteJid, { delete: key })
	return true
}
