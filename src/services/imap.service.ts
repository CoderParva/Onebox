import { simpleParser } from 'mailparser';
import Imap from 'node-imap';
import { broadcastToAll } from '../server.js';
import { categorizeEmail } from './categorization.service.js';
import type { EmailDocument } from './elasticsearch.service.js';
import { esClient, indexEmail } from './elasticsearch.service.js';

export interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  tlsOptions?: any;
  accountId: string;
}

export function startImapService(config: ImapConfig) {
  const imap = new Imap({
    user: config.user,
    password: config.password,
    host: config.host,
    port: config.port,
    tls: config.tls,
    tlsOptions: config.tlsOptions || { rejectUnauthorized: false }
  });

  function openInbox(cb: any) {
    imap.openBox('INBOX', false, cb);
  }

  imap.once('ready', () => {
    console.log(`IMAP connection ready for ${config.accountId}`);
    openInbox((err: any, box: any) => {
      if (err) {
        console.error('Error opening inbox:', err);
        return;
      }

      console.log(`Inbox opened for ${config.accountId}`);

      // Fetch recent emails
      fetchRecentEmails(config.accountId);

      // Listen for new emails using IDLE
      imap.on('mail', (numNewMsgs: number) => {
        console.log(`${numNewMsgs} new email(s) received for ${config.accountId}`);
        fetchRecentEmails(config.accountId);
      });
    });
  });

  function fetchRecentEmails(accountId: string) {
    imap.search(['UNSEEN'], (err: any, uids: any) => {
      if (err) {
        console.error('Error searching emails:', err);
        return;
      }

      if (!uids || uids.length === 0) {
        console.log('No new emails');
        return;
      }

      console.log(`Fetching ${uids.length} new emails`);
      const fetch = imap.fetch(uids, { bodies: '' });

      fetch.on('message', (msg: any, seqno: any) => {
        let buffer = '';
        
        msg.on('body', (stream: any, info: any) => {
          stream.on('data', (chunk: any) => {
            buffer += chunk.toString('utf8');
          });

          stream.once('end', async () => {
            try {
              const parsed = await simpleParser(buffer);
              
              const emailDoc: EmailDocument = {
                accountId: accountId,
                messageId: parsed.messageId || `${Date.now()}-${Math.random()}`,
                from: {
                  name: parsed.from?.value?.[0]?.name || '',
                  address: parsed.from?.value?.[0]?.address || ''
                },
                to: (parsed.to?.value || []).map((to: any) => ({
                  name: to.name || '',
                  address: to.address || ''
                })),
                subject: parsed.subject || 'No Subject',
                body: parsed.text || parsed.html || '',
                receivedAt: parsed.date?.toISOString() || new Date().toISOString()
              };

              // Index email
              await indexEmail(emailDoc);

              // Broadcast to WebSocket clients
              broadcastToAll({ type: 'new_email', email: emailDoc });

              // Categorize email asynchronously
              categorizeEmail(emailDoc).then(category => {
                broadcastToAll({ 
                  type: 'email_categorized', 
                  messageId: emailDoc.messageId,
                  category: category 
                });
              });

            } catch (err: any) {
              console.error('Error parsing email:', err);
            }
          });
        });
      });

      fetch.once('error', (err: any) => {
        console.error('Fetch error:', err);
      });

      fetch.once('end', () => {
        console.log('Done fetching emails');
      });
    });
  }

  imap.once('error', (err: any) => {
    console.error('IMAP error:', err);
  });

  imap.once('end', () => {
    console.log('IMAP connection ended');
  });

  imap.connect();
}
