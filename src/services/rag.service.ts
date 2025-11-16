import Groq from 'groq-sdk';
import { ChromaClient } from 'chromadb-client';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';

let groq: Groq | null = null;
let chromaClient: ChromaClient | null = null;

// Initialize Groq if API key is available
if (GROQ_API_KEY) {
  groq = new Groq({
    apiKey: GROQ_API_KEY,
  });
} else {
  console.warn('Warning: GROQ_API_KEY not set. RAG functionality will be limited.');
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
  if (!groq) {
    return 'RAG service not fully configured. Please set GROQ_API_KEY.';
  }

  try {
    // For now, generate reply without vector context
    // You can add ChromaDB integration later if needed
    const prompt = `
You are a helpful email assistant. Generate a professional and contextual reply to the following email.

Email to reply to:
${emailBody}

Generate a professional reply:
`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
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

    const reply = response.choices[0]?.message?.content || 'Unable to generate reply';
    return reply;
  } catch (error: any) {
    console.error('Error in RAG query:', error.message);
    return 'Error generating reply. Please try again.';
  }
}
