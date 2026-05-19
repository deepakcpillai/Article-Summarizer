const shortSummaryButton = document.querySelector("#shortSummaryButton");
const longSummaryButton = document.querySelector("#longSummaryButton");
const settingsButton = document.querySelector("#settingsButton");
const openSettingsButton = document.querySelector("#openSettingsButton");
const expandSummaryButton = document.querySelector("#expandSummaryButton");
const summaryStyle = document.querySelector("#summaryStyle");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const sourceInfoEl = document.querySelector("#sourceInfo");
const pageTitleEl = document.querySelector("#pageTitle");

const SUMMARY_LENGTHS = {
  short: {
    brief: "Write a concise 4-6 sentence summary.",
    detailed: "Write a detailed summary with the main argument, context, and important evidence.",
    bullets: "Write 6-8 clear bullet points covering the most important ideas.",
    eli5: "Explain the article in plain English for a smart non-expert."
  },
  long: {
    brief: "Write a concise 6-9 sentence summary, about 1.5x longer than a short default summary.",
    detailed: "Write a detailed summary with the main argument, context, important evidence, and useful nuance. Make it about 1.5x longer than a standard detailed summary.",
    bullets: "Write 9-12 clear bullet points covering the most important ideas, about 1.5x more detail than a short bullet summary.",
    eli5: "Explain the article in plain English for a smart non-expert, about 1.5x longer than a short plain-English summary."
  }
};

let currentArticle = null;
let currentSummary = "";
let currentTabUrl = "";

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

openSettingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

expandSummaryButton.addEventListener("click", async () => {
  if (!currentArticle || !currentSummary) {
    setStatus("Summarize the page first, then expand it.", true);
    return;
  }

  setBusy(true, "expand");
  setStatus("Expanding summary...");

  try {
    const settings = await chrome.storage.local.get(["openaiApiKey", "openaiModel"]);
    if (!settings.openaiApiKey) {
      openSettingsButton.hidden = false;
      throw new Error("Add your OpenAI API key in Settings, then come back and expand this summary.");
    }

    const expandedSummary = await expandSummary({
      apiKey: settings.openaiApiKey,
      model: settings.openaiModel || "gpt-5.4-mini",
      title: currentArticle.title || "",
      url: currentTabUrl,
      text: currentArticle.text,
      summary: currentSummary,
      targetWordCount: Math.max(countWords(currentSummary) * 2, 120)
    });

    currentSummary = expandedSummary;
    summaryEl.textContent = expandedSummary;
    setStatus(`Expanded to about ${countWords(expandedSummary).toLocaleString()} words.`);
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    setBusy(false);
  }
});

shortSummaryButton.addEventListener("click", () => {
  summarizeCurrentPage("short");
});

longSummaryButton.addEventListener("click", () => {
  summarizeCurrentPage("long");
});

async function summarizeCurrentPage(length) {
  setBusy(true, length);
  setStatus("Reading the page...");
  openSettingsButton.hidden = true;
  expandSummaryButton.hidden = true;
  summaryEl.hidden = true;
  sourceInfoEl.hidden = true;
  currentArticle = null;
  currentSummary = "";
  currentTabUrl = "";

  try {
    const settings = await chrome.storage.local.get(["openaiApiKey", "openaiModel"]);
    if (!settings.openaiApiKey) {
      openSettingsButton.hidden = false;
      throw new Error("Add your OpenAI API key in Settings, then come back and summarize this page.");
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("I could not find the active tab.");
    }

    const [{ result: article }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractArticleText
    });

    if (!article?.text || article.text.length < 250) {
      throw new Error("This page does not look like it has enough article text to summarize.");
    }

    pageTitleEl.textContent = article.title || tab.title || "Current page";
    setStatus("Summarizing...");

    const summary = await summarizeArticle({
      apiKey: settings.openaiApiKey,
      model: settings.openaiModel || "gpt-5.4-mini",
      title: article.title || tab.title || "",
      url: tab.url || "",
      text: article.text,
      style: summaryStyle.value,
      length
    });

    currentArticle = article;
    currentSummary = summary;
    currentTabUrl = tab.url || "";
    summaryEl.textContent = summary;
    summaryEl.hidden = false;
    expandSummaryButton.hidden = false;
    sourceInfoEl.textContent = `Source text: ${article.wordCount.toLocaleString()} words extracted from this page.`;
    sourceInfoEl.hidden = false;
    setStatus("Done.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy, action = "summarize") {
  shortSummaryButton.disabled = isBusy;
  longSummaryButton.disabled = isBusy;
  expandSummaryButton.disabled = isBusy;
  shortSummaryButton.textContent = isBusy && action === "short" ? "Working..." : "Short Summary";
  longSummaryButton.textContent = isBusy && action === "long" ? "Working..." : "Long Summary";
  expandSummaryButton.textContent = isBusy && action === "expand" ? "Expanding..." : "Expand Summary 2x";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function summarizeArticle({ apiKey, model, title, url, text, style, length }) {
  const instructions = SUMMARY_LENGTHS[length] || SUMMARY_LENGTHS.short;

  return requestSummary({
    apiKey,
    model,
    prompt: [
      `Title: ${title || "Untitled"}`,
      `URL: ${url || "Unknown"}`,
      "",
      instructions[style] || instructions.brief,
      "Favor substance over padding. Include more useful detail, not repetition.",
      "",
      "Article text:",
      text.slice(0, 45000)
    ].join("\n")
  });
}

async function expandSummary({ apiKey, model, title, url, text, summary, targetWordCount }) {
  return requestSummary({
    apiKey,
    model,
    prompt: [
      `Title: ${title || "Untitled"}`,
      `URL: ${url || "Unknown"}`,
      "",
      `Expand the existing summary to about ${targetWordCount} words, roughly double its current length.`,
      "Add useful context, key details, and nuance from the article text.",
      "Keep the same neutral tone. Do not add facts that are not in the article.",
      "",
      "Existing summary:",
      summary,
      "",
      "Article text:",
      text.slice(0, 45000)
    ].join("\n")
  });
}

async function requestSummary({ apiKey, model, prompt }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You summarize web articles accurately and neutrally.",
        "Use only the article text provided by the user.",
        "Do not add facts that are not present in the source text."
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI request failed with status ${response.status}.`);
  }

  const directText = data.output_text;
  if (directText) {
    return directText.trim();
  }

  const textFromContent = data.output
    ?.flatMap((item) => item.content || [])
    ?.filter((part) => part.type === "output_text" && part.text)
    ?.map((part) => part.text)
    ?.join("\n")
    ?.trim();

  if (!textFromContent) {
    throw new Error("The summarizer returned an empty response.");
  }

  return textFromContent;
}

function countWords(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function extractArticleText() {
  const title = document.querySelector("meta[property='og:title']")?.content
    || document.querySelector("h1")?.innerText
    || document.title
    || "";

  const selectors = [
    "article",
    "main",
    "[role='main']",
    ".article",
    ".post",
    ".entry-content",
    ".story-body"
  ];

  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .concat([document.body])
    .filter(Boolean);

  const bestNode = candidates
    .map((node) => ({ node, text: readableTextFrom(node) }))
    .filter((candidate) => candidate.text.length > 0)
    .sort((a, b) => b.text.length - a.text.length)[0];

  const text = normalizeText(bestNode?.text || "");

  return {
    title: normalizeText(title),
    text,
    wordCount: text ? text.split(/\s+/).length : 0
  };

  function readableTextFrom(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll([
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "form",
      "nav",
      "footer",
      "aside",
      "button",
      "iframe",
      "[aria-hidden='true']"
    ].join(",")).forEach((node) => node.remove());

    const paragraphs = Array.from(clone.querySelectorAll("h1,h2,h3,p,li,blockquote"))
      .map((node) => normalizeText(node.innerText || node.textContent || ""))
      .filter((line) => line.length > 40);

    return paragraphs.length ? paragraphs.join("\n\n") : clone.innerText || clone.textContent || "";
  }

  function normalizeText(value) {
    return String(value)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
