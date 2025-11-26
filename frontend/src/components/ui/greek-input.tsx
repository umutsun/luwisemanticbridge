/**
 * YUNANCA (Greek) Input Component
 * Handles YUNANCA character input with proper encoding and validation
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { safeGreekText, normalizeGreekText, handleGreekInput, validateGreekText } from '@/utils/greek-text-handler';

interface GreekInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    maxLength?: number;
    showValidation?: boolean;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
    onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export const GreekInput: React.FC<GreekInputProps> = ({
    value,
    onChange,
    placeholder = '',
    className = '',
    disabled = false,
    maxLength,
    showValidation = false,
    onBlur,
    onFocus
}) => {
    const [internalValue, setInternalValue] = useState(normalizeGreekText(value));
    const [validationIssues, setValidationIssues] = useState<string[]>([]);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Update internal value when external value changes
    useEffect(() => {
        const normalizedValue = normalizeGreekText(value);
        setInternalValue(normalizedValue);
    }, [value]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;

        // Apply YUNANCA text processing
        const processedValue = handleGreekInput(rawValue);

        // Check max length
        if (maxLength && processedValue.length > maxLength) {
            return;
        }

        setInternalValue(processedValue);

        // Validate if enabled
        if (showValidation) {
            const validation = validateGreekText(processedValue);
            setValidationIssues(validation.issues);
        }

        onChange(processedValue);
    }, [onChange, maxLength, showValidation]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);

        // Final validation and normalization on blur
        const finalValue = handleGreekInput(e.target.value);
        setInternalValue(finalValue);
        onChange(finalValue);

        if (onBlur) {
            onBlur(e);
        }
    }, [onChange, onBlur]);

    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        if (onFocus) {
            onFocus(e);
        }
    }, [onFocus]);

    const getInputProps = () => ({
        type: 'text',
        value: internalValue,
        onChange: handleChange,
        onBlur: handleBlur,
        onFocus: handleFocus,
        placeholder,
        disabled,
        maxLength,
        ref: inputRef,
        className: `
      greek-font greek-text greek-ltr
      w-full px-3 py-2 border border-gray-300 rounded-md
      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
      disabled:bg-gray-100 disabled:cursor-not-allowed
      ${validationIssues.length > 0 ? 'border-red-500 focus:ring-red-500' : ''}
      ${isFocused ? 'shadow-sm' : ''}
      ${className}
    `.trim(),
        lang: 'el' as const,
        dir: 'ltr' as const,
        autoComplete: 'off',
        spellCheck: false,
        inputMode: 'text' as const,
        'aria-invalid': validationIssues.length > 0 ? true : false,
        'aria-describedby': validationIssues.length > 0 ? 'greek-validation' : undefined
    });

    return (
        <div className="greek-input-container">
            <input {...getInputProps()} />

            {showValidation && validationIssues.length > 0 && (
                <div
                    id="greek-validation"
                    className="mt-1 text-sm text-red-600 greek-text"
                    role="alert"
                >
                    {validationIssues.map((issue, index) => (
                        <div key={index} className="greek-safe-text">
                            {issue}
                        </div>
                    ))}
                </div>
            )}

            {showValidation && validationIssues.length === 0 && internalValue && (
                <div className="mt-1 text-sm text-green-600 greek-text">
                    ✓ Ελληνικοί χαρακτήρες επεξεργάστηκαν σωστά
                </div>
            )}
        </div>
    );
};

/**
 * YUNANCA Textarea Component
 * Extended version for multiline YUNANCA text input
 */
interface GreekTextareaProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    maxLength?: number;
    rows?: number;
    showValidation?: boolean;
    onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
    onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
}

export const GreekTextarea: React.FC<GreekTextareaProps> = ({
    value,
    onChange,
    placeholder = '',
    className = '',
    disabled = false,
    maxLength,
    rows = 4,
    showValidation = false,
    onBlur,
    onFocus
}) => {
    const [internalValue, setInternalValue] = useState(normalizeGreekText(value));
    const [validationIssues, setValidationIssues] = useState<string[]>([]);
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const normalizedValue = normalizeGreekText(value);
        setInternalValue(normalizedValue);
    }, [value]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const rawValue = e.target.value;
        const processedValue = handleGreekInput(rawValue);

        if (maxLength && processedValue.length > maxLength) {
            return;
        }

        setInternalValue(processedValue);

        if (showValidation) {
            const validation = validateGreekText(processedValue);
            setValidationIssues(validation.issues);
        }

        onChange(processedValue);
    }, [onChange, maxLength, showValidation]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(false);
        const finalValue = handleGreekInput(e.target.value);
        setInternalValue(finalValue);
        onChange(finalValue);

        if (onBlur) {
            onBlur(e);
        }
    }, [onChange, onBlur]);

    const handleFocus = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(true);
        if (onFocus) {
            onFocus(e);
        }
    }, [onFocus]);

    const getTextareaProps = () => ({
        value: internalValue,
        onChange: handleChange,
        onBlur: handleBlur,
        onFocus: handleFocus,
        placeholder,
        disabled,
        maxLength,
        rows,
        ref: textareaRef,
        className: `
      greek-font greek-text greek-ltr
      w-full px-3 py-2 border border-gray-300 rounded-md
      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
      disabled:bg-gray-100 disabled:cursor-not-allowed
      resize-vertical
      ${validationIssues.length > 0 ? 'border-red-500 focus:ring-red-500' : ''}
      ${isFocused ? 'shadow-sm' : ''}
      ${className}
    `.trim(),
        lang: 'el' as const,
        dir: 'ltr' as const,
        autoComplete: 'off',
        spellCheck: false,
        'aria-invalid': validationIssues.length > 0 ? true : false,
        'aria-describedby': validationIssues.length > 0 ? 'greek-textarea-validation' : undefined
    });

    return (
        <div className="greek-textarea-container">
            <textarea {...getTextareaProps()} />

            {showValidation && validationIssues.length > 0 && (
                <div
                    id="greek-textarea-validation"
                    className="mt-1 text-sm text-red-600 greek-text"
                    role="alert"
                >
                    {validationIssues.map((issue, index) => (
                        <div key={index} className="greek-safe-text">
                            {issue}
                        </div>
                    ))}
                </div>
            )}

            {showValidation && validationIssues.length === 0 && internalValue && (
                <div className="mt-1 text-sm text-green-600 greek-text">
                    ✓ Το ελληνικό κείμενο επεξεργάστηκε σωστά
                </div>
            )}
        </div>
    );
};

export default GreekInput;