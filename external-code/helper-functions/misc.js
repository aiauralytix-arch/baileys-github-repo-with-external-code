import { BufferJSON, initAuthCreds, proto } from '../../lib/index.js'
import { readFile, writeFile } from 'fs/promises'

/**
 * Loads the compact single-file Baileys auth snapshot.
 *
 * This intentionally avoids Baileys' multi-file auth helper because this local
 * bridge is meant to keep storage small and easy to inspect.
 */
export const loadAuth = async authFile =>
	readFile(authFile, 'utf-8')
		.then(data => JSON.parse(data, BufferJSON.reviver))
		.catch(() => ({ creds: initAuthCreds(), keys: {} }))

/**
 * Builds the auth object Baileys expects from our compact auth snapshot.
 *
 * `shouldSave` lets the bot pause disk writes after a stable connection while
 * still keeping the live in-memory auth state updated.
 */
export const createAuthState = (auth, authFile, shouldSave) => {
	const writeAuth = () => writeFile(authFile, JSON.stringify(auth, BufferJSON.replacer))
	const saveAuth = () => (shouldSave() || !auth.creds.registered ? writeAuth() : undefined)

	return {
		state: {
			creds: auth.creds,
			keys: {
				get: async (type, ids) => {
					const data = {}
					for (const id of ids) {
						let value = auth.keys[type]?.[id]
						if (type === 'app-state-sync-key' && value) {
							value = proto.Message.AppStateSyncKeyData.fromObject(value)
						}

						data[id] = value
					}

					return data
				},
				set: async data => {
					for (const category of Object.keys(data)) {
						auth.keys[category] ||= {}
						for (const id of Object.keys(data[category])) {
							const value = data[category][id]
							if (value) {
								auth.keys[category][id] = value
							} else {
								delete auth.keys[category][id]
							}
						}
					}

					await saveAuth()
				}
			}
		},
		saveAuth,
		writeAuth
	}
}

/**
 * Converts a Whapi `to` value into the JID Baileys needs.
 *
 * Existing JIDs are passed through. Plain phone numbers are stripped to digits
 * and treated as one-to-one WhatsApp users.
 */
export const normalizeJid = value => {
	if (!value || typeof value !== 'string') {
		throw new Error('Recipient is required')
	}

	if (value.includes('@')) {
		return value
	}

	const digits = value.replace(/[^\d]/g, '')
	if (!digits) {
		throw new Error('Recipient is invalid')
	}

	return `${digits}@s.whatsapp.net`
}

/**
 * Converts Baileys group metadata into the small Whapi-like group shape used by
 * WhatsAppWatch's `/api/whapi/groups` route.
 */
export const formatGroup = group => ({
	id: group.id,
	name: group.subject || null,
	description: group.desc || null,
	participants_count: group.size || group.participants?.length || 0,
	participants: (group.participants || []).map(participant => ({
		id: participant.id,
		rank:
			participant.isSuperAdmin || participant.admin === 'superadmin'
				? 'creator'
				: participant.isAdmin || participant.admin === 'admin'
					? 'admin'
					: 'member'
	}))
})

/**
 * Returns the live socket or throws the same operational error the HTTP layer
 * maps to a 503 response.
 */
export const requireSocket = (sock, connected) => {
	if (!sock || !connected) {
		throw new Error('WhatsApp socket is not connected')
	}

	return sock
}

export const send = (res, status, data) => {
	res.writeHead(status, { 'content-type': 'application/json' })
	res.end(JSON.stringify(data))
}

export const readBody = req =>
	new Promise((resolve, reject) => {
		let data = ''
		req.on('data', chunk => (data += chunk))
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {})
			} catch (err) {
				reject(err)
			}
		})
		req.on('error', reject)
	})
