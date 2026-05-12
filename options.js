const apiKeyInput = document.querySelector("#apiKey");
const modelInput = document.querySelector("#model");
const saveButton = document.querySelector("#saveButton");
const clearButton = document.querySelector("#clearButton");
const settingsStatus = document.querySelector("#settingsStatus");

chrome.storage.local.get(["openaiApiKey", "openaiModel"], (settings) => {
  apiKeyInput.value = settings.openaiApiKey || "";
  modelInput.value = settings.openaiModel || "gpt-5.4-mini";
});

saveButton.addEventListener("click", async () => {
  const openaiApiKey = apiKeyInput.value.trim();
  const openaiModel = modelInput.value.trim() || "gpt-5.4-mini";

  if (!openaiApiKey) {
    showStatus("Paste an API key before saving.", true);
    return;
  }

  await chrome.storage.local.set({ openaiApiKey, openaiModel });
  showStatus("Settings saved.");
});

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.remove(["openaiApiKey"]);
  apiKeyInput.value = "";
  showStatus("API key cleared.");
});

function showStatus(message, isError = false) {
  settingsStatus.textContent = message;
  settingsStatus.classList.toggle("error", isError);
}
