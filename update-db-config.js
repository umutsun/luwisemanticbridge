// Update database configuration for asb-cli
const fs = require('fs');
const path = require('path');

// Read current .env file
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Update POSTGRES_DB to use rag_chatbot for checking customer data
const updatedEnv = envContent.replace(
  /POSTGRES_DB=.*/,
  'POSTGRES_DB=rag_chatbot'
);

// Write back
fs.writeFileSync(envPath, updatedEnv);

console.log('Updated POSTGRES_DB to rag_chatbot');