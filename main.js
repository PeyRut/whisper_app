/**
 * Main application logic for the message creation page (index.html).
 */
document.addEventListener('DOMContentLoaded', () => {
  // --- Get DOM elements ---
  const composerView = document.getElementById('composer-view');
  const linkView = document.getElementById('link-view');
  const messageContentElement = document.getElementById('message-content');
  const charCounterElement = document.getElementById('char-counter');
  const expirationTimeElement = document.getElementById('expiration-time');
  const customExpirationContainer = document.getElementById('custom-expiration-container');
  const customExpirationInput = document.getElementById('custom-expiration');
  const createLinkButton = document.getElementById('create-link-button');
  const secretLinkElement = document.getElementById('secret-link');
  const copyLinkButton = document.getElementById('copy-link-button');
  const createNewButton = document.getElementById('create-new-button');

  // --- Initial UI setup & Event listeners ---

  // Character counter for message content
  if (messageContentElement && charCounterElement) {
    messageContentElement.addEventListener('input', () => {
      charCounterElement.textContent = `${messageContentElement.value.length} characters`;
    });
  }

  // Show/hide custom expiration input
  if (expirationTimeElement && customExpirationContainer && customExpirationInput) {
    expirationTimeElement.addEventListener('change', () => {
      if (expirationTimeElement.value === 'custom') {
        customExpirationContainer.classList.remove('hidden');
        customExpirationInput.focus();
      } else {
        customExpirationContainer.classList.add('hidden');
      }
    });
  }

  // Handle "Create Secret Link" button click
  if (createLinkButton) {
    createLinkButton.addEventListener('click', handleCreateLink);
  }

  // Handle "Copy Link" button click
  if (copyLinkButton && secretLinkElement) {
    copyLinkButton.addEventListener('click', () => {
      secretLinkElement.select();
      document.execCommand('copy');
      showNotification('Link copied to clipboard!', 'success'); // Assuming showNotification is globally available or imported
    });
  }

  // Handle "Create Another Message" button click
  if (createNewButton) {
    createNewButton.addEventListener('click', () => {
      switchToView('composer');
      messageContentElement.value = ''; // Clear message content
      charCounterElement.textContent = '0 characters';
      expirationTimeElement.value = '1440'; // Reset expiration to default
      customExpirationContainer.classList.add('hidden');
      if (secretLinkElement) secretLinkElement.value = '';
    });
  }

  // --- Core Logic Functions ---

  /**
   * Handles the process of creating a secret link.
   */
  async function handleCreateLink() {
    if (!messageContentElement || !expirationTimeElement || !customExpirationInput) return;

    const message = messageContentElement.value.trim();
    if (!message) {
      showUIMessage('Please enter a message.', 'error');
      return;
    }

    let expirationMinutes = parseInt(expirationTimeElement.value, 10);
    if (expirationTimeElement.value === 'custom') {
      expirationMinutes = parseInt(customExpirationInput.value, 10);
      if (isNaN(expirationMinutes) || expirationMinutes < 5 || expirationMinutes > 10080) {
        showUIMessage('Custom expiration must be between 5 and 10080 minutes.', 'error');
        return;
      }
    }

    // Get the one-time view checkbox value
    const oneTimeViewCheckbox = document.getElementById('one-time-view');
    const isOneTimeView = oneTimeViewCheckbox ? oneTimeViewCheckbox.checked : true;

    createLinkButton.disabled = true;
    createLinkButton.textContent = 'Processing...';

    try {
      // 1. Generate encryption key
      const encryptionKeyHex = await generateEncryptionKey(); // From crypto.js

      // 2. Encrypt the message
      const encryptedMessageBase64 = await encryptMessage(message, encryptionKeyHex); // From crypto.js

      // 3. Get CSRF token
      const csrfToken = await getCsrfToken(); // From message-service.js

      // 4. Create message via API (now with isOneTimeView)
      const messageToken = await createMessage(encryptedMessageBase64, expirationMinutes, csrfToken, isOneTimeView); // From message-service.js

      // 5. Construct the full secret link
      // The key is added to the URL fragment (#)
      const secretUrl = `${window.location.origin}/viewer.html?token=${messageToken}#${encryptionKeyHex}`;
      
      if (secretLinkElement) secretLinkElement.value = secretUrl;
      
      showUIMessage('Secret link generated successfully!', 'success');
      switchToView('link');

    } catch (error) {
      console.error('Failed to create secret link:', error);
      showUIMessage(error.message || 'An unexpected error occurred. Please try again.', 'error');
    } finally {
      createLinkButton.disabled = false;
      createLinkButton.textContent = 'Create Secret Link';
    }
  }

  // --- UI Helper Functions ---

  /**
   * Switches between composer and link views.
   * @param {'composer' | 'link'} viewName 
   */
  function switchToView(viewName) {
    if (!composerView || !linkView) return;
    if (viewName === 'link') {
      composerView.classList.add('hidden');
      linkView.classList.remove('hidden');
    } else {
      linkView.classList.add('hidden');
      composerView.classList.remove('hidden');
    }
  }

  /**
   * Displays a message to the user (e.g., error or success).
   * This is a placeholder. Implement a proper notification system (e.g., using a toast library or the existing showNotification).
   * For now, it uses the existing showNotification if available, otherwise logs to console.
   * @param {string} message 
   * @param {'error' | 'success'} type 
   */
  function showUIMessage(message, type) {
    console.log(`UI Message (${type}):`, message);
    // Assuming showNotification is globally available from ui.js or similar
    if (typeof showNotification === 'function') {
      showNotification(message, type);
    } else {
      // Fallback if showNotification is not found (e.g. if ui.js wasn't loaded, though it should be)
      alert(`${type.toUpperCase()}: ${message}`); 
    }
  }

  // Initialize the view
  switchToView('composer'); 
}); 