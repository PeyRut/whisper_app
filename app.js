/**
 * Message Viewing Page Application
 * This script handles the main application logic for retrieving, decrypting,
 * and displaying one-time messages.
 */

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initMessageView();
});

/**
 * Initializes the message view page, extracting token and key from URL
 * and starting the message retrieval process
 */
function initMessageView() {
  try {
    // Check for Web Crypto API availability
    if (!window.crypto || !window.crypto.subtle) {
      showErrorState('Web Crypto API is not supported by this browser. This feature is required to decrypt messages. Please try a different browser.');
      // Ensure loading state is hidden if it was shown before this check
      const loadingState = document.getElementById('loading-state');
      if (loadingState) loadingState.classList.add('hidden');
      return;
    }

    // Extract the token from URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    // Extract the encryption key from URL fragment
    const encryptionKey = window.location.hash.substring(1); // Remove the # character
    
    console.log('Initializing message view with token:', token);
    
    if (!token || !encryptionKey) {
      showErrorState('Invalid or missing message identifier or decryption key in the URL.');
      return;
    }
    
    // Attempt to fetch and decrypt the message
    fetchAndDecryptMessage(token, encryptionKey);
    
  } catch (error) {
    console.error('Error initializing message view:', error);
    showErrorState('An unexpected error occurred while initializing the page. Please ensure the URL is correct.');
  }
}

/**
 * Fetches the encrypted message from the API and attempts to decrypt it
 * @param {string} token - The message token from the URL
 * @param {string} key - The decryption key from the URL fragment
 */
async function fetchAndDecryptMessage(token, key) {
  try {
    showLoadingState();
    
    // 1. Fetch the encrypted message from the API
    const responseData = await fetchMessage(token);
    
    if (!responseData || !responseData.encryptedContent) {
      throw new Error('Encrypted message content was not found or is invalid.');
    }
    
    // 2. Decrypt the message using the key from URL fragment
    // Ensure decryption logic minimizes key exposure and is robust
    const decryptedContent = await decryptMessage(responseData.encryptedContent, key);
    
    // 3. Display the decrypted message
    // Ensure proper output encoding to prevent XSS
    displayDecryptedMessage(decryptedContent);
    
    // 4. Decrypt and display attachments (if any)
    if (responseData.attachments && Array.isArray(responseData.attachments) && responseData.attachments.length > 0) {
      const attachmentsContainer = document.getElementById('attachments-container');
      if (attachmentsContainer) {
        attachmentsContainer.innerHTML = '';
        for (const att of responseData.attachments) {
          // Decrypt the attachment
          let decrypted;
          try {
            decrypted = await decryptMessage(att.encryptedData, key, true); // true = raw mode
          } catch (e) {
            continue; // Skip failed attachments
          }
          const blob = new Blob([decrypted], { type: att.type });
          const url = URL.createObjectURL(blob);
          let el;
          if (att.type.startsWith('image/')) {
            el = document.createElement('img');
            el.src = url;
            el.alt = att.filename;
            el.className = 'max-w-xs max-h-60 my-2 rounded shadow';
          } else if (att.type.startsWith('video/')) {
            el = document.createElement('video');
            el.src = url;
            el.controls = true;
            el.className = 'max-w-xs max-h-60 my-2 rounded shadow';
          } else {
            el = document.createElement('a');
            el.href = url;
            el.download = att.filename;
            el.textContent = `Download ${att.filename}`;
            el.className = 'block my-2 text-blue-600 underline';
          }
          attachmentsContainer.appendChild(el);
        }
      }
    }
    
  } catch (error) {
    console.error('Error fetching or decrypting message:', error);
    // Friendlier error for not found (404/410)
    if (error.message && error.message.match(/Message not found/)) {
      showErrorState('This message has already been viewed and is no longer available. For your privacy, it was permanently destroyed after first access.', false);
      // Optionally, add a CSS class to make the error box less alarming
      const errorState = document.getElementById('error-state');
      if (errorState) {
        errorState.classList.add('bg-yellow-50','border-yellow-400','text-yellow-800');
        errorState.classList.remove('text-red-700');
      }
      return;
    }
    showErrorState(error.message || 'Failed to retrieve or decrypt the message. The link may be invalid, expired, or the data corrupted.');
  }
}

/**
 * Fetches the encrypted message from the API
 * @param {string} token - The message token
 * @returns {Promise<Object>} - The response data with encrypted content
 */
async function fetchMessage(token) {
  try {
    // Make request to the API endpoint
    // Using a relative path assumes the API is on the same origin.
    const response = await fetch(`/api/messages/${token}/content`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        // 'X-CSRF-Token': 'your_csrf_token_here' // If CSRF protection is implemented via custom headers for GET requests (uncommon but possible)
      }
    });
    
    // Check for successful response
    if (!response.ok) {
      if (response.status === 404 || response.status === 410) {
        throw new Error('Message not found. It may have already been viewed, expired, or the link is incorrect.');
      }
      // For other errors, provide a generic message
      throw new Error(`Unable to retrieve message. Server responded with status: ${response.status}.`);
    }
    
    // Parse the JSON response
    return await response.json();
    
  } catch (error) {
    console.error('API request error:', error);
    // Re-throw the error (could be a custom error with a safe message, or a network error)
    // If it's a network error, error.message might be generic like "Failed to fetch"
    throw error; 
  }
}

/**
 * Displays the decrypted message in the UI
 * Ensures proper output encoding for the content
 * @param {string} content - The decrypted message content
 */
function displayDecryptedMessage(content) {
  const messageElement = document.getElementById('message-content');
  
  if (!messageElement) {
    console.error('Message content element not found in DOM.');
    showErrorState('A critical error occurred while trying to display the message (UI element missing).');
    return;
  }

  // Sanitize and set the content using textContent to prevent XSS
  // This renders the content as plain text.
  messageElement.textContent = content;
  
  // If the message content is intended to be Markdown or some other format
  // that needs HTML rendering, it MUST be processed by a secure parser/sanitizer
  // that explicitly prevents XSS attacks AFTER decryption and BEFORE insertion.
  // Example (if using a library like DOMPurify and marked):
  // const dirtyHtml = marked.parse(content);
  // messageElement.innerHTML = DOMPurify.sanitize(dirtyHtml);
  // For plain text, textContent is the safest and simplest.

  showSuccessState();
  
  const closeButton = document.getElementById('close-btn');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      // Simple navigation. Ensure this action is benign and expected.
      // Server-side logic should ensure the message is non-retrievable after first view.
      // Client cannot "destroy" the message, only navigate away.
      window.location.href = '/'; // Navigate to home or a confirmation page
    });
  } else {
    console.warn('Close button not found in DOM.');
  }
}

/**
 * Shows the loading state
 */
function showLoadingState() {
  document.getElementById('loading-state').classList.remove('hidden');
  document.getElementById('error-state').classList.add('hidden');
  document.getElementById('success-state').classList.add('hidden');
}

/**
 * Shows the error state with a custom message
 * @param {string} errorMessage - The error message to display (should be safe for users)
 */
function showErrorState(errorMessage, showNotification = true) {
  console.warn('Showing error state:', errorMessage);
  
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('error-state').classList.remove('hidden');
  document.getElementById('success-state').classList.add('hidden');
  
  // Update the error message display if an element for it exists
  const errorTextElement = document.getElementById('error-message-text'); // Assuming you add an ID to the <p> in error-state
  if (errorTextElement) {
    errorTextElement.textContent = errorMessage; // Safely set the error message text
  } else {
    // Fallback or provide specific element for detailed error text
    const errorContainer = document.getElementById('error-state');
    // For simplicity, if no dedicated text element, we'll rely on the notification.
    // Alternatively, find a suitable <p> tag within error-state to update.
    // e.g., errorContainer.querySelector('p').textContent = errorMessage; (be cautious with generic selectors)
  }

  if (showNotification) {
    showNotification(errorMessage, 'error');
  }
}

/**
 * Shows the success state
 */
function showSuccessState() {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('error-state').classList.add('hidden');
  document.getElementById('success-state').classList.remove('hidden');
  document.getElementById('success-state').classList.add('fade-in');
}


