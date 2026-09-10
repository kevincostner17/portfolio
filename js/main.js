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
  setTimeout(finishPreloader, 2000);

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
     HERO — static portrait
     ═══════════════════════════════════════════════════════════ */
  const heroImage = document.getElementById("heroImage");
  const orbit = { progress: 0, ready: false }; // keep shape for scroll hooks

  const markHeroReady = () => {
    if (orbit.ready) return;
    orbit.ready = true;
    setProgress(1, "READY");
    finishPreloader();
  };

  setProgress(0.15, "LOADING");
  if (heroImage) {
    if (heroImage.complete && heroImage.naturalWidth) markHeroReady();
    else {
      heroImage.addEventListener("load", markHeroReady, { once: true });
      heroImage.addEventListener("error", markHeroReady, { once: true });
    }
  } else {
    markHeroReady();
  }
  setTimeout(markHeroReady, 1500);

  /* ── Scroll choreography ─────────────────────────────────── */
  const heroLetters = document.querySelectorAll(".hero__title .ltr");
  const heroEyebrow = document.getElementById("heroEyebrow");
  const heroSubtitle = document.getElementById("heroSubtitle");
  const heroHint = document.getElementById("heroHint");

  if (!reduceMotion) {
    /* Hero intro: letters rise in as soon as the preloader clears */
    const playHeroIntro = () => {
      gsap.fromTo(
        [heroEyebrow, heroLetters, heroSubtitle],
        { opacity: 0.4, y: 10 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.02, overwrite: true }
      );
    };
    onPreloaderDone = playHeroIntro;
    if (preloaderDone) playHeroIntro(); // preloader may have beaten us here

    /* Hero: ken-burns on portrait + hint/title fade */
    const heroTl = gsap.timeline({
      scrollTrigger: {
        trigger: "#hero",
        start: "top top",
        end: "bottom bottom",
        scrub: true,
      },
    });
    if (heroImage) {
      heroTl.fromTo(heroImage, { scale: 1.04 }, { scale: 1.12, ease: "none", duration: 1 }, 0);
    }
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
