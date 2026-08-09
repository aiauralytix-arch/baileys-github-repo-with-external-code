import { createServer } from 'http'
import { readBody, send } from '../helper-functions/misc.js'
import { deleteMessage, getGroups, removeGroupParticipants, sendTextMessage } from './baileys-functions.js'

const BAILEYS_SERVER_PORT = process.env.BAILEYS_SERVER_PORT

if (!BAILEYS_SERVER_PORT) {
	throw new Error('BAILEYS_SERVER_PORT is required')
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

		if (req.method === 'POST' && url.pathname === '/messages/text') {
			const body = await readBody(req)
			if (!body.to || !body.body) { return send(res, 400, { error: 'Both to and body are required' }) }

			const message = await sendTextMessage(body.to, body.body)
			return send(res, 200, { sent: true, message })
		}

		if (req.method === 'GET' && url.pathname === '/groups') {
			return send(res, 200, await getGroups())
		}

		// whapi sends [participants] in array only 
		// so we are just mimicing that
		const participantsPath = url.pathname.match(/^\/groups\/([^/]+)\/participants$/)
		if (req.method === 'DELETE' && participantsPath) {
			const body = await readBody(req)
			if (!Array.isArray(body.participants) || !body.participants.length || body.participants.some(participant => typeof participant !== 'string')) {
				return send(res, 400, { error: 'Participants are required' })
			}

			const result = await removeGroupParticipants(decodeURIComponent(participantsPath[1]), body.participants)
			return send(res, 200, { success: true, result })
		}

		const messageId = url.pathname.match(/^\/messages\/([^/]+)$/)?.[1]
		if (req.method === 'DELETE' && messageId) {
			await deleteMessage(decodeURIComponent(messageId))
			return send(res, 200, { success: true })
		}

		return send(res, 404, { error: 'Route not found' })
	} catch (err) {
		const status = err.message === 'WhatsApp socket is not connected' ? 503 : err.statusCode || 500
		return send(res, status, { error: err.message || 'Internal server error' })
	}
})

server.listen(BAILEYS_SERVER_PORT, () => {
	console.log(`Whapi-compatible server listening on http://localhost:${BAILEYS_SERVER_PORT}`)
})
