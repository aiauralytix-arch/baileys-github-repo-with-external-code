import { jidDecode } from '../../lib/index.js'
import { formatGroup } from '../helper-functions/misc.js'

/**
 * Formats Baileys group metadata for the WhatsAppWatch `/groups` endpoint.
 *
 * Baileys often reports group members by LID (`...@lid`). The dashboard verifies
 * admins by phone number, so this formatter resolves admin LIDs to PN JIDs when
 * Baileys already has that mapping, then returns digits-only admin ids.
 */
const jidNumber = jid => jidDecode(jid)?.user

const isAdmin = participant =>
	participant?.isSuperAdmin ||
	participant?.isAdmin ||
	participant?.admin === 'superadmin' ||
	participant?.admin === 'admin'

/**
 * Returns a Whapi-like group object with phone-number `admin_ids`.
 *
 * Unresolved LID admins are omitted from `admin_ids`. When an admin number is
 * resolved, the matching `participants[].id` is also rewritten so callers that
 * derive admin ids from participant ranks see the same phone-number value.
 */
export const formatGroupForGroupsEndpoint = async (sock, group) => {
	const formattedGroup = formatGroup(group)
	const adminPairs = await Promise.all(
		(group.participants || []).filter(isAdmin).map(async participant => ({
			lid: participant.id,
			number:
				jidNumber(participant.phoneNumber) ||
				jidNumber(await sock.signalRepository?.lidMapping?.getPNForLID(participant.id))
		}))
	)
	const adminNumbersByLid = new Map(adminPairs.filter(({ number }) => number).map(({ lid, number }) => [lid, number]))

	return {
		...formattedGroup,
		admin_ids: adminPairs.map(({ number }) => number).filter(Boolean),
		participants: formattedGroup.participants.map(participant => ({
			...participant,
			id: adminNumbersByLid.get(participant.id) || participant.id
		}))
	}
}
