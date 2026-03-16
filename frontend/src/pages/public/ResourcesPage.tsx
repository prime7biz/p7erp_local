import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Calendar,
  BookOpen,
  Tag,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import {
  getAllArticles,
  getArticleBySlug,
  type ResourceArticle,
} from "@/data/resourcesArticles";

function ArticleIndex() {
  const articles = getAllArticles();
  return (
    <>
      <section className="relative bg-gradient-to-br from-primary/5 via-white to-white py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            Resources &{" "}
            <span className="text-primary">Industry Insights</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Expert guides, deep dives, and practical articles on garment
            manufacturing operations, accounting, and ERP best practices for
            Bangladesh&apos;s RMG industry.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {articles.map((article) => (
              <Link
                key={article.slug}
                to={`/resources/${article.slug}`}
                className="group block"
              >
                <article className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all hover:border-primary/30 h-full flex flex-col">
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        <Tag className="h-3 w-3 mr-1" />
                        {article.category}
                      </span>
                      <span className="flex items-center text-xs text-gray-400">
                        <Clock className="h-3 w-3 mr-1" />
                        {article.readTime}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-primary transition-colors">
                      {article.title}
                    </h2>
                    <p className="text-gray-600 text-sm leading-relaxed flex-1">
                      {article.excerpt}
                    </p>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                      <span className="flex items-center text-xs text-gray-400">
                        <Calendar className="h-3 w-3 mr-1" />
                        {article.date}
                      </span>
                      <span className="text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                        Read More <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-[10px]">
                        {article.author
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <span className="text-xs text-gray-500">
                        {article.author}
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function renderContentLine(line: string, i: number) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Markdown links [text](url) -> render as internal Link or external a
  const linkMatch = trimmed.match(/^\[(.+?)\]\((.+?)\)$/);
  if (linkMatch) {
    const [, text, url] = linkMatch;
    const isInternal =
      url.startsWith("/") && !url.startsWith("//");
    if (isInternal) {
      return (
        <p key={i} className="my-4">
          <Link to={url} className="text-primary hover:underline font-medium">
            {text}
          </Link>
        </p>
      );
    }
    return (
      <p key={i} className="my-4">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          {text}
        </a>
      </p>
    );
  }

  if (trimmed.startsWith("## ")) {
    return (
      <h2
        key={i}
        className="text-2xl font-bold text-gray-900 mt-10 mb-4"
      >
        {trimmed.replace("## ", "")}
      </h2>
    );
  }
  if (trimmed.startsWith("### ")) {
    return (
      <h3
        key={i}
        className="text-xl font-semibold text-gray-800 mt-8 mb-3"
      >
        {trimmed.replace("### ", "")}
      </h3>
    );
  }
  if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
    return (
      <p key={i} className="font-semibold text-gray-800 mt-4 mb-2">
        {trimmed.replace(/\*\*/g, "")}
      </p>
    );
  }
  if (trimmed.startsWith("- **")) {
    const match = trimmed.match(/^- \*\*(.+?)\*\*:?\s*(.*)$/);
    if (match) {
      return (
        <div key={i} className="flex items-start gap-2 ml-4 my-1.5">
          <span className="text-primary mt-1.5">•</span>
          <p className="text-gray-700">
            <strong>{match[1]}</strong>
            {match[2] ? `: ${match[2]}` : ""}
          </p>
        </div>
      );
    }
  }
  if (trimmed.startsWith("- ")) {
    return (
      <div key={i} className="flex items-start gap-2 ml-4 my-1.5">
        <span className="text-primary mt-1.5">•</span>
        <p className="text-gray-700">{trimmed.substring(2)}</p>
      </div>
    );
  }
  if (/^\d+\.\s/.test(trimmed)) {
    const match = trimmed.match(/^(\d+)\.\s\*\*(.+?)\*\*:?\s*(.*)$/);
    if (match) {
      return (
        <div key={i} className="flex items-start gap-3 ml-4 my-2">
          <span className="text-primary font-bold">{match[1]}.</span>
          <p className="text-gray-700">
            <strong>{match[2]}</strong>
            {match[3] ? `: ${match[3]}` : ""}
          </p>
        </div>
      );
    }
    return (
      <div key={i} className="flex items-start gap-3 ml-4 my-2">
        <span className="text-primary font-bold">
          {trimmed.match(/^\d+/)?.[0]}.
        </span>
        <p className="text-gray-700">
          {trimmed.replace(/^\d+\.\s*/, "")}
        </p>
      </div>
    );
  }
  return (
    <p key={i} className="text-gray-700 leading-relaxed my-4">
      {trimmed}
    </p>
  );
}

function ArticleView({ article }: { article: ResourceArticle }) {
  const paragraphs = article.content
    .trim()
    .split("\n")
    .filter((line) => line.trim());

  return (
    <>
      <section className="py-12 lg:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/resources"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors mb-8 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Resources
          </Link>

          <div className="mb-8">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                <Tag className="h-3 w-3 mr-1" />
                {article.category}
              </span>
              <span className="flex items-center text-xs text-gray-400">
                <Clock className="h-3 w-3 mr-1" />
                {article.readTime}
              </span>
              <span className="flex items-center text-xs text-gray-400">
                <Calendar className="h-3 w-3 mr-1" />
                {article.date}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
              {article.title}
            </h1>
            <p className="mt-4 text-lg text-gray-600">{article.excerpt}</p>
            <div className="flex items-center gap-3 mt-6 mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {article.author
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {article.author}
                </p>
                <p className="text-xs text-gray-500">{article.authorRole}</p>
              </div>
            </div>
          </div>

          <hr className="border-gray-200 mb-8" />

          <div className="prose prose-gray prose-lg max-w-none">
            {paragraphs.map((line, i) => renderContentLine(line, i))}
          </div>

          <hr className="border-gray-200 my-12" />

          <div className="bg-primary/5 rounded-xl p-8 text-center">
            <BookOpen className="h-8 w-8 text-primary mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Ready to Implement These Best Practices?
            </h2>
            <p className="text-gray-600 mb-6 max-w-lg mx-auto">
              Prime7 ERP automates these workflows out of the box. Start your
              free trial and see the difference a purpose-built garment ERP can
              make.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
              >
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/resources"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                More Resources
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function ResourcesPage() {
  const { slug } = useParams<{ slug?: string }>();
  const article = slug ? getArticleBySlug(slug) : null;

  if (slug && !article) {
    return (
      <>
        <Helmet>
          <title>Article Not Found – Prime7 ERP Resources</title>
          <meta
            name="description"
            content="The requested article was not found."
          />
        </Helmet>
        <section className="py-20 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Article Not Found
          </h1>
          <p className="text-gray-600 mb-6">
            The article you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
          <Link
            to="/resources"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Resources
          </Link>
        </section>
      </>
    );
  }

  if (article) {
    return <ArticleView article={article} />;
  }

  return <ArticleIndex />;
}
