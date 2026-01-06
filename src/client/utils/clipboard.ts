/**
 * Safe clipboard utility with fallback
 *
 * Navigator.clipboard is only available in secure contexts (HTTPS or localhost).
 * This utility provides a fallback using the legacy execCommand method.
 */

/**
 * Copy text to clipboard safely with fallback
 * @param text - The text to copy
 * @returns Promise that resolves if successful, rejects with error message
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Check if modern Clipboard API is available
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // If modern API fails, try fallback
      console.warn('Clipboard API failed, trying fallback:', error);
    }
  }

  // Fallback: Use the deprecated execCommand method
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;

    // Make the textarea invisible and append to body
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);

    // Select and copy
    textarea.focus();
    textarea.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (successful) {
        resolve();
      } else {
        reject(new Error('Failed to copy text using execCommand'));
      }
    } catch (error) {
      document.body.removeChild(textarea);
      reject(error);
    }
  });
}
