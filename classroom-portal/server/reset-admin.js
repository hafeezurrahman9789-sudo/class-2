#!/usr/bin/env node
// Run with: npm run admin:reset
// Lets whoever has terminal access to the server set new admin credentials.
// This is the intended "forgot admin password" recovery path — since there's
// exactly one admin account and no admin email on file to send a reset link
// to, recovery has to happen at the server, not through the website.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envPath = path.join(__dirname, '..', '.env');

function ask(rl, question, hidden = false) {
  return new Promise((resolve) => {
    if (!hidden) { rl.question(question, resolve); return; }
    // Minimal masked input for the password prompt.
    const stdin = process.stdin;
    process.stdout.write(question);
    let input = '';
    const onData = (char) => {
      char = char.toString('utf8');
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
        return;
      }
      if (char === '\u0003') process.exit(1); // Ctrl+C
      if (char === '\u007f') { input = input.slice(0, -1); return; } // backspace
      input += char;
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('The Register — Admin credential reset\n');

  const name = (await ask(rl, `Admin name [Administrator]: `)) || 'Administrator';
  const password = await ask(rl, `New admin password: `, true);
  const confirm = await ask(rl, `Confirm password: `, true);
  rl.close();

  if (!password || password.length < 6) {
    console.error('\nPassword must be at least 6 characters. Nothing was changed.');
    process.exit(1);
  }
  if (password !== confirm) {
    console.error('\nPasswords did not match. Nothing was changed.');
    process.exit(1);
  }

  let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  envText = setEnvVar(envText, 'ADMIN_NAME', name);
  envText = setEnvVar(envText, 'ADMIN_PASSWORD', password);
  fs.writeFileSync(envPath, envText);

  console.log('\nDone. Restart the server for the new credentials to take effect:');
  console.log('  npm start');
}

function setEnvVar(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  return text.trim() + `\n${line}\n`;
}

main();
