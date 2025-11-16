import { OpenAI } from 'openai';
import { ChromaClient } from 'chromadb-client';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';

let openai: OpenAI | null = null;
let chromaClient: ChromaClient | null = null;

// Initialize OpenAI if API key is available
if (OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
} else {
  console.warn('Warning: OPENAI_API_KEY not set. RAG functionality will be limited.');
}

// Initialize ChromaDB client
try {
  chromaClient = new ChromaClient({
    path: CHROMA_URL
  });
} catch (error: any) {
  console.error('Error initializing ChromaDB client:', error.message);
}

export async function storeEmailInVectorDB(emailId: string, emailBody: string) {
  if (!chromaClient) {
    console.warn('ChromaDB client not initialized');
    return;
  }

  try {
    const collection = await chromaClient.getOrCreateCollection({
      name: 'emails'
    });

    await collection.add({
      ids: [emailId],
      documents: [emailBody],
      metadatas: [{ timestamp: new Date().toISOString() }]
    });

    console.log(`Email ${emailId} stored in vector database`);
  } catch (error: any) {
    console.error('Error storing email in vector DB:', error.message);
  }
}

export async function queryRAG(emailBody: string): Promise<string> {
  if (!chromaClient || !openai) {
    return 'RAG service not fully configured. Please set OPENAI_API_KEY and ensure ChromaDB is running.';
  }

  try {
    // Get relevant context from ChromaDB
    const collection = await chromaClient.getCollection({ name: 'emails' });
    
    const results = await collection.query({
      queryTexts: [emailBody],
      nResults: 3
    });

    let context = '';
    if (results && results.documents && results.documents.length > 0) {
      context = results.documents[0].join('\n\n');
    }

    // Generate reply using OpenAI
    const prompt = `
You are a helpful email assistant. Based on the following email and relevant context from previous conversations, generate a professional and contextual reply.

Email to reply to:
${emailBody}

${context ? `Relevant context from previous emails:\n${context}` : ''}

Generate a professional reply:
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a professional email assistant that generates helpful, contextual replies.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    const reply = completion.choices[0]?.message?.content || 'Unable to generate reply';
    return reply;
  } catch (error: any) {
    console.error('Error in RAG query:', error.message);
    return 'Error generating reply. Please try again.';
  }
}
