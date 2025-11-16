import { Client } from '@elastic/elasticsearch';

export interface EmailDocument {
  accountId: string;
  messageId: string;
  from: {
    name: string;
    address: string;
  };
  to: Array<{
    name: string;
    address: string;
  }>;
  subject: string;
  body: string;
  receivedAt: string;
  category?: string;
}

const esHost = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

console.log('Elasticsearch URL configured:', esHost ? 'Yes' : 'No');

// Parse URL to handle different formats
let clientConfig: any = {
  node: esHost,
  tls: {
    rejectUnauthorized: false
  },
  requestTimeout: 30000
};

// If URL contains @ (embedded auth), the client will handle it automatically
// If separate credentials, add them
if (!esHost.includes('@') && process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
  clientConfig.auth = {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  };
}

export const esClient = new Client(clientConfig);

export async function initializeIndex() {
  const indexName = 'emails';
  
  try {
    // Try to ping with more forgiving settings
    console.log('Attempting to connect to Elasticsearch...');
    
    const pingResult = await esClient.info();
    const version = (pingResult.version as any);
    console.log('✅ Connected to Elasticsearch version:', version?.number || 'unknown');
    
    const exists = await esClient.indices.exists({ index: indexName });
    
    if (!exists) {
      console.log(`Creating index: ${indexName}`);
      await esClient.indices.create({
        index: indexName,
        mappings: {
          properties: {
            accountId: { type: 'keyword' },
            messageId: { type: 'keyword' },
            from: {
              properties: {
                name: { type: 'text' },
                address: { type: 'keyword' }
              }
            },
            to: {
              properties: {
                name: { type: 'text' },
                address: { type: 'keyword' }
              }
            },
            subject: { type: 'text' },
            body: { type: 'text' },
            receivedAt: { type: 'date' },
            category: { type: 'keyword' }
          }
        }
      });
      console.log(`✅ Index ${indexName} created successfully`);
    } else {
      console.log(`✅ Index ${indexName} already exists`);
    }
  } catch (error: any) {
    console.error('❌ Error initializing Elasticsearch:', error.message);
    console.warn('⚠️  Elasticsearch is not available. Email storage will not work.');
    console.warn('💡 Troubleshooting:');
    console.warn('   1. Check if ELASTICSEARCH_URL is set correctly');
    console.warn('   2. Verify credentials in the URL');
    console.warn('   3. Check if the service is running (Bonsai/SearchBox dashboard)');
    console.warn('   4. Try using SearchBox.io or Elastic Cloud instead');
    // Don't throw error - allow app to start without Elasticsearch
  }
}

export async function indexEmail(email: EmailDocument) {
  const indexName = 'emails';
  
  try {
    await esClient.index({
      index: indexName,
      id: email.messageId,
      document: email
    });
    console.log(`✅ Email indexed: ${email.subject}`);
  } catch (error: any) {
    console.error('❌ Error indexing email:', error.message);
    throw error;
  }
}

export async function updateEmailCategory(id: string, category: string) {
  const indexName = 'emails';
  
  try {
    await esClient.update({
      index: indexName,
      id: id,
      doc: {
        category: category
      }
    });
    console.log(`✅ Email ${id} updated with category: ${category}`);
  } catch (error: any) {
    console.error('❌ Error updating email category:', error.message);
    throw error;
  }
}

export async function searchEmails(
  query: any,
  sort: any[] = [{ receivedAt: { order: 'desc' } }],
  size: number = 100
) {
  const indexName = 'emails';
  
  try {
    const result = await esClient.search({
      index: indexName,
      query: query,
      sort: sort,
      size: size
    });
    
    return result.hits.hits.map((hit: any) => ({
      id: hit._id,
      ...hit._source
    }));
  } catch (error: any) {
    console.error('❌ Error searching emails:', error.message);
    throw error;
  }
}

// Initialize index on module load
initializeIndex().catch(console.error);
