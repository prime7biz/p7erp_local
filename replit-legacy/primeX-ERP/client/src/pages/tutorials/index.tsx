import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Rocket,
  ShoppingCart,
  Shirt,
  Package,
  Factory,
  Shield,
  Globe,
  Calculator,
  DollarSign,
  Users,
  UserCheck,
  Bot,
  Settings,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import {
  tutorials,
  searchTutorials,
  getArticleById,
  type TutorialSection,
  type TutorialArticle,
} from "@/data/tutorials";

const iconMap: Record<string, any> = {
  Rocket,
  ShoppingCart,
  Shirt,
  Package,
  Factory,
  Shield,
  Globe,
  Calculator,
  DollarSign,
  Users,
  UserCheck,
  Bot,
  Settings,
  BarChart3,
};

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let listType: "ol" | "ul" | null = null;
  let idx = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag
          key={`list-${idx++}`}
          className={`my-3 space-y-1.5 ${listType === "ol" ? "list-decimal" : "list-disc"} pl-6 text-gray-700`}
        >
          {listItems.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  const renderInline = (text: string) => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`(.+?)`/);

      let firstMatch: { index: number; length: number; type: string; content: string } | null = null;

      if (boldMatch && boldMatch.index !== undefined) {
        firstMatch = { index: boldMatch.index, length: boldMatch[0].length, type: "bold", content: boldMatch[1] };
      }
      if (codeMatch && codeMatch.index !== undefined) {
        if (!firstMatch || codeMatch.index < firstMatch.index) {
          firstMatch = { index: codeMatch.index, length: codeMatch[0].length, type: "code", content: codeMatch[1] };
        }
      }

      if (!firstMatch) {
        parts.push(remaining);
        break;
      }

      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }

      if (firstMatch.type === "bold") {
        parts.push(<strong key={key++} className="font-semibold text-gray-900">{firstMatch.content}</strong>);
      } else if (firstMatch.type === "code") {
        parts.push(
          <code key={key++} className="px-1.5 py-0.5 bg-gray-100 text-sm rounded font-mono text-blue-700">
            {firstMatch.content}
          </code>
        );
      }

      remaining = remaining.slice(firstMatch.index + firstMatch.length);
    }

    return <>{parts}</>;
  };

  for (const line of lines) {
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={`h1-${idx++}`} className="text-2xl font-bold text-gray-900 mb-2 mt-6 first:mt-0">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={`h2-${idx++}`} className="text-xl font-semibold text-gray-800 mb-2 mt-6">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={`h3-${idx++}`} className="text-lg font-semibold text-gray-700 mb-1.5 mt-4">
          {line.slice(4)}
        </h3>
      );
    } else if (/^\d+\.\s/.test(line)) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(line.replace(/^\d+\.\s/, ""));
    } else if (line.startsWith("- ")) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={`p-${idx++}`} className="text-gray-700 leading-relaxed my-2">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushList();

  return <div className="prose-sm max-w-none">{elements}</div>;
}

function ArticleView({
  article,
  section,
  onBack,
  onNavigate,
}: {
  article: TutorialArticle;
  section: TutorialSection;
  onBack: () => void;
  onNavigate: (articleId: string) => void;
}) {
  const relatedArticles = (article.relatedArticles || [])
    .map((id) => getArticleById(id))
    .filter(Boolean) as { article: TutorialArticle; section: TutorialSection }[];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-muted-foreground text-sm">/</span>
        <span className="text-sm text-muted-foreground">{section.title}</span>
        <span className="text-muted-foreground text-sm">/</span>
        <span className="text-sm font-medium">{article.title}</span>
      </div>

      <div className="bg-white rounded-lg border p-6 md:p-8">
        {renderMarkdown(article.content)}

        <div className="mt-6 pt-4 border-t flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Tags:</span>
          {article.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Last updated: {article.lastUpdated}
        </p>
      </div>

      {relatedArticles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Related Articles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {relatedArticles.map(({ article: ra, section: rs }) => (
              <button
                key={ra.id}
                onClick={() => onNavigate(ra.id)}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-primary/40 hover:bg-blue-50/50 transition-colors text-left"
              >
                <ExternalLink className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ra.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{rs.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TutorialsPage() {
  const [, params] = useRoute("/tutorials/:articleId");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    params?.articleId || null
  );
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    tutorials.forEach((s) => {
      defaults[s.id] = true;
    });
    return defaults;
  });
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);

  useEffect(() => {
    if (params?.articleId) {
      setSelectedArticleId(params.articleId);
    }
  }, [params?.articleId]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchTutorials(searchQuery);
  }, [searchQuery]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const [, navigate] = useLocation();

  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleId(articleId);
    setSearchQuery("");
    setMobileCategoryOpen(false);
    navigate(`/tutorials/${articleId}`, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setSelectedArticleId(null);
    navigate("/tutorials", { replace: true });
  };

  const selectedData = selectedArticleId ? getArticleById(selectedArticleId) : null;

  const categorySidebar = (
    <div className="space-y-1">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tutorials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {searchResults ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground px-2 mb-2">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
          </p>
          {searchResults.map((article) => {
            const sectionData = getArticleById(article.id);
            return (
              <button
                key={article.id}
                onClick={() => handleSelectArticle(article.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-gray-100 ${
                  selectedArticleId === article.id ? "bg-primary/10 text-primary font-medium" : "text-gray-700"
                }`}
              >
                <p className="font-medium truncate">{article.title}</p>
                <p className="text-xs text-muted-foreground truncate">{sectionData?.section.title}</p>
              </button>
            );
          })}
        </div>
      ) : (
        tutorials.map((section) => {
          const Icon = iconMap[section.icon] || BookOpen;
          const isExpanded = expandedSections[section.id];
          return (
            <div key={section.id}>
              <button
                onClick={() => toggleSection(section.id)}
                className="flex items-center w-full gap-2 px-2 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1 text-left truncate">{section.title}</span>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                )}
              </button>
              {isExpanded && (
                <div className="ml-6 space-y-0.5 mt-0.5 mb-1">
                  {section.articles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => handleSelectArticle(article.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                        selectedArticleId === article.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      {article.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const welcomeContent = (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Help & Tutorials</h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Browse tutorials by category or search for specific topics. Learn how to use every feature of Prime7 ERP.
        </p>
      </div>

      <div className="relative mb-6 max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search for a topic... (e.g., 'voucher', 'shipment', 'BOM')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 md:hidden"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tutorials.map((section) => {
          const Icon = iconMap[section.icon] || BookOpen;
          return (
            <button
              key={section.id}
              onClick={() => {
                if (section.articles.length > 0) {
                  handleSelectArticle(section.articles[0].id);
                }
              }}
              className="flex flex-col items-start p-4 bg-white rounded-lg border hover:border-primary/40 hover:shadow-sm transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-gray-900">{section.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {section.description}
              </p>
              <div className="flex items-center gap-1 text-xs text-primary font-medium mt-auto">
                <span>{section.articles.length} article{section.articles.length !== 1 ? "s" : ""}</span>
                <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-6">
              <ScrollArea className="h-[calc(100vh-120px)]">
                {categorySidebar}
              </ScrollArea>
            </div>
          </div>

          <div className="lg:hidden mb-4 w-full">
            {selectedArticleId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMobileCategoryOpen(!mobileCategoryOpen)}
                className="mb-4 gap-2"
              >
                <BookOpen className="h-4 w-4" />
                Browse Categories
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mobileCategoryOpen ? "rotate-180" : ""}`} />
              </Button>
            )}
            {mobileCategoryOpen && (
              <div className="bg-white rounded-lg border p-4 mb-4">
                {categorySidebar}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {selectedData ? (
              <ArticleView
                article={selectedData.article}
                section={selectedData.section}
                onBack={handleBack}
                onNavigate={handleSelectArticle}
              />
            ) : (
              welcomeContent
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
