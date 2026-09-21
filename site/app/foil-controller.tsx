"use client";

import { attachFoil } from "@hraness/design-kit/browser";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** The shared footer owns its own foil enhancement. */
export function FoilController() {
  const pathname = usePathname();
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header.hraness-marketing-header");
    return header ? attachFoil(header) : undefined;
  }, [pathname]);
  return null;
}
