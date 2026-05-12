const summarizeButton = document.querySelector("#summarizeButton");
const settingsButton = document.querySelector("#settingsButton");
const openSettingsButton = document.querySelector("#openSettingsButton");
const summaryStyle = document.querySelector("#summaryStyle");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const sourceInfoEl = document.querySelector("#sourceInfo");
const pageTitleEl = document.querySelector("#pageTitle");

const STYLE_INSTRUCTIONS = {
  brief: "Write a concise 4-6 sentence summary.",
  detailed: "Write a detailed summary with the main argument, context, and important evidence.",
  bullets: "Write 6-8 clear bullet points covering the most important ideas.",
  eli5: "Explain the article in plain English for a smart non-expert."
};

settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

openSettingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

summarizeButton.addEventListener("click", async () => {
  setBusy(true);
  setStatus("Reading the page...");
  openSettingsButton.hidden = true;
  summaryEl.hidden = true;
  sourceInfoEl.hidden = true;

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
      style: summaryStyle.value
    });

    summaryEl.textContent = summary;
    summaryEl.hidden = false;
    sourceInfoEl.textContent = `Source text: ${article.wordCount.toLocaleString()} words extracted from this page.`;
    sourceInfoEl.hidden = false;
    setStatus("Done.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    setBusy(false);
  }
});

function setBusy(isBusy) {
  summarizeButton.disabled = isBusy;
  summarizeButton.textContent = isBusy ? "Working..." : "Summarize Page";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function summarizeArticle({ apiKey, model, title, url, text, style }) {
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
              text: [
                `Title: ${title || "Untitled"}`,
                `URL: ${url || "Unknown"}`,
                "",
                STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.brief,
                "",
                "Article text:",
                text.slice(0, 45000)
              ].join("\n")
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
