import { POST as loginRoute } from '../src/app/api/auth/login/route';
import { NextRequest } from 'next/server';
import { computeTotpCode, getCurrentTimeCounter, deleteUserTotpRecord } from '../src/lib/server-totp';

async function testHttpRoutes() {
  console.log('🌐 Testing /api/auth/login HTTP API Routes...\n');

  // Ensure clean slate for test user
  const username = 'vrushank';
  const password = 'vrushank@sh26';
  deleteUserTotpRecord(username);

  // 1. First Login Attempt (Username + Password)
  console.log('1. Submitting username and password for @vrushank...');
  const req1 = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const res1 = await loginRoute(req1);
  const data1 = await res1.json();

  if (!data1.requires_totp_setup || !data1.challenge_id || !data1.qr_code_url) {
    throw new Error(`Expected requires_totp_setup, got ${JSON.stringify(data1)}`);
  }
  console.log('  ✅ Server returned TOTP Setup Challenge:');
  console.log(`     Challenge ID: ${data1.challenge_id}`);
  console.log(`     Manual Key: ${data1.manual_key}`);
  console.log(`     QR Code Data URL Length: ${data1.qr_code_url.length} chars`);

  // 2. Activate Enrollment with 6-digit Code
  console.log('\n2. Generating code and activating Authenticator setup...');
  const setupCode = computeTotpCode(data1.manual_key, getCurrentTimeCounter());
  const req2 = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'verify_totp_setup',
      challenge_id: data1.challenge_id,
      totp_code: setupCode,
    }),
  });

  const res2 = await loginRoute(req2);
  const data2 = await res2.json();

  if (!data2.success || !data2.token || !data2.user || data2.user.role !== 'employee') {
    throw new Error(`Setup verification failed: ${JSON.stringify(data2)}`);
  }
  if (!Array.isArray(data2.backup_codes) || data2.backup_codes.length !== 10) {
    throw new Error('Expected 10 backup codes upon activation');
  }
  console.log(`  ✅ Setup activated! Logged in as: ${data2.user.name} (${data2.user.role})`);
  console.log(`     Backup codes issued: ${data2.backup_codes.length}`);

  // 3. Subsequent Login (Should prompt normal 2FA verification)
  console.log('\n3. Second login attempt for @vrushank...');
  const req3 = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const res3 = await loginRoute(req3);
  const data3 = await res3.json();

  if (!data3.requires_totp || !data3.challenge_id) {
    throw new Error(`Expected requires_totp, got ${JSON.stringify(data3)}`);
  }
  console.log('  ✅ Server returned normal TOTP verification challenge:');
  console.log(`     Challenge ID: ${data3.challenge_id}`);

  // 4. Verify normal 2FA login with one of the backup codes
  console.log('\n4. Logging in with single-use backup code...');
  const backupCode = data2.backup_codes[0];
  const req4 = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'verify_totp',
      challenge_id: data3.challenge_id,
      totp_code: backupCode,
    }),
  });

  const res4 = await loginRoute(req4);
  const data4 = await res4.json();
  if (!data4.success || !data4.token || data4.user.role !== 'employee') {
    throw new Error(`Backup code login failed: ${JSON.stringify(data4)}`);
  }
  console.log(`  ✅ Successfully authenticated via backup code "${backupCode}"!`);

  // 5. Clean up test user so they can set up cleanly in live UI
  deleteUserTotpRecord(username);
  deleteUserTotpRecord('adminsh');
  console.log('\n  ✅ Cleaned up test enrollment records so users will experience fresh Google Authenticator setup on first login.');

  console.log('\n🎉 ALL HTTP AUTH API ROUTE TESTS PASSED 100%!\n');
}

testHttpRoutes().catch((err) => {
  console.error('\n❌ HTTP API test failed:', err);
  process.exit(1);
});
