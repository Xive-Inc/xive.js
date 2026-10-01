// OPTIONAL — only for HTTP delivery instead of the gateway. Points this application's events at an
// https URL. Run once per deploy:
//
//   XIVE_TOKEN=xive_as_… node examples/register.js https://your-server.example.com/
//
// The signing secret is printed ONLY the first time — pass it to `new Client({ signingSecret })`.
import { Connection } from "../src/index.js";

const url = process.argv[2];
if (!process.env.XIVE_TOKEN || !url) {
  console.error("usage: XIVE_TOKEN=xive_as_… node examples/register.js https://…/");
  process.exit(1);
}

const xive = new Connection({ token: process.env.XIVE_TOKEN });
const app = await xive.login();
console.log(`application: ${app.name} (${app.id})`);

const { subscription, secret } = await xive.setEventEndpoint(url);
console.log(`endpoint:    ${subscription.target_url}`);
console.log(secret
  ? `secret:      ${secret}   <- save this, it is not shown again`
  : "secret:      unchanged (rotate with xive.rotateSigningSecret() if you lost it)");

const test = await xive.testEventEndpoint();
console.log(`test ping:   ${test.delivered ? "delivered" : `failed (${test.response_code ?? "no response"}: ${test.error})`}`);
