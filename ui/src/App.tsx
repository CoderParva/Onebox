import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import './App.css';

interface Email {
  messageId: string;
  from: { name: string; address: string };
  subject: string;
  body: string;
  receivedAt: string;
  category?: string;
  folder: string;
}

const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api',
});

function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('INBOX');

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);

  const accountId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('accountId');
  }, []);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/emails', {
        params: {
          accountId: accountId || undefined, 
          folder: selectedFolder,
          search: searchQuery
        }
      });
      setEmails(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch emails.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedFolder, accountId]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await apiClient.post('/api/sync', { 
        accountId: accountId || process.env.IMAP_USER!
      }); 
      toast.success('Sync triggered!'); 
      setTimeout(() => {
        fetchEmails();
        setIsSyncing(false);
      }, 2000); 
    } catch (err) {
      console.error('Failed to sync', err);
      toast.error('Sync failed.');
      setIsSyncing(false);
    }
  };

  // --- WebSocket Connection ---
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000');
    ws.onopen = () => console.log('WebSocket connected');
    ws.onclose = () => console.log('WebSocket disconnected');
    ws.onerror = (err) => console.error('WebSocket error:', err);

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'NEW_MAIL') {
          const newEmail = message.email as Email;
          console.log('Received NEW_MAIL trigger!', newEmail.subject);

          const currentAccountId = accountId || process.env.IMAP_USER!;
          if (newEmail.accountId === currentAccountId && newEmail.folder === selectedFolder) {
            setEmails(currentEmails => [newEmail, ...currentEmails]);
          }

          // --- MODIFIED TOAST CALL ---
          toast.success(
            (t) => (
              <div 
                onClick={() => {
                  if (newEmail.folder === selectedFolder) {
                    setSelectedEmail(newEmail);
                  }
                  toast.dismiss(t.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <b>New Mail: {newEmail.from.name || newEmail.from.address}</b><br />
                {newEmail.subject}
              </div>
            ), 
            { 
                icon: '📧',
                className: 'new-mail-toast', // <-- ADDED CUSTOM CLASS
                duration: 6000 // <-- INCREASED DURATION
            }
          );
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message', e);
      }
    };
    
    return () => ws.close();
  }, [accountId, selectedFolder]);

  // Re-fetch when filters change (debounced)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchEmails();
    }, 500); 
    return () => clearTimeout(delayDebounceFn);
  }, [fetchEmails]); 

  const handleSuggestReply = async (emailBody: string) => {
    try {
      setIsSuggesting(true);
      setSuggestion('');
      const response = await apiClient.post('/suggest-reply', { emailBody });
      setSuggestion(response.data.reply);
    } catch (err) {
      console.error(err);
      setSuggestion('Error generating reply.');
    } finally {
      setIsSuggesting(false);
    }
  };
  
  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'Interested': return '#2ecc71';
      case 'Meeting Booked': return '#3498db';
      case 'Not Interested': return '#e74c3c';
      case 'Spam': return '#95a5a6';
      default: return '#f39c12';
    }
  };

  return (
    <div className="app-container">
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#333',
            color: '#fff',
          }
        }}
      />
      
      <header>
        <h1>Onebox</h1>
        <div className="controls">
          <button onClick={handleSync} disabled={isSyncing} className="sync-button">
            {isSyncing ? 'Syncing...' : 'Reload'}
          </button>
          <select 
            value={selectedFolder} 
            onChange={(e) => setSelectedFolder(e.target.value)}
            className="folder-select"
          >
            <option value="INBOX">Inbox</option>
            <option value="Sent">Sent</option>
            <option value="Spam">Spam</option>
          </select>
          <input 
            type="text" 
            placeholder="Search emails..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </header>
      
      <div className="main-content">
        <div className="email-list">
          {loading ? (
            <div className="status-message">Loading...</div>
          ) : emails.length === 0 ? (
            <div className="status-message">No emails found.</div>
          ) : (
            emails.map((email) => (
              <div 
                key={email.messageId} 
                className={`email-item ${selectedEmail?.messageId === email.messageId ? 'selected' : ''}`}
                onClick={() => { setSelectedEmail(email); setSuggestion(''); }}
              >
                <div className="email-header">
                  <span className="email-from">{email.from.name || email.from.address}</span>
                  {email.category && (
                    <span className="email-category" style={{ backgroundColor: getCategoryColor(email.category) }}>
                      {email.category}
                    </span>
                  )}
                </div>
                <div className="email-subject">{email.subject}</div>
                <div className="email-body-snippet">{email.body.substring(0, 100)}...</div>
              </div>
            ))
          )}
        </div>
        <div className="email-detail">
          {!selectedEmail ? (
            <div className="status-message">Select an email</div>
          ) : (
            <div className="detail-content">
              <div className="detail-header">
                <h3>{selectedEmail.subject}</h3>
                <span>From: {selectedEmail.from.address}</span>
              </div>
              <div className="detail-body">{selectedEmail.body}</div>
              <div className="detail-actions">
                <button onClick={() => handleSuggestReply(selectedEmail.body)} disabled={isSuggesting}>
                  {isSuggesting ? 'Thinking...' : '🤖 Suggest Reply'}
                </button>
              </div>
              {suggestion && (
                <div className="suggestion-box">
                  <textarea readOnly value={suggestion} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;