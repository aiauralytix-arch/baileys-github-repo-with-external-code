import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { getQrLoginStatus } from '../webhook-bot.js'

const QR_LOGIN_PORT = process.env.QR_LOGIN_PORT

if (!QR_LOGIN_PORT) { throw new Error('QR_LOGIN_PORT is required') }

const qrLoginPage = new URL('./index.html', import.meta.url)

const server = createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

	if (req.method !== 'GET' || url.pathname !== '/') {
		res.writeHead(404, { 'content-type': 'text/plain' })
		return res.end('Not found')
	}

	const html = (await readFile(qrLoginPage, 'utf-8')).replace('__QR_LOGIN_STATUS__', JSON.stringify(getQrLoginStatus()))
	res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' })
	return res.end(html)
})

server.listen(QR_LOGIN_PORT, () => {
	console.log(`QR login server listening on http://localhost:${QR_LOGIN_PORT}`)
})
