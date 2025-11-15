import { Ollama } from 'ollama';
import { EmailDocument, elasticsearchService } from './elasticsearch.service';
import { notificationService } from './notification.service';

const CATEGORIES = [
  'Interested',
  'Not Interested',
  'Meeting Booked',
  'Spam',
  'Out of Office',
].join(', ');

const SYSTEM_PROMPT = `You are an email categorization expert. Your ONLY job is to classify an email into one of the following categories: ${CATEGORIES}.
Respond with ONLY the single category name and nothing else. Do not add any explanation or punctuation.`;

class CategorizationService {
  private ollama: Ollama;
  private emailQueue: EmailDocument[] = []; // <-- NEW: The queue
  private isProcessing = false;             // <-- NEW: The processing flag

  constructor() {
    this.ollama = new Ollama({
      host: 'http://localhost:11434',
    });
  }

  // --- UPDATED ---
  // This function is now very fast. It just adds to the queue.
  public categorizeEmail(email: EmailDocument) {
    this.emailQueue.push(email);
    this.processQueue(); // Start the worker if it's not already running
  }

  // --- NEW FUNCTION: The Queue Worker ---
  private async processQueue() {
    // If the worker is already busy, or the queue is empty, do nothing.
    if (this.isProcessing || this.emailQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const email = this.emailQueue.shift(); // Get the next email from the queue

    if (!email) {
      this.isProcessing = false;
      return;
    }

    try {
      // Log the queue length
      console.log(`[AI/Ollama] Categorizing (Queue: ${this.emailQueue.length}): ${email.subject}`);
      
      const response = await this.ollama.chat({
        model: 'llama3:8b', // Use the local model
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Subject: ${email.subject}\n\nBody: ${email.body.substring(0, 2000)}` },
        ],
        options: {
            temperature: 0, // Deterministic
        },
      });

      const category = response.message.content.trim();

      if (!category) {
        throw new Error('No category returned from AI.');
      }

      console.log(`[AI/Ollama] Email categorized as: ${category}`);

      // 1. Save the category back to Elasticsearch
      await elasticsearchService.updateEmailCategory(email.messageId, category);

      // 2. Trigger notifications if "Interested"
      if (category === 'Interested') {
        await notificationService.sendInterestAlert(email);
      }
    } catch (err) {
      console.error(`[AI/Ollama] Error categorizing email ${email.messageId}:`, err);
    } finally {
      // --- IMPORTANT ---
      // Worker is done, allow it to process the next item.
      this.isProcessing = false;
      // Check for more items in the queue immediately.
      this.processQueue();
    }
  }
}

export const categorizationService = new CategorizationService();