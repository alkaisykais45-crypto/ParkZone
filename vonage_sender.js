import 'dotenv/config';

import { Vonage } from "@vonage/server-sdk";
import { Channels } from "@vonage/messages";

const requiredConfig = [
  "VONAGE_API_KEY",
  "VONAGE_API_SECRET",
  "VONAGE_TO",
  "VONAGE_FROM",
];

const missingConfig = requiredConfig.filter((name) => !process.env[name]);

if (missingConfig.length > 0) {
  console.error(`Missing Vonage configuration: ${missingConfig.join(", ")}`);
  process.exitCode = 1;
} else {
  const vonage = new Vonage({
    apiKey: process.env.VONAGE_API_KEY,
    apiSecret: process.env.VONAGE_API_SECRET,
  });

  vonage.messages
    .send({
      messageType: "text",
      channel: Channels.SMS,
      text: "This is an SMS text message sent using the Vonage Messages API",
      to: process.env.VONAGE_TO,
      from: process.env.VONAGE_FROM,
    })
    .then(({ messageUUID }) => console.log(messageUUID))
    .catch((error) => {
      console.error("Failed to send SMS:", error);
      process.exitCode = 1;
    });
}