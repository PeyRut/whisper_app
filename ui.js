/**
 * UI Utilities for the Message Viewing Page
 * Handles UI interactions and notifications
 */

/**
 * Show a notification message
 * @param {string} message - The message text
 * @param {string} type - 'error' or 'success'
 */
function showNotification(message, type = 'error') {
  // Remove any existing notification
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Add to body
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Auto hide after 5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    // Remove from DOM after animation completes
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

/**
 * Sanitizes HTML content to prevent XSS
 * @param {string} html - The HTML string to sanitize
 * @returns {string} - Sanitized HTML string
 */
function sanitizeHTML(html) {
  const element = document.createElement('div');
  element.textContent = html;
  return element.innerHTML;
}

/**
 * Handle window/tab close to ensure user knows message will be destroyed
 */
window.addEventListener('beforeunload', (event) => {
  // Only prompt if we're showing a message and not already in error state
  const messageVisible = !document.getElementById('success-state').classList.contains('hidden');
  const errorVisible = !document.getElementById('error-state').classList.contains('hidden');
  
  if (messageVisible && !errorVisible) {
    // Standard way of showing a confirmation dialog before leaving
    const message = 'Leaving this page will cause the message to be permanently destroyed.';
    event.returnValue = message;
    return message;
  }
});

/**
 * Handle initial UI setup based on screen size
 */
function setupResponsiveUI() {
  const isMobile = window.innerWidth < 640;
  
  // Adjust UI elements based on screen size
  if (isMobile) {
    // Mobile-specific adjustments if needed
  } else {
    // Desktop-specific adjustments if needed
  }
}

// Initialize responsive behavior
window.addEventListener('load', setupResponsiveUI);
window.addEventListener('resize', setupResponsiveUI);


