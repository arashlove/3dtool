/** Request header that carries the visitor's Hugging Face token to the Future Lab API routes. */
export const HF_TOKEN_HEADER = 'x-hf-token';

/** Printable ASCII without spaces; rejects anything that could not be a token before it reaches Hugging Face. */
export const HF_TOKEN_PATTERN = /^[\x21-\x7e]{8,200}$/;
