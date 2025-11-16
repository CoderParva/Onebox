import { IncomingWebhook } from '@slack/webhook';
import axios from 'axios';
import type { EmailDocument } from './elasticsearch.service.js';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const WEBHOOK_SITE_URL = process.env.WEBHOOK_SITE_URL;

export async function sendNotification(email: EmailDocument, category: string) {
  const message = {
    email: {
      from: email.from,
      subject: email.subject,
      body: email.body.substring(0, 200) + '...',
      receivedAt: email.receivedAt
    },
    category: category,
    timestamp: new Date().toISOString()
  };

  // Send to Slack
  if (SLACK_WEBHOOK_URL) {
    try {
      const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);
      await webhook.send({
        text: `🔔 New "${category}" Email`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `📧 ${category} Email Received`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*From:*\n${email.from.name} <${email.from.address}>`
              },
              {
                type: 'mrkdwn',
                text: `*Subject:*\n${email.subject}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Preview:*\n${email.body.substring(0, 200)}...`
            }
          }
        ]
      });
      console.log('Slack notification sent');
    } catch (error: any) {
      console.error('Error sending Slack notification:', error.message);
    }
  }

  // Send to webhook.site
  if (WEBHOOK_SITE_URL) {
    try {
      await axios.post(WEBHOOK_SITE_URL, message);
      console.log('Webhook notification sent');
    } catch (error: any) {
      console.error('Error sending webhook notification:', error.message);
    }
  }
}
