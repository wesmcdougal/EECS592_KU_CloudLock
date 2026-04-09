/**
 * Image Authentication Crypto Module (imageAuth.js)
 *
 * Client-side LSB steganography for image-based final MFA.
 * Responsibilities:
 * - Embed a 256-bit server-generated secret into the LSBs of a PNG image
 * - Extract the embedded secret from a stored PNG
 * - Derive SHA-256 hash of the secret using WebCrypto API
 * - Never expose raw secret outside this module; only the hex hash is returned
 *
 * PNG-only enforcement: JPEG compression destroys LSB data.
 * All canvas operations are synchronous-style wrapped in Promises for use with async/await.
 *
 * Revision History:
 * - Added for FR24.1 / FR24.6 image MFA implementation
 */

const SECRET_BYTE_LENGTH = 32; // 256 bits
const BITS_PER_BYTE = 8;
const TOTAL_BITS = SECRET_BYTE_LENGTH * BITS_PER_BYTE; // 256 bits = 256 LSBs needed

/**
 * Load an image File/Blob onto a canvas and return pixel data.
 * @param {File|Blob} file
 * @returns {Promise<{ imageData: ImageData, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }>}
 */
function loadImagePixels(file) {
    return new Promise((resolve, reject) => {
        if (file.type !== "image/png") {
            reject(new Error("Only PNG images are supported for authentication."));
            return;
        }

        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const totalPixels = img.naturalWidth * img.naturalHeight;
            if (totalPixels * 4 < TOTAL_BITS) {
                reject(new Error("Image is too small to embed the authentication secret."));
                return;
            }

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            resolve({ imageData, canvas, ctx });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image. Ensure it is a valid PNG file."));
        };

        img.src = url;
    });
}

/**
 * Compute SHA-256 of a Uint8Array, return lowercase hex string.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
async function sha256Hex(bytes) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Embed a 32-byte secret into the LSB of the R channel of the first 256 pixels.
 * Returns a PNG Blob of the modified image and the hex hash of the secret.
 *
 * @param {File} imageFile  - User-selected PNG file
 * @param {Uint8Array} secret32 - 32 random bytes to embed
 * @returns {Promise<{ modifiedBlob: Blob, secretHash: string }>}
 */
export async function embedSecretInImage(imageFile, secret32) {
    if (!(secret32 instanceof Uint8Array) || secret32.length !== SECRET_BYTE_LENGTH) {
        throw new Error("Secret must be a 32-byte Uint8Array.");
    }

    const { imageData, canvas, ctx } = await loadImagePixels(imageFile);
    const data = imageData.data; // RGBA flat array

    // Write each bit of the secret into the LSB of the R channel, one bit per pixel
    for (let bitIndex = 0; bitIndex < TOTAL_BITS; bitIndex++) {
        const byteIndex = Math.floor(bitIndex / BITS_PER_BYTE);
        const bitOffset = 7 - (bitIndex % BITS_PER_BYTE); // MSB first
        const bit = (secret32[byteIndex] >> bitOffset) & 1;

        const pixelBaseIndex = bitIndex * 4; // R channel of pixel at bitIndex
        data[pixelBaseIndex] = (data[pixelBaseIndex] & 0xfe) | bit;
    }

    ctx.putImageData(imageData, 0, 0);

    const modifiedBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
    );

    const secretHash = await sha256Hex(secret32);

    return { modifiedBlob, secretHash };
}

/**
 * Extract the 32-byte secret embedded in the LSBs of the R channel,
 * then return its SHA-256 hex hash. The raw secret never leaves this function.
 *
 * @param {File} imageFile - The stored PNG with the embedded secret
 * @returns {Promise<string>} SHA-256 hex hash of the extracted secret
 */
export async function extractAndHashSecret(imageFile) {
    const { imageData } = await loadImagePixels(imageFile);
    const data = imageData.data;

    const secret = new Uint8Array(SECRET_BYTE_LENGTH);

    for (let bitIndex = 0; bitIndex < TOTAL_BITS; bitIndex++) {
        const bit = data[bitIndex * 4] & 1; // LSB of R channel
        const byteIndex = Math.floor(bitIndex / BITS_PER_BYTE);
        const bitOffset = 7 - (bitIndex % BITS_PER_BYTE);
        secret[byteIndex] |= bit << bitOffset;
    }

    return sha256Hex(secret);
}

/**
 * Generate a cryptographically random 32-byte secret.
 * Used during registration to produce the value to embed.
 *
 * @returns {Uint8Array}
 */
export function generateImageSecret() {
    const secret = new Uint8Array(SECRET_BYTE_LENGTH);
    crypto.getRandomValues(secret);
    return secret;
}
