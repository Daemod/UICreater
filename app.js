(() => {
  const previewButton = document.getElementById("previewButton");
  const previewLabel = previewButton.querySelector('[data-role="preview-label"]');
  const glossLayer = previewButton.querySelector('[data-role="gloss-layer"]');
  const noiseLayer = previewButton.querySelector('[data-role="noise-layer"]');
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
  const fontLoader = document.getElementById("font-loader");
  const colorNormalInput = document.getElementById("colorNormal");
  const colorHoverInput = document.getElementById("colorHover");
  const colorActiveInput = document.getElementById("colorActive");
  const colorTextInput = document.getElementById("colorText");
  const colorNoiseInput = document.getElementById("colorNoise");
  const noiseAmountInput = document.getElementById("noiseAmount");
  const noiseBlendSelect = document.getElementById("noiseBlend");
  const noiseRefreshButton = document.getElementById("noiseRefresh");

  const STATES = ["normal", "hover", "active"];
  let currentState = "normal";
  let noiseDataUrl = "";
  let currentFontFamily = "Inter";
  let currentFontSize = Number(fontSizeInput.value) || 16;

  const exportHost = document.createElement("div");
  exportHost.style.position = "fixed";
  exportHost.style.left = "-9999px";
  exportHost.style.top = "0";
  exportHost.style.pointerEvents = "none";
  exportHost.style.zIndex = "-1";
  document.body.appendChild(exportHost);

  function getCurrentFontWeight() {
    const weight = window.getComputedStyle(previewButton).fontWeight;
    return /^\d+$/.test(weight) ? weight : "400";
  }

  async function ensureFontReady() {
    if (!document.fonts || !currentFontFamily) return;
    const weight = getCurrentFontWeight();
    try {
      await document.fonts.load(weight + " " + currentFontSize + "px '" + currentFontFamily + "'");
    } catch {
      // ignore, fallback to immediate render
    }

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
    currentState = state;
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
    currentFontSize = size;
    ensureFontReady();
  }

  function applyFontFamily(fontName) {
    const trimmedName = (fontName || "").trim();
    if (!trimmedName) return;
    const familyQuery = trimmedName.replace(/\s+/g, "+");
    fontLoader.href = "https://fonts.googleapis.com/css2?family=" + familyQuery + ":wght@400;500;600;700&display=swap";
    fontLoader.setAttribute("crossorigin", "anonymous");
    previewButton.style.fontFamily = "'" + trimmedName + "', sans-serif";
    currentFontFamily = trimmedName;
    ensureFontReady();
  }

  function handleFontSelectChange() {
    const value = fontSelect.value;
    const isCustom = value === "custom";
    customFontWrapper.classList.toggle("hidden", !isCustom);
    if (isCustom) {
      customFontNameInput.focus();
    } else {
      applyFontFamily(value);
    }
  }

  function updateCustomFont() {
    const name = customFontNameInput.value.trim();
    if (name) {
      applyFontFamily(name);
    }
  }

  function sanitiseFileName(base, state) {
    const trimmed = (base || "").trim().toLowerCase();
    const latinised = trimmed
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_.]/g, "");
    const safeBase = latinised || "button";
    return safeBase + "-" + state + ".png";
  }

  function waitForNextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  async function waitForFonts() {
    if (document.fonts && typeof document.fonts.ready === "object") {
      try {
        await document.fonts.ready;
      } catch {
        // ignore, fallback to immediate render
      }
    }
  }

  function copyComputedFontStyles(target) {
    const computed = window.getComputedStyle(previewButton);
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

    const exportButton = previewButton.cloneNode(true);
    exportButton.removeAttribute("id");
    const exportLabel = exportButton.querySelector('[data-role="preview-label"]');
    if (exportLabel) {
      exportLabel.removeAttribute("data-role");
    }
    exportButton.classList.remove(...STATES.map((s) => "state-" + s));
    exportButton.classList.add("state-" + state);
    copyComputedFontStyles(exportButton);

    const exportGloss = exportButton.querySelector('[data-role="gloss-layer"]');
    if (exportGloss && glossLayer) {
      exportGloss.style.cssText = glossLayer.style.cssText;
    }
    const exportNoise = exportButton.querySelector('[data-role="noise-layer"]');
    if (exportNoise && noiseLayer) {
      exportNoise.style.cssText = noiseLayer.style.cssText;
    }

    exportHost.appendChild(exportButton);

    await waitForFonts();
    await ensureFontReady();
    await waitForNextFrame();

    try {
      const dataUrl = await domtoimage.toPng(exportButton, {
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
      exportHost.removeChild(exportButton);
    }
  }

  buttonTextInput.addEventListener("input", updateButtonText);
  widthInput.addEventListener("input", updateButtonSize);
  heightInput.addEventListener("input", updateButtonSize);
  radiusInput.addEventListener("input", updateButtonSize);

  alignHorizontalSelect.addEventListener("change", updateAlignment);
  alignVerticalSelect.addEventListener("change", updateAlignment);

  fontSelect.addEventListener("change", handleFontSelectChange);
  fontSizeInput.addEventListener("input", updateFontSize);
  customFontNameInput.addEventListener("input", updateCustomFont);

  colorNormalInput.addEventListener("input", () => {
    applyColorEffects();
    updateNoise(true);
  });
  colorHoverInput.addEventListener("input", applyColorEffects);
  colorActiveInput.addEventListener("input", applyColorEffects);
  colorTextInput.addEventListener("input", applyColorEffects);
  colorNoiseInput.addEventListener("input", () => updateNoise(true));
  noiseAmountInput.addEventListener("input", () => updateNoise(true));
  noiseBlendSelect.addEventListener("change", () => updateNoise(false));
  noiseRefreshButton.addEventListener("click", () => updateNoise(true));

  stateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setPreviewState(button.dataset.previewState);
    });
  });

  saveButtons.forEach((button) => {
    button.addEventListener("click", () => downloadState(button.dataset.saveState));
  });

  updateButtonText();
  updateButtonSize();
  updateAlignment();
  updateFontSize();
  applyFontFamily(fontSelect.value);
  applyColorEffects();
  updateNoise(true);
  setPreviewState(currentState);
})();






























