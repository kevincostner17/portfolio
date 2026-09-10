/* ═══════════════════════════════════════════════════════════
   KEVIN COSTNER — CINEMATIC SCROLL ENGINE
   Lenis smooth scroll · GSAP ScrollTrigger · Canvas orbit scrub
   ═══════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const CFG = window.PORTFOLIO_CONFIG || {};
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 720px)").matches;

  /* Always start at the top on reload — some browsers restore scroll late */
  window.scrollTo(0, 0);
  window.addEventListener("load", () => window.scrollTo(0, 0));

  /* ── Wire configurable links ─────────────────────────────── */
  const L = CFG.links || {};
  const setHref = (id, href) => {
    const el = document.getElementById(id);
    if (el && href) el.href = href;
  };
  setHref("linkLinkedin", L.linkedin);
  setHref("linkGithub", L.github);
  setHref("linkFacebook", L.facebook);
  setHref("linkEmail", L.email);
  setHref("btnEmail", L.email);
  setHref("btnGithub", L.github);

  /* Experience logos: use assets/logos/<key>.{png,jpg,jpeg} when present, else monogram */
  document.querySelectorAll(".xp__logo[data-logo]").forEach((chip) => {
    const exts = ["png", "jpg", "jpeg"];
    const img = new Image();
    img.alt = "";
    img.onload = () => { chip.classList.add("has-img"); chip.prepend(img); };
    img.onerror = () => {
      const next = exts.shift();
      if (next) img.src = "assets/logos/" + chip.dataset.logo + "." + next;
    };
    img.src = "assets/logos/" + chip.dataset.logo + "." + exts.shift();
  });

  /* ── Preloader helpers ───────────────────────────────────── */
  const preloader = document.getElementById("preloader");
  const preFill = document.getElementById("preloaderFill");
  const prePct = document.getElementById("preloaderPct");
  const preLabel = document.getElementById("preloaderLabel");
  let preloaderDone = false;
  let onPreloaderDone = null;
  const setProgress = (p, label) => {
    if (preloaderDone) return;
    const pct = Math.round(Math.min(1, Math.max(0, p)) * 100);
    preFill.style.width = pct + "%";
    prePct.textContent = pct + "%";
    if (label) preLabel.textContent = label;
  };
  const finishPreloader = () => {
    if (preloaderDone) return;
    preloaderDone = true;
    setTimeout(() => {
      preloader.classList.add("is-done");
      if (typeof onPreloaderDone === "function") onPreloaderDone();
    }, 250);
  };
  // Hard cap: never trap the visitor behind the loader.
  setTimeout(finishPreloader, 9000);

  /* ── Split text into letters (kinetic type) ──────────────── */
  const splitLetters = (el, text) => {
    el.innerHTML = "";
    [...text].forEach((ch) => {
      const s = document.createElement("span");
      s.className = "ltr";
      s.textContent = ch === " " ? "\u00A0" : ch;
      el.appendChild(s);
    });
    return el.querySelectorAll(".ltr");
  };
  document.querySelectorAll(".hero__word").forEach((w) => splitLetters(w, w.dataset.word));
  document.querySelectorAll(".finale__row").forEach((r) => splitLetters(r, r.dataset.line));

  /* ── Lenis + GSAP glue ───────────────────────────────────── */
  gsap.registerPlugin(ScrollTrigger);
  let lenis = null;
  if (!reduceMotion && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  // Anchor links play nice with Lenis
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0 });
      else target.scrollIntoView({ behavior: "smooth" });
    });
  });

  /* ── Video source helper with local fallback ─────────────── */
  const attachVideo = (el, key, { autoplay = false } = {}) => {
    if (!el) return;
    const primary = (CFG.videos || {})[key];
    const fallback = (CFG.localFallbacks || {})[key];
    let usedFallback = false;
    const tryPlay = () => {
      if (!autoplay) return;
      const p = el.play();
      if (p && p.catch) p.catch(() => {/* autoplay blocked until interaction */});
    };
    el.addEventListener("error", () => {
      if (!usedFallback && fallback) {
        usedFallback = true;
        el.src = fallback;
        el.load();
        tryPlay();
      }
    }, true);
    el.addEventListener("loadeddata", tryPlay, { once: true });
    el.src = primary || fallback || "";
    el.load();
  };
  attachVideo(document.getElementById("builderVideo"), "builder", { autoplay: true });
  attachVideo(document.getElementById("closerVideo"), "closer", { autoplay: true });

  /* ═══════════════════════════════════════════════════════════
     HERO ORBIT — canvas frame scrub
     Strategy A: pre-cache N ImageBitmaps → zero-latency scrub.
     Strategy B (fallback): lerped video.currentTime + drawImage.
     ═══════════════════════════════════════════════════════════ */
  const canvas = document.getElementById("heroCanvas");
  const ctx = canvas.getContext("2d");
  const orbit = {
    video: document.createElement("video"),
    frames: [],
    mode: "loading",        // loading → frames | live
    duration: 8,
    progress: 0,            // scroll-driven target 0..1
    playhead: 0,            // smoothed
    seekBusy: false,
    ready: false,
  };
  orbit.video.muted = true;
  orbit.video.playsInline = true;
  orbit.video.preload = "auto";
  orbit.video.crossOrigin = "anonymous";

  const sizeCanvas = () => {
    const raw = Math.min(window.devicePixelRatio || 1, 2);
    // Source is 1080p — a >2048px backing store only burns GPU time.
    const dpr = Math.min(raw, 2048 / Math.max(1, canvas.clientWidth));
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  };
  sizeCanvas();
  window.addEventListener("resize", () => { sizeCanvas(); orbit.dirty = true; });

  // cover-fit draw (like object-fit: cover)
  const drawCover = (source, sw, sh) => {
    const cw = canvas.width, ch = canvas.height;
    if (!sw || !sh || !cw || !ch) return;
    const scale = Math.max(cw / sw, ch / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  };

  const frameCount = () =>
    (CFG.scrub && (isMobile ? CFG.scrub.framesMobile : CFG.scrub.framesDesktop)) || (isMobile ? 64 : 110);

  // Background upgrade: extract frames on a SECOND video element so the live
  // scrub keeps working the whole time, then hot-swap to bitmap mode.
  const buildFrameCache = async () => {
    const N = frameCount();
    const maxW = isMobile ? 960 : 1600;
    const src = orbit.video.currentSrc || orbit.video.src;
    const cv = document.createElement("video");
    cv.muted = true;
    cv.playsInline = true;
    cv.preload = "auto";
    if (orbit.video.crossOrigin) cv.crossOrigin = orbit.video.crossOrigin;
    const frames = [];
    try {
      await new Promise((resolve, reject) => {
        cv.addEventListener("loadedmetadata", resolve, { once: true });
        cv.addEventListener("error", reject, { once: true });
        setTimeout(reject, 8000);
        cv.src = src;
        cv.load();
      });
      const dur = cv.duration || orbit.duration;
      const seekCV = (t) =>
        new Promise((resolve) => {
          const done = () => { cv.removeEventListener("seeked", done); resolve(); };
          cv.addEventListener("seeked", done);
          cv.currentTime = Math.min(Math.max(t, 0), Math.max(dur - 0.033, 0));
          setTimeout(done, 400);
        });
      for (let i = 0; i < N; i++) {
        await seekCV((i / (N - 1)) * dur);
        const vw = cv.videoWidth, vh = cv.videoHeight;
        if (!vw) throw new Error("no video dimensions");
        const scale = Math.min(1, maxW / vw);
        frames.push(await createImageBitmap(cv, {
          resizeWidth: Math.round(vw * scale),
          resizeHeight: Math.round(vh * scale),
          resizeQuality: "medium",
        }));
      }
      orbit.frames = frames;
      orbit.mode = "frames";
      orbit.dirty = true;
      console.info("[orbit] frame cache ready — bitmap scrub engaged");
    } catch (err) {
      console.warn("[orbit] frame cache unavailable, staying on live-seek scrub:", err);
      frames.forEach((b) => b.close && b.close());
    }
  };

  const initOrbit = () => {
    const primary = (CFG.videos || {}).hero;
    const fallback = (CFG.localFallbacks || {}).hero;
    // Stage 1: CDN with CORS (enables the frame cache).
    // Stage 2: same CDN URL without CORS (playable; live-seek scrub only).
    // Stage 3: local placeholder.
    let stage = 1;
    orbit.forceLive = false;
    orbit.video.addEventListener("error", () => {
      if (stage === 1 && primary) {
        stage = 2;
        orbit.video.removeAttribute("crossorigin");
        orbit.video.crossOrigin = null;
        orbit.forceLive = true; // frame cache would taint — scrub live instead
        orbit.video.src = primary;
        orbit.video.load();
      } else if (stage <= 2 && fallback) {
        stage = 3;
        orbit.video.crossOrigin = null;
        orbit.forceLive = false; // local file is same-origin: cache allowed
        orbit.video.src = fallback;
        orbit.video.load();
      } else {
        orbit.mode = "live";
        orbit.ready = true;
        finishPreloader();
      }
    });
    orbit.video.addEventListener("loadedmetadata", () => {
      orbit.duration = orbit.video.duration || 8;
      setProgress(0.55, "CALIBRATING ORBIT");
    });
    // Scrubbable the moment first frames can render — no dead window after
    // refresh. The bitmap cache then upgrades smoothness in the background.
    orbit.video.addEventListener("canplay", () => {
      if (orbit.ready) return;
      orbit.mode = "live";
      orbit.ready = true;
      orbit.dirty = true;
      setProgress(1);
      finishPreloader();
      if (!orbit.forceLive) buildFrameCache();
    });
    setProgress(0.05, "FETCHING FILM");
    if (!primary && fallback) { orbit.video.crossOrigin = null; }
    orbit.video.src = primary || fallback || "";
    orbit.video.load();
  };
  initOrbit();

  /* render loop — draws only when the playhead moved */
  let lastDrawnFrame = -1;
  const render = () => {
    if (orbit.ready) {
      const lerpAmt = (CFG.scrub && CFG.scrub.lerp) || 0.12;
      orbit.playhead += (orbit.progress - orbit.playhead) * lerpAmt;
      if (Math.abs(orbit.progress - orbit.playhead) < 0.0004) orbit.playhead = orbit.progress;

      if (orbit.mode === "frames" && orbit.frames.length) {
        const idx = Math.min(
          orbit.frames.length - 1,
          Math.round(orbit.playhead * (orbit.frames.length - 1))
        );
        if (idx !== lastDrawnFrame || orbit.dirty) {
          const f = orbit.frames[idx];
          drawCover(f, f.width, f.height);
          lastDrawnFrame = idx;
          orbit.dirty = false;
        }
      } else if (orbit.mode === "live") {
        const t = orbit.playhead * orbit.duration;
        if (!orbit.seekBusy && Math.abs(orbit.video.currentTime - t) > 0.02) {
          orbit.seekBusy = true;
          const unlock = () => { orbit.seekBusy = false; };
          orbit.video.addEventListener("seeked", unlock, { once: true });
          try {
            if (orbit.video.fastSeek) orbit.video.fastSeek(t);
            else orbit.video.currentTime = t;
          } catch (_) { orbit.seekBusy = false; }
          setTimeout(unlock, 120);
        }
        const ct = orbit.video.currentTime;
        if (orbit.video.videoWidth && (orbit.dirty || Math.abs(ct - (orbit.lastLiveTime ?? -1)) > 0.001)) {
          drawCover(orbit.video, orbit.video.videoWidth, orbit.video.videoHeight);
          orbit.lastLiveTime = ct;
          orbit.dirty = false;
        }
      }
    }
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);

  /* ── Scroll choreography ─────────────────────────────────── */
  const heroLetters = document.querySelectorAll(".hero__title .ltr");
  const heroEyebrow = document.getElementById("heroEyebrow");
  const heroSubtitle = document.getElementById("heroSubtitle");
  const heroHint = document.getElementById("heroHint");

  if (!reduceMotion) {
    /* Hero intro: letters rise in as soon as the preloader clears */
    const playHeroIntro = () => {
      const tl = gsap.timeline({ delay: 0.15 });
      tl.to(heroEyebrow, { opacity: 1, duration: 0.6, ease: "power2.out" })
        .to(heroLetters, {
          opacity: 1, y: 0, rotate: 0,
          duration: 0.9, ease: "power4.out", stagger: 0.045,
        }, 0.1)
        .to(heroSubtitle, { opacity: 1, duration: 0.7, ease: "power2.out" }, 0.8);
    };
    onPreloaderDone = playHeroIntro;
    if (preloaderDone) playHeroIntro(); // preloader may have beaten us here

    /* Hero: scroll drives the orbit scrub, hint fade and title scale-out */
    const heroTl = gsap.timeline({
      scrollTrigger: {
        trigger: "#hero",
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (st) => { orbit.progress = st.progress; },
      },
    });
    heroTl
      .to(heroHint, { opacity: 0, duration: 0.08, immediateRender: false }, 0.06)
      .to("#heroTitle", { scale: 0.94, yPercent: -4, ease: "none", duration: 0.4 }, 0.55)
      .to([heroEyebrow, heroSubtitle], { opacity: 0, duration: 0.15, immediateRender: false }, 0.82);

    /* Stats: count up when the strip enters */
    document.querySelectorAll(".stat").forEach((stat) => {
      const numEl = stat.querySelector(".stat__num");
      const target = parseInt(stat.dataset.count, 10);
      const suffix = stat.dataset.suffix || "";
      const obj = { v: 0 };
      ScrollTrigger.create({
        trigger: stat,
        start: "top 85%",
        once: true,
        onEnter: () =>
          gsap.to(obj, {
            v: target,
            duration: 1.8,
            ease: "power2.out",
            onUpdate: () => {
              numEl.innerHTML =
                Math.round(obj.v).toLocaleString("en-US") +
                '<span class="suffix">' + suffix + "</span>";
            },
          }),
      });
      gsap.from(stat, {
        opacity: 0, y: 30, duration: 0.8, ease: "power2.out",
        scrollTrigger: { trigger: stat, start: "top 90%", once: true },
      });
    });

    /* Pillars: three sequential reveals over the builder clip */
    const pillars = gsap.utils.toArray(".pillar");
    const pillarNames = ["AGENTIC RAG", "MACHINE LEARNING", "FULL-STACK SHIPPING"];
    const pillarIndexEl = document.getElementById("pillarCurrent");
    const pillarsTl = gsap.timeline({
      scrollTrigger: {
        trigger: "#pillars",
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (st) => {
          const i = Math.min(2, Math.floor(st.progress * 3));
          pillarIndexEl.textContent = pillarNames[i];
        },
      },
    });
    pillars.forEach((p, i) => {
      const at = i / 3;
      pillarsTl.fromTo(
        p,
        { opacity: 0, yPercent: -42 },
        { opacity: 1, yPercent: -50, duration: 0.14, ease: "power2.out" },
        at + 0.04
      );
      pillarsTl.to(
        p,
        { opacity: 0, yPercent: -58, duration: 0.1, ease: "power2.in" },
        at + 0.27
      );
    });
    /* Fade the section eyebrow away once the first pillar has had its moment */
    pillarsTl.to(".pillars .section-eyebrow", { opacity: 0, duration: 0.08, immediateRender: false }, 0.26);

    /* Generic reveals for content sections (manifesto, toolbox, xp, minis, awards) */
    gsap.utils.toArray("[data-reveal]").forEach((el) => {
      gsap.from(el, {
        opacity: 0, y: 44, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

    /* Work: heading + cards cascade in */
    gsap.from(".work__heading", {
      opacity: 0, y: 60, duration: 1, ease: "power3.out",
      scrollTrigger: { trigger: ".work__heading", start: "top 80%", once: true },
    });
    gsap.from(".card", {
      opacity: 0, y: 70, duration: 0.9, ease: "power3.out", stagger: 0.12,
      scrollTrigger: { trigger: ".cards", start: "top 82%", once: true },
    });

    /* Finale: kinetic rows rise line by line */
    document.querySelectorAll(".finale__row").forEach((row, i) => {
      gsap.from(row.querySelectorAll(".ltr"), {
        yPercent: 110,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.02,
        scrollTrigger: { trigger: "#contact", start: "top 70%", once: true },
        delay: i * 0.12,
      });
    });
    gsap.from(".finale__cta", {
      opacity: 0, y: 30, duration: 0.8, ease: "power2.out",
      scrollTrigger: { trigger: "#contact", start: "top 55%", once: true },
    });

    /* Flash cards: hover flips on desktop; tap toggles on touch devices */
    const touchOnly = window.matchMedia("(hover: none)");
    document.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", () => {
        if (touchOnly.matches) card.classList.toggle("is-flipped");
      });
    });
  } else {
    /* Reduced motion: static poster frame + instant numbers */
    orbit.progress = 0;
    document.querySelectorAll(".stat").forEach((stat) => {
      const numEl = stat.querySelector(".stat__num");
      numEl.innerHTML =
        parseInt(stat.dataset.count, 10).toLocaleString("en-US") +
        '<span class="suffix">' + (stat.dataset.suffix || "") + "</span>";
    });
    finishPreloader();
  }
})();
