import { createServer } from 'http'
import { readBody, send } from '../helper-functions/misc.js'
import { deleteMessage, getGroups, sendTextMessage } from './baileys-functions.js'

const BAILEYS_SERVER_PORT = 3333

const server = createServer(async (req, res) => {
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

	const messageId = url.pathname.match(/^\/messages\/([^/]+)$/)?.[1]
	if (req.method === 'DELETE' && messageId) {
		await deleteMessage(decodeURIComponent(messageId))
		return send(res, 200, { success: true })
	}

	return send(res, 404, { error: 'Route not found' })
})

server.listen(BAILEYS_SERVER_PORT, () => {
	console.log(`Whapi-compatible server listening on http://localhost:${BAILEYS_SERVER_PORT}`)
})
