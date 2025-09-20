// test/setup-env.ts
import { config } from 'dotenv';
import path from 'path';

// Ensure the path is resolved from the project root
const envPath = path.resolve(process.cwd(), '.env.test');

const result = config({ path: envPath });

if (result.error) {
  console.error('Error loading .env.test file:', result.error);
} else {
  console.log('.env.test file loaded successfully for tests.');
}
