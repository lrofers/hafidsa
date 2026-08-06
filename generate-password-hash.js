/**
 * Run this once locally to turn your chosen admin password into a bcrypt
 * hash — that hash is what goes in the ADMIN_PASSWORD_HASH env variable.
 * Your real password is never stored anywhere, only this hash.
 *
 * Usage:
 *   node generate-password-hash.js "YourChosenPassword"
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node generate-password-hash.js "YourChosenPassword"');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log('\nAdd this to your .env / hosting platform env vars:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
});
