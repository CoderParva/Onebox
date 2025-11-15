import { IncomingWebhook } from '@slack/webhook';
import axios from 'axios';
import { EmailDocument } from './elasticsearch.service';

class NotificationService {
  private slackWebhook: IncomingWebhook | null = null;
  private webhookSiteUrl: string | null = null;

  constructor() {
    if (process.env.SLACK_WEBHOOK_URL) {
      this.slackWebhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
    }
    if (process.env.WEBHOOK_SITE_URL) {
      this.webhookSiteUrl = process.env.WEBHOOK_SITE_URL;
    }
  }

  public async sendInterestAlert(email: EmailDocument) {
    console.log(`[Notify] Sending alerts for: ${email.subject}`);

    // 1. Send Slack notification
    if (this.slackWebhook) {
      try {
        await this.slackWebhook.send({
          text: `🔥 New 'Interested' Email!
*From:* ${email.from.address}
*Subject:* ${email.subject}`,
        });
        console.log('[Notify] Slack alert sent.');
      } catch (err) {
        console.error('[Notify] Error sending Slack alert:', err);
      }
    }

    // 2. Send webhook.site notification
    if (this.webhookSiteUrl) {
      try {
        await axios.post(this.webhookSiteUrl, {
          type: 'EMAIL_INTERESTED',
          from: email.from.address,
          subject: email.subject,
          body: email.body,
        });
        console.log('[Notify] Webhook.site alert sent.');
      } catch (err) {
        console.error('[Notify] Error sending webhook.site alert:', err);
      }
    }
  }
}

export const notificationService = new NotificationService();