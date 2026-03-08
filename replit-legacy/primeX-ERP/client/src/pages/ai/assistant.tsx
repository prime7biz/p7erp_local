import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, Send, Plus, MessageSquare, Loader2, Sparkles,
} from "lucide-react";

const quickSuggestions = [
  "Show today's production summary",
  "What is the current DHU?",
  "List open corrective actions",
  "Analyze inventory trends",
];

export default function AIAssistantPage() {
  const { toast } = useToast();
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads, isLoading: threadsLoading } = useQuery<any>({
    queryKey: ["/api/ai-assistant/threads"],
    select: (res: any) => res?.data ?? [],
  });

  const { data: threadData, isLoading: messagesLoading } = useQuery<any>({
    queryKey: ["/api/ai-assistant/threads", selectedThreadId],
    enabled: !!selectedThreadId,
    queryFn: () => fetch(`/api/ai-assistant/threads/${selectedThreadId}`, { credentials: "include" }).then(r => r.json()),
    select: (res: any) => res?.data ?? {},
  });

  const messages = threadData?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createThreadMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/ai-assistant/threads", { title: "New Chat" }),
    onSuccess: async (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/threads"] });
      const data = await res.json?.() ?? res;
      const newThread = data?.data ?? data;
      if (newThread?.id) {
        setSelectedThreadId(newThread.id);
      }
    },
    onError: () => toast({ title: "Failed to create thread", variant: "destructive" }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/ai-assistant/threads/${selectedThreadId}/messages`, {
        role: "user",
        content,
      });
      await apiRequest("POST", `/api/ai-assistant/threads/${selectedThreadId}/reply`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/threads", selectedThreadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/threads"] });
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const handleSend = () => {
    if (!inputText.trim() || !selectedThreadId) return;
    const text = inputText.trim();
    setInputText("");
    sendMessageMutation.mutate(text);
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (!selectedThreadId) return;
    setInputText("");
    sendMessageMutation.mutate(suggestion);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 h-[calc(100vh-8rem)]">
        <div className="mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" /> AI Assistant
          </h1>
          <p className="text-muted-foreground">Chat with your ERP AI assistant</p>
        </div>

        <div className="flex gap-4 h-[calc(100%-5rem)]">
          <Card className="w-72 shrink-0 flex flex-col">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Threads</CardTitle>
              <Button size="sm" variant="outline"
                disabled={createThreadMutation.isPending}
                onClick={() => createThreadMutation.mutate()}>
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              {threadsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !threads?.length ? (
                <div className="text-center py-8 text-muted-foreground text-sm px-4">
                  No threads yet. Click + to start a new chat.
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="space-y-1 p-2">
                    {threads.map((thread: any) => (
                      <button
                        key={thread.id}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedThreadId === thread.id
                            ? "bg-primary/10 border border-primary/20"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedThreadId(thread.id)}
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">
                            {thread.title || "Untitled"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {thread.created_at || thread.createdAt
                            ? new Date(thread.created_at || thread.createdAt).toLocaleDateString()
                            : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col">
            {!selectedThreadId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <Bot className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Select a thread or start a new one</p>
                <p className="text-sm">Click the + button to create a new chat thread</p>
              </div>
            ) : (
              <>
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {threadData?.thread?.title || "Chat"}
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex-1 overflow-hidden p-0">
                  <ScrollArea className="h-full p-4">
                    {messagesLoading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !messages?.length ? (
                      <div className="space-y-4">
                        <div className="text-center py-8 text-muted-foreground">
                          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium">Start the conversation</p>
                          <p className="text-sm">Ask a question or try a suggestion below</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {quickSuggestions.map((suggestion) => (
                            <Button
                              key={suggestion}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={sendMessageMutation.isPending}
                              onClick={() => handleSuggestionClick(suggestion)}
                            >
                              <Sparkles className="h-3 w-3 mr-1" />
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg: any, idx: number) => (
                          <div
                            key={msg.id || idx}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-lg px-4 py-2 ${
                                msg.role === "user"
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              <p className={`text-xs mt-1 ${
                                msg.role === "user" ? "text-blue-200" : "text-muted-foreground"
                              }`}>
                                {msg.created_at || msg.createdAt
                                  ? new Date(msg.created_at || msg.createdAt).toLocaleTimeString()
                                  : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                        {sendMessageMutation.isPending && (
                          <div className="flex justify-start">
                            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>

                <div className="p-4 border-t">
                  {messages?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {quickSuggestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          disabled={sendMessageMutation.isPending}
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your message..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      disabled={sendMessageMutation.isPending}
                    />
                    <Button
                      disabled={!inputText.trim() || sendMessageMutation.isPending}
                      onClick={handleSend}
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}