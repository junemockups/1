(() => {
  "use strict";

  // Frame geometry, extracted from assets/wall.jpg (see assets/frame-quad.json)
  const WALL_W = 1826, WALL_H = 2738;
  const TL = [655, 815];
  const TR = [1280, 825];
  const BR = [1246, 2058];
  const BL = [650, 2050];
  const LM_W = 603, LM_H = 1219; // lightmap / design working resolution

  const stage = document.getElementById("stage");
  const ctx = stage.getContext("2d");
  const dropzone = document.getElementById("dropzone");
  const dropHint = document.getElementById("dropHint");
  const loadingEl = document.getElementById("loading");
  const fileInput = document.getElementById("fileInput");
  const resetBtn = document.getElementById("resetBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const shadowRange = document.getElementById("shadowRange");
  const shadowVal = document.getElementById("shadowVal");

  stage.width = WALL_W;
  stage.height = WALL_H;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawCover(dctx, img, w, h) {
    const ir = img.width / img.height;
    const tr = w / h;
    let sx, sy, sw, sh;
    if (ir > tr) {
      sh = img.height;
      sw = sh * tr;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / tr;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    dctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function expandTriangle(pts, amount) {
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    return pts.map(([x, y]) => {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * amount, y + (dy / len) * amount];
    });
  }

  // Affine-maps a triangle of `img` onto a destination triangle, clipped.
  function drawTriangle(dctx, img, srcPts, dstPtsRaw) {
    const dstPts = expandTriangle(dstPtsRaw, 1.2);
    dctx.save();
    dctx.beginPath();
    dctx.moveTo(dstPts[0][0], dstPts[0][1]);
    dctx.lineTo(dstPts[1][0], dstPts[1][1]);
    dctx.lineTo(dstPts[2][0], dstPts[2][1]);
    dctx.closePath();
    dctx.clip();

    const [x0, y0] = srcPts[0], [x1, y1] = srcPts[1], [x2, y2] = srcPts[2];
    const [u0, v0] = dstPtsRaw[0], [u1, v1] = dstPtsRaw[1], [u2, v2] = dstPtsRaw[2];

    const denom = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / denom;
    const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / denom;
    const c = ((x1 - x0) * (u2 - u0) - (x2 - x0) * (u1 - u0)) / denom;
    const d = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / denom;
    const e = u0 - a * x0 - c * y0;
    const f = v0 - b * x0 - d * y0;

    dctx.setTransform(a, b, c, d, e, f);
    dctx.imageSmoothingQuality = "high";
    dctx.drawImage(img, 0, 0);
    dctx.restore();
  }

  const state = {
    wallImg: null,
    lightmapImg: null,
    placeholderImg: null,
    designImg: null,
  };

  function buildFinalDesign(intensity) {
    const flat = makeCanvas(LM_W, LM_H);
    drawCover(flat.getContext("2d"), state.designImg, LM_W, LM_H);

    if (intensity <= 0) return flat;

    const shaded = makeCanvas(LM_W, LM_H);
    const sctx = shaded.getContext("2d");
    sctx.drawImage(flat, 0, 0);
    sctx.globalCompositeOperation = "multiply";
    sctx.drawImage(state.lightmapImg, 0, 0, LM_W, LM_H);
    sctx.globalCompositeOperation = "source-over";

    if (intensity >= 1) return shaded;

    const blended = makeCanvas(LM_W, LM_H);
    const bctx = blended.getContext("2d");
    bctx.drawImage(flat, 0, 0);
    bctx.globalAlpha = intensity;
    bctx.drawImage(shaded, 0, 0);
    bctx.globalAlpha = 1;
    return blended;
  }

  function render() {
    if (!state.wallImg || !state.designImg) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, WALL_W, WALL_H);
    ctx.drawImage(state.wallImg, 0, 0, WALL_W, WALL_H);

    const intensity = Number(shadowRange.value) / 100;
    const design = buildFinalDesign(intensity);

    drawTriangle(ctx, design, [[0, 0], [LM_W, 0], [0, LM_H]], [TL, TR, BL]);
    drawTriangle(ctx, design, [[LM_W, 0], [LM_W, LM_H], [0, LM_H]], [TR, BR, BL]);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    downloadBtn.disabled = false;
  }

  function setDesignFromFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    loadingEl.hidden = false;
    const url = URL.createObjectURL(file);
    loadImage(url).then((img) => {
      state.designImg = img;
      dropHint.style.display = "none";
      render();
      loadingEl.hidden = true;
    });
  }

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) setDesignFromFile(e.target.files[0]);
  });

  dropzone.addEventListener("click", (e) => {
    if (e.target === downloadBtn) return;
    fileInput.click();
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setDesignFromFile(file);
  });

  resetBtn.addEventListener("click", () => {
    state.designImg = state.placeholderImg;
    dropHint.style.display = "";
    render();
  });

  shadowRange.addEventListener("input", () => {
    shadowVal.textContent = shadowRange.value + "%";
    render();
  });

  downloadBtn.addEventListener("click", () => {
    stage.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "junemockups-poster-mockup.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, "image/png");
  });

  Promise.all([
    loadImage("assets/wall.jpg"),
    loadImage("assets/lightmap.jpg"),
    loadImage("assets/placeholder.jpg"),
  ]).then(([wall, lightmap, placeholder]) => {
    state.wallImg = wall;
    state.lightmapImg = lightmap;
    state.placeholderImg = placeholder;
    state.designImg = placeholder;
    render();
  });
})();
