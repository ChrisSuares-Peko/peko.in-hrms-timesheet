import React, { useState } from 'react';

import { Steps, Flex, Typography } from 'antd';

import { useAppSelector } from '@src/hooks/store';

import WelcomeAddEmployee from '../components/WelcomePage/WelcomeAddEmployee';
import WelcomeCompanyDetailsForm from '../components/WelcomePage/WelcomeCompanyDetailsForm';
import WelcomePayrollCycleForm from '../components/WelcomePage/WelcomePayrollCycleForm';
import WelcomeSalaryComponents from '../components/WelcomePage/WelcomeSalaryComponents';

const WelcomePage = ({ setRefresh }: { setRefresh: React.Dispatch<React.SetStateAction<boolean>> }) => {
    const { onBoardStatus } = useAppSelector(state => state.reducer.payrollAuth);
    const [current, setCurrent] = useState(Number(onBoardStatus ?? 0));
    const steps = [
        {
            title: 'Company Profile',
            content: (
                <WelcomeCompanyDetailsForm setActiveTabKey={setCurrent} setRefresh={setRefresh} />
            ),
            subtitleText:
                'By default, we have configured your HR and leave settings in compliance with Indian labor laws. You can retain these settings or customize them to align with your company policies.',
        },
        {
            title: 'Payroll Cycle',
            content: <WelcomePayrollCycleForm setActiveTabKey={setCurrent} />,
            subtitleText: "Select your payroll cycle to align with your company's schedule",
        },
        {
            title: 'Salary Components',
            content: <WelcomeSalaryComponents setActiveTabKey={setCurrent} />,
            subtitleText:
                'Configure the earnings and deductions that will be included in payroll processing. You can edit the defaults or add new components specific to your company.',
        },
        {
            title: 'Add Employees',
            content: <WelcomeAddEmployee setActiveTabKey={setCurrent} setRefresh={setRefresh} />,
            subtitleText:
                'By default, we have configured your HR and leave settings in compliance with Indian labor laws. You can retain these settings or customize them to align with your company policies.',
        },
    ];
    const CurrentComponent = steps[current].content;

    return (
        <>
            <Flex vertical justify="center" align="center" gap={25}>
                <Typography.Text className="text-[#000000] text-[1.75rem] font-medium text-center">
                    Let’s help you to setup your HR Dashboard
                </Typography.Text>
                <Typography.Text className="text-[#595959] text-[1rem] text-center w-2/3">
                    {steps[current].subtitleText}
                </Typography.Text>
            </Flex>
            {/* Antd doesn't wrap or ellipsize step titles when the horizontal track is
                squeezed narrower than all 5 titles need — they just get clipped mid-word.
                min-w keeps every title's full width; the scrollable wrapper lets narrow
                viewports scroll to it instead of clipping it. Centering this with
                `mx-auto` (margin-based) rather than a flex `justify="center"` parent
                matters here — centering an overflowing child via flex alignment shifts it
                so scrolling to position 0 doesn't actually reach its true left edge
                (some of it becomes unreachable "negative" overflow); margin auto doesn't
                have that problem. */}
            <div className="w-full overflow-x-auto">
                <Steps current={current} className="my-6 w-[90%] min-w-[1040px] mx-auto">
                    {steps.map(item => (
                        <Steps.Step key={item.title} title={item.title} />
                    ))}
                </Steps>
            </div>
            <div className="step-content">{CurrentComponent}</div>
        </>
    );
};

export default WelcomePage;
