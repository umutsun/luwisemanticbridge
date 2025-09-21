# 🎯 ASB Project Integration Plan

## ✅ Backend Status (Gemini - COMPLETED)

### Implemented Features:
- ✅ RAG System with pgvector
- ✅ Hybrid Search (keyword + semantic)
- ✅ Knowledge Graph Integration
- ✅ Quality Control Mechanisms
- ✅ WebSocket Real-time Support
- ✅ OpenAI Integration
- ✅ Redis Caching Layer
- ✅ Document Processing Pipeline

## 🔄 Frontend Status (Claude - IN PROGRESS)

### Next Steps for Frontend:

```bash
# 1. Create frontend if not exists
cd C:\xampp\htdocs\alice-semantic-bridge
mkdir -p frontend
cd frontend

# 2. Quick Next.js setup
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --yes

# 3. Install UI dependencies
npm install @radix-ui/react-dialog @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react

# 4. Install chat dependencies
npm install react-markdown remark-gfm react-syntax-highlighter @types/react-syntax-highlighter
npm install zustand @tanstack/react-query axios socket.io-client
npm install react-hook-form @hookform/resolvers zod
```

## 🚀 Integration Checklist

### 1. Environment Setup (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

### 2. API Client Configuration
```typescript
// frontend/src/lib/api/client.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### 3. RAG Chat Component
```typescript
// frontend/src/components/chat/rag-chat.tsx
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';

export function RAGChat() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState<any[]>([]);

  const sendMessage = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiClient.post('/api/v2/chat', {
        message: text,
        conversationId: 'demo-001'
      });
      return response.data;
    },
    onSuccess: (data) => {
      setConversation(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: data.response, sources: data.sources }
      ]);
      setMessage('');
    }
  });

  return (
    <Card className="w-full max-w-4xl mx-auto h-[600px] flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversation.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${
              msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
              {msg.sources && (
                <div className="mt-2 pt-2 border-t text-sm">
                  <p className="font-semibold">Kaynaklar:</p>
                  {msg.sources.map((source: any, i: number) => (
                    <div key={i}>{source.title}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage.mutate(message); }}>
          <div className="flex gap-2">
            <Textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hukuki sorunuzu yazın..."
              className="flex-1"
            />
            <Button type="submit" disabled={sendMessage.isPending}>
              Gönder
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
```

### 4. Knowledge Graph Visualization
```typescript
// frontend/src/components/graph/knowledge-graph.tsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export function KnowledgeGraph({ data }: { data: any }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    // D3.js knowledge graph implementation
    const svg = d3.select(svgRef.current);
    // ... graph rendering logic
  }, [data]);

  return (
    <div className="w-full h-[500px]">
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  );
}
```

### 5. Hybrid Search Interface
```typescript
// frontend/src/components/search/hybrid-search.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export function HybridSearch() {
  const [query, setQuery] = useState('');
  const [useSemanticSearch, setUseSemanticSearch] = useState(true);

  const searchResults = useQuery({
    queryKey: ['search', query, useSemanticSearch],
    queryFn: async () => {
      if (!query) return [];
      const endpoint = useSemanticSearch ? '/api/v2/search/hybrid' : '/api/v2/search';
      const response = await apiClient.post(endpoint, { query });
      return response.data;
    },
    enabled: query.length > 2
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Arama yapın..."
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <Switch
            checked={useSemanticSearch}
            onCheckedChange={setUseSemanticSearch}
          />
          <label>Semantik Arama</label>
        </div>
      </div>
      
      {searchResults.data && (
        <div className="space-y-2">
          {searchResults.data.map((result: any) => (
            <Card key={result.id} className="p-4">
              <h3 className="font-semibold">{result.title}</h3>
              <p className="text-sm text-gray-600">{result.excerpt}</p>
              <div className="mt-2 flex items-center gap-4 text-sm">
                <span>Benzerlik: {(result.similarity * 100).toFixed(1)}%</span>
                <span>Kaynak: {result.source}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 🔧 n8n Workflow Integration

### Create Workflow Template
```json
{
  "name": "ASB RAG Pipeline",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "asb-rag-query",
        "method": "POST"
      }
    },
    {
      "name": "PgvectorQuery",
      "type": "n8n-nodes-custom.PgvectorQuery",
      "parameters": {
        "query": "={{ $json.query }}",
        "limit": 5
      }
    },
    {
      "name": "OpenAI",
      "type": "n8n-nodes-base.openAi",
      "parameters": {
        "prompt": "Context: {{ $json.context }}\n\nQuestion: {{ $json.query }}"
      }
    }
  ]
}
```

## 📊 Dashboard Components

### System Status Dashboard
```typescript
// frontend/src/app/dashboard/page.tsx
export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard title="Total Documents" value="1,234" />
      <StatsCard title="Total Embeddings" value="45,678" />
      <StatsCard title="Active Users" value="89" />
      <StatsCard title="API Calls Today" value="5,432" />
    </div>
  );
}
```

## 🎯 Testing & Launch

### 1. Start Backend
```bash
cd backend
npm run dev
# Should see: 🚀 Gemini Backend running on port 8080
```

### 2. Start Frontend
```bash
cd frontend
npm run dev
# Should see: ▲ Next.js ready on http://localhost:3000
```

### 3. Test Integration
- Open: http://localhost:3000
- Test chat functionality
- Check WebSocket connection
- Verify search results

## 🚀 Demo Scenarios

1. **Legal Question Answering**
   - User asks: "ÖZELGE nedir?"
   - System provides answer with sources

2. **Hybrid Search Demo**
   - Search for "vergi" 
   - Show keyword vs semantic results

3. **Knowledge Graph**
   - Visualize legal document relationships
   - Show citation networks

4. **Real-time Features**
   - Multiple users chatting
   - Live typing indicators

## 📅 Launch Timeline

- **Today (Sept 3)**: Frontend setup + basic chat UI
- **Tomorrow (Sept 4)**: Full integration + testing
- **Sept 5**: Demo preparation + bug fixes
- **Sept 6-9**: Polish & optimization
- **Sept 10**: LAUNCH! 🎉
