import { ChromaClient } from 'chromadb-client';
import { Ollama } from 'ollama';

// This is the "Knowledge Base" about you or your company
const MY_CONTEXT_DATA = [
  "My name is Praveen and I am a Full Stack Developer.",
  "I am building a Reachinbox alternative called Onebox.",
  "If someone asks for a meeting, I am available Mon-Fri from 10 AM to 4 PM IST.",
  "If the email is a job offer, politely ask for the JD and compensation details.",
  "My tech stack includes Node.js, TypeScript, React, and Python.",
  "If the lead is Interested, share this booking link: https://cal.com/praveen/30min"
];

class RagService {
  private chroma: ChromaClient;
  private ollama: Ollama;
  private collectionName = 'onebox_context';

  constructor() {
    this.chroma = new ChromaClient({ path: 'http://localhost:8000' });
    this.ollama = new Ollama({ host: 'http://localhost:11434' });
  }

  // 1. Initialize: Add our "Knowledge Base" to ChromaDB
  public async setup() {
    try {
      // Delete old collection to start fresh (optional, good for dev)
      try { await this.chroma.deleteCollection({ name: this.collectionName }); } catch (e) {}

      const collection = await this.chroma.getOrCreateCollection({
        name: this.collectionName,
      });

      console.log('[RAG] Embedding and storing context data...');

      // Embed each sentence using Ollama
      for (let i = 0; i < MY_CONTEXT_DATA.length; i++) {
        const text = MY_CONTEXT_DATA[i];
        
        // Generate embedding
        const embeddingResponse = await this.ollama.embeddings({
          model: 'nomic-embed-text', // The model you just pulled
          prompt: text,
        });

        // Add to Chroma
        await collection.add({
          ids: [`doc-${i}`],
          embeddings: [embeddingResponse.embedding],
          metadatas: [{ source: 'static_context' }],
          documents: [text],
        });
      }
      console.log('[RAG] Knowledge base ready.');
    } catch (err) {
      console.error('[RAG] Setup error:', err);
    }
  }

  // 2. Generate a Reply
  public async generateReply(emailId: string): Promise<string> {
    // A. Fetch the email from Elasticsearch (we need the body)
    // Note: In a real app, we'd query Elastic by ID. 
    // For now, let's assume we pass the body text directly for simplicity, 
    // OR we can fetch it. Let's fetch it.
    // (Skipping direct fetch for simplicity, we'll pass body in the next step)
    return "Error: Body required"; 
  }

  // Updated to take the email body directly
  public async generateReplyForText(emailBody: string): Promise<string> {
    try {
      const collection = await this.chroma.getCollection({ name: this.collectionName });

      // B. Embed the incoming email body to find relevant context
      const embeddingResponse = await this.ollama.embeddings({
        model: 'nomic-embed-text',
        prompt: emailBody,
      });

      // C. Search Chroma for the most relevant "Knowledge"
      const results = await collection.query({
        queryEmbeddings: [embeddingResponse.embedding],
        nResults: 2, // Get top 2 relevant facts
      });

      const context = results.documents[0].join('\n');
      console.log(`[RAG] Found relevant context: ${context}`);

      // D. Generate the Reply using Llama3
      const prompt = `
        You are a helpful AI assistant for Praveen.
        
        Here is some context about Praveen:
        "${context}"

        Here is an email I received:
        "${emailBody}"

        Draft a professional, short reply to this email using the context provided.
        Do not include placeholders like "[Your Name]". Sign it as "Praveen".
      `;

      const response = await this.ollama.chat({
        model: 'llama3:8b',
        messages: [{ role: 'user', content: prompt }],
      });

      return response.message.content;

    } catch (err) {
      console.error('[RAG] Error generating reply:', err);
      return "Failed to generate reply.";
    }
  }
}

export const ragService = new RagService();