import cors from 'cors';
import dotenv from 'dotenv';
// ➡️ FIX TS1484: Use 'type' for type-only imports when verbatimModuleSyntax is true
import express, { type Request, type Response } from 'express';
import http from 'http';
import Imap from 'node-imap';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { EmailDocument, elasticsearchService } from './services/elasticsearch.service';
import { ImapService } from './services/imap.service';
import { ragService } from './services/rag.service';

// --- CRITICAL FIX: Load environment variables explicitly from root ---
// This ensures variables are available regardless of path confusion.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// --- Global App Variables ---
const app = express();
// ➡️ CRITICAL FIX: Use process.env.PORT for hosting environments (Render)
const port = parseInt(process.env.PORT || '3000', 10); 
const imapConnections = new Map<string, ImapService>();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log('[WSS] WebSocket server created.');
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('[WSS] Client connected');
  clients.add(ws);
  ws.on('close', () => {
    console.log('[WSS] Client disconnected');
    clients.delete(ws);
  });
  ws.on('error', (err) => console.error('[WSS] WebSocket error:', err));
});

/**
 * Sends the new email object to all connected frontend clients.
 */
export function broadcastNewMail(email: EmailDocument) {
  console.log(`[WSS] Broadcasting NEW_MAIL for: ${email.subject}`);
  
  const payload = {
    type: 'NEW_MAIL',
    email: email
  };

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }
}

// --- Express App Setup ---
app.use(express.json());
app.use(cors());

// --- API ENDPOINTS ---
app.get('/api/emails', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string || process.env.IMAP_USER!;
    const folder = (req.query.folder as string) || 'INBOX';
    const searchQuery = (req.query.search as string) || '';
    const emails = await elasticsearchService.searchEmails(accountId, folder, searchQuery);
    res.json(emails);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

app.get('/api/folders', (req: Request, res: Response) => {
  res.json([
    { id: 'INBOX', name: 'Inbox' },
    { id: 'Sent', name: 'Sent' },
    { id: 'Spam', name: 'Spam' },
  ]);
});

app.post('/api/suggest-reply', async (req: Request, res: Response) => {
  try {
    const { emailBody } = req.body;
    if (!emailBody) {
      return res.status(400).json({ error: 'emailBody is required' });
    }
    const reply = await ragService.generateReplyForText(emailBody);
    res.json({ reply });
  } catch (err) {
    console.error('[API] Error generating reply:', err);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

app.post('/api/sync', (req: Request, res: Response) => {
  try {
    const accountId = req.body.accountId || process.env.IMAP_USER!;
    const connection = imapConnections.get(accountId);
    if (connection) {
      console.log(`[API] Triggering manual sync for ${accountId}`);
      connection.syncLast30Days();
      res.status(200).json({ message: 'Sync triggered.' });
    } else {
      res.status(404).json({ error: 'Account not found or not connected.' });
    }
  } catch (err) {
    console.error('[API] Error triggering sync:', err);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// --- SERVER STARTUP ---
server.listen(port, async () => {
  console.log(`Server listening at http://localhost:${port}`);
  
  await elasticsearchService.setup();
  await ragService.setup(); 
  
  // --- Start Account 1 (Primary) ---
  console.log('[Server] Starting IMAP for Account 1...');
  const config1: Imap.Config = {
    user: process.env.IMAP_USER!,
    password: process.env.IMAP_PASSWORD!,
    host: process.env.IMAP_HOST!,
    port: parseInt(process.env.IMAP_PORT!, 10) || 993,
    tls: process.env.IMAP_TLS === 'true',
    tlsOptions: { rejectUnauthorized: false }
  };
  const account1 = new ImapService(config1);
  imapConnections.set(config1.user!, account1); 
  account1.connect();

  // --- Start Account 2 (Optional) ---
  if (process.env.IMAP_USER_2 && process.env.IMAP_PASSWORD_2) {
    console.log('[Server] Starting IMAP for Account 2...');
    const config2: Imap.Config = {
      user: process.env.IMAP_USER_2,
      password: process.env.IMAP_PASSWORD_2,
      host: process.env.IMAP_HOST_2 || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT_2!, 10) || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    };
    const account2 = new ImapService(config2);
    imapConnections.set(config2.user!, account2); 
    account2.connect();
  }
});