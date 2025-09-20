import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest'e projenin tamamındaki .test.ts ve .spec.ts dosyalarını
    // taramasını söyleyen glob pattern.
    include: ['**/*.{test,spec}.ts'],
    // Performansı artırmak ve gereksiz dosyaları taramamak için
    // node_modules gibi klasörleri hariç tut.
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/e2e/**'],
    // Testlerin birbirini etkilememesi için her test dosyasını izole et.
    isolate: true,
    // API testleri gibi uzun sürebilecek testler için zaman aşımını artır.
    testTimeout: 10000,
    // Jest'in global API'lerini (describe, it, expect, jest) etkinleştir
    globals: true,
    // Testler başlamadan önce çalıştırılacak kurulum dosyaları
    setupFiles: ['./test/setup-env.ts'],
  },
});
