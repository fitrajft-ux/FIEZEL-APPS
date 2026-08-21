/* FIEZEL Core Brain runtime configuration.
 * workerUrl remains empty in distributable source until an operator-owned Puter Worker is deployed.
 * Never put VAPID private keys, cron tokens, or Puter auth tokens here.
 */
// m025-34: the mandatory notification gate reads this flag. The gate UI and lock
// logic already existed but the flag was never set outside tests, so the gate rendered
// and then let everyone through. OWNER requires it enforced: no entry until the browser
// permission is actually 'granted'.
self.FIEZEL_REQUIRE_NOTIFICATIONS=true;
// m025-61: penanda build halaman, dipakai health check untuk membandingkan versi yang
// benar-benar dimuat dengan shell yang dipegang service worker. Nilainya dijaga gate agar
// selalu sama dengan DIAG_BUILD; kalau keduanya berbeda, install-health-test gagal.
self.FIEZEL_PAGE_BUILD='m025-84';
self.FIEZEL_CORE_CONFIG=Object.freeze({
  workerUrl:'https://fiezel-core.puter.work',
  protocolVersion:'1.7',
  aiGateway:'core-only',
  remotePushRequired:true,
  deploymentState:'validated'
});
