/**
 * SVG sanitiser — strips dangerous content from SVG strings.
 *
 * Two-tier approach:
 *  1. Regex scrubbing — always runs, works everywhere (Node, Docker, Jest node env).
 *  2. DOMPurify pass — runs when a DOM window is available (Jest jsdom env, browser).
 *
 * This avoids jsdom ESM-dependency issues on Node 18 while still exercising
 * DOMPurify in the jsdom test environment.
 */

// Remove script elements and their content
const SCRIPT_TAG_RE = /<script[\s\S]*?<\/script\s*>/gi;
const SCRIPT_SELF_CLOSE_RE = /<script[^>]*\/>/gi;

// Remove dangerous HTML elements entirely
const DANGEROUS_TAGS_RE =
  /<(object|embed|iframe|link|meta|form|input|button)(\s[^>]*)?(\/?>|>[\s\S]*?<\/\1\s*>)/gi;

// Remove event handler attributes (on*)
const EVENT_ATTR_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;

// Replace javascript: URIs in href / xlink:href
const JS_HREF_RE = /((?:xlink:)?href)\s*=\s*(?:"[^"]*"|'[^']*')/gi;

function stripJsHref(match) {
  const val = match.replace(/.*?=\s*/, "");
  const inner = val.replace(/^["']|["']$/g, "");
  if (/^\s*javascript:/i.test(inner)) return 'href="#"';
  return match;
}

function regexSanitize(svgContent) {
  let s = svgContent;
  s = s.replace(SCRIPT_TAG_RE, "");
  s = s.replace(SCRIPT_SELF_CLOSE_RE, "");
  s = s.replace(DANGEROUS_TAGS_RE, "");
  s = s.replace(EVENT_ATTR_RE, "");
  s = s.replace(JS_HREF_RE, stripJsHref);
  return s;
}

let _purify = null;

function tryGetDOMPurify() {
  if (_purify) return _purify;
  try {
    const DOMPurify = require("dompurify");
    const w =
      typeof global.window !== "undefined" && global.window.document
        ? global.window
        : null;
    if (!w) return null;
    _purify = DOMPurify(w);
  } catch {
    _purify = null;
  }
  return _purify;
}

const DOMPURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: [
    "script",
    "object",
    "embed",
    "link",
    "meta",
    "iframe",
    "form",
    "input",
    "button",
  ],
  FORBID_ATTR: [
    "onload",
    "onclick",
    "onerror",
    "onmouseover",
    "onfocus",
    "onblur",
    "onchange",
    "onsubmit",
    "xlink:href",
    "action",
    "formaction",
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):\/\/|data:image\/)/i,
};

function sanitizeSvg(svgContent) {
  if (!svgContent || typeof svgContent !== "string") return svgContent;
  if (!svgContent.trim().toLowerCase().includes("<svg")) return svgContent;

  // Always run the fast regex pass first
  let clean = regexSanitize(svgContent);

  // Optionally layer DOMPurify on top when a DOM is available
  const purify = tryGetDOMPurify();
  if (purify) {
    try {
      clean = purify.sanitize(clean, DOMPURIFY_CONFIG);
    } catch (err) {
      // DOMPurify failed — regex-cleaned content is still returned
      console.warn("[Security] DOMPurify pass skipped:", err.message);
    }
  }

  if (clean !== svgContent) {
    console.warn(
      "[Security] SVG sanitised — removed potentially dangerous content",
    );
  }
  return clean;
}

const DANGEROUS_PATTERNS = [
  "<script",
  "javascript:",
  "onload=",
  "onerror=",
  "onclick=",
  "onmouseover=",
  "eval(",
  "document.",
  "window.",
];

function isSvgDangerous(svgContent) {
  if (!svgContent) return false;
  const lower = svgContent.toLowerCase();
  return DANGEROUS_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

module.exports = { sanitizeSvg, isSvgDangerous };
