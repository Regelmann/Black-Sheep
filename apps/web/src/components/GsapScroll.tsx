"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * GSAP + ScrollTrigger global.
 * Móvil: fromTo (no se queda invisible), start más bajo, sin pin,
 * refresh tras loader / orientación / resize.
 */
export default function GsapScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      document
        .querySelectorAll<HTMLElement>("[data-gsap], [data-gsap-stagger-children] > *")
        .forEach((el) => {
          el.style.opacity = "";
          el.style.transform = "";
        });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });

    const isTouch =
      window.matchMedia("(hover: none), (pointer: coarse)").matches ||
      window.innerWidth < 768;

    const startIn = isTouch ? "top 95%" : "top 88%";
    const startStagger = isTouch ? "top 92%" : "top 85%";

    const ctx = gsap.context(() => {
      const presets: Record<string, { from: gsap.TweenVars; to: gsap.TweenVars }> = {
        "fade-up": {
          from: { y: isTouch ? 28 : 48, autoAlpha: 0 },
          to: { y: 0, autoAlpha: 1, duration: isTouch ? 0.65 : 0.9, ease: "power3.out" },
        },
        fade: {
          from: { autoAlpha: 0 },
          to: { autoAlpha: 1, duration: isTouch ? 0.55 : 0.8, ease: "power2.out" },
        },
        scale: {
          from: { scale: isTouch ? 0.96 : 0.92, autoAlpha: 0 },
          to: { scale: 1, autoAlpha: 1, duration: isTouch ? 0.65 : 0.85, ease: "power3.out" },
        },
        "slide-left": {
          from: { x: isTouch ? -24 : -56, autoAlpha: 0 },
          to: { x: 0, autoAlpha: 1, duration: isTouch ? 0.65 : 0.9, ease: "power3.out" },
        },
        "slide-right": {
          from: { x: isTouch ? 24 : 56, autoAlpha: 0 },
          to: { x: 0, autoAlpha: 1, duration: isTouch ? 0.65 : 0.9, ease: "power3.out" },
        },
        clip: {
          from: { clipPath: "inset(8% 8% 8% 8%)", autoAlpha: 0.5 },
          to: {
            clipPath: "inset(0% 0% 0% 0%)",
            autoAlpha: 1,
            duration: isTouch ? 0.7 : 1,
            ease: "power3.out",
          },
        },
      };

      Object.keys(presets).forEach((key) => {
        gsap.utils.toArray<HTMLElement>(`[data-gsap="${key}"]`).forEach((el) => {
          const delay = Number(el.dataset.gsapDelay || 0);
          const { from, to } = presets[key];
          gsap.fromTo(el, from, {
            ...to,
            delay,
            immediateRender: false,
            scrollTrigger: {
              trigger: el,
              start: startIn,
              toggleActions: "play none none none",
              once: true,
              invalidateOnRefresh: true,
            },
          });
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-gsap-stagger-children]").forEach((parent) => {
        const amount = Number(parent.dataset.gsapStagger || 0.08);
        const kids = parent.querySelectorAll<HTMLElement>(":scope > *");
        if (!kids.length) return;
        gsap.fromTo(
          kids,
          { y: isTouch ? 20 : 36, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: isTouch ? 0.55 : 0.75,
            ease: "power3.out",
            stagger: isTouch ? Math.min(amount, 0.06) : amount,
            immediateRender: false,
            scrollTrigger: {
              trigger: parent,
              start: startStagger,
              toggleActions: "play none none none",
              once: true,
              invalidateOnRefresh: true,
            },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-gsap-parallax]").forEach((el) => {
        const speed = Number(el.dataset.gsapParallax || 0.2) * (isTouch ? 0.35 : 1);
        if (isTouch && Math.abs(speed) < 0.05) return;
        gsap.to(el, {
          y: () => speed * 120,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: isTouch ? 0.6 : true,
            invalidateOnRefresh: true,
          },
        });
      });

      if (!isTouch) {
        gsap.utils.toArray<HTMLElement>("[data-gsap-pin]").forEach((el) => {
          ScrollTrigger.create({
            trigger: el,
            start: "top top",
            end: () => `+=${Math.min(el.offsetHeight * 0.6, 480)}`,
            pin: true,
            pinSpacing: true,
            invalidateOnRefresh: true,
          });
        });
      }

      gsap.utils.toArray<HTMLElement>("[data-gsap-progress]").forEach((el) => {
        const bar = el.querySelector<HTMLElement>("[data-gsap-progress-bar]");
        if (!bar) return;
        gsap.fromTo(
          bar,
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            transformOrigin: "left center",
            scrollTrigger: {
              trigger: el,
              start: "top 80%",
              end: "bottom 40%",
              scrub: true,
              invalidateOnRefresh: true,
            },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-gsap-fade-out]").forEach((el) => {
        gsap.to(el, {
          autoAlpha: 0,
          y: isTouch ? -20 : -40,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "bottom top",
            scrub: true,
            invalidateOnRefresh: true,
          },
        });
      });
    });

    const refresh = () => {
      try {
        ScrollTrigger.refresh();
      } catch {
        /* ignore */
      }
    };

    const t1 = window.setTimeout(refresh, 450);
    const t2 = window.setTimeout(refresh, 1200);
    const t3 = window.setTimeout(refresh, 2200);
    window.addEventListener("load", refresh);
    window.addEventListener("orientationchange", refresh);
    window.addEventListener("bs:loader-done", refresh);

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(refresh, 200);
    };
    window.addEventListener("resize", onResize);

    const safety = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>("[data-gsap]").forEach((el) => {
        if (window.getComputedStyle(el).opacity === "0") {
          gsap.set(el, { autoAlpha: 1, x: 0, y: 0, scale: 1, clearProps: "clipPath" });
        }
      });
    }, 4000);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(safety);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("load", refresh);
      window.removeEventListener("orientationchange", refresh);
      window.removeEventListener("bs:loader-done", refresh);
      window.removeEventListener("resize", onResize);
      ctx.revert();
    };
  }, []);

  return null;
}
