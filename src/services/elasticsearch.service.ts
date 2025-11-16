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

export const esClient = new Client({
  node: esHost,
  auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD 
    ? {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD
      }
    : undefined
});

export async function initializeIndex() {
  const indexName = 'emails';
  
  try {
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
      console.log(`Index ${indexName} created successfully`);
    } else {
      console.log(`Index ${indexName} already exists`);
    }
  } catch (error: any) {
    console.error('Error initializing index:', error.message);
    throw error;
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
    console.log(`Email indexed: ${email.subject}`);
  } catch (error: any) {
    console.error('Error indexing email:', error.message);
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
    console.log(`Email ${id} updated with category: ${category}`);
  } catch (error: any) {
    console.error('Error updating email category:', error.message);
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
    console.error('Error searching emails:', error.message);
    throw error;
  }
}

// Initialize index on module load
initializeIndex().catch(console.error);
