// PROTOTYPE-SETUP (Overview, Slice 2): a round profile photo with an initials fallback (prototype "Photo").
// Used on the Overview, the Profile page and the header (ESS tabs).
import { Avatar } from 'antd';

export const initialsOf = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('');

const ProfilePhoto = ({ name, photo, size = 56 }: { name: string; photo?: string | null; size?: number }) =>
    photo ? (
        <Avatar src={photo} size={size} alt={`${name}'s photo`} className="shrink-0" />
    ) : (
        <Avatar
            size={size}
            className="shrink-0 font-semibold"
            style={{ backgroundColor: '#FFECEC', color: '#FF4F4F', fontSize: Math.round(size * 0.36) }}
            aria-label={name}
        >
            {initialsOf(name)}
        </Avatar>
    );

export default ProfilePhoto;
