import { InfoCircleOutlined } from '@ant-design/icons';
import { Form, Input } from 'antd';
import { SizeType } from 'antd/es/config-provider/SizeContext';
import { Field, FieldProps, getIn } from 'formik';

import useScreenSize from '@src/hooks/useScreenSize';

interface InputTextAreaProps {
    name: string;
    label?: string;
    placeholder: string;
    size?: SizeType;
    isDisabled?: boolean;
    isRequired?: boolean;
    autoSize?: boolean | { minRows?: number; maxRows?: number };
    maxLength?: number;
    showToolTip?: boolean;
    tooltipText?: string;
    removeEmoji?: boolean;
    showCount?: boolean;
    transform?: (value: string) => string;
    formItemClass?: string;
}

const removeEmojis = (str: any) =>
    str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');

const InputTextArea: React.FC<InputTextAreaProps> = ({
    name,
    label,
    placeholder,
    size,
    isDisabled,
    isRequired,
    autoSize,
    maxLength = 500,
    showToolTip = false,
    tooltipText,
    removeEmoji = true,
    showCount = false,
    transform,
    formItemClass,
}) => {
    const { sm } = useScreenSize();
    return (
        <Field name={name}>
            {({ field, form: { touched, errors, setFieldValue } }: FieldProps) => (
                <Form.Item
                    className={formItemClass}
                    label={label}
                    required={isRequired}
                    validateStatus={getIn(touched, name) && getIn(errors, name) ? 'error' : ''}
                    help={
                        getIn(touched, name) && getIn(errors, name)
                            ? (getIn(errors, name) as React.ReactNode)
                            : undefined
                    }
                    {...(showToolTip && {
                        tooltip: {
                            title: tooltipText,
                            color: 'white',
                            placement: 'right',
                            icon: <InfoCircleOutlined />,
                            overlayInnerStyle: {
                                color: '#171717',
                            },
                            overlayStyle: {
                                minWidth: 300,
                            },
                        },
                    })}
                >
                    <Input.TextArea
                        {...field}
                        id={name}
                        size={size ?? 'middle'}
                        placeholder={placeholder}
                        disabled={isDisabled}
                        autoSize={autoSize}
                        maxLength={maxLength}
                        onChange={e => {
                            let { value } = e.target;
                            if (removeEmoji) {
                                value = removeEmojis(e.target.value);
                            }
                            if (transform) {
                                value = transform(value);
                            }
                            setFieldValue(name, value);
                        }}
                        showCount={sm && showCount}
                    />
                </Form.Item>
            )}
        </Field>
    );
};

export default InputTextArea;
