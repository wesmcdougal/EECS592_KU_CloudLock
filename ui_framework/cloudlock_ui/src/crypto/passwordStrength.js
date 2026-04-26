/*
Password Strength Evaluation Utility
This module provides a function to evaluate the strength of a password based on various criteria such as length, character variety, and common patterns.
It returns a score, label, percentage, and feedback for improving the password.
*/

export function getPasswordStrength(password) {
  const value = password || '';
  let score = 0;
  const feedback = [];

  if (!value) {
    return {
      score: 0,
      label: 'Enter a password',
      percent: 0,
      checks: {
        length: false,
        lower: false,
        upper: false,
        number: false,
        symbol: false,
        noCommonPattern: false,
      },
      feedback: ['Password is required.'],
    };
  }

  const checks = {
    length: value.length >= 12,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
    noCommonPattern: !/(password|1234|qwerty|admin|letmein|welcome)/i.test(value),
  };

  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;
  if (checks.lower) score += 1;
  if (checks.upper) score += 1;
  if (checks.number) score += 1;
  if (checks.symbol) score += 1;
  if (checks.noCommonPattern) score += 1;

  // Small penalty for repeated characters like "aaaaaa" or "111111"
  if (/(.)\1{2,}/.test(value)) {
    score -= 1;
    feedback.push('Avoid repeated characters.');
  }

  // Small penalty for obvious sequences
  if (
    /(?:abc|bcd|cde|123|234|345|456|567|678|789)/i.test(value)
  ) {
    score -= 1;
    feedback.push('Avoid common sequences.');
  }

  score = Math.max(0, Math.min(score, 8));

  if (!checks.length) feedback.push('Use at least 12 characters.');
  if (!checks.lower) feedback.push('Add a lowercase letter.');
  if (!checks.upper) feedback.push('Add an uppercase letter.');
  if (!checks.number) feedback.push('Add a number.');
  if (!checks.symbol) feedback.push('Add a symbol.');
  if (!checks.noCommonPattern) feedback.push('Avoid common words or patterns.');

  let label = 'Very Weak';
  let percent = 10;

  if (score <= 2) {
    label = 'Weak';
    percent = 25;
  } else if (score <= 4) {
    label = 'Fair';
    percent = 50;
  } else if (score <= 6) {
    label = 'Strong';
    percent = 75;
  } else {
    label = 'Very Strong';
    percent = 100;
  }

  return {
    score,
    label,
    percent,
    checks,
    feedback,
  };
}