import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from 'express';
import Imap from 'node-imap';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import type { EmailDocument } from './services/elasticsearch.service.js';
import { esClient, indexEmail } from './services/elasticsearch.service.js';
import { startImapService } from './services/imap.service.js';
import { queryRAG } from './services/rag.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'public')));

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: any) => {
  console.log('WebSocket client connected');
  ws.on('close', () => console.log('WebSocket client disconnected'));
});

app.get('/api/emails', async (req: Request, res: Response): Promise<any> => {
  try {
    const { search, folder, accountId } = req.query;
    const indexName = 'emails';

    const mustClauses: any[] = [];
    if (accountId) mustClauses.push({ term: { accountId } });
    if (folder) mustClauses.push({ term: { 'folder.keyword': folder } });

    const query = search
      ? {
          bool: {
            must: [
              ...mustClauses,
              {
                multi_match: {
                  query: search,
                  fields: ['subject', 'body', 'from.name', 'from.address']
                }
              }
            ]
          }
        }
      : mustClauses.length > 0
      ? { bool: { must: mustClauses } }
      : { match_all: {} };

    const result = await esClient.search({
      index: indexName,
      query: query,
      sort: [{ receivedAt: { order: 'desc' } }],
      size: 100
    });

    const emails = result.hits.hits.map((hit: any) => ({
      id: hit._id,
      ...hit._source
    }));

    res.json(emails);
  } catch (err: any) {
    console.error('Error fetching emails:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync', async (req: Request, res: Response): Promise<any> => {
  try {
    const imapConfig = {
      user: process.env.IMAP_USER!,
      password: process.env.IMAP_PASSWORD!,
      host: process.env.IMAP_HOST!,
      port: parseInt(process.env.IMAP_PORT || '993'),
      tls: process.env.IMAP_TLS === 'true',
      tlsOptions: { rejectUnauthorized: false },
      accountId: 'account1'
    };

    startImapService(imapConfig);
    res.json({ message: 'IMAP sync started' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suggest-reply', async (req: Request, res: Response): Promise<any> => {
  try {
    const { emailBody } = req.body;
    if (!emailBody) {
      return res.status(400).json({ error: 'emailBody is required' });
    }

    const reply = await queryRAG(emailBody);
    res.json({ reply });
  } catch (err: any) {
    console.error('Error generating reply:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve React app for all other routes (must be last)
app.use((req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start IMAP sync for account 1
  if (process.env.IMAP_USER && process.env.IMAP_PASSWORD) {
    startImapService({
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASSWORD,
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      tls: process.env.IMAP_TLS !== 'false',
      tlsOptions: { rejectUnauthorized: false },
      accountId: 'account1'
    });
  }

  // Start IMAP sync for account 2 if configured
  if (process.env.IMAP_USER_2 && process.env.IMAP_PASSWORD_2) {
    startImapService({
      user: process.env.IMAP_USER_2,
      password: process.env.IMAP_PASSWORD_2,
      host: process.env.IMAP_HOST_2 || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT_2 || '993'),
      tls: process.env.IMAP_TLS_2 !== 'false',
      tlsOptions: { rejectUnauthorized: false },
      accountId: 'account2'
    });
  }
});

export function broadcastToAll(data: any) {
  wss.clients.forEach((client: any) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}
