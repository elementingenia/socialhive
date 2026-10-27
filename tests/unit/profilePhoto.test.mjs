// Profile photo rules (lib/profilePhoto.js), Iain 2026-10-27.
import { isProfilePhotoUrl, isDrawnAvatar, photoPathFromUrl, avatarUrlAllowed, resolveAvatarForSave, initialsOf, DEFAULT_AVATAR } from '../../lib/profilePhoto.js'
import { maskMemberRow } from '../../lib/directoryPrivacy.js'
import { buildContactEntries } from '../../lib/contactEntries.js'

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++ } else { fail++; console.error('FAIL:', msg) } }

const PHOTO = 'https://x.supabase.co/storage/v1/object/public/profile-photos/abc/123.webp'
const OTHER = 'https://x.supabase.co/storage/v1/object/public/event-images/abc.webp'

ok(isProfilePhotoUrl(PHOTO), 'bucket URL is a photo')
ok(!isProfilePhotoUrl(OTHER), 'another bucket is not a photo')
ok(!isProfilePhotoUrl('/avatars/avatar_03.svg'), 'drawn avatar is not a photo')
ok(!isProfilePhotoUrl(null), 'null is not a photo')
ok(isDrawnAvatar('/avatars/avatar_12.svg') && !isDrawnAvatar('/avatars/avatar_13.svg'), 'drawn avatar list is 01-12')
ok(photoPathFromUrl(PHOTO + '?t=1') === 'abc/123.webp', 'storage path extracted, query stripped')
ok(photoPathFromUrl(OTHER) === null, 'no path for other buckets')

ok(avatarUrlAllowed('/avatars/avatar_02.svg', PHOTO), 'can switch to a drawn avatar')
ok(avatarUrlAllowed(null, PHOTO) && avatarUrlAllowed('', null), 'can clear')
ok(avatarUrlAllowed(PHOTO, PHOTO), 'can keep the stored photo')
ok(!avatarUrlAllowed(PHOTO, null), 'cannot set a photo through a save')
ok(!avatarUrlAllowed('https://evil.example/x.png', null), 'outside URL refused')
ok(!avatarUrlAllowed(OTHER, OTHER), 'other bucket refused even if stored')

ok(resolveAvatarForSave({ next: PHOTO, hideName: true }) === DEFAULT_AVATAR, 'Private drops the photo for the default avatar')
ok(resolveAvatarForSave({ next: '/avatars/avatar_05.svg', hideName: true }) === '/avatars/avatar_05.svg', 'Private keeps a chosen drawn avatar')
ok(resolveAvatarForSave({ next: PHOTO, hideName: false }) === PHOTO, 'non-Private keeps the photo')
ok(resolveAvatarForSave({ next: '', hideName: false }) === null, 'empty becomes null')

ok(initialsOf('Iain Pallot') === 'IP', 'two initials')
ok(initialsOf('Cher') === 'C', 'one name, one initial')
ok(initialsOf('Mary-Jane van der Berg') === 'MB', 'first and last word')
ok(initialsOf('Resident') === '', 'masked resident gets no initials')
ok(initialsOf('  ') === '' && initialsOf(null) === '', 'empty name')

const viewer = { id: 'v', is_admin: false }
const priv = { id: 'p', name: 'Pat Private', hide_name: true, avatar_url: '/avatars/avatar_04.svg' }
ok(maskMemberRow(priv, viewer).avatar_url === null, 'masked resident picture not sent to others')
ok(maskMemberRow(priv, { id: 'a', is_admin: true }).avatar_url === '/avatars/avatar_04.svg', 'admin still gets it')

const entries = buildContactEntries({
  members: [{ id: 'm1', name: 'Ann Lee', avatar_url: PHOTO }, maskMemberRow(priv, viewer)],
  displayContacts: [
    { id: 'c1', name: 'Bob Plumber', contact_category_members: [{ category_id: 'trade' }] },
    { id: 'c2', name: 'Lyn Smith', contact_category_members: [{ category_id: 'res' }] },
  ],
  residentsId: 'res', me: viewer,
})
const by = Object.fromEntries(entries.map(e => [e.key, e]))
ok(by['m-m1'].avatar === PHOTO && by['m-m1'].showAvatar, 'member photo on card')
ok(by['m-p'].avatar === null && by['m-p'].showAvatar, 'masked member gets a plain circle')
ok(!by['c-c1'].showAvatar, 'outside contact gets no circle')
ok(by['c-c2'].showAvatar && by['c-c2'].avatar === null, 'resident contact without login gets initials')

console.log(`profilePhoto: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
