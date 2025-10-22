(() => {
  const toolTabs = document.querySelectorAll("[data-tool-target]");
  const toolViews = document.querySelectorAll("[data-tool]");
  const fontLoader = document.getElementById("font-loader");

  const exportHost = document.createElement("div");
  exportHost.style.position = "fixed";
  exportHost.style.left = "-9999px";
  exportHost.style.top = "0";
  exportHost.style.pointerEvents = "none";
  exportHost.style.zIndex = "-1";
  document.body.appendChild(exportHost);

  function getCurrentFontWeight(element) {
    if (!element) return "400";
    const weight = window.getComputedStyle(element).fontWeight;
    return /^\d+$/.test(weight) ? weight : "400";
  }

  function normaliseHex(input, fallback = "#ffffff") {
    let value = (input || fallback).toString().trim();
    if (!value) return fallback;
    if (!value.startsWith("#")) value = "#" + value;
    if (value.length === 4) {
      value = "#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
    }
    if (value.length !== 7) return fallback;
    return value.toLowerCase();
  }

  function hexToRgb(hex) {
    const value = normaliseHex(hex, "#ffffff").substring(1);
    const bigint = parseInt(value, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  }

  function rgbToHex(r, g, b) {
    const toHex = (component) => {
      const clamped = Math.max(0, Math.min(255, component));
      return clamped.toString(16).padStart(2, "0");
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  function hexToHsl(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rNorm:
          h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
          break;
        case gNorm:
          h = (bNorm - rNorm) / d + 2;
          break;
        case bNorm:
          h = (rNorm - gNorm) / d + 4;
          break;
        default:
          h = 0;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  function hslToHex(h, s, l) {
    const hNorm = ((h % 360) + 360) % 360 / 360;
    const sNorm = Math.max(0, Math.min(100, s)) / 100;
    const lNorm = Math.max(0, Math.min(100, l)) / 100;

    if (sNorm === 0) {
      const gray = Math.round(lNorm * 255);
      return rgbToHex(gray, gray, gray);
    }

    const hueToRgb = (p, q, t) => {
      let temp = t;
      if (temp < 0) temp += 1;
      if (temp > 1) temp -= 1;
      if (temp < 1 / 6) return p + (q - p) * 6 * temp;
      if (temp < 1 / 2) return q;
      if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
      return p;
    };

    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;

    const r = hueToRgb(p, q, hNorm + 1 / 3);
    const g = hueToRgb(p, q, hNorm);
    const b = hueToRgb(p, q, hNorm - 1 / 3);

    return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  }

  function adjustLightness(hex, delta) {
    const { h, s, l } = hexToHsl(hex);
    return hslToHex(h, s, l + delta);
  }

  function clamp(value, min, max, fallback) {
    if (Number.isNaN(value)) return fallback;
    return Math.min(Math.max(value, min), max);
  }

  function normalizeDimension(value, fallback) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function waitForNextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  async function waitForFonts() {
    if (document.fonts && typeof document.fonts.ready === "object") {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
    }
  }

  async function ensureFontReady(element, family, size) {
    if (!document.fonts || !family) return;
    const target = element || document.body;
    const resolvedSize = size || parseInt(window.getComputedStyle(target).fontSize, 10) || 16;
    const weight = getCurrentFontWeight(target);
    try {
      await document.fonts.load(weight + " " + resolvedSize + "px '" + family + "'");
    } catch {
      /* ignore */
    }
  }

  const fontCssCache = new Map();

  function buildFontHref(fontName) {
    const familyQuery = fontName.replace(/\s+/g, "+");
    return "https://fonts.googleapis.com/css2?family=" + familyQuery + ":wght@400;500;600;700&display=swap";
  }

  function applyFontFamilyToPreview(fontName, previewElement, state) {
    const trimmedName = (fontName || "").trim();
    if (!trimmedName || !previewElement) return;
    const href = buildFontHref(trimmedName);
    if (fontLoader && fontLoader.href !== href) {
      fontLoader.href = href;
      fontLoader.setAttribute("crossorigin", "anonymous");
    }
    previewElement.style.fontFamily = "'" + trimmedName + "', sans-serif";
    if (state) {
      state.family = trimmedName;
    }
    ensureFontReady(previewElement, trimmedName, state ? state.size : undefined);
  }

  async function getInlineFontCss() {
    const href = fontLoader ? fontLoader.href : "";
    if (!href) return "";

    if (fontCssCache.has(href)) {
      return fontCssCache.get(href);
    }

    try {
      const response = await fetch(href, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error("Failed to fetch font CSS");
      }
      let cssText = await response.text();
      const urlRegex = /url\(([^)]+)\)/g;
      const urls = new Set();
      let match;
      while ((match = urlRegex.exec(cssText))) {
        const rawUrl = match[1].trim().replace(/^['"]|['"]$/g, "");
        urls.add(rawUrl);
      }

      for (const url of urls) {
        try {
          const fontResponse = await fetch(url, { cache: "force-cache" });
          if (!fontResponse.ok) continue;
          const fontBlob = await fontResponse.blob();
          const dataUrl = await blobToDataUrl(fontBlob);
          const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          cssText = cssText.replace(new RegExp(escapedUrl, "g"), dataUrl);
        } catch (error) {
          console.warn("Не удалось встроить шрифт:", error);
        }
      }

      fontCssCache.set(href, cssText);
      return cssText;
    } catch (error) {
      console.warn("Не удалось получить CSS шрифта:", error);
      fontCssCache.set(href, "");
      return "";
    }
  }

  async function appendFontStyles(wrapper) {
    const cssText = await getInlineFontCss();
    if (!cssText) return;
    const style = document.createElement("style");
    style.textContent = cssText;
    wrapper.insertBefore(style, wrapper.firstChild);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function sanitiseFileName(base, suffix) {
    const trimmed = (base || "").trim().toLowerCase();
    const latinised = trimmed
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_.]/g, "");
    const safeBase = latinised || "asset";
    return safeBase + "-" + suffix + ".png";
  }

  // Button generator elements
  const previewButton = document.getElementById("previewButton");
  const previewLabel = previewButton?.querySelector('[data-role="preview-label"]');
  const glossLayer = previewButton?.querySelector('[data-role="gloss-layer"]');
  const noiseLayer = previewButton?.querySelector('[data-role="noise-layer"]');
  const buttonTextInput = document.getElementById("buttonText");
  const widthInput = document.getElementById("widthInput");
  const heightInput = document.getElementById("heightInput");
  const radiusInput = document.getElementById("radiusInput");
  const fontSelect = document.getElementById("fontSelect");
  const fontSizeInput = document.getElementById("fontSizeInput");
  const customFontWrapper = document.getElementById("customFontWrapper");
  const customFontNameInput = document.getElementById("customFontName");
  const alignHorizontalSelect = document.getElementById("alignHorizontal");
  const alignVerticalSelect = document.getElementById("alignVertical");
  const stateButtons = document.querySelectorAll("[data-preview-state]");
  const saveButtons = document.querySelectorAll("[data-save-state]");
  const colorNormalInput = document.getElementById("colorNormal");
  const colorHoverInput = document.getElementById("colorHover");
  const colorActiveInput = document.getElementById("colorActive");
  const colorTextInput = document.getElementById("colorText");
  const colorNoiseInput = document.getElementById("colorNoise");
  const noiseAmountInput = document.getElementById("noiseAmount");
  const noiseBlendSelect = document.getElementById("noiseBlend");
  const noiseRefreshButton = document.getElementById("noiseRefresh");

  const STATES = ["normal", "hover", "active"];
  let currentButtonState = "normal";
  let noiseDataUrl = "";

  const buttonFontState = {
    family: "Inter",
    size: Number(fontSizeInput?.value) || 16,
  };

  function applyStateColors(baseColor, state) {
    const normalised = normaliseHex(baseColor);
    const top = adjustLightness(normalised, 12);
    const bottom = adjustLightness(normalised, -18);
    previewButton.style.setProperty("--" + state + "-top", top);
    previewButton.style.setProperty("--" + state + "-bottom", bottom);
    previewButton.style.setProperty("--" + state + "-solid", normalised);
  }

  function updateTextColor(color) {
    previewButton.style.setProperty("--btn-text-color", normaliseHex(color));
  }

  function applyColorEffects() {
    applyStateColors(colorNormalInput.value, "normal");
    applyStateColors(colorHoverInput.value, "hover");
    applyStateColors(colorActiveInput.value, "active");
    updateTextColor(colorTextInput.value);
  }

  function generateNoisePattern(intensity) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(size, size);
    const { r, g, b } = hexToRgb(colorNoiseInput.value);

    for (let i = 0; i < imageData.data.length; i += 4) {
      const variation = (Math.random() - 0.5) * 80;
      imageData.data[i] = Math.max(0, Math.min(255, r + variation));
      imageData.data[i + 1] = Math.max(0, Math.min(255, g + variation));
      imageData.data[i + 2] = Math.max(0, Math.min(255, b + variation));
      const alpha = Math.random() * intensity;
      imageData.data[i + 3] = Math.max(0, Math.min(255, Math.floor(alpha * 255)));
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function updateNoise(forceRegenerate = false) {
    if (!noiseLayer) return;
    const amount = Number(noiseAmountInput.value) / 100;
    if (Number.isNaN(amount) || amount <= 0) {
      noiseLayer.style.opacity = "0";
      noiseLayer.style.backgroundImage = "none";
      noiseLayer.style.mixBlendMode = noiseBlendSelect.value;
      noiseLayer.style.backgroundSize = "128px 128px";
      noiseDataUrl = "";
      return;
    }

    if (forceRegenerate || !noiseDataUrl) {
      noiseDataUrl = generateNoisePattern(amount);
    }

    noiseLayer.style.backgroundImage = "url(" + noiseDataUrl + ")";
    noiseLayer.style.opacity = Math.min(1, Math.max(0, amount)).toFixed(2);
    noiseLayer.style.mixBlendMode = noiseBlendSelect.value;
    noiseLayer.style.backgroundSize = "128px 128px";
  }

  function setPreviewState(state) {
    if (!STATES.includes(state)) return;
    currentButtonState = state;
    previewButton.classList.remove(...STATES.map((s) => "state-" + s));
    previewButton.classList.add("state-" + state);
    stateButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.previewState === state);
    });
  }

  function updateButtonText() {
    const text = buttonTextInput.value.trim();
    const labelText = text || "Кнопка";
    if (previewLabel) {
      previewLabel.textContent = labelText;
    } else {
      previewButton.textContent = labelText;
    }
    previewButton.setAttribute("aria-label", labelText);
  }

  function updateButtonSize() {
    const width = normalizeDimension(widthInput.value, 176);
    const height = normalizeDimension(heightInput.value, 48);
    const radius = clamp(parseInt(radiusInput.value, 10), 0, 120, 6);

    widthInput.value = width;
    heightInput.value = height;
    radiusInput.value = radius;

    previewButton.style.width = width + "px";
    previewButton.style.height = height + "px";
    previewButton.style.borderRadius = radius + "px";
    if (glossLayer) {
      glossLayer.style.borderRadius = radius + "px";
    }
    if (noiseLayer) {
      noiseLayer.style.borderRadius = radius + "px";
    }
  }

  function updateAlignment() {
    const horizontal = alignHorizontalSelect.value;
    const vertical = alignVerticalSelect.value;

    previewButton.style.justifyContent = horizontal;
    previewButton.style.alignItems = vertical;

    const textAlignMap = {
      "flex-start": "left",
      center: "center",
      "flex-end": "right",
    };

    previewButton.style.textAlign = textAlignMap[horizontal] || "center";
  }

  function updateFontSize() {
    const size = clamp(parseInt(fontSizeInput.value, 10), 8, 120, 16);
    fontSizeInput.value = size;
    previewButton.style.fontSize = size + "px";
    buttonFontState.size = size;
    ensureFontReady(previewButton, buttonFontState.family, size);
  }

  function applyButtonFont(fontName) {
    applyFontFamilyToPreview(fontName, previewButton, buttonFontState);
  }

  function handleFontSelectChange() {
    const value = fontSelect.value;
    const isCustom = value === "custom";
    customFontWrapper.classList.toggle("hidden", !isCustom);
    if (isCustom) {
      customFontNameInput.focus();
    } else {
      applyButtonFont(value);
    }
  }

  function updateCustomFont() {
    const name = customFontNameInput.value.trim();
    if (name) {
      applyButtonFont(name);
    }
  }

  function copyComputedFontStyles(source, target) {
    const computed = window.getComputedStyle(source);
    target.style.fontFamily = computed.fontFamily;
    target.style.fontSize = computed.fontSize;
    target.style.fontWeight = computed.fontWeight;
    target.style.lineHeight = computed.lineHeight;
    target.style.letterSpacing = computed.letterSpacing;

    const targetLabel = target.querySelector('[data-role="preview-label"]') || target.querySelector('span');
    if (targetLabel) {
      targetLabel.style.fontFamily = computed.fontFamily;
      targetLabel.style.fontSize = computed.fontSize;
      targetLabel.style.fontWeight = computed.fontWeight;
      targetLabel.style.lineHeight = computed.lineHeight;
      targetLabel.style.letterSpacing = computed.letterSpacing;
    }
  }

  async function downloadState(state) {
    if (typeof domtoimage !== "object" || typeof domtoimage.toPng !== "function") {
      alert("Не удалось найти dom-to-image. Проверьте подключение библиотеки.");
      return;
    }

    applyButtonFont(buttonFontState.family);

    const exportButton = previewButton.cloneNode(true);
    exportButton.removeAttribute("id");
    const exportLabel = exportButton.querySelector('[data-role="preview-label"]');
    if (exportLabel) {
      exportLabel.removeAttribute("data-role");
    }
    exportButton.classList.remove(...STATES.map((s) => "state-" + s));
    exportButton.classList.add("state-" + state);
    copyComputedFontStyles(previewButton, exportButton);

    const exportGloss = exportButton.querySelector('[data-role="gloss-layer"]');
    if (exportGloss && glossLayer) {
      exportGloss.style.cssText = glossLayer.style.cssText;
    }
    const exportNoise = exportButton.querySelector('[data-role="noise-layer"]');
    if (exportNoise && noiseLayer) {
      exportNoise.style.cssText = noiseLayer.style.cssText;
    }

    const exportWrapper = document.createElement("div");
    exportWrapper.style.display = "inline-block";
    exportWrapper.style.padding = "0";
    exportWrapper.style.margin = "0";
    exportWrapper.style.background = "transparent";
    exportWrapper.appendChild(exportButton);
    exportHost.appendChild(exportWrapper);

    await waitForFonts();
    await ensureFontReady(previewButton, buttonFontState.family, buttonFontState.size);
    await appendFontStyles(exportWrapper);
    await waitForNextFrame();

    try {
      const dataUrl = await domtoimage.toPng(exportWrapper, {
        cacheBust: true,
        pixelRatio: 1,
        bgcolor: "rgba(0,0,0,0)",
      });
      const link = document.createElement("a");
      link.download = sanitiseFileName(buttonTextInput.value, state);
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Не удалось сформировать изображение кнопки:", error);
      alert("Не получилось сохранить изображение. Попробуйте ещё раз.");
    } finally {
      exportHost.removeChild(exportWrapper);
    }
  }

  // Label generator elements
  const labelPreview = document.getElementById("labelPreview");
  const labelTextInput = document.getElementById("labelText");
  const labelFontSelect = document.getElementById("labelFontSelect");
  const labelCustomFontWrapper = document.getElementById("labelCustomFontWrapper");
  const labelCustomFontNameInput = document.getElementById("labelCustomFontName");
  const labelFontSizeInput = document.getElementById("labelFontSize");
  const labelStrokeToggle = document.getElementById("labelStrokeToggle");
  const labelStrokeWidthInput = document.getElementById("labelStrokeWidth");
  const labelStrokeColorInput = document.getElementById("labelStrokeColor");
  const labelGradientToggle = document.getElementById("labelGradientToggle");
  const labelGradientStartInput = document.getElementById("labelGradientStart");
  const labelGradientEndInput = document.getElementById("labelGradientEnd");
  const labelGradientAngleInput = document.getElementById("labelGradientAngle");
  const labelSolidColorInput = document.getElementById("labelSolidColor");
  const labelShadowXInput = document.getElementById("labelShadowX");
  const labelShadowYInput = document.getElementById("labelShadowY");
  const labelShadowBlurInput = document.getElementById("labelShadowBlur");
  const labelShadowColorInput = document.getElementById("labelShadowColor");
  const labelDownloadButton = document.getElementById("labelDownload");

  const labelFontState = {
    family: "Inter",
    size: Number(labelFontSizeInput?.value) || 104,
  };

  function updateLabelText() {
    const value = labelTextInput.value.trim() || "Надпись";
    labelPreview.textContent = value;
    labelPreview.setAttribute("aria-label", value);
  }

  function applyLabelFont(fontName) {
    applyFontFamilyToPreview(fontName, labelPreview, labelFontState);
  }

  function handleLabelFontChange() {
    const value = labelFontSelect.value;
    const isCustom = value === "custom";
    labelCustomFontWrapper.classList.toggle("hidden", !isCustom);
    if (isCustom) {
      labelCustomFontNameInput.focus();
    } else {
      applyLabelFont(value);
    }
  }

  function updateLabelCustomFont() {
    const name = labelCustomFontNameInput.value.trim();
    if (name) {
      applyLabelFont(name);
    }
  }

  function updateLabelFontSize() {
    const size = clamp(parseInt(labelFontSizeInput.value, 10), 16, 240, 104);
    labelFontSizeInput.value = size;
    labelPreview.style.fontSize = size + "px";
    labelFontState.size = size;
    ensureFontReady(labelPreview, labelFontState.family, size);
  }

  function updateLabelStroke() {
    const enabled = labelStrokeToggle.checked;
    const width = clamp(parseFloat(labelStrokeWidthInput.value), 0, 24, 0);
    const color = normaliseHex(labelStrokeColorInput.value, "#000000");
    labelStrokeWidthInput.value = width;
    labelStrokeColorInput.value = color;

    const strokeWidth = enabled ? width : 0;
    labelPreview.style.webkitTextStrokeWidth = strokeWidth + "px";
    labelPreview.style.webkitTextStrokeColor = color;
    labelPreview.style.textStrokeWidth = strokeWidth + "px";
    labelPreview.style.textStrokeColor = color;
  }

  function updateLabelGradient() {
    const enabled = labelGradientToggle.checked;
    const start = normaliseHex(labelGradientStartInput.value, "#ffcc5f");
    const end = normaliseHex(labelGradientEndInput.value, "#7a2100");
    const angle = clamp(parseInt(labelGradientAngleInput.value, 10), 0, 360, 90);
    const solid = normaliseHex(labelSolidColorInput.value, "#ffffff");

    labelGradientStartInput.value = start;
    labelGradientEndInput.value = end;
    labelGradientAngleInput.value = angle;
    labelSolidColorInput.value = solid;

    if (enabled) {
      labelPreview.style.backgroundImage = "linear-gradient(" + angle + "deg, " + start + ", " + end + ")";
      labelPreview.style.webkitTextFillColor = "transparent";
      labelPreview.style.color = "transparent";
    } else {
      labelPreview.style.backgroundImage = "none";
      labelPreview.style.webkitTextFillColor = solid;
      labelPreview.style.color = solid;
    }
  }

  function updateLabelShadow() {
    const offsetX = parseFloat(labelShadowXInput.value) || 0;
    const offsetY = parseFloat(labelShadowYInput.value) || 0;
    const blur = clamp(parseFloat(labelShadowBlurInput.value), 0, 120, 12);
    const color = normaliseHex(labelShadowColorInput.value, "#160400");

    labelShadowBlurInput.value = blur;
    labelShadowColorInput.value = color;
    labelPreview.style.textShadow = offsetX + "px " + offsetY + "px " + blur + "px " + color;
  }

  async function downloadLabelImage() {
    if (typeof domtoimage !== "object" || typeof domtoimage.toPng !== "function") {
      alert("Не удалось найти dom-to-image. Проверьте подключение библиотеки.");
      return;
    }

    applyLabelFont(labelFontState.family);

    const exportLabel = labelPreview.cloneNode(true);
    exportLabel.removeAttribute("id");
    exportLabel.removeAttribute("role");

    const exportWrapper = document.createElement("div");
    exportWrapper.style.display = "inline-flex";
    exportWrapper.style.alignItems = "center";
    exportWrapper.style.justifyContent = "center";
    exportWrapper.style.padding = "32px";
    exportWrapper.style.background = "transparent";
    exportWrapper.appendChild(exportLabel);
    exportHost.appendChild(exportWrapper);

    await waitForFonts();
    await ensureFontReady(labelPreview, labelFontState.family, labelFontState.size);
    await appendFontStyles(exportWrapper);
    await waitForNextFrame();

    try {
      const dataUrl = await domtoimage.toPng(exportWrapper, {
        cacheBust: true,
        pixelRatio: 1,
        bgcolor: "rgba(0,0,0,0)",
      });
      const link = document.createElement("a");
      link.download = sanitiseFileName(labelTextInput.value, "label");
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Не удалось сохранить надпись:", error);
      alert("Не получилось сохранить изображение. Попробуйте ещё раз.");
    } finally {
      exportHost.removeChild(exportWrapper);
    }
  }

  // Event bindings
  if (buttonTextInput) {
    buttonTextInput.addEventListener("input", updateButtonText);
  }
  if (widthInput && heightInput && radiusInput) {
    widthInput.addEventListener("input", updateButtonSize);
    heightInput.addEventListener("input", updateButtonSize);
    radiusInput.addEventListener("input", updateButtonSize);
  }
  if (alignHorizontalSelect && alignVerticalSelect) {
    alignHorizontalSelect.addEventListener("change", updateAlignment);
    alignVerticalSelect.addEventListener("change", updateAlignment);
  }
  if (fontSelect) {
    fontSelect.addEventListener("change", handleFontSelectChange);
  }
  if (fontSizeInput) {
    fontSizeInput.addEventListener("input", updateFontSize);
  }
  if (customFontNameInput) {
    customFontNameInput.addEventListener("input", updateCustomFont);
  }
  if (colorNormalInput) {
    colorNormalInput.addEventListener("input", () => {
      applyColorEffects();
      updateNoise(true);
    });
  }
  if (colorHoverInput) {
    colorHoverInput.addEventListener("input", applyColorEffects);
  }
  if (colorActiveInput) {
    colorActiveInput.addEventListener("input", applyColorEffects);
  }
  if (colorTextInput) {
    colorTextInput.addEventListener("input", applyColorEffects);
  }
  if (colorNoiseInput) {
    colorNoiseInput.addEventListener("input", () => updateNoise(true));
  }
  if (noiseAmountInput) {
    noiseAmountInput.addEventListener("input", () => updateNoise(true));
  }
  if (noiseBlendSelect) {
    noiseBlendSelect.addEventListener("change", () => updateNoise(false));
  }
  if (noiseRefreshButton) {
    noiseRefreshButton.addEventListener("click", () => updateNoise(true));
  }

  stateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setPreviewState(button.dataset.previewState);
    });
  });

  saveButtons.forEach((button) => {
    button.addEventListener("click", () => downloadState(button.dataset.saveState));
  });

  if (labelTextInput) {
    labelTextInput.addEventListener("input", updateLabelText);
  }
  if (labelFontSelect) {
    labelFontSelect.addEventListener("change", handleLabelFontChange);
  }
  if (labelCustomFontNameInput) {
    labelCustomFontNameInput.addEventListener("input", updateLabelCustomFont);
  }
  if (labelFontSizeInput) {
    labelFontSizeInput.addEventListener("input", updateLabelFontSize);
  }
  if (labelStrokeToggle) {
    labelStrokeToggle.addEventListener("change", updateLabelStroke);
  }
  if (labelStrokeWidthInput) {
    labelStrokeWidthInput.addEventListener("input", updateLabelStroke);
  }
  if (labelStrokeColorInput) {
    labelStrokeColorInput.addEventListener("input", updateLabelStroke);
  }
  if (labelGradientToggle) {
    labelGradientToggle.addEventListener("change", updateLabelGradient);
  }
  if (labelGradientStartInput) {
    labelGradientStartInput.addEventListener("input", updateLabelGradient);
  }
  if (labelGradientEndInput) {
    labelGradientEndInput.addEventListener("input", updateLabelGradient);
  }
  if (labelGradientAngleInput) {
    labelGradientAngleInput.addEventListener("input", updateLabelGradient);
  }
  if (labelSolidColorInput) {
    labelSolidColorInput.addEventListener("input", updateLabelGradient);
  }
  if (labelShadowXInput) {
    labelShadowXInput.addEventListener("input", updateLabelShadow);
  }
  if (labelShadowYInput) {
    labelShadowYInput.addEventListener("input", updateLabelShadow);
  }
  if (labelShadowBlurInput) {
    labelShadowBlurInput.addEventListener("input", updateLabelShadow);
  }
  if (labelShadowColorInput) {
    labelShadowColorInput.addEventListener("input", updateLabelShadow);
  }
  if (labelDownloadButton) {
    labelDownloadButton.addEventListener("click", downloadLabelImage);
  }

  // Initial render
  if (previewButton) {
    updateButtonText();
    updateButtonSize();
    updateAlignment();
    updateFontSize();
    applyButtonFont(fontSelect.value);
    applyColorEffects();
    updateNoise(true);
    setPreviewState(currentButtonState);
  }

  if (labelPreview) {
    updateLabelText();
    updateLabelFontSize();
    applyLabelFont(labelFontSelect.value);
    updateLabelStroke();
    updateLabelGradient();
    updateLabelShadow();
  }

  function activateTool(toolName) {
    const safeName = toolName || "button";
    toolTabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.toolTarget === safeName);
    });
    toolViews.forEach((view) => {
      const matches = view.dataset.tool === safeName;
      view.classList.toggle("hidden", !matches);
    });

    if (safeName === "button" && buttonTextInput) {
      buttonTextInput.focus({ preventScroll: true });
    } else if (safeName === "label" && labelTextInput) {
      labelTextInput.focus({ preventScroll: true });
    }
  }

  toolTabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTool(tab.dataset.toolTarget));
  });

  activateTool("button");
})();
