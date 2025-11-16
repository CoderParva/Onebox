import { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

interface Email {
  id: string;
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

function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('INBOX');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestedReply, setSuggestedReply] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchEmails();
    connectWebSocket();
  }, [searchQuery, selectedFolder]);

  const connectWebSocket = () => {
    const wsUrl = API_URL.replace('http', 'ws');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'new_email') {
        toast.success(`New email from ${data.email.from.name}`);
        setEmails((prev) => [data.email, ...prev]);
      } else if (data.type === 'email_categorized') {
        toast.info(`Email categorized as: ${data.category}`);
        setEmails((prev) =>
          prev.map((email) =>
            email.messageId === data.messageId
              ? { ...email, category: data.category }
              : email
          )
        );
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setTimeout(connectWebSocket, 5000);
    };

    return () => ws.close();
  };

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedFolder) params.append('folder', selectedFolder);

      const response = await fetch(`${API_URL}/api/emails?${params}`);
      const data = await response.json();
      setEmails(data);
    } catch (error) {
      console.error('Error fetching emails:', error);
      toast.error('Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      await fetch(`${API_URL}/api/sync`, { method: 'POST' });
      toast.success('Sync started');
      setTimeout(fetchEmails, 2000);
    } catch (error) {
      console.error('Error syncing:', error);
      toast.error('Failed to sync');
    }
  };

  const handleSuggestReply = async (emailBody: string) => {
    setLoading(true);
    setSuggestedReply('');
    try {
      const response = await fetch(`${API_URL}/api/suggest-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailBody })
      });
      const data = await response.json();
      setSuggestedReply(data.reply);
      toast.success('Reply generated!');
    } catch (error) {
      console.error('Error generating reply:', error);
      toast.error('Failed to generate reply');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'Interested':
        return 'bg-green-100 text-green-800';
      case 'Not Interested':
        return 'bg-red-100 text-red-800';
      case 'Meeting Booked':
        return 'bg-blue-100 text-blue-800';
      case 'Meeting Completed':
        return 'bg-purple-100 text-purple-800';
      case 'Spam':
        return 'bg-gray-100 text-gray-800';
      case 'Closed':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">📧 OneBox</h1>
            <button
              onClick={handleSync}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              🔄 Sync Now
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Search Bar */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Folder Filter */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSelectedFolder('INBOX')}
            className={`px-4 py-2 rounded-lg ${
              selectedFolder === 'INBOX'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📥 Inbox
          </button>
          <button
            onClick={() => setSelectedFolder('SENT')}
            className={`px-4 py-2 rounded-lg ${
              selectedFolder === 'SENT'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📤 Sent
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold">
                Emails ({emails.length})
              </h2>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : emails.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No emails found</div>
              ) : (
                emails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedEmail?.id === email.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-gray-900">
                        {email.from.name || email.from.address}
                      </div>
                      {email.category && (
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${getCategoryColor(
                            email.category
                          )}`}
                        >
                          {email.category}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      {email.subject}
                    </div>
                    <div className="text-sm text-gray-500 truncate">
                      {email.body.substring(0, 100)}...
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Email Details */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold">Email Details</h2>
            </div>
            {selectedEmail ? (
              <div className="p-4">
                <div className="mb-4">
                  <div className="text-sm text-gray-500 mb-1">From:</div>
                  <div className="font-medium">
                    {selectedEmail.from.name} &lt;{selectedEmail.from.address}&gt;
                  </div>
                </div>
                <div className="mb-4">
                  <div className="text-sm text-gray-500 mb-1">Subject:</div>
                  <div className="font-medium">{selectedEmail.subject}</div>
                </div>
                <div className="mb-4">
                  <div className="text-sm text-gray-500 mb-1">Category:</div>
                  {selectedEmail.category ? (
                    <span
                      className={`px-2 py-1 text-sm rounded-full ${getCategoryColor(
                        selectedEmail.category
                      )}`}
                    >
                      {selectedEmail.category}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not categorized yet</span>
                  )}
                </div>
                <div className="mb-4">
                  <div className="text-sm text-gray-500 mb-1">Body:</div>
                  <div className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">
                    {selectedEmail.body}
                  </div>
                </div>

                {/* Suggested Reply Section */}
                <div className="border-t pt-4">
                  <button
                    onClick={() => handleSuggestReply(selectedEmail.body)}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {loading ? '🤖 Generating...' : '🤖 Suggest Reply (RAG)'}
                  </button>
                  
                  {suggestedReply && (
                    <div className="mt-4">
                      <div className="text-sm text-gray-500 mb-2">
                        Suggested Reply:
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg text-sm whitespace-pre-wrap">
                        {suggestedReply}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                Select an email to view details
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
