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
  const attachmentsInput = document.getElementById('attachments');
  const attachmentsList = document.getElementById('attachments-list');

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

  // --- Drag-and-drop for attachments ---
  let selectedFiles = [];
  const dropArea = document.createElement('div');
  dropArea.className = 'border-2 border-dashed border-blue-400 rounded-md p-4 mb-2 text-center bg-blue-50 cursor-pointer';
  dropArea.textContent = 'Drag & drop files here, or click to select';
  const attachmentsInputParent = attachmentsInput.parentElement;
  if (attachmentsInputParent) {
    attachmentsInputParent.insertBefore(dropArea, attachmentsInput);
    attachmentsInput.style.display = 'none';
  }
  dropArea.addEventListener('click', () => attachmentsInput.click());
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('bg-blue-100'); });
  dropArea.addEventListener('dragleave', e => { e.preventDefault(); dropArea.classList.remove('bg-blue-100'); });
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.classList.remove('bg-blue-100');
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  });
  attachmentsInput.addEventListener('change', () => {
    addFiles(Array.from(attachmentsInput.files || []));
  });
  function addFiles(files) {
    for (const file of files) {
      if (selectedFiles.length >= 5) break;
      if (file.size > 10 * 1024 * 1024) continue;
      if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        selectedFiles.push(file);
      }
    }
    updateAttachmentPreview();
  }
  function removeFile(idx) {
    selectedFiles.splice(idx, 1);
    updateAttachmentPreview();
  }
  function updateAttachmentPreview() {
    attachmentsList.innerHTML = '';
    if (selectedFiles.length === 0) {
      attachmentsList.textContent = '';
      attachmentsInput.value = '';
      return;
    }
    selectedFiles.forEach((file, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'flex items-center gap-2 mb-2';
      let preview;
      if (file.type.startsWith('image/')) {
        preview = document.createElement('img');
        preview.className = 'w-24 h-24 object-cover rounded border';
        const reader = new FileReader();
        reader.onload = e => { preview.src = e.target.result; };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('video/')) {
        preview = document.createElement('video');
        preview.className = 'w-40 h-24 rounded border';
        preview.controls = true;
        const reader = new FileReader();
        reader.onload = e => { preview.src = e.target.result; };
        reader.readAsDataURL(file);
      } else {
        preview = document.createElement('span');
        preview.textContent = file.name;
      }
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'ml-2 text-xs text-red-600 hover:underline';
      removeBtn.onclick = () => removeFile(idx);
      wrapper.appendChild(preview);
      wrapper.appendChild(document.createTextNode(` ${file.name} (${Math.round(file.size/1024)} KB)`));
      wrapper.appendChild(removeBtn);
      attachmentsList.appendChild(wrapper);
    });
    // Update the file input to match selectedFiles
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(f => dataTransfer.items.add(f));
    attachmentsInput.files = dataTransfer.files;
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

    // Use selectedFiles instead of attachmentsInput.files
    if (selectedFiles.length > 0) {
      const files = selectedFiles;
      let attachments = [];
      const encryptionKeyHex = await generateEncryptionKey(); // For message and attachments
      const encryptedMessageBase64 = await encryptMessage(message, encryptionKeyHex);
      for (const file of files) {
        if (typeof file.arrayBuffer === 'function') {
          const arrayBuffer = await file.arrayBuffer();
          const encrypted = await encryptMessage(arrayBuffer, encryptionKeyHex, true); // true = raw mode
          attachments.push({
            filename: file.name,
            type: file.type,
            encryptedData: encrypted
          });
        }
      }
      const csrfToken = await getCsrfToken();
      const messageToken = await createMessage(encryptedMessageBase64, expirationMinutes, csrfToken, isOneTimeView, attachments);
      const secretUrl = `${window.location.origin}/viewer.html?token=${messageToken}#${encryptionKeyHex}`;
      if (secretLinkElement) secretLinkElement.value = secretUrl;
      showUIMessage('Secret link generated successfully!', 'success');
      switchToView('link');
      return;
    }
    // If no selectedFiles, continue as before
    createLinkButton.disabled = true;
    createLinkButton.textContent = 'Processing...';
    try {
      const encryptionKeyHex = await generateEncryptionKey();
      const encryptedMessageBase64 = await encryptMessage(message, encryptionKeyHex);
      const csrfToken = await getCsrfToken();
      const messageToken = await createMessage(encryptedMessageBase64, expirationMinutes, csrfToken, isOneTimeView, []);
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