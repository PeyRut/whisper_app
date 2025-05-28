/**
 * Message Service
 * Handles API communication for creating messages.
 */

const API_BASE_URL = '/api/messages'; // Assuming the API is hosted on the same origin

/**
 * Fetches a CSRF token from the backend.
 * @returns {Promise<string>} The CSRF token.
 * @throws {Error} If fetching the token fails.
 */
async function getCsrfToken() {
  try {
    const response = await fetch(`${API_BASE_URL}/csrf-token`);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.csrfToken) {
      throw new Error('CSRF token not found in response.');
    }
    return data.csrfToken;
  } catch (error) {
    console.error('Error getting CSRF token:', error);
    throw new Error('Could not obtain a security token. Please try again.');
  }
}

/**
 * Creates a new secret message by sending encrypted content to the backend.
 * @param {string} encryptedContentBase64 - The base64 encoded encrypted message.
 * @param {number} expirationDurationMinutes - The message expiration time in minutes.
 * @param {string} csrfToken - The CSRF token for the request.
 * @param {boolean} isOneTimeView - Whether the message is one-time view only.
 * @param {Array} attachments - Array of {filename, type, encryptedData}.
 * @returns {Promise<string>} The message token (used to build the secret link).
 * @throws {Error} If message creation fails.
 */
async function createMessage(encryptedContentBase64, expirationDurationMinutes, csrfToken, isOneTimeView = true, attachments = []) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        encrypted_content: encryptedContentBase64,
        expiration_duration_minutes: expirationDurationMinutes,
        is_one_time_view: isOneTimeView,
        attachments: attachments,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      let errorMessage = `Failed to create message: ${response.status} ${response.statusText}`;
      if (responseData.errors && responseData.errors.length > 0) {
        errorMessage += ' - ' + responseData.errors.map(e => e.msg).join(', ');
      }
      throw new Error(errorMessage);
    }

    if (!responseData.token) {
      throw new Error('Message token not found in response.');
    }
    return responseData.token;
  } catch (error) {
    console.error('Error creating message:', error);
    // Attempt to provide a more user-friendly message based on known error types
    if (error.message.includes('CSRF token')) {
        throw new Error('Failed to create message due to a security token issue. Please refresh and try again.');
    }
    throw new Error('Could not save the message. Please check your connection and try again.');
  }
} 