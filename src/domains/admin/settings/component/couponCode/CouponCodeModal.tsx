import React from 'react';

import { Flex, Form, Skeleton } from 'antd';
import dayjs from 'dayjs';

import DatePickerInput from '@components/atomic/inputs/DatePickerInput';
import SelectInput from '@components/atomic/inputs/SelectInput';
import SelectInputWithSearch from '@components/atomic/inputs/SelectInputWithSearch';
import TextInput from '@components/atomic/inputs/TextInput';
import CustomModalWithForm from '@components/molecular/modals/CustomModalWithForm';
import usePartnersForCorporate from '@src/domains/admin/users/hooks/usePartnersForCorporate';

import useGetAllServiceOperators from '../../hooks/pekoCredits/useGetAllServiceOperators';
import useGetPackages from '../../hooks/pekoCredits/useGetPackages';
import useGetReferralCodes from '../../hooks/pekoCredits/useGetReferralCodes';
import UseCreateCouponCodes from '../../hooks/useCreateCouponCode';
import couponCodeSchema from '../../schema/couponCodeSchema';
import { refresh } from '../../types/accessCode';
import { Coupon } from '../../types/couponCode';

type ModalProps = {
    open: boolean;
    handleCancel: () => void;
    data?: Coupon;
};
const CouponCodeModal = ({ open, handleCancel, setRefresh, data }: ModalProps & refresh) => {
      const { isLoading, createNewCouponCode, updateCurrenCouponCode } = UseCreateCouponCodes({
        handleCancel,
        setRefresh,
    });
   
  
    const tomorrow = dayjs().add(0, 'day').startOf('day');

    
    const {
        packageData,
        isLoading: packageLoading,
        setPartnerId,
        partnerId: selectedPartnerId,
    } = useGetPackages({ partnerId: data?.partnerId?.toString() || 'default' });
    const { partnerData } = usePartnersForCorporate('');
    const { codeData } = useGetReferralCodes(selectedPartnerId, '');
       const { serviceData, serviceOperatorLoading } = useGetAllServiceOperators();

    return (
        <CustomModalWithForm
            isLoading={isLoading}
            modalTitle="Coupon Code Management"
            open={open}
            validationSchema={couponCodeSchema}
            handleCancel={handleCancel}
           handleFormSubmit={async values => {
                const { couponType, ...rest } = values;
                const payload = {
                    ...rest,
                    couponType,
                    packageId: couponType === 'SUBSCRIPTION' ? rest.packageId : null,
                    billingType: couponType === 'SUBSCRIPTION' ? rest.billingType : null,
                    serviceOperatorId: couponType === 'SERVICES' ? rest.serviceOperatorId : null,
                    maximumDiscount:
                        rest.discountType === 'PERCENTAGE'
                            ? parseFloat(rest.maximumDiscount)
                            : null,
                };
                return data
                    ? updateCurrenCouponCode({ ...payload, id: data.id })
                    : createNewCouponCode(payload);
            }}
            initialValues={{
                couponCode: data?.couponCode || '',
                discountType: data?.discountType || '',
                discount: parseFloat(data?.discount || '0') || '',
                minimumPurchase: data?.minimumPurchase ? parseFloat(data.minimumPurchase) : '',
                maximumDiscount: data?.maximumDiscount ? parseFloat(data.maximumDiscount) : '',
                validFrom: data?.validFrom || '',
                validTo: data?.validTo || '',
                partnerId: Number(data?.partnerId) || 'default',
                referralCodeId: data?.referralCodeId || 'default',
                usageCount: data?.usageCount || '',
                couponType: data?.couponType || '',
                billingType: data?.billingType || '',
                packageId: data?.packageId || '',
                serviceOperatorId: data?.serviceOperatorId?.toString() || '',
            }}
        >
            {({ values, setFieldValue }) => (
                <Flex vertical className="w-full">
                    <Form layout="vertical">
                        {partnerData ? (
                            <SelectInputWithSearch
                                name="partnerId"
                                options={partnerData}
                                placeholder="Please select a partner"
                                label="Select Partner"
                                handleChange={e => {
                                    setFieldValue('referralCodeId', 'default');
                                    setFieldValue('packageId', '');
                                    setPartnerId(e);
                                }}
                                disableDeselect
                            />
                        ) : (
                            <Skeleton.Input active block />
                        )}
                        {codeData ? (
                            <SelectInputWithSearch
                                name="referralCodeId"
                                options={codeData}
                                placeholder="Please select a referral code"
                                label="Select Referral Code"
                                disableDeselect
                            />
                        ) : (
                            <Skeleton.Input active block />
                        )}
                         <SelectInput
                            name="couponType"
                            isRequired
                            options={[
                                { value: 'SUBSCRIPTION', label: 'Subscription' },
                                { value: 'SERVICES', label: 'Service' },
                            ]}
                            placeholder="Please select a coupon type"
                            label="Coupon Type"
                            handleChange={() => {
                                setFieldValue('packageId', '');
                                setFieldValue('billingType', '');
                                setFieldValue('serviceOperatorId', '');
                            }}
                        />
                        {values.couponType === 'SUBSCRIPTION' &&
                            (!packageLoading ? (
                                <SelectInputWithSearch
                                    isRequired
                                    name="packageId"
                                    options={packageData}
                                    placeholder="Please select a package"
                                    label="Package Name"
                                />
                            ) : (
                                <Skeleton.Input active block />
                            ))}
                        {values.couponType === 'SUBSCRIPTION' && (
                            <SelectInput
                                name="billingType"
                                isRequired
                                options={[
                                    { value: 'MONTHLY', label: 'Monthly' },
                                    { value: 'ANNUALLY', label: 'Annually' },
                                ]}
                                placeholder="Please select a billing type"
                                label="Billing Type"
                            />
                        )}
                        {values.couponType === 'SERVICES' &&
                            (!serviceOperatorLoading ? (
                                <SelectInputWithSearch
                                    isRequired
                                    name="serviceOperatorId"
                                    options={serviceData || []}
                                    placeholder="Please select an operator"
                                    label="Select Operator"
                                />
                            ) : (
                                <Skeleton.Input active block />
                            ))}
                        <TextInput
                            name="couponCode"
                            label="Coupon Code"
                            type="text"
                            placeholder="Enter coupon code"
                            isRequired
                            classes="rounded-sm"
                            maxLength={30}
                            allowAlphabetsAndNumbersOnly
                        />
                        <SelectInput
                            name="discountType"
                            isRequired
                            options={[
                                { value: 'PERCENTAGE', label: 'Percentage' },
                                { value: 'FLAT', label: 'Flat' },
                            ]}
                            placeholder="Please select a discount type"
                            label="Discount Type"
                             handleChange={() => {
                                setFieldValue('discount', '', false);
                                setFieldValue('maximumDiscount', '', false);
                            }}
                        />
                          <TextInput
                            allowDecimalsOnly
                            name="discount"
                            label="Discount"
                            type="text"
                            maxLength={12}
                            placeholder="Please enter discount"
                            isRequired
                            classes="rounded-sm"
                            allowTwoDecimalsOnly
                        />
                            <TextInput
                            name="minimumPurchase"
                            label="Minimum Purchase Value"
                            type="text"
                            placeholder="Please enter minimum purchase value"
                            isRequired
                            classes="rounded-sm"
                            maxLength={8}
                            allowTwoDecimalsOnly
                        />
                          {/* <SelectInput
                            name="billingType"
                            isRequired
                            options={[
                                { value: 'MONTHLY', label: 'Monthly' },
                                { value: 'ANNUALLY', label: 'Annually' },
                            ]}
                            placeholder="Please select a billing type"
                            label="Billing Type"
                        /> */}
                        <TextInput
                            name="usageCount"
                            label="Usage Count"
                            type="text"
                            placeholder="Please enter usage count"
                            classes="rounded-sm"
                            allowNumbersOnly
                            maxLength={10}
                            isRequired
                        />
                     
                        {values.discountType === 'PERCENTAGE' && (
                            <TextInput
                                name="maximumDiscount"
                                label="Maximum Discount Amount"
                                type="text"
                                placeholder="Please enter maximum discount amount"
                                isRequired
                                classes="rounded-sm"
                                maxLength={8}
                                allowTwoDecimalsOnly
                            />
                        )}
                      
                        <DatePickerInput
                            name="validFrom"
                            label="Valid From"
                            placeholder="Enter date"
                            classes="w-full"
                            isRequired
                            needConfirm={false}
                            minDate={tomorrow}
                            handleChange={date => {
                                if (date >= values.validTo) setFieldValue('validTo', '');
                                setFieldValue('validFrom', date);
                            }}
                        />
                        <DatePickerInput
                            name="validTo"
                            label="Valid To"
                            placeholder="Enter date"
                            classes="w-full"
                            isRequired
                            needConfirm={false}
                            minDate={
                                values.validFrom ? dayjs(values.validFrom).add(0, 'day') : tomorrow
                            }
                        />
                    </Form>
                </Flex>
            )}
        </CustomModalWithForm>
    );
};

export default CouponCodeModal;
