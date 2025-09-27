'use client';

import React from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../lib/i18n.ts';

interface Props {
  children: React.ReactNode;
}

export default function I18nProvider({ children }: Props) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
