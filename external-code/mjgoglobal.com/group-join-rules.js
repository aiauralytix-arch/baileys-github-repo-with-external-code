import { jidDecode } from '../../lib/index.js'


// =============================================================================
// ================= TAKE ACTION ONLY IN PRIVATE GROUPS  =======================
// =============================================================================

const VERIFIED_WHAPI_GROUP_IDS = new Set([
	'120363337486847546@g.us',
	'120363346214043982@g.us',
	'120363222666689356@g.us',
	'120363283301438402@g.us',
	'120363337450792591@g.us',
	'12036314637458436@g.us',
	'120363398425264034@g.us',
	'120363358400194219@g.us',
	'120363045434480329@g.us',
	'120363316669995874@g.us',
	'120363362652476626@g.us'
])
export const isVerifiedPrivateGroup = groupId => VERIFIED_WHAPI_GROUP_IDS.has(groupId)


// =============================================================================
// ============================= STOP DM DUPLICATION  ==========================
// =============================================================================


const GROUP_JOIN_DM_DEDUPE_MS = 10 * 60 * 1000
const recentGroupJoinDmRecipients = new Set()

export const getEligibleGroupJoinDmRecipients = participants => {

	// get unique users from set
	const candidateRecipientJids = new Set((participants || []).map(groupJoinParticipantJid))

	// check if they are indian or us or other
	const eligibleRecipientJids = [...candidateRecipientJids].filter(canSendGroupJoinDm)

	// block numbers who we already dm and going to dm again
	for (const recipientJid of eligibleRecipientJids) {
		recentGroupJoinDmRecipients.add(recipientJid)

		// delete the user from set after 10 mins
		setTimeout(() => recentGroupJoinDmRecipients.delete(recipientJid), GROUP_JOIN_DM_DEDUPE_MS)
	}

	return eligibleRecipientJids
}


// MISC CODE

const canSendGroupJoinDm = jid => {
	if (!jid || recentGroupJoinDmRecipients.has(jid)) { return false }
	const isIndianOrUsPhoneNumber = phoneNumber => (phoneNumber?.length === 12 && phoneNumber.startsWith('91')) || phoneNumber?.length === 11 && phoneNumber.startsWith('1')
	return isIndianOrUsPhoneNumber(phoneNumberFromJid(jid))
}

const phoneNumberFromJid = jid => {
	const decoded = jidDecode(jid)
	if (decoded && decoded.server !== 's.whatsapp.net') { return undefined }
	return (decoded?.user || jid)?.replace(/\D/g, '')
}

const groupJoinParticipantJid = participant => participant?.phoneNumber || participant?.id
