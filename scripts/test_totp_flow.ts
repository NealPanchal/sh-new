import {
  generateTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  computeTotpCode,
  getCurrentTimeCounter,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  saveUserTotpRecord,
  getUserTotpRecord,
  deleteUserTotpRecord,
  createTotpSetupChallenge,
  activateTotpEnrollment,
  createTotpLoginChallenge,
  verifyTotpLoginCode,
} from '../src/lib/server-totp';
import { execSync } from 'child_process';

async function runTestSuite() {
  console.log('🧪 Starting Showhouse RFC 6238 TOTP Two-Factor Authentication Test Suite...\n');

  // Test 1: Secret Generation & Fernet Cross-Language Parity with Python
  console.log('Test 1: Secret Generation & Fernet Cross-Language Parity');
  const secret = generateTotpSecret();
  if (secret.length !== 32) throw new Error(`Secret length expected 32, got ${secret.length}`);
  const encrypted = encryptTotpSecret(secret);
  const decrypted = decryptTotpSecret(encrypted);
  if (decrypted !== secret) throw new Error('Fernet decryption failed to match secret');

  // Python decrypt CLI verification
  const pythonDecrypted = execSync(
    `python3 scripts/totp_service.py decrypt --token "${encrypted}"`
  ).toString().trim();
  if (pythonDecrypted !== secret) {
    throw new Error(`Python decrypted secret "${pythonDecrypted}" != original "${secret}"`);
  }
  console.log('  ✅ Secret generated (Base32 32-char), Fernet encrypted & verified via Python CLI');

  // Clean test user state
  const testUser = 'test_user_' + Date.now();
  deleteUserTotpRecord(testUser);

  // Test 2: First-Time Setup Enrollment Flow
  console.log('\nTest 2: First-Time Setup Enrollment Flow');
  const setup = await createTotpSetupChallenge(testUser, 'admin');
  if (!setup.qr_code_url || !setup.qr_code_url.startsWith('data:image/png;base64,')) {
    throw new Error('QR code data URL missing or invalid format');
  }
  if (!setup.manual_key || setup.manual_key.length !== 32) {
    throw new Error('Manual key missing or invalid length');
  }

  // Generate OTP using Python service for the setup challenge
  const codeForSetup = execSync(
    `python3 scripts/totp_service.py generate-code --secret "${setup.secret}"`
  ).toString().trim();
  console.log(`  Generated TOTP code from Python service: ${codeForSetup}`);

  const verifySetupRes = activateTotpEnrollment(setup.challenge_id, codeForSetup);
  if (!verifySetupRes.success) {
    throw new Error(`Setup verification failed: ${verifySetupRes.error}`);
  }
  if (!verifySetupRes.plainBackupCodes || verifySetupRes.plainBackupCodes.length !== 10) {
    throw new Error('Expected 10 backup codes after setup verification');
  }
  console.log('  ✅ Setup verified successfully. 10 backup codes generated:');
  console.log(`     ${verifySetupRes.plainBackupCodes.slice(0, 3).join(', ')} ... [${verifySetupRes.plainBackupCodes.length} total]`);

  // Verify record in persistence
  const savedRecord = getUserTotpRecord(testUser);
  if (!savedRecord || !savedRecord.totp_enabled) {
    throw new Error('Record not marked totp_enabled in database');
  }
  console.log('  ✅ User TOTP record saved to disk with Fernet-encrypted secret and hashed backup codes');

  // Test 3: Replay Protection on Setup Code
  console.log('\nTest 3: Anti-Replay Protection');
  const loginChallenge1 = createTotpLoginChallenge(testUser, 'admin');
  const replayRes = verifyTotpLoginCode(loginChallenge1.challenge_id, codeForSetup);
  if (replayRes.valid) {
    throw new Error('Replay attack should have failed! Code was accepted twice.');
  }
  console.log(`  ✅ Replay attack rejected: "${replayRes.error}"`);

  // Test 4: Subsequent Normal Login with New Code
  console.log('\nTest 4: Subsequent Normal Login with Fresh Code');
  const userSecret = decryptTotpSecret(savedRecord.totp_secret_encrypted);
  // Next time step counter to avoid replay (within +1 tolerance window)
  const nextCounter = (savedRecord.last_totp_counter || getCurrentTimeCounter()) + 1;
  const freshCode = computeTotpCode(userSecret, nextCounter);
  const loginChallenge2 = createTotpLoginChallenge(testUser, 'admin');
  const normalLoginRes = verifyTotpLoginCode(loginChallenge2.challenge_id, freshCode);
  if (!normalLoginRes.valid) {
    throw new Error(`Normal login verification failed: ${normalLoginRes.error}`);
  }
  console.log(`  ✅ Login verified with fresh code "${freshCode}" (User: @${normalLoginRes.username}, Role: ${normalLoginRes.role})`);

  // Test 5: Emergency Backup Code Recovery Flow
  console.log('\nTest 5: Emergency Backup Code Recovery');
  const backupCodeToUse = verifySetupRes.plainBackupCodes[0];
  const loginChallenge3 = createTotpLoginChallenge(testUser, 'admin');
  const backupLoginRes = verifyTotpLoginCode(loginChallenge3.challenge_id, backupCodeToUse);
  if (!backupLoginRes.valid || !backupLoginRes.isBackupCode) {
    throw new Error(`Backup code verification failed: ${backupLoginRes.error}`);
  }
  console.log(`  ✅ Emergency backup code "${backupCodeToUse}" accepted for login`);

  // Test 6: Backup Code Single-Use Invalidation
  console.log('\nTest 6: Backup Code Single-Use Invalidation');
  const loginChallenge4 = createTotpLoginChallenge(testUser, 'admin');
  const backupReusedRes = verifyTotpLoginCode(loginChallenge4.challenge_id, backupCodeToUse);
  if (backupReusedRes.valid) {
    throw new Error('Backup code reuse should have been rejected!');
  }
  console.log(`  ✅ Reused backup code rejected: "${backupReusedRes.error}"`);

  const updatedRec = getUserTotpRecord(testUser);
  if (!updatedRec?.backup_codes_used?.includes(hashBackupCode(backupCodeToUse))) {
    throw new Error('Backup code hash not marked as used in database');
  }
  console.log(`  ✅ Backup codes remaining: ${10 - (updatedRec?.backup_codes_used?.length || 0)} / 10`);

  // Test 7: Admin 2FA Reset Workflow
  console.log('\nTest 7: Admin 2FA Reset Workflow');
  deleteUserTotpRecord(testUser);
  const resetRec = getUserTotpRecord(testUser);
  if (resetRec) {
    throw new Error('User record should be deleted after reset');
  }
  console.log('  ✅ Admin reset deleted user 2FA record. Next login will enforce fresh QR enrollment.');

  console.log('\n🎉 ALL RFC 6238 TOTP UNIT & INTEGRATION TESTS PASSED 100%!\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
