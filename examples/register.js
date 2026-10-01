// Point this application's events at a URL. Run once per deploy:
//
//   XIVE_TOKEN=xive_as_… node examples/register.js https://your-tunnel.example.com/
//
// The signing secret is printed ONLY the first time — save it as XIVE_SIGNING_SECRET.
import { Client } from "../src/index.js";

const url = process.argv[2];
if (!process.env.XIVE_TOKEN || !url) {
  console.error("usage: XIVE_TOKEN=xive_as_… node examples/register.js https://…/");
  process.exit(1);
}

const client = new Client({ token: process.env.XIVE_TOKEN });
const app = await client.login();
console.log(`application: ${app.name} (${app.id})`);

const { subscription, secret } = await client.setEventEndpoint(url);
console.log(`endpoint:    ${subscription.target_url}`);
console.log(secret
  ? `secret:      ${secret}   <- save this as XIVE_SIGNING_SECRET, it is not shown again`
  : "secret:      unchanged (rotate with client.rotateSigningSecret() if you lost it)");

// With ping-bot.js running behind that URL, this should report delivered: true.
const test = await client.testEventEndpoint();
console.log(`test ping:   ${test.delivered ? "delivered" : `failed (${test.response_code ?? "no response"}: ${test.error})`}`);
