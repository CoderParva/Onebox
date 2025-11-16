import Groq from 'groq-sdk';
import type { EmailDocument } from './elasticsearch.service.js';
import { esClient, updateEmailCategory } from './elasticsearch.service.js';
import { sendNotification } from './notification.service.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

let groq: Groq | null = null;

if (GROQ_API_KEY) {
  groq = new Groq({
    apiKey: GROQ_API_KEY,
  });
} else {
  console.warn('Warning: GROQ_API_KEY not set. Email categorization will be limited.');
}

const CATEGORIES = {
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not Interested',
  MEETING_BOOKED: 'Meeting Booked',
  MEETING_COMPLETED: 'Meeting Completed',
  SPAM: 'Spam',
  CLOSED: 'Closed'
};

export async function categorizeEmail(email: EmailDocument): Promise<string> {
  if (!groq) {
    console.log('Groq not configured, skipping categorization');
    return CATEGORIES.NOT_INTERESTED;
  }

  try {
    const prompt = `
You are an AI email categorization assistant. Analyze the following email and categorize it into ONE of these categories:
- Interested: The sender shows interest in a product/service/meeting
- Not Interested: The sender explicitly declines or shows no interest
- Meeting Booked: A meeting has been scheduled
- Meeting Completed: A meeting has been completed
- Spam: Promotional, unsolicited, or irrelevant content
- Closed: The conversation or deal is closed

Email Details:
From: ${email.from.name} <${email.from.address}>
Subject: ${email.subject}
Body: ${email.body.substring(0, 1000)}

Respond with ONLY the category name, nothing else.
`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // Updated model
      messages: [
        {
          role: 'system',
          content: 'You are a professional email categorization assistant. Respond with only the category name.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 50,
      temperature: 0.3
    });

    let category = response.choices[0]?.message?.content?.trim() || 'Not Interested';
    
    // Normalize category
    const categoryUpper = category.toUpperCase().replace(/[^A-Z\s]/g, '');
    
    if (categoryUpper.includes('INTERESTED') && !categoryUpper.includes('NOT')) {
      category = CATEGORIES.INTERESTED;
    } else if (categoryUpper.includes('NOT') && categoryUpper.includes('INTERESTED')) {
      category = CATEGORIES.NOT_INTERESTED;
    } else if (categoryUpper.includes('MEETING') && categoryUpper.includes('BOOKED')) {
      category = CATEGORIES.MEETING_BOOKED;
    } else if (categoryUpper.includes('MEETING') && categoryUpper.includes('COMPLETED')) {
      category = CATEGORIES.MEETING_COMPLETED;
    } else if (categoryUpper.includes('SPAM')) {
      category = CATEGORIES.SPAM;
    } else if (categoryUpper.includes('CLOSED')) {
      category = CATEGORIES.CLOSED;
    } else {
      category = CATEGORIES.NOT_INTERESTED;
    }

    console.log(`Email categorized as: ${category}`);
    
    // Update category in Elasticsearch
    await updateEmailCategory(email.messageId, category);
    
    // Send notification if interested
    if (category === CATEGORIES.INTERESTED) {
      await sendNotification(email, category);
    }
    
    return category;
  } catch (error: any) {
    console.error('Error categorizing email:', error.message);
    return CATEGORIES.NOT_INTERESTED;
  }
}

export { CATEGORIES };
