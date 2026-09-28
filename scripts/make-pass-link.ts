/**
 * Mint a signed pass link — what WalletLoop's pass backend puts on a member's wallet pass.
 *   npx tsx --env-file=.env.local scripts/make-pass-link.ts <memberId> [tenant] [hours]
 *
 * Needs PASS_LINK_SECRET (the same secret the app verifies with). Base URL: PUBLIC_BASE_URL,
 * default http://localhost:3100. Prints the link on stdout; details go to stderr.
 */
import { TENANTS } from "../src/config/tenant";
import { CUSTOMER_SEEDS } from "../src/data/customers";
import { buildPassLink, passLinkSecret } from "../src/lib/passToken";

function main() {
  const [memberId, tenantArg, hoursArg] = process.argv.slice(2);
  if (!memberId) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/make-pass-link.ts <memberId> [tenant] [hours]");
    console.error(`Demo members: ${CUSTOMER_SEEDS.map((c) => `${c.memberId} (${c.firstName})`).join(", ")}`);
    process.exit(1);
  }
  const tenant = (tenantArg ?? process.env.TENANT ?? "demo").toLowerCase();
  if (!TENANTS[tenant]) {
    console.error(`Unknown tenant "${tenant}". Known: ${Object.keys(TENANTS).join(", ")}`);
    process.exit(1);
  }
  const hours = hoursArg === undefined ? 24 : Number(hoursArg);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error(`hours must be a positive number, got "${hoursArg}"`);
    process.exit(1);
  }
  if ((process.env.DATA_SOURCE ?? "demo") === "demo" && !CUSTOMER_SEEDS.some((c) => c.memberId === memberId)) {
    console.error(`Warning: ${memberId} is not a demo member — the app will answer "Unknown member".`);
  }

  const secret = passLinkSecret();
  const link = buildPassLink({ memberId, tenant, hours, secret });
  console.error(`Pass link for ${memberId} @ ${tenant}, valid ${hours} h (until ${new Date(Date.now() + hours * 3600_000).toISOString()}):`);
  console.log(link);
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
