'use client';

import { useState, useRef, useEffect } from 'react';

const SUGGESTED = [
  "What positions are being reduced in the FY27 superintendent's recommended budget?",
  "What was the RSU5 budget total in 2020?",
  "What is the graduation requirement at Freeport High School?",
  "What did the board vote on at the March 2026 meeting?",
  "What did the board discuss about the FY27 budget at the November 2025 meeting?",
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantId = (Date.now() + 1).toString();

      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        assistantContent += chunk;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    }
    setIsLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#8B1A1A] text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-wide">Community Assistant</h1>
              <p className="text-sm text-red-200">REGIONAL SCHOOL UNIT 5</p>
            </div>
            <div className="text-right text-xs text-red-200">
              <div>FREEPORT · DURHAM · POWNAL</div>
              <div>MAINE</div>
            </div>
          </div>
          <p className="text-sm text-red-100 mt-2">
            RSU5 document library · Board meetings, budgets, policies and more
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
            <p className="font-semibold text-gray-800 mb-1">RSU5 Community Information Assistant</p>
            <p className="text-sm text-gray-600 mb-4">
              Ask me anything about RSU5 board meetings, budgets, policies, school calendars,
              or district decisions. I search official RSU5 documents and cite my sources.
            </p>
            <p className="text-xs text-gray-400 italic mb-4">
              Neutral and factual — this tool does not take positions on policy debates.
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm text-[#8B1A1A] bg-red-50 hover:bg-red-100 border border-red-200 rounded px-3 py-2 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm shadow-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-[#8B1A1A] text-white' : 'bg-white border border-gray-200 text-gray-800'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400 shadow-sm">
                Searching RSU5 documents…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask a question about RSU5..."
              disabled={isLoading}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A] focus:border-transparent"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              className="bg-[#8B1A1A] hover:bg-[#7a1717] disabled:bg-gray-300 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              ▶
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1 text-center">
            RSU5 Community Assistant · Powered by Claude AI · Not an official district resource
          </p>
        </div>
      </div>
    </div>
  );
}
