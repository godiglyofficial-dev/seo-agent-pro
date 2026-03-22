import express from "express";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
const PORT = 3000;

app.use(express.json());

// API route for auditing a URL
app.post("/api/audit", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 10000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract basic SEO data
    const auditData = {
      title: $("title").text() || "Missing",
      description: $('meta[name="description"]').attr("content") || "Missing",
      h1: $("h1").map((i, el) => $(el).text()).get(),
      h2: $("h2").map((i, el) => $(el).text()).get(),
      links: $("a").length,
      images: $("img").length,
      imagesWithoutAlt: $("img:not([alt])").length,
      canonical: $('link[rel="canonical"]').attr("href") || "Missing",
      ogTitle: $('meta[property="og:title"]').attr("content") || "Missing",
      ogDescription: $('meta[property="og:description"]').attr("content") || "Missing",
      // Extract some text content for AI analysis (first 2000 chars)
      textContent: $("body").text().replace(/\s+/g, " ").trim().substring(0, 3000),
    };

    res.json(auditData);
  } catch (error: any) {
    console.error("Audit error:", error.message);
    res.status(500).json({ error: "Failed to crawl the URL. It might be blocking requests or invalid." });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const setupVite = async () => {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  };
  setupVite();
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Only listen if not running as a serverless function (Vercel)
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
