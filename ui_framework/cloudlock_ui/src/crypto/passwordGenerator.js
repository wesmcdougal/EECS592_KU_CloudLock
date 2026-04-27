/*
Function that generates a strong password for user. Currently static at 16 characters.
*/

export function generateStrongPassword(length = 16) {  
    
    // Pool of upper, lower, num, and symbols. 
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()-_=+[]{};:,.<>?";

    const all = upper + lower + numbers + symbols;

    // Gets random int.
    function randInt(max) {
        const arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return arr[0] % max;
    }

    // Selects char based on a string.
    function pick(str) {
        return str[randInt(str.length)];
    }

    // Guarentees all pools are selected from.
    const chars = [
        pick(upper),
        pick(lower),
        pick(numbers),
        pick(symbols),
    ];

    // Fills the password with rest of pool
    while (chars.length < length) {
        chars.push(pick(all));
    }

    // Shuffles the characters for security using Fisher-Yates.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    // Converts to final string.
    return chars.join("");
}