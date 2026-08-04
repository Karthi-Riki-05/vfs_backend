// Auto-generated diagram icon registry (Lucide line-icons, ISC license,
// lucide-react v0.575.0). Icon node data is baked in so the BACKEND has no
// dependency on the frontend lucide-react package. Used by aiDetect.service to
// swap AI-emitted "vcIcon=<name>" tokens for real themed SVG icons on cards.
//
// HOW IT FITS: the AI writes vcIcon=<name> into a card style (semantic pick from
// the ICON NAME MAP in DIAGRAM_SYSTEM_PROMPT). applyIconsToXml() then rewrites the
// cell to a draw.io label shape with the icon on the left, themed to the card
// stroke colour. Blocks with no listed icon keep their emoji fallback.

const ICON_NODES = {"play":[["path",{"d":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"}]],"flag":[["path",{"d":"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"}]],"circle-check-big":[["path",{"d":"M21.801 10A10 10 0 1 1 17 3.335"}],["path",{"d":"m9 11 3 3L22 4"}]],"square-check-big":[["path",{"d":"M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344"}],["path",{"d":"m9 11 3 3L22 4"}]],"shopping-cart":[["circle",{"cx":"8","cy":"21","r":"1"}],["circle",{"cx":"19","cy":"21","r":"1"}],["path",{"d":"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"}]],"credit-card":[["rect",{"width":"20","height":"14","x":"2","y":"5","rx":"2"}],["line",{"x1":"2","x2":"22","y1":"10","y2":"10"}]],"truck":[["path",{"d":"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"}],["path",{"d":"M15 18H9"}],["path",{"d":"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"}],["circle",{"cx":"17","cy":"18","r":"2"}],["circle",{"cx":"7","cy":"18","r":"2"}]],"mail":[["path",{"d":"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"}],["rect",{"x":"2","y":"4","width":"20","height":"16","rx":"2"}]],"clipboard-check":[["rect",{"width":"8","height":"4","x":"8","y":"2","rx":"1","ry":"1"}],["path",{"d":"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"}],["path",{"d":"m9 14 2 2 4-4"}]],"package":[["path",{"d":"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"}],["path",{"d":"M12 22V12"}],["polyline",{"points":"3.29 7 12 12 20.71 7"}],["path",{"d":"m7.5 4.27 9 5.15"}]],"calendar":[["path",{"d":"M8 2v4"}],["path",{"d":"M16 2v4"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2"}],["path",{"d":"M3 10h18"}]],"user":[["path",{"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{"cx":"12","cy":"7","r":"4"}]],"users":[["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["path",{"d":"M16 3.128a4 4 0 0 1 0 7.744"}],["path",{"d":"M22 21v-2a4 4 0 0 0-3-3.87"}],["circle",{"cx":"9","cy":"7","r":"4"}]],"triangle-alert":[["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]],"circle-x":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m15 9-6 6"}],["path",{"d":"m9 9 6 6"}]],"refresh-cw":[["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{"d":"M8 16H3v5"}]],"file-text":[["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M10 9H8"}],["path",{"d":"M16 13H8"}],["path",{"d":"M16 17H8"}]],"database":[["ellipse",{"cx":"12","cy":"5","rx":"9","ry":"3"}],["path",{"d":"M3 5V19A9 3 0 0 0 21 19V5"}],["path",{"d":"M3 12A9 3 0 0 0 21 12"}]],"settings":[["path",{"d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"search":[["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],"lock":[["rect",{"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"}],["path",{"d":"M7 11V7a5 5 0 0 1 10 0v4"}]],"upload":[["path",{"d":"M12 3v12"}],["path",{"d":"m17 8-5-5-5 5"}],["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}]],"download":[["path",{"d":"M12 15V3"}],["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["path",{"d":"m7 10 5 5 5-5"}]],"phone":[["path",{"d":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"}]],"send":[["path",{"d":"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"}],["path",{"d":"m21.854 2.147-10.94 10.939"}]],"clock":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 6v6l4 2"}]],"dollar-sign":[["line",{"x1":"12","x2":"12","y1":"2","y2":"22"}],["path",{"d":"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"}]],"shield-check":[["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"m9 12 2 2 4-4"}]],"bell":[["path",{"d":"M10.268 21a2 2 0 0 0 3.464 0"}],["path",{"d":"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"}]],"thumbs-up":[["path",{"d":"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"}],["path",{"d":"M7 10v12"}]],"trash-2":[["path",{"d":"M10 11v6"}],["path",{"d":"M14 11v6"}],["path",{"d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"}],["path",{"d":"M3 6h18"}],["path",{"d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}]],"pencil":[["path",{"d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],["path",{"d":"m15 5 4 4"}]],"rocket":[["path",{"d":"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"}],["path",{"d":"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"}],["path",{"d":"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"}],["path",{"d":"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"}]],"map-pin":[["path",{"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{"cx":"12","cy":"10","r":"3"}]],"git-branch":[["path",{"d":"M15 6a9 9 0 0 0-9 9V3"}],["circle",{"cx":"18","cy":"6","r":"3"}],["circle",{"cx":"6","cy":"18","r":"3"}]],"box":[["path",{"d":"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"}],["path",{"d":"m3.3 7 8.7 5 8.7-5"}],["path",{"d":"M12 22V12"}]],"message-circle":[["path",{"d":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"}]],"printer":[["path",{"d":"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"}],["path",{"d":"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"}],["rect",{"x":"6","y":"14","width":"12","height":"8","rx":"1"}]],"key":[["path",{"d":"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"}],["path",{"d":"m21 2-9.6 9.6"}],["circle",{"cx":"7.5","cy":"15.5","r":"5.5"}]],"wrench":[["path",{"d":"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"}]],"zap":[["path",{"d":"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]],"cpu":[["path",{"d":"M12 20v2"}],["path",{"d":"M12 2v2"}],["path",{"d":"M17 20v2"}],["path",{"d":"M17 2v2"}],["path",{"d":"M2 12h2"}],["path",{"d":"M2 17h2"}],["path",{"d":"M2 7h2"}],["path",{"d":"M20 12h2"}],["path",{"d":"M20 17h2"}],["path",{"d":"M20 7h2"}],["path",{"d":"M7 20v2"}],["path",{"d":"M7 2v2"}],["rect",{"x":"4","y":"4","width":"16","height":"16","rx":"2"}],["rect",{"x":"8","y":"8","width":"8","height":"8","rx":"1"}]],"cloud":[["path",{"d":"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"}]],"server":[["rect",{"width":"20","height":"8","x":"2","y":"2","rx":"2","ry":"2"}],["rect",{"width":"20","height":"8","x":"2","y":"14","rx":"2","ry":"2"}],["line",{"x1":"6","x2":"6.01","y1":"6","y2":"6"}],["line",{"x1":"6","x2":"6.01","y1":"18","y2":"18"}]],"folder":[["path",{"d":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}]],"list-checks":[["path",{"d":"M13 5h8"}],["path",{"d":"M13 12h8"}],["path",{"d":"M13 19h8"}],["path",{"d":"m3 17 2 2 4-4"}],["path",{"d":"m3 7 2 2 4-4"}]],"user-plus":[["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{"cx":"9","cy":"7","r":"4"}],["line",{"x1":"19","x2":"19","y1":"8","y2":"14"}],["line",{"x1":"22","x2":"16","y1":"11","y2":"11"}]],"log-in":[["path",{"d":"m10 17 5-5-5-5"}],["path",{"d":"M15 12H3"}],["path",{"d":"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"}]],"log-out":[["path",{"d":"m16 17 5-5-5-5"}],["path",{"d":"M21 12H9"}],["path",{"d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}]]};

// Aliases → let the AI use common names even if Lucide renamed the icon.
const ICON_ALIASES = {
  "cart": "shopping-cart", "shopping": "shopping-cart", "order": "shopping-cart",
  "payment": "credit-card", "pay": "credit-card", "card": "credit-card",
  "ship": "truck", "shipping": "truck", "deliver": "truck", "dispatch": "truck",
  "email": "mail", "notify": "mail", "message": "message-circle",
  "validate": "clipboard-check", "check": "clipboard-check", "review": "search",
  "warning": "triangle-alert", "alert": "triangle-alert", "error": "triangle-alert",
  "cancel": "circle-x", "reject": "circle-x", "fail": "circle-x", "delete": "trash-2",
  "success": "circle-check-big", "done": "circle-check-big", "approve": "circle-check-big",
  "backorder": "refresh-cw", "retry": "refresh-cw", "sync": "refresh-cw",
  "doc": "file-text", "document": "file-text", "file": "file-text", "report": "file-text",
  "db": "database", "store": "database", "process": "settings", "config": "settings",
  "deploy": "rocket", "launch": "rocket", "ai": "cpu", "time": "clock", "wait": "clock",
  "money": "dollar-sign", "secure": "shield-check", "auth": "lock", "login": "log-in",
  "logout": "log-out", "signup": "user-plus", "customer": "user", "team": "users",
  "schedule": "calendar", "date": "calendar", "call": "phone", "send": "send",
  "upload": "upload", "download": "download", "print": "printer", "key": "key",
  "fix": "wrench", "repair": "wrench", "start": "play", "flag": "flag",
  "branch": "git-branch", "folder": "folder", "checklist": "list-checks",
  "like": "thumbs-up", "bell": "bell", "notification": "bell", "location": "map-pin",
  "cloud": "cloud", "server": "server", "edit": "pencil", "box": "box", "package": "box",
};

// Resolve an AI-supplied name to a real registry key (direct hit, alias, or a
// looser slug match). Returns null when nothing sensible matches → caller keeps
// the emoji fallback rather than drawing a wrong icon.
function resolveIconName(raw) {
  if (!raw) return null;
  const name = String(raw).trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!name) return null;
  if (ICON_NODES[name]) return name;
  if (ICON_ALIASES[name] && ICON_NODES[ICON_ALIASES[name]])
    return ICON_ALIASES[name];
  return null;
}

// Build one SVG element string from a Lucide node ([tag, attrs]).
function nodeToSvgEl([tag, attrs]) {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `<${tag} ${a}/>`;
}

// Render a named icon to an mxGraph-safe SVG data URI, stroked in `color`.
// URL-encoded (not base64) and fully percent-encoded so the value contains no
// ';' or raw '=' that would break the style string parser.
function renderIconDataUri(name, color) {
  const key = resolveIconName(name);
  if (!key) return null;
  const stroke = /^#[0-9a-fA-F]{3,8}$/.test(color || "") ? color : "#334155";
  const children = ICON_NODES[key].map(nodeToSvgEl).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ` +
    `viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.25" ` +
    `stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

// Pull a style key's value out of an mxGraph style string.
function styleVal(style, key) {
  const m = new RegExp(`(?:^|;)${key}=([^;]*)`).exec(style || "");
  return m ? m[1] : null;
}

// Strip a single leading emoji (and following space) from inside the first
// <b>…</b> of a card label — once we have a real icon we don't want both.
function stripLeadingEmoji(value) {
  return (value || "").replace(
    /(<b>)\s*([\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{FE0F}\u{200D}]+)\s*/u,
    "$1",
  );
}

// Post-process generated mxGraph XML: every vertex whose style carries
// `vcIcon=<name>` becomes a draw.io label-shape with the Lucide icon on the
// left (themed to the card's strokeColor), and its label's emoji is removed.
// Unknown icon names are dropped quietly, leaving the card + emoji untouched.
function applyIconsToXml(xml) {
  if (!xml || typeof xml !== "string" || xml.indexOf("vcIcon=") === -1)
    return xml;

  // Quote-aware match of each <mxCell …> OPENING tag: a card's value="<b>…</b>"
  // contains '>' chars, so a plain [^>]* would stop short — skip over quoted
  // attribute strings instead.
  return xml.replace(/<mxCell\b(?:"[^"]*"|[^">])*>/g, (tag) => {
    if (tag.indexOf("vcIcon=") === -1) return tag;
    const styleM = /style="([^"]*)"/.exec(tag);
    if (!styleM) return tag;
    let style = styleM[1];

    const iconName = styleVal(style, "vcIcon");
    const dataUri = renderIconDataUri(iconName, styleVal(style, "strokeColor"));

    // Always remove the token so it never leaks into the canvas.
    style = style
      .replace(new RegExp(`(?:^|;)vcIcon=[^;]*`), "")
      .replace(/;;+/g, ";")
      .replace(/^;/, "");

    // Only rectangular CARDS get a left icon. A diamond/ellipse/cylinder/stencil
    // must not be turned into a label shape — drop the token and keep it as-is
    // (its emoji/◇ marker stays).
    const isNonCardShape =
      /(?:^|;)(?:rhombus|ellipse|triangle|hexagon|cylinder|parallelogram|cloud|step|process|shape=(?!label))/.test(
        style,
      ) || /(?:^|;)shape=mxgraph\./.test(style);

    // Unknown icon or non-card shape → just drop the token, keep the cell.
    if (!dataUri || isNonCardShape)
      return tag.replace(/style="[^"]*"/, `style="${style}"`);

    // Turn the card into a label-shape with a left icon. Leave room for it.
    if (!/(^|;)shape=/.test(style)) style = "shape=label;" + style;
    style = style.replace(/(?:^|;)spacingLeft=[^;]*/g, ""); // icon sets its own
    if (!/(^|;)imageAlign=/.test(style))
      style +=
        ";image=" +
        dataUri +
        ";imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;";
    else style += ";image=" + dataUri + ";";

    let newTag = tag.replace(/style="[^"]*"/, `style="${style}"`);
    newTag = newTag.replace(
      /value="([^"]*)"/,
      (_m, v) => `value="${stripLeadingEmoji(v)}"`,
    );
    return newTag;
  });
}

module.exports = {
  ICON_NODES,
  ICON_ALIASES,
  resolveIconName,
  renderIconDataUri,
  applyIconsToXml,
};
