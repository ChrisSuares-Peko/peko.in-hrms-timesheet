import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Form, Row, Col, Flex, Select, Typography, Skeleton } from 'antd';
import { Formik } from 'formik';

import CheckboxInput from '@components/atomic/inputs/CheckboxInput';
import InputTextArea from '@components/atomic/inputs/InputTextArea';
import TextInput from '@components/atomic/inputs/TextInput';
import { useAppDispatch, useAppSelector } from '@src/hooks/hooks';
import { accessKeys } from '@utils/accessKeys';

import { useFetchAddressApi } from '../../hooks/useFetchAddressApi';
import useForm from '../../hooks/useForm';
import { addressSchema } from '../../schema/index';
import { setValidation } from '../../slices/cartSlice';
import { AddressField } from '../../types/address';
import {
    checkoutDraftFromValues,
    checkoutDraftHasContent,
    readCheckoutDraft,
    writeCheckoutDraft,
} from '../../utils/checkoutDraft';
import { UnavailableCartItem } from '../../utils/unavailableCartItems';

const { Text } = Typography;

interface DeliveryDetailsProps {
    formRef: React.MutableRefObject<any>;
    setAddress: (address: AddressField) => void;
    onUnavailableItems?: (items: UnavailableCartItem[]) => void;
}

/**
 * Discards the seller quote from Order summary's step 1 when the buyer edits
 * where the order is going.
 *
 * A quote is priced for one destination: the seller worked out serviceability,
 * delivery charge and TAT for the pincode /select carried. Keeping it after the
 * address changes would let "Proceed to payment" fire /init against a quote for
 * somewhere else — the buyer pays a price quoted for the old address, and the
 * seller ships to the new one.
 *
 * Renders nothing; it lives inside Formik purely to observe `values`.
 */
const DiscardQuoteOnAddressChange: React.FC<{ fingerprint: string }> = ({ fingerprint }) => {
    const dispatch = useAppDispatch();
    const hasQuote = useAppSelector(state => Boolean(state.reducer.cart.validation));
    const seen = useRef(fingerprint);

    useEffect(() => {
        if (seen.current === fingerprint) return;
        seen.current = fingerprint;
        if (hasQuote) dispatch(setValidation(null));
    }, [fingerprint, hasQuote, dispatch]);

    return null;
};

const PersistCheckoutDraft: React.FC<{ values: AddressField }> = ({ values }) => {
    useEffect(() => {
        writeCheckoutDraft(values);
    }, [values]);
    return null;
};

/** Delivery details card (Figma 2342-24561): GST/business info + contact + address. */
const DeliveryDetails: React.FC<DeliveryDetailsProps> = ({
    formRef,
    setAddress,
    onUnavailableItems,
}) => {
    const { addressOptions, isLoading } = useFetchAddressApi();
    const [selectedAddress, setSelectedAddress] = useState<AddressField>();
    const { handleSubmission, data } = useForm({ onUnavailableItems });
    const paymentAddress = useAppSelector(state => {
        const payload = state.reducer.payment.payload as
            | { address?: AddressField; accessKey?: string }
            | null;
        if (payload?.accessKey !== accessKeys.officeSupplies) return undefined;
        return payload.address;
    });
    const storedDraft = useRef(readCheckoutDraft() || (paymentAddress ? checkoutDraftFromValues(paymentAddress) : null));

    useEffect(() => {
        const draft = storedDraft.current;
        if (checkoutDraftHasContent(draft)) setAddress(draft as AddressField);
    }, [setAddress]);

    useEffect(() => {
        if (isLoading) return;
        const form = formRef.current;
        if (!form) return;
        if (!form.values.contactName && data?.contactPersonName) {
            form.setFieldValue('contactName', data.contactPersonName);
        }
        if (!form.values.businessName && data?.name) {
            form.setFieldValue('businessName', data.name);
        }
    }, [isLoading, data?.contactPersonName, data?.name, formRef]);

    const initialValues = useMemo(() => {
        const saved = selectedAddress;
        const draft = storedDraft.current;
        return {
            address: saved?.address ?? draft?.address ?? '',
            phoneNumber: saved?.phoneNumber ?? draft?.phoneNumber ?? '',
            pincode: saved?.zipCode ?? saved?.pincode ?? draft?.pincode ?? '',
            remarks: saved ? '' : draft?.remarks ?? '',
            contactName: saved?.contactName ?? draft?.contactName ?? data?.contactPersonName ?? '',
            businessName: saved?.businessName ?? draft?.businessName ?? data?.name ?? '',
            gstin: saved ? '' : draft?.gstin ?? '',
            noGst: saved ? false : Boolean(draft?.noGst),
            saveAddress: false,
        };
        // Profile names are first-paint fallbacks only — do not reinit when
        // basic-info arrives or a filled form would be wiped on return from payment.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAddress]);

    return isLoading ? (
        <Skeleton className="my-4" />
    ) : (
        <Flex
            vertical
            gap={20}
            className="w-full rounded-3xl bg-white p-6 drop-shadow-[0px_1.2px_6px_rgba(0,0,0,0.06)]"
        >
            <Text className="text-[18px] font-semibold leading-[26px] text-[#101828]">
                Delivery details
            </Text>

            <Flex vertical className="w-full">
                <Typography.Text className="pb-2">Saved Address</Typography.Text>
                <Select
                    showSearch
                    allowClear
                    placeholder="Select a person"
                    optionFilterProp="children"
                    onChange={value => {
                        const parsed: AddressField | undefined = value
                            ? JSON.parse(value)
                            : undefined;
                        setSelectedAddress(parsed);
                        // surface the pick to CheckoutList → OrderSummary (pincode for
                        // the pre-checkout ONDC seller validation)
                        if (parsed) setAddress(parsed);
                    }}
                    options={addressOptions}
                />
            </Flex>

            <Formik
                enableReinitialize
                initialValues={initialValues}
                innerRef={formRef}
                validationSchema={addressSchema}
                onSubmit={values =>
                    // firstName/lastName are legacy fields useForm (ONDC /init billing
                    // name) and the admin portal still read — keep them populated from
                    // the new single contactName input.
                    handleSubmission({ ...values, firstName: values.contactName, lastName: '' })
                }
            >
                {({ values, setFieldValue }) => (
                    <Form layout="vertical" className="w-full">
                        <PersistCheckoutDraft values={values} />
                        <DiscardQuoteOnAddressChange
                            fingerprint={`${values.pincode}|${values.address}`}
                        />
                        <CheckboxInput
                            name="noGst"
                            onChange={e => {
                                if (e.target.checked) setFieldValue('gstin', '');
                            }}
                        >
                            I don&apos;t have GST / unregistered business
                        </CheckboxInput>

                        <Row gutter={10}>
                            <Col xs={12}>
                                <TextInput
                                    name="businessName"
                                    label="Business name"
                                    placeholder="Enter business name"
                                    type="text"
                                    isRequired
                                />
                            </Col>
                            <Col xs={12}>
                                <TextInput
                                    name="gstin"
                                    label="GSTIN"
                                    placeholder="Enter GST Number"
                                    type="text"
                                    convertToUppercase
                                    allowAlphabetsAndNumbersOnly
                                    maxLength={15}
                                    isDisabled={values.noGst}
                                    isRequired={!values.noGst}
                                />
                            </Col>
                        </Row>
                        <Row gutter={10}>
                            <Col xs={12}>
                                <TextInput
                                    name="contactName"
                                    label="Contact name"
                                    placeholder="Enter contact name"
                                    type="text"
                                    allowAlphabetsAndSpaceOnly
                                    isRequired
                                />
                            </Col>
                            <Col xs={12}>
                                <TextInput
                                    name="phoneNumber"
                                    label="Mobile number"
                                    placeholder="Enter mobile number"
                                    type="text"
                                    allowNumbersOnly
                                    maxLength={12}
                                    isRequired
                                />
                            </Col>
                        </Row>
                        <InputTextArea
                            autoSize={{ minRows: 3 }}
                            name="address"
                            label="Delivery address"
                            placeholder="House no, Building name, Area, Colony"
                            isRequired
                        />
                        <Row gutter={10}>
                            <Col xs={12}>
                                <TextInput
                                    name="pincode"
                                    label="Pincode"
                                    placeholder="Enter delivery pincode"
                                    type="text"
                                    allowNumbersOnly
                                    maxLength={6}
                                    isRequired
                                />
                            </Col>
                        </Row>

                        {!selectedAddress && (
                            <CheckboxInput name="saveAddress">
                                Save this address for next time
                            </CheckboxInput>
                        )}

                        <Row gutter={10}>
                            <Col xs={12}>
                                <TextInput
                                    name="remarks"
                                    label="Remarks"
                                    placeholder="Enter remarks"
                                    type="text"
                                />
                            </Col>
                        </Row>
                    </Form>
                )}
            </Formik>
        </Flex>
    );
};

export default DeliveryDetails;
