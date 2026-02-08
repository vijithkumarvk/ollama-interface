let sessionId = null;
let currentModel = "llama2";

// Initialize Lucide Icons
lucide.createIcons();

function toggleDropdown() {
  const menu = document.getElementById("actionMenu");
  menu.classList.toggle("active");
}

// Close dropdown when clicking outside
window.addEventListener("click", function (e) {
  const container = document.querySelector(".dropdown-container");
  const menu = document.getElementById("actionMenu");
  if (!container.contains(e.target)) {
    menu.classList.remove("active");
  }
});

// Helper for the checkbox menu item
function toggleToolsCheckbox() {
  const checkbox = document.getElementById("toolsToggle");
  checkbox.checked = !checkbox.checked;
  // Trigger your existing logic for tool toggling here
  const event = new Event("change");
  checkbox.dispatchEvent(event);
}

// THEME LOGIC
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);

  // Update UI buttons
  document
    .querySelectorAll(".theme-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`btn-${theme}`).classList.add("active");

  localStorage.setItem("pref-theme", theme);
}

// Initialize theme on load
const savedTheme = localStorage.getItem("pref-theme") || "system";
setTheme(savedTheme);

// MODAL LOGIC
function openSettings() {
  document.getElementById("settingsModal").style.display = "flex";
}
function closeSettings() {
  document.getElementById("settingsModal").style.display = "none";
}

// Configure marked.js for better rendering
if (typeof marked !== "undefined") {
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code, lang) {
      return code; // Syntax highlighting can be added later
    },
  });
}

// Initialize the application
async function init() {
  console.log("Initializing Private Agent...");

  try {

    // Initialize session
    const response = await fetch("/api/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: currentModel }),
    });

    const data = await response.json();
    console.log("Init response:", data);

    if (data.error) {
      updateStatus(false, data.error);
      console.error("Init error:", data.error);
      return;
    }
    // Load available models
    sessionId = data.sessionId;
    await loadModels();
    console.log("Session ID:", sessionId);
    updateStatus(true, "Connected");
  } catch (error) {
    updateStatus(false, "Connection failed");
    console.error("Init error:", error);
  }
}

// Load available models
let modelMetadata = {}; // Store model details globally

async function loadModels() {
  try {
    const response = await fetch("/api/models");
    const data = await response.json();

    const modelSelect = document.getElementById("modelSelect");
    modelSelect.innerHTML = "";
    currentModel = await this.getModelFromLocalStore() || '';
    if(data.models.every(m => m.name != currentModel) && data?.models?.length){
        currentModel = data.models[0].name;
    }

    data.models.forEach((model) => {
      // Store metadata (parameter size, quant, etc) for later use
      modelMetadata[model.name] = model;

      const option = document.createElement("option");
      option.value = model.name;
      // Apple style labels: Name • Size • Params
      const sizeGB = (model.size / 1e9).toFixed(1);
      const params = model.details.parameter_size || "N/A";
      option.textContent = `${model.name} • ${params} • ${sizeGB}GB`;
      modelSelect.appendChild(option);
    });

    modelSelect.value = currentModel;

    // Trigger context display update on model change
    modelSelect.addEventListener("change", async (e) => {
      currentModel = e.target.value;
      await setModelToLocalStore(currentModel);
      updateContextDisplay(0); // Reset or recalculate used context for new model
      await setModel(sessionId, currentModel);
    });

    updateContextDisplay(0); // Initial call
    lucide.createIcons();
    await setModel(sessionId, currentModel);
  } catch (error) {
    console.error("Failed to load models:", error);
  }
}

async function getModelFromLocalStore() {
  return localStorage.getItem("currentModel");
}

async function setModelToLocalStore(modelName) {
  if (modelName) await localStorage.setItem("currentModel", modelName);
}

// Function to update the UI Bar
function updateContextDisplay(usedTokens) {
  const totalTokens =
    parseInt(document.getElementById("maxTokens").value) || 4096;
  const percentage = Math.min((usedTokens / totalTokens) * 100, 100);

  document.getElementById("usedTokens").textContent =
    usedTokens.toLocaleString();
  document.getElementById("totalTokensDisplay").textContent =
    totalTokens.toLocaleString();

  const bar = document.getElementById("contextBar");
  bar.style.width = `${percentage}%`;

  // Change color if context is running low (Apple style warnings)
  if (percentage > 90) {
    bar.style.background = "#ff3b30"; // System Red
  } else if (percentage > 70) {
    bar.style.background = "#ff9500"; // System Orange
  } else {
    bar.style.background = "var(--accent-blue)";
  }
}

async function setModel(sessionId, currentModel) {
  await fetch("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, model: currentModel }),
  });
}

// Update connection status
function updateStatus(connected, message) {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  statusDot.className = "status-dot" + (connected ? "" : " disconnected");
  statusText.textContent = message;
}

// Send message
async function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();

  console.log("Sending message:", message);
  console.log("Session ID:", sessionId);

  if (!message || !sessionId) {
    console.warn("Message or session ID missing");
    return;
  }

  // Clear input
  input.value = "";

  // Add user message to chat
  addMessage("user", message);

  // Show typing indicator
  const typingIndicator = document.getElementById("typingIndicator");
  typingIndicator.classList.add("active");

//  // Disable send button
//   const sendBtn = document.getElementById("sendBtn");
//   sendBtn.disabled = true;
scrollToBottom();

  try {
    // Stream response
    console.log("Starting streaming request...");
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message,
        stream: true,
      }),
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", response.headers);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = "";
    let messageDiv = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("Stream complete", decoder.decode(value));
        break;
      }

      const chunk = decoder.decode(value);
      console.log("Received chunk:", chunk.substring(0, 100)); // Log first 100 chars

      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            console.log("Parsed data:", data);

            if (data?.total_tokens) {
              updateContextDisplay(data.total_tokens);
            }

            if (data.chunk) {
              // Hide typing indicator and create message on first chunk
              if (!messageDiv) {
                console.log("Creating assistant message element");
                typingIndicator.classList.remove("active");
                messageDiv = createMessageElement("assistant", "");
                document.getElementById('chatContainer').appendChild(messageDiv);
              }

              assistantMessage += data.chunk;
              updateMessageContent(messageDiv, assistantMessage);
            }
          } catch (e) {
            console.error("Parse error:", e, "Line:", line);
            typingIndicator.classList.remove('active');
            addMessage('assistant', 'Error connecting to model.');
          }
        }
      }
    }
  } catch (error) {
    console.error("Chat error:", error);
    typingIndicator.classList.remove("active");
    addMessage("assistant", "Sorry, an error occurred. Please try again.");
  } finally {
    // Make sure typing indicator is hidden
    typingIndicator.classList.remove("active");

    // Enable send button
    sendBtn.disabled = false;

    // Scroll to bottom
    scrollToBottom();
  }
}

// Add message to chat
function addMessage(role, content) {
  const chatContainer = document.getElementById("chatContainer");

  // Remove empty state if present
  const emptyState = chatContainer.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }

  const messageDiv = createMessageElement(role, content);
  chatContainer.appendChild(messageDiv);

  // Render markdown for assistant messages
  if (role === "assistant") {
    updateMessageContent(messageDiv, content);
  }

  scrollToBottom();
}

// Create message element
function createMessageElement(role, content) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "👤" : "🤖";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent = content;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);

  return messageDiv;
}

// Update message content (for streaming)
function updateMessageContent(messageDiv, content) {
  const contentDiv = messageDiv.querySelector(".message-content");
  if (contentDiv) {
    // Check if this is an assistant message (markdown should be rendered)
    const isAssistant = messageDiv.classList.contains("assistant");

    if (isAssistant && typeof marked !== "undefined") {
      // Render markdown to HTML
      const rawHtml = marked.parse(content);
      // Sanitize HTML if DOMPurify is available
      const cleanHtml =
        typeof DOMPurify !== "undefined"
          ? DOMPurify.sanitize(rawHtml)
          : rawHtml;
      contentDiv.innerHTML = cleanHtml;

      // Apply syntax highlighting
        if (typeof Prism !== 'undefined') {
            Prism.highlightAllUnder(contentDiv);
        }

      // Add copy buttons to code blocks
      addCopyButtonsToCodeBlocks(contentDiv);
    } else {
      // Plain text for user messages
      contentDiv.textContent = content;
    }

    scrollToBottom();
  } else {
    console.error("Content div not found in message element");
    return;
  }
}

// Add copy buttons to code blocks
function addCopyButtonsToCodeBlocks(container) {
  const codeBlocks = container.querySelectorAll("pre code");
  codeBlocks.forEach((block, index) => {
    const pre = block.parentElement;

    // Apply syntax highlighting if Prism is available
    if (typeof Prism !== "undefined") {
      Prism.highlightElement(block);
    }

    // Wrap in a container if not already wrapped
    if (!pre.parentElement.classList.contains("code-block-wrapper")) {
      const wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      // Add copy button
      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-button btn";
      copyBtn.textContent = "Copy";
      copyBtn.onclick = () => copyCode(block, copyBtn);
      wrapper.appendChild(copyBtn);
    }
  });
}

// Copy code to clipboard
function copyCode(codeBlock, button) {
  const code = codeBlock.textContent;
  navigator.clipboard
    .writeText(code)
    .then(() => {
      button.textContent = "✓ Copied!";
      button.classList.add("copied");

      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("copied");
      }, 2000);
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
      button.textContent = "✗ Failed";
      setTimeout(() => {
        button.textContent = "Copy";
      }, 2000);
    });
}

// Scroll to bottom
function scrollToBottom() {
  const chatContainer = document.getElementById("chatContainer");
  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: "smooth",
  });
}

// Handle Enter key press
function handleKeyPress(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// Send suggestion from chip
function sendSuggestion(text) {
  const input = document.getElementById("messageInput");
  input.value = text;
  sendMessage();
}

// Settings modal functions
function openSettingsPop() {
  document.getElementById("agentSettingsModal").style.display = "flex";
}

function closeSettingsPop() {
  document.getElementById("agentSettingsModal").style.display = "none";
}

async function saveSettings() {
  const systemPrompt = document.getElementById("systemPrompt").value;
  const maxTokens = parseInt(document.getElementById("maxTokens").value);
  const enableTools = document.getElementById("enableToolsSettings").checked;
  const newMax = document.getElementById("maxTokens").value;
  document.getElementById("totalTokensDisplay").textContent =
    parseInt(newMax).toLocaleString();

  try {
    await fetch(`/api/settings/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemPrompt,
        maxContextTokens: maxTokens,
        enableTools,
      }),
    });

    closeSettingsPop();
  } catch (error) {
    console.error("Failed to save settings:", error);
    alert("Failed to save settings. Please try again.");
  }
}

// Show system info
async function showSystemInfo() {
  const modal = document.getElementById("systemInfoModal");
  const grid = document.getElementById("systemInfoGrid");

  modal.style.display = "flex";

  // Show loading state
  grid.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Gathering system details...</p>
        </div>`;

  try {
    const response = await fetch("/api/system/info");
    const info = await response.json();

    // Define a map for icons to make it look premium
    const iconMap = {
      platform: "monitor",
      arch: "cpu",
      hostname: "hard-drive",
      cpus: "processor",
      totalMemory: "layers",
      freeMemory: "activity",
      uptime: "clock",
      nodeVersion: "code-2",
      shell: "terminal",
    };

    // Clear grid and build HTML
    grid.innerHTML = Object.entries(info)
      .map(([key, value]) => {
        const icon = iconMap[key] || "chevron-right";
        // Format keys (e.g., nodeVersion -> Node Version)
        const formattedKey = key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase());

        return `
                <div class="info-item">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="${icon}" style="width: 12px; height: 12px; color: var(--accent-blue);"></i>
                        <span class="info-label">${formattedKey}</span>
                    </div>
                    <div class="info-value">${value}</div>
                </div>
            `;
      })
      .join("");

    // Re-initialize Lucide icons for the new elements
    lucide.createIcons();
  } catch (error) {
    grid.innerHTML = `
            <div class="loading-state" style="color: #ff3b30;">
                <i data-lucide="alert-circle" style="margin-bottom: 8px;"></i>
                <p>Error: ${error.message}</p>
            </div>`;
    lucide.createIcons();
  }
}

// Close system info modal
function closeSystemInfo() {
  document.getElementById("systemInfoModal").style.display = "none";
}

// Clear conversation history
async function clearHistory() {
  if (!confirm("Are you sure you want to clear the conversation history?")) {
    return;
  }

  try {
    await fetch(`/api/history/${sessionId}`, {
      method: "DELETE",
    });

    // Clear UI
    const chatContainer = document.getElementById("chatContainer");
    chatContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h3>Start a Conversation</h3>
                <p>Ask me anything! I'm powered by Ollama.</p>
            </div>
        `;

    alert("History cleared!");
  } catch (error) {
    console.error("Failed to clear history:", error);
    alert("Failed to clear history. Please try again.");
  }
}

// Export conversation history
async function exportHistory() {
  try {
    const response = await fetch(`/api/export/${sessionId}`);
    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ollama-interface-history-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export history:", error);
    alert("Failed to export history. Please try again.");
  }
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", init);
