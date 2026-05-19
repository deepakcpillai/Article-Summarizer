# Article Summarizer Browser Extension

This is a small Chrome/Edge extension that summarizes the article in the active browser tab.

## What it does

- Adds a toolbar button with a popup.
- Extracts readable article text from the current page.
- Sends that text to the OpenAI Responses API.
- Shows the summary directly in the popup.
- Lets you choose brief, detailed, bullet, or plain-English summaries.
- Generates fuller first-pass summaries, then expands a generated summary to roughly double its word count on request.

## Load it in Chrome or Edge

### If you downloaded the project as a ZIP

1. Download the repository ZIP from GitHub.
2. Unzip it somewhere on your computer.
3. Open `chrome://extensions` or `edge://extensions`.
4. Turn on Developer mode.
5. Choose **Load unpacked**.
6. Select the unzipped project folder.
7. Open the extension settings and save your OpenAI API key.
8. Visit an article, click the extension, then choose **Summarize Page**.

### If you cloned it with Git

```sh
git clone https://github.com/YOUR-USERNAME/article-summarizer-extension.git
cd article-summarizer-extension
```

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked**.
4. Select the cloned project folder.
5. Open the extension settings and save your OpenAI API key.
6. Visit an article, click the extension, then choose **Summarize Page**.

## Developer notes

This extension has no build step. The source files in the repository are the files Chrome loads directly.

Useful checks:

```sh
node --check popup.js
node --check options.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
```

## Publish options

- For friends or testers, sharing the GitHub repo is enough. They can clone or download the ZIP and load it unpacked.
- For a polished public release, package and submit it through the Chrome Web Store.

## Notes

This MVP stores the API key in your browser profile and calls OpenAI directly from the extension. That is good enough for personal testing. For a public release, add a small backend service so users never put a provider API key directly into the extension.

The default model is `gpt-5.4-mini`, which is intended to keep summaries responsive and cost-conscious. You can change the model in settings.
