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

  function hexToRgbaString(hex, alpha = 1) {
    const normalisedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${normalisedAlpha.toFixed(2)})`;
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
  const borderWidthInput = document.getElementById("borderWidth");
  const borderColorInput = document.getElementById("borderColor");
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

  function updateBorderStyles() {
    if (!previewButton) return;

    const widthValue = clamp(parseInt(borderWidthInput?.value, 10), 0, 16, 0);
    if (borderWidthInput) {
      borderWidthInput.value = widthValue;
    }

    const baseColorInput = borderColorInput ? borderColorInput.value : "#000000";
    const baseColor = normaliseHex(baseColorInput, "#000000");
    if (borderColorInput) {
      borderColorInput.value = baseColor;
    }

    previewButton.style.setProperty("--btn-border-width", widthValue + "px");

    if (widthValue > 0) {
      const highlight = adjustLightness(baseColor, 40);
      const shadow = adjustLightness(baseColor, -35);
      previewButton.style.setProperty("--btn-border-color", baseColor);
      previewButton.style.setProperty("--btn-border-highlight", highlight);
      previewButton.style.setProperty("--btn-border-shadow", shadow);
      previewButton.style.setProperty("--btn-border-glow", hexToRgbaString(baseColor, 0.45));
      previewButton.style.setProperty("--btn-border-overlay-opacity", "1");
    } else {
      previewButton.style.setProperty("--btn-border-color", "transparent");
      previewButton.style.setProperty("--btn-border-highlight", "transparent");
      previewButton.style.setProperty("--btn-border-shadow", "transparent");
      previewButton.style.setProperty("--btn-border-glow", "rgba(0, 0, 0, 0)");
      previewButton.style.setProperty("--btn-border-overlay-opacity", "0");
    }

    previewButton.classList.toggle("has-border", widthValue > 0);
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

  // Nine-patch generator elements
  const nineTextInput = document.getElementById("nineText");
  const nineFontSelect = document.getElementById("nineFontSelect");
  const nineCustomFontWrapper = document.getElementById("nineCustomFontWrapper");
  const nineCustomFontNameInput = document.getElementById("nineCustomFontName");
  const nineFontSizeInput = document.getElementById("nineFontSize");
  const nineAlignHorizontalSelect = document.getElementById("nineAlignHorizontal");
  const nineAlignVerticalSelect = document.getElementById("nineAlignVertical");
  const nineTextColorInput = document.getElementById("nineTextColor");
  const nineStateButtons = document.querySelectorAll("[data-nine-state]");
  const nineSliceInputs = document.querySelectorAll("[data-nine-slice]");
  const ninePaddingInputs = document.querySelectorAll("[data-nine-padding]");
  const nineSaveButtons = document.querySelectorAll("[data-nine-save]");
  const nineCanvasElements = {
    normal: document.getElementById("nineCanvasNormal"),
    hover: document.getElementById("nineCanvasHover"),
    active: document.getElementById("nineCanvasActive"),
  };

  const nineFontProbe = document.createElement("span");
  nineFontProbe.style.position = "absolute";
  nineFontProbe.style.left = "-9999px";
  nineFontProbe.style.top = "0";
  nineFontProbe.style.visibility = "hidden";
  nineFontProbe.style.pointerEvents = "none";
  nineFontProbe.textContent = "Aa";
  if (document.body) {
    document.body.appendChild(nineFontProbe);
  }

  const nineMeasureCanvas = document.createElement("canvas");
  const nineMeasureContext = nineMeasureCanvas.getContext("2d");

  const NINE_STATE_KEYS = ["normal", "hover", "active"];
  const NINE_STORAGE_KEY = "ui-creater-ninepatch-config-v1";
  const nineImageSources = {
    normal: "assets/paramUp.png",
    hover: "assets/paramHover.png",
    active: "assets/paramDown.png",
  };

  const nineImages = {};
  let nineImagesReady = false;
  let currentNineState = "normal";
  const NINE_TEXT_FALLBACK = "Параметр";

  const defaultNineSlices = { top: 16, right: 16, bottom: 16, left: 16 };
  const defaultNinePadding = { top: 16, right: 24, bottom: 16, left: 24 };

  const nineConfig = {
    text: nineTextInput ? nineTextInput.value : NINE_TEXT_FALLBACK,
    fontFamily: "Inter",
    fontSize: Number(nineFontSizeInput?.value) || 20,
    alignHorizontal: nineAlignHorizontalSelect?.value || "center",
    alignVertical: nineAlignVerticalSelect?.value || "center",
    textColor: nineTextColorInput?.value || "#ffffff",
    states: {
      normal: { slices: { ...defaultNineSlices }, padding: { ...defaultNinePadding } },
      hover: { slices: { ...defaultNineSlices }, padding: { ...defaultNinePadding } },
      active: { slices: { ...defaultNineSlices }, padding: { ...defaultNinePadding } },
    },
  };

  function cloneInsets(source, fallback) {
    return {
      top: Number.isFinite(source?.top) ? source.top : fallback.top,
      right: Number.isFinite(source?.right) ? source.right : fallback.right,
      bottom: Number.isFinite(source?.bottom) ? source.bottom : fallback.bottom,
      left: Number.isFinite(source?.left) ? source.left : fallback.left,
    };
  }

  function persistNineConfig() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const payload = {
        text: nineConfig.text,
        fontFamily: nineConfig.fontFamily,
        fontSize: nineConfig.fontSize,
        alignHorizontal: nineConfig.alignHorizontal,
        alignVertical: nineConfig.alignVertical,
        textColor: nineConfig.textColor,
        states: {
          normal: {
            slices: { ...nineConfig.states.normal.slices },
            padding: { ...nineConfig.states.normal.padding },
          },
          hover: {
            slices: { ...nineConfig.states.hover.slices },
            padding: { ...nineConfig.states.hover.padding },
          },
          active: {
            slices: { ...nineConfig.states.active.slices },
            padding: { ...nineConfig.states.active.padding },
          },
        },
      };
      window.localStorage.setItem(NINE_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Не удалось сохранить настройки nine-patch:", error);
    }
  }

  function loadNineConfigFromStorage() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const stored = window.localStorage.getItem(NINE_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;

      if (typeof parsed.text === "string" && nineTextInput) {
        nineTextInput.value = parsed.text;
        nineConfig.text = parsed.text;
      }
      if (typeof parsed.fontSize === "number" && Number.isFinite(parsed.fontSize)) {
        nineConfig.fontSize = clamp(parsed.fontSize, 8, 240, nineConfig.fontSize);
        if (nineFontSizeInput) {
          nineFontSizeInput.value = nineConfig.fontSize;
        }
      }
      if (typeof parsed.alignHorizontal === "string") {
        nineConfig.alignHorizontal = parsed.alignHorizontal;
        if (nineAlignHorizontalSelect) {
          nineAlignHorizontalSelect.value = parsed.alignHorizontal;
        }
      }
      if (typeof parsed.alignVertical === "string") {
        nineConfig.alignVertical = parsed.alignVertical;
        if (nineAlignVerticalSelect) {
          nineAlignVerticalSelect.value = parsed.alignVertical;
        }
      }
      if (typeof parsed.textColor === "string") {
        const colour = normaliseHex(parsed.textColor, nineConfig.textColor);
        nineConfig.textColor = colour;
        if (nineTextColorInput) {
          nineTextColorInput.value = colour;
        }
      }
      if (typeof parsed.fontFamily === "string") {
        nineConfig.fontFamily = parsed.fontFamily;
      }

      if (parsed.states && typeof parsed.states === "object") {
        NINE_STATE_KEYS.forEach((state) => {
          const stateData = parsed.states[state];
          if (!stateData || typeof stateData !== "object") return;
          nineConfig.states[state] = {
            slices: cloneInsets(stateData.slices, defaultNineSlices),
            padding: cloneInsets(stateData.padding, defaultNinePadding),
          };
        });
      }
    } catch (error) {
      console.warn("Не удалось загрузить настройки nine-patch:", error);
    }
  }

  function setNineFontFamily(fontName, options = {}) {
    const trimmed = (fontName || "").trim() || "Inter";
    nineConfig.fontFamily = trimmed;
    const href = buildFontHref(trimmed);
    if (fontLoader && fontLoader.href !== href) {
      fontLoader.href = href;
      fontLoader.setAttribute("crossorigin", "anonymous");
    }
    nineFontProbe.style.fontFamily = "'" + trimmed + "', sans-serif";
    ensureFontReady(nineFontProbe, trimmed, nineConfig.fontSize);
    if (!options.skipRender) {
      renderNinePreviews();
    }
    if (!options.skipPersist) {
      persistNineConfig();
    }
  }

  function handleNineFontChange() {
    if (!nineFontSelect) return;
    const value = nineFontSelect.value;
    const isCustom = value === "custom";
    if (nineCustomFontWrapper) {
      nineCustomFontWrapper.classList.toggle("hidden", !isCustom);
    }
    if (isCustom) {
      nineCustomFontNameInput?.focus();
    } else {
      setNineFontFamily(value);
    }
  }

  function updateNineCustomFont() {
    const name = nineCustomFontNameInput?.value || "";
    if (name.trim()) {
      setNineFontFamily(name);
    }
  }

  function updateNineText() {
    if (!nineTextInput) return;
    const value = nineTextInput.value.trim();
    nineConfig.text = value || NINE_TEXT_FALLBACK;
    persistNineConfig();
    renderNinePreviews();
  }

  function updateNineFontSize() {
    if (!nineFontSizeInput) return;
    const size = clamp(parseInt(nineFontSizeInput.value, 10), 8, 240, nineConfig.fontSize);
    nineConfig.fontSize = size;
    nineFontSizeInput.value = size;
    ensureFontReady(nineFontProbe, nineConfig.fontFamily, size);
    persistNineConfig();
    renderNinePreviews();
  }

  function updateNineAlignment() {
    if (nineAlignHorizontalSelect) {
      nineConfig.alignHorizontal = nineAlignHorizontalSelect.value;
    }
    if (nineAlignVerticalSelect) {
      nineConfig.alignVertical = nineAlignVerticalSelect.value;
    }
    persistNineConfig();
    renderNinePreviews();
  }

  function updateNineTextColor() {
    if (!nineTextColorInput) return;
    const colour = normaliseHex(nineTextColorInput.value, nineConfig.textColor);
    nineConfig.textColor = colour;
    nineTextColorInput.value = colour;
    persistNineConfig();
    renderNinePreviews();
  }

  function setNineActiveState(state) {
    if (!NINE_STATE_KEYS.includes(state)) return;
    currentNineState = state;
    nineStateButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.nineState === state);
    });
    syncNineStateControls();
  }

  function syncNineStateControls() {
    const stateConfig = nineConfig.states[currentNineState];
    if (!stateConfig) return;
    nineSliceInputs.forEach((input) => {
      const key = input.dataset.nineSlice;
      if (!key) return;
      const value = stateConfig.slices[key];
      if (Number.isFinite(value)) {
        input.value = Math.max(0, Math.round(value));
      }
    });
    ninePaddingInputs.forEach((input) => {
      const key = input.dataset.ninePadding;
      if (!key) return;
      const value = stateConfig.padding[key];
      if (Number.isFinite(value)) {
        input.value = Math.max(0, Math.round(value));
      }
    });
  }

  function updateNineSliceValue(input, key, rawValue) {
    const stateConfig = nineConfig.states[currentNineState];
    if (!stateConfig || !(key in stateConfig.slices)) return;
    const image = nineImages[currentNineState];
    const dimension = key === "top" || key === "bottom"
      ? image?.naturalHeight || 512
      : image?.naturalWidth || 512;
    const numeric = clamp(parseInt(rawValue, 10), 0, dimension, stateConfig.slices[key]);
    stateConfig.slices[key] = numeric;
    if (input) {
      input.value = numeric;
    }
    persistNineConfig();
    renderNinePreviews();
  }

  function updateNinePaddingValue(input, key, rawValue) {
    const stateConfig = nineConfig.states[currentNineState];
    if (!stateConfig || !(key in stateConfig.padding)) return;
    const numeric = Math.max(0, parseInt(rawValue, 10));
    stateConfig.padding[key] = Number.isFinite(numeric) ? numeric : stateConfig.padding[key];
    if (input && Number.isFinite(numeric)) {
      input.value = numeric;
    }
    persistNineConfig();
    renderNinePreviews();
  }

  function normaliseNineSlices(slices, image) {
    if (!image) return { ...slices };
    const sw = image.naturalWidth || image.width;
    const sh = image.naturalHeight || image.height;
    const top = clamp(Math.round(slices.top || 0), 0, sh, 0);
    const bottom = clamp(Math.round(slices.bottom || 0), 0, sh - top, 0);
    const left = clamp(Math.round(slices.left || 0), 0, sw, 0);
    const right = clamp(Math.round(slices.right || 0), 0, sw - left, 0);
    const maxBottom = Math.max(0, sh - top);
    const safeBottom = Math.min(bottom, maxBottom);
    const maxRight = Math.max(0, sw - left);
    const safeRight = Math.min(right, maxRight);
    return { top, right: safeRight, bottom: safeBottom, left };
  }

  function drawNinePatch(canvas, image, width, height, slices) {
    if (!canvas || !image) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.clearRect(0, 0, targetWidth, targetHeight);

    const sw = image.naturalWidth;
    const sh = image.naturalHeight;
    const { top, right, bottom, left } = normaliseNineSlices(slices, image);

    const centerWidth = Math.max(0, sw - left - right);
    const centerHeight = Math.max(0, sh - top - bottom);
    const destCenterWidth = Math.max(0, targetWidth - left - right);
    const destCenterHeight = Math.max(0, targetHeight - top - bottom);

    const drawPart = (sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) => {
      if (sWidth <= 0 || sHeight <= 0 || dWidth <= 0 || dHeight <= 0) return;
      ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    };

    // Corners
    drawPart(0, 0, left, top, 0, 0, left, top);
    drawPart(sw - right, 0, right, top, targetWidth - right, 0, right, top);
    drawPart(0, sh - bottom, left, bottom, 0, targetHeight - bottom, left, bottom);
    drawPart(sw - right, sh - bottom, right, bottom, targetWidth - right, targetHeight - bottom, right, bottom);

    // Edges
    drawPart(left, 0, centerWidth, top, left, 0, destCenterWidth, top);
    drawPart(left, sh - bottom, centerWidth, bottom, left, targetHeight - bottom, destCenterWidth, bottom);
    drawPart(0, top, left, centerHeight, 0, top, left, destCenterHeight);
    drawPart(sw - right, top, right, centerHeight, targetWidth - right, top, right, destCenterHeight);

    // Center
    drawPart(left, top, centerWidth, centerHeight, left, top, destCenterWidth, destCenterHeight);

    return ctx;
  }

  function drawNineText(ctx, canvas, text, padding) {
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.font = "600 " + nineConfig.fontSize + "px '" + nineConfig.fontFamily + "'";
    ctx.fillStyle = normaliseHex(nineConfig.textColor, "#ffffff");
    const alignMap = {
      "flex-start": "left",
      center: "center",
      "flex-end": "right",
    };
    const baselineMap = {
      "flex-start": "top",
      center: "middle",
      "flex-end": "bottom",
    };
    const width = canvas.width;
    const height = canvas.height;
    const padTop = Math.max(0, padding.top || 0);
    const padRight = Math.max(0, padding.right || 0);
    const padBottom = Math.max(0, padding.bottom || 0);
    const padLeft = Math.max(0, padding.left || 0);
    const contentWidth = Math.max(0, width - padLeft - padRight);
    const contentHeight = Math.max(0, height - padTop - padBottom);

    ctx.textAlign = alignMap[nineConfig.alignHorizontal] || "center";
    ctx.textBaseline = baselineMap[nineConfig.alignVertical] || "middle";

    let x;
    switch (ctx.textAlign) {
      case "left":
        x = padLeft;
        break;
      case "right":
        x = width - padRight;
        break;
      default:
        x = padLeft + contentWidth / 2;
        break;
    }

    let y;
    switch (ctx.textBaseline) {
      case "top":
        y = padTop;
        break;
      case "bottom":
        y = height - padBottom;
        break;
      default:
        y = padTop + contentHeight / 2;
        break;
    }

    ctx.fillText(text, x, y);
    ctx.restore();
  }

  async function renderNinePreviews() {
    if (!nineTextInput) return;
    const textValue = (nineConfig.text || "").trim() || NINE_TEXT_FALLBACK;
    const fontSize = nineConfig.fontSize;
    const fontFamily = nineConfig.fontFamily;

    if (nineMeasureContext) {
      nineMeasureContext.font = "600 " + fontSize + "px '" + fontFamily + "'";
    }

    const metrics = nineMeasureContext ? nineMeasureContext.measureText(textValue) : null;
    const measuredWidth = metrics ? metrics.width : fontSize * textValue.length * 0.6;
    const measuredHeight = metrics && metrics.actualBoundingBoxAscent && metrics.actualBoundingBoxDescent
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : fontSize * 1.25;

    let targetWidth = 0;
    let targetHeight = 0;

    NINE_STATE_KEYS.forEach((state) => {
      const stateConfig = nineConfig.states[state];
      const image = nineImages[state];
      if (!stateConfig || !image) return;
      const slices = stateConfig.slices;
      const padding = stateConfig.padding;
      const minWidth = Math.max(image.naturalWidth, (slices.left || 0) + (slices.right || 0));
      const minHeight = Math.max(image.naturalHeight, (slices.top || 0) + (slices.bottom || 0));
      const paddedWidth = measuredWidth + (padding.left || 0) + (padding.right || 0);
      const paddedHeight = measuredHeight + (padding.top || 0) + (padding.bottom || 0);
      targetWidth = Math.max(targetWidth, minWidth, paddedWidth);
      targetHeight = Math.max(targetHeight, minHeight, paddedHeight);
    });

    targetWidth = Math.ceil(targetWidth);
    targetHeight = Math.ceil(targetHeight);

    await ensureFontReady(nineFontProbe, fontFamily, fontSize);

    if (!nineImagesReady) return;

    NINE_STATE_KEYS.forEach((state) => {
      const canvas = nineCanvasElements[state];
      const image = nineImages[state];
      const stateConfig = nineConfig.states[state];
      if (!canvas || !image || !stateConfig) return;
      const ctx = drawNinePatch(canvas, image, targetWidth, targetHeight, stateConfig.slices);
      if (!ctx) return;
      drawNineText(ctx, canvas, textValue, stateConfig.padding);
    });
  }

  function downloadNineState(state) {
    const canvas = nineCanvasElements[state];
    if (!canvas) return;
    const fileName = sanitiseFileName(nineConfig.text || NINE_TEXT_FALLBACK, "nine-" + state);
    canvas.toBlob((blob) => {
      if (!blob) {
        const fallbackUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = fileName;
        link.href = fallbackUrl;
        link.click();
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  function loadNineImages() {
    const promises = NINE_STATE_KEYS.map((state) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(image);
      image.src = nineImageSources[state];
      nineImages[state] = image;
    }));
    return Promise.all(promises);
  }

  function initialiseNinePatch() {
    if (!nineTextInput) return;
    loadNineConfigFromStorage();

    if (nineFontSelect) {
      const options = Array.from(nineFontSelect.options || []);
      const hasOption = options.some((option) => option.value === nineConfig.fontFamily);
      if (hasOption) {
        nineFontSelect.value = nineConfig.fontFamily;
        if (nineCustomFontWrapper) {
          nineCustomFontWrapper.classList.add("hidden");
        }
      } else {
        nineFontSelect.value = "custom";
        if (nineCustomFontWrapper) {
          nineCustomFontWrapper.classList.remove("hidden");
        }
        if (nineCustomFontNameInput) {
          nineCustomFontNameInput.value = nineConfig.fontFamily;
        }
      }
    }

    setNineFontFamily(nineConfig.fontFamily, { skipPersist: true, skipRender: true });
    setNineActiveState(currentNineState);

    loadNineImages().then(() => {
      nineImagesReady = true;
      renderNinePreviews();
    });
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
  if (borderWidthInput) {
    borderWidthInput.addEventListener("input", updateBorderStyles);
  }
  if (borderColorInput) {
    borderColorInput.addEventListener("input", updateBorderStyles);
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
  if (labelDownloadButton) {
    labelDownloadButton.addEventListener("click", downloadLabelImage);
  }

  if (nineTextInput) {
    nineTextInput.addEventListener("input", updateNineText);
  }
  if (nineFontSelect) {
    nineFontSelect.addEventListener("change", handleNineFontChange);
  }
  if (nineCustomFontNameInput) {
    nineCustomFontNameInput.addEventListener("input", updateNineCustomFont);
  }
  if (nineFontSizeInput) {
    nineFontSizeInput.addEventListener("input", updateNineFontSize);
  }
  if (nineAlignHorizontalSelect) {
    nineAlignHorizontalSelect.addEventListener("change", updateNineAlignment);
  }
  if (nineAlignVerticalSelect) {
    nineAlignVerticalSelect.addEventListener("change", updateNineAlignment);
  }
  if (nineTextColorInput) {
    nineTextColorInput.addEventListener("input", updateNineTextColor);
  }

  nineStateButtons.forEach((button) => {
    button.addEventListener("click", () => setNineActiveState(button.dataset.nineState));
  });

  nineSliceInputs.forEach((input) => {
    input.addEventListener("input", () => updateNineSliceValue(input, input.dataset.nineSlice, input.value));
  });

  ninePaddingInputs.forEach((input) => {
    input.addEventListener("input", () => updateNinePaddingValue(input, input.dataset.ninePadding, input.value));
  });

  nineSaveButtons.forEach((button) => {
    button.addEventListener("click", () => downloadNineState(button.dataset.nineSave));
  });

  // Initial render
  if (previewButton) {
    updateButtonText();
    updateButtonSize();
    updateAlignment();
    updateBorderStyles();
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
    labelPreview.style.textShadow = "none";
  }

  initialiseNinePatch();

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
    } else if (safeName === "ninepatch" && nineTextInput) {
      nineTextInput.focus({ preventScroll: true });
    } else if (safeName === "label" && labelTextInput) {
      labelTextInput.focus({ preventScroll: true });
    }
  }

  toolTabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTool(tab.dataset.toolTarget));
  });

  activateTool("button");
})();
