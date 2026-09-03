"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Sistema global de animaciones GSAP + ScrollTrigger.
 *
 * Marcá elementos con data-attributes:
 *   data-gsap="fade-up" | "fade" | "scale" | "slide-left" | "slide-right" | "clip"
 *   data-gsap-delay="0.1"   (segundos)
 *   data-gsap-stagger="0.08"  en el contenedor padre con data-gsap-stagger-children
 *   data-gsap-parallax="0.2"  movimiento vertical suave al scroll
 *   data-gsap-pin              pin de sección (capítulos)
 *
 * Respeta prefers-reduced-motion.
 */
export default function GsapScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // —— Entradas por tipo ——
      const presets: Record<
        string,
        gsap.TweenVars
      > = {
        "fade-up": { y: 48, opacity: 0, duration: 0.9, ease: "power3.out" },
        fade: { opacity: 0, duration: 0.8, ease: "power2.out" },
        scale: { scale: 0.92, opacity: 0, duration: 0.85, ease: "power3.out" },
        "slide-left": { x: -56, opacity: 0, duration: 0.9, ease: "power3.out" },
        "slide-right": { x: 56, opacity: 0, duration: 0.9, ease: "power3.out" },
        clip: {
          clipPath: "inset(12% 12% 12% 12%)",
          opacity: 0.4,
          duration: 1,
          ease: "power3.out",
        },
      };

      Object.keys(presets).forEach((key) => {
        gsap.utils.toArray<HTMLElement>(`[data-gsap="${key}"]`).forEach((el) => {
          const delay = Number(el.dataset.gsapDelay || 0);
          const from = { ...presets[key] };
          gsap.from(el, {
            ...from,
            delay,
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              toggleActions: "play none none none",
            },
          });
        });
      });

      // —— Stagger children ——
      gsap.utils
        .toArray<HTMLElement>("[data-gsap-stagger-children]")
        .forEach((parent) => {
          const amount = Number(parent.dataset.gsapStagger || 0.08);
          const kids = parent.querySelectorAll<HTMLElement>(":scope > *");
          if (!kids.length) return;
          gsap.from(kids, {
            y: 36,
            opacity: 0,
            duration: 0.75,
            ease: "power3.out",
            stagger: amount,
            scrollTrigger: {
              trigger: parent,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          });
        });

      // —— Parallax suave ——
      gsap.utils.toArray<HTMLElement>("[data-gsap-parallax]").forEach((el) => {
        const speed = Number(el.dataset.gsapParallax || 0.2);
        gsap.to(el, {
          y: () => speed * 120,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      // —— Pin secciones (capítulos) ——
      gsap.utils.toArray<HTMLElement>("[data-gsap-pin]").forEach((el) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: () => `+=${Math.min(el.offsetHeight * 0.6, 480)}`,
          pin: true,
          pinSpacing: true,
        });
      });

      // —— Línea de progreso de sección (opcional data-gsap-progress) ——
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
            },
          }
        );
      });

      // —— Scrub de opacidad en hero residual ——
      gsap.utils.toArray<HTMLElement>("[data-gsap-fade-out]").forEach((el) => {
        gsap.to(el, {
          opacity: 0,
          y: -40,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      });
    });

    // refresh después de imágenes / fonts
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 400);
    window.addEventListener("load", () => ScrollTrigger.refresh());

    return () => {
      window.clearTimeout(t);
      ctx.revert();
    };
  }, []);

  return null;
}
