import { useEffect, useState } from 'react';

import UnableToDeleteModal from '@components/molecular/modals/UnableToDeleteModal';
import useSwitchRole from '@src/domains/auth/hooks/useSwitchRole';
import { useAppDispatch, useAppSelector } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import MembersTable from './MembersTable';
import CreateTeamModal from './modals/CreateTeamModal';
import EditMemberModal from './modals/EditMemberModal';
import InviteMemberModal from './modals/InviteMemberModal';
import RemoveMemberModal from './modals/RemoveMemberModal';
import PeopleHeader from './PeopleHeader';
import TeamsGrid from './TeamsGrid';
import { freezeCardholderCards } from '../../api/admin/cardUsersApi';
import { resendCardMemberInvite, revokeCardMember } from '../../api/user/cardMembersApi';
import { useCardUsersApi } from '../../hooks/admin/useCardUsersApi';
import { useEnsureOwnerCardholder } from '../../hooks/admin/useEnsureOwnerCardholder';
import { useOwnerKycRefresh } from '../../hooks/admin/useOwnerKycRefresh';
import { PEOPLE_TABS, PEOPLE_TEAMS } from '../../utils/peopleData';
import { Member } from '../../utils/types';
import PageTabs from '../common/PageTabs';

type ActiveModal = 'invite' | 'create-team' | 'edit' | 'remove' | 'unable-to-delete' | null;

/**
 * Admin "People" page: Members table / Teams grid sub-tabs, with the invite, create-team,
 * edit and remove flows. Rendered inside the Corporate Cards admin shell (the "People" tab),
 * so it owns only its own content — never the surrounding layout, sidebar or navbar.
 */
const PeopleLandingPage = () => {
    const dispatch = useAppDispatch();
    const { role, id } = useAppSelector(state => state.reducer.auth);
    const [activeTab, setActiveTab] = useState('members');
    const [activeModal, setActiveModal] = useState<ActiveModal>(null);
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [membersRefreshKey, setMembersRefreshKey] = useState(0);
    const [membersPage, setMembersPage] = useState(1);
    const [isRemoving, setIsRemoving] = useState(false);
    const [resendingKey, setResendingKey] = useState<string | null>(null);
    const {
        members,
        total,
        pageSize,
        isLoading: isLoadingMembers,
    } = useCardUsersApi(membersRefreshKey, undefined, membersPage);
    const { isProvisioning, created } = useEnsureOwnerCardholder();
    const { switchRole, isSwitching } = useSwitchRole();

    useEffect(() => {
        if (created) setMembersRefreshKey(k => k + 1);
    }, [created]);

    const { refreshed } = useOwnerKycRefresh(members);

    useEffect(() => {
        if (refreshed) setMembersRefreshKey(k => k + 1);
    }, [refreshed]);

    /**
     * KYC is a cardholder action: the issuer sends the verification link and the OTP to the handset on the
     * cardholder row, so it happens on the account holder's own Employee account. Switching identity is
     * therefore the whole action — the Employee account lands on Corporate Cards, which renders the KYC gate
     * for a cardholder session, and the account menu brings them straight back.
     */
    const handleCompleteKyc = async () => {
        await switchRole('user');
    };

    const closeModal = () => setActiveModal(null);

    const openEdit = (member: Member) => {
        setSelectedMember(member);
        setActiveModal('edit');
    };

    const openRemove = (member: Member) => {
        if (member.isAccountOwner) return;
        setSelectedMember(member);
        setActiveModal(member.cards > 0 ? 'unable-to-delete' : 'remove');
    };

    const handleResendInvite = async (member: Member) => {
        if (resendingKey || member.isAccountOwner) return;
        setResendingKey(member.key);
        const res = await resendCardMemberInvite(member.key);
        setResendingKey(null);
        if (res) {
            dispatch(
                showToast({ variant: 'success', description: 'Invitation resent successfully.' })
            );
        }
    };

    const handleRemoveConfirm = async () => {
        if (!selectedMember) return;
        setIsRemoving(true);
        const freezeRes = await freezeCardholderCards(role, id, selectedMember.key);
        const failedToFreeze = freezeRes ? (freezeRes.data?.summary?.failed ?? 0) : 0;

        const res = await revokeCardMember(selectedMember.key);
        setIsRemoving(false);
        if (res) {
            dispatch(
                showToast(
                    !freezeRes || failedToFreeze > 0
                        ? {
                              variant: 'warning',
                              description: `Member removed, but ${
                                  !freezeRes ? 'their' : `${failedToFreeze}`
                              } card(s) could not be frozen. Freeze them from the Cards tab.`,
                          }
                        : { variant: 'success', description: 'Member deleted successfully.' }
                )
            );
            if (members.length === 1 && membersPage > 1) {
                setMembersPage(p => p - 1);
            } else {
                setMembersRefreshKey(k => k + 1);
            }
            closeModal();
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PeopleHeader onInviteMember={() => setActiveModal('invite')} />

            <PageTabs tabs={PEOPLE_TABS} activeKey={activeTab} onChange={setActiveTab} />

            {activeTab === 'members' ? (
                <MembersTable
                    members={members}
                    isLoading={isLoadingMembers || isProvisioning}
                    onEdit={openEdit}
                    onRemove={openRemove}
                    onResendInvite={handleResendInvite}
                    onCompleteKyc={handleCompleteKyc}
                    resendingKey={resendingKey}
                    isStartingKyc={isSwitching}
                    page={membersPage}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setMembersPage}
                />
            ) : (
                <TeamsGrid teams={PEOPLE_TEAMS} />
            )}

            <InviteMemberModal
                open={activeModal === 'invite'}
                onClose={closeModal}
                onSuccess={() => setMembersRefreshKey(k => k + 1)}
            />
            <CreateTeamModal open={activeModal === 'create-team'} onClose={closeModal} />
            <EditMemberModal
                open={activeModal === 'edit'}
                member={selectedMember}
                onClose={closeModal}
                onSuccess={() => setMembersRefreshKey(k => k + 1)}
            />
            <RemoveMemberModal
                open={activeModal === 'remove'}
                member={selectedMember}
                isLoading={isRemoving}
                onClose={closeModal}
                onConfirm={handleRemoveConfirm}
            />
            <UnableToDeleteModal
                isOpen={activeModal === 'unable-to-delete'}
                handleClose={closeModal}
            />
        </div>
    );
};

export default PeopleLandingPage;
