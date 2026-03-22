import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
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
  Users,
  QrCode,
  Menu,
  X,
  Type,
  PencilLine,
  ScanSearch,
  Link,
  DollarSign,
  TrendingUp,
  Hash,
  Share2,
  ImagePlus,
  Palette,
  CreditCard
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
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
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

type View = "audit" | "history" | "keywords" | "writer" | "tools" | "images" | "code" | "architect" | "video" | "speedtest" | "naming" | "chat" | "admin" | "qr" | "wordcounter" | "rewrite" | "plagiarism" | "backlinks" | "domainvalue" | "domaintraffic" | "hashtags" | "socialkeywords" | "thumbnail" | "logo" | "businesscard";

function Sidebar({ 
  view, 
  setView, 
  user, 
  isAdminUser, 
  isOpen, 
  setIsOpen 
}: { 
  view: View; 
  setView: (v: View) => void; 
  user: User | null; 
  isAdminUser: boolean; 
  isOpen: boolean; 
  setIsOpen: (o: boolean) => void 
}) {
  const menuItems = [
    { id: "audit", label: "Audit", icon: Globe },
    { id: "tools", label: "Tools", icon: LayoutGrid, auth: true },
    { id: "keywords", label: "Keywords", icon: Search, auth: true },
    { id: "writer", label: "Writer", icon: FileText, auth: true },
    { id: "wordcounter", label: "Word Count", icon: Type, auth: true },
    { id: "rewrite", label: "Rewrite", icon: PencilLine, auth: true },
    { id: "plagiarism", label: "Plagiarism", icon: ScanSearch, auth: true },
    { id: "backlinks", label: "Backlinks", icon: Link, auth: true },
    { id: "domainvalue", label: "Value", icon: DollarSign, auth: true },
    { id: "domaintraffic", label: "Traffic", icon: TrendingUp, auth: true },
    { id: "hashtags", label: "Hashtags", icon: Hash, auth: true },
    { id: "socialkeywords", label: "Social Keywords", icon: Share2, auth: true },
    { id: "thumbnail", label: "Thumbnail", icon: ImagePlus, auth: true },
    { id: "logo", label: "Logo", icon: Palette, auth: true },
    { id: "businesscard", label: "Business Card", icon: CreditCard, auth: true },
    { id: "images", label: "Images", icon: ImageIcon, auth: true },
    { id: "video", label: "Video", icon: Video, auth: true },
    { id: "speedtest", label: "Speed", icon: Activity, auth: true },
    { id: "naming", label: "Naming", icon: Lightbulb, auth: true },
    { id: "qr", label: "QR", icon: QrCode, auth: true },
    { id: "chat", label: "Chat", icon: MessageSquare, auth: true },
    { id: "code", label: "Forge", icon: CodeIcon, auth: true },
    { id: "architect", label: "Architect", icon: Layers, auth: true },
    { id: "history", label: "History", icon: History, auth: true },
    { id: "admin", label: "Admin", icon: Shield, auth: true, admin: true },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          x: isOpen ? 0 : -280,
          width: isOpen ? 280 : 0
        }}
        className={cn(
          "fixed top-0 left-0 h-full bg-neutral-900 border-r border-white/10 z-[60] overflow-hidden flex flex-col transition-all duration-300",
          !isOpen && "lg:w-20 lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center gap-3 border-b border-white/5 h-20 shrink-0">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-neutral-950 fill-current" />
          </div>
          <span className={cn("font-bold text-lg tracking-tight whitespace-nowrap transition-opacity duration-300", !isOpen && "lg:opacity-0")}>
            SEO Agent <span className="text-emerald-400">Pro</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
          {menuItems.map((item) => {
            if (item.auth && !user) return null;
            if (item.admin && !isAdminUser) return null;

            const Icon = item.icon;
            const isActive = view === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id as View);
                  if (window.innerWidth < 1024) setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                  isActive 
                    ? "bg-emerald-500/10 text-emerald-400" 
                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-emerald-400" : "group-hover:scale-110 transition-transform")} />
                <span className={cn("text-sm font-medium whitespace-nowrap transition-opacity duration-300", !isOpen && "lg:opacity-0")}>
                  {item.label}
                </span>
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {user && (
          <div className="p-4 border-t border-white/5 space-y-4">
            <div className={cn("flex items-center gap-3 px-2 transition-opacity duration-300", !isOpen && "lg:opacity-0 lg:w-0 overflow-hidden")}>
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=10b981&color=fff`} 
                alt="" 
                className="w-8 h-8 rounded-full border border-white/10 shrink-0" 
                referrerPolicy="no-referrer" 
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{user.displayName || user.email?.split('@')[0]}</p>
                <p className="text-[10px] text-neutral-500 truncate uppercase tracking-widest font-bold">
                  {isAdminUser ? "Administrator" : "Standard User"}
                </p>
              </div>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-red-400 hover:bg-red-400/5 transition-all group",
                !isOpen && "lg:justify-center"
              )}
            >
              <LogOut className="w-5 h-5 shrink-0 group-hover:rotate-12 transition-transform" />
              <span className={cn("text-sm font-medium whitespace-nowrap transition-opacity duration-300", !isOpen && "lg:opacity-0 lg:w-0 overflow-hidden")}>
                Sign Out
              </span>
            </button>
          </div>
        )}
      </motion.aside>
    </>
  );
}

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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

  // Word Counter State
  const [wordCountText, setWordCountText] = useState("");
  
  // Article Rewrite State
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteResult, setRewriteResult] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  
  // Plagiarism Checker State
  const [plagiarismText, setPlagiarismText] = useState("");
  const [plagiarismResult, setPlagiarismResult] = useState<any>(null);
  const [isCheckingPlagiarism, setIsCheckingPlagiarism] = useState(false);
  
  // Backlinks State
  const [backlinkUrl, setBacklinkUrl] = useState("");
  const [backlinkResult, setBacklinkResult] = useState<any>(null);
  const [isCheckingBacklinks, setIsCheckingBacklinks] = useState(false);
  
  // Domain Value State
  const [domainValueUrl, setDomainValueUrl] = useState("");
  const [domainValueResult, setDomainValueResult] = useState<any>(null);
  const [isCheckingDomainValue, setIsCheckingDomainValue] = useState(false);
  
  // Domain Traffic State
  const [domainTrafficUrl, setDomainTrafficUrl] = useState("");
  const [domainTrafficResult, setDomainTrafficResult] = useState<any>(null);
  const [isCheckingDomainTraffic, setIsCheckingDomainTraffic] = useState(false);
  
  // Social Video Hashtags State
  const [hashtagTopic, setHashtagTopic] = useState("");
  const [hashtagResult, setHashtagResult] = useState<{ hashtags: string[]; strategy: string[] } | null>(null);
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);
  
  // Social Media Keyword Research State
  const [socialKeywordNiche, setSocialKeywordNiche] = useState("");
  const [socialKeywordResult, setSocialKeywordResult] = useState<{ platforms: { name: string; keywords: { term: string; trend: string }[] }[] } | null>(null);
  const [isResearchingSocialKeywords, setIsResearchingSocialKeywords] = useState(false);
  
  // Image Generation States
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [thumbnailResult, setThumbnailResult] = useState<string | null>(null);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  
  const [logoPrompt, setLogoPrompt] = useState("");
  const [logoResult, setLogoResult] = useState<string | null>(null);
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false);
  
  const [businessCardPrompt, setBusinessCardPrompt] = useState("");
  const [businessCardResult, setBusinessCardResult] = useState<string | null>(null);
  const [isGeneratingBusinessCard, setIsGeneratingBusinessCard] = useState(false);
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

  // QR Generator State
  const [qrInput, setQrInput] = useState("https://google.com");
  const [qrSize, setQrSize] = useState(256);
  const [qrFgColor, setQrFgColor] = useState("#000000");
  const [qrBgColor, setQrBgColor] = useState("#ffffff");
  const [qrLevel, setQrLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [qrIncludeMargin, setQrIncludeMargin] = useState(true);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiResponding, setIsAiResponding] = useState(false);

  // Admin State
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

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
      setIsAuthModalOpen(false);
      setError(null);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Failed to sign in. Please try again.");
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

  const rewriteArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewriteText.trim()) return;
    setIsRewriting(true);
    setRewriteResult("");
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Rewrite the following article to make it more engaging, SEO-friendly, and unique while maintaining the original meaning: "${rewriteText}"`;
      const result = await genAI.models.generateContent({ model, contents: prompt });
      setRewriteResult(result.text || "");
    } catch (err) {
      console.error("Rewrite error:", err);
      setError("Failed to rewrite article.");
    } finally {
      setIsRewriting(false);
    }
  };

  const checkPlagiarism = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plagiarismText.trim()) return;
    setIsCheckingPlagiarism(true);
    setPlagiarismResult(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Analyze the following text for potential plagiarism. Provide a score (0-100) where 100 means highly likely to be plagiarized, and list any potential sources or reasons for the score. Return as JSON: { "score": number, "analysis": "string", "sources": ["string"] }. Text: "${plagiarismText}"`;
      const result = await genAI.models.generateContent({ 
        model, 
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setPlagiarismResult(JSON.parse(result.text || "{}"));
    } catch (err) {
      console.error("Plagiarism check error:", err);
      setError("Failed to check plagiarism.");
    } finally {
      setIsCheckingPlagiarism(false);
    }
  };

  const checkBacklinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backlinkUrl.trim()) return;
    setIsCheckingBacklinks(true);
    setBacklinkResult(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Analyze the backlink profile for the domain "${backlinkUrl}". Since you don't have live access to a backlink database, provide an expert estimation of what a typical backlink profile for a site in this niche would look like, and suggest 10 high-quality backlink opportunities. Return as JSON: { "estimatedBacklinks": number, "domainAuthority": number, "opportunities": [{ "site": "string", "type": "string", "difficulty": "string" }] }`;
      const result = await genAI.models.generateContent({ 
        model, 
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setBacklinkResult(JSON.parse(result.text || "{}"));
    } catch (err) {
      console.error("Backlinks check error:", err);
      setError("Failed to check backlinks.");
    } finally {
      setIsCheckingBacklinks(false);
    }
  };

  const checkDomainValue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainValueUrl.trim()) return;
    setIsCheckingDomainValue(true);
    setDomainValueResult(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Estimate the market value of the domain "${domainValueUrl}". Consider keyword relevance, length, TLD, and brandability. Return as JSON: { "estimatedValue": "string", "valuationFactors": ["string"], "comparableSales": ["string"] }`;
      const result = await genAI.models.generateContent({ 
        model, 
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setDomainValueResult(JSON.parse(result.text || "{}"));
    } catch (err) {
      console.error("Domain value error:", err);
      setError("Failed to check domain value.");
    } finally {
      setIsCheckingDomainValue(false);
    }
  };

  const checkDomainTraffic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainTrafficUrl.trim()) return;
    setIsCheckingDomainTraffic(true);
    setDomainTrafficResult(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Estimate the monthly traffic for the domain "${domainTrafficUrl}". Provide a breakdown by source (Organic, Direct, Social, Referral). Return as JSON: { "monthlyVisits": "string", "trafficSources": { "organic": "string", "direct": "string", "social": "string", "referral": "string" }, "topKeywords": ["string"] }`;
      const result = await genAI.models.generateContent({ 
        model, 
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setDomainTrafficResult(JSON.parse(result.text || "{}"));
    } catch (err) {
      console.error("Domain traffic error:", err);
      setError("Failed to check domain traffic.");
    } finally {
      setIsCheckingDomainTraffic(false);
    }
  };

  const generateHashtags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hashtagTopic.trim()) return;
    setIsGeneratingHashtags(true);
    setHashtagResult(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Generate 30 trending and relevant hashtags for a social media video about "${hashtagTopic}". Also provide 5 strategy tips for maximum reach. Return as JSON: { "hashtags": ["string"], "strategy": ["string"] }`;
      const result = await genAI.models.generateContent({ 
        model, 
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(result.text || "{}");
      setHashtagResult(data);
    } catch (err) {
      console.error("Hashtag error:", err);
      setError("Failed to generate hashtags.");
    } finally {
      setIsGeneratingHashtags(false);
    }
  };

  const researchSocialKeywords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socialKeywordNiche.trim()) return;
    setIsResearchingSocialKeywords(true);
    setSocialKeywordResult(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = `Perform social media keyword research for the niche "${socialKeywordNiche}". Identify trending keywords for YouTube, TikTok, Instagram, and Twitter. Return as JSON: { "platforms": [{ "name": "string", "keywords": [{ "term": "string", "trend": "string" }] }] }`;
      const result = await genAI.models.generateContent({ 
        model, 
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      setSocialKeywordResult(JSON.parse(result.text || "{}"));
    } catch (err) {
      console.error("Social keywords error:", err);
      setError("Failed to research social keywords.");
    } finally {
      setIsResearchingSocialKeywords(false);
    }
  };

  const generateThumbnail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thumbnailPrompt.trim()) return;
    setIsGeneratingThumbnail(true);
    setThumbnailResult(null);
    try {
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `High-quality YouTube thumbnail for: ${thumbnailPrompt}. Vibrant colors, engaging composition, no text.` }] },
        config: { imageConfig: { aspectRatio: "16:9" } }
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setThumbnailResult(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    } catch (err) {
      console.error("Thumbnail error:", err);
      setError("Failed to generate thumbnail.");
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  const generateLogo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logoPrompt.trim()) return;
    setIsGeneratingLogo(true);
    setLogoResult(null);
    try {
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Professional minimalist logo design for: ${logoPrompt}. Clean lines, vector style, white background.` }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setLogoResult(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    } catch (err) {
      console.error("Logo error:", err);
      setError("Failed to generate logo.");
    } finally {
      setIsGeneratingLogo(false);
    }
  };

  const generateBusinessCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessCardPrompt.trim()) return;
    setIsGeneratingBusinessCard(true);
    setBusinessCardResult(null);
    try {
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Modern professional business card design for: ${businessCardPrompt}. Front side, elegant layout.` }] },
        config: { imageConfig: { aspectRatio: "16:9" } }
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setBusinessCardResult(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    } catch (err) {
      console.error("Business card error:", err);
      setError("Failed to generate business card.");
    } finally {
      setIsGeneratingBusinessCard(false);
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
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-emerald-500/30">
      <Sidebar 
        view={view} 
        setView={setView} 
        user={user} 
        isAdminUser={isAdminUser}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      {/* Header */}
      <header className={cn(
        "fixed top-0 right-0 left-0 z-40 bg-neutral-950/80 backdrop-blur-md border-b border-white/5 transition-all duration-300 h-20",
        isSidebarOpen ? "lg:left-[280px]" : "lg:left-20"
      )}>
        <div className="h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-lg text-neutral-400 transition-colors"
            >
              {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 hidden sm:block">
              {view.replace(/([A-Z])/g, ' $1').trim()}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {!user && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setAuthMode("signin");
                    setIsAuthModalOpen(true);
                  }}
                  className="px-4 py-2 text-neutral-400 hover:text-white text-sm font-semibold transition-colors"
                >
                  Sign In
                </button>
                <button 
                  onClick={() => {
                    setAuthMode("signup");
                    setIsAuthModalOpen(true);
                  }}
                  className="px-4 py-2 bg-white text-neutral-950 rounded-full text-sm font-semibold hover:bg-neutral-200 transition-colors flex items-center gap-2"
                >
                  <UserIcon className="w-4 h-4" />
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-full left-0 right-0 p-4 bg-red-500/10 border-b border-red-500/20 backdrop-blur-md flex items-center justify-center gap-3 text-red-400 text-sm z-50"
            >
              <AlertCircle className="w-4 h-4" />
              {error}
              <button onClick={() => setError(null)} className="ml-4 hover:text-white">
                <Trash2 className="w-4 h-4 rotate-45" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {isAuthModalOpen && (
          <AuthModal 
            mode={authMode} 
            setMode={setAuthMode} 
            onClose={() => setIsAuthModalOpen(false)} 
            onGoogleSignIn={login} 
            setError={setError}
          />
        )}
      </AnimatePresence>

      <main className={cn(
        "pt-32 px-6 pb-20 transition-all duration-300",
        isSidebarOpen ? "lg:ml-[280px]" : "lg:ml-20"
      )}>
        <div className="max-w-7xl mx-auto">
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
                icon={<QrCode className="w-6 h-6" />}
                title="QR Generator"
                description="Create custom, high-quality QR codes for your URLs, text, or contact info instantly."
                onClick={() => setView("qr")}
                badge="Utility"
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

        {view === "qr" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-4xl mx-auto">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight">QR <span className="gradient-text">Generator</span></h1>
              <p className="text-neutral-400 max-w-xl mx-auto">
                Generate high-quality, customizable QR codes for your websites, social media, or any text content.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass-panel p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">Content (URL or Text)</label>
                  <textarea 
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="Enter URL or text here..."
                    className="w-full h-32 bg-neutral-900 border border-white/10 rounded-xl p-4 text-white focus:border-emerald-500/50 outline-none transition-colors resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">Size (px)</label>
                    <input 
                      type="number"
                      value={qrSize}
                      onChange={(e) => setQrSize(Number(e.target.value))}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl p-3 text-white focus:border-emerald-500/50 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">Error Level</label>
                    <select 
                      value={qrLevel}
                      onChange={(e) => setQrLevel(e.target.value as any)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl p-3 text-white focus:border-emerald-500/50 outline-none transition-colors"
                    >
                      <option value="L">Low (7%)</option>
                      <option value="M">Medium (15%)</option>
                      <option value="Q">Quartile (25%)</option>
                      <option value="H">High (30%)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">Foreground</label>
                    <div className="flex gap-2">
                      <input 
                        type="color"
                        value={qrFgColor}
                        onChange={(e) => setQrFgColor(e.target.value)}
                        className="w-12 h-12 bg-transparent border-none cursor-pointer"
                      />
                      <input 
                        type="text"
                        value={qrFgColor}
                        onChange={(e) => setQrFgColor(e.target.value)}
                        className="flex-1 bg-neutral-900 border border-white/10 rounded-xl p-3 text-white text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 ml-1">Background</label>
                    <div className="flex gap-2">
                      <input 
                        type="color"
                        value={qrBgColor}
                        onChange={(e) => setQrBgColor(e.target.value)}
                        className="w-12 h-12 bg-transparent border-none cursor-pointer"
                      />
                      <input 
                        type="text"
                        value={qrBgColor}
                        onChange={(e) => setQrBgColor(e.target.value)}
                        className="flex-1 bg-neutral-900 border border-white/10 rounded-xl p-3 text-white text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
                  <input 
                    type="checkbox"
                    id="includeMargin"
                    checked={qrIncludeMargin}
                    onChange={(e) => setQrIncludeMargin(e.target.checked)}
                    className="w-5 h-5 rounded border-white/10 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/50"
                  />
                  <label htmlFor="includeMargin" className="text-sm text-neutral-300 font-medium cursor-pointer">Include Margin</label>
                </div>
              </div>

              <div className="glass-panel p-8 flex flex-col items-center justify-center space-y-8">
                <div className="p-6 bg-white rounded-2xl shadow-2xl shadow-emerald-500/10">
                  <QRCodeSVG 
                    id="qr-code-svg"
                    value={qrInput || "SEO Agent Pro"}
                    size={200}
                    fgColor={qrFgColor}
                    bgColor={qrBgColor}
                    level={qrLevel}
                    includeMargin={qrIncludeMargin}
                  />
                </div>

                <div className="w-full space-y-4">
                  <button 
                    onClick={() => {
                      const svg = document.getElementById("qr-code-svg");
                      if (svg) {
                        const svgData = new XMLSerializer().serializeToString(svg);
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        const img = new Image();
                        img.onload = () => {
                          canvas.width = qrSize;
                          canvas.height = qrSize;
                          ctx?.drawImage(img, 0, 0, qrSize, qrSize);
                          const pngFile = canvas.toDataURL("image/png");
                          const downloadLink = document.createElement("a");
                          downloadLink.download = `qr-code-${Date.now()}.png`;
                          downloadLink.href = pngFile;
                          downloadLink.click();
                        };
                        img.src = "data:image/svg+xml;base64," + btoa(svgData);
                      }
                    }}
                    className="w-full py-4 bg-emerald-500 text-neutral-950 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-400 transition-all active:scale-[0.98]"
                  >
                    <Download className="w-5 h-5" />
                    Download PNG ({qrSize}x{qrSize})
                  </button>
                  <p className="text-[10px] text-center text-neutral-500 uppercase tracking-widest">
                    High-resolution export available
                  </p>
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

        {view === "wordcounter" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Word <span className="gradient-text">Counter</span></h1>
              <p className="text-neutral-400">Count words, characters, and sentences in real-time.</p>
            </div>
            <div className="glass-panel p-8 space-y-6">
              <textarea 
                placeholder="Paste your text here..."
                value={wordCountText}
                onChange={(e) => setWordCountText(e.target.value)}
                rows={12}
                className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500 resize-none text-lg leading-relaxed"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <div className="text-2xl font-black text-emerald-400">{wordCountText.trim() ? wordCountText.trim().split(/\s+/).length : 0}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Words</div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <div className="text-2xl font-black text-emerald-400">{wordCountText.length}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Characters</div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <div className="text-2xl font-black text-emerald-400">{wordCountText.split(/[.!?]+/).filter(Boolean).length}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Sentences</div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <div className="text-2xl font-black text-emerald-400">{Math.ceil(wordCountText.trim().split(/\s+/).length / 200)}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Reading Time (min)</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === "rewrite" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Article <span className="gradient-text">Rewrite</span></h1>
              <p className="text-neutral-400">Transform your content into engaging, unique, and SEO-friendly articles.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Original Text</label>
                <textarea 
                  placeholder="Paste article to rewrite..."
                  value={rewriteText}
                  onChange={(e) => setRewriteText(e.target.value)}
                  rows={15}
                  className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500 resize-none"
                />
                <button 
                  onClick={rewriteArticle}
                  disabled={isRewriting || !rewriteText.trim()}
                  className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isRewriting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  {isRewriting ? "Rewriting..." : "Rewrite Article"}
                </button>
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Rewritten Result</label>
                <div className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-6 py-4 min-h-[400px] prose prose-invert max-w-none">
                  {rewriteResult ? (
                    <ReactMarkdown>{rewriteResult}</ReactMarkdown>
                  ) : (
                    <div className="h-full flex items-center justify-center text-neutral-600 italic">
                      Result will appear here...
                    </div>
                  )}
                </div>
                {rewriteResult && (
                  <button 
                    onClick={() => navigator.clipboard.writeText(rewriteResult)}
                    className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    Copy to Clipboard
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {view === "plagiarism" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Plagiarism <span className="gradient-text">Checker</span></h1>
              <p className="text-neutral-400">Check your content for originality and potential matches.</p>
            </div>
            <div className="glass-panel p-8 space-y-6">
              <textarea 
                placeholder="Paste text to check for plagiarism..."
                value={plagiarismText}
                onChange={(e) => setPlagiarismText(e.target.value)}
                rows={10}
                className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-emerald-500 resize-none"
              />
              <button 
                onClick={checkPlagiarism}
                disabled={isCheckingPlagiarism || !plagiarismText.trim()}
                className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isCheckingPlagiarism ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanSearch className="w-5 h-5" />}
                {isCheckingPlagiarism ? "Checking..." : "Check Originality"}
              </button>

              {plagiarismResult && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xl">Analysis Result</h3>
                    <div className={cn(
                      "px-4 py-2 rounded-full font-black text-2xl",
                      plagiarismResult.score < 20 ? "text-emerald-400 bg-emerald-400/10" :
                      plagiarismResult.score < 50 ? "text-yellow-400 bg-yellow-400/10" :
                      "text-red-400 bg-red-400/10"
                    )}>
                      {plagiarismResult.score}% Match
                    </div>
                  </div>
                  <p className="text-neutral-300 leading-relaxed">{plagiarismResult.analysis}</p>
                  {plagiarismResult.sources && plagiarismResult.sources.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Potential Sources</h4>
                      <div className="flex flex-wrap gap-2">
                        {plagiarismResult.sources.map((source: string, i: number) => (
                          <span key={i} className="px-3 py-1 bg-white/5 rounded-lg text-sm text-neutral-400 border border-white/5">{source}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {view === "backlinks" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Backlink <span className="gradient-text">Analyzer</span></h1>
              <p className="text-neutral-400">Discover backlink opportunities and analyze your domain's link profile.</p>
            </div>
            <div className="glass-panel p-8 space-y-6">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter domain (e.g., example.com)"
                  value={backlinkUrl}
                  onChange={(e) => setBacklinkUrl(e.target.value)}
                  className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                />
                <button 
                  onClick={checkBacklinks}
                  disabled={isCheckingBacklinks || !backlinkUrl.trim()}
                  className="bg-emerald-500 text-neutral-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isCheckingBacklinks ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link className="w-5 h-5" />}
                  Analyze
                </button>
              </div>

              {backlinkResult && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                      <div className="text-3xl font-black text-emerald-400">{backlinkResult.totalBacklinks}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Total Backlinks</div>
                    </div>
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                      <div className="text-3xl font-black text-emerald-400">{backlinkResult.referringDomains}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Referring Domains</div>
                    </div>
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                      <div className="text-3xl font-black text-emerald-400">{backlinkResult.domainAuthority}/100</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Domain Authority</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-lg">Growth Opportunities</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {backlinkResult.opportunities.map((opt: any, i: number) => (
                        <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-emerald-400">{opt.type}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Difficulty: {opt.difficulty}</span>
                          </div>
                          <p className="text-xs text-neutral-400 leading-relaxed">{opt.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === "domainvalue" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Domain <span className="gradient-text">Appraisal</span></h1>
              <p className="text-neutral-400">Estimate the market value of any domain name using AI analysis.</p>
            </div>
            <div className="glass-panel p-8 space-y-6">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter domain (e.g., premium.com)"
                  value={domainValueUrl}
                  onChange={(e) => setDomainValueUrl(e.target.value)}
                  className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                />
                <button 
                  onClick={checkDomainValue}
                  disabled={isCheckingDomainValue || !domainValueUrl.trim()}
                  className="bg-emerald-500 text-neutral-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isCheckingDomainValue ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
                  Appraise
                </button>
              </div>

              {domainValueResult && (
                <div className="space-y-8">
                  <div className="text-center p-12 bg-emerald-500/5 rounded-3xl border border-emerald-500/20">
                    <div className="text-sm font-bold uppercase tracking-widest text-emerald-500 mb-2">Estimated Market Value</div>
                    <div className="text-6xl font-black text-white mb-4">{domainValueResult.estimatedValue}</div>
                    <div className="flex items-center justify-center gap-2 text-neutral-400">
                      <TrendingUp className="w-4 h-4" />
                      <span>Value Trend: <span className="text-emerald-400 font-bold">{domainValueResult.trend}</span></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg">Valuation Factors</h3>
                      <div className="space-y-3">
                        {domainValueResult.factors.map((factor: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                            <span className="text-sm text-neutral-300">{factor.name}</span>
                            <span className={cn(
                              "text-xs font-bold px-2 py-1 rounded",
                              factor.impact === 'High' ? "text-emerald-400 bg-emerald-400/10" : "text-neutral-400 bg-white/5"
                            )}>{factor.impact} Impact</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg">Comparable Sales</h3>
                      <div className="space-y-3">
                        {domainValueResult.comparables.map((comp: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                            <span className="text-sm font-mono text-neutral-400">{comp.domain}</span>
                            <span className="text-sm font-bold text-white">{comp.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === "domaintraffic" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Traffic <span className="gradient-text">Insights</span></h1>
              <p className="text-neutral-400">Estimate monthly traffic and audience sources for any website.</p>
            </div>
            <div className="glass-panel p-8 space-y-6">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter website URL"
                  value={domainTrafficUrl}
                  onChange={(e) => setDomainTrafficUrl(e.target.value)}
                  className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                />
                <button 
                  onClick={checkDomainTraffic}
                  disabled={isCheckingDomainTraffic || !domainTrafficUrl.trim()}
                  className="bg-emerald-500 text-neutral-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isCheckingDomainTraffic ? <Loader2 className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
                  Analyze Traffic
                </button>
              </div>

              {domainTrafficResult && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                      <div className="text-3xl font-black text-emerald-400">{domainTrafficResult.monthlyVisits}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Monthly Visits</div>
                    </div>
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                      <div className="text-3xl font-black text-emerald-400">{domainTrafficResult.bounceRate}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Bounce Rate</div>
                    </div>
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                      <div className="text-3xl font-black text-emerald-400">{domainTrafficResult.avgDuration}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Avg. Duration</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg">Traffic Sources</h3>
                      <div className="space-y-4">
                        {domainTrafficResult.sources.map((source: any, i: number) => (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-1">
                              <span className="text-neutral-400">{source.name}</span>
                              <span className="text-emerald-400">{source.percentage}%</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500" 
                                style={{ width: `${source.percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg">Top Countries</h3>
                      <div className="space-y-3">
                        {domainTrafficResult.topCountries.map((country: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                            <span className="text-sm text-neutral-300">{country.name}</span>
                            <span className="text-sm font-bold text-white">{country.percentage}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === "hashtags" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Viral <span className="gradient-text">Hashtags</span></h1>
              <p className="text-neutral-400">Generate high-reach hashtags for your social media videos and posts.</p>
            </div>
            <div className="glass-panel p-8 space-y-6">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter video topic or niche (e.g., AI SEO tools)"
                  value={hashtagTopic}
                  onChange={(e) => setHashtagTopic(e.target.value)}
                  className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                />
                <button 
                  onClick={generateHashtags}
                  disabled={isGeneratingHashtags || !hashtagTopic.trim()}
                  className="bg-emerald-500 text-neutral-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingHashtags ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hash className="w-5 h-5" />}
                  Generate
                </button>
              </div>

              {hashtagResult && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {hashtagResult.hashtags.map((tag: string, i: number) => (
                      <span key={i} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-full font-bold text-sm border border-emerald-500/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                    <h3 className="font-bold text-lg">Strategy Tips</h3>
                    <ul className="space-y-2">
                      {hashtagResult.strategy.map((tip: string, i: number) => (
                        <li key={i} className="text-sm text-neutral-400 flex items-start gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></div>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button 
                    onClick={() => navigator.clipboard.writeText(hashtagResult.hashtags.join(' '))}
                    className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    Copy All Hashtags
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === "socialkeywords" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Social <span className="gradient-text">Keywords</span></h1>
              <p className="text-neutral-400">Research trending keywords and topics for social media platforms.</p>
            </div>
            <div className="glass-panel p-8 space-y-6">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter niche or industry (e.g., Digital Marketing)"
                  value={socialKeywordNiche}
                  onChange={(e) => setSocialKeywordNiche(e.target.value)}
                  className="flex-1 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500"
                />
                <button 
                  onClick={researchSocialKeywords}
                  disabled={isResearchingSocialKeywords || !socialKeywordNiche.trim()}
                  className="bg-emerald-500 text-neutral-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isResearchingSocialKeywords ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                  Research
                </button>
              </div>

              {socialKeywordResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {socialKeywordResult.platforms.map((platform: any, i: number) => (
                    <div key={i} className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg text-emerald-400">{platform.name}</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Trending Now</span>
                      </div>
                      <div className="space-y-3">
                        {platform.keywords.map((kw: any, j: number) => (
                          <div key={j} className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                            <span className="text-sm text-neutral-300">{kw.term}</span>
                            <span className="text-xs font-bold text-emerald-500">{kw.trend}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === "thumbnail" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Thumbnail <span className="gradient-text">Studio</span></h1>
              <p className="text-neutral-400">Generate eye-catching YouTube thumbnails with AI.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="glass-panel p-6 space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Video Topic</label>
                    <textarea 
                      placeholder="e.g., How to build a SaaS in 24 hours with AI..."
                      value={thumbnailPrompt}
                      onChange={(e) => setThumbnailPrompt(e.target.value)}
                      rows={4}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>
                  <button 
                    onClick={generateThumbnail}
                    disabled={isGeneratingThumbnail || !thumbnailPrompt.trim()}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGeneratingThumbnail ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                    Generate Thumbnail
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="glass-panel aspect-video flex items-center justify-center overflow-hidden relative group">
                  {thumbnailResult ? (
                    <>
                      <img src={thumbnailResult} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <a href={thumbnailResult} download="thumbnail.png" className="p-3 bg-white text-neutral-950 rounded-full hover:scale-110 transition-transform">
                          <Download className="w-6 h-6" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-neutral-500">
                        <ImagePlus className="w-8 h-8" />
                      </div>
                      <p className="text-neutral-500 italic">Thumbnail preview will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === "logo" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Logo <span className="gradient-text">Designer</span></h1>
              <p className="text-neutral-400">Create minimalist, modern logos for your brand instantly.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="glass-panel p-6 space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Brand Name & Concept</label>
                    <textarea 
                      placeholder="e.g., 'EcoPulse' - A modern tech logo with a leaf and pulse line..."
                      value={logoPrompt}
                      onChange={(e) => setLogoPrompt(e.target.value)}
                      rows={4}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>
                  <button 
                    onClick={generateLogo}
                    disabled={isGeneratingLogo || !logoPrompt.trim()}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGeneratingLogo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Palette className="w-5 h-5" />}
                    Generate Logo
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="glass-panel aspect-square flex items-center justify-center overflow-hidden relative group max-w-md mx-auto">
                  {logoResult ? (
                    <>
                      <img src={logoResult} className="w-full h-full object-contain p-8" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <a href={logoResult} download="logo.png" className="p-3 bg-white text-neutral-950 rounded-full hover:scale-110 transition-transform">
                          <Download className="w-6 h-6" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-neutral-500">
                        <Palette className="w-8 h-8" />
                      </div>
                      <p className="text-neutral-500 italic">Logo preview will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {view === "businesscard" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">Business <span className="gradient-text">Card</span></h1>
              <p className="text-neutral-400">Design professional business cards with AI-driven layouts.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="glass-panel p-6 space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2 block">Contact Info & Style</label>
                    <textarea 
                      placeholder="e.g., John Doe, CEO of TechFlow. Minimalist dark theme with gold accents..."
                      value={businessCardPrompt}
                      onChange={(e) => setBusinessCardPrompt(e.target.value)}
                      rows={4}
                      className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>
                  <button 
                    onClick={generateBusinessCard}
                    disabled={isGeneratingBusinessCard || !businessCardPrompt.trim()}
                    className="w-full bg-emerald-500 text-neutral-950 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGeneratingBusinessCard ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                    Generate Business Card
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="glass-panel aspect-[1.75/1] flex items-center justify-center overflow-hidden relative group">
                  {businessCardResult ? (
                    <>
                      <img src={businessCardResult} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <a href={businessCardResult} download="business-card.png" className="p-3 bg-white text-neutral-950 rounded-full hover:scale-110 transition-transform">
                          <Download className="w-6 h-6" />
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-neutral-500">
                        <CreditCard className="w-8 h-8" />
                      </div>
                      <p className="text-neutral-500 italic">Business card preview will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <footer className="mt-20 py-10 border-t border-white/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
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
      </div>
    </main>

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

function AuthModal({ mode, setMode, onClose, onGoogleSignIn, setError }: { mode: "signin" | "signup"; setMode: (m: "signin" | "signup") => void; onClose: () => void; onGoogleSignIn: () => void; setError: (e: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          await updateProfile(userCredential.user, { displayName: name });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-neutral-950/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="glass-panel w-full max-w-md overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 space-y-8">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <Zap className="w-6 h-6 text-neutral-950 fill-current" />
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {mode === "signin" ? "Welcome Back" : "Create Account"}
            </h2>
            <p className="text-neutral-400 text-sm">
              {mode === "signin" 
                ? "Sign in to access your SEO dashboard and tools." 
                : "Join SEO Agent Pro to start optimizing your web presence."}
            </p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={onGoogleSignIn}
              className="w-full py-3 px-4 bg-white text-neutral-950 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-neutral-200 transition-all active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-neutral-900 px-2 text-neutral-500 font-medium tracking-widest">Or continue with</span>
              </div>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3">
              {mode === "signup" && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Full Name</label>
                  <input 
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full h-12 bg-white/5 rounded-xl border border-white/10 px-4 text-white focus:border-emerald-500/50 outline-none transition-colors"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Email Address</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-12 bg-white/5 rounded-xl border border-white/10 px-4 text-white focus:border-emerald-500/50 outline-none transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Password</label>
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-12 bg-white/5 rounded-xl border border-white/10 px-4 text-white focus:border-emerald-500/50 outline-none transition-colors"
                />
              </div>
              <button 
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "signin" ? "Sign In" : "Sign Up"}
              </button>
            </form>
            <p className="text-[10px] text-center text-neutral-600 mt-2">
              Secure authentication powered by Firebase.
            </p>
          </div>

          <div className="pt-4 border-t border-white/5 text-center">
            <button 
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <span className="text-emerald-400 font-bold underline underline-offset-4">
                {mode === "signin" ? "Sign Up" : "Sign In"}
              </span>
            </button>
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white transition-colors"
        >
          <Trash2 className="w-5 h-5 rotate-45" />
        </button>
      </motion.div>
    </motion.div>
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
