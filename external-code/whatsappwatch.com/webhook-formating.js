import { getDevice, jidDecode } from '../../lib/index.js'

/**
 * Baileys -> Whapi webhook compatibility layer.
 *
 * WhatsAppWatch was originally wired around Whapi webhook payloads. The local
 * Baileys bridge should keep sending that same shape so the existing Next.js
 * moderation pipeline can keep working without changes:
 *
 * - app/api/whapi/webhook/route.ts receives this payload
 * - whapi-webhook.service.ts extracts messages from `payload.messages`
 * - moderation rules decide whether to call DELETE /messages/:id later
 *
 * This file intentionally formats metadata only. It does not download media,
 * store messages, or call WhatsApp. Baileys owns the socket; this module only
 * converts one batch of Baileys messages into a Whapi-like JSON body.
 */
const channelId = 'MANTIS-FSX25'
const event = { type: 'messages', event: 'post' }

// Baileys nests real message content under wrappers for disappearing/view-once
// messages. Whapi payloads expect the actual content directly, so unwrap once.
const contentOf = message => {
	let content = message?.message
	for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
		content = content?.[key]?.message || content
	}

	return content
}

// Whapi uses bare sender ids in fixtures. Baileys usually provides full JIDs.
const jidUser = jid => jidDecode(jid)?.user || jid
// Prefer PN aliases over LIDs so `from` matches Whapi's phone-number sender id.
const senderJid = message => message.key.participantAlt || message.key.remoteJidAlt || message.key.participant || message.key.remoteJid

// Baileys timestamps and file sizes can be Long-like objects; Whapi fixtures
// use plain JSON numbers.
const num = value => (typeof value === 'number' ? value : value?.toNumber?.() ?? (value ? Number(value) : undefined))
const b64 = value => (value ? Buffer.from(value).toString('base64') : undefined)
const preview = value => {
	const image = b64(value)
	return image ? `data:image/jpeg;base64,${image}` : undefined
}

// Whapi has a loose `source` field. We infer mobile/web from the message id the
// same way Baileys' helper predicts the sender device.
const source = id => {
	const device = getDevice(id || '')
	return device === 'ios' || device === 'android' ? 'mobile' : 'web'
}

// Shared Whapi message fields used by every message type in the fixtures.
const base = message => {
	const sender = senderJid(message)

	return {
		id: message.key.id,
		from_me: !!message.key.fromMe,
		chat_id: message.key.remoteJid,
		timestamp: num(message.messageTimestamp),
		source: source(message.key.id),
		chat_name: '', // TODO: populate chat_name after brainstorming.
		from: jidUser(sender),
		from_name: message.pushName
	}
}

// Whapi stores type-specific data under a key with the same name as `type`.
const withType = (message, type, body) => {
	const { id, from_me, chat_id, timestamp, source, chat_name, from, from_name } = base(message)

	return {
		id,
		from_me,
		type,
		chat_id,
		timestamp,
		source,
		chat_name,
		[type]: body,
		from,
		from_name
	}
}

// Media messages only forward metadata already present in the Baileys payload.
// No media download is attempted here.
const media = (message, content, prefix, extra = {}) => ({
	id: [prefix, b64(content.fileSha256)?.slice(0, 24), message.key.id].filter(Boolean).join('-'),
	mime_type: content.mimetype,
	file_size: num(content.fileLength),
	sha256: b64(content.fileSha256),
	caption: content.caption,
	width: content.width,
	height: content.height,
	preview: preview(content.jpegThumbnail),
	...extra
})

const textMessage = (message, body) => withType(message, 'text', { body })

const linkPreview = (message, content) => {
	const body = content.text || content.matchedText || content.canonicalUrl
	const url = content.canonicalUrl || content.matchedText

	// Plain URL text without preview metadata should remain a text message; the
	// moderation service already checks text messages for links.
	return url || content.title || content.description
		? withType(message, 'link_preview', { body, url, title: content.title, description: content.description })
		: textMessage(message, body)
}

const groupInvite = (message, content) => {
	const url = content.inviteCode ? `https://chat.whatsapp.com/${content.inviteCode}` : undefined
	return withType(message, 'group_invite', {
		body: content.caption || url,
		url,
		title: content.groupName,
		invite_code: content.inviteCode,
		id: ['file', message.key.id].join('-'),
		sha256: b64(content.jpegThumbnail),
		description: content.groupName,
		preview: preview(content.jpegThumbnail)
	})
}

/**
 * Returns one Whapi-style message, or null when the Baileys message type is not
 * needed by the current moderation/webhook flow. Unsupported messages are
 * skipped instead of being sent as partial or malformed Whapi records.
 */
export const formatMessage = message => {
	const content = contentOf(message)
	const contact = content?.contactMessage || content?.contactsArrayMessage?.contacts?.[0]

	if (content?.conversation) return textMessage(message, content.conversation)
	if (content?.extendedTextMessage?.text) return linkPreview(message, content.extendedTextMessage)
	if (content?.imageMessage) return withType(message, 'image', media(message, content.imageMessage, 'jpeg'))
	if (content?.videoMessage) return withType(message, 'video', media(message, content.videoMessage, 'mp4', { seconds: content.videoMessage.seconds }))
	if (contact) return withType(message, 'contact', { name: contact.displayName, vcard: contact.vcard })
	if (content?.groupInviteMessage) return groupInvite(message, content.groupInviteMessage)
	return null
}

/**
 * Formats a Baileys message batch as the Whapi `messages.post` webhook body.
 *
 * The envelope shape is intentionally stable because WhatsAppWatch code reads
 * `messages`, `event`, and `channel_id` exactly like Whapi fixtures.
 */
export const formatMessagesWebhook = messages => ({
	messages: messages.map(formatMessage).filter(Boolean),
	event,
	channel_id: channelId
})
