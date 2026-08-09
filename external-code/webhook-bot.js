import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, proto } from '../lib/index.js'
import P from 'pino'
import qrcode from 'qrcode-terminal'
import { pathToFileURL } from 'url'
import { createAuthState, loadAuth } from './helper-functions/misc.js'
import { sendGroupJoinMessage } from './mjgoglobal.com/balieys-functions.js'
import { sendMessagesWebhook } from './whatsappwatch.com/webhook-functions.js'

const PHONE_NUMBER_USED_BY_BAILYES = '919555488118'
const USE_PAIRING_CODE = false

const authFile = 'webhook-session.json'
const logger = P({ level: process.env.LOG_LEVEL || 'info' })
const messageKeys = new Map()

let sock
let startPromise
let persistAuth = true
let connected = false

export const isBotConnected = () => connected
export const getSocket = () => sock
export const getMessageKey = messageId => messageKeys.get(messageId)

const connectBot = async () => {
	const auth = await loadAuth(authFile)
	const { state, saveAuth, writeAuth } = createAuthState(auth, authFile, () => persistAuth)
	const { version } = await fetchLatestBaileysVersion()


	// ============================================================
	// ================= HANDLE CONNECTION ========================
	// ============================================================

	sock = makeWASocket({
		version,
		auth: state,
		syncFullHistory: false,
		shouldSyncHistoryMessage: ({ syncType }) => syncType === proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP,
		logger
	})

	sock.ev.on('creds.update', saveAuth)

	sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
		if (qr && !sock.authState.creds.registered) {
			if (USE_PAIRING_CODE) {
				const code = await sock.requestPairingCode(PHONE_NUMBER_USED_BY_BAILYES)
				logger.info({ code, phoneNumber: PHONE_NUMBER_USED_BY_BAILYES }, 'pair this code in WhatsApp linked devices')
			} else {
				qrcode.generate(qr, { small: true })
				logger.info('scan the QR code in WhatsApp linked devices')
			}
		}

		if (connection === 'open') {
			connected = true
			await writeAuth()
			persistAuth = false
			logger.info('connected; auth persistence paused')
		}

		if (connection === 'close') {
			if (sock.authState.creds.registered) {
				await writeAuth()
				logger.info('saved auth after pairing restart')
			}

			// note: added this so we restart websocket-connection on deployed-server
			connected = false
			const reason = lastDisconnect?.error?.output?.statusCode
			if (reason === DisconnectReason.restartRequired) {
				startPromise = undefined
				await startBot()
			}
		}
	})


	// ============================================================
	// ================ ACTIONS ON NEW MESSAGE ====================
	// ============================================================

	sock.ev.on('messages.upsert', async ({ messages, type }) => {
		if (type !== 'notify') { return }

		const incomingMessages = messages.filter(message => !message.key.fromMe)
		logger.info({ count: incomingMessages.length }, 'received incoming WhatsApp messages')

		for (const message of incomingMessages) {
			if (message.key.id) {
				messageKeys.set(message.key.id, message.key)
			}
		}

		try {
			await sendMessagesWebhook(incomingMessages)
		} catch (err) {
			logger.warn({ err }, 'failed to send incoming messages webhook')
		}
	})


	// ============================================================
	// =================== ON NEW USER JOINS ======================
	// ============================================================

	sock.ev.on('group-participants.update', async update => {
		if (update.action !== 'add') { return }

		let groupName
		try {
			const metadata = await sock.groupMetadata(update.id)
			groupName = metadata.subject
		} catch (err) {
			logger.warn({ err, groupId: update.id }, 'failed to fetch group metadata for welcome message')
		}

		try {
			await sendGroupJoinMessage(sock, { groupId: update.id, participants: update.participants, groupName })
			logger.info({ groupId: update.id, participants: update.participants.map(participant => participant.id) }, 'sent group join welcome message')
		} catch (err) {
			logger.warn({ err, groupId: update.id, participants: update.participants.map(participant => participant.id) }, 'failed to send group join welcome message')
		}
	})

	return sock
}

// ============================================================
// ===================== MAIN START ===========================
// ============================================================


export const startBot = async () => {
	if (startPromise) {
		return startPromise
	}

	startPromise = connectBot()
	return startPromise
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	import('./whatsappwatch.com/request-handler-server.js')  // STARTS THE SERVER FOR WHATSAPPWATC
		.then(() => startBot())
		.catch(err => {
			logger.error({ err }, 'failed to start WhatsApp bot')
			process.exitCode = 1
		})
}
