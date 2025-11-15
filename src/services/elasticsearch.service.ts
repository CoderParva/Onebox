import { Client } from '@elastic/elasticsearch';

// This is the interface for our email document
export interface EmailDocument {
  accountId: string; // e.g., 'your-email@gmail.com'
  messageId: string;
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  subject: string;
  body: string; // We'll store the plain-text body
  receivedAt: Date;
  folder: string;
  category?: string; // Make category optional
}

// Helper function to wait for a few seconds
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ElasticsearchService {
  private client: Client;
  private indexName = 'emails';

  constructor() {
    this.client = new Client({ node: 'http://localhost:9200' });
  }

  // Connect and create the index, with retries
  public async setup() {
    console.log('[Elastic] Attempting to connect...');
    let retries = 5;
    while (retries > 0) {
      try {
        // Ping the cluster to see if it's alive
        await this.client.ping();
        console.log('[Elastic] Connection successful.');
        
        // If connection is good, check for the index
        await this.checkAndCreateIndex();
        return; // Success, exit the function
      } catch (err) {
        console.log(`[Elastic] Connection failed. Retrying in 5 seconds... (${retries} retries left)`);
        retries--;
        await sleep(5000); // Wait 5 seconds
      }
    }
    console.error('[Elastic] Could not connect to Elasticsearch after 5 attempts.');
  }

  // Check if index exists, create if not
  private async checkAndCreateIndex() {
    console.log('[Elastic] Checking for index...');
    try {
      const indexExists = await this.client.indices.exists({
        index: this.indexName,
      });

      if (!indexExists) {
        console.log(`[Elastic] Index '${this.indexName}' not found. Creating...`);
        await this.createIndex();
      } else {
        console.log(`[Elastic] Index '${this.indexName}' already exists.`);
      }
    } catch (err) {
      console.error('[Elastic] Error checking/creating index:', err);
    }
  }

  // Define the structure (mapping) for our email documents
  private async createIndex() {
    try {
      await this.client.indices.create({
        index: this.indexName,
        body: {
          mappings: {
            properties: {
              accountId: { type: 'keyword' },
              messageId: { type: 'keyword' },
              from: {
                properties: {
                  name: { type: 'text' },
                  address: { type: 'keyword' },
                },
              },
              to: {
                properties: {
                  name: { type: 'text' },
                  address: { type: 'keyword' },
                },
              },
              subject: { type: 'text' },
              body: { type: 'text' }, // This field will be searchable
              receivedAt: { type: 'date' },
              folder: { type: 'keyword' },
              category: { type: 'keyword' }, // For Feature 3
            },
          },
        },
      });
      console.log(`[Elastic] Index '${this.indexName}' created successfully.`);
    } catch (err) {
      console.error('[Elastic] Error creating index:', err);
    }
  }

  // Add a single email to the index
  public async indexEmail(email: EmailDocument) {
    try {
      await this.client.index({
        index: this.indexName,
        // Use the messageId as the document ID to prevent duplicates
        id: email.messageId, 
        body: email,
      });
      console.log(`[Elastic] Indexed email: ${email.subject}`);
    } catch (err) {
      console.error(`[Elastic] Error indexing email ${email.messageId}:`, err);
    }
  }

  // --- THIS IS THE NEW FUNCTION ---
  public async updateEmailCategory(messageId: string, category: string) {
    try {
      await this.client.update({
        index: this.indexName,
        id: messageId,
        body: {
          doc: {
            category: category,
          },
        },
      });
      console.log(`[Elastic] Updated category for ${messageId} to ${category}`);
    } catch (err) {
      console.error(`[Elastic] Error updating category for ${messageId}:`, err);
    }
  }
  
  public async searchEmails(
    accountId: string,
    folder: string,
    searchQuery: string
  ) {
    try {
      console.log(`[Elastic] Searching for: ${searchQuery} in ${folder}`);
      
      const mustClauses: any[] = [
        // --- MANDATORY CHANGE HERE ---
        { term: { 'accountId': accountId } }, // Removed .keyword
        { term: { 'folder': folder } },       // Removed .keyword
        // --- END OF CHANGE ---
      ];

      if (searchQuery) {
        mustClauses.push({
          multi_match: {
            query: searchQuery,
            fields: ['subject', 'body', 'from.name', 'from.address'],
          },
        });
      }

      const response = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            bool: {
              must: mustClauses,
            },
          },
          sort: [
            { receivedAt: { order: 'desc' } } // Sort by newest first
          ],
          size: 50, // Return top 50 hits
        },
      });

      // Return the array of email documents
      return response.hits.hits.map(hit => hit._source as EmailDocument);

    } catch (err) {
      console.error('[Elastic] Error searching emails:', err);
      return [];
    }
  }
}

export const elasticsearchService = new ElasticsearchService();