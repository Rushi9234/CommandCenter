import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';

// Ensure resilient DNS resolution for Neon database hosts across varied network ISP configurations
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  const origLookup = dns.lookup;
  (dns as any).lookup = (hostname: string, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'object' ? options : {};
    if (hostname && (hostname.includes('neon.tech') || hostname.includes('aws.neon.tech'))) {
      dns.resolve(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length > 0) {
          if (opts.all) {
            return cb(null, addresses.map((addr) => ({ address: addr, family: 4 })));
          }
          return cb(null, addresses[0], 4);
        }
        origLookup(hostname, options, callback);
      });
    } else {
      origLookup(hostname, options, callback);
    }
  };
} catch {
  // Graceful fallback if custom DNS configuration cannot be applied
}


// Jest setupFiles run once per test file, before that file's own imports
// are evaluated -- so by the time a test file does `import { app } from
// '../../src/app'`, config/env.ts's own `dotenv.config()` call (which
// loads backend/.env and never overwrites a key already present in
// process.env) will find DATABASE_URL/NODE_ENV/etc. already set from
// .env.test below and leave them alone. Production's .env is never read
// during a test run.
dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: true });

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('commandcenter_test')) {
  throw new Error(
    'Tests must run against the commandcenter_test database. Check backend/.env.test exists and its DATABASE_URL points at commandcenter_test (see .env.test.example).'
  );
}
