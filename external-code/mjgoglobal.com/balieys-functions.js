import { jidDecode } from '../../lib/index.js'

/**
 * mjgoglobal-specific Baileys actions.
 *
 * Keep app-specific message templates and send helpers here so `webhook-bot.js`
 * only owns the socket lifecycle and event wiring.
 */

const jidName = jid => jidDecode(jid)?.user || jid

const participantName = participant =>
	participant?.username || jidName(participant?.phoneNumber) || jidName(participant?.id) || 'there'

const GROUP_JOIN_GROUP_MESSAGE = `Hi {names}, welcome to {groupName}.

We have sent you a quick DM with free study abroad guidance, fee waiver details, and our counsellor contact
numbers. Please check your WhatsApp messages.`

const GROUP_JOIN_DM_MESSAGE = `Get 100% App fee waiver + Hassle FREE Application support  for
USA, Australia, Canada, Ireland, New Zealand, Europe, the UK, or
other countries?

Our FREE Services includes:

1.  Profile Evaluation with senior Counselor
2.  University Shortlisting
3.  100% Application Fee Waiver (Check with us for details)
4.  Application Support
5.  SOP/LOR Assistance
6.  Scholarship/Assistantship Guidance
7.  Visa Support
8.  Education Loan Support
9.  IELTS/TOEFL/GRE/GMAT coaching and mock tests at very
    nominal price.

for details contact us @9310017599 or 8802880181.

Connect with like minded people, join Study Abroad community
: https://chat.whatsapp.com/I5OrT8u6AaC8LAPoCVyDpu

MJ Study Abroad
(Authorized partner of ETS)
Shaping Careers Since 1998.`

/**
 * Builds the group welcome text for one participant-update event.
 *
 * `participants` should come directly from Baileys `group-participants.update`.
 * When Baileys emits multiple added participants in one event, the template
 * keeps them in one group message instead of sending repeated messages.
 */
export const renderGroupJoinMessage = ({ participants, groupId, groupName }) => {
	const names = (participants || []).map(participantName).filter(Boolean)
	const displayNames = names.length ? names.join(', ') : 'there'
	const displayGroup = groupName || groupId || 'the group'

	return GROUP_JOIN_GROUP_MESSAGE
		.replace('{names}', displayNames)
		.replace('{groupName}', displayGroup)
}

/**
 * Sends a text message with the provided Baileys socket.
 *
 * For group welcome messages, `to` is the group JID. This helper intentionally
 * does not normalize the recipient into a user JID so group JIDs pass through.
 */
export const sendTextMessage = async (sock, to, body) => {
	if (!sock) {
		throw new Error('WhatsApp socket is required')
	}

	if (!to || typeof to !== 'string') {
		throw new Error('Recipient is required')
	}

	if (!body || typeof body !== 'string') {
		throw new Error('Message body is required')
	}

	return sock.sendMessage(to, { text: body })
}

/**
 * Sends the group-join welcome message into the group chat and directly to
 * each new participant.
 */
export const sendGroupJoinMessage = async (sock, { groupId, participants, groupName }) => {
	if (!groupId || typeof groupId !== 'string') {
		throw new Error('Group id is required')
	}

	const groupBody = renderGroupJoinMessage({ participants, groupId, groupName })
	const groupResult = await sendTextMessage(sock, groupId, groupBody)
	const dmResults = await Promise.all(
		(participants || []).map(participant =>
			sendTextMessage(sock, participant.phoneNumber || participant.id, GROUP_JOIN_DM_MESSAGE)
		)
	)

	return {
		group: groupResult,
		dms: dmResults
	}
}
