import React from 'react';

import { Collapse } from 'antd';
import { CollapseProps } from 'antd/lib';

import '../assets/style.css';
import { FareRules } from '../types/fareRules';

interface fairRlesProps {
    fareRulesData: FareRules[];
}

// The supplier's FareRuleDetail HTML is: a refundability note, the penalty table, and the
// min/max-stay bullets — followed by a huge revalidation/reissue fieldset and a wall of raw GDS
// penalty text. Only the first part is meant to be shown, so drop everything from the fieldset
// onward. If an airline's response has no fieldset, fall back to showing the full string as-is.
const truncateFareRuleDetail = (html: string) => {
    const cutIndex = html.search(/<fieldset/i);
    return cutIndex === -1 ? html : html.slice(0, cutIndex);
};

const FairRuleCollapse = ({ fareRulesData }: fairRlesProps) => {
    const result: CollapseProps['items'] = fareRulesData.map((item, index) => ({
        key: (index + 1).toString(),
        label: `${item.Origin} -> ${item.Destination}`,
        children: (
            <div
                className="fare-rule-detail"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: truncateFareRuleDetail(item.FareRuleDetail!) }}
            />
        ),
    }));

    return (
        <Collapse
            className="fare-rule-collapse"
            style={{ width: '100%' }}
            items={result}
            defaultActiveKey={['1']}
        />
    );
};

export default FairRuleCollapse;
