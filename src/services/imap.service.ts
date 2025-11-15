import { ParsedMail, simpleParser } from 'mailparser';
import Imap from 'node-imap';
import { broadcastNewMail } from '../server'; // Import our broadcast function
import { categorizationService } from './categorization.service';
import { elasticsearchService, EmailDocument } from './elasticsearch.service';

export class ImapService {
  private imap: Imap;
  private accountId: string;

  constructor(config: Imap.Config) {
    this.imap = new Imap(config);
    this.accountId = config.user!;
    this.setupListeners(config);
  }

  public connect() {
    console.log(`[IMAP] Connecting to ${this.accountId}...`);
    this.imap.connect();
  }

  private setupListeners(config: Imap.Config) {
    this.imap.once('ready', () => {
      console.log(`[IMAP] Connection successful for ${this.accountId}`);
      this.openInbox();
    });

    this.imap.once('error', (err: Error) => {
      console.error(`[IMAP ${this.accountId}] Connection error:`, err);
    });

    this.imap.once('end', () => {
      console.log(`[IMAP ${this.accountId}] Connection ended`);
    });

    this.imap.on('mail', (numNewMsgs: number) => {
      console.log(`[IMAP ${this.accountId}] New mail event! (${numNewMsgs} new message(s)).`);
      this.fetchNewMessages();
    });
  }

  private openInbox() {
    this.imap.openBox('INBOX', false, (err, box) => { // false = not read-only
      if (err) {
        console.error(`[IMAP ${this.accountId}] Error opening INBOX:`, err);
        return;
      }
      console.log(`[IMAP ${this.accountId}] INBOX opened.`);
      
      // 1. Sync last 30 days of emails
      this.syncLast30Days();

      // 2. The 'mail' event listener will handle new ones
    });
  }

  // This is public so the API can call it
  public syncLast30Days() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const searchDate = thirtyDaysAgo.toISOString().split('T')[0];

    console.log(`[IMAP ${this.accountId}] Fetching emails since ${searchDate}...`);

    this.imap.search([['SINCE', searchDate]], (err, uids) => {
      if (err || !uids || uids.length === 0) {
        console.log(`[IMAP ${this.accountId}] No new emails found for the last 30 days.`);
        return;
      }
      
      console.log(`[IMAP ${this.accountId}] Found ${uids.length} emails to sync.`);
      this.fetchAndProcess(uids); // Pass array of UIDs
    });
  }

  private fetchNewMessages() {
    console.log(`[IMAP ${this.accountId}] Checking for new messages...`);
    this.imap.search(['UNSEEN'], (err, uids) => {
      if (err || !uids || uids.length === 0) {
        console.log(`[IMAP ${this.accountId}] No new unseen messages found.`);
        return;
      }
      console.log(`[IMAP ${this.accountId}] Found ${uids.length} new messages.`);
      this.fetchAndProcess(uids); // Pass UID array
    });
  }

  private fetchAndProcess(uids: number[]) {
    if (uids.length === 0) {
      console.log(`[IMAP ${this.accountId}] No UIDs to fetch.`);
      return;
    }

    const f = this.imap.fetch(uids, { bodies: '', markSeen: true }); // Mark as seen

    f.on('message', (msg, seqno) => {
      console.log(`[IMAP ${this.accountId}] Processing message #${seqno}`);

      msg.on('body', (stream, info) => {
        simpleParser(stream, async (err, parsed) => {
          if (err) {
            console.error(`[MailParser ${this.accountId}] Error parsing msg #${seqno}:`, err);
            return;
          }
          
          await this.indexParsedEmail(parsed, 'INBOX', seqno);
        });
      });
    });

    f.once('error', (err) => {
      console.error(`[IMAP ${this.accountId}] Fetch error:`, err);
    });

    f.once('end', () => {
      console.log(`[IMAP ${this.accountId}] Finished fetching messages.`);
    });
  }

  private async indexParsedEmail(parsed: ParsedMail, folder: string, seqno: number) {
    if (!parsed.messageId) {
      console.warn(`[IMAP ${this.accountId}] Skipping email with no messageId (seqno #${seqno})`);
      return;
    }

    const emailDoc: EmailDocument = {
      accountId: this.accountId,
      messageId: parsed.messageId,
      from: {
        name: parsed.from?.value[0]?.name || '',
        address: parsed.from?.value[0]?.address || '',
      },
      to: parsed.to?.value.map(to => ({
        name: to.name || '',
        address: to.address || '',
      })) || [],
      subject: parsed.subject || '',
      body: parsed.text || '', // Store the plain text body
      receivedAt: parsed.date || new Date(),
      folder: folder,
    };

    // 1. Save to database
    await elasticsearchService.indexEmail(emailDoc);

    // 2. Send to UI via WebSocket *immediately*
    broadcastNewMail(emailDoc);

    // 3. Start AI categorization (runs in background)
    categorizationService.categorizeEmail(emailDoc);
  }
}