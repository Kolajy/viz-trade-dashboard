/* ============================================================
   MacroScope — Shared Utility Modules
   ============================================================ */

/**
 * Access a nested value in an object by dot-notation path.
 */
export function getValueByPath(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

/**
 * Linear color interpolation for imports/exports.
 */
export function getColorForValue(val, max, mode) {
  if (val === undefined || val === null || max === 0) return '#1c2230';
  
  // Power scale to boost visibility of lower-valued items
  const ratio = Math.pow(val / max, 0.6); 

  if (mode === 'exports') {
    // Transition from dark blue-gray #141822 (20, 24, 34) to Emerald #00c07f (0, 192, 127)
    const r = Math.round(20 + (0 - 20) * ratio);
    const g = Math.round(24 + (192 - 24) * ratio);
    const b = Math.round(34 + (127 - 34) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Transition from dark blue-gray #141822 (20, 24, 34) to Purple #8c52ff (140, 82, 255)
    const r = Math.round(20 + (140 - 20) * ratio);
    const g = Math.round(24 + (82 - 24) * ratio);
    const b = Math.round(34 + (255 - 34) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Diverging color scale for Trade Balance.
 * Deficits (negative) shaded towards red, surpluses (positive) shaded towards green.
 */
export function getDivergingColor(val, max, min) {
  if (val === undefined || val === null) return '#1c2230';

  if (val >= 0) {
    // Surplus: interpolate between dark base #141822 (20, 24, 34) and green #00c07f (0, 192, 127)
    const limit = max > 0 ? max : 1;
    const ratio = Math.pow(val / limit, 0.6);
    const r = Math.round(20 + (0 - 20) * ratio);
    const g = Math.round(24 + (192 - 24) * ratio);
    const b = Math.round(34 + (127 - 34) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Deficit: interpolate between dark base #141822 (20, 24, 34) and red #ff4c52 (255, 76, 82)
    const limit = min < 0 ? Math.abs(min) : 1;
    const ratio = Math.pow(Math.abs(val) / limit, 0.6);
    const r = Math.round(20 + (255 - 20) * ratio);
    const g = Math.round(24 + (76 - 24) * ratio);
    const b = Math.round(34 + (82 - 34) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/* Tooltip Management */
export function showTooltip(tooltipEl, event, htmlContent) {
  if (!tooltipEl) return;
  tooltipEl.innerHTML = htmlContent;
  tooltipEl.style.display = 'flex';
  tooltipEl.style.opacity = '1';
  moveTooltip(tooltipEl, event);
}

export function hideTooltip(tooltipEl) {
  if (!tooltipEl) return;
  tooltipEl.style.display = 'none';
  tooltipEl.style.opacity = '0';
}

export function moveTooltip(tooltipEl, event) {
  if (!tooltipEl) return;
  tooltipEl.style.left = `${event.clientX}px`;
  tooltipEl.style.top = `${event.clientY}px`;
}
