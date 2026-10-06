import React from 'react';

import { DownOutlined, HolderOutlined, RightOutlined } from '@ant-design/icons';
import type { DragDropEventMap } from '@dnd-kit/abstract';
import { move } from '@dnd-kit/helpers';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { Button, Card, Col, Divider, Flex, Modal, Row, Skeleton, Typography } from 'antd';
import { Formik } from 'formik';

import CheckboxInput from '@components/atomic/inputs/CheckboxInput';
import CodeTextAreaInput from '@components/atomic/inputs/CodeTextAreaInput';
import CustomSelectSearch from '@components/atomic/inputs/CustomSelectSearch';
import TextInput from '@components/atomic/inputs/TextInput';
import PermissionIconPreview from '@components/molecular/PermissionIconPreview';
import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';
import { toTitleCase } from '@utils/wordFormat';

import SwitchInput from './SwitchInput';
import usePartnersForCorporate from '../../hooks/usePartnersForCorporate';
import useUpdateRoles from '../../hooks/useUpdateRoles';
import rolesSchema from '../../schema/roles';
import { Permission, refresh, Role } from '../../types/partnerPermission';

interface SortablePermissionCardProps {
    id: string;
    index: number;
    children: React.ReactNode;
    header?: React.ReactNode;
    defaultOpen?: boolean;
}

// A single permission card that can be dragged (by its grip handle) up/down to
// reorder the permissions list, powered by dnd-kit's `useSortable`. Reordering is
// resolved in the parent's `DragDropProvider onDragEnd` handler, which drives the
// saved order (and therefore the sidebar structure). Only the grip initiates a
// drag, so the switches / checkboxes / icon field inside stay fully interactive.
const SortablePermissionCard = ({
    id,
    index,
    children,
    header,
    defaultOpen = false,
}: SortablePermissionCardProps) => {
    const [open, setOpen] = React.useState(defaultOpen);
    const collapsible = header != null;

    const { ref, handleRef, isDragging } = useSortable({ id, index });

    return (
        <div ref={ref}>
            <Card
                size="small"
                className={`mb-4 rounded-lg border ${
                    isDragging
                        ? 'border-brandColor opacity-40 shadow-lg'
                        : 'border-borderGray transition-shadow duration-150 hover:shadow-md'
                }`}
            >
                {collapsible ? (
                    <>
                        <Flex align="center" gap={10}>
                            <span
                                ref={handleRef}
                                title="Drag to reorder"
                                className="flex cursor-grab text-textGrey transition-colors hover:text-brandColor active:cursor-grabbing"
                            >
                                <HolderOutlined className="text-base" />
                            </span>
                            <div className="min-w-0 flex-1">{header}</div>
                            <span
                                role="button"
                                tabIndex={0}
                                title={open ? 'Collapse' : 'Expand'}
                                onClick={() => setOpen(prev => !prev)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ')
                                        setOpen(prev => !prev);
                                }}
                                className="flex cursor-pointer text-textGrey transition-colors hover:text-brandColor"
                            >
                                {open ? <DownOutlined /> : <RightOutlined />}
                            </span>
                        </Flex>
                        {open && <div className="mt-3">{children}</div>}
                    </>
                ) : (
                    <Flex align="flex-start" gap={10}>
                        <span
                            ref={handleRef}
                            title="Drag to reorder"
                            className="mt-1 flex cursor-grab text-textGrey transition-colors hover:text-brandColor active:cursor-grabbing"
                        >
                            <HolderOutlined className="text-base" />
                        </span>
                        <div className="min-w-0 flex-1">{children}</div>
                    </Flex>
                )}
            </Card>
        </div>
    );
};

type RoleModalProps = {
    open: boolean;
    handleCancel: () => void;
    data?: Role;
};
const RoleModal = ({ open, handleCancel, data, setRefresh }: RoleModalProps & refresh) => {
    const { partnerData, loading } = usePartnersForCorporate('');
    const dispatch = useAppDispatch();
    const { updateRoleApi, createNewRoles,permissionData, isloading } = useUpdateRoles();
    // TEMP: source permissions from static flattened data (More Services promoted to
    // top level) until the backend `partner-initial-sidebar` returns the flattened shape.
    // Cloned via useMemo so updateMockService() can mutate a stable, per-mount copy
    // without touching the shared module constant or churning enableReinitialize.

    // Stable per-service identity. Labels are NOT unique — the catalogue ships two
    // "Corporate Cards" entries (accessKeys `corporate_card` / `peko_corporate_cards`).
    // Keying React children by label makes the reconciler duplicate/drop cards, which
    // is why every row rendered as "Corporate Cards".
    const permissionKey = (permission: Permission) => permission.accessKey ?? permission.label;

    // Merge the saved role onto the service catalogue.
    //
    // `mockServices` (partner-initial-sidebar) defines WHICH services exist;
    // `existingServices` (the saved role) defines their ORDER — that's what
    // drag-to-reorder writes and what the sidebar renders. Mapping over the
    // catalogue therefore has to be re-sorted afterwards, otherwise every reorder
    // is silently discarded the next time the modal opens.
    const updateMockService = (mockServices: Permission[], existingServices: Permission[]) =>
        mockServices.map(mockServiceCategory => {
            // Match on accessKey when present, so the second "Corporate Cards" doesn't
            // inherit the first one's saved alias / icon / access.
            const matchingExistingCategory = existingServices.find(
                existingServiceCategory =>
                    permissionKey(existingServiceCategory) === permissionKey(mockServiceCategory)
            );

            if (matchingExistingCategory) {
                // Update hasAccess for the service category
                mockServiceCategory.hasAccess = matchingExistingCategory.hasAccess;

                // Carry over the saved alias + icon + "More Services" flag so they
                // show (and round-trip) when editing an existing role.
                mockServiceCategory.alias = matchingExistingCategory.alias;
                mockServiceCategory.icon = matchingExistingCategory.icon;
                mockServiceCategory.enableMoreService =
                    matchingExistingCategory.enableMoreService;

                // Update hasAccess for each service within the category
                if (mockServiceCategory.subServices && mockServiceCategory.subServices.length > 0) {
                    mockServiceCategory.subServices = mockServiceCategory.subServices.map(
                        mockServiceItem => {
                            const matchingExistingService =
                                matchingExistingCategory?.subServices?.find(
                                    existingServiceItem =>
                                        existingServiceItem.label === mockServiceItem.label
                                );

                            if (matchingExistingService) {
                                mockServiceItem.hasAccess = matchingExistingService.hasAccess;
                            }

                            return mockServiceItem;
                        }
                    );
                }
            }

            return mockServiceCategory;
        });

    // Restore the saved order. Services the catalogue has gained since the role was
    // last saved have no saved position, so they sort to the end — `sort` is stable,
    // so they keep their catalogue order relative to each other.
    const applySavedOrder = (merged: Permission[], existingServices: Permission[]) => {
        const savedPosition = new Map(
            existingServices.map((permission, position) => [permissionKey(permission), position])
        );
        return [...merged].sort(
            (a, b) =>
                (savedPosition.get(permissionKey(a)) ?? Number.MAX_SAFE_INTEGER) -
                (savedPosition.get(permissionKey(b)) ?? Number.MAX_SAFE_INTEGER)
        );
    };

    // Memoised so the merge runs once per data change rather than on every render.
    // `updateMockService` mutates its input, so it gets a deep clone: mutating the
    // hook's `permissionData` in place would write straight through to the objects
    // Formik is holding in `values`, and would keep handing `enableReinitialize` a
    // freshly-rebuilt tree — which is what reset in-progress edits and made rows
    // flicker mid-interaction.
    const updatedMockService: Permission[] = React.useMemo(() => {
        if (!permissionData) return [];
        const catalogue: Permission[] = JSON.parse(JSON.stringify(permissionData));
        if (!data) return catalogue;
        console.log("catalogue here",catalogue)
        return applySavedOrder(updateMockService(catalogue, data.permissions), data.permissions);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permissionData, data]);
    return (
        <Formik
            initialValues={{
                id: data?.id,
                // registeredBy: data?.registeredBy ? Number(data?.registeredBy) : data?.registeredBy,
                registeredBy: data?.registeredBy != null ? Number(data.registeredBy) : 'Default',
                permissions: updatedMockService,
            }}
            onSubmit={async values => {
                const payload: any = {
                    ...values,
                };
                if (payload.registeredBy === 'Default') {
                    payload.registeredBy = null;
                }
                let res: any;
                if (data) {
                    res = await updateRoleApi(payload);
                } else {
                    res = await createNewRoles(payload);
                }
                if (res.status === true) {
                    setRefresh(true);
                    if (data)
                        dispatch(
                            showToast({
                                description: res.message,
                                variant: 'success',
                            })
                        );
                    else
                        dispatch(
                            showToast({
                                description: res.message,
                                variant: 'success',
                            })
                        );
                    handleCancel();
                }
                if (res.status === false) {
                    dispatch(
                        showToast({
                            description: `${res.message}`,
                            variant: 'error',
                        })
                    );
                }
            }}
            validationSchema={rolesSchema}
            enableReinitialize
        >
            {({ values, handleSubmit, setFieldValue }) => {
                const onClickSubmit: React.MouseEventHandler<HTMLElement> = e => {
                    e.preventDefault();
                    handleSubmit();
                };
                // Reorder the permissions array (drag up/down). The array order is
                // what determines the saved structure / sidebar order.
                //
                // `move()` resolves the new order from the ids dnd-kit tracked during
                // the drag rather than raw index arithmetic — the OptimisticSortingPlugin
                // reorders sortables internally (for the live drag animation) independent
                // of our controlled `index` prop, so diffing `event.operation.source/
                // target.index` directly against our own array went stale and produced
                // a no-op reorder.
                const onPermissionsDragEnd = (event: DragDropEventMap<any, any, any>['dragend']) => {
                    const ids = values.permissions.map(permissionKey);
                    const reorderedIds = move(ids, event);
                    if (reorderedIds === ids) return;
                    const permissionByKey = new Map(
                        values.permissions.map(permission => [
                            permissionKey(permission),
                            permission,
                        ])
                    );
                    const updated = reorderedIds.map(id => permissionByKey.get(id) as Permission);
                    // `false` skips validation: reordering can't change validity.
                    setFieldValue('permissions', updated, false);
                };
                // Both handlers below rebuild the array immutably and write it in ONE
                // setFieldValue. The previous versions mutated `values` in place and
                // then fired a second, separate update — so a click produced two
                // renders off half-stale state, which is what read as a blink.
                // `false` skips validation: toggling access can't change validity.

                // Toggle a sub-service and re-derive the parent's access from it.
                const setSubServiceAccess = (
                    index: number,
                    serviceIndex: number,
                    checked: boolean
                ) => {
                    const next = values.permissions.map((permission, i) => {
                        if (i !== index) return permission;
                        const subServices = (permission.subServices ?? []).map((subService, j) =>
                            j === serviceIndex ? { ...subService, hasAccess: checked } : subService
                        );
                        return {
                            ...permission,
                            subServices,
                            hasAccess: subServices.some(subService => subService.hasAccess),
                        };
                    });
                    setFieldValue('permissions', next, false);
                };

                // Toggle a whole service. Turning it off clears its sub-services; it
                // can't be turned on until at least one sub-service is enabled.
                const setServiceAccess = (index: number, checked: boolean) => {
                    const permission = values.permissions[index];
                    // Plenty of real permission entries (e.g. "Verification Suite", "Peko
                    // Wallet") have no `subServices` array at all — guard against undefined.
                    const hasSubServices = (permission.subServices?.length ?? 0) > 0;

                    if (hasSubServices && checked) {
                        if (!permission.subServices?.some(subService => subService.hasAccess)) {
                            // Leave the switch off rather than setting it on and
                            // immediately back off — that flip was itself a visible blink.
                            dispatch(
                                showToast({
                                    description:
                                        'Please enable at least one sub-service to activate this service',
                                    variant: 'warning',
                                })
                            );
                            return;
                        }
                    }

                    const next = values.permissions.map((p, i) => {
                        if (i !== index) return p;
                        if (hasSubServices && !checked) {
                            return {
                                ...p,
                                hasAccess: false,
                                subServices: (p.subServices ?? []).map(subService =>
                                    subService.hasAccess
                                        ? { ...subService, hasAccess: false }
                                        : subService
                                ),
                            };
                        }
                        return { ...p, hasAccess: checked };
                    });
                    setFieldValue('permissions', next, false);
                };
                return (
                    <Modal
                        width={1000}
                        centered
                        styles={{
                            body: {
                                maxHeight: 'calc(100vh - 220px)',
                                overflowY: 'auto',
                                paddingRight: 8,
                            },
                        }}
                        title={data?.id ? 'Edit Partner Permissions' : 'Add Partner Permissions'}
                        footer={[
                            <Flex className="w-full " justify="flex-end" gap={10} key="">
                                <Button
                                    key="submit"
                                    type="primary"
                                    danger
                                    loading={isloading}
                                    onClick={onClickSubmit}
                                    className="px-5"
                                >
                                    Submit
                                </Button>
                                <Button
                                    key="back"
                                    onClick={() => {
                                        handleCancel();
                                    }}
                                    className="px-5"
                                >
                                    Cancel
                                </Button>
                            </Flex>,
                        ]}
                        open={open}
                        onCancel={handleCancel}
                    >
                        {loading || updatedMockService.length === 0 ? (
                            <Skeleton active paragraph={{ rows: 10 }} />
                        ) : (
                            <>
                                {partnerData ? (
                                    <CustomSelectSearch
                                        name="registeredBy"
                                        options={(partnerData || []).map(d => ({
                                            oValue: d.value,
                                            oName: d.label,
                                        }))}
                                        placeholder=""
                                        label="Partner"
                                        isRequired
                                    />
                                ) : (
                                    <Skeleton.Input active block />
                                )}
                                <Flex align="center" gap={8} className="pb-5">
                                    <Typography.Title level={5} className="!mb-0">
                                        Permissions
                                    </Typography.Title>
                                    <Typography.Text type="secondary" className="text-xs">
                                        · drag to reorder
                                    </Typography.Text>
                                </Flex>
                                {updatedMockService.length > 0 && (
                                    <DragDropProvider onDragEnd={onPermissionsDragEnd}>
                                        {values.permissions?.map((permission, index) => {
                                            // Dashboard is always granted — its access switch is
                                            // locked on. It still needs a card, though, or there's
                                            // nowhere to set its alias and icon (which is why it
                                            // was the one sidebar entry with no glyph).
                                            const isAlwaysOn = permission.label === 'Dashboard';
                                            return (
                                                <SortablePermissionCard
                                                    key={permissionKey(permission)}
                                                    id={permissionKey(permission)}
                                                    index={index}
                                                    header={
                                                        <SwitchInput
                                                            labelClasses="text-sm font-medium text-fontHead"
                                                            name={`permissions[${index}].hasAccess`}
                                                            label={toTitleCase(permission.label)}
                                                            isDisabled={isAlwaysOn}
                                                            onChange={checked =>
                                                                setServiceAccess(index, checked)
                                                            }
                                                        />
                                                    }
                                                >
                                                    <Row
                                                        gutter={[20, 12]}
                                                        align="middle"
                                                        className="mt-1"
                                                    >
                                                        <Col xs={24} sm={12} md={10}>
                                                            <TextInput
                                                                name={`permissions[${index}].alias`}
                                                                label="Alias"
                                                                type="text"
                                                                placeholder="Alternate display name"
                                                                maxLength={60}
                                                            />
                                                        </Col>
                                                        <Col xs={24} sm={12} md={10}>
                                                            {/* Neither the More Services page itself
                                                                nor Dashboard can live under it. */}
                                                            {permission.label !== 'More Services' &&
                                                                !isAlwaysOn && (
                                                                <SwitchInput
                                                                    name={`permissions[${index}].enableMoreService`}
                                                                    label="Show under More Services"
                                                                    labelClasses="text-sm font-normal text-textDarkGray"
                                                                    onChange={checked =>
                                                                        setFieldValue(
                                                                            `permissions[${index}].enableMoreService`,
                                                                            checked
                                                                        )
                                                                    }
                                                                />
                                                            )}
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={[20, 12]} align="bottom">
                                                        <Col xs={24} sm={18} md={16}>
                                                            <CodeTextAreaInput
                                                                name={`permissions[${index}].icon`}
                                                                label="Icon (SVG code)"
                                                                placeholder="Paste <svg>…</svg> markup here"
                                                                minRows={3}
                                                            />
                                                        </Col>
                                                        <Col xs={24} sm={6} md={4}>
                                                            <Flex vertical gap={4}>
                                                                <Typography.Text
                                                                    type="secondary"
                                                                    className="text-xs"
                                                                >
                                                                    Preview
                                                                </Typography.Text>
                                                                <Flex
                                                                    align="center"
                                                                    justify="center"
                                                                    className="h-16 w-16 rounded-lg border border-borderGray bg-white"
                                                                >
                                                                    <PermissionIconPreview
                                                                        icon={permission.icon}
                                                                    />
                                                                </Flex>
                                                            </Flex>
                                                        </Col>
                                                    </Row>
                                                    {(permission.subServices?.length ?? 0) > 0 && (
                                                        <>
                                                            <Divider className="my-3" />
                                                            <Typography.Text className="mb-2 block text-xs font-medium uppercase tracking-wide text-textGrey">
                                                                Sub-services
                                                            </Typography.Text>
                                                            <Row gutter={[8, 4]}>
                                                                {permission.subServices?.map(
                                                                    (service, serviceIndex) => (
                                                                        <Col
                                                                            xs={24}
                                                                            sm={12}
                                                                            md={6}
                                                                            key={serviceIndex}
                                                                        >
                                                                            <CheckboxInput
                                                                                key={serviceIndex}
                                                                                name={`permissions[${index}].subServices[${serviceIndex}].hasAccess`}
                                                                                children={
                                                                                    <Typography.Text>
                                                                                        {toTitleCase(
                                                                                            service.label
                                                                                        )}
                                                                                    </Typography.Text>
                                                                                }
                                                                                onChange={e =>
                                                                                    setSubServiceAccess(
                                                                                        index,
                                                                                        serviceIndex,
                                                                                        e.target
                                                                                            .checked
                                                                                    )
                                                                                }
                                                                                isRequired
                                                                            />
                                                                        </Col>
                                                                    )
                                                                )}
                                                            </Row>
                                                        </>
                                                    )}
                                                </SortablePermissionCard>
                                            );
                                        })}
                                    </DragDropProvider>
                                )}
                            </>
                        )}
                    </Modal>
                );
            }}
        </Formik>
    );
};

export default RoleModal;
