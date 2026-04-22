/**
 * Client-side Solidity syntax validator using @solidity-parser/parser.
 * Validates code snippets that belong inside a Solidity function body.
 */
import { parse } from '@solidity-parser/parser';

// Lines prepended as wrapper around user code (used to correct reported line numbers)
const HEADER_LINES = 3;

/**
 * Validates a Solidity code snippet (statements inside a function body).
 *
 * @param {string} code  The Solidity statements to validate.
 * @returns {null | { message: string, line: number|null }}
 *   null when the code is valid; an error descriptor when it is not.
 */
export function validateSoliditySnippet(code) {
  if (!code || !code.trim()) return null; // empty → treat as valid

  // Wrap the snippet in a minimal valid contract so the parser has context
  const wrapped = [
    'pragma solidity ^0.8.0;',
    'contract C {',
    'function f() public payable {',
    code,
    '}',
    '}'
  ].join('\n');

  try {
    // tolerant: true — parser never throws internally (ANTLR4 errors are collected instead)
    const result = parse(wrapped, { tolerant: true, loc: true });

    if (!result.errors || result.errors.length === 0) return null;

    const first = result.errors[0];
    const rawLine = first.location?.start?.line ?? null;
    const line    = rawLine !== null ? rawLine - HEADER_LINES : null;
    const rawMsg  = (first.message || 'Syntax error').split('\n')[0];
    const message = rawMsg.replace(/^Line \d+:\s*/, '').trim() || 'Syntax error';

    return { message, line };
  } catch (_) {
    // Should never reach here with tolerant: true, but guard just in case
    return { message: 'Syntax error', line: null };
  }
}

/**
 * Validates a Solidity expression used as an output value.
 * The compiler appends the semicolon — users should NOT write one here.
 *
 * @param {string} expr  e.g. "msg.value", "1 ether", "amount + fee"
 * @returns {null | { message: string, line: number|null }}
 */
export function validateSolidityExpression(expr) {
  if (!expr || !expr.trim()) return null;
  // Append the semicolon the compiler will add, then validate as a statement
  return validateSoliditySnippet(expr.trim() + ';');
}
