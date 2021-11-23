import { IncomingWebhook } from '@slack/webhook';

const url = process.env.SLACK_WEBHOOK_URL || '';

export const slack = new IncomingWebhook(url);
