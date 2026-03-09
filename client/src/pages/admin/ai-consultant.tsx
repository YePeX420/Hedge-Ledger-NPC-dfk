import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Loader2, User, Trash2, Sparkles, Swords, Wallet, Radio } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  role: "user" | "assistant";
  content: string;
  boutDetected?: boolean;
  liveDetected?: boolean;
  walletDetected?: boolean;
}

const SUGGESTED_QUESTIONS: { category: string; questions: string[] }[] = [
  {
    category: "Live Bouts & Tournaments",
    questions: [
      "What live tournament bouts are happening right now?",
      "Give me a full breakdown of tournament 2136",
      "Who won the most recent completed tournament?",
      "Analyze the current bout state — who has the advantage?",
    ],
  },
  {
    category: "Hero Optimization",
    questions: [
      "How does the hero breeding system work in DeFi Kingdoms?",
      "What determines a hero's combat power in PVP?",
      "Explain how the Summon Sniper finds optimal pairs",
      "How do profession bonuses affect quest XP and rewards?",
    ],
  },
  {
    category: "Yield & Gardening",
    questions: [
      "How does the Yield Calculator compute pool APR?",
      "What's the difference between locked and unlocked CRYSTAL rewards?",
      "Which pools currently have the best APR?",
      "How does the Gardening Calculator factor in pet bonuses?",
    ],
  },
];

export default function AIConsultant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const response = await apiRequest("POST", "/api/admin/ai-consultant/chat", {
        message: userMessage,
        history: messages.slice(-10),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          boutDetected: data.boutDetected,
          liveDetected: data.liveDetected,
          walletDetected: data.walletDetected,
        },
      ]);
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}. Please try again.` },
      ]);
    },
  });

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    
    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    chatMutation.mutate(userMessage);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Consultant</h1>
            <p className="text-sm text-muted-foreground">
              Master AI — live tournament data, wallet analysis, and all platform tools
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearChat}
            data-testid="button-clear-chat"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Chat
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <Sparkles className="h-12 w-12 text-primary/30 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Master AI Consultant</h3>
              <p className="text-muted-foreground mb-6 max-w-lg">
                I have real-time access to live tournament data, wallet hero analysis, and all
                Hedge Ledger tools. Ask me about anything — live bouts, hero optimization, yield,
                summoning, or game mechanics.
              </p>

              <div className="w-full max-w-3xl space-y-5 text-left">
                {SUGGESTED_QUESTIONS.map((group, gIdx) => (
                  <div key={gIdx}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      {group.category}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.questions.map((q, qIdx) => (
                        <Badge
                          key={qIdx}
                          variant="outline"
                          className="cursor-pointer hover-elevate py-2 px-3 text-sm"
                          onClick={() => handleSuggestedQuestion(q)}
                          data-testid={`suggested-question-${gIdx}-${qIdx}`}
                        >
                          {q}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.role}-${idx}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {msg.role === "assistant" && (msg.boutDetected || msg.walletDetected) && (
                      <div className="flex flex-wrap gap-1">
                        {msg.liveDetected && (
                          <Badge variant="outline" className="text-xs gap-1 no-default-active-elevate" data-testid="badge-live-data">
                            <Radio className="h-3 w-3 text-green-500" />
                            Live data
                          </Badge>
                        )}
                        {msg.boutDetected && !msg.liveDetected && (
                          <Badge variant="outline" className="text-xs gap-1 no-default-active-elevate" data-testid="badge-tournament-data">
                            <Swords className="h-3 w-3 text-primary" />
                            Tournament data loaded
                          </Badge>
                        )}
                        {msg.walletDetected && (
                          <Badge variant="outline" className="text-xs gap-1 no-default-active-elevate" data-testid="badge-wallet-data">
                            <Wallet className="h-3 w-3 text-primary" />
                            Wallet data loaded
                          </Badge>
                        )}
                      </div>
                    )}
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    </div>
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </CardContent>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about live bouts, tournaments, hero optimization, yield, or any game mechanic..."
              className="resize-none min-h-[60px]"
              disabled={chatMutation.isPending}
              data-testid="input-chat-message"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              size="icon"
              className="h-[60px] w-[60px]"
              data-testid="button-send-message"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </Card>
    </div>
  );
}
