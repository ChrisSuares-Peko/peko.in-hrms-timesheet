import { Typography, Button, Flex } from 'antd';

import { useSubscriptionContext } from '@src/domains/dashboard/softwares/contexts/SubscriptionPageContext';
import useGetAssistance from '@src/domains/dashboard/softwares/hooks/general/useGetAssistance';
import { IPricingOption } from '@src/domains/dashboard/softwares/types';

const { Text } = Typography;

type Props = {
    planName: string;
    pricingOption: IPricingOption;
    skuCode: string;
    weburl: string;
    company: string;
};

const PriceSectionCard = ({ planName, pricingOption, skuCode, weburl, company }: Props) => {
    const { handleSoftwareSubmission } = useSubscriptionContext();
    const { isLoading, requestAssistance } = useGetAssistance();
    const hasDiscount = Number(pricingOption.discountPercentage) > 0;
    const payableAmount = hasDiscount
        ? Number(pricingOption.discountedAmountInConvertedCurrency)
        : Number(pricingOption.amountInConvertedCurrency);
    return (
        <Flex vertical className="gap-4">
            <Flex className="justify-between">
                <Text className="font-semibold text-lg text-navTextColor">{planName}</Text>
                {Number(pricingOption.discountPercentage) > 0 && (
                    <Flex className="text-[#43B75D] text-sm  font-semibold px-4 py-1 rounded-md bg-[#ECFDF5]">
                        Save {pricingOption.discountPercentage}%
                    </Flex>
                )}
            </Flex>
            <Flex className="items-baseline gap-5 flex-wrap mt-5">
                {hasDiscount && (
                    <Text className="font-semibold text-lg text-textGreyColor relative">
                        <span className="relative">
                            <span className="absolute inset-0 flex items-center">
                                <span className="w-full h-[1.5px] bg-lightRed" />
                            </span>
                           ₹ {pricingOption.amountInConvertedCurrency}
                        </span>
                    </Text>
                )}
                <Text className="font-semibold text-4xl text-black">
                   ₹ {payableAmount}
                    <span className="font-regular text-sm text-navTextColor">
                        {' '}
                        /{pricingOption.ratePeriod}
                    </span>
                </Text>
            </Flex>
            <Button
                type="primary"
                danger
                block
                size="large"
                className="mt-5 rounded-xl h-11 font-medium"
                loading={isLoading}
                onClick={() => {
                    if (payableAmount > 0) {
                        handleSoftwareSubmission({
                            plan: pricingOption,
                            productName: weburl,
                            planName,
                            company,
                            skuCode,
                            amount: payableAmount,
                        });
                    } else {
                        requestAssistance(weburl);
                    }
                }}
            >
                 {payableAmount === 0 ? 'Request for Quote' : 'Select Plan'}
            </Button>
        </Flex>
    );
};

export default PriceSectionCard;
