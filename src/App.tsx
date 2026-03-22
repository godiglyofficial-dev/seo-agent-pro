import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Globe, 
  AlertCircle, 
  CheckCircle2, 
  BarChart3, 
  FileText, 
  ArrowRight, 
  Loader2, 
  ShieldCheck, 
  ExternalLink,
  Zap,
  Info,
  History,
  LogOut,
  User as UserIcon,
  Trash2,
  ChevronLeft,
  LayoutGrid,
  Wrench,
  Image as ImageIcon,
  Sparkles,
  Download,
  Code as CodeIcon,
  Terminal,
  Copy,
  Layout,
  Smartphone,
  Globe2,
  Layers,
  Cpu,
  Eye,
  Code,
  Video,
  Upload,
  Play,
  Film,
  Activity,
  Wifi,
  ArrowDown,
  ArrowUp,
  Clock,
  RefreshCw,
  Lightbulb,
  Tag,
  Globe as GlobeIcon,
  MessageSquare,
  Shield,
  Send,
  Users
} from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Firebase Imports
import { auth, db } from "./firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  deleteDoc, 
  doc,
  Timestamp,
  getDoc,
  setDoc,
  getDocs,
  limit
} from "firebase/firestore";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Firestore Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "{}");
        if (parsed.error) {
          errorMessage = `Database Error: ${parsed.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center">
          <div className="glass-panel p-8 max-w-md space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-2xl font-bold text-white">Application Error</h2>
            <p className="text-neutral-400">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-emerald-500 text-neutral-950 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface AuditData {
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  links: number;
  images: number;
  imagesWithoutAlt: number;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  textContent: string;
}

interface AIAnalysis {
  score: number;
  summary: string;
  criticalIssues: string[];
  solutions: { issue: string; solution: string; code?: string }[];
  contentSuggestions: string;
  metaOptimizations: {
    title: string;
    description: string;
  };
}

interface SavedAudit {
  id: string;
  url: string;
  timestamp: Timestamp;
  score: number;
  auditData: AuditData;
  aiAnalysis: AIAnalysis;
}

interface KeywordData {
  id: string;
  term: string;
  difficulty: number;
  volume: string;
  intent: string;
}

interface BlogPost {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  status: "draft" | "published";
  createdAt: Timestamp;
}

interface ChatMessage {
  id: string;
  userId: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Timestamp;
}

interface AdminStats {
  totalUsers: number;
  totalAudits: number;
  totalKeywords: number;
  totalBlogs: number;
}

type View = "audit" | "history" | "keywords" | "writer" | "tools" | "images" | "code" | "architect" | "video" | "speedtest" | "naming" | "chat" | "admin";

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("audit");
  const [url, setUrl] = useState("");
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedAudit[]>([]);
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Content Writer State
  const [writingPrompt, setWritingPrompt] = useState("");
  const [writerWebsiteUrl, setWriterWebsiteUrl] = useState("");
  const [writerTone, setWriterTone] = useState("Professional yet conversational");
  const [isWriting, setIsWriting] = useState(false);
  const [generatedBlog, setGeneratedBlog] = useState<{ title: string; content: string; imageUrl?: string } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Keyword Research State
  const [keywordInput, setKeywordInput] = useState("");
  const [isResearching, setIsResearching] = useState(false);

  // Image Generation State
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageAspectRatio, setImageAspectRatio] = useState<"1:1" | "16:9" | "9:16" | "4:3" | "3:4">("1:1");
  const [imageStyle, setImageStyle] = useState("Photorealistic");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingStandaloneImage, setIsGeneratingStandaloneImage] = useState(false);

  // Code Forge State
  const [codePrompt, setCodePrompt] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("html");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [forgePreview, setForgePreview] = useState(false);

  // App Architect State
  const [architectPrompt, setArchitectPrompt] = useState("");
  const [projectType, setProjectType] = useState<"website" | "webapp" | "mobile">("webapp");
  const [isArchitecting, setIsArchitecting] = useState(false);
  const [architectPreview, setArchitectPreview] = useState(false);
  const [blueprint, setBlueprint] = useState<{
    structure: string;
    description: string;
    keyFeatures: string[];
    techStack: string[];
    mainFiles: { name: string; content: string }[];
  } | null>(null);

  // Video Generation State
  const [videoPrompt, setVideoPrompt] = useState("");
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<string>("");
  const [videoSourceImage, setVideoSourceImage] = useState<string | null>(null);

  // Speed Test State
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [speedResults, setSpeedResults] = useState<{
    download: number | null;
    upload: number | null;
    latency: number | null;
    jitter: number | null;
  }>({ download: null, upload: null, latency: null, jitter: null });
  const [speedProgress, setSpeedProgress] = useState(0);

  // Naming Generator State
  const [namingPrompt, setNamingPrompt] = useState("");
  const [isGeneratingNames, setIsGeneratingNames] = useState(false);
  const [generatedNames, setGeneratedNames] = useState<{
    business: { name: string; tagline: string }[];
    domains: { domain: string; tld: string }[];
  } | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiResponding, setIsAiResponding] = useState(false);

  // Admin State
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // History & Keywords & Blogs Listener
  useEffect(() => {
    if (!user) {
      setHistory([]);
      setKeywords([]);
      setBlogPosts([]);
      return;
    }

    const auditsQ = query(collection(db, "audits"), where("userId", "==", user.uid), orderBy("timestamp", "desc"));
    const keywordsQ = query(collection(db, "keywords"), where("userId", "==", user.uid));
    const blogsQ = query(collection(db, "blog_posts"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));

    const unsubAudits = onSnapshot(auditsQ, (s) => setHistory(s.docs.map(d => ({ id: d.id, ...d.data() })) as SavedAudit[]), (error) => handleFirestoreError(error, OperationType.GET, "audits"));
    const unsubKeywords = onSnapshot(keywordsQ, (s) => setKeywords(s.docs.map(d => ({ id: d.id, ...d.data() })) as KeywordData[]), (error) => handleFirestoreError(error, OperationType.GET, "keywords"));
    const unsubBlogs = onSnapshot(blogsQ, (s) => setBlogPosts(s.docs.map(d => ({ id: d.id, ...d.data() })) as BlogPost[]), (error) => handleFirestoreError(error, OperationType.GET, "blog_posts"));

    return () => {
      unsubAudits();
      unsubKeywords();
      unsubBlogs();
    };
  }, [user]);

  // Admin Check
  useEffect(() => {
    if (!user) {
      setIsAdminUser(false);
      return;
    }
    const checkAdmin = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
          setIsAdminUser(true);
        } else if (user.email === "godiglyofficial@gmail.com") {
          setIsAdminUser(true);
          await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            displayName: user.displayName || "Admin",
            photoURL: user.photoURL || "",
            role: "admin"
          }, { merge: true });
        } else {
          setIsAdminUser(false);
        }
      } catch (err) {
        console.error("Admin check error:", err);
      }
    };
    checkAdmin();
  }, [user]);

  // Chat Listener
  useEffect(() => {
    if (!user) {
      setChatMessages([]);
      return;
    }
    const chatQ = query(collection(db, "chats"), where("userId", "==", user.uid), orderBy("timestamp", "asc"));
    const unsubChat = onSnapshot(chatQ, (s) => setChatMessages(s.docs.map(d => ({ id: d.id, ...d.data() })) as ChatMessage[]), (error) => handleFirestoreError(error, OperationType.GET, "chats"));
    return () => unsubChat();
  }, [user]);

  // Admin Stats Listener
  useEffect(() => {
    if (!isAdminUser) return;

    const unsubUsers = onSnapshot(collection(db, "users"), (s) => {
      setAllUsers(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setAdminStats(prev => ({ ...prev!, totalUsers: s.size }));
    });
    const unsubAudits = onSnapshot(collection(db, "audits"), (s) => setAdminStats(prev => ({ ...prev!, totalAudits: s.size })));
    const unsubKeywords = onSnapshot(collection(db, "keywords"), (s) => setAdminStats(prev => ({ ...prev!, totalKeywords: s.size })));
    const unsubBlogs = onSnapshot(collection(db, "blog_posts"), (s) => setAdminStats(prev => ({ ...prev!, totalBlogs: s.size })));

    return () => {
      unsubUsers();
      unsubAudits();
      unsubKeywords();
      unsubBlogs();
    };
  }, [isAdminUser]);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError("Failed to sign in. Please try again.");
    }
  };

  const logout = () => signOut(auth);

  const performAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsAuditing(true);
    setError(null);
    setAuditData(null);
    setAiAnalysis(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to audit URL");
      }

      const data: AuditData = await response.json();
      setAuditData(data);

      const analysis = await analyzeWithAI(data);
      
      if (user && analysis) {
        try {
          await addDoc(collection(db, "audits"), {
            userId: user.uid,
            url,
            timestamp: serverTimestamp(),
            score: analysis.score,
            auditData: data,
            aiAnalysis: analysis
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, "audits");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAuditing(false);
    }
  };

  const analyzeWithAI = async (data: AuditData) => {
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `
        You are an Expert SEO Agent. Analyze the following website audit data and provide a comprehensive SEO report.
        
        URL: ${url}
        Title: ${data.title}
        Description: ${data.description}
        H1 Tags: ${data.h1.join(", ")}
        Images: ${data.images} (Missing Alt: ${data.imagesWithoutAlt})
        Links: ${data.links}
        Content Snippet: ${data.textContent}

        Return the analysis in JSON format with the following structure:
        {
          "score": number (0-100),
          "summary": "Short overview of the site's SEO health",
          "criticalIssues": ["List of most important things to fix"],
          "solutions": [
            { "issue": "The issue name", "solution": "A detailed step-by-step solution", "code": "Optional code snippet or meta tag to copy" }
          ],
          "contentSuggestions": "Markdown formatted suggestions for content improvement or new blog posts",
          "metaOptimizations": {
            "title": "Suggested optimized title",
            "description": "Suggested optimized description"
          }
        }
      `;

      const result = await genAI.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const analysis: AIAnalysis = JSON.parse(result.text || "{}");
      setAiAnalysis(analysis);
      return analysis;
    } catch (err: any) {
      console.error("AI Analysis error:", err);
      setError("Audit complete, but AI analysis failed. Please try again.");
      return null;
    }
  };

  const researchKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput || !user) return;

    setIsResearching(true);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `
        Research the following keyword for SEO: "${keywordInput}".
        Provide data for this keyword and 4 related keywords.
        Return in JSON format:
        {
          "results": [
            { "term": "string", "difficulty": number (0-100), "volume": "string (e.g. 10k/mo)", "intent": "string (Informational, Transactional, etc.)" }
          ]
        }
      `;

      const result = await genAI.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(result.text || "{}");
      for (const kw of data.results) {
        try {
          await addDoc(collection(db, "keywords"), {
            userId: user.uid,
            ...kw
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, "keywords");
        }
      }
      setKeywordInput("");
    } catch (err) {
      console.error("Keyword research error:", err);
    } finally {
      setIsResearching(false);
    }
  };

  const generateBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writingPrompt || !user) return;

    setIsWriting(true);
    setGeneratedBlog(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `
        Role: You are an expert SEO Content Strategist and Copywriter for ${writerWebsiteUrl || 'a professional website'}.
        
        Task: Create a high-quality, engaging blog post about "${writingPrompt}".
        
        Content Requirements:
        * Tone: ${writerTone}.
        * Structure: Include a catchy H1 title, an engaging introduction, at least four H2 subheadings, and a concluding "Key Takeaways" section.
        * Length: Approximately 800–1,200 words.
        * Formatting: Use Markdown for all headers, bolding for emphasis, and bulleted lists to improve readability.
        * SEO Focus: Naturally integrate the primary keyword "${writingPrompt}" in the first paragraph and at least two subheadings. 
        * Call to Action: End with a prompt for readers to explore more at ${writerWebsiteUrl || 'our website'}.
        
        Constraint: Do not use "fluff" or generic AI introductory phrases like "In today's fast-paced world..." Start directly with the value.

        Return in JSON format:
        {
          "title": "Blog Title",
          "content": "Full blog content in Markdown format",
          "imagePrompt": "A detailed prompt to generate a featured image for this blog that matches the topic and tone"
        }
      `;

      const result = await genAI.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(result.text || "{}");
      
      // Generate Image
      setIsGeneratingImage(true);
      const imageModel = "gemini-2.5-flash-image";
      const imageResult = await genAI.models.generateContent({
        model: imageModel,
        contents: data.imagePrompt,
        config: {
          imageConfig: { aspectRatio: "16:9" }
        }
      });

      let imageUrl = "";
      for (const part of imageResult.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      const blogData = {
        title: data.title,
        content: data.content,
        imageUrl
      };

      setGeneratedBlog(blogData);
      
      // Save to Firestore
      try {
        await addDoc(collection(db, "blog_posts"), {
          userId: user.uid,
          ...blogData,
          status: "draft",
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "blog_posts");
      }

    } catch (err) {
      console.error("Blog generation error:", err);
    } finally {
      setIsWriting(false);
      setIsGeneratingImage(false);
    }
  };

  const publishBlog = async (id: string) => {
    try {
      await deleteDoc(doc(db, "blog_posts", id)); // In a real app, this would push to a CMS
      alert("Blog post successfully 'published' to your website! (Simulated integration)");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "blog_posts");
    }
  };

  const generateCodeSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codePrompt || !user) return;

    setIsGeneratingCode(true);
    setGeneratedCode("");
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `
        You are an expert full-stack developer and SEO engineer. 
        Task: Generate a clean, production-ready code snippet based on the following request: "${codePrompt}".
        
        Requirements:
        - If it's SEO related (Schema.json, Meta tags, robots.txt), ensure it follows latest best practices.
        - If it's a UI component, use Tailwind CSS for styling.
        - Provide ONLY the code snippet without markdown code blocks if possible, or I will parse it.
        - Include helpful comments in the code.
      `;

      const result = await genAI.models.generateContent({
        model,
        contents: prompt,
      });

      const text = result.text || "";
      // Clean up markdown code blocks if present
      const cleanedCode = text.replace(/```[\w]*\n/g, "").replace(/```/g, "").trim();
      setGeneratedCode(cleanedCode);
    } catch (err) {
      console.error("Code generation error:", err);
      setError("Failed to generate code. Please try again.");
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const generateProjectBlueprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!architectPrompt || !user) return;

    setIsArchitecting(true);
    setBlueprint(null);
    setArchitectPreview(false);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `
        You are a Senior Software Architect. 
        Task: Create a comprehensive project blueprint for a ${projectType} based on: "${architectPrompt}".
        
        Return the response in JSON format with this structure:
        {
          "structure": "A markdown-style file tree representation",
          "description": "A high-level overview of the project",
          "keyFeatures": ["Feature 1", "Feature 2", ...],
          "techStack": ["React", "Tailwind", "Firebase", ...],
          "mainFiles": [
            { "name": "index.html", "content": "Full HTML code for a previewable landing page or entry point" },
            { "name": "App.tsx", "content": "Full code for the main React entry point" },
            { "name": "types.ts", "content": "Type definitions" }
          ]
        }
        
        CRITICAL: For the "mainFiles" array, ALWAYS include an "index.html" file that acts as a visual preview of the project's core UI. Use Tailwind CSS via CDN for styling in this index.html.
        Ensure the code is production-ready, uses modern best practices, and includes Tailwind CSS for styling.
      `;

      const result = await genAI.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(result.text || "{}");
      setBlueprint(data);
    } catch (err) {
      console.error("Architect error:", err);
      setError("Failed to architect project. Please try again.");
    } finally {
      setIsArchitecting(false);
    }
  };

  const generateStandaloneImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePrompt || !user) return;

    setIsGeneratingStandaloneImage(true);
    setGeneratedImageUrl(null);
    try {
      const model = "gemini-2.5-flash-image";
      const fullPrompt = `Style: ${imageStyle}. Subject: ${imagePrompt}. Ensure high quality and professional composition.`;
      
      const result = await genAI.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          imageConfig: {
            aspectRatio: imageAspectRatio,
          }
        }
      });

      let imageUrl = "";
      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
      setGeneratedImageUrl(imageUrl);
    } catch (err) {
      console.error("Image generation error:", err);
      setError("Failed to generate image. Please try again.");
    } finally {
      setIsGeneratingStandaloneImage(false);
    }
  };

  const deleteAudit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "audits", id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const generateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!videoSourceImage && !videoPrompt) {
      setError("Please provide a prompt or an image to generate a video.");
      return;
    }

    setIsGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoProgress("Initializing video engine...");

    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
        setIsGeneratingVideo(false);
        return;
      }

      const apiKey = (process.env as any).API_KEY;
      const ai = new GoogleGenAI({ apiKey });

      setVideoProgress("Uploading assets and starting generation...");
      
      const videoConfig: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt || "Cinematic animation of the provided image",
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      };

      if (videoSourceImage) {
        videoConfig.image = {
          imageBytes: videoSourceImage.split(',')[1],
          mimeType: 'image/png'
        };
      }

      let operation = await ai.models.generateVideos(videoConfig);

      setVideoProgress("Generating video frames (this may take a few minutes)...");

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = (operation as any).response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        setVideoProgress("Finalizing video file...");
        const response = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': apiKey || "",
          },
        });
        const blob = await response.blob();
        setGeneratedVideoUrl(URL.createObjectURL(blob));
      }
    } catch (err: any) {
      console.error("Video generation error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setError("API Key session expired. Please select your API key again.");
        await (window as any).aistudio.openSelectKey();
      } else {
        setError("Failed to generate video. " + err.message);
      }
    } finally {
      setIsGeneratingVideo(false);
      setVideoProgress("");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoSourceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const runSpeedTest = async () => {
    setIsTestingSpeed(true);
    setSpeedProgress(0);
    setSpeedResults({ download: null, upload: null, latency: null, jitter: null });

    try {
      // 1. Latency & Jitter
      setSpeedProgress(10);
      const pings: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await fetch("https://www.google.com/favicon.ico", { mode: 'no-cors', cache: 'no-store' });
        pings.push(performance.now() - start);
        setSpeedProgress(10 + (i + 1) * 4);
      }
      const avgLatency = pings.reduce((a, b) => a + b) / pings.length;
      const jitter = Math.max(...pings) - Math.min(...pings);
      setSpeedResults(prev => ({ ...prev, latency: Math.round(avgLatency), jitter: Math.round(jitter) }));

      // 2. Download Speed
      setSpeedProgress(30);
      const testFileUrl = "https://raw.githubusercontent.com/google/material-design-icons/master/png/action/accessibility/res/drawable-xxxhdpi/ic_accessibility_black_48dp.png"; // Small file for quick test
      // For a real speed test we'd need a larger file. Let's use a 5MB dummy file if possible or just simulate for now with multiple small fetches
      
      const startTime = performance.now();
      let totalBytes = 0;
      const iterations = 10;
      
      for(let i = 0; i < iterations; i++) {
        const res = await fetch(`${testFileUrl}?t=${Date.now()}`, { cache: 'no-store' });
        const blob = await res.blob();
        totalBytes += blob.size;
        setSpeedProgress(30 + ((i + 1) / iterations) * 40);
      }
      
      const endTime = performance.now();
      const durationInSeconds = (endTime - startTime) / 1000;
      const bitsLoaded = totalBytes * 8;
      const speedBps = bitsLoaded / durationInSeconds;
      const speedMbps = speedBps / (1024 * 1024);
      
      setSpeedResults(prev => ({ ...prev, download: Number(speedMbps.toFixed(2)) }));

      // 3. Upload Speed (Simulated as it requires a server endpoint)
      setSpeedProgress(80);
      // We'll simulate upload by timing a POST of a blob to a no-op endpoint
      const uploadData = new Blob([new Uint8Array(1024 * 1024)]); // 1MB
      const uploadStart = performance.now();
      // Using a public no-op endpoint if available, otherwise simulate
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network overhead
      const uploadEnd = performance.now();
      const uploadDuration = (uploadEnd - uploadStart) / 1000;
      const uploadMbps = (1 * 8) / uploadDuration; // 1MB * 8 bits / duration

      setSpeedResults(prev => ({ ...prev, upload: Number(uploadMbps.toFixed(2)) }));
      setSpeedProgress(100);

    } catch (err) {
      console.error("Speed test error:", err);
      setError("Speed test failed. Please check your connection.");
    } finally {
      setIsTestingSpeed(false);
    }
  };

  const generateNames = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namingPrompt) return;

    setIsGeneratingNames(true);
    setGeneratedNames(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `
        Generate 10 creative business names and 10 matching domain names for the following description: "${namingPrompt}".
        
        For business names, also provide a short, catchy tagline.
        For domain names, use a variety of TLDs (.com, .io, .ai, .net, .co).
        
        Return the result in JSON format:
        {
          "business": [
            { "name": "string", "tagline": "string" }
          ],
          "domains": [
            { "domain": "string", "tld": "string" }
          ]
        }
      `;

      const result = await genAI.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(result.text || "{}");
      setGeneratedNames(data);
    } catch (err: any) {
      console.error("Naming generation error:", err);
      setError("Failed to generate names. Please try again.");
    } finally {
      setIsGeneratingNames(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user) return;

    const userMsg = chatInput;
    setChatInput("");
    setIsAiResponding(true);

    try {
      await addDoc(collection(db, "chats"), {
        userId: user.uid,
        text: userMsg,
        sender: "user",
        timestamp: serverTimestamp()
      });

      const chat = genAI.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are an expert SEO assistant and digital strategist. You help users with their SEO audits, content writing, and brand building. You are friendly, professional, and concise. You are part of the 'SEO Toolkit' application."
        }
      });

      const response = await chat.sendMessage({ message: userMsg });
      const aiMsg = response.text;

      await addDoc(collection(db, "chats"), {
        userId: user.uid,
        text: aiMsg,
        sender: "ai",
        timestamp: serverTimestamp()
      });

    } catch (err) {
      console.error("Chat error:", err);
      setError("Failed to send message. Please try again.");
    } finally {
      setIsAiResponding(false);
    }
  };

  const loadAudit = (audit: SavedAudit) => {
    setUrl(audit.url);
    setAuditData(audit.auditData);
    setAiAnalysis(audit.aiAnalysis);
    setView("audit");
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-neutral-950/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView("audit")}>
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-neutral-950 fill-current" />
            </div>
            <span className="font-bold text-xl tracking-tight">SEO Agent <span className="text-emerald-400">Pro</span></span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
            <button 
              onClick={() => setView("audit")}
              className={cn("hover:text-white transition-colors", view === "audit" && "text-white")}
            >
              Audit
            </button>
            {user && (
              <>
                <button 
                  onClick={() => setView("tools")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "tools" && "text-white")}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Tools
                </button>
                <button 
                  onClick={() => setView("keywords")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "keywords" && "text-white")}
                >
                  <Search className="w-4 h-4" />
                  Keywords
                </button>
                <button 
                  onClick={() => setView("writer")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "writer" && "text-white")}
                >
                  <FileText className="w-4 h-4" />
                  Writer
                </button>
                <button 
                  onClick={() => setView("images")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "images" && "text-white")}
                >
                  <ImageIcon className="w-4 h-4" />
                  Images
                </button>
                <button 
                  onClick={() => setView("video")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "video" && "text-white")}
                >
                  <Video className="w-4 h-4" />
                  Video
                </button>
                <button 
                  onClick={() => setView("speedtest")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "speedtest" && "text-white")}
                >
                  <Activity className="w-4 h-4" />
                  Speed
                </button>
                <button 
                  onClick={() => setView("naming")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "naming" && "text-white")}
                >
                  <Lightbulb className="w-4 h-4" />
                  Naming
                </button>
                <button 
                  onClick={() => setView("chat")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "chat" && "text-white")}
                >
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </button>
                {isAdminUser && (
                  <button 
                    onClick={() => setView("admin")}
                    className={cn("hover:text-white transition-colors flex items-center gap-2", view === "admin" && "text-white")}
                  >
                    <Shield className="w-4 h-4" />
                    Admin
                  </button>
                )}
                <button 
                  onClick={() => setView("code")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "code" && "text-white")}
                >
                  <CodeIcon className="w-4 h-4" />
                  Forge
                </button>
                <button 
                  onClick={() => setView("architect")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "architect" && "text-white")}
                >
                  <Layers className="w-4 h-4" />
                  Architect
                </button>
                <button 
                  onClick={() => setView("history")}
                  className={cn("hover:text-white transition-colors flex items-center gap-2", view === "history" && "text-white")}
                >
                  <History className="w-4 h-4" />
                  History
                </button>
              </>
            )}
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                  <span className="hidden sm:inline">{user.displayName}</span>
                </div>
                <button onClick={logout} className="p-2 hover:bg-white/5 rounded-lg text-neutral-400 transition-colors">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="px-4 py-2 bg-white text-neutral-950 rounded-full text-sm font-semibold hover:bg-neutral-200 transition-colors flex items-center gap-2"
              >
                <UserIcon className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="pt-32 px-6 max-w-7xl mx-auto">
        {view === "audit" && (
          <>
            <div className="text-center mb-16">
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 leading-tight"
              >
                Autonomous <span className="gradient-text">SEO Intelligence</span>
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-neutral-400 text-lg md:text-xl max-w-2xl mx-auto mb-10"
              >
                Enter your URL and let our AI agent crawl, audit, and generate high-ranking content strategies for your business.
              </motion.p>

              <motion.form 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                onSubmit={performAudit}
                className="max-w-2xl mx-auto relative group"
              >
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative flex items-center bg-neutral-900 border border-white/10 rounded-2xl p-2 focus-within:border-emerald-500/50 transition-colors">
                  <div className="pl-4 text-neutral-500">
                    <Globe className="w-5 h-5" />
                  </div>
                  <input 
                    type="url" 
                    placeholder="https://yourwebsite.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    className="flex-1 bg-transparent border-none focus:ring-0 text-white px-4 py-3 outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={isAuditing}
                    className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAuditing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Auditing...
                      </>
                    ) : (
                      <>
                        Analyze
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            </div>

            <AnimatePresence>
              {auditData && (
                <motion.div 
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                >
                  <div className="lg:col-span-1 space-y-6">
                    <div className="glass-panel p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-emerald-400" />
                          Technical Audit
                        </h2>
                        {aiAnalysis && <div className="text-2xl font-black text-emerald-400">{aiAnalysis.score}%</div>}
                      </div>
                      <div className="space-y-4">
                        <AuditItem label="Page Title" value={auditData.title} status={auditData.title !== "Missing" ? "success" : "error"} />
                        <AuditItem label="Meta Description" value={auditData.description} status={auditData.description !== "Missing" ? "success" : "warning"} />
                        <AuditItem label="H1 Heading" value={auditData.h1[0] || "None"} status={auditData.h1.length === 1 ? "success" : "warning"} />
                        <AuditItem label="Images" value={`${auditData.images} total (${auditData.imagesWithoutAlt} missing alt)`} status={auditData.imagesWithoutAlt === 0 ? "success" : "warning"} />
                        <AuditItem label="Canonical URL" value={auditData.canonical} status={auditData.canonical !== "Missing" ? "success" : "warning"} />
                      </div>
                    </div>

                    {aiAnalysis && (
                      <div className="glass-panel p-6 border-red-500/20">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-red-400 mb-4 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Critical Issues
                        </h3>
                        <ul className="space-y-3">
                          {aiAnalysis.criticalIssues.map((issue, i) => (
                            <li key={i} className="text-sm text-neutral-300 flex gap-2">
                              <span className="text-red-500 shrink-0">•</span>
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    {aiAnalysis ? (
                      <div className="space-y-6">
                        <div className="glass-panel p-8">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                              <ShieldCheck className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                              <h2 className="text-xl font-bold">AI Strategy Report</h2>
                              <p className="text-sm text-neutral-400">Generated by Gemini 1.5 Flash</p>
                            </div>
                          </div>
                          <div className="prose prose-invert max-w-none">
                            <div className="mb-8">
                              <h3 className="text-lg font-bold mb-2">Executive Summary</h3>
                              <p className="text-neutral-300 leading-relaxed">{aiAnalysis.summary}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2 text-wrap">Optimized Title</h4>
                                <p className="text-sm text-white font-medium">{aiAnalysis.metaOptimizations.title}</p>
                              </div>
                              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">Optimized Description</h4>
                                <p className="text-sm text-white font-medium">{aiAnalysis.metaOptimizations.description}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Solutions Section */}
                        <div className="glass-panel p-8">
                          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <Zap className="w-6 h-6 text-emerald-400" />
                            Automated Solutions
                          </h3>
                          <div className="space-y-6">
                            {aiAnalysis.solutions.map((sol, i) => (
                              <div key={i} className="p-6 bg-neutral-900/50 rounded-2xl border border-white/5">
                                <h4 className="text-lg font-bold text-white mb-2">{sol.issue}</h4>
                                <p className="text-neutral-400 text-sm mb-4">{sol.solution}</p>
                                {sol.code && (
                                  <div className="relative group">
                                    <pre className="bg-black/50 p-4 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto">
                                      {sol.code}
                                    </pre>
                                    <button 
                                      onClick={() => navigator.clipboard.writeText(sol.code!)}
                                      className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <FileText className="w-4 h-4 text-white" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="glass-panel p-8 h-full flex flex-col items-center justify-center text-center space-y-4">
                        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                        <h3 className="text-xl font-bold">AI is thinking...</h3>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {view === "tools" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            <div className="text-center max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">SEO <span className="gradient-text">Toolkit</span></h1>
              <p className="text-neutral-400">A comprehensive suite of AI-powered tools to supercharge your search visibility.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <ToolDashboardCard 
                icon={<Globe className="w-6 h-6" />}
                title="Website Auditor"
                description="Deep technical analysis of any URL with AI-generated fixes and content suggestions."
                onClick={() => setView("audit")}
                badge="Core"
              />
              <ToolDashboardCard 
                icon={<Search className="w-6 h-6" />}
                title="Keyword Researcher"
                description="Discover high-volume, low-competition keywords and analyze search intent."
                onClick={() => setView("keywords")}
                badge="AI Powered"
              />
              <ToolDashboardCard 
                icon={<FileText className="w-6 h-6" />}
                title="AI Content Scribe"
                description="Generate long-form, SEO-optimized blog posts with matching AI visuals."
                onClick={() => setView("writer")}
                badge="Creative"
              />
              <ToolDashboardCard 
                icon={<ImageIcon className="w-6 h-6" />}
                title="AI Image Studio"
                description="Generate high-quality, custom visuals for your blog posts and social media."
                onClick={() => setView("images")}
                badge="Visual"
              />
              <ToolDashboardCard 
                icon={<CodeIcon className="w-6 h-6" />}
                title="AI Code Forge"
                description="Generate SEO schema, meta tags, robots.txt, or custom React components instantly."
                onClick={() => setView("code")}
                badge="Technical"
              />
              <ToolDashboardCard 
                icon={<Layers className="w-6 h-6" />}
                title="App Architect"
                description="Design entire websites, web apps, or mobile app structures with full code blueprints."
                onClick={() => setView("architect")}
                badge="Advanced"
              />
              <ToolDashboardCard 
                icon={<Video className="w-6 h-6" />}
                title="AI Video Lab"
                description="Bring your images to life with cinematic AI video generation powered by Veo."
                onClick={() => setView("video")}
                badge="New"
              />
              <ToolDashboardCard 
                icon={<Activity className="w-6 h-6" />}
                title="Net Speed Test"
                description="Measure your connection performance for optimal SEO and user experience."
                onClick={() => setView("speedtest")}
                badge="Utility"
              />
              <ToolDashboardCard 
                icon={<Lightbulb className="w-6 h-6" />}
                title="Brand Architect"
                description="Generate creative business names and matching domain names instantly with AI."
                onClick={() => setView("naming")}
                badge="Creative"
              />
              <ToolDashboardCard 
                icon={<BarChart3 className="w-6 h-6" />}
                title="SERP Analyzer"
                description="Analyze top-ranking pages for any keyword to understand what works."
                onClick={() => setView("keywords")}
                isComingSoon
              />
              <ToolDashboardCard 
                icon={<Zap className="w-6 h-6" />}
                title="Backlink Checker"
                description="Monitor your domain authority and identify new link-building opportunities."
                onClick={() => {}}
                isComingSoon
              />
              <ToolDashboardCard 
                icon={<ShieldCheck className="w-6 h-6" />}
                title="Rank Tracker"
                description="Daily updates on your keyword rankings across Google and Bing."
                onClick={() => {}}
                isComingSoon
              />
            </div>
          </motion.div>
        )}

        {view === "architect" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            <div className="text-center max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">App <span className="gradient-text">Architect</span></h1>
              <p className="text-neutral-400">Design and build entire websites, web apps, or mobile applications from a single prompt.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <form onSubmit={generateProjectBlueprint} className="glass-panel p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Project Vision</label>
                      <textarea 
                        placeholder="e.g., A fitness tracking app with social features and real-time workouts..."
                        value={architectPrompt}
                        onChange={(e) => setArchitectPrompt(e.target.value)}
                        rows={6}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Platform Type</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'website', icon: Globe2, label: 'Web' },
                          { id: 'webapp', icon: Layout, label: 'App' },
                          { id: 'mobile', icon: Smartphone, label: 'Mobile' }
                        ].map((type) => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => setProjectType(type.id as any)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                              projectType === type.id 
                                ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" 
                                : "bg-neutral-900 border-white/10 text-neutral-500 hover:border-white/20"
                            )}
                          >
                            <type.icon className="w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{type.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isArchitecting}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isArchitecting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Architecting...
                      </>
                    ) : (
                      <>
                        <Cpu className="w-5 h-5" />
                        Build Blueprint
                      </>
                    )}
                  </button>
                </form>

                {blueprint && (
                  <div className="glass-panel p-6 space-y-6">
                    <h3 className="font-bold flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-500" />
                      Project Details
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-1">Tech Stack</span>
                        <div className="flex flex-wrap gap-2">
                          {blueprint.techStack.map(tech => (
                            <span key={tech} className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-neutral-300">{tech}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-1">Key Features</span>
                        <ul className="space-y-1">
                          {blueprint.keyFeatures.map(feature => (
                            <li key={feature} className="text-xs text-neutral-400 flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 space-y-6">
                {blueprint ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex bg-neutral-900 rounded-xl p-1 border border-white/5">
                        <button 
                          onClick={() => setArchitectPreview(false)}
                          className={cn(
                            "px-6 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                            !architectPreview ? "bg-white/10 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300"
                          )}
                        >
                          <Layers className="w-4 h-4" />
                          Architecture
                        </button>
                        <button 
                          onClick={() => setArchitectPreview(true)}
                          className={cn(
                            "px-6 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                            architectPreview ? "bg-white/10 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-300"
                          )}
                        >
                          <Eye className="w-4 h-4" />
                          Project Preview
                        </button>
                      </div>
                    </div>

                    {architectPreview ? (
                      <div className="glass-panel h-[700px] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-emerald-500" />
                            <span className="text-sm font-bold">Live Project Preview</span>
                          </div>
                          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                            Rendering Entry Point
                          </div>
                        </div>
                        <div className="flex-1 bg-neutral-950">
                          <ProjectPreview blueprint={blueprint} />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="glass-panel p-6">
                          <h3 className="text-xl font-bold mb-2">Architectural Overview</h3>
                          <p className="text-neutral-400 text-sm leading-relaxed">{blueprint.description}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="glass-panel overflow-hidden flex flex-col">
                            <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center gap-2">
                              <Layout className="w-4 h-4 text-emerald-500" />
                              <span className="text-sm font-bold">File Structure</span>
                            </div>
                            <div className="p-6 font-mono text-xs text-emerald-500/80 bg-neutral-950/50 flex-1">
                              <pre className="whitespace-pre-wrap">{blueprint.structure}</pre>
                            </div>
                          </div>

                          <div className="space-y-6">
                            {blueprint.mainFiles.map((file, idx) => (
                              <FileCard key={idx} file={file} copyToClipboard={copyToClipboard} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="glass-panel h-full min-h-[600px] flex flex-col items-center justify-center text-center p-12 space-y-6 opacity-30">
                    <Cpu className="w-24 h-24" />
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold">Ready to Architect</h3>
                      <p className="max-w-md mx-auto">Describe your vision on the left to generate a complete project blueprint, including file structure, tech stack, and core source code.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {view === "code" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            <div className="text-center max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">AI <span className="gradient-text">Code Forge</span></h1>
              <p className="text-neutral-400">Generate technical SEO assets, schema markup, or custom web components with our autonomous coding agent.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <form onSubmit={generateCodeSnippet} className="glass-panel p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">What are we building?</label>
                      <textarea 
                        placeholder="e.g., Generate a JSON-LD schema for a local business, or a responsive React pricing table..."
                        value={codePrompt}
                        onChange={(e) => setCodePrompt(e.target.value)}
                        rows={6}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Target Language/Format</label>
                      <select 
                        value={codeLanguage}
                        onChange={(e) => setCodeLanguage(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 appearance-none"
                      >
                        <option value="html">HTML / Meta Tags</option>
                        <option value="json">JSON-LD Schema</option>
                        <option value="typescript">TypeScript / React</option>
                        <option value="css">Tailwind CSS</option>
                        <option value="javascript">JavaScript</option>
                        <option value="plaintext">Robots.txt / Sitemap</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isGeneratingCode}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGeneratingCode ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Forging Code...
                      </>
                    ) : (
                      <>
                        <Terminal className="w-5 h-5" />
                        Generate Snippet
                      </>
                    )}
                  </button>
                </form>

                <div className="glass-panel p-6 space-y-4">
                  <h3 className="font-bold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    Quick Templates
                  </h3>
                  <div className="space-y-2">
                    {[
                      "Local Business Schema",
                      "FAQ Schema Markup",
                      "SEO Meta Tag Bundle",
                      "Robots.txt for WordPress",
                      "React SEO Breadcrumbs"
                    ].map((template) => (
                      <button
                        key={template}
                        onClick={() => setCodePrompt(template)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
                      >
                        {template}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="glass-panel h-full min-h-[500px] flex flex-col relative overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-bottom border-white/5 bg-white/5">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                      </div>
                      <span className="text-xs font-mono text-neutral-500 ml-4">forge_output.{codeLanguage === 'plaintext' ? 'txt' : codeLanguage}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/5">
                        <button 
                          onClick={() => setForgePreview(false)}
                          className={cn(
                            "px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5",
                            !forgePreview ? "bg-white/10 text-white" : "text-neutral-500 hover:text-neutral-300"
                          )}
                        >
                          <Code className="w-3 h-3" />
                          Code
                        </button>
                        <button 
                          onClick={() => setForgePreview(true)}
                          className={cn(
                            "px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5",
                            forgePreview ? "bg-white/10 text-white" : "text-neutral-500 hover:text-neutral-300"
                          )}
                        >
                          <Eye className="w-3 h-3" />
                          Preview
                        </button>
                      </div>
                      {generatedCode && (
                        <button 
                          onClick={() => copyToClipboard(generatedCode)}
                          className="flex items-center gap-2 text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 font-mono text-sm overflow-auto bg-neutral-950/50">
                    {generatedCode ? (
                      forgePreview ? (
                        <CodePreview code={generatedCode} language={codeLanguage} />
                      ) : (
                        <div className="p-6">
                          <pre className="text-emerald-500/90 whitespace-pre-wrap">
                            <code>{generatedCode}</code>
                          </pre>
                        </div>
                      )
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
                        <CodeIcon className="w-16 h-16" />
                        <p className="max-w-xs">Output will appear here once you forge a snippet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === "video" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            <div className="text-center max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">AI <span className="gradient-text">Video Lab</span></h1>
              <p className="text-neutral-400">Bring your images to life with cinematic AI video generation powered by Veo.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <form onSubmit={generateVideo} className="glass-panel p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Source Image</label>
                      <div className="relative group">
                        {videoSourceImage ? (
                          <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10">
                            <img src={videoSourceImage} alt="Source" className="w-full h-full object-cover" />
                            <button 
                              type="button"
                              onClick={() => setVideoSourceImage(null)}
                              className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-red-500 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-white/5 transition-all cursor-pointer">
                            <Upload className="w-8 h-8 text-neutral-500 mb-2" />
                            <span className="text-xs font-bold text-neutral-400">Upload Image</span>
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                          </label>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Animation Prompt (Optional)</label>
                      <textarea 
                        placeholder="e.g., A gentle breeze blowing through the trees, cinematic lighting..."
                        value={videoPrompt}
                        onChange={(e) => setVideoPrompt(e.target.value)}
                        rows={4}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isGeneratingVideo}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGeneratingVideo ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating Video...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        Generate Video
                      </>
                    )}
                  </button>
                </form>

                <div className="glass-panel p-6 space-y-4">
                  <div className="flex items-center gap-2 text-yellow-500">
                    <Info className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">Requirements</span>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Video generation requires a paid Gemini API key. If you haven't selected one, you'll be prompted to do so. Generation can take 2-5 minutes.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="glass-panel h-full min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden bg-neutral-950/50">
                  {isGeneratingVideo ? (
                    <div className="text-center space-y-6 p-12">
                      <div className="relative">
                        <div className="w-24 h-24 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto"></div>
                        <Film className="w-8 h-8 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold">Creating Magic</h3>
                        <p className="text-neutral-400 max-w-xs mx-auto text-sm">{videoProgress}</p>
                      </div>
                    </div>
                  ) : generatedVideoUrl ? (
                    <div className="w-full h-full flex flex-col">
                      <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4 text-emerald-500" />
                          <span className="text-sm font-bold">Generated Video</span>
                        </div>
                        <a 
                          href={generatedVideoUrl} 
                          download="ai-video.mp4"
                          className="flex items-center gap-2 text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </a>
                      </div>
                      <div className="flex-1 flex items-center justify-center p-8">
                        <video 
                          src={generatedVideoUrl} 
                          controls 
                          autoPlay 
                          loop 
                          className="max-w-full max-h-full rounded-xl shadow-2xl border border-white/10"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-4 opacity-20 p-12">
                      <Film className="w-24 h-24 mx-auto" />
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold">Ready for Production</h3>
                        <p className="max-w-xs mx-auto">Upload an image and provide a prompt to generate your first AI video.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === "naming" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            <div className="text-center max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">Brand <span className="gradient-text">Architect</span></h1>
              <p className="text-neutral-400">Generate creative business names and matching domain names instantly with AI.</p>
            </div>

            <div className="max-w-2xl mx-auto">
              <form onSubmit={generateNames} className="glass-panel p-6 flex gap-4">
                <input 
                  type="text"
                  placeholder="Describe your business (e.g., AI-powered coffee shop for developers)..."
                  value={namingPrompt}
                  onChange={(e) => setNamingPrompt(e.target.value)}
                  className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                />
                <button 
                  type="submit"
                  disabled={isGeneratingNames}
                  className="px-6 py-3 bg-emerald-500 text-neutral-950 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingNames ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  Generate
                </button>
              </form>
            </div>

            {generatedNames && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Tag className="w-5 h-5 text-emerald-500" />
                    Business Names
                  </h2>
                  <div className="grid grid-cols-1 gap-4">
                    {generatedNames.business.map((item, i) => (
                      <div key={i} className="glass-panel p-6 group hover:border-emerald-500/50 transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-bold text-white">{item.name}</h3>
                          <button 
                            onClick={() => navigator.clipboard.writeText(item.name)}
                            className="p-2 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-neutral-400 italic">"{item.tagline}"</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <GlobeIcon className="w-5 h-5 text-blue-500" />
                    Domain Suggestions
                  </h2>
                  <div className="grid grid-cols-1 gap-4">
                    {generatedNames.domains.map((item, i) => (
                      <div key={i} className="glass-panel p-6 group hover:border-blue-500/50 transition-all flex items-center justify-between">
                        <div>
                          <span className="text-lg font-bold text-white">{item.domain}</span>
                          <span className="text-blue-500 font-bold">{item.tld}</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => navigator.clipboard.writeText(`${item.domain}${item.tld}`)}
                            className="p-2 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <a 
                            href={`https://www.namecheap.com/domains/registration/results/?domain=${item.domain}${item.tld}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 text-neutral-400 hover:text-white"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {view === "chat" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto h-[700px] flex flex-col glass-panel overflow-hidden">
            <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">AI Strategy Board</h2>
                  <p className="text-xs text-neutral-400">Real-time connection with your SEO Assistant</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
                  <MessageSquare className="w-16 h-16" />
                  <p className="max-w-xs">Start a conversation with your AI strategist to plan your next big move.</p>
                </div>
              )}
              {chatMessages.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.sender === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                    msg.sender === "user" 
                      ? "bg-emerald-500 text-neutral-950 rounded-tr-none" 
                      : "bg-neutral-800 text-white rounded-tl-none border border-white/5"
                  )}>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    <div className={cn("text-[10px] mt-2 opacity-50", msg.sender === "user" ? "text-right" : "text-left")}>
                      {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {isAiResponding && (
                <div className="flex justify-start">
                  <div className="bg-neutral-800 text-white p-4 rounded-2xl rounded-tl-none border border-white/5 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span className="text-sm italic">AI is typing...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-6 border-t border-white/5 bg-neutral-900/50 flex gap-4">
              <input 
                type="text"
                placeholder="Type your message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
              />
              <button 
                type="submit"
                disabled={isAiResponding || !chatInput.trim()}
                className="px-6 py-3 bg-emerald-500 text-neutral-950 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
                Send
              </button>
            </form>
          </motion.div>
        )}

        {view === "admin" && isAdminUser && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Admin <span className="gradient-text">Dashboard</span></h1>
              <p className="text-neutral-400">Monitor application usage and manage user data.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <AdminStatCard label="Total Users" value={adminStats?.totalUsers || 0} icon={<Users className="w-6 h-6 text-blue-400" />} />
              <AdminStatCard label="Total Audits" value={adminStats?.totalAudits || 0} icon={<BarChart3 className="w-6 h-6 text-emerald-400" />} />
              <AdminStatCard label="Keywords" value={adminStats?.totalKeywords || 0} icon={<Search className="w-6 h-6 text-purple-400" />} />
              <AdminStatCard label="Blog Posts" value={adminStats?.totalBlogs || 0} icon={<FileText className="w-6 h-6 text-orange-400" />} />
            </div>

            <div className="glass-panel overflow-hidden">
              <div className="p-6 border-b border-white/5 bg-white/5">
                <h2 className="text-xl font-bold">User Management</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/5 text-xs font-bold uppercase tracking-widest text-neutral-500">
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {allUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 flex items-center gap-3">
                          <img src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName}`} className="w-8 h-8 rounded-full" />
                          <span className="font-medium">{u.displayName}</span>
                        </td>
                        <td className="px-6 py-4 text-neutral-400">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                            u.role === "admin" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2 text-xs text-emerald-400">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                            Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
        {view === "speedtest" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-4xl mx-auto space-y-12">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Network <span className="gradient-text">Speed Test</span></h1>
              <p className="text-neutral-400">Measure your connection performance for optimal SEO and user experience.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass-panel p-12 flex flex-col items-center justify-center space-y-8 relative overflow-hidden">
                <div className="relative w-64 h-64 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="128"
                      cy="128"
                      r="120"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      className="text-white/5"
                    />
                    <circle
                      cx="128"
                      cy="128"
                      r="120"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={753.98}
                      strokeDashoffset={753.98 - (753.98 * speedProgress) / 100}
                      className="text-emerald-500 transition-all duration-500 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-6xl font-black tracking-tighter">
                      {isTestingSpeed ? (speedResults.download || speedResults.latency || "...") : (speedResults.download || "0")}
                    </span>
                    <span className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Mbps Download</span>
                  </div>
                </div>

                <button 
                  onClick={runSpeedTest}
                  disabled={isTestingSpeed}
                  className="px-12 py-4 bg-emerald-500 text-neutral-950 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center gap-3"
                >
                  {isTestingSpeed ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Start Test
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <SpeedMetricCard 
                  icon={<ArrowDown className="w-6 h-6 text-emerald-400" />}
                  label="Download"
                  value={speedResults.download}
                  unit="Mbps"
                  loading={isTestingSpeed && speedProgress < 70 && speedProgress > 30}
                />
                <SpeedMetricCard 
                  icon={<ArrowUp className="w-6 h-6 text-blue-400" />}
                  label="Upload"
                  value={speedResults.upload}
                  unit="Mbps"
                  loading={isTestingSpeed && speedProgress >= 70}
                />
                <div className="grid grid-cols-2 gap-4">
                  <SpeedMetricCard 
                    icon={<Clock className="w-5 h-5 text-yellow-400" />}
                    label="Latency"
                    value={speedResults.latency}
                    unit="ms"
                    loading={isTestingSpeed && speedProgress <= 30}
                  />
                  <SpeedMetricCard 
                    icon={<Wifi className="w-5 h-5 text-purple-400" />}
                    label="Jitter"
                    value={speedResults.jitter}
                    unit="ms"
                    loading={isTestingSpeed && speedProgress <= 30}
                  />
                </div>
                
                <div className="glass-panel p-6 bg-emerald-500/5 border-emerald-500/20">
                  <h3 className="font-bold text-emerald-400 mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    SEO Impact
                  </h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    Network speed directly affects your Core Web Vitals, specifically LCP and CLS. A faster connection ensures your site's assets load quickly, improving search rankings and user retention.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {view === "images" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
            <div className="text-center max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">AI <span className="gradient-text">Image Studio</span></h1>
              <p className="text-neutral-400">Transform your ideas into stunning visuals with Gemini's advanced image generation.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <form onSubmit={generateStandaloneImage} className="glass-panel p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Prompt</label>
                      <textarea 
                        placeholder="Describe the image you want to create..."
                        value={imagePrompt}
                        onChange={(e) => setImagePrompt(e.target.value)}
                        rows={4}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Aspect Ratio</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["1:1", "16:9", "9:16", "4:3", "3:4"] as const).map((ratio) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => setImageAspectRatio(ratio)}
                            className={cn(
                              "px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                              imageAspectRatio === ratio 
                                ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" 
                                : "bg-neutral-900 border-white/5 text-neutral-400 hover:border-white/20"
                            )}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Style</label>
                      <select 
                        value={imageStyle}
                        onChange={(e) => setImageStyle(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 appearance-none"
                      >
                        <option>Photorealistic</option>
                        <option>Digital Art</option>
                        <option>Cyberpunk</option>
                        <option>Minimalist</option>
                        <option>3D Render</option>
                        <option>Sketch</option>
                        <option>Oil Painting</option>
                        <option>Anime</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isGeneratingStandaloneImage}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGeneratingStandaloneImage ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Image
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-2">
                <div className="glass-panel p-4 h-full min-h-[400px] flex flex-col items-center justify-center text-center relative overflow-hidden">
                  {generatedImageUrl ? (
                    <div className="w-full h-full flex flex-col items-center gap-6">
                      <div className="relative group max-w-full max-h-[600px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                        <img 
                          src={generatedImageUrl} 
                          alt="Generated" 
                          className="max-w-full max-h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <a 
                            href={generatedImageUrl} 
                            download="generated-image.png"
                            className="p-3 bg-white text-neutral-950 rounded-full hover:scale-110 transition-transform"
                          >
                            <Download className="w-6 h-6" />
                          </a>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-4">
                        <button 
                          onClick={() => {
                            setVideoSourceImage(generatedImageUrl);
                            setView("video");
                          }}
                          className="px-6 py-2 bg-emerald-500 text-neutral-950 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-colors"
                        >
                          <Video className="w-4 h-4" />
                          Animate with Video Lab
                        </button>
                        <button 
                          onClick={() => setGeneratedImageUrl(null)}
                          className="px-6 py-2 bg-white/5 text-neutral-400 rounded-xl font-bold hover:bg-white/10 hover:text-white transition-colors"
                        >
                          Clear and start over
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {isGeneratingStandaloneImage ? (
                        <div className="space-y-4">
                          <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                          </div>
                          <h3 className="text-xl font-bold">Creating your masterpiece...</h3>
                          <p className="text-neutral-400 max-w-xs mx-auto">Gemini is processing your prompt and rendering high-quality pixels.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto text-neutral-500">
                            <ImageIcon className="w-12 h-12" />
                          </div>
                          <h3 className="text-xl font-bold">Your Image Preview</h3>
                          <p className="text-neutral-400 max-w-xs mx-auto">Enter a prompt and select your preferences to generate a custom AI image.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === "keywords" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="text-4xl font-bold mb-4">Keyword <span className="gradient-text">Intelligence</span></h1>
              <p className="text-neutral-400">Discover high-volume, low-competition keywords to dominate your niche.</p>
            </div>

            <form onSubmit={researchKeyword} className="max-w-xl mx-auto flex gap-2">
              <input 
                type="text" 
                placeholder="Enter a topic or keyword..."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
              />
              <button 
                type="submit"
                disabled={isResearching}
                className="bg-emerald-500 text-neutral-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {isResearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Research
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
              {keywords.map((kw) => (
                <div key={kw.id} className="glass-panel p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-white">{kw.term}</h3>
                    <div className={cn(
                      "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                      kw.difficulty > 70 ? "bg-red-500/20 text-red-400" : kw.difficulty > 40 ? "bg-yellow-500/20 text-yellow-400" : "bg-emerald-500/20 text-emerald-400"
                    )}>
                      Diff: {kw.difficulty}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-neutral-400 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      {kw.volume}
                    </div>
                    <div className="text-neutral-400 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      {kw.intent}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {view === "writer" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="text-4xl font-bold mb-4">AI <span className="gradient-text">Content Scribe</span></h1>
              <p className="text-neutral-400">Generate SEO-optimized blog posts with AI-generated featured images.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <form onSubmit={generateBlog} className="glass-panel p-6 space-y-4">
                  <h3 className="text-lg font-bold">New Blog Post</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Topic / Keyword</label>
                      <textarea 
                        placeholder="What should the blog be about? (e.g. 'Benefits of organic coffee for athletes')"
                        value={writingPrompt}
                        onChange={(e) => setWritingPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Website URL</label>
                        <input 
                          type="text"
                          placeholder="yourwebsite.com"
                          value={writerWebsiteUrl}
                          onChange={(e) => setWriterWebsiteUrl(e.target.value)}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Brand Tone</label>
                        <input 
                          type="text"
                          placeholder="e.g. Conversational"
                          value={writerTone}
                          onChange={(e) => setWriterTone(e.target.value)}
                          className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                  <button 
                    type="submit"
                    disabled={isWriting}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isWriting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                    Generate SEO Blog
                  </button>
                </form>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <History className="w-5 h-5 text-emerald-400" />
                    Recent Drafts
                  </h3>
                  {blogPosts.map(post => (
                    <div key={post.id} className="glass-panel p-4 flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        {post.imageUrl && <img src={post.imageUrl} className="w-12 h-12 rounded-lg object-cover" referrerPolicy="no-referrer" />}
                        <div>
                          <h4 className="font-bold text-sm text-white">{post.title}</h4>
                          <p className="text-xs text-neutral-500">{post.createdAt?.toDate().toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => publishBlog(post.id)}
                        className="px-4 py-2 bg-white/5 hover:bg-emerald-500 hover:text-neutral-950 rounded-lg text-xs font-bold transition-all"
                      >
                        Publish
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                {generatedBlog ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel p-8 space-y-6">
                    {generatedBlog.imageUrl && (
                      <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10">
                        <img src={generatedBlog.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <h2 className="text-3xl font-bold text-white">{generatedBlog.title}</h2>
                    <div className="markdown-content">
                      <ReactMarkdown>{generatedBlog.content}</ReactMarkdown>
                    </div>
                  </motion.div>
                ) : (
                  <div className="glass-panel p-12 h-full flex flex-col items-center justify-center text-center space-y-4 border-dashed">
                    {isWriting ? (
                      <>
                        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                        <div>
                          <h3 className="text-xl font-bold">{isGeneratingImage ? "Generating Visuals..." : "Writing Content..."}</h3>
                          <p className="text-neutral-400">Crafting an SEO-optimized masterpiece for your website.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-neutral-500">
                          <FileText className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold">Preview Area</h3>
                        <p className="text-neutral-400">Your generated blog post will appear here for review before publishing.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {view === "history" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setView("audit")} className="p-2 hover:bg-white/5 rounded-lg text-neutral-400 transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className="text-3xl font-bold">Audit History</h1>
            </div>
            {history.length === 0 ? (
              <div className="glass-panel p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-neutral-500"><History className="w-8 h-8" /></div>
                <h3 className="text-xl font-bold">No history yet</h3>
                <button onClick={() => setView("audit")} className="px-6 py-2 bg-emerald-500 text-neutral-950 rounded-xl font-bold hover:bg-emerald-400 transition-colors">Start First Audit</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {history.map((audit) => (
                  <motion.div key={audit.id} layoutId={audit.id} onClick={() => loadAudit(audit)} className="glass-panel p-6 hover:bg-white/[0.07] transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-2xl font-black text-emerald-400">{audit.score}%</div>
                      <button onClick={(e) => deleteAudit(audit.id, e)} className="p-2 text-neutral-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <h3 className="font-bold text-lg truncate mb-1">{audit.url}</h3>
                    <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold">{audit.timestamp?.toDate().toLocaleDateString()} at {audit.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-20 py-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Zap className="w-4 h-4" />
            <span className="text-sm font-medium">SEO Agent Pro © 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-neutral-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">API Docs</a>
          </div>
        </div>
      </footer>

      <style>{`
        .markdown-content h1 { @apply text-2xl font-bold mb-4 mt-6 text-white; }
        .markdown-content h2 { @apply text-xl font-bold mb-3 mt-5 text-white; }
        .markdown-content h3 { @apply text-lg font-bold mb-2 mt-4 text-white; }
        .markdown-content p { @apply text-neutral-300 mb-4 leading-relaxed; }
        .markdown-content ul { @apply list-disc pl-5 mb-4 space-y-2 text-neutral-300; }
        .markdown-content ol { @apply list-decimal pl-5 mb-4 space-y-2 text-neutral-300; }
        .markdown-content li { @apply leading-relaxed; }
        .markdown-content strong { @apply text-emerald-400 font-semibold; }
      `}</style>
    </div>
  );
}

function AuditItem({ label, value, status }: { label: string; value: string; status: "success" | "warning" | "error" }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-neutral-500">
        <span>{label}</span>
        {status === "success" ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : status === "warning" ? <Info className="w-3 h-3 text-yellow-500" /> : <AlertCircle className="w-3 h-3 text-red-500" />}
      </div>
      <p className={cn("text-sm font-medium truncate", status === "success" ? "text-white" : status === "warning" ? "text-yellow-200/80" : "text-red-400")}>{value}</p>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="glass-panel p-6 hover:bg-white/[0.07] transition-colors group">
      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 text-emerald-400 group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-neutral-400 leading-relaxed">{description}</p>
    </div>
  );
}

function SpeedMetricCard({ icon, label, value, unit, loading }: { icon: React.ReactNode; label: string; value: number | null; unit: string; loading?: boolean }) {
  return (
    <div className="glass-panel p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
          {icon}
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 block">{label}</span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{value !== null ? value : "--"}</span>
            <span className="text-xs text-neutral-500 font-medium">{unit}</span>
          </div>
        </div>
      </div>
      {loading && <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin" />}
    </div>
  );
}

function AdminStatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="glass-panel p-6 flex items-center gap-4">
      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
        {icon}
      </div>
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 block">{label}</span>
        <span className="text-2xl font-bold">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}

function ProjectPreview({ blueprint }: { blueprint: any }) {
  // Find the best file to preview
  const entryFile = blueprint.mainFiles.find((f: any) => f.name === 'index.html') || 
                    blueprint.mainFiles.find((f: any) => f.name.endsWith('.html')) ||
                    blueprint.mainFiles[0];

  if (!entryFile) return null;

  const language = entryFile.name.endsWith('.tsx') ? 'typescript' : entryFile.name.split('.').pop() || 'html';

  return <CodePreview code={entryFile.content} language={language} />;
}

function FileCard({ file, copyToClipboard }: { file: { name: string; content: string }; copyToClipboard: (text: string) => void }) {
  const [showFilePreview, setShowFilePreview] = useState(false);
  const isPreviewable = file.name.endsWith('.html') || file.name.endsWith('.css') || file.name.endsWith('.js') || file.name.endsWith('.tsx');

  return (
    <div className="glass-panel overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-bold">{file.name}</span>
        </div>
        <div className="flex items-center gap-4">
          {isPreviewable && (
            <button 
              onClick={() => setShowFilePreview(!showFilePreview)}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                showFilePreview ? "bg-emerald-500 text-neutral-950" : "text-neutral-500 hover:text-white hover:bg-white/5"
              )}
              title={showFilePreview ? "Show Code" : "Show Preview"}
            >
              {showFilePreview ? <Code className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
          <button 
            onClick={() => copyToClipboard(file.content)}
            className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-widest"
          >
            Copy
          </button>
        </div>
      </div>
      <div className={cn(
        "font-mono bg-neutral-950/50 overflow-auto",
        showFilePreview ? "h-[400px]" : "max-h-[300px] p-6 text-[10px] text-neutral-400"
      )}>
        {showFilePreview ? (
          <CodePreview 
            code={file.content} 
            language={file.name.endsWith('.tsx') ? 'typescript' : file.name.split('.').pop() || 'html'} 
          />
        ) : (
          <pre className="whitespace-pre-wrap">{file.content}</pre>
        )}
      </div>
    </div>
  );
}

function ToolDashboardCard({ 
  icon, 
  title, 
  description, 
  onClick, 
  badge, 
  isComingSoon 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  onClick: () => void;
  badge?: string;
  isComingSoon?: boolean;
}) {
  return (
    <div 
      onClick={!isComingSoon ? onClick : undefined}
      className={cn(
        "glass-panel p-8 transition-all group relative overflow-hidden",
        !isComingSoon ? "cursor-pointer hover:bg-white/[0.07] hover:border-emerald-500/30" : "opacity-60 grayscale cursor-not-allowed"
      )}
    >
      <div className="flex justify-between items-start mb-6">
        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        {badge && (
          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded">
            {badge}
          </span>
        )}
        {isComingSoon && (
          <span className="px-2 py-1 bg-white/5 text-neutral-500 text-[10px] font-black uppercase tracking-widest rounded">
            Coming Soon
          </span>
        )}
      </div>
      <h3 className="text-xl font-bold mb-3 group-hover:text-emerald-400 transition-colors">{title}</h3>
      <p className="text-sm text-neutral-400 leading-relaxed mb-6">{description}</p>
      {!isComingSoon && (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-10px] group-hover:translate-x-0">
          Launch Tool
          <ArrowRight className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}

function CodePreview({ code, language }: { code: string, language: string }) {
  const isPreviewable = ["html", "javascript", "css", "typescript"].includes(language);

  if (!isPreviewable) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-50">
        <AlertCircle className="w-12 h-12 text-yellow-500" />
        <p className="max-w-xs">Preview is only available for HTML, CSS, and JavaScript snippets.</p>
      </div>
    );
  }

  if (language === 'typescript') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-50">
        <CodeIcon className="w-12 h-12 text-emerald-500" />
        <p className="max-w-xs">Live preview for React components is coming soon. Use the code view to see the generated implementation.</p>
      </div>
    );
  }

  const srcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background: #0a0a0a; color: #fff; font-family: sans-serif; padding: 20px; min-height: 100vh; display: flex; flex-direction: column; }
          ${language === 'css' ? code : ''}
        </style>
      </head>
      <body>
        ${language === 'html' ? code : ''}
        ${language === 'javascript' ? '<script>' + code + '</script>' : ''}
      </body>
    </html>
  `;

  return (
    <iframe
      srcDoc={srcDoc}
      title="Code Preview"
      className="w-full h-full border-none bg-neutral-950"
    />
  );
}
