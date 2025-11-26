/**
 * YUNANCA (Greek) Character Test Page
 * Tests YUNANCA character display and functionality
 */

'use client';

import React, { useState } from 'react';
import { GreekInput, GreekTextarea } from '@/components/ui/greek-input';
import {
    safeGreekText,
    normalizeGreekText,
    formatGreekDisplay,
    handleGreekInput,
    validateGreekText,
    testGreekCharacterHandling,
    getGreekHtmlAttributes
} from '@/utils/greek-text-handler';

export default function TestGreek() {
    const [testValue, setTestValue] = useState('Καλημέρα');
    const [testTextarea, setTestTextarea] = useState('Αυτό είναι ένα τεστ για ελληνικά γράμματα: άέήίόύώ');
    const [validationResult, setValidationResult] = useState<{ isValid: boolean; issues: string[] } | null>(null);
    const [testResults, setTestResults] = useState<string[]>([]);

    const testTexts = [
        'Καλημέρα',
        'Πώς είστε;',
        'Αυτό είναι ένα τεστ',
        'Ελληνικά γράμματα: αβγδεζηθικλμνξοπρστυφχψω',
        'Διακριτικά: άέήίόύώ',
        'Κεφαλαία: ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
        'Μεικτά: ΆέΉίΌΎΏ'
    ];

    const runValidation = () => {
        const result = validateGreekText(testValue);
        setValidationResult(result);
    };

    const runCharacterTests = () => {
        const results: string[] = [];

        testTexts.forEach((text, index) => {
            const processed = formatGreekDisplay(text);
            const validation = validateGreekText(processed);

            results.push(`Test ${index + 1}: "${text}"`);
            results.push(`  Processed: "${processed}"`);
            results.push(`  Valid: ${validation.isValid ? '✓' : '✗'}`);

            if (!validation.isValid) {
                validation.issues.forEach(issue => {
                    results.push(`  Issue: ${issue}`);
                });
            }
            results.push('');
        });

        const globalTest = testGreekCharacterHandling();
        results.push(`Global Test Result: ${globalTest ? '✓ PASSED' : '✗ FAILED'}`);

        setTestResults(results);
    };

    const htmlAttributes = getGreekHtmlAttributes();

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-4 greek-text">YUNANCA (Greek) Karakter Testi</h1>
                <p className="text-gray-600 mb-6">Bu sayfa YUNANCA (Greek) karakter desteğini test etmek için kullanılır.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Greek Input Test */}
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold mb-4 greek-text">YUNANCA Input Testi</h2>
                    <GreekInput
                        value={testValue}
                        onChange={setTestValue}
                        placeholder="Ελληνικό κείμενο..."
                        showValidation={true}
                        className="mb-4"
                    />
                    <button
                        onClick={runValidation}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                    >
                        Doğrula
                    </button>

                    {validationResult && (
                        <div className="mt-4 p-4 bg-gray-100 rounded">
                            <h3 className="font-semibold mb-2">Validation Sonucu:</h3>
                            <p className={validationResult.isValid ? 'text-green-600' : 'text-red-600'}>
                                {validationResult.isValid ? '✓ Geçerli' : '✗ Geçersiz'}
                            </p>
                            {!validationResult.isValid && validationResult.issues.length > 0 && (
                                <ul className="mt-2 list-disc list-inside">
                                    {validationResult.issues.map((issue, index) => (
                                        <li key={index} className="text-sm text-red-600">{issue}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Greek Textarea Test */}
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold mb-4 greek-text">YUNANCA Textarea Testi</h2>
                    <GreekTextarea
                        value={testTextarea}
                        onChange={setTestTextarea}
                        placeholder="Πολύγραμμο ελληνικό κείμενο..."
                        rows={4}
                        showValidation={true}
                        className="mb-4"
                    />
                    <div className="text-sm text-gray-600">
                        <p>Değer: {testTextarea}</p>
                        <p>Uzunluk: {testTextarea.length}</p>
                    </div>
                </div>
            </div>

            {/* Character Tests */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4 greek-text">Karakter Testleri</h2>
                <button
                    onClick={runCharacterTests}
                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors mb-4"
                >
                    Tüm Testleri Çalıştır
                </button>

                {testResults.length > 0 && (
                    <div className="mt-4 p-4 bg-gray-100 rounded">
                        <h3 className="font-semibold mb-2">Test Sonuçları:</h3>
                        <pre className="text-sm whitespace-pre-wrap font-mono">
                            {testResults.join('\n')}
                        </pre>
                    </div>
                )}
            </div>

            {/* HTML Attributes */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4 greek-text">HTML Nitelikleri</h2>
                <div className="bg-gray-100 p-4 rounded">
                    <pre className="text-sm">
                        {JSON.stringify(htmlAttributes, null, 2)}
                    </pre>
                </div>
            </div>

            {/* Sample Texts */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 greek-text">Örnek Metinler</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {testTexts.map((text, index) => (
                        <div key={index} className="p-3 bg-gray-50 rounded">
                            <p className="greek-text font-medium">Örnek {index + 1}:</p>
                            <p className="greek-text">{text}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                İşlenmiş: {formatGreekDisplay(text)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}